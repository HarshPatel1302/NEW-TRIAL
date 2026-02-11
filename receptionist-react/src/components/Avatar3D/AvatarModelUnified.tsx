import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { LipSyncData } from '../../lib/audio-streamer';
import { ExpressionCue } from './facial-types';
import { FacialController } from './facial-controller';

export interface AvatarModelRef {
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => void;
    getAnimationDuration: (name: string) => number | null;
    setSpeechBubble: (text: string) => void;
    clearSpeechBubble: () => void;
}

type AvatarModelVersion = 'v1' | 'v2';

interface AvatarModelProps {
    speechText?: string;
    expressionCue?: ExpressionCue;
    isAudioPlaying?: boolean;
    lipSyncRef?: React.MutableRefObject<LipSyncData>;
    modelVersion?: AvatarModelVersion;
}

const MODEL_PATHS: Record<AvatarModelVersion, string> = {
    v1: '/models/receptionist/receptionist_all_6_actions.glb',
    v2: '/models/receptionist/receptionist_all_6_actions_v2.glb',
};

const DEFAULT_MODEL_VERSION: AvatarModelVersion =
    process.env.REACT_APP_AVATAR_MODEL_VERSION === 'v2' ? 'v2' : 'v1';

const CROSSFADE_DURATION = 0.5;
const AUDIO_STALE_MS = 250;

// Preload the default model for faster initial render.
useGLTF.preload(MODEL_PATHS[DEFAULT_MODEL_VERSION]);

export const AvatarModelUnified = React.forwardRef<AvatarModelRef, AvatarModelProps>((props, ref) => {
    const {
        expressionCue = 'neutral_professional',
        isAudioPlaying = false,
        lipSyncRef,
        modelVersion,
    } = props;

    const resolvedVersion = modelVersion || DEFAULT_MODEL_VERSION;
    const modelPath = MODEL_PATHS[resolvedVersion];

    const group = useRef<THREE.Group>(null);
    const { scene, animations } = useGLTF(modelPath);
    const { actions, mixer } = useAnimations(animations, group);

    const currentActionRef = useRef<THREE.AnimationAction | null>(null);
    const animationDurationsRef = useRef<Record<string, number>>({});
    const facialControllerRef = useRef<FacialController>(new FacialController());

    const [headBone, setHeadBone] = useState<THREE.Bone | null>(null);
    const [allMeshesWithMorphs, setAllMeshesWithMorphs] = useState<THREE.Mesh[]>([]);

    useEffect(() => {
        const meshes: THREE.Mesh[] = [];
        let foundHead: THREE.Bone | null = null;

        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.morphTargetDictionary) {
                meshes.push(obj as THREE.Mesh);
            }

            if (
                obj.isBone &&
                !foundHead &&
                (obj.name.toLowerCase().includes('head') || obj.name.toLowerCase().includes('neck'))
            ) {
                foundHead = obj as THREE.Bone;
            }
        });

        const durations: Record<string, number> = {};
        animations.forEach((clip) => {
            durations[clip.name] = clip.duration;
        });
        animationDurationsRef.current = durations;

        setAllMeshesWithMorphs(meshes);
        setHeadBone(foundHead);

        // Default to idle if available, otherwise first clip.
        const idleAction = actions.idle || actions[Object.keys(actions)[0]];
        if (idleAction) {
            idleAction.reset().play();
            currentActionRef.current = idleAction;
        }
    }, [scene, animations, actions]);

    useEffect(() => {
        // Reset state when switching model variants.
        facialControllerRef.current.reset();
    }, [modelPath]);

    const playAction = (name: string, options?: { loop?: boolean; duration?: number }) => {
        if (!actions[name] || !mixer) {
            console.warn(`Animation "${name}" not found. Available:`, Object.keys(actions));
            return;
        }

        const next = actions[name]!;
        const prev = currentActionRef.current;
        const isLoop = options?.loop !== false;

        next.reset();
        next.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        if (!isLoop) {
            next.clampWhenFinished = true;
        }
        next.play();

        if (prev && prev !== next) {
            prev.crossFadeTo(next, CROSSFADE_DURATION, true);
        }

        currentActionRef.current = next;
    };

    React.useImperativeHandle(ref, () => ({
        playAnimation: playAction,
        getAnimationDuration: (name: string) => animationDurationsRef.current[name] ?? null,
        // Speech bubble UI has been removed; retain no-op methods for API compatibility.
        setSpeechBubble: () => {},
        clearSpeechBubble: () => {},
    }));

    useFrame((state, delta) => {
        if (mixer) {
            mixer.update(delta);
        }

        // Head tracking for eye-contact behavior.
        if (headBone && group.current) {
            const camera = state.camera.position;
            const avatarPos = group.current.position;

            const xDiff = camera.x - avatarPos.x;
            const zDiff = camera.z - avatarPos.z;
            let angleY = Math.atan2(xDiff, zDiff);
            angleY = Math.max(-1.0, Math.min(1.0, angleY));

            headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, angleY, 0.1);

            const yDiff = camera.y - avatarPos.y - 1.5;
            let angleX = Math.atan2(yDiff, Math.sqrt(xDiff ** 2 + zDiff ** 2));
            angleX = Math.max(-0.5, Math.min(0.5, angleX));
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, angleX, 0.1);
        }

        const lipData = lipSyncRef?.current;
        const audioFresh = !!lipData && (performance.now() - lipData.timestamp) < AUDIO_STALE_MS;
        const lipSyncSignal = audioFresh && lipData ? lipData : null;

        const solvedChannels = facialControllerRef.current.solve({
            delta,
            time: state.clock.getElapsedTime(),
            isAudioPlaying,
            expressionCue,
            lipSync: lipSyncSignal,
        });

        allMeshesWithMorphs.forEach((mesh) => {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

            const mapped = facialControllerRef.current.mapToDictionary(
                mesh.morphTargetDictionary as Record<string, number>,
                solvedChannels,
            );

            Object.entries(mapped).forEach(([targetName, value]) => {
                const idx = mesh.morphTargetDictionary![targetName];
                if (idx !== undefined) {
                    mesh.morphTargetInfluences![idx] = value;
                }
            });
        });
    });

    return (
        <group ref={group} position={[0, -1.5, 0]} scale={[1.8, 1.8, 1.8]}>
            <primitive object={scene} />
        </group>
    );
});

AvatarModelUnified.displayName = 'AvatarModelUnified';
