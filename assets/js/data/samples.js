// Demo leaf photos (PlantVillage test images). Served from assets/samples when present,
// otherwise straight from the public Hugging Face Space that hosts them.
const HUB = 'https://huggingface.co/spaces/rodynaemad/plant-disease-scanner/resolve/main/examples/';
export const SAMPLES = [
  { file: 'tomato_late_blight.jpg', crop: 'tomato', name: 'Tomato · Late blight' },
  { file: 'potato_early_blight.jpg', crop: 'potato', name: 'Potato · Early blight' },
  { file: 'corn_common_rust.jpg', crop: 'corn', name: 'Maize · Common rust' },
  { file: 'grape_black_rot.jpg', crop: 'grape', name: 'Grape · Black rot' },
  { file: 'apple_apple_scab.jpg', crop: 'apple', name: 'Apple · Scab' },
  { file: 'pepper_bell_healthy.jpg', crop: 'pepper', name: 'Capsicum · Healthy' },
].map(s => ({ ...s, local: 'assets/samples/' + s.file, hub: HUB + s.file }));

/** <img> markup that falls back to the hub copy if the local file is missing. */
export const sampleImg = (s, attrs = '') =>
  `<img src="${s.local}" data-hub="${s.hub}" onerror="if(this.dataset.hub&&this.src!==this.dataset.hub){this.src=this.dataset.hub}" ${attrs}>`;
