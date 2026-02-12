import { ExpressionCue, MorphChannelMap } from '../components/Avatar3D/facial-types';

export interface FacialSolverConfig {
  attackSpeed: number;
  decaySpeed: number;
  maxJaw: number;
  maxViseme: number;
  blinkMinInterval: number;
  blinkMaxInterval: number;
  blinkDuration: number;
  eyeSaccadeMinInterval: number;
  eyeSaccadeMaxInterval: number;
  eyeSaccadeMaxAmount: number;
}

export const FACIAL_SOLVER_CONFIG: FacialSolverConfig = {
  attackSpeed: 16,
  decaySpeed: 7,
  maxJaw: 0.38,
  maxViseme: 0.48,
  blinkMinInterval: 2.8,
  blinkMaxInterval: 5.0,
  blinkDuration: 0.12,
  eyeSaccadeMinInterval: 1.3,
  eyeSaccadeMaxInterval: 2.8,
  eyeSaccadeMaxAmount: 0.08,
};

export const FACIAL_PRESETS: Record<ExpressionCue, MorphChannelMap> = {
  neutral_professional: {
    mouthSmileLeft: 0.1,
    mouthSmileRight: 0.1,
    browInnerUp: 0.01,
  },
  welcome_warm: {
    mouthSmileLeft: 0.24,
    mouthSmileRight: 0.24,
    browInnerUp: 0.08,
    cheekSquintLeft: 0.05,
    cheekSquintRight: 0.05,
  },
  listening_attentive: {
    mouthSmileLeft: 0.12,
    mouthSmileRight: 0.12,
    browInnerUp: 0.1,
    eyeWideLeft: 0.03,
    eyeWideRight: 0.03,
  },
  explaining_confident: {
    mouthSmileLeft: 0.14,
    mouthSmileRight: 0.14,
    browInnerUp: 0.04,
    browDownLeft: 0.03,
    browDownRight: 0.03,
  },
  confirming_yes: {
    mouthSmileLeft: 0.2,
    mouthSmileRight: 0.2,
    browInnerUp: 0.06,
  },
  empathy_soft: {
    mouthSmileLeft: 0.08,
    mouthSmileRight: 0.08,
    browInnerUp: 0.12,
    browDownLeft: 0.02,
    browDownRight: 0.02,
  },
  goodbye_formal: {
    mouthSmileLeft: 0.18,
    mouthSmileRight: 0.18,
    browInnerUp: 0.03,
  },
};
