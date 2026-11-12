"""
Downloads the AI model, its centroid file and the demo leaf photos into the project so that
AgriSathi works fully offline (e.g. during a presentation without Wi-Fi).

Usage (from the project folder):
    python tools/setup_offline.py

Only the Python standard library is used. Total download is about 40 MB.
"""
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HUB_MODEL = "https://huggingface.co/rodynaemad/plant-disease-dinov2-small/resolve/main/onnx/model_with_features_quantized.onnx"
HUB_SPACE = "https://huggingface.co/spaces/rodynaemad/plant-disease-scanner/resolve/main/"
SAMPLES = ["tomato_late_blight.jpg", "potato_early_blight.jpg", "corn_common_rust.jpg",
           "grape_black_rot.jpg", "apple_apple_scab.jpg", "pepper_bell_healthy.jpg"]

FILES = [(HUB_MODEL, "model/plant_disease_dinov2_int8.onnx"), (HUB_SPACE + "centroids.f32", "model/centroids.f32")]
FILES += [(HUB_SPACE + "examples/" + s, "assets/samples/" + s) for s in SAMPLES]
# AI runtime (ONNX Runtime Web, WebAssembly build) and PDF/QR libraries, so nothing needs the internet
ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/"
FILES += [(ORT + f, "assets/vendor/ort/" + f) for f in ["ort.wasm.min.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]]
FILES += [("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "assets/vendor/jspdf.umd.min.js"),
          ("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js", "assets/vendor/qrcode.min.js")]


def fetch(url, dest):
    path = os.path.join(ROOT, dest)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print(f"  [ok] {dest} (already present)")
        return
    print(f"  [download] {dest}")
    with urllib.request.urlopen(url, timeout=60) as r, open(path + ".part", "wb") as f:
        total = int(r.headers.get("content-length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if total:
                sys.stdout.write(f"\r     {done / 1e6:5.1f} / {total / 1e6:.1f} MB")
                sys.stdout.flush()
    os.replace(path + ".part", path)
    if total:
        print()


if __name__ == "__main__":
    print("AgriSathi offline setup")
    for url, dest in FILES:
        try:
            fetch(url, dest)
        except Exception as e:  # keep going – the app falls back to online copies
            print(f"  [failed] {dest}: {e}")
    print("Done. Start the app with start.bat (Windows) or ./start.sh")
