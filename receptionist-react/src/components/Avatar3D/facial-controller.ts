import { FACIAL_PRESETS, FACIAL_SOLVER_CONFIG } from '../../config/facialPresets';
import {
  FacialSignalFrame,
  MorphChannelMap,
  MorphDictionary,
} from './facial-types';

const CLAMP_MIN = 0;
const CLAMP_MAX = 1;

type RandomFn = () => number;

export const MORPH_ALIAS_MAP: Record<string, string[]> = {
  eyeBlinkLeft: ['eyeBlinkLeft', 'eyesClosed'],
  eyeBlinkRight: ['eyeBlinkRight', 'eyesClosed'],
  jawOpen: ['jawOpen', 'mouthOpen'],
  viseme_aa: ['viseme_aa', 'viseme_AA'],
  viseme_E: ['viseme_E'],
  viseme_O: ['viseme_O'],
  viseme_U: ['viseme_U'],
  viseme_FF: ['viseme_FF', 'viseme_FV'],
  viseme_TH: ['viseme_TH'],
  viseme_PP: ['viseme_PP', 'viseme_MBP'],
  viseme_sil: ['viseme_sil'],
  mouthSmileLeft: ['mouthSmileLeft', 'mouthSmile'],
  mouthSmileRight: ['mouthSmileRight', 'mouthSmile'],
  browInnerUp: ['browInnerUp'],
  browDownLeft: ['browDownLeft'],
  browDownRight: ['browDownRight'],
  cheekSquintLeft: ['cheekSquintLeft'],
  cheekSquintRight: ['cheekSquintRight'],
  eyeWideLeft: ['eyeWideLeft'],
  eyeWideRight: ['eyeWideRight'],
  eyeLookInLeft: ['eyeLookInLeft'],
  eyeLookInRight: ['eyeLookInRight'],
  eyeLookOutLeft: ['eyeLookOutLeft'],
  eyeLookOutRight: ['eyeLookOutRight'],
  eyeLookUpLeft: ['eyeLookUpLeft'],
  eyeLookUpRight: ['eyeLookUpRight'],
  eyeLookDownLeft: ['eyeLookDownLeft'],
  eyeLookDownRight: ['eyeLookDownRight'],
};

const CONTROLLED_CHANNELS = Object.keys(MORPH_ALIAS_MAP);

function clamp01(value: number): number {
  return Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, value));
}

function smoothValue(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}

function randomRange(min: number, max: number, random: RandomFn): number {
  return min + (max - min) * random();
}

export function resolveMorphAlias(
  dictionary: MorphDictionary,
  channelName: string,
): string | null {
  const aliases = MORPH_ALIAS_MAP[channelName] || [channelName];
  for (const alias of aliases) {
    if (dictionary[alias] !== undefined) {
      return alias;
    }
  }
  return null;
}

interface FacialControllerOptions {
  random?: RandomFn;
}

export class FacialController {
  private readonly random: RandomFn;
  private readonly smoothed: MorphChannelMap = {};

  private blinkActive = false;
  private blinkProgress = 0;
  private blinkClock = 0;
  private nextBlinkAt: number;

  private eyeSaccadeClock = 0;
  private nextSaccadeAt: number;
  private eyeSaccadeTargetX = 0;
  private eyeSaccadeTargetY = 0;
  private eyeSaccadeX = 0;
  private eyeSaccadeY = 0;

  private prevVolume = 0;

  constructor(options: FacialControllerOptions = {}) {
    this.random = options.random || Math.random;
    this.nextBlinkAt = randomRange(
      FACIAL_SOLVER_CONFIG.blinkMinInterval,
      FACIAL_SOLVER_CONFIG.blinkMaxInterval,
      this.random,
    );
    this.nextSaccadeAt = randomRange(
      FACIAL_SOLVER_CONFIG.eyeSaccadeMinInterval,
      FACIAL_SOLVER_CONFIG.eyeSaccadeMaxInterval,
      this.random,
    );
  }

