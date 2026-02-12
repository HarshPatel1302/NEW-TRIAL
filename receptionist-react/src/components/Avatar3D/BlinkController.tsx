import React from 'react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

interface BlinkControllerProps {
    mesh: THREE.Mesh | null;
}

export const BlinkController: React.FC<BlinkControllerProps> = ({ mesh }) => {
    const blinkTimer = useRef(0);
    const blinkDuration = useRef(0.15); // Duration of a blink in seconds
    const timeSinceLastBlink = useRef(0);

    useFrame((state, delta) => {
        if (!mesh || !mesh.morphTargetInfluences) return;

        timeSinceLastBlink.current += delta;

        // Blink every 3-5 seconds randomly
        const nextBlinkTime = 3 + Math.random() * 2;

        if (timeSinceLastBlink.current >= nextBlinkTime) {
            // Start blink
            blinkTimer.current = 0;
            timeSinceLastBlink.current = 0;
        }

        // Animate blink
        if (blinkTimer.current < blinkDuration.current) {
            blinkTimer.current += delta;
            const progress = blinkTimer.current / blinkDuration.current;

            // Sin wave for smooth blink (in-out)
            const blinkValue = Math.sin(progress * Math.PI);

            // Find "eyesClosed" or "blink" morph target
            // This will work once we have a real avatar with blend shapes
            const blinkIndex = mesh.morphTargetDictionary?.['eyesClosed']
                || mesh.morphTargetDictionary?.['blink']
                || 0;

            if (mesh.morphTargetInfluences[blinkIndex] !== undefined) {
                mesh.morphTargetInfluences[blinkIndex] = blinkValue;
            }
        }
    });

    return null;
};
