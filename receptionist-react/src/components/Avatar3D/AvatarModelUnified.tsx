import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
const HEAD_YAW_LIMIT = 0.72;
const HEAD_PITCH_DOWN_LIMIT = -0.34;
const HEAD_PITCH_UP_LIMIT = 0.0009;
const HEAD_TRACK_HEIGHT = 1.62;
const HEAD_PITCH_BIAS = -0.14;
const MIN_ACTION_SPEED = 0.3;
const MAX_ACTION_SPEED = 0.6;
const IDLE_CLIP_NAME = 'idle';
const MODEL_POSITION: [number, number, number] = [0, -1.85, 0];
const BASE_MODEL_SCALE = 1.75;
const MIN_RESPONSIVE_SCALE = 0.85;
const MAX_RESPONSIVE_SCALE = 1.2;

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
    const { size } = useThree();
    const { scene, animations } = useGLTF(modelPath);
    const { actions, mixer } = useAnimations(animations, group);

    const currentActionRef = useRef<THREE.AnimationAction | null>(null);
    const animationDurationsRef = useRef<Record<string, number>>({});
    const facialControllerRef = useRef<FacialController>(new FacialController());
    const headBaseRotationRef = useRef<THREE.Euler>(new THREE.Euler());
    const headBaseCapturedRef = useRef(false);
    const worldCameraPosRef = useRef(new THREE.Vector3());
    const worldAvatarPosRef = useRef(new THREE.Vector3());

    const [headBone, setHeadBone] = useState<THREE.Bone | null>(null);
    const [allMeshesWithMorphs, setAllMeshesWithMorphs] = useState<THREE.Mesh[]>([]);
    const responsiveScaleFactor = THREE.MathUtils.clamp(
        size.width / 1200,
        MIN_RESPONSIVE_SCALE,
        MAX_RESPONSIVE_SCALE,
    );
    const resolvedModelScale = BASE_MODEL_SCALE * responsiveScaleFactor;

    useEffect(() => {
        const meshes: THREE.Mesh[] = [];
        let foundHead: THREE.Bone | null = null;
        let foundNeck: THREE.Bone | null = null;

        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.morphTargetDictionary) {
                meshes.push(obj as THREE.Mesh);
            }

            if (obj.isBone) {
                const lower = obj.name.toLowerCase();
                if (!foundHead && lower.includes('head')) {
                    foundHead = obj as THREE.Bone;
                } else if (!foundNeck && lower.includes('neck')) {
                    foundNeck = obj as THREE.Bone;
                }
            }
        });

        const durations: Record<string, number> = {};
        animations.forEach((clip) => {
            durations[clip.name] = clip.duration;
        });
        animationDurationsRef.current = durations;

        setAllMeshesWithMorphs(meshes);
        const trackingBone = (foundHead ?? foundNeck) as THREE.Bone | null;
        setHeadBone(trackingBone);
        if (trackingBone !== null) {
            headBaseRotationRef.current.copy(trackingBone.rotation);
            headBaseCapturedRef.current = true;
        }

        // Default to idle if available, otherwise first clip.
        const idleAction = actions.idle || actions[Object.keys(actions)[0]];
        if (idleAction) {
            idleAction.reset().play();
            if (idleAction.getClip().name === IDLE_CLIP_NAME) {
                // Freeze idle on the first frame to avoid constant breathing motion.
                idleAction.time = 0;
                idleAction.setEffectiveTimeScale(0);
            }
            currentActionRef.current = idleAction;
        }
    }, [scene, animations, actions]);

    useEffect(() => {
        // Reset state when switching model variants.
        facialControllerRef.current.reset();
        headBaseCapturedRef.current = false;
    }, [modelPath]);

    const playAction = (name: string, options?: { loop?: boolean; duration?: number }) => {
        if (!actions[name] || !mixer) {
            console.warn(`Animation "${name}" not found. Available:`, Object.keys(actions));
            return;
        }

        const next = actions[name]!;
        const prev = currentActionRef.current;
        const isLoop = options?.loop !== false;
        const clipDuration = animationDurationsRef.current[name];

        next.reset();
        next.stopFading();
        next.stopWarping();
        next.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, isLoop ? Infinity : 1);
        next.clampWhenFinished = !isLoop;

        if (!isLoop && options?.duration && clipDuration && clipDuration > 0) {
            const speed = THREE.MathUtils.clamp(
                clipDuration / options.duration,
                MIN_ACTION_SPEED,
                MAX_ACTION_SPEED,
            );
            next.setEffectiveTimeScale(speed);
        } else {
            next.setEffectiveTimeScale(name === IDLE_CLIP_NAME ? 0 : 1);
            if (name === IDLE_CLIP_NAME) {
                // Keep the avatar in a static standing pose whenever returning to idle.
                next.time = 0;
            }
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
        setSpeechBubble: () => { },
        clearSpeechBubble: () => { },
    }));

    useFrame((state, delta) => {
        if (mixer) {
            mixer.update(delta);
        }

        // Head tracking for eye-contact behavior.
        if (headBone && group.current) {
            if (!headBaseCapturedRef.current) {
                headBaseRotationRef.current.copy(headBone.rotation);
                headBaseCapturedRef.current = true;
            }

            const camera = state.camera.getWorldPosition(worldCameraPosRef.current);
            const avatarPos = group.current.getWorldPosition(worldAvatarPosRef.current);

            const xDiff = camera.x - avatarPos.x;
            const zDiff = camera.z - avatarPos.z;
            const yDiff = camera.y - (avatarPos.y + HEAD_TRACK_HEIGHT);

            const yaw = THREE.MathUtils.clamp(Math.atan2(xDiff, zDiff), -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT);
            const horizontalDistance = Math.max(0.001, Math.sqrt(xDiff ** 2 + zDiff ** 2));
            const pitch = THREE.MathUtils.clamp(
                Math.atan2(yDiff, horizontalDistance) + HEAD_PITCH_BIAS,
                HEAD_PITCH_DOWN_LIMIT,
                HEAD_PITCH_UP_LIMIT,
            );

            const base = headBaseRotationRef.current;
            const targetX = base.x + pitch;
            const targetY = base.y + yaw;

            headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, targetY, 0.1);
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetX, 0.1);
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
        <group
            ref={group}
            position={MODEL_POSITION}
            scale={[resolvedModelScale, resolvedModelScale, resolvedModelScale]}
        >
            <primitive object={scene} />
        </group>
    );
});

AvatarModelUnified.displayName = 'AvatarModelUnified';
