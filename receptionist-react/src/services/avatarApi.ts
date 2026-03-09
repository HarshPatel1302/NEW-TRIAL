import { AvatarSpeechPackage } from '../components/avatar/types';

export interface AvatarSynthesisRequest {
  text: string;
  expression?: string;
  animation?: string;
  voice?: string;
  cache?: boolean;
  metadata?: Record<string, string>;
}

const AVATAR_BACKEND_URL = String(process.env.REACT_APP_AVATAR_BACKEND_URL || 'http://localhost:8001').replace(/\/$/, '');

function resolveAudioUrl(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  if (raw.startsWith('/')) {
    return `${AVATAR_BACKEND_URL}${raw}`;
  }
  return `${AVATAR_BACKEND_URL}/${raw}`;
}

export async function synthesizeAvatarSpeech(
  payload: AvatarSynthesisRequest,
  signal?: AbortSignal,
): Promise<AvatarSpeechPackage> {
  const response = await fetch(`${AVATAR_BACKEND_URL}/api/avatar/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Avatar synth failed (${response.status}): ${detail || response.statusText}`);
  }

  const data = (await response.json()) as AvatarSpeechPackage;
  return {
    ...data,
    audioUrl: resolveAudioUrl(data.audioUrl),
  };
}
