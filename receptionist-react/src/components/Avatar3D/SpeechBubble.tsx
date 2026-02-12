import React from 'react';
import { Html } from '@react-three/drei';

interface SpeechBubbleProps {
    text?: string;
    position?: [number, number, number];
}

export function SpeechBubble({ text, position = [0, 0.4, 0] }: SpeechBubbleProps) {
    if (!text) return null;

    return (
        <Html
            position={position}
            center
            distanceFactor={6}
            zIndexRange={[100, 0]}
        >
            <div style={{
                backgroundColor: 'white',
                padding: '12px 16px',
                borderRadius: '12px',
                minWidth: '100px',
                maxWidth: '220px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                position: 'relative'
            }}>
                <p style={{
                    color: '#333',
                    fontSize: '14px',
                    fontWeight: '600',
                    textAlign: 'center',
                    margin: 0,
                    fontFamily: 'sans-serif'
                }}>
                    {text}
                </p>
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
    );
}
