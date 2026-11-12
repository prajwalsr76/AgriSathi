// Crop master data.
// yield: average gross yield (quintal / acre), price: typical farm-gate price (₹ / quintal).
// rdf: recommended dose of fertilizer, kg per hectare of N - P2O5 - K2O (general ICAR / SAU
// package-of-practice values; always refine with the farmer's Soil Health Card).
// waterPerAcre: spray volume (litres / acre) for a full-cover knapsack spray.

export const CROPS = {
  tomato:   { name: { en: 'Tomato', hi: 'टमाटर', mr: 'टोमॅटो' }, icon: '🍅', yield: 100, price: 1500, rdf: [120, 60, 60], waterPerAcre: 200, season: 'Kharif / Rabi', inModel: true },
  potato:   { name: { en: 'Potato', hi: 'आलू', mr: 'बटाटा' }, icon: '🥔', yield: 100, price: 1200, rdf: [150, 80, 100], waterPerAcre: 200, season: 'Rabi', inModel: true },
  pepper:   { name: { en: 'Capsicum / Bell pepper', hi: 'शिमला मिर्च', mr: 'ढोबळी मिरची' }, icon: '🫑', yield: 80, price: 2500, rdf: [120, 80, 80], waterPerAcre: 200, season: 'Kharif / Rabi', inModel: true },
  corn:     { name: { en: 'Maize', hi: 'मक्का', mr: 'मका' }, icon: '🌽', yield: 25, price: 2400, rdf: [150, 75, 40], waterPerAcre: 200, season: 'Kharif / Rabi', inModel: true },
  grape:    { name: { en: 'Grape', hi: 'अंगूर', mr: 'द्राक्ष' }, icon: '🍇', yield: 100, price: 4000, rdf: [200, 150, 300], waterPerAcre: 400, season: 'Perennial', inModel: true },
  apple:    { name: { en: 'Apple', hi: 'सेब', mr: 'सफरचंद' }, icon: '🍎', yield: 40, price: 6000, rdf: [70, 35, 70], waterPerAcre: 400, season: 'Perennial', inModel: true },
  cherry:   { name: { en: 'Cherry', hi: 'चेरी', mr: 'चेरी' }, icon: '🍒', yield: 20, price: 15000, rdf: [70, 35, 70], waterPerAcre: 400, season: 'Perennial', inModel: true },
  peach:    { name: { en: 'Peach', hi: 'आड़ू', mr: 'पीच' }, icon: '🍑', yield: 40, price: 5000, rdf: [70, 35, 70], waterPerAcre: 400, season: 'Perennial', inModel: true },
  orange:   { name: { en: 'Citrus / Orange', hi: 'संतरा', mr: 'संत्री' }, icon: '🍊', yield: 60, price: 3000, rdf: [120, 60, 120], waterPerAcre: 400, season: 'Perennial', inModel: true },
  strawberry: { name: { en: 'Strawberry', hi: 'स्ट्रॉबेरी', mr: 'स्ट्रॉबेरी' }, icon: '🍓', yield: 40, price: 8000, rdf: [100, 80, 100], waterPerAcre: 200, season: 'Rabi', inModel: true },
  squash:   { name: { en: 'Squash / Pumpkin', hi: 'कद्दू', mr: 'भोपळा' }, icon: '🎃', yield: 80, price: 1200, rdf: [100, 50, 50], waterPerAcre: 200, season: 'Kharif / Zaid', inModel: true },
  soybean:  { name: { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन' }, icon: '🫘', yield: 10, price: 5300, rdf: [30, 60, 30], waterPerAcre: 200, season: 'Kharif', inModel: true },
  blueberry: { name: { en: 'Blueberry', hi: 'ब्लूबेरी', mr: 'ब्लूबेरी' }, icon: '🫐', yield: 20, price: 20000, rdf: [60, 30, 60], waterPerAcre: 300, season: 'Perennial', inModel: true },
  raspberry: { name: { en: 'Raspberry', hi: 'रास्पबेरी', mr: 'रास्पबेरी' }, icon: '🍇', yield: 20, price: 20000, rdf: [60, 30, 60], waterPerAcre: 300, season: 'Perennial', inModel: true },
  // Major Indian field crops: covered by the Expert (vision-language) mode, the disease
  // library, weather risk and calculators. Not part of the 38-class on-device model.
  rice:     { name: { en: 'Rice (Paddy)', hi: 'धान', mr: 'भात' }, icon: '🌾', yield: 22, price: 2369, rdf: [120, 60, 40], waterPerAcre: 200, season: 'Kharif', inModel: true },
  wheat:    { name: { en: 'Wheat', hi: 'गेहूं', mr: 'गहू' }, icon: '🌾', yield: 18, price: 2585, rdf: [120, 60, 40], waterPerAcre: 200, season: 'Rabi', inModel: false },
  cotton:   { name: { en: 'Cotton', hi: 'कपास', mr: 'कापूस' }, icon: '☁️', yield: 8, price: 7710, rdf: [120, 60, 60], waterPerAcre: 200, season: 'Kharif', inModel: true },
  chilli:   { name: { en: 'Chilli', hi: 'मिर्च', mr: 'मिरची' }, icon: '🌶️', yield: 30, price: 6000, rdf: [120, 60, 60], waterPerAcre: 200, season: 'Kharif / Rabi', inModel: true },
  onion:    { name: { en: 'Onion', hi: 'प्याज', mr: 'कांदा' }, icon: '🧅', yield: 100, price: 1500, rdf: [100, 50, 80], waterPerAcre: 200, season: 'Rabi / Kharif', inModel: true },
  groundnut: { name: { en: 'Groundnut', hi: 'मूंगफली', mr: 'भुईमूग' }, icon: '🥜', yield: 8, price: 7260, rdf: [25, 50, 0], waterPerAcre: 200, season: 'Kharif', inModel: true },
  banana:   { name: { en: 'Banana', hi: 'केला', mr: 'केळी' }, icon: '🍌', yield: 250, price: 1200, rdf: [200, 60, 300], waterPerAcre: 400, season: 'Perennial', inModel: true },
};

export const CROP_ORDER = ['tomato', 'potato', 'rice', 'wheat', 'cotton', 'chilli', 'onion', 'corn', 'soybean', 'groundnut',
  'pepper', 'grape', 'banana', 'apple', 'orange', 'strawberry', 'squash', 'peach', 'cherry', 'blueberry', 'raspberry'];

export const cropName = (key, lang = 'en') => (CROPS[key]?.name[lang] || CROPS[key]?.name.en || key);