  reset(): void {
    Object.keys(this.smoothed).forEach((key) => {
      this.smoothed[key] = 0;
    });
    this.blinkActive = false;
    this.blinkProgress = 0;
    this.blinkClock = 0;
    this.eyeSaccadeClock = 0;
    this.eyeSaccadeTargetX = 0;
    this.eyeSaccadeTargetY = 0;
    this.eyeSaccadeX = 0;
    this.eyeSaccadeY = 0;
    this.prevVolume = 0;
  }

  solve(frame: FacialSignalFrame): MorphChannelMap {
    const targets: MorphChannelMap = {
      ...FACIAL_PRESETS[frame.expressionCue],
    };

    this.updateBlink(frame.delta, targets);
    this.updateEyeSaccades(frame.delta, targets);

    const lip = frame.lipSync;
    const hasLipSignal = !!lip;

    if (hasLipSignal && lip) {
      const voiced = clamp01(lip.voiced || lip.volume);
      const envelope = clamp01(lip.envelope || lip.volume);
      const low = clamp01(lip.lowBand);
      const mid = clamp01(lip.midBand);
      const high = clamp01(lip.highBand);
      const plosive = clamp01(lip.plosive);
      const sibilance = clamp01(lip.sibilance);

      const jawTarget = clamp01(low * 0.5 + envelope * 0.35 + voiced * 0.2) * FACIAL_SOLVER_CONFIG.maxJaw;
      const aaTarget = clamp01(mid * 0.45 + low * 0.22 + envelope * 0.15) * FACIAL_SOLVER_CONFIG.maxViseme;
      const oTarget = clamp01(low * 0.45 + mid * 0.2 + envelope * 0.12) * FACIAL_SOLVER_CONFIG.maxViseme;
      const eTarget = clamp01(mid * 0.38 + high * 0.2 + envelope * 0.08) * FACIAL_SOLVER_CONFIG.maxViseme;
      const uTarget = clamp01(low * 0.32 + high * 0.1 + envelope * 0.06) * FACIAL_SOLVER_CONFIG.maxViseme * 0.9;
      const ffTarget = clamp01(sibilance * 0.5 + high * 0.45) * FACIAL_SOLVER_CONFIG.maxViseme * 0.8;
      const thTarget = clamp01(sibilance * 0.35 + high * 0.2 + envelope * 0.1) * FACIAL_SOLVER_CONFIG.maxViseme * 0.75;

      const volDrop = Math.max(0, this.prevVolume - lip.volume);
      const ppTarget = clamp01(plosive * 0.85 + volDrop * 2.4) * FACIAL_SOLVER_CONFIG.maxViseme;
      const silTarget = clamp01(1 - envelope * 1.45) * 0.55;

      targets.jawOpen = jawTarget;
      targets.viseme_aa = aaTarget;
      targets.viseme_O = oTarget;
      targets.viseme_E = eTarget;
      targets.viseme_U = uTarget;
      targets.viseme_FF = ffTarget;
      targets.viseme_TH = thTarget;
      targets.viseme_PP = ppTarget;
      targets.viseme_sil = silTarget;

      targets.mouthSmileLeft = Math.max(targets.mouthSmileLeft || 0, 0.09);
      targets.mouthSmileRight = Math.max(targets.mouthSmileRight || 0, 0.09);

      targets.browInnerUp = Math.max(
        targets.browInnerUp || 0,
        volumeToBrowRaise(lip.volume),
      );

      this.prevVolume = lip.volume;
    } else {
      targets.viseme_sil = Math.max(targets.viseme_sil || 0, frame.isAudioPlaying ? 0.2 : 0.45);
      this.prevVolume = smoothValue(this.prevVolume, 0, FACIAL_SOLVER_CONFIG.decaySpeed, frame.delta);
    }

    const solved: MorphChannelMap = {};
    for (const channel of CONTROLLED_CHANNELS) {
      const target = clamp01(targets[channel] || 0);
      const current = this.smoothed[channel] || 0;
      const speed = target > current
        ? FACIAL_SOLVER_CONFIG.attackSpeed
        : FACIAL_SOLVER_CONFIG.decaySpeed;
      const next = clamp01(smoothValue(current, target, speed, frame.delta));
      this.smoothed[channel] = next;
      solved[channel] = next;
    }

    return solved;
  }

