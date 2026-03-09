import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';

import { LipSyncData } from '../../lib/audio-streamer';
import { LoadingScreen } from '../Avatar3D/LoadingScreen';
import { AvatarModelRef } from '../Avatar3D/AvatarModelUnified';
import { ExpressionCue, MorphChannelMap } from '../Avatar3D/facial-types';
import AvatarModel from './AvatarModel';

interface AvatarSceneProps {
  avatarRef: React.RefObject<AvatarModelRef>;
  expressionCue: ExpressionCue;
  isAudioPlaying: boolean;
  lipSyncRef: React.MutableRefObject<LipSyncData>;
  externalMorphTargets?: MorphChannelMap | null;
}

export default function AvatarScene({
  avatarRef,
  expressionCue,
  isAudioPlaying,
  lipSyncRef,
  externalMorphTargets,
}: AvatarSceneProps) {
  return (
    <>
      <LoadingScreen />
      <Canvas
        camera={{
          position: [0, 1.48, 3.85],
          fov: 36,
          near: 0.1,
          far: 100,
        }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.62} />
        <directionalLight position={[7, 8, 5]} intensity={1.05} />
        <directionalLight position={[-4, 4, -2]} intensity={0.35} />
        <Environment preset="city" />

        <Suspense fallback={null}>
          <AvatarModel
            ref={avatarRef}
            expressionCue={expressionCue}
            isAudioPlaying={isAudioPlaying}
            lipSyncRef={lipSyncRef}
            externalMorphTargets={externalMorphTargets}
          />
        </Suspense>
      </Canvas>
    </>
  );
}
