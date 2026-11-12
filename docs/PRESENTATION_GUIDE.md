# AgriSathi — Presentation & Viva Guide

## 1. One-line pitch
"Plantix tells a farmer the disease name. AgriSathi tells him how bad it is, whether this week's weather will make it worse, exactly how many grams to put in each 16-litre tank, which pack to buy, when to spray, when it is safe to harvest — and how many rupees the spray will save. In his own language, on his own phone, even offline."

## 2. Problem → Solution slide
| Farmer's real problem | What AgriSathi does |
|---|---|
| Disease name alone is useless | Full action plan: dose per tank, tanks per field, cheapest packs, safe-harvest date |
| AI is a black box | Lesion map + occlusion "where the AI looked" map + confidence + top-3 |
| Lab-trained models fail on bad photos | Quality gate, out-of-distribution guard, crop-aware decoding, independent second AI |
| Overspraying / wrong timing | Weather-driven disease-risk models + 72-hour spray-window planner |
| Agro-dealers push big packs | Knapsack pack optimiser shows savings vs. bulk |
| Pesticide residue | Pre-harvest-interval guard, banned-product guardrail |
| Literacy & language | Hindi / Marathi UI + voice read-out |
| Poor connectivity | Model runs on-device, PWA works offline |

## 3. Architecture (draw this)
```
 Photo ──► Quality gate (Laplacian blur, exposure, plant pixels)
            │
            ├──► On-device AI (DINOv2-small, ONNX Runtime Web, Web Worker)
            │      • TTA (mirror)  • crop-aware decoding  • OOD centroid check
            │
            ├──► Expert AI (vision-language model, JSON schema) — independent, in parallel
            │
            ├──► Severity (HSV segmentation → closing → hole fill → lesion %)
            │
            └──► Weather (Open-Meteo) → Hutton / TOMCAST / Gubler-Thomas / wetness rules
                         │
          Consensus engine (agree / disagree / override rules)
                         │
   Action plan: dose per tank · tanks · pack optimiser · PHI date · spray window · ROI
                         │
   Outputs: result screen · voice · PDF + QR verify · WhatsApp · My Farm history & map
```

## 4. Live demo script (6–7 minutes)
1. **Home page** (30 s) – the problem in one line; scroll to "How a diagnosis works".
2. **Weather Risk** (1 min) – click *Use my location* (or search "Nashik"). Show live 7-day forecast, disease-risk cards for Tomato, and the 72-hour spray planner. Point out these are published epidemiological models, not guesses.
3. **Crop Doctor** (2.5 min) – choose Tomato → click the *Tomato · Late blight* sample.
   - Watch the six-step pipeline.
   - Result: name, pathogen, confidence ring, severity ring.
   - Scroll through the 5 steps: **1 Disease → 2 Pesticide plan → 3 Best fertilizer → 4 Weather & spread → 5 AI evidence**.
   - Step 2: the green **BEST CHOICE** box (dose per tank, tanks, packs, cost, safe-harvest date), the "use only ONE product per spray" rule, the alternatives and the rotation plan. Change field size to 0.25 acre → packs switch from bulk to a small pack, savings appear.
   - Step 3: top-3 fertilizers with match score and range; explain the range = advice re-scored under the second most likely diagnosis.
   - Step 4: 7-day weather, disease pressure, best spray time and the "if untreated vs with treatment" spread chart.
   - Step 5: open the evidence — lesion map and "where the AI looked" heat-map.
   - Click **Ask Sathi** → tap "Can I mix all of them?" and "Best fertilizer?"; switch to हिंदी and ask by voice.
   - Click **Listen** after switching language to हिंदी.
   - Click **Prescription PDF** → open it → scan the QR with your phone.
4. **Robustness** (1 min) – upload a photo of something that is not a leaf (laptop, shoe, chair). Show "No leaf detected" with only a retry button instead of a confident wrong answer.
5. **Calculators** (1 min) – Fertilizer tab: set Nitrogen "Low" on the Soil Health Card → bag counts and cost update; three product strategies compared.
6. **Indian crops** (1 min) – choose Chilli and upload a photo of curled chilli leaves → "Chilli Leaf Curl" with the insect-vector spray plan. Then choose Rice or Cotton to show these crops work on the phone too, without internet.
7. **Honest confidence** (30 s) – point to the confidence ring and its range; open "AI evidence" to show where the model looked.
8. **My Farm** (30 s) – history, map pins, CSV export. Toggle dark mode for the finish.

Before the demo: open the deployed link once with internet on the phone and laptop so everything is cached (the folder already contains the model and libraries). If you have a Gemini key, add it in Settings to show "Confirmed by 2 independent AIs".

