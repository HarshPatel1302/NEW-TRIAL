import React, { useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

interface AvatarModelProps {
    speechText?: string;
}

export interface AvatarModelRef {
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => void;
    setSpeechBubble: (text: string) => void;
    clearSpeechBubble: () => void;
}

export const AvatarModel = forwardRef<AvatarModelRef, AvatarModelProps>((props, ref) => {
    const { speechText: propsSpeechText } = props;
    const group = useRef<THREE.Group>(null);

    // Load Ready Player Me avatar from local public folder
    const avatarUrl = '/models/pratik_avatar.glb';
    const { scene, animations } = useGLTF(avatarUrl) as any;
    const { actions } = useAnimations(animations, group);

    // State for head tracking
    const [headBone, setHeadBone] = useState<THREE.Object3D | null>(null);
    const [headMesh, setHeadMesh] = useState<THREE.Mesh | null>(null);
    const [currentAnimation, setCurrentAnimation] = useState<'idle' | 'wave' | 'greeting'>('idle');
    const [speechBubbleText, setSpeechBubbleText] = useState<string>('');

    // Animation state
    const idleTime = useRef(0);

    // Use props or state for speech text
    const speechText = propsSpeechText || speechBubbleText;

    // Find head bone and mesh on mount
    useEffect(() => {
        if (scene) {
            console.log('=== Avatar Scene Loaded ===');

            // Traverse the entire scene to log all objects and fix materials
            scene.traverse((object: any) => {
                console.log(`Object: ${object.name}, Type: ${object.type}`);

                // Force head meshes to be visible
                if (object.isMesh) {
                    const mesh = object as THREE.Mesh;
                    const materialType = Array.isArray(mesh.material)
                        ? 'Array'
                        : mesh.material?.type || 'None';

                    console.log(`  Mesh ${object.name}:`, {
                        visible: mesh.visible,
                        material: materialType,
                        scale: mesh.scale.toArray(),
                        position: mesh.position.toArray(),
                        morphTargets: mesh.morphTargetDictionary
                    });

                    // Check if this is a head-related mesh
                    const isHeadMesh = object.name.toLowerCase().includes('head') ||
                        object.name.toLowerCase().includes('hair') ||
                        object.name.toLowerCase().includes('eye') ||
                        object.name.toLowerCase().includes('teeth') ||
                        object.name.toLowerCase().includes('beard');

                    if (isHeadMesh) {
                        console.log(`!!! Found head mesh: ${object.name}`);
                        console.log(`    Scale: ${mesh.scale.toArray()}, Position: ${mesh.position.toArray()}`);

                        // Force visibility
                        mesh.visible = true;

                        // CHECK AND FIX SCALE - this is often the culprit!
                        if (mesh.scale.x === 0 || mesh.scale.y === 0 || mesh.scale.z === 0) {
                            console.log(`    !!! Scale was ZERO for ${object.name}, fixing to 1,1,1`);
                            mesh.scale.set(1, 1, 1);
                        }

                        // Force render order
                        mesh.renderOrder = 999;

                        // Frustum culling (sometimes meshes are culled incorrectly)
                        mesh.frustumCulled = false;

                        // Fix material if it exists
                        if (mesh.material) {
                            if (Array.isArray(mesh.material)) {
                                mesh.material.forEach((mat: THREE.Material, idx: number) => {
                                    mat.transparent = false;
                                    mat.opacity = 1;
                                    mat.visible = true;
                                    mat.depthWrite = true;
                                    mat.depthTest = true;
                                    if ((mat as any).map) {
                                        (mat as any).map.needsUpdate = true;
                                    }
                                    console.log(`    Fixed material[${idx}] for ${object.name}`);
                                });
                            } else {
                                const mat = mesh.material as THREE.Material;
                                mat.transparent = false;
                                mat.opacity = 1;
                                mat.visible = true;
                                mat.depthWrite = true;
                                mat.depthTest = true;
                                if ((mat as any).map) {
                                    (mat as any).map.needsUpdate = true;
                                }
                                console.log(`    Fixed material for ${object.name}`);
                            }
                        } else {
                            // No material - create a basic one with VISIBLE COLOR
                            console.log(`    No material found, creating BRIGHT material for ${object.name}`);
                            mesh.material = new THREE.MeshStandardMaterial({
                                color: 0xff0000,  // Bright RED so we can see it!
                                roughness: 0.7,
                                metalness: 0,
                                side: THREE.DoubleSide  // Render both sides
                            });
                        }

                        // Force the mesh to update
                        mesh.updateMatrix();
                        mesh.updateMatrixWorld(true);
                    }
                }
            });

            // Find the neck or head bone for tracking
            const bone = scene.getObjectByName('Neck') ||
                scene.getObjectByName('Head') ||
                scene.getObjectByName('mixamorig:Neck') ||
                scene.getObjectByName('mixamorig:Head');
            setHeadBone(bone);
            console.log('Head bone found:', bone?.name);

            // Find the head mesh for blinking (morph targets)
            // Avaturn uses 'avaturn_body' or 'avaturn_hair_0' which has morphs
            let mesh = scene.getObjectByName('Wolf3D_Head') ||
                scene.getObjectByName('Head_Mesh') ||
                scene.getObjectByName('Head') ||
                scene.getObjectByName('avaturn_body');

            // If not found, traverse to find first mesh with morph targets
            if (!mesh) {
                scene.traverse((object: any) => {
                    if (object.isMesh && object.morphTargetDictionary &&
                        Object.keys(object.morphTargetDictionary).length > 0) {
                        if (!mesh) {  // Take the first one we find
                            mesh = object;
                            console.log('Found mesh with morph targets:', object.name, object.morphTargetDictionary);
                        }
                    }
                });
            }

            if (mesh && (mesh as THREE.Mesh).isMesh) {
                setHeadMesh(mesh as THREE.Mesh);
                console.log('✅ Head mesh set:', mesh.name);
                console.log('📊 Available morph targets:', (mesh as THREE.Mesh).morphTargetDictionary);
            } else {
                console.warn('⚠️ No head mesh with morph targets found');
            }

            console.log('📀 Available animations:', animations?.map((a: any) => a.name));

            // Auto-play idle animation if available
            if (animations && animations.length > 0) {
                const idleAnim = animations.find((a: any) =>
                    a.name.toLowerCase().includes('idle')
                );
                if (idleAnim && actions[idleAnim.name]) {
                    console.log('🎬 Auto-playing animation:', idleAnim.name);
                    actions[idleAnim.name]?.reset().fadeIn(0.5).play();
                }
            }
            console.log('=================');
        }
    }, [scene, animations]);

    // Expose playAnimation method to parent
    useImperativeHandle(ref, () => ({
        playAnimation: (name: string, options = {}) => {
            if (name === 'wave' || name === 'greeting') {
                setCurrentAnimation(name as 'wave' | 'greeting');

                // Try to play the animation if it exists
                const actionName = actions[name] || actions['Wave'] || actions['Waving'];
                if (actionName) {
                    actionName.reset().fadeIn(0.5).play();
                }

                setTimeout(() => {
                    setCurrentAnimation('idle');
                    actionName?.fadeOut(0.5);
                }, (options.duration || 2) * 1000);
            }
        },
        setSpeechBubble: (text: string) => {
            setSpeechBubbleText(text);
        },
        clearSpeechBubble: () => {
            setSpeechBubbleText('');
        }
    }));

    // Main animation loop - 60 FPS
    useFrame((state, delta) => {
        if (!group.current) return;

        // === PROFESSIONAL RECEPTIONIST FACIAL EXPRESSIONS ===
        // Note: eyeBlink morphs NOT available in current avatar - will work with Avaturn avatar
        // Using only available morphs: mouthOpen (0), mouthSmile (1)

        // === REALISTIC MOUTH MOVEMENT (Using ONLY available: mouthOpen, mouthSmile) ===
        if (headMesh && headMesh.morphTargetInfluences && headMesh.morphTargetDictionary) {
            const mouthOpenIndex = headMesh.morphTargetDictionary['mouthOpen'];
            const mouthSmileIndex = headMesh.morphTargetDictionary['mouthSmile'];

            const time = state.clock.elapsedTime;

            if (speechText) {
                // ==== SPEAKING: NATURAL LIP SYNC ====
                if (mouthOpenIndex !== undefined) {
                    // Varied speech rhythm - realistic phoneme variation
                    const fastTalk = Math.sin(time * 10) * 0.3;  // Quick consonants
                    const slowTalk = Math.sin(time * 4) * 0.2;   // Vowel sounds
                    const jawOpen = Math.abs(fastTalk + slowTalk) * 0.6;  // 0-0.6 range

                    headMesh.morphTargetInfluences[mouthOpenIndex] = jawOpen;
                }

                // Friendly smile maintained during speech
                if (mouthSmileIndex !== undefined) {
                    const targetSmile = 0.25;  // 25% smile
                    const current = headMesh.morphTargetInfluences[mouthSmileIndex] || 0;
                    headMesh.morphTargetInfluences[mouthSmileIndex] =
                        THREE.MathUtils.lerp(current, targetSmile, delta * 3);
                }
            } else {
                // ==== IDLE: FRIENDLY RESTING EXPRESSION ====
                // Close mouth gently
                if (mouthOpenIndex !== undefined) {
                    const current = headMesh.morphTargetInfluences[mouthOpenIndex] || 0;
                    headMesh.morphTargetInfluences[mouthOpenIndex] =
                        THREE.MathUtils.lerp(current, 0, delta * 6);
                }

                // Professional receptionist smile - slightly animated
                if (mouthSmileIndex !== undefined) {
                    const smileVariation = Math.sin(time * 0.3) * 0.03;  // Breathes life
                    const targetSmile = 0.18 + smileVariation;  // 15-21% smile
                    const current = headMesh.morphTargetInfluences[mouthSmileIndex] || 0;
                    headMesh.morphTargetInfluences[mouthSmileIndex] =
                        THREE.MathUtils.lerp(current, targetSmile, delta * 2);
                }
            }
        }

        // === NECK BONE: SUBTLE HEAD MOVEMENTS ===
        if (scene) {
            const neckBone = scene.getObjectByName('Neck');

            if (neckBone && neckBone.type === 'Bone') {
                const time = state.clock.elapsedTime;

                // CRITICAL FIX: Avatar's default pose looks upward (x rotation ~0.279)
                // Apply downward offset so avatar looks straight ahead for eye contact
                // Final value -0.8 achieves level gaze (tested: -0.3→30° up, -0.5→12° up, -0.8→level)
                const GAZE_CORRECTION = -0.8;  // Negative = tilt head down to look straight

                if (speechText) {
                    // Speaking: Gentle nods and engagement
                    const nodCycle = Math.sin(time * 0.8) * 0.06;
                    const targetRotation = GAZE_CORRECTION + nodCycle;
                    neckBone.rotation.x = THREE.MathUtils.lerp(neckBone.rotation.x, targetRotation, delta * 1.5);

                    // Slight head tilt
                    const tiltCycle = Math.sin(time * 0.4) * 0.02;
                    neckBone.rotation.z = THREE.MathUtils.lerp(neckBone.rotation.z, tiltCycle, delta * 1.2);
                } else {
                    // Idle: Neutral position with gaze correction
                    neckBone.rotation.x = THREE.MathUtils.lerp(neckBone.rotation.x, GAZE_CORRECTION, delta * 3);
                    neckBone.rotation.z = THREE.MathUtils.lerp(neckBone.rotation.z, 0, delta * 3);
                }

                // Always face forward
                neckBone.rotation.y = THREE.MathUtils.lerp(neckBone.rotation.y, 0, delta * 5);
            }
        }

        // === HEAD TRACKING (Bone Rotation) - DISABLED FOR NOW ===
        // The tracking calculation was causing avatar to look upward
        // Will re-enable once we have proper Avaturn avatar with known bone structure
        /*
        if (headBone) {
            const cameraPos = state.camera.position;
            const avatarPos = group.current.position;

            const xDiff = cameraPos.x - avatarPos.x;
            const zDiff = cameraPos.z - avatarPos.z;
            let angleY = Math.atan2(xDiff, zDiff);

            const maxTurn = 0.8;
            angleY = Math.max(-maxTurn, Math.min(maxTurn, angleY));
            headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, angleY, 0.1);

            const yDiff = cameraPos.y - avatarPos.y - 1.5;
            let angleX = -Math.atan2(yDiff, Math.sqrt(xDiff ** 2 + zDiff ** 2));
            angleX = Math.max(-0.3, Math.min(0.3, angleX));
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, angleX, 0.1);
        }
        */

        // === IDLE SUBTLE ANIMATIONS ===
        if (currentAnimation === 'idle') {
            idleTime.current += delta;

            // No breathing motion - keep avatar stable
            group.current.position.y = -1.5;

            // Minimal body sway (barely noticeable)
            const sway = Math.sin(idleTime.current * 0.5) * 0.005;
            group.current.rotation.z = sway;

            // Minimal weight shifting
            const shift = Math.sin(idleTime.current * 0.3) * 0.005;
            group.current.rotation.y = shift;
        }

        // === HAND GESTURES (During Speech) ===
        if (speechText && scene) {
            // Try to find hand bones (Ready Player Me uses these names)
            const rightHand = scene.getObjectByName('RightHand') ||
                scene.getObjectByName('mixamorig:RightHand');
            const leftHand = scene.getObjectByName('LeftHand') ||
                scene.getObjectByName('mixamorig:LeftHand');

            const time = state.clock.elapsedTime;

            if (rightHand) {
                // Subtle hand movement during speech
                const gesture = Math.sin(time * 2) * 0.1;
                rightHand.rotation.z = gesture - 0.1;
                rightHand.rotation.x = Math.sin(time * 1.5) * 0.05;
            }

            if (leftHand) {
                // Left hand slightly offset
                const gesture = Math.sin(time * 2 + Math.PI / 2) * 0.1;
                leftHand.rotation.z = -gesture + 0.1;
                leftHand.rotation.x = Math.sin(time * 1.5 + Math.PI / 3) * 0.05;
            }
        }
    });

    return (
        <>
            <group ref={group} position={[0, -1.5, 0]} scale={[1.8, 1.8, 1.8]}>
                {/* The Ready Player Me avatar */}
                <primitive object={scene} />

                {/* Speech bubble attached to head */}
                {speechText && headBone && (
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
        </>
    );
});

// Preload the avatar
useGLTF.preload('/models/pratik_avatar.glb');
