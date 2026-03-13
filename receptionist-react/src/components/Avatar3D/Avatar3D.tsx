import React, { Suspense, useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
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
    const [contextLost, setContextLost] = useState(false);

    const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
        const canvas = gl.domElement;
        canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('[Avatar3D] WebGL context lost — pausing render');
            setContextLost(true);
        });
        canvas.addEventListener('webglcontextrestored', () => {
            console.log('[Avatar3D] WebGL context restored');
            setContextLost(false);
        });
    }, []);

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
            <LoadingScreen />

            <Canvas
                camera={{
                    position: [0, 1.5, 4],
                    fov: 40,
                    near: 0.1,
                    far: 100
                }}
                dpr={[1, 1.5]}
                gl={{
                    antialias: true,
                    alpha: true,
                    powerPreference: 'default',
                    failIfMajorPerformanceCaveat: false,
                }}
                frameloop={contextLost ? 'never' : 'always'}
                onCreated={handleCreated as any}
            >
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
                <directionalLight position={[-5, 5, -5]} intensity={0.5} />

                <Environment preset="city" />

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
