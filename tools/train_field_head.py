"""
Train AgriSathi's field-adapted model on a folder of REAL field photos.

The DINOv2-small backbone stays frozen (it already produces excellent leaf features).
We train a new multinomial logistic-regression head on the 768-d features of field photos,
then fuse it with the lab model:   log p = a * log p_lab + (1 - a) * log p_field
The fusion weight a is chosen by stratified k-fold cross-validation from {1, .75, .5, .25}, and is
moved back to 1 for photos that look like lab photos (embedding similarity above the
out-of-distribution threshold, "gate"), exactly as the app does. The honest cross-validated
before/after accuracy is written to model/field_report.json.
This is the script used to build the shipped head from 540 PlantDoc field photos
(20 per condition, train split); the 236 PlantDoc test photos were kept for the final test.

Dataset layout (one sub-folder per condition, names = app condition ids):
    field_dataset/
        tomato_healthy/       img1.jpg img2.jpg ...
        tomato_early_blight/  ...
        tomato_late_blight/   ...
        potato_late_blight/   ...
Valid ids: the keys in assets/js/data/diseases.js that have an on-device label
(e.g. tomato_early_blight, tomato_late_blight, tomato_healthy, potato_early_blight ...).

Usage:
    pip install onnxruntime numpy pillow
    python tools/train_field_head.py field_dataset
Then restart the app: Crop Doctor uses model/field_head.json automatically.
Public field datasets you can use as well: PlantDoc (Singh et al., 2020) – copy its tomato /
potato / corn / apple / grape / pepper folders into the layout above.
"""
import json
import os
import re
import sys
import time

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, "model", "plant_disease_dinov2_int8.onnx")
CENTROIDS = os.path.join(ROOT, "model", "centroids.f32")
GATE = [0.6994, 0.7494]
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def model_labels_and_keys():
    """Read the 38 model labels and the condition-id -> label map from the app's JS data."""
    src = open(os.path.join(ROOT, "assets", "js", "data", "diseases.js"), encoding="utf-8").read()
    labels = re.findall(r"'([A-Za-z_(),]+___[A-Za-z_ ()-]+)'", src[src.index("export const MODEL_LABELS"):])
    key_to_label = {}
    for m in re.finditer(r"\n  (\w+): D\(\{\s*label: (null|'[^']*')", src):
        if m.group(2) != "null":
            key_to_label[m.group(1)] = m.group(2).strip("'")
    assert len(labels) == 38, "could not read model labels"
    return labels, key_to_label


def crop_prefix(label):
    return label.split("___")[0]


def _crop(im, size=224):
    W, H = im.size
    l, t = (W - size) // 2, (H - size) // 2
    return im.crop((l, t, l + size, t + size))


def _norm(im):
    return ((np.asarray(im, np.float32) / 255 - MEAN) / STD).transpose(2, 0, 1)


def preprocess(path):
    """Same 4 views as the app: original, mirror, 85 % centre zoom, zoom + mirror."""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    s = 256 / min(w, h)
    c = _crop(im.resize((round(w * s), round(h * s)), Image.BICUBIC))
    z = c.crop((round(224 * 0.075), round(224 * 0.075), round(224 * 0.925), round(224 * 0.925))).resize((224, 224), Image.BICUBIC)
    a, b = _norm(c), _norm(z)
    return np.stack([a, a[:, :, ::-1], b, b[:, :, ::-1]]).astype(np.float32)


def max_cosine(feats, C):
    f = feats / (np.linalg.norm(feats, axis=1, keepdims=True) + 1e-9)
    return float((f @ C.T).max(1).mean())


def alpha_for(alpha, sim):
    return alpha + (1 - alpha) * min(1.0, max(0.0, (sim - GATE[0]) / (GATE[1] - GATE[0])))


def softmax(z):
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def train_head(X, y, epochs=300, lr=0.05, l2=1e-2):
    classes = sorted(set(y))
    idx = {c: i for i, c in enumerate(classes)}
    mean, std = X.mean(0), X.std(0)
    std[std == 0] = 1e-6
    Z = (X - mean) / std
    N, D = Z.shape
    K = len(classes)
    Y = np.zeros((N, K))
    Y[np.arange(N), [idx[c] for c in y]] = 1
    W, b = np.zeros((K, D)), np.zeros(K)
    mW, vW, mb, vb = np.zeros_like(W), np.zeros_like(W), np.zeros_like(b), np.zeros_like(b)
    for ep in range(1, epochs + 1):
        P = softmax(Z @ W.T + b)
        G = (P - Y) / N
        gW, gb = G.T @ Z + l2 * W, G.sum(0)
        mW = 0.9 * mW + 0.1 * gW; vW = 0.999 * vW + 0.001 * gW ** 2
        mb = 0.9 * mb + 0.1 * gb; vb = 0.999 * vb + 0.001 * gb ** 2
        W -= lr * (mW / (1 - 0.9 ** ep)) / (np.sqrt(vW / (1 - 0.999 ** ep)) + 1e-8)
        b -= lr * (mb / (1 - 0.9 ** ep)) / (np.sqrt(vb / (1 - 0.999 ** ep)) + 1e-8)
    return {"classes": classes, "mean": mean.tolist(), "std": std.tolist(), "W": W.ravel().tolist(), "b": b.tolist(), "alpha": 0.5}


