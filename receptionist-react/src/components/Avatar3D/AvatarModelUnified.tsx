import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import * as THREE from 'three';

export interface AvatarModelRef {
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => void;
    setSpeechBubble: (text: string) => void;
    clearSpeechBubble: () => void;
}

interface AvatarModelProps {
    speechText?: string;
    isAudioPlaying?: boolean;
}

const UNIFIED_MODEL = '/models/receptionist/receptionist_all_6_actions.glb';

// Preload the unified file
useGLTF.preload(UNIFIED_MODEL);

export const AvatarModelUnified = React.forwardRef<AvatarModelRef, AvatarModelProps>((props, ref) => {
    const { speechText: propsSpeechText, isAudioPlaying = false } = props;
    const group = useRef<THREE.Group>(null);

    // Load the unified GLB file
    const { scene, animations } = useGLTF(UNIFIED_MODEL);
    const { actions, mixer } = useAnimations(animations, group);

    const [currentAction, setCurrentAction] = useState<THREE.AnimationAction | null>(null);
    const [headBone, setHeadBone] = useState<THREE.Bone | null>(null);
    const [allMeshesWithMorphs, setAllMeshesWithMorphs] = useState<THREE.Mesh[]>([]);
    const [speechBubbleText, setSpeechBubbleText] = useState<string>('');

    // Find all meshes with morph targets and the head bone
    useEffect(() => {
        const meshes: THREE.Mesh[] = [];
        let foundHead: THREE.Bone | null = null;

        scene.traverse((obj: any) => {
            // Find ALL meshes with morph targets (not just the first one)
            if (obj.isMesh && obj.morphTargetDictionary) {
                meshes.push(obj);
                console.log('✓ Found mesh with morphs:', obj.name, 'Morphs:', Object.keys(obj.morphTargetDictionary));
            }

            // Find head or neck bone for tracking
            if (obj.isBone && !foundHead) {
                if (obj.name.toLowerCase().includes('head') || obj.name.toLowerCase().includes('neck')) {
                    foundHead = obj;
                    console.log('✓ Head bone found:', obj.name);
                }
            }
        });

        setAllMeshesWithMorphs(meshes);
        setHeadBone(foundHead);

        console.log('✓ Animations loaded:', animations.map(a => a.name));
        console.log('✓ Total meshes with morphs:', meshes.length);

        // Play idle animation by default
        if (actions && Object.keys(actions).length > 0) {
            const idleAction = actions[Object.keys(actions)[0]];
            if (idleAction) {
                idleAction.play();
                setCurrentAction(idleAction);
            }
        }
    }, [scene, animations, actions]);

    // Play animation function
    const playAction = (name: string, options?: { loop?: boolean; duration?: number }) => {
        if (!actions[name] || !mixer) {
            console.warn(`Animation "${name}" not found. Available:`, Object.keys(actions));
            return;
        }

        const next = actions[name];

        // Reset and play new action
        next.reset().play();
        next.setLoop(options?.loop !== false ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);

        // Crossfade from current
        if (currentAction && currentAction !== next) {
            currentAction.crossFadeTo(next, 0.3, false);
        }

        setCurrentAction(next);
    };

    // Expose methods to parent
    React.useImperativeHandle(ref, () => ({
        playAnimation: playAction,
        setSpeechBubble: (text: string) => setSpeechBubbleText(text),
        clearSpeechBubble: () => setSpeechBubbleText('')
    }));

    // Update speech bubble from props
    useEffect(() => {
        if (propsSpeechText) {
            setSpeechBubbleText(propsSpeechText);
        }
    }, [propsSpeechText]);

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
            const MAX_TURN = 1.0;
            angleY = Math.max(-MAX_TURN, Math.min(MAX_TURN, angleY));

            // Smooth interpolation (lerp)
            headBone.rotation.y = THREE.MathUtils.lerp(
                headBone.rotation.y,
                angleY,
                0.1
            );

            // Vertical tilt (look up/down)
            const yDiff = camera.y - avatarPos.y - 1.5;
            let angleX = Math.atan2(yDiff, Math.sqrt(xDiff ** 2 + zDiff ** 2));
            angleX = Math.max(-0.5, Math.min(0.5, angleX));
            headBone.rotation.x = THREE.MathUtils.lerp(
                headBone.rotation.x,
                angleX,
                0.1
            );
        }

        // === MORPH TARGET ANIMATIONS (Apply to ALL meshes) ===
        allMeshesWithMorphs.forEach((mesh) => {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

            const dict = mesh.morphTargetDictionary;
            const influences = mesh.morphTargetInfluences;

            // === AUTOMATIC BLINKING ===
            const blinkLeftIndex = dict['eyeBlinkLeft'];
            const blinkRightIndex = dict['eyeBlinkRight'];

            if (blinkLeftIndex !== undefined && blinkRightIndex !== undefined) {
                // Blink every ~3 seconds with a sharp spike
                const blinkCycle = Math.sin(time * 2) - 0.90;
                const blinkValue = Math.max(0, blinkCycle) * 20;
                const blinkAmount = Math.min(1, blinkValue);

                influences[blinkLeftIndex] = blinkAmount;
                influences[blinkRightIndex] = blinkAmount;
            }

            // === LIP-SYNC (Driven by audio) ===
            if (isAudioPlaying) {
                // Simulate realistic lip movement with noise
                const jawOpenIndex = dict['jawOpen'];
                const visemeAA = dict['viseme_AA'];
                const visemeO = dict['viseme_O'];
                const visemeE = dict['viseme_E'];

                // Create varying movement patterns
                const talkSpeed = time * 8;
                const jawValue = (Math.sin(talkSpeed) * 0.5 + 0.5) * 0.6;
                const aaValue = (Math.sin(talkSpeed * 1.3 + 1) * 0.5 + 0.5) * 0.4;
                const oValue = (Math.sin(talkSpeed * 0.7 + 2) * 0.5 + 0.5) * 0.3;
                const eValue = (Math.sin(talkSpeed * 1.1 + 3) * 0.5 + 0.5) * 0.25;

                if (jawOpenIndex !== undefined) influences[jawOpenIndex] = jawValue;
                if (visemeAA !== undefined) influences[visemeAA] = aaValue;
                if (visemeO !== undefined) influences[visemeO] = oValue;
                if (visemeE !== undefined) influences[visemeE] = eValue;
            } else {
                // Reset lip-sync morphs when not talking
                const jawOpenIndex = dict['jawOpen'];
                if (jawOpenIndex !== undefined) {
                    influences[jawOpenIndex] = THREE.MathUtils.lerp(influences[jawOpenIndex], 0, 0.1);
                }
            }
        });
    });

    return (
        <group ref={group} position={[0, -1.5, 0]} scale={[1.8, 1.8, 1.8]}>
            <primitive object={scene} />

            {/* Speech bubble */}
            {speechBubbleText && headBone && (
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
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        maxWidth: '200px',
                        position: 'relative',
                        fontFamily: 'sans-serif'
                    }}>
                        <div style={{
                            color: '#333',
                            fontSize: '14px',
                            lineHeight: '1.4'
                        }}>
                            {speechBubbleText}
                        </div>
                        {/* Triangle pointer */}
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

AvatarModelUnified.displayName = 'AvatarModelUnified';
