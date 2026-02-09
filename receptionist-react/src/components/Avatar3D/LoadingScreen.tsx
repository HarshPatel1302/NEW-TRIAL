import React, { useState, useEffect } from 'react';

export const LoadingScreen: React.FC = () => {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        // Simulate loading progress
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(() => setVisible(false), 500); // Fade out after completion
                    return 100;
                }
                return prev + 10;
            });
        }, 150);

        return () => clearInterval(interval);
    }, []);

    if (!visible) return null;

    return (
        <mesh>
            <planeGeometry args={[10, 10]} />
            <meshBasicMaterial transparent opacity={0} />
        </mesh>
    );
};
