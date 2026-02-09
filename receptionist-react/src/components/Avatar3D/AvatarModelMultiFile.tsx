import React, { useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

interface AvatarModelProps {
    speechText?: string;
    isAudioPlaying?: boolean;
}

export interface AvatarModelRef {
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => void;
    setSpeechBubble: (text: string) => void;
    clearSpeechBubble: () => void;
}

// Animation files configuration
const ANIMATION_FILES = {
    idle: '/models/receptionist/breathing_with_morphs.glb',
    waving: '/models/receptionist/waving.glb',
    talking: '/models/receptionist/talking.glb',
    pointing: '/models/receptionist/pointing.glb',
    nodYes: '/models/receptionist/nod_yes.glb',
    bow: '/models/receptionist/formal_bow.glb',
};

// Preload all assets immediately (before component mounts)
// This starts downloading resources in parallel for faster perceived load time
Object.values(ANIMATION_FILES).forEach(path => {
    useLoader.preload(GLTFLoader, path);
});

export const AvatarModelMultiFile = forwardRef<AvatarModelRef, AvatarModelProps>((props, ref) => {
    const { speechText: propsSpeechText, isAudioPlaying = false } = props;
    const group = useRef<THREE.Group>(null);

    // Load all GLB files
    const gltfs = useLoader(GLTFLoader, Object.values(ANIMATION_FILES));

    // State
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
    const [actions, setActions] = useState<Record<string, THREE.AnimationAction>>({});
    const [currentAction, setCurrentAction] = useState<THREE.AnimationAction | null>(null);
    const [headMesh, setHeadMesh] = useState<THREE.Mesh | null>(null);
    const [headBone, setHeadBone] = useState<THREE.Bone | null>(null);
    const [morphIndices, setMorphIndices] = useState<Record<string, number>>({});
    const [speechBubbleText, setSpeechBubbleText] = useState<string>('');

    const speechText = propsSpeechText || speechBubbleText;

    // Initialize mixer and actions
    useEffect(() => {
        if (!gltfs || gltfs.length === 0) return;

        const baseGltf = gltfs[0]; // breathing_with_morphs.glb
        const newMixer = new THREE.AnimationMixer(baseGltf.scene);
        setMixer(newMixer);

        // Collect all animation clips
        const clips: Record<string, THREE.AnimationClip> = {};

        // Helper to extract and rename clip
        const pickClip = (gltf: any, newName: string) => {
            const clip = gltf.animations?.[0];
            if (clip) {
                clip.name = newName;
                return clip;
            }
            return null;
        };

        // Add base clip (idle/breathing)
        const idleClip = pickClip(baseGltf, 'idle');
        if (idleClip) clips.idle = idleClip;

        // Add other animations
        const animNames = ['waving', 'talking', 'pointing', 'nodYes', 'bow'];
        animNames.forEach((name, index) => {
            const clip = pickClip(gltfs[index + 1], name);
            if (clip) clips[name] = clip;
        });

        // Create actions
        const newActions: Record<string, THREE.AnimationAction> = {};
        for (const [name, clip] of Object.entries(clips)) {
            const action = newMixer.clipAction(clip);

            if (name === 'idle') {
                action.setLoop(THREE.LoopRepeat, Infinity);
            } else {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
            }

            newActions[name] = action;
        }

        setActions(newActions);

        // Auto-play idle
        if (newActions.idle) {
            newActions.idle.play();
            setCurrentAction(newActions.idle);
        }

        console.log('✓ Animations loaded:', Object.keys(newActions));

        // Find mesh with morph targets AND head bone for tracking
        baseGltf.scene.traverse((obj: any) => {
            if (obj.isMesh && obj.morphTargetDictionary) {
                setHeadMesh(obj);

                // Store morph indices
                const indices: Record<string, number> = {};
                Object.keys(obj.morphTargetDictionary).forEach(key => {
                    indices[key] = obj.morphTargetDictionary[key];
                });
                setMorphIndices(indices);

                console.log('✓ Morph targets found:', Object.keys(obj.morphTargetDictionary));
            }

            // Find head or neck bone for tracking
            if (obj.isBone && (obj.name.toLowerCase().includes('head') || obj.name.toLowerCase().includes('neck'))) {
                setHeadBone(obj);
                console.log('✓ Head bone found:', obj.name);
            }
        });

        // Add base scene to group
        if (group.current) {
            while (group.current.children.length > 0) {
                group.current.remove(group.current.children[0]);
            }
            group.current.add(baseGltf.scene);
        }

        // Handle animation finished events
        const onFinished = (e: any) => {
            if (newActions.idle && currentAction !== newActions.idle) {
                playAction('idle');
            }
        };

        newMixer.addEventListener('finished', onFinished);

        return () => {
            newMixer.removeEventListener('finished', onFinished);
        };

    }, [gltfs, currentAction]); // playAction removed to avoid circular dependency

    // Play animation function
    const playAction = (name: string, options?: { loop?: boolean; duration?: number }) => {
        const next = actions[name];
        if (!next || !mixer) return;

        // Reset and play new action
        next.reset().play();

        // Crossfade from current
        if (currentAction && currentAction !== next) {
            currentAction.crossFadeTo(next, 0.2, false);
        }

        setCurrentAction(next);

        // Handle custom duration for one-shot animations
        if (name !== 'idle' && options?.duration) {
            setTimeout(() => {
                if (actions.idle) {
                    playAction('idle');
                }
            }, options.duration * 1000);
        }
    };

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        playAnimation: (name: string, options = {}) => {
            // Map common names to action names
            const nameMap: Record<string, string> = {
                'wave': 'waving',
                'greeting': 'waving',
                'idle': 'idle',
                'talk': 'talking',
                'nod': 'nodYes',
                'point': 'pointing',
                'bow': 'bow',
            };

            const actionName = nameMap[name.toLowerCase()] || name;
            playAction(actionName, options);
        },
        setSpeechBubble: (text: string) => {
            setSpeechBubbleText(text);
        },
        clearSpeechBubble: () => {
            setSpeechBubbleText('');
        }
    }));

    // Animation loop
    useFrame((state, delta) => {
        // Update mixer
        if (mixer) {
            mixer.update(delta);
        }

        const time = state.clock.getElapsedTime();

        // === HEAD TRACKING (Look at Camera) ===
        if (headBone && group.current) {
            const camera = state.camera.position;
            const avatarPos = group.current.position;

            // Calculate angle to camera (horizontal rotation)
            const xDiff = camera.x - avatarPos.x;
            const zDiff = camera.z - avatarPos.z;
            let angleY = Math.atan2(xDiff, zDiff);

            // Clamp rotation to prevent "Exorcist neck" (-60° to +60°)
            const MAX_TURN = 1.0; // ~60 degrees in radians
            angleY = Math.max(-MAX_TURN, Math.min(MAX_TURN, angleY));

            // Smooth interpolation (lerp) for natural movement
            headBone.rotation.y = THREE.MathUtils.lerp(
                headBone.rotation.y,
                angleY,
                0.1 // 10% per frame = smooth lag effect
            );

            // Optional: Vertical tilt (look up/down)
            const yDiff = camera.y - avatarPos.y - 1.5; // 1.5 = approx head height
            let angleX = Math.atan2(yDiff, Math.sqrt(xDiff ** 2 + zDiff ** 2));
            angleX = Math.max(-0.5, Math.min(0.5, angleX)); // Clamp up/down
            headBone.rotation.x = THREE.MathUtils.lerp(
                headBone.rotation.x,
                angleX,
                0.1
            );
        }

        // === MORPH TARGET ANIMATIONS ===
        if (headMesh && morphIndices) {
            // === AUTOMATIC BLINKING ===
            const blinkCycle = Math.sin(time * 0.5) - 0.85;
            const blinkValue = Math.max(0, Math.min(1, blinkCycle * 6));

            if (morphIndices.eyeBlinkLeft !== undefined) {
                headMesh.morphTargetInfluences![morphIndices.eyeBlinkLeft] = blinkValue;
            }
            if (morphIndices.eyeBlinkRight !== undefined) {
                headMesh.morphTargetInfluences![morphIndices.eyeBlinkRight] = blinkValue;
            }

            // === LIP-SYNC (When audio is playing or has speech text) ===
            if (isAudioPlaying || speechText) {
                // Cycle through visemes (simulated phonemes)
                const phonemeCycle = Math.floor(time * 8) % 4;
                const visemeKeys = ['viseme_AA', 'viseme_O', 'viseme_E', 'viseme_MBP'];

                // Reset all visemes
                visemeKeys.forEach(key => {
                    const idx = morphIndices[key];
                    if (idx !== undefined && headMesh.morphTargetInfluences) {
                        headMesh.morphTargetInfluences[idx] = 0;
                    }
                });

                // Activate current viseme
                const activeKey = visemeKeys[phonemeCycle];
                const activeIdx = morphIndices[activeKey];
                if (activeIdx !== undefined && headMesh.morphTargetInfluences) {
                    const intensity = 0.6 + Math.sin(time * 10) * 0.2;
                    headMesh.morphTargetInfluences[activeIdx] = Math.abs(intensity);
                }

                // Open jaw
                if (morphIndices.jawOpen !== undefined && headMesh.morphTargetInfluences) {
                    const jawVariation = 0.3 + Math.sin(time * 7) * 0.2;
                    headMesh.morphTargetInfluences[morphIndices.jawOpen] = Math.max(0, jawVariation);
                }

                // Slight smile when talking
                if (morphIndices.mouthSmileLeft !== undefined && headMesh.morphTargetInfluences) {
                    headMesh.morphTargetInfluences[morphIndices.mouthSmileLeft] = 0.15;
                }
                if (morphIndices.mouthSmileRight !== undefined && headMesh.morphTargetInfluences) {
                    headMesh.morphTargetInfluences[morphIndices.mouthSmileRight] = 0.15;
                }
            } else {
                // === IDLE: Reset to neutral ===
                if (morphIndices.jawOpen !== undefined && headMesh.morphTargetInfluences) {
                    headMesh.morphTargetInfluences[morphIndices.jawOpen] *= 0.95; // Smooth close
                }

                // Friendly resting smile
                const restingSmile = 0.12 + Math.sin(time * 0.3) * 0.03;
                if (morphIndices.mouthSmileLeft !== undefined && headMesh.morphTargetInfluences) {
                    headMesh.morphTargetInfluences[morphIndices.mouthSmileLeft] = restingSmile;
                }
                if (morphIndices.mouthSmileRight !== undefined && headMesh.morphTargetInfluences) {
                    headMesh.morphTargetInfluences[morphIndices.mouthSmileRight] = restingSmile;
                }
            }
        }
    });

    if (!gltfs || gltfs.length === 0) {
        return null; // Loading
    }

    return (
        <group ref={group} position={[0, -1.5, 0]} scale={[1.8, 1.8, 1.8]}>
            {/* Speech bubble */}
            {speechText && (
                <Html
                    position={[0, 0.6, 0]}
                    center
                    distanceFactor={6}
                    zIndexRange={[100, 0]}
                >
                    <div style={{
                        background: 'white',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        minWidth: '100px',
                        maxWidth: '250px',
                        position: 'relative'
                    }}>
                        <div style={{
                            color: '#333',
                            fontSize: '14px',
                            fontWeight: 600,
                            textAlign: 'center'
                        }}>
                            {speechText}
                        </div>
                        {/* Speech bubble arrow */}
                        <div style={{
                            position: 'absolute',
                            bottom: '-8px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '8px solid transparent',
                            borderRight: '8px solid transparent',
                            borderTop: '8px solid white'
                        }} />
                    </div>
                </Html>
            )}
        </group>
    );
});

AvatarModelMultiFile.displayName = 'AvatarModelMultiFile';
