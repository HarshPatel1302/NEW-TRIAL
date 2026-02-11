import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import * as THREE from 'three';
import { LipSyncData } from '../../lib/audio-streamer';

export interface AvatarModelRef {
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => void;
    setSpeechBubble: (text: string) => void;
    clearSpeechBubble: () => void;
}

interface AvatarModelProps {
    speechText?: string;
    isAudioPlaying?: boolean;
    lipSyncRef?: React.MutableRefObject<LipSyncData>;
}

const UNIFIED_MODEL = '/models/receptionist/receptionist_all_6_actions.glb';

// Preload the unified file
useGLTF.preload(UNIFIED_MODEL);

// ── Smoothing helpers ──────────────────────────────────────────────────
/** Exponential moving average for smooth morph transitions */
function smoothValue(current: number, target: number, speed: number, delta: number): number {
    return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta));
}

/** Clamp 0-1 */
function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

// ── Constants ──────────────────────────────────────────────────────────
/** Fast attack: morph targets follow audio onset quickly (natural speech) */
const ATTACK_SPEED = 14;
/** Slower decay: morphs return to zero gradually (prevents flicker) */
const DECAY_SPEED = 6;
/** Audio data older than this (ms) is considered stale → silence */
const AUDIO_STALE_MS = 200;
/** Max jaw opening during speech (0.35 ≈ natural human conversational range) */
const MAX_JAW = 0.35;
/** Max viseme shape intensity (slightly higher than jaw since lips move more) */
const MAX_VISEME = 0.45;
/** Crossfade duration between animation clips (seconds) */
const CROSSFADE_DURATION = 0.5;

