# AgriSathi — AI Crop Doctor & Precision-Agronomy Assistant

AgriSathi turns one photo of a sick leaf into a complete, field-ready decision:

**what the problem is → how bad it is → whether the weather will make it worse → exactly what to spray, how much per tank, when, what it costs and what it saves.**

It is a mobile-first web app (installable as a PWA). It runs in any modern browser, works in Hindi, Marathi and English, and the core AI runs on the farmer's own phone, so photos never leave the device.

---

## 1. Features

| Module | What it does | How |
|---|---|---|
| **Crop Doctor** | Diagnoses **69 crop conditions across 20 crops on the phone** — 38 from the lab model (tomato, potato, maize, grape, apple, capsicum …) plus 31 from our **Indian field-crop model** (chilli, rice, cotton, groundnut, onion, banana) | DINOv2-small vision transformer, ONNX Runtime Web (WebAssembly) in a Web Worker + two heads we trained on real field photos |
| **Photo quality gate** | Rejects blurry, dark, over-exposed or leaf-less photos *before* they cause wrong answers | Laplacian variance (sharpness), luminance, HSV plant-pixel ratio |
| **Leaf detector** | Rejects only photos with no plant (laptop, car, shoe, sofa …) and never predicts a disease for them; real field photos are accepted with an adjusted confidence | Embedding similarity to leaf-class centroids + plant-colour pixel share. Tested on 32 real non-plant photos (31 rejected) and 776 real field photos (97.6 % accepted) |
| **Crop-aware decoding** | The model cannot answer "apple scab" for a tomato field | Probabilities renormalised over the selected crop's classes; crop agreement reported |
| **Test-time augmentation + confidence range** | More stable predictions and an honest confidence range | 4 views (original, mirror, zoom, zoom+mirror) averaged; spread across views shown as the range |
| **Expert AI cross-check** *(optional)* | Second, independent opinion; the only route for wheat and for problems outside the 69 classes | Google Gemini vision-language model with a strict JSON schema; consensus engine shows agreement / disagreement openly |
| **Severity meter** | % of leaf area that is diseased | HSV pixel classification → morphological closing → hole filling → removal of non-leaf regions (soil, wood) → lesion / leaf ratio |
| **Explainability** | Shows *where* the AI looked | Occlusion-sensitivity map (Zeiler & Fergus 2014) computed on the real model + lesion overlay |
| **Weather disease forecast** | Live 7-day disease pressure for the farmer's GPS location | Open-Meteo hourly forecast + Hutton criteria (late blight), TOMCAST DSV (early blight, Septoria, target spot), Gubler–Thomas index (powdery mildew), leaf-wetness rules (rust, blast, bacterial), heat/dryness rules (mites, whitefly) |
| **Treatment ranker** | One clearly marked **BEST CHOICE** product plus ranked alternatives and a spray-rotation plan (never the same chemical group twice in a row) | Expert first-line order + systemic/contact logic for the infection stage + cost per acre + pre-harvest interval |
| **Nutrition advisor** | Top-3 market fertilizer / nutrition products for the crop and disease, with pack illustration, dose per tank, quantity and cost for the field, market examples and a match score with an uncertainty range | Agronomic rules (K & Ca for disease tolerance, Si for rice blast, Zn for cereals, no extra N on a diseased canopy); score recomputed under the second most likely diagnosis to give the range |
| **Spread forecast** | How the damage may grow in 7 days with and without treatment | Van der Plank logistic disease-progress model driven by the daily weather favourability at the field |
| **Sathi chat assistant** | Ask follow-up questions by text or voice in English, Hindi or Marathi ("can I mix them?", "best fertilizer?", "when to spray?") | Offline intent engine answering from the diagnosis data; Gemini with the diagnosis injected as context when a key is set; Web Speech recognition |
| **Indian field-crop model (trained by us)** | Chilli (leaf curl, mites & thrips, cercospora, powdery mildew, nutrient deficiency), rice (8 conditions), cotton (5), groundnut (5), onion (4), banana (3). Capsicum and chilli share one model, so a chilli photo is diagnosed correctly even if "Capsicum" is selected | Multinomial logistic regression on DINOv2 features of 1,532 Indian field photos; regularisation chosen by group cross-validation; temperature-calibrated confidence; tested on 788 other photos: **81.2 % top-1, 96.1 % top-3** |
| **Field-adapted lab model (trained by us)** | For the 14 lab-model crops: a head trained on all 2,336 PlantDoc training photos raises accuracy on 236 other field photos from 55.1 % to 68.2 % (top-3 87.7 % → 94.1 %) while clean photos keep the lab model's answer | Logistic regression on DINOv2 features; field-like photos use the field head, lab-like photos the lab model (similarity gate); settings chosen by 5-fold CV |
| **Honest confidence** | The confidence shown matches how often the app is right (calibrated on held-out field photos), with a range from 4 views of the photo | Temperature scaling fitted by cross-validation; expected calibration error 0.02 (field-crop model) |
| **Spray-window planner** | Best hours to spray in the next 72 h | No rain for 4 h, wind ≤ 15 km/h, 8–32 °C, leaves dry, daylight |
| **Spray calculator** | Grams/ml per 16 L knapsack tank, number of tanks, cheapest pack combination | Unbounded-knapsack optimisation over retail pack sizes; savings vs. bulk pack |
| **Fertilizer planner** | Converts N-P₂O₅-K₂O needs into bags of Urea, DAP, MOP, SSP, NPK 10-26-26 with split schedule | ICAR/SAU recommended doses, Soil Health Card adjustment (low +25 %, high −25 %) |
| **Profit & ROI** | Money at risk, treatment cost, net money protected, return per rupee | Severity- and weather-weighted yield-loss model |
| **Pre-harvest interval guard** | Safe-to-harvest date after every spray | PHI per product |
| **Regulatory guardrail** | Never recommends banned products (e.g. Streptocycline, banned on crops in India from 2024) | Curated product catalogue; instruction to the expert model |
| **Voice advisory** | Reads the diagnosis and dose aloud in Hindi / Marathi / English | Web Speech API (offline on most phones) |
| **Digital prescription** | One-page PDF with QR code; QR opens a verification page with a SHA-256 fingerprint | jsPDF + QR code |
| **WhatsApp share** | Sends the diagnosis, dose and prescription link | wa.me deep link |
| **My Farm** | Diagnosis history, scan map, most frequent problems, CSV export | localStorage + Leaflet/OpenStreetMap |
| **Disease library** | 39 diseases & pests with symptoms, causes, organic and chemical control | Searchable, filter by crop |
| **Offline / PWA** | Installable app; works without internet after first use | Service worker + Cache Storage for app shell and model; `_headers` enables cross-origin isolation so the model uses several CPU threads |
| **Dark mode** | Light / dark theme toggle, remembers the choice | CSS design tokens |