def fuse(p0, head, x, alpha):
    if alpha >= 1:
        return p0
    K, D = len(head["classes"]), len(head["mean"])
    W = np.array(head["W"]).reshape(K, D)
    q = softmax(W @ ((x - np.array(head["mean"])) / np.array(head["std"])) + np.array(head["b"]))
    logp = np.log(np.maximum(p0, 1e-9))
    for k, c in enumerate(head["classes"]):
        logp[c] = alpha * logp[c] + (1 - alpha) * np.log(max(q[k], 1e-9))
    return softmax(logp)


def masked_argmax(p, allowed):
    m = np.full_like(p, -1.0)
    m[allowed] = p[allowed]
    return int(m.argmax())


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    data_dir = sys.argv[1]
    import onnxruntime as ort
    labels, key_to_label = model_labels_and_keys()
    sess = ort.InferenceSession(MODEL)
    C = np.fromfile(CENTROIDS, np.float32).reshape(38, 768)
    X, y, P0, allowed, files, sims = [], [], [], [], [], []
    t0 = time.time()
    for folder in sorted(os.listdir(data_dir)):
        path = os.path.join(data_dir, folder)
        if not os.path.isdir(path):
            continue
        label = key_to_label.get(folder) or (folder if folder in labels else None)
        if not label:
            print(f"  skip folder '{folder}' (not an on-device condition id)")
            continue
        c = labels.index(label)
        crop_idx = [i for i, l in enumerate(labels) if crop_prefix(l) == crop_prefix(label)]
        for f in sorted(os.listdir(path)):
            if not f.lower().endswith(EXT):
                continue
            views = preprocess(os.path.join(path, f))
            outs = [sess.run(None, {"pixel_values": v[None]}) for v in views]
            logits = np.concatenate([o[0] for o in outs]); feats = np.concatenate([o[1] for o in outs])
            P0.append(softmax(logits).mean(0)); X.append(feats.mean(0)); y.append(c); allowed.append(crop_idx); files.append(f"{folder}/{f}")
            sims.append(max_cosine(feats, C))
    if len(set(y)) < 2:
        sys.exit("Need at least 2 conditions with photos.")
    X, P0 = np.array(X, np.float64), np.array(P0)
    print(f"Extracted features for {len(y)} photos in {time.time() - t0:.1f}s")

    alphas = [1, 0.75, 0.5, 0.25]
    counts = {c: y.count(c) for c in set(y)}
    k = max(2, min(5, min(counts.values())))
    fold = np.zeros(len(y), int)
    seen = {}
    for i, c in enumerate(y):
        fold[i] = seen.get(c, 0) % k
        seen[c] = seen.get(c, 0) + 1
    hits = {a: 0 for a in alphas}
    base = 0
    heads = {}
    for f in range(k):
        tr, te = np.where(fold != f)[0], np.where(fold == f)[0]
        if len(te) == 0 or len(set(np.array(y)[tr])) < 2:
            continue
        heads[f] = head = train_head(X[tr], [y[i] for i in tr])
        for i in te:
            base += masked_argmax(P0[i], allowed[i]) == y[i]
            for a in alphas:
                hits[a] += masked_argmax(fuse(P0[i], head, X[i], a), allowed[i]) == y[i]
    n = len(y)
    best = sorted(alphas, key=lambda a: (-hits[a], -a))[0]
    # held-out accuracy of the gated model exactly as the app will use it
    gated = top3_lab = top3_ad = 0
    for f, head in heads.items():
        for i in np.where(fold == f)[0]:
            p = fuse(P0[i], head, X[i], alpha_for(best, sims[i]))
            gated += masked_argmax(p, allowed[i]) == y[i]
            top3_lab += y[i] in sorted(allowed[i], key=lambda j: -P0[i][j])[:3]
            top3_ad += y[i] in sorted(allowed[i], key=lambda j: -p[j])[:3]
    final = train_head(X, y)
    final.update(alpha=best, gate=GATE, trainedOn=n, date=time.strftime("%Y-%m-%d"), data=os.path.basename(os.path.abspath(data_dir)))
    accepted = sum(1 for s_ in sims if not (s_ < 0.25))
    report = {"date": time.strftime("%Y-%m-%d"), "dataset": f"{os.path.basename(os.path.abspath(data_dir))} ({n} photos, {k}-fold cross-validation)",
              "train": {"n": n, "alpha": best, "gate": GATE, "folds": k, "cvAccByAlpha": {str(a): hits[a] / n for a in alphas}},
              "test": {"n": n, "lab": {"acc": base / n, "top3": top3_lab / n}, "adapted": {"acc": gated / n, "top3": top3_ad / n}},
              "leafGate": {"n": n, "accepted": accepted, "acceptedRate": accepted / n},
              "classes": {labels[c]: counts[c] for c in counts}}
    os.makedirs(os.path.join(ROOT, "model"), exist_ok=True)
    json.dump(final, open(os.path.join(ROOT, "model", "field_head.json"), "w"))
    json.dump(report, open(os.path.join(ROOT, "model", "field_report.json"), "w"), indent=2)
    print(f"{k}-fold cross-validation on {n} photos")
    print(f"  lab model only : {base / n * 100:.1f}%")
    for a in alphas:
        print(f"  alpha = {a:<4}  : {hits[a] / n * 100:.1f}%")
    print(f"Best alpha {best}  ->  field-adapted accuracy {gated / n * 100:.1f}% (gated, as used in the app)")
    print("Saved model/field_head.json and model/field_report.json")


if __name__ == "__main__":
    main()
