import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LipSyncData } from '../../lib/audio-streamer';
import { AvatarModelRef } from '../Avatar3D/AvatarModelUnified';
import { ExpressionCue, MorphChannelMap } from '../Avatar3D/facial-types';
import { Avatar3DRef } from '../Avatar3D/Avatar3D';
import { AvatarStateMachine } from './AvatarStateMachine';
import { LipSyncPlayer } from './LipSyncPlayer';
import Subtitles from './Subtitles';
import { AvatarEngineState } from './types';
import { synthesizeAvatarSpeech } from '../../services/avatarApi';
import '../Avatar3D/Avatar3D.css';
import { createAvatarRenderAdapter } from './adapters/createAvatarRenderAdapter';

export type AvatarPipelineMode = 'legacy' | 'local';

interface AvatarControllerProps {
  mode: AvatarPipelineMode;
  connected: boolean;
  speechText?: string;
  expressionCue: ExpressionCue;
  isAudioPlaying: boolean;
  lipSyncRef: React.MutableRefObject<LipSyncData>;
  onLocalPlaybackStateChange?: (isPlaying: boolean) => void;
}

function createSilentLipSyncRef(): React.MutableRefObject<LipSyncData> {
  return {
    current: {
      volume: 0,
      lowBand: 0,
      midBand: 0,
      highBand: 0,
      voiced: 0,
      plosive: 0,
      sibilance: 0,
      envelope: 0,
      timestamp: 0,
    },
  };
}

function mapExpressionForBackend(expressionCue: ExpressionCue): string {
  switch (expressionCue) {
    case 'welcome_warm':
      return 'greeting';
    case 'listening_attentive':
      return 'attentive';
    case 'goodbye_formal':
      return 'friendly';
    default:
      return 'friendly';
  }
}

const PLAYBACK_DEDUPE_WINDOW_MS = 1800;
const RENDER_ADAPTER_NAME =
  String(process.env.REACT_APP_AVATAR_RENDER_ADAPTER || 'three_d').trim().toLowerCase() === 'talking_head_video'
    ? 'talking_head_video'
    : 'three_d';

const AvatarController = React.forwardRef<Avatar3DRef, AvatarControllerProps>((props, ref) => {
  const {
    mode,
    connected,
    speechText = '',
    expressionCue,
    isAudioPlaying,
    lipSyncRef,
    onLocalPlaybackStateChange,
  } = props;

  const avatarRef = useRef<AvatarModelRef>(null);
  const localLipSyncRef = useMemo(createSilentLipSyncRef, []);
  const renderAdapter = useMemo(() => createAvatarRenderAdapter(RENDER_ADAPTER_NAME), []);
  const lipSyncPlayerRef = useRef(new LipSyncPlayer());
  const machineRef = useRef(new AvatarStateMachine());
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const recentTextRef = useRef<Map<string, number>>(new Map());

  const [engineState, setEngineState] = useState<AvatarEngineState>('idle');
  const [subtitleText, setSubtitleText] = useState('');
  const [manualMorphTargets, setManualMorphTargets] = useState<MorphChannelMap | null>(null);

  const safeTransition = useCallback((next: AvatarEngineState) => {
    if (machineRef.current.transition(next)) {
      setEngineState(machineRef.current.getState());
    }
  }, []);

  const stopActivePlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
      audioElementRef.current = null;
    }

    lipSyncPlayerRef.current.reset();
    setManualMorphTargets(null);
  }, []);

  useEffect(() => {
    onLocalPlaybackStateChange?.(engineState === 'speaking');
  }, [engineState, onLocalPlaybackStateChange]);

  useEffect(() => {
    return () => {
      stopActivePlayback();
    };
  }, [stopActivePlayback]);

  useEffect(() => {
    if (!connected) {
      machineRef.current.reset();
      setEngineState('idle');
      setSubtitleText('');
      stopActivePlayback();
      return;
    }
    safeTransition('listening');
  }, [connected, safeTransition, stopActivePlayback]);

  useEffect(() => {
    if (mode !== 'local' || !connected) {
      return;
    }

    const text = speechText.trim();
    if (!text) {
      return;
    }

    const now = Date.now();
    const previous = recentTextRef.current.get(text) || 0;
    if (now - previous < PLAYBACK_DEDUPE_WINDOW_MS) {
      return;
    }
    recentTextRef.current.set(text, now);

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    safeTransition('thinking');

    const abortController = new AbortController();

    (async () => {
      try {
        const speechPackage = await synthesizeAvatarSpeech(
          {
            text,
            expression: mapExpressionForBackend(expressionCue),
            animation: 'speaking',
            cache: true,
          },
          abortController.signal,
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        stopActivePlayback();
        lipSyncPlayerRef.current.setMouthCues(speechPackage.mouthCues || []);
        setSubtitleText(speechPackage.text || text);

        const audio = new Audio(speechPackage.audioUrl);
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';

        audioElementRef.current = audio;

        const startLoop = () => {
          safeTransition('speaking');
          let lastTime = performance.now();

          const tick = () => {
            if (!audioElementRef.current) return;
            const currentTime = performance.now();
            const deltaSeconds = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            const frame = lipSyncPlayerRef.current.sample(audio.currentTime, deltaSeconds);
            setManualMorphTargets(frame.morphTargets);
            localLipSyncRef.current.timestamp = currentTime;
            localLipSyncRef.current.volume = frame.morphTargets.jawOpen || 0;

            if (!audio.paused && !audio.ended) {
              rafRef.current = requestAnimationFrame(tick);
            }
          };

          rafRef.current = requestAnimationFrame(tick);
        };

        audio.onplay = () => {
          startLoop();
        };

        audio.onended = () => {
          stopActivePlayback();
          safeTransition('listening');
        };

        audio.onerror = () => {
          stopActivePlayback();
          safeTransition('error');
          setSubtitleText('Avatar audio playback failed.');
        };

        await audio.play();
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          return;
        }
        stopActivePlayback();
        safeTransition('error');
        setSubtitleText('Avatar synthesis unavailable. Check local backend configuration.');
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [
    connected,
    expressionCue,
    localLipSyncRef,
    mode,
    safeTransition,
    speechText,
    stopActivePlayback,
  ]);

  const effectiveIsAudioPlaying = mode === 'local' ? engineState === 'speaking' : isAudioPlaying;
  const effectiveLipSyncRef = mode === 'local' ? localLipSyncRef : lipSyncRef;

  React.useImperativeHandle(ref, () => ({
    playAnimation: (name: string, options?: { loop?: boolean; duration?: number }) => {
      avatarRef.current?.playAnimation(name, options);
    },
    getAnimationDuration: (name: string) => avatarRef.current?.getAnimationDuration(name) ?? null,
    setSpeechBubble: (text: string) => setSubtitleText(text),
    clearSpeechBubble: () => setSubtitleText(''),
  }));

  return (
    <div className="avatar-container" data-avatar-state={engineState}>
      {renderAdapter.render({
        avatarRef: avatarRef as React.RefObject<AvatarModelRef>,
        expressionCue,
        isAudioPlaying: effectiveIsAudioPlaying,
        lipSyncRef: effectiveLipSyncRef,
        externalMorphTargets: mode === 'local' ? manualMorphTargets : null,
      })}
      <Subtitles text={subtitleText || speechText} />
    </div>
  );
});

AvatarController.displayName = 'AvatarController';

export default AvatarController;
