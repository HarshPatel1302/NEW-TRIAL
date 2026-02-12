import React, { useState, useEffect } from 'react';
import { useProgress } from '@react-three/drei';

export const LoadingScreen: React.FC = () => {
    const { progress, active } = useProgress();
    const [fadeOut, setFadeOut] = useState(false);
    const [isGone, setIsGone] = useState(false);

    useEffect(() => {
        // When loading is complete and no longer active
        if (progress === 100 && !active) {
            // Small delay to ensure shaders are compiled
            setTimeout(() => {
                setFadeOut(true);
                // After fade animation completes, remove from DOM
                setTimeout(() => setIsGone(true), 500);
            }, 200);
        }
    }, [progress, active]);

    if (isGone) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: '#1a1a2e',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
                opacity: fadeOut ? 0 : 1,
                transition: 'opacity 0.5s ease-out',
                pointerEvents: fadeOut ? 'none' : 'auto'
            }}
        >
            <div className="loading-spinner" style={{
                width: '50px',
                height: '50px',
                border: '4px solid #444',
                borderTop: '4px solid #007AFF',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }} />
            <h2 style={{
                color: 'white',
                marginTop: '20px',
                fontFamily: 'sans-serif',
                fontSize: '24px'
            }}>
                Loading Receptionist
            </h2>
            <div style={{
                width: '200px',
                height: '4px',
                backgroundColor: '#444',
                borderRadius: '2px',
                marginTop: '15px',
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '100%',
                    backgroundColor: '#007AFF',
                    width: `${progress}%`,
                    transition: 'width 0.3s ease-out'
                }} />
            </div>
            <p style={{
                color: '#888',
                marginTop: '10px',
                fontFamily: 'sans-serif',
                fontSize: '14px'
            }}>
                {progress.toFixed(0)}%
            </p>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
