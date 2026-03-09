import { MorphChannelMap } from '../components/Avatar3D/facial-types';

export type RhubarbViseme = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';

export const RHUBARB_TO_BLENDSHAPE: Record<RhubarbViseme, string> = {
  A: 'viseme_aa',
  B: 'viseme_PP',
  C: 'viseme_E',
  D: 'viseme_aa',
  E: 'viseme_O',
  F: 'viseme_FF',
  G: 'viseme_L',
  H: 'viseme_sil',
  X: 'viseme_sil',
};

export function rhubarbCueToMorphTargets(cue: string, intensity = 1): MorphChannelMap {
  const upper = (cue || 'X').toUpperCase() as RhubarbViseme;
  const mapped = RHUBARB_TO_BLENDSHAPE[upper] || 'viseme_sil';

  const safeIntensity = Math.max(0, Math.min(1, intensity));
  const targets: MorphChannelMap = {
    jawOpen: mapped === 'viseme_sil' ? 0 : 0.12 + safeIntensity * 0.24,
    viseme_sil: mapped === 'viseme_sil' ? 0.8 : 0.0,
    viseme_aa: 0,
    viseme_O: 0,
    viseme_E: 0,
    viseme_U: 0,
    viseme_FF: 0,
    viseme_TH: 0,
    viseme_PP: 0,
    viseme_L: 0,
  };

  if (targets[mapped] !== undefined) {
    targets[mapped] = 0.75 * safeIntensity;
  }

  if (mapped === 'viseme_FF') {
    targets.jawOpen = 0.08;
  }

  return targets;
}
