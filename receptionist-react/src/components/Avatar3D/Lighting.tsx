import React from 'react';

export const Lighting: React.FC = () => {
    return (
        <>
            {/* Ambient light - soft fill light from all directions */}
            <ambientLight intensity={0.4} />

            {/* Main directional light - key light from front-top */}
            <directionalLight
                position={[2, 3, 2]}
                intensity={0.8}
                castShadow
            />

            {/* Fill light from the left */}
            <directionalLight
                position={[-2, 1, 1]}
                intensity={0.3}
            />

            {/* Rim light from behind for depth */}
            <directionalLight
                position={[0, 2, -2]}
                intensity={0.2}
            />
        </>
    );
};