export const AvatarModelUnified = React.forwardRef<AvatarModelRef, AvatarModelProps>((props, ref) => {
    const { speechText: propsSpeechText, isAudioPlaying = false, lipSyncRef } = props;
    const group = useRef<THREE.Group>(null);

    // Load the unified GLB file
    const { scene, animations } = useGLTF(UNIFIED_MODEL);
    const { actions, mixer } = useAnimations(animations, group);

    const currentActionRef = useRef<THREE.AnimationAction | null>(null);
    const [headBone, setHeadBone] = useState<THREE.Bone | null>(null);
    const [allMeshesWithMorphs, setAllMeshesWithMorphs] = useState<THREE.Mesh[]>([]);
    const [speechBubbleText, setSpeechBubbleText] = useState<string>('');

    // Smooth morph target values (persisted across frames for lerping)
    const smoothMorphsRef = useRef<Record<string, number>>({});

    // Find all meshes with morph targets and the head bone
    useEffect(() => {
        const meshes: THREE.Mesh[] = [];
        let foundHead: THREE.Bone | null = null;

        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.morphTargetDictionary) {
                meshes.push(obj);
                console.log('✓ Found mesh with morphs:', obj.name, 'Morphs:', Object.keys(obj.morphTargetDictionary));
            }

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
                currentActionRef.current = idleAction;
            }
        }
    }, [scene, animations, actions]);

    // Play animation function
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
            next.clampWhenFinished = true; // Hold last frame for one-shot gestures
        }
        next.play();

        // Smooth crossfade from previous animation
        if (prev && prev !== next) {
            prev.crossFadeTo(next, CROSSFADE_DURATION, true);
        }

        currentActionRef.current = next;
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

    // ═══════════════════════════════════════════════════════════════════
    // MAIN ANIMATION LOOP
    // ═══════════════════════════════════════════════════════════════════
    useFrame((state, delta) => {
        if (mixer) {
            mixer.update(delta);
        }

        const time = state.clock.getElapsedTime();
        const sm = smoothMorphsRef.current;

        // ── HEAD TRACKING (Look at Camera) ──────────────────────────
        if (headBone && group.current) {
            const camera = state.camera.position;
            const avatarPos = group.current.position;

            const xDiff = camera.x - avatarPos.x;
            const zDiff = camera.z - avatarPos.z;
            let angleY = Math.atan2(xDiff, zDiff);

            const MAX_TURN = 1.0;
            angleY = Math.max(-MAX_TURN, Math.min(MAX_TURN, angleY));

            headBone.rotation.y = THREE.MathUtils.lerp(
                headBone.rotation.y, angleY, 0.1
            );

            const yDiff = camera.y - avatarPos.y - 1.5;
            let angleX = Math.atan2(yDiff, Math.sqrt(xDiff ** 2 + zDiff ** 2));
            angleX = Math.max(-0.5, Math.min(0.5, angleX));
            headBone.rotation.x = THREE.MathUtils.lerp(
                headBone.rotation.x, angleX, 0.1
            );
        }

        // ── MORPH TARGET ANIMATIONS (Apply to ALL meshes) ───────────
        allMeshesWithMorphs.forEach((mesh) => {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

            const dict = mesh.morphTargetDictionary;
            const influences = mesh.morphTargetInfluences;

            // ── AUTOMATIC BLINKING ──────────────────────────────────
            const blinkLeftIndex = dict['eyeBlinkLeft'];
            const blinkRightIndex = dict['eyeBlinkRight'];

            if (blinkLeftIndex !== undefined && blinkRightIndex !== undefined) {
                const blinkCycle = Math.sin(time * 2) - 0.90;
                const blinkValue = Math.max(0, blinkCycle) * 20;
                const blinkAmount = Math.min(1, blinkValue);

                influences[blinkLeftIndex] = blinkAmount;
                influences[blinkRightIndex] = blinkAmount;
            }

            // ── AUDIO-DRIVEN LIP SYNC ───────────────────────────────
            // Read live frequency data from the lip sync analyser worklet
            const lipData = lipSyncRef?.current;
            const audioFresh = lipData && (performance.now() - lipData.timestamp) < AUDIO_STALE_MS;
            const hasAudio = audioFresh && lipData.volume > 0.01;

            if (hasAudio && lipData) {
                // ── Map frequency bands to viseme morph targets ──────
                const { volume, lowBand, midBand, highBand } = lipData;

                // ── Compute viseme targets with AMPLITUDE CAPS ──────
                // Key insight: human jaw opens max ~35% during conversational speech.
                // Values 0.7-1.0 look like shouting, not natural talking.

                // jawOpen: low-frequency energy drives jaw (vowels)
                const jawTarget = clamp01(lowBand * 0.35 + volume * 0.15) * MAX_JAW;

                // viseme_aa: open vowels "ah" (mid-freq dominant)
                const aaTarget = clamp01(midBand * 0.4 + lowBand * 0.1) * MAX_VISEME;

                // viseme_O: round vowels "oh/oo" (low + mid blend)
                const oTarget = clamp01(lowBand * 0.3 + midBand * 0.12) * MAX_VISEME;

                // viseme_E: front vowels "ee/eh" (mid + high blend)
                const eTarget = clamp01(midBand * 0.25 + highBand * 0.18) * MAX_VISEME;

                // viseme_PP: bilabial closure for plosives (p/b/m)
                const prevVol = sm['_prevVolume'] || 0;
                const volDrop = prevVol - volume;
                const ppTarget = clamp01(volDrop > 0.12 ? 0.5 : highBand * 0.1) * MAX_VISEME;
                sm['_prevVolume'] = volume;

                // Asymmetric smoothing: fast attack (mouth opens quick), slow decay (natural release)
                const jawSpeed = jawTarget > (sm['jawOpen'] || 0) ? ATTACK_SPEED : DECAY_SPEED;
                const aaSpeed = aaTarget > (sm['viseme_aa'] || 0) ? ATTACK_SPEED : DECAY_SPEED;
                const oSpeed = oTarget > (sm['viseme_O'] || 0) ? ATTACK_SPEED : DECAY_SPEED;
                const eSpeed = eTarget > (sm['viseme_E'] || 0) ? ATTACK_SPEED : DECAY_SPEED;
                const ppSpeed = ppTarget > (sm['viseme_PP'] || 0) ? ATTACK_SPEED * 1.5 : DECAY_SPEED;

                // Smooth all values toward targets
                sm['jawOpen'] = smoothValue(sm['jawOpen'] || 0, jawTarget, jawSpeed, delta);
                sm['viseme_aa'] = smoothValue(sm['viseme_aa'] || 0, aaTarget, aaSpeed, delta);
                sm['viseme_O'] = smoothValue(sm['viseme_O'] || 0, oTarget, oSpeed, delta);
                sm['viseme_E'] = smoothValue(sm['viseme_E'] || 0, eTarget, eSpeed, delta);
                sm['viseme_PP'] = smoothValue(sm['viseme_PP'] || 0, ppTarget, ppSpeed, delta);

                // Apply smoothed values to morph targets
                if (dict['jawOpen'] !== undefined) influences[dict['jawOpen']] = sm['jawOpen'];
                if (dict['viseme_aa'] !== undefined) influences[dict['viseme_aa']] = sm['viseme_aa'];
                if (dict['viseme_O'] !== undefined) influences[dict['viseme_O']] = sm['viseme_O'];
                if (dict['viseme_E'] !== undefined) influences[dict['viseme_E']] = sm['viseme_E'];
                if (dict['viseme_PP'] !== undefined) influences[dict['viseme_PP']] = sm['viseme_PP'];

                // Slight smile during speech
                if (dict['mouthSmileLeft'] !== undefined) influences[dict['mouthSmileLeft']] = 0.1;
                if (dict['mouthSmileRight'] !== undefined) influences[dict['mouthSmileRight']] = 0.1;

                // ── Subtle micro-expressions on emphasis ─────────────
                // Brow raise when volume peaks (looks natural/engaged)
                if (dict['browInnerUp'] !== undefined) {
                    const browTarget = volume > 0.4 ? 0.12 : 0;
                    sm['browInnerUp'] = smoothValue(sm['browInnerUp'] || 0, browTarget, DECAY_SPEED, delta);
                    influences[dict['browInnerUp']] = sm['browInnerUp'];
                }

                // Fallback for avatars with only mouthOpen/mouthSmile (no viseme_ morphs)
                if (dict['mouthOpen'] !== undefined && dict['jawOpen'] === undefined) {
                    influences[dict['mouthOpen']] = sm['jawOpen'];
                }

            } else if (isAudioPlaying && !lipData) {
                // ── FALLBACK: isAudioPlaying flag but no frequency data ──
                // Use simple sin-wave animation with natural amplitude caps
                const talkSpeed = time * 8;
                const jawValue = (Math.sin(talkSpeed) * 0.5 + 0.5) * MAX_JAW;
                const aaValue = (Math.sin(talkSpeed * 1.3 + 1) * 0.5 + 0.5) * MAX_VISEME * 0.6;

                if (dict['jawOpen'] !== undefined) {
                    sm['jawOpen'] = smoothValue(sm['jawOpen'] || 0, jawValue, ATTACK_SPEED, delta);
                    influences[dict['jawOpen']] = sm['jawOpen'];
                }
                if (dict['viseme_aa'] !== undefined) {
                    sm['viseme_aa'] = smoothValue(sm['viseme_aa'] || 0, aaValue, ATTACK_SPEED, delta);
                    influences[dict['viseme_aa']] = sm['viseme_aa'];
                }
                if (dict['mouthOpen'] !== undefined && dict['jawOpen'] === undefined) {
                    sm['mouthOpen'] = smoothValue(sm['mouthOpen'] || 0, jawValue, ATTACK_SPEED, delta);
                    influences[dict['mouthOpen']] = sm['mouthOpen'];
                }

            } else {
                // ── IDLE: Decay all lip-sync morphs to zero ─────────
                const lipMorphs = ['jawOpen', 'viseme_aa', 'viseme_O', 'viseme_E', 'viseme_PP', 'mouthOpen'];
                lipMorphs.forEach(key => {
                    const idx = dict[key];
                    if (idx !== undefined) {
                        sm[key] = smoothValue(sm[key] || 0, 0, DECAY_SPEED, delta);
                        influences[idx] = sm[key];
                    }
                });

                // Friendly resting smile
                const restingSmile = 0.12 + Math.sin(time * 0.3) * 0.03;
                if (dict['mouthSmileLeft'] !== undefined) {
                    influences[dict['mouthSmileLeft']] = restingSmile;
                }
                if (dict['mouthSmileRight'] !== undefined) {
                    influences[dict['mouthSmileRight']] = restingSmile;
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