## 5. Numbers to quote
* 69 conditions across 20 crops diagnosed on the phone (38 lab-model classes + 31 Indian field-crop classes); wheat via Expert AI.
* 98.7 % accuracy / 98.1 % macro-F1 (int8 model) on leaves never seen in training (leaf-grouped split, 10,862 images).
* ≈ 0.4–0.6 s per image on a laptop CPU in the browser, 24 MB model, no server.
* 38 automated unit tests.
* Indian field-crop model (chilli, rice, cotton, groundnut, onion, banana, capsicum): **81.2 % top-1 / 96.1 % top-3 on 788 Indian field photos** never used in training (split by photo session). Calibrated confidence (ECE 0.02).
* Field test on 236 real field photos (PlantDoc test split, never used for training): lab model 55.1 % top-1 / 87.7 % top-3 → **AgriSathi with our field-adapted head 68.2 % / 94.1 %**.
* Leaf detector: 97.6 % of 776 real field photos accepted; 31 / 32 real non-plant photos rejected.

## 6. Likely viva questions
**Q. Your first version said a sick chilli plant was healthy. What did you change?**
A. Chilli was not in the lab model at all — it only knew bell-pepper bacterial spot and healthy, so it had to pick one of those. I collected Indian field photos for chilli, rice, cotton, groundnut, onion and banana (1,532 for training), extracted DINOv2 features and trained a multinomial logistic-regression head with 31 new classes, choosing the regularisation by group cross-validation and calibrating the confidence with temperature scaling. Capsicum and chilli share one model because they are the same species. On 788 held-out Indian photos it scores 81.2 % top-1 and 96.1 % top-3, and the same chilli photo is now diagnosed as leaf curl.

**Q. Did you train any model yourself?**
A. Yes — the field-adapted head, which ships with the app. The DINOv2 backbone stays frozen; I extracted the 768-d features of all 2,336 real field photos in the PlantDoc training split (27 conditions), trained a multinomial logistic-regression head (L2 regularisation, C chosen by 5-fold cross-validation) and fuse it with the lab model in log space. Cross-validation chose α = 0, i.e. field-like photos are answered by the field head; a similarity gate moves α back to 1 for photos that look like lab photos, so clean photos keep the lab model's answer (6/6 demo photos still correct). Confidence is temperature-calibrated (T = 1.95). On 236 different field photos: 55.1 % → 68.2 % top-1, 87.7 % → 94.1 % top-3. This is transfer learning / domain adaptation for the lab-to-field gap. The same training runs in `tools/train_field_head.py`. I also trained the Indian field-crop model (31 classes, 81.2 % on 788 Indian test photos).

**Q. Why not train your own CNN from scratch?**
A. Training on PlantVillage is a solved problem (> 98 %). The real-world gap is robustness, explainability and actionability, so the engineering effort went there. DINOv2 is a self-supervised vision transformer whose features generalise better than a CNN trained from scratch; a linear head on frozen features avoids over-fitting.

**Q. PlantVillage images are lab images. Will it work in the field?**
A. Not perfectly — we measured it. On 236 real field photos the lab model gets 55.1 % top-1; with our field-adapted head 68.2 % top-1 and 94.1 % top-3 (the right answer is in the top 3, which the app shows). Further mitigations: the quality gate, crop-aware decoding, the leaf detector, the confidence range, and an independent Expert AI. When the two AIs disagree, the farmer is told to compare symptoms instead of seeing a single confident answer.

**Q. How do you stop it from diagnosing a photo that has no plant?**
A. A leaf detector combines two independent signals: the cosine similarity of the DINOv2 embedding to the nearest leaf-class centroid, and the share of plant-coloured pixels. I calibrated it on real photos: 32 non-plant photos from Wikimedia Commons (laptop, car, shoe, sofa, dog, green chair …) score below 0.24, while 776 real field photos have a median of 0.64. Rule: reject below 0.25, or below 0.30 when less than half the photo is plant-coloured, or below 0.40 with almost no plant colour. Result: 31/32 non-plants rejected and 97.6 % of field photos accepted. The one miss is a brick wall (brick looks like brown diseased tissue) — it then gets a low confidence. Unusual leaves are not rejected; their confidence is lowered. The Expert AI, when available, gets the final word on unclear photos.

**Q. Where does the confidence range come from?**
A. Test-time augmentation: the photo is classified in 4 views (original, mirror, 85 % zoom, zoom + mirror). The average is the confidence and the min–max of the chosen class across the views is the range. A narrow range means the prediction is stable.

**Q. What is the out-of-distribution check?**
A. The model outputs a 768-dimensional embedding. We compute cosine similarity to the mean embedding of each class from training data. Below 0.699 (the 1st percentile of real test leaves), the image is flagged as unlike anything in training.

