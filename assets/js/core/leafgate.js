// "Is there a leaf in this photo?" — decided from two independent signals so that real field
// photos are NOT rejected, while clearly non-plant photos (laptops, walls, faces) are.
//   sim        : cosine similarity of the DINOv2 embedding to the nearest leaf-class centroid
//   plantRatio : share of green / yellow / brown plant-coloured pixels (HSV rules)
// Calibration with the real model (docs/field_test):
//   32 real non-plant photos from Wikimedia Commons (laptop, car, shoe, dog, sofa, green door,
//   green chair, tractor …): similarity −0.02–0.23, except a brick wall (0.48, brick looks like
//   brown diseased tissue).
//   776 real field photos (PlantDoc): median 0.64; 97.6 % are accepted by the rule below.
//   PlantVillage lab leaves: 0.74–0.93.
// Rule: reject when sim < 0.25, or sim < 0.30 and less than half the photo is plant-coloured,
// or sim < 0.40 and almost nothing is plant-coloured. Everything else is a leaf; unusual leaves
// get a lower confidence through `reliability` instead of being rejected.
export const LEAF = { reject: 0.25, weak: 0.30, borderline: 0.40, familiar: 0.6994, full: 0.55 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * @returns { leaf: boolean, score: 0..1 (how leaf-like), familiar: boolean (looks like training
 *            leaves), reliability: 0.4..1 (multiplier for the on-device confidence) }
 */
export function leafGate({ sim, plantRatio = 0.5, expertPlant = null }) {
  if (expertPlant === false && sim < LEAF.familiar) return { leaf: false, score: 0, familiar: false, reliability: 0, by: 'expert' };
  const notLeaf = sim < LEAF.reject || (sim < LEAF.weak && plantRatio < 0.5) || (sim < LEAF.borderline && plantRatio < 0.05);
  if (notLeaf && expertPlant !== true) return { leaf: false, score: clamp((sim - 0.15) / (LEAF.full - 0.15), 0, 1), familiar: false, reliability: 0, by: 'model' };
  return {
    leaf: true,
    score: expertPlant === true ? Math.max(0.9, clamp((sim - 0.22) / (LEAF.full - 0.22), 0, 1)) : clamp((sim - 0.22) / (LEAF.full - 0.22), 0, 1),
    familiar: sim >= LEAF.familiar,
    reliability: clamp((sim - LEAF.weak) / (LEAF.familiar - LEAF.weak), 0.4, 1),
    by: expertPlant === true ? 'expert' : 'model',
  };
}
