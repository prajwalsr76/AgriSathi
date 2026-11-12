// Market fertilizer / plant-nutrition products used for the post-diagnosis nutrition advice.
// grade     : N-P2O5-K2O (+ other nutrients)
// form      : 'wsf' water-soluble (foliar / drip) | 'granular' (soil) | 'liquid' | 'organic'
// foliar    : g or ml per litre for a foliar spray (null = soil only)
// soil      : kg per acre for soil application (null = foliar only)
// pack      : [size, unit, MRP ₹]. verified = date the MRP and brand were checked on an Indian
//             online agri-store (src); entries without it are indicative. Prices vary by state.
// brands    : examples of products sold in India under that grade (not an endorsement)
// color     : pack illustration colour

export const FERTS = {
  k13045: {
    name: 'Potassium Nitrate 13:0:45', short: '13:0:45', grade: 'N 13 · K₂O 45', form: 'wsf', foliar: 5, soil: null, unit: 'g',
    pack: [1, 'kg', 270], brands: 'Nutrifeed 13:0:45, Utkarsh NOP, Mahadhan KNO3, Coromandel Gromor Spray 13-0-45', verified: '31 Oct 2026', src: 'BigHaat', color: '#e65100',
    role: 'Potassium strengthens cell walls and stomatal control, so leaves resist fungal and bacterial entry; small nitrogen dose supports recovery.',
  },
  sop: {
    name: 'Potassium Sulphate (SOP) 0:0:50', short: 'SOP 0:0:50', grade: 'K₂O 50 · S 17.5', form: 'wsf', foliar: 5, soil: 20, unit: 'g',
    pack: [2, 'kg', 340], brands: 'Nutrifeed SOP 0:0:50, Utkarsh SOP', verified: '31 Oct 2026', src: 'BigHaat', color: '#6d4c41',
    role: 'Pure potassium plus sulphur with no extra nitrogen — boosts disease tolerance without making the canopy soft and lush.',
  },
  mkp: {
    name: 'Mono Potassium Phosphate 0:52:34', short: 'MKP 0:52:34', grade: 'P₂O₅ 52 · K₂O 34', form: 'wsf', foliar: 5, soil: null, unit: 'g',
    pack: [1, 'kg', 370], brands: 'Nutrifeed MKP 0:52:34', verified: '31 Oct 2026', src: 'BigHaat', color: '#1565c0',
    role: 'Fast-acting phosphorus + potassium foliar feed that supports roots, flowering and recovery after disease stress.',
  },
  calnit: {
    name: 'Calcium Nitrate 15.5:0:0 + 19% Ca', short: 'Calcium Nitrate', grade: 'N 15.5 · Ca 19', form: 'wsf', foliar: 5, soil: 10, unit: 'g',
    pack: [1, 'kg', 200], brands: 'Mahadhan Calcium Nitrate', verified: '31 Oct 2026', src: 'BigHaat', color: '#f9a825',
    role: 'Calcium builds stronger cell walls (less bacterial spread) and prevents blossom-end rot in tomato, capsicum and chilli.',
  },
  npk191919: {
    name: 'NPK 19:19:19 (water soluble)', short: '19:19:19', grade: 'N 19 · P₂O₅ 19 · K₂O 19', form: 'wsf', foliar: 5, soil: null, unit: 'g',
    pack: [1, 'kg', 300], brands: 'Mahadhan 19:19:19', verified: '31 Oct 2026', src: 'BigHaat', color: '#2e7d32',
    role: 'Balanced feed for vegetative growth — helps virus-stressed or recovering plants put out healthy new leaves.',
  },
  micro: {
    name: 'Micronutrient Mixture Grade-II (Zn, Fe, B …)', short: 'Micronutrient Gr-II', grade: 'Zn · Fe · Mn · Cu · B', form: 'liquid', foliar: 2, soil: null, unit: 'ml',
    pack: [500, 'ml', 350], brands: 'Patil Biotech Microdeal Grade 2', verified: '31 Oct 2026', src: 'BigHaat', color: '#7b1fa2',
    role: 'Zinc, iron and manganese are co-factors for the plant\'s own defence enzymes; deficiency makes every disease worse.',
  },
  boron: {
    name: 'Boron 20% (Disodium Octaborate)', short: 'Boron 20%', grade: 'B 20', form: 'wsf', foliar: 1, soil: null, unit: 'g',
    pack: [250, 'g', 190], brands: 'Solubor (Tata Rallis)', verified: '31 Oct 2026', src: 'BigHaat', color: '#00838f',
    role: 'Improves flowering, fruit set and cell-wall integrity; essential for grapes, cauliflower, groundnut and cotton.',
  },
  seaweed: {
    name: 'Seaweed Extract (bio-stimulant)', short: 'Seaweed extract', grade: 'Natural growth promoters + K', form: 'liquid', foliar: 2, soil: null, unit: 'ml',
    pack: [500, 'ml', 385], brands: 'IFFCO Sagarika Gold', verified: '31 Oct 2026', src: 'BigHaat', color: '#00695c',
    role: 'Natural bio-stimulant that reduces stress after disease attack and helps new healthy growth.',
  },
  silicon: {
    name: 'Potassium Silicate (silicon booster)', short: 'Silicon', grade: 'Si + K', form: 'wsf', foliar: 2, soil: null, unit: 'g',
    pack: [250, 'g', 400], brands: 'Patil Biotech Upsil', verified: '31 Oct 2026', src: 'BigHaat', color: '#546e7a',
    role: 'Silicon deposits in leaf cells form a physical barrier — proven to reduce rice blast and brown spot.',
  },
  zinc: {
    name: 'Zinc Sulphate 21% (heptahydrate)', short: 'Zinc Sulphate', grade: 'Zn 21 · S 10', form: 'granular', foliar: 5, soil: 10, unit: 'g',
    pack: [5, 'kg', 450], brands: 'Generic ZnSO₄ 21%', color: '#455a64',
    role: 'Corrects khaira (zinc deficiency) in rice and wheat and supports disease resistance.',
  },
  npk102626: {
    name: 'NPK 10:26:26 (complex, soil)', short: '10:26:26', grade: 'N 10 · P₂O₅ 26 · K₂O 26', form: 'granular', foliar: null, soil: 50, unit: 'kg',
    pack: [50, 'kg', 1470], brands: 'IFFCO NPK 10:26:26, Coromandel Gromor 10:26:26', color: '#283593',
    role: 'Basal dose rich in P and K for root strength — the base of a disease-tolerant crop.',
  },
  neemcake: {
    name: 'Neem Cake (organic manure)', short: 'Neem cake', grade: 'N 4–5 % + azadirachtin', form: 'organic', foliar: null, soil: 100, unit: 'kg',
    pack: [25, 'kg', 600], brands: 'Generic neem cake', color: '#5d4037',
    role: 'Slow organic nitrogen that also suppresses soil-borne fungi and nematodes.',
  },
  nanourea: {
    name: 'Nano Urea (liquid)', short: 'Nano Urea', grade: 'N (nano)', form: 'liquid', foliar: 4, soil: null, unit: 'ml',
    pack: [500, 'ml', 225], brands: 'IFFCO Nano Urea Plus', color: '#0277bd',
    role: 'Foliar nitrogen for healthy crops at tillering / vegetative stage; replaces part of top-dress urea.',
  },
};