**Q. How is severity calculated?**
A. Every pixel is classified in HSV space as green tissue, symptomatic (yellow/brown) or background. Morphological closing + hole filling recovers the full leaf outline, including dark necrotic or white powdery areas. Severity = non-green pixels inside the leaf ÷ leaf pixels.

**Q. How do you explain the AI's decision?**
A. Occlusion sensitivity: we hide each of 16 regions in turn, re-run the real model and measure how much the predicted class probability drops. Large drops = regions the model relied on. It is model-agnostic and faithful to the deployed model.

**Q. Explain the weather models.**
A. *Hutton criteria* (UK, 2017): two consecutive days with minimum temperature ≥ 10 °C and ≥ 6 hours of relative humidity ≥ 90 % → late-blight infection period. *TOMCAST*: daily disease-severity values (0–4) from leaf-wetness hours and mean temperature during wetness; a cumulative 15 means "spray now". *Gubler–Thomas*: +20 points for each day with ≥ 6 continuous hours at 21–30 °C, −10 otherwise; ≥ 60 is high powdery-mildew risk. Leaf wetness is approximated as RH ≥ 90 % or rain.

**Q. How does the pack optimiser work?**
A. Unbounded knapsack: dynamic programming over quantities in 10 g/ml steps finds the cheapest combination of retail pack sizes whose total covers the requirement.

**Q. How is ROI calculated?**
A. Expected loss % = max loss × clamp(severity ÷ 35 %, 0.15, 1) × weather factor (0.6 / 1.0 / 1.3). Money protected = loss × 80 % efficacy − treatment cost. All inputs are editable.

**Q. How does the chatbot work? Isn't it just ChatGPT?**
A. It works fully offline first: an intent detector (English / Hindi / Marathi keywords) answers from the app's own computed data — the same dose, packs, rotation, fertilizer and weather numbers shown on screen, so it cannot invent a dose. When a Gemini key is configured, the full diagnosis is injected as JSON context and the model is instructed to use only those numbers; if the call fails it falls back to the offline engine.

**Q. How is the "best" pesticide chosen?**
A. Score = expert first-line order + 15 if the infection is active (≥ 10 % damage) and the product is systemic + 10 if early (< 10 %) and the product is a protective contact + cost-per-acre rank − PHI/2. The rotation then picks products so the FRAC/IRAC group never repeats back-to-back.

**Q. What does the fertilizer "match range" mean?**
A. The rule score is computed for the most likely diagnosis and again for the second most likely one. The shown match is the probability-weighted average and the range is min–max across the two. A narrow range means the advice is safe even if the diagnosis is wrong.

**Q. How is the 7-day spread predicted?**
A. Van der Plank's logistic model dS/dt = r·w(t)·S(1 − S/100). r is the apparent infection rate of the pathogen type (water mould fastest, virus slowest); w(t) comes from the same weather-risk model used for alerts. Treatment cuts r by 80 %.

**Q. The Expert AI is a cloud call — isn't it slow?**
A. The farmer never waits for it. The on-device answer appears in about a second; the Expert AI runs in parallel and the page updates itself when it arrives ("Confirmed by 2 independent AIs"). The call is tuned for speed: 768 px image, low "thinking" level, compact JSON, the last working model is remembered, and a 30-second timeout. In chat, common questions are answered instantly from the app's own numbers and open questions stream word by word. A Fast mode (Flash-Lite) is available in Settings.

**Q. Privacy?**
A. The on-device model never uploads the photo. Expert mode is optional and clearly labelled. History is stored only in the browser.

**Q. What would you do next?**
A. Fine-tune on field datasets (PlantDoc, Indian KVK images) with farmer feedback; add pest-trap counting; push alerts when the risk turns red; integrate Agmarknet mandi prices; Kannada/Telugu/Tamil; a WhatsApp chatbot front-end.

## 7. What changed from the earlier Streamlit prototype
* Streamlit demo → shareable, installable, mobile-first web app with a product-grade UI.
* Procedurally generated test specimens → a real, published, leaf-level-validated model running in the browser, tested on real leaf photos.
* Fixed 10-class tomato scope → 38 classes on-device, 21 crops with Expert mode.
* Static district climate files → live GPS forecast with published disease-risk models and a spray planner.
* Removed Streptocycline (banned on crops in India since 2024) from all recommendations.
* Grad-CAM overlay → occlusion sensitivity computed on the actual deployed model, plus pixel-level lesion measurement.
* gTTS (server, internet) → browser speech, works offline on most phones.
* Added: chat assistant (text + voice, 3 languages), BEST CHOICE treatment ranking with alternatives and rotation, top-3 fertilizer advisor with match range, 7-day spread forecast, dark mode, severity meter, crop-aware decoding, OOD guard, consensus of two AIs, fertilizer planner with Soil Health Card, pack optimiser, PHI guard, PDF with QR verification, WhatsApp share, farm history & map, unit tests.
