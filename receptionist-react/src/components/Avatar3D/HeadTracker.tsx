import React from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

interface HeadTrackerProps {
    headBone: THREE.Bone | null;
}

export const HeadTracker: React.FC<HeadTrackerProps> = ({ headBone }) => {
    const { camera } = useThree();
    const targetRotation = useRef(new THREE.Euler());
    const smoothFactor = 0.05; // Lower = smoother

    useFrame(() => {
        if (!headBone) return;

        // Get camera position
        const cameraPosition = camera.position.clone();

        // Calculate direction from head to camera
        const headPosition = new THREE.Vector3();
        headBone.getWorldPosition(headPosition);

        const direction = new THREE.Vector3();
        direction.subVectors(cameraPosition, headPosition).normalize();

        // Calculate target rotation
        const targetQuaternion = new THREE.Quaternion();
        const lookAtMatrix = new THREE.Matrix4();
        lookAtMatrix.lookAt(headPosition, cameraPosition, new THREE.Vector3(0, 1, 0));
        targetQuaternion.setFromRotationMatrix(lookAtMatrix);

        targetRotation.current.setFromQuaternion(targetQuaternion);

        // Clamp rotation to avoid creepy spinning
        const maxRotation = Math.PI / 4; // 45 degrees
        targetRotation.current.x = THREE.MathUtils.clamp(targetRotation.current.x, -maxRotation, maxRotation);
        targetRotation.current.y = THREE.MathUtils.clamp(targetRotation.current.y, -maxRotation, maxRotation);

        // Smoothly interpolate to target rotation
        headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetRotation.current.x, smoothFactor);
        headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, targetRotation.current.y, smoothFactor);
    });

    return null;
};
