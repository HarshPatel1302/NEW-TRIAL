import React from 'react';

import { LipSyncData } from '../../../lib/audio-streamer';
import { AvatarModelRef } from '../../Avatar3D/AvatarModelUnified';
import { ExpressionCue, MorphChannelMap } from '../../Avatar3D/facial-types';

export interface AvatarRenderAdapterProps {
  avatarRef: React.RefObject<AvatarModelRef>;
  expressionCue: ExpressionCue;
  isAudioPlaying: boolean;
  lipSyncRef: React.MutableRefObject<LipSyncData>;
  externalMorphTargets?: MorphChannelMap | null;
}

export abstract class BaseAvatarRenderAdapter {
  abstract readonly name: string;
  abstract readonly isRealtime: boolean;

  abstract render(props: AvatarRenderAdapterProps): React.ReactNode;
}
