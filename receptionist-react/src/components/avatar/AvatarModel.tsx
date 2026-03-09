import React from 'react';

import { LipSyncData } from '../../lib/audio-streamer';
import { AvatarModelUnified, AvatarModelRef } from '../Avatar3D/AvatarModelUnified';
import { ExpressionCue, MorphChannelMap } from '../Avatar3D/facial-types';

interface AvatarModelProps {
  expressionCue: ExpressionCue;
  isAudioPlaying: boolean;
  lipSyncRef: React.MutableRefObject<LipSyncData>;
  externalMorphTargets?: MorphChannelMap | null;
}

const AvatarModel = React.forwardRef<AvatarModelRef, AvatarModelProps>(
  ({ expressionCue, isAudioPlaying, lipSyncRef, externalMorphTargets }, ref) => {
    return (
      <AvatarModelUnified
        ref={ref}
        expressionCue={expressionCue}
        isAudioPlaying={isAudioPlaying}
        lipSyncRef={lipSyncRef}
        externalMorphTargets={externalMorphTargets}
      />
    );
  }
);

AvatarModel.displayName = 'AvatarModel';

export default AvatarModel;
