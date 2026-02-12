import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { AvatarModelUnified as AvatarModel, AvatarModelRef } from './AvatarModelUnified';
import { LoadingScreen } from './LoadingScreen';
import { LipSyncData } from '../../lib/audio-streamer';
import { ExpressionCue } from './facial-types';
import './Avatar3D.css';

export interface Avatar3DRef {
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => void;
    getAnimationDuration: (name: string) => number | null;
    setSpeechBubble: (text: string) => void;
    clearSpeechBubble: () => void;
}

interface Avatar3DProps {
    speechText?: string;
    expressionCue?: ExpressionCue;
    connected?: boolean;
    isAudioPlaying?: boolean;
    lipSyncRef?: React.MutableRefObject<LipSyncData>;
}

export const Avatar3D = React.forwardRef<Avatar3DRef, Avatar3DProps>((props, ref) => {
    const { speechText, expressionCue, isAudioPlaying, lipSyncRef } = props;
    const avatarRef = useRef<AvatarModelRef>(null);

    // Expose the avatar methods to parent
    React.useImperativeHandle(ref, () => ({
        playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => {
            avatarRef.current?.playAnimation(name, options);
        },
        getAnimationDuration: (name: string) => {
            return avatarRef.current?.getAnimationDuration(name) ?? null;
        },
        setSpeechBubble: (text: string) => {
            avatarRef.current?.setSpeechBubble(text);
        },
        clearSpeechBubble: () => {
            avatarRef.current?.clearSpeechBubble();
        }
    }));

    return (
        <div className="avatar-container">
            {/* Loading screen renders OUTSIDE Canvas (HTML/CSS overlay) */}
            <LoadingScreen />

            <Canvas
                camera={{
                    // Pull camera back to avoid shoulder/head clipping on narrow screens.
                    position: [0, 1.5, 4],
                    fov: 40,
                    near: 0.1,
                    far: 100
                }}
                gl={{
                    antialias: true,
                    alpha: true
                }}
            >
                <color attach="background" args={['#1a237e']} />

                {/* Industry-standard lighting for PBR materials */}
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
                <directionalLight position={[-5, 5, -5]} intensity={0.5} />

                {/* HDR environment for realistic reflections */}
                <Environment preset="city" />

                {/* Suspense fallback must be null or a THREE.js object */}
                <Suspense fallback={null}>
                    <AvatarModel
                        ref={avatarRef}
                        speechText={speechText}
                        expressionCue={expressionCue}
                        isAudioPlaying={isAudioPlaying}
                        lipSyncRef={lipSyncRef}
                    />
                </Suspense>
            </Canvas>
        </div>
    );
});

Avatar3D.displayName = 'Avatar3D';

export default Avatar3D;
