# Optional offline model files

Run `python tools/setup_offline.py` to download the on-device model (`plant_disease_dinov2_int8.onnx`, ~24 MB) and `centroids.f32` into this folder. Without them the app downloads the same files from the Hugging Face Hub on first use and caches them in the browser.