  mapToDictionary(
    dictionary: MorphDictionary,
    canonicalChannels: MorphChannelMap,
  ): MorphChannelMap {
    const mapped: MorphChannelMap = {};
    for (const [channel, value] of Object.entries(canonicalChannels)) {
      const alias = resolveMorphAlias(dictionary, channel);
      if (alias) {
        mapped[alias] = value;
      }
    }
    return mapped;
  }

  private updateBlink(delta: number, targets: MorphChannelMap): void {
    this.blinkClock += delta;

    if (!this.blinkActive && this.blinkClock >= this.nextBlinkAt) {
      this.blinkActive = true;
      this.blinkProgress = 0;
    }

    let blinkAmount = 0;
    if (this.blinkActive) {
      this.blinkProgress += delta / FACIAL_SOLVER_CONFIG.blinkDuration;
      if (this.blinkProgress >= 1) {
        this.blinkActive = false;
        this.blinkProgress = 0;
        this.blinkClock = 0;
        this.nextBlinkAt = randomRange(
          FACIAL_SOLVER_CONFIG.blinkMinInterval,
          FACIAL_SOLVER_CONFIG.blinkMaxInterval,
          this.random,
        );
      } else {
        blinkAmount = Math.sin(this.blinkProgress * Math.PI);
      }
    }

    targets.eyeBlinkLeft = Math.max(targets.eyeBlinkLeft || 0, blinkAmount);
    targets.eyeBlinkRight = Math.max(targets.eyeBlinkRight || 0, blinkAmount);
  }

  private updateEyeSaccades(delta: number, targets: MorphChannelMap): void {
    this.eyeSaccadeClock += delta;

    if (this.eyeSaccadeClock >= this.nextSaccadeAt) {
      this.eyeSaccadeClock = 0;
      this.nextSaccadeAt = randomRange(
        FACIAL_SOLVER_CONFIG.eyeSaccadeMinInterval,
        FACIAL_SOLVER_CONFIG.eyeSaccadeMaxInterval,
        this.random,
      );
      this.eyeSaccadeTargetX =
        (this.random() * 2 - 1) * FACIAL_SOLVER_CONFIG.eyeSaccadeMaxAmount;
      this.eyeSaccadeTargetY =
        (this.random() * 2 - 1) * FACIAL_SOLVER_CONFIG.eyeSaccadeMaxAmount * 0.7;
    }

    this.eyeSaccadeX = smoothValue(this.eyeSaccadeX, this.eyeSaccadeTargetX, 8, delta);
    this.eyeSaccadeY = smoothValue(this.eyeSaccadeY, this.eyeSaccadeTargetY, 8, delta);

    const x = this.eyeSaccadeX;
    const y = this.eyeSaccadeY;

    targets.eyeLookOutLeft = x < 0 ? Math.abs(x) : 0;
    targets.eyeLookOutRight = x > 0 ? x : 0;
    targets.eyeLookInLeft = x > 0 ? x : 0;
    targets.eyeLookInRight = x < 0 ? Math.abs(x) : 0;

    targets.eyeLookUpLeft = y > 0 ? y : 0;
    targets.eyeLookUpRight = y > 0 ? y : 0;
    targets.eyeLookDownLeft = y < 0 ? Math.abs(y) : 0;
    targets.eyeLookDownRight = y < 0 ? Math.abs(y) : 0;
  }
}

function volumeToBrowRaise(volume: number): number {
  if (volume <= 0.25) return 0;
  return clamp01((volume - 0.25) * 0.35);
}
