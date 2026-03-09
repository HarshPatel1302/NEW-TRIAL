import { MorphChannelMap } from '../Avatar3D/facial-types';
import { rhubarbCueToMorphTargets } from '../../config/rhubarbVisemeMap';
import { AvatarMouthCue, LipSyncFrame } from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth(current: number, target: number, deltaSeconds: number): number {
  const attack = 14;
  const decay = 8;
  const speed = target > current ? attack : decay;
  return current + (target - current) * (1 - Math.exp(-speed * Math.max(0.001, deltaSeconds)));
}

export class LipSyncPlayer {
  private cues: AvatarMouthCue[] = [];
  private smoothedTargets: MorphChannelMap = {};

  setMouthCues(cues: AvatarMouthCue[]): void {
    this.cues = [...(cues || [])].sort((a, b) => a.start - b.start);
    this.smoothedTargets = {};
  }

  reset(): void {
    this.cues = [];
    this.smoothedTargets = {};
  }

  sample(timeSeconds: number, deltaSeconds: number): LipSyncFrame {
    const activeCue = this.findCueAtTime(timeSeconds);
    const target = activeCue
      ? rhubarbCueToMorphTargets(activeCue.value, 1)
      : rhubarbCueToMorphTargets('X', 1);

    const mergedKeys = new Set<string>([
      ...Object.keys(this.smoothedTargets),
      ...Object.keys(target),
    ]);

    const next: MorphChannelMap = {};
    mergedKeys.forEach((key) => {
      const currentValue = this.smoothedTargets[key] || 0;
      const targetValue = target[key] || 0;
      next[key] = clamp01(smooth(currentValue, targetValue, deltaSeconds));
    });

    this.smoothedTargets = next;
    return {
      morphTargets: next,
      activeCue: activeCue?.value || 'X',
    };
  }

  private findCueAtTime(timeSeconds: number): AvatarMouthCue | null {
    for (const cue of this.cues) {
      if (timeSeconds >= cue.start && timeSeconds < cue.end) {
        return cue;
      }
    }
    return null;
  }
}
