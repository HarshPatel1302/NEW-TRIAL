import React from 'react';

import './avatar-subtitles.css';

interface SubtitlesProps {
  text: string;
}

export default function Subtitles({ text }: SubtitlesProps) {
  if (!text) return null;

  return (
    <div className="avatar-subtitles" aria-live="polite">
      {text}
    </div>
  );
}