---

## 2. Run it on your computer

Requirements: Python 3 (Anaconda is fine) and Chrome / Edge.

**Windows:** double-click `start.bat`
**macOS / Linux:** `./start.sh`

The browser opens at **http://localhost:8080**. The first diagnosis downloads the AI model (≈ 24 MB) once; after that it is cached.

> Opening `index.html` directly (file://) will not work — browsers block modules and workers on file URLs. Always use the start script.

### Fully offline (recommended before a demo)
```
python tools/setup_offline.py
```
This saves the model, its centroid file and six demo leaf photos inside the project.

### Retrain the field models (optional, for developers)
```
pip install onnxruntime numpy pillow
python tools/train_field_head.py path/to/field_dataset   # sub-folders named tomato_late_blight, tomato_healthy …
```
It writes `model/field_head.json`, which the app uses automatically.

### Enable the Expert AI (optional, free)
1. Get a free key at https://aistudio.google.com/apikey
2. Open AgriSathi → ⚙ Settings → paste the key → **Test** → **Save**.

The key stays in that browser only.

---

## 3. Share it with anyone (free hosting)

The app is plain static files — no build step.

* **Netlify (1 minute):** Projects → Add new project → Deploy manually (or https://app.netlify.com/drop) and drag the whole `AgriSathi` folder onto the page. You get a public `https://….netlify.app` link that works on any phone. To update later: open the project → **Deploys** → drag the folder again (same link). The `_headers` file is picked up automatically.
* **Vercel (keeps an Expert-AI key secret for all visitors):** import the folder as a project, add an environment variable `GEMINI_API_KEY`. The function in `api/expert.js` then serves Expert AI to every visitor without exposing the key.
* **GitHub Pages:** push the folder to a repository → Settings → Pages → deploy from branch.

HTTPS hosting also enables "Install app" (Add to Home Screen) on Android.

---

## 4. Project structure

```
AgriSathi/
├── index.html                 App shell (header, icon sprite, tab bar)
├── manifest.webmanifest, sw.js  PWA + offline caching
├── assets/
│   ├── css/styles.css         Design system
│   ├── img/                   Logo and app icons
│   └── js/
│       ├── app.js             Hash router, settings, language switch
│       ├── core/
│       │   ├── classifier.js  Pre-processing, TTA, crop-aware decoding, OOD, occlusion map
│       │   ├── model-worker.js  ONNX Runtime Web inference in a Web Worker (+ model caching)
│       │   ├── imaging.js     Quality gate, HSV lesion segmentation, severity
│       │   ├── expert.js      Expert AI (Gemini) client with JSON schema
│       │   ├── decision.js    Consensus engine combining both AIs
│       │   ├── fieldhead.js   Field-adapted head: training, fusion, cross-validation
│       │   ├── gemini.js      Fast Gemini client (model memory, low thinking, streaming, timeout)
│       │   ├── advisor.js     Treatment ranking, rotation, nutrition top-3, spread forecast
│       │   ├── assistant.js   Sathi chat: offline intent engine + grounded Gemini chat
│       │   ├── climate.js     Open-Meteo client, disease-risk models, spray windows
│       │   ├── agronomy.js    Spray, pack optimiser, fertilizer, PHI, economics
│       │   ├── report.js      PDF prescription + QR verification
│       │   ├── voice.js       Multilingual speech
│       │   ├── i18n.js        English / Hindi / Marathi strings
│       │   └── store.js, util.js
│       ├── components/chat.js Floating chat assistant (text + voice)
│       ├── data/              crops.js, diseases.js, chemicals.js, fertilizers.js, samples.js
│       └── pages/             home, doctor, weather, tools, library, farm, verify
├── api/expert.js, api/chat.js  Optional serverless proxies (Vercel) that keep the Gemini key secret
├── tools/setup_offline.py     Downloads model + samples for offline use
├── tools/train_field_head.py  Trains the field-adapted head on a folder of field photos
├── tests/                     38 unit tests (node --test)
├── model/                     on-device model, centroids, field_head.json + crops_head.json (our trained heads)
├── _headers, vercel.json      deployment headers (offline cache, multi-threaded AI)
└── docs/                      presentation guide + field_test/ (per-photo results)
```

## 5. Tests
```
npm test        # or: node --test tests/*.test.js
```
Covers spray maths, pack optimisation, fertilizer nutrient balance, soil-test adjustment, ROI, PHI dates, TOMCAST and Hutton rules, spray windows, lesion segmentation (including ignoring soil next to the leaf), blur detection, the consensus engine, treatment ranking and rotation, nutrition advice, the spread forecast, the chat assistant's intent detection in three languages, the leaf detector on real measurements, the field-head training, fusion gate and the shipped head file.

## 6. Accuracy — tested on real field photos (not shown on the website)
| Test | Photos | Top-1 | Top-3 |
|---|---|---|---|
| Lab model on lab photos (PlantVillage, published) | 10,862 | 98.7 % | — |
| **Indian field-crop model** — chilli, rice, cotton, groundnut, onion, banana, capsicum (Indian field photos never used in training) | 788 | **81.2 %** | **96.1 %** |
| Lab model on field photos of the 14 lab crops (PlantDoc) | 236 | 55.1 % | 87.7 % |
| **+ our field-adapted head** on the same photos | 236 | **68.2 %** | **94.1 %** |

Per crop (Indian field-crop model, top-1 / top-3): groundnut 96.9 / 100 %, cotton 90.7 / 100 %, banana 85.1 / 100 %, chilli 82.3 / 98.0 %, onion 73.9 / 95.5 %, rice 66.3 / 88.4 %.

* Train/test split by **photo session** (consecutive photos of the same field never appear in both), so the test is honest.
* Confidence is calibrated: when the app says ~93 %, it was right 94 % of the time on the test photos; when it says ~50 %, 57 %.
* Leaf detector: all 788 Indian test photos and 97.6 % of PlantDoc photos accepted; 31 of 32 non-plant photos rejected.
* The user-reported chilli photo (curled, puckered leaves) is now diagnosed as **Chilli leaf curl** whether "Chilli", "Capsicum" or no crop is selected.
* Per-photo results: `docs/field_test/`.

## 7. Credits & licences
* Disease model: `rodynaemad/plant-disease-dinov2-small` (DINOv2-small + linear head, CC BY-SA 4.0), trained on PlantVillage (Hughes & Salathé 2015; Mohanty et al. 2016).
* Field photos: PlantDoc (Singh et al., 2020, CC BY 4.0); Indian field datasets via Project-AgML on Hugging Face — Paddy Doctor (rice, Tamil Nadu), COLD chilli & onion, chilli leaf-curl, cotton, groundnut and banana leaf disease datasets. Non-plant test photos: Wikimedia Commons (links in `docs/field_test`). The photos themselves are not redistributed.
* Weather & geocoding: Open-Meteo (CC BY 4.0); reverse geocoding: BigDataCloud free client API.
* Maps: © OpenStreetMap contributors. Libraries: ONNX Runtime Web, jsPDF, qrcode-generator, Leaflet.
* Dose and PHI values follow common Indian label rates — always read the product label. Fertilizer brands/MRPs and pesticide brand examples were checked against Indian online agri-store listings on 31 Oct 2026. Kisan Call Centre: 1800-180-1551.
