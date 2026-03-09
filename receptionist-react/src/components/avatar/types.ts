import { MorphChannelMap } from '../Avatar3D/facial-types';

export type AvatarEngineState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface AvatarMouthCue {
  start: number;
  end: number;
  value: string;
}

export interface AvatarSpeechPackage {
  text: string;
  audioUrl: string;
  mouthCues: AvatarMouthCue[];
  expression: string;
  animation: string;
  provider: string;
  durationMs: number;
  cacheHit: boolean;
  diagnostics?: Record<string, string>;
}

export interface LipSyncFrame {
  morphTargets: MorphChannelMap;
  activeCue: string;
}
