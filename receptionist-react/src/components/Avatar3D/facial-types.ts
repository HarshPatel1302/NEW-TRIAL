import { LipSyncData } from '../../lib/audio-streamer';

export type ExpressionCue =
  | 'neutral_professional'
  | 'welcome_warm'
  | 'listening_attentive'
  | 'explaining_confident'
  | 'confirming_yes'
  | 'empathy_soft'
  | 'goodbye_formal';

export type MorphChannelMap = Record<string, number>;
export type MorphDictionary = Record<string, number>;

export interface FacialSignalFrame {
  delta: number;
  time: number;
  isAudioPlaying: boolean;
  expressionCue: ExpressionCue;
  lipSync: LipSyncData | null;
}
