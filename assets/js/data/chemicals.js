// Crop-protection product catalogue.
// dose      : amount per litre of spray water (unit g or ml), common Indian label rate.
// phi       : default pre-harvest interval in days (verify on the product label / CIB&RC list).
// group     : resistance-management group (FRAC for fungicides, IRAC for insecticides).
// packs     : retail SKUs [size in g/ml, indicative MRP ₹]. Prices vary by brand & state;
//             the farmer can override them in the calculator.
// brands    : examples checked against Indian online agri-retail listings (Oct 2026); not an endorsement.
// kind      : 'chemical' | 'bio' | 'organic'

export const CHEMICALS = {
  mancozeb: { name: 'Mancozeb 75% WP', brands: 'Dithane M-45, Indofil M-45', dose: 2.5, unit: 'g', phi: 5, group: 'FRAC M03 (multi-site contact)', kind: 'chemical', packs: [[250, 140], [500, 260], [1000, 480]] },
  chlorothalonil: { name: 'Chlorothalonil 75% WP', brands: 'Kavach', dose: 2, unit: 'g', phi: 7, group: 'FRAC M05 (multi-site contact)', kind: 'chemical', packs: [[250, 260], [500, 490], [1000, 920]] },
  azoxystrobin: { name: 'Azoxystrobin 23% SC', brands: 'Amistar', dose: 1, unit: 'ml', phi: 5, group: 'FRAC 11 (QoI, systemic)', kind: 'chemical', packs: [[100, 420], [200, 800], [500, 1900]] },
  azoxy_difeno: { name: 'Azoxystrobin 18.2% + Difenoconazole 11.4% SC', brands: 'Amistar Top', dose: 1, unit: 'ml', phi: 7, group: 'FRAC 11 + 3', kind: 'chemical', packs: [[100, 560], [200, 1080], [500, 2550]] },
  difenoconazole: { name: 'Difenoconazole 25% EC', brands: 'Score', dose: 0.5, unit: 'ml', phi: 7, group: 'FRAC 3 (DMI, systemic)', kind: 'chemical', packs: [[100, 360], [250, 850], [500, 1650]] },
  metalaxyl_mz: { name: 'Metalaxyl-M 4% + Mancozeb 64% WP', brands: 'Ridomil Gold, Krilaxyl', dose: 2.5, unit: 'g', phi: 7, group: 'FRAC 4 + M03', kind: 'chemical', packs: [[100, 160], [250, 380], [500, 720], [1000, 1380]] },
  cymoxanil_mz: { name: 'Cymoxanil 8% + Mancozeb 64% WP', brands: 'Curzate M8, Indofil Moximate', dose: 3, unit: 'g', phi: 7, group: 'FRAC 27 + M03', kind: 'chemical', packs: [[250, 320], [500, 610], [1000, 1150]] },
  dimethomorph: { name: 'Dimethomorph 50% WP', brands: 'Acrobat', dose: 1, unit: 'g', phi: 7, group: 'FRAC 40 (CAA)', kind: 'chemical', packs: [[100, 380], [200, 720], [500, 1700]] },
  copper_oxy: { name: 'Copper Oxychloride 50% WP', brands: 'Blitox 50', dose: 3, unit: 'g', phi: 7, group: 'FRAC M01 (copper)', kind: 'chemical', packs: [[250, 160], [500, 300], [1000, 560]] },
  copper_hyd: { name: 'Copper Hydroxide 53.8% DF', brands: 'Kocide 3000', dose: 2, unit: 'g', phi: 7, group: 'FRAC M01 (copper)', kind: 'chemical', packs: [[250, 340], [500, 650], [1000, 1250]] },
  kasugamycin: { name: 'Kasugamycin 3% SL', brands: 'Kasu-B', dose: 2, unit: 'ml', phi: 7, group: 'FRAC 24 (antibiotic, approved)', kind: 'chemical', packs: [[100, 190], [250, 430], [500, 820]] },
  sulphur: { name: 'Sulphur 80% WDG', brands: 'Sulfex, Thiovit Jet', dose: 2.5, unit: 'g', phi: 1, group: 'FRAC M02 (contact)', kind: 'chemical', packs: [[500, 120], [1000, 220], [3000, 600]] },
  hexaconazole: { name: 'Hexaconazole 5% SC', brands: 'Contaf Plus', dose: 2, unit: 'ml', phi: 10, group: 'FRAC 3 (DMI, systemic)', kind: 'chemical', packs: [[250, 210], [500, 390], [1000, 740]] },
  propiconazole: { name: 'Propiconazole 25% EC', brands: 'Tilt', dose: 1, unit: 'ml', phi: 14, group: 'FRAC 3 (DMI, systemic)', kind: 'chemical', packs: [[100, 240], [250, 560], [500, 1080]] },
  tebuconazole: { name: 'Tebuconazole 25.9% EC', brands: 'Folicur', dose: 1, unit: 'ml', phi: 10, group: 'FRAC 3 (DMI, systemic)', kind: 'chemical', packs: [[100, 260], [250, 600], [500, 1150]] },
  myclobutanil: { name: 'Myclobutanil 10% WP', brands: 'Systhane', dose: 0.4, unit: 'g', phi: 14, group: 'FRAC 3 (DMI, systemic)', kind: 'chemical', packs: [[100, 280], [250, 650]] },
  captan: { name: 'Captan 50% WP', brands: 'Captaf, Merpan', dose: 2.5, unit: 'g', phi: 7, group: 'FRAC M04 (contact)', kind: 'chemical', packs: [[250, 220], [500, 420], [1000, 800]] },
  tricyclazole: { name: 'Tricyclazole 75% WP', brands: 'Beam', dose: 0.6, unit: 'g', phi: 21, group: 'FRAC 16.1 (MBI-R)', kind: 'chemical', packs: [[60, 150], [120, 280], [300, 650]] },
  validamycin: { name: 'Validamycin 3% L', brands: 'Dhanuka Sheathmar, Valida', dose: 2, unit: 'ml', phi: 14, group: 'FRAC U18', kind: 'chemical', packs: [[250, 150], [500, 280], [1000, 520]] },
  spiromesifen: { name: 'Spiromesifen 22.9% SC', brands: 'Oberon', dose: 0.8, unit: 'ml', phi: 7, group: 'IRAC 23 (mite growth)', kind: 'chemical', packs: [[100, 720], [250, 1700]] },
  fenpyroximate: { name: 'Fenpyroximate 5% EC', brands: 'Sedna', dose: 1, unit: 'ml', phi: 5, group: 'IRAC 21A', kind: 'chemical', packs: [[100, 260], [250, 600], [500, 1150]] },
  propargite: { name: 'Propargite 57% EC', brands: 'Omite', dose: 2, unit: 'ml', phi: 7, group: 'IRAC 12C', kind: 'chemical', packs: [[250, 290], [500, 540], [1000, 1020]] },
  imidacloprid: { name: 'Imidacloprid 17.8% SL', brands: 'Confidor, Tatamida', dose: 0.3, unit: 'ml', phi: 7, group: 'IRAC 4A (systemic)', kind: 'chemical', packs: [[50, 120], [100, 220], [250, 520]] },
  diafenthiuron: { name: 'Diafenthiuron 50% WP', brands: 'Pegasus, Polo, IFFCO Shoku', dose: 1.2, unit: 'g', phi: 7, group: 'IRAC 12A', kind: 'chemical', packs: [[100, 210], [250, 500], [500, 960]] },
  thiamethoxam: { name: 'Thiamethoxam 25% WG', brands: 'Actara', dose: 0.4, unit: 'g', phi: 7, group: 'IRAC 4A (systemic)', kind: 'chemical', packs: [[50, 160], [100, 300], [250, 720]] },
  emamectin: { name: 'Emamectin Benzoate 5% SG', brands: 'Proclaim, EM-1', dose: 0.4, unit: 'g', phi: 5, group: 'IRAC 6', kind: 'chemical', packs: [[50, 180], [100, 340], [250, 800]] },
  spinetoram: { name: 'Spinetoram 11.7% SC', brands: 'Delegate', dose: 0.5, unit: 'ml', phi: 3, group: 'IRAC 5', kind: 'chemical', packs: [[75, 520], [180, 1180]] },
  pymetrozine: { name: 'Pymetrozine 50% WG', brands: 'Chess', dose: 0.6, unit: 'g', phi: 7, group: 'IRAC 9B', kind: 'chemical', packs: [[100, 420], [300, 1150]] },
  fipronil: { name: 'Fipronil 5% SC', brands: 'many CIB&RC-registered brands', dose: 1.5, unit: 'ml', phi: 7, group: 'IRAC 2B (phenylpyrazole)', kind: 'chemical', packs: [[100, 110], [250, 250], [500, 480]] },
  quinalphos: { name: 'Quinalphos 25% EC', brands: 'many CIB&RC-registered brands', dose: 2, unit: 'ml', phi: 14, group: 'IRAC 1B (organophosphate)', kind: 'chemical', packs: [[250, 160], [500, 300], [1000, 560]] },
  carbendazim: { name: 'Carbendazim 50% WP (soil drench)', brands: 'many CIB&RC-registered brands', dose: 1, unit: 'g', phi: 15, group: 'FRAC 1 (MBC, systemic)', kind: 'chemical', packs: [[100, 90], [250, 200], [500, 380]] },
  neem: { name: 'Neem oil (Azadirachtin 1500 ppm)', brands: 'Neemazal, Achook', dose: 4, unit: 'ml', phi: 0, group: 'Botanical', kind: 'organic', packs: [[100, 120], [250, 260], [500, 480], [1000, 900]] },
  trichoderma: { name: 'Trichoderma viride / harzianum 1% WP', brands: 'many CIB&RC-registered brands', dose: 5, unit: 'g', phi: 0, group: 'Biocontrol fungus', kind: 'bio', packs: [[500, 120], [1000, 220]] },
  pseudomonas: { name: 'Pseudomonas fluorescens 1% WP', brands: 'many CIB&RC-registered brands', dose: 10, unit: 'g', phi: 0, group: 'Biocontrol bacterium', kind: 'bio', packs: [[500, 120], [1000, 220]] },
  bacillus: { name: 'Bacillus subtilis 1.5% WP', brands: 'many CIB&RC-registered brands', dose: 5, unit: 'g', phi: 0, group: 'Biocontrol bacterium', kind: 'bio', packs: [[500, 180], [1000, 330]] },
  ampelomyces: { name: 'Ampelomyces quisqualis', brands: 'many CIB&RC-registered brands', dose: 5, unit: 'g', phi: 0, group: 'Biocontrol (powdery mildew)', kind: 'bio', packs: [[500, 220], [1000, 400]] },
  verticillium: { name: 'Verticillium lecanii 1.15% WP', brands: 'T. Stanes Bio-Catch, Multiplex Varsha', dose: 5, unit: 'g', phi: 0, group: 'Biocontrol (sucking pests)', kind: 'bio', packs: [[500, 140], [1000, 250]] },
};

// Products that must never be recommended (regulatory guardrail).
export const BANNED = [
  { name: 'Streptomycin + Tetracycline (Streptocycline, Plantomycin)', note: 'Use of these antibiotics on crops was prohibited in India from 1 Jan 2024 (antimicrobial-resistance risk). Use copper or Kasugamycin instead.' },
  { name: 'Monocrotophos on vegetables', note: 'Not permitted on vegetables in India.' },
];
