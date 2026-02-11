/**
 * GestureController — State machine for avatar gesture animations.
 * 
 * Manages transitions between:
 *   IDLE → TALKING → WAVING → POINTING → NODDING → BOWING
 * 
 * Key behaviors:
 * - Audio-driven: enters TALKING when audio starts, exits 800ms after audio stops
 * - One-shot gestures (wave, nod, bow, point) auto-return to previous state
 * - Prevents flicker on short pauses via debouncing
 */

export type GestureState = 'idle' | 'talking' | 'waving' | 'pointing' | 'nodYes' | 'bow';

export interface GestureEvent {
    type: 'audioStart' | 'audioStop' | 'gesture';
    gesture?: GestureState;
    duration?: number; // seconds for one-shot gestures
}

type PlayAnimationFn = (name: string, options?: { loop?: boolean; duration?: number }) => void;
type GetGestureDurationFn = (name: GestureState) => number | undefined;

interface GestureControllerOptions {
    getGestureDuration?: GetGestureDurationFn;
}

export class GestureController {
    private currentState: GestureState = 'idle';
    private audioActive = false;
    private audioStopTimeout: ReturnType<typeof setTimeout> | null = null;
    private talkingStartTimeout: ReturnType<typeof setTimeout> | null = null;
    private gestureReturnTimeout: ReturnType<typeof setTimeout> | null = null;
    private playAnimation: PlayAnimationFn;
    private getGestureDuration?: GetGestureDurationFn;

    /** Debounce time (ms) before transitioning from talking → idle */
    private static AUDIO_STOP_DELAY = 700;
    /**
     * Delay entering full talking body animation.
     * If utterance is very short, stay in idle to prevent visual spikes.
     */
    private static TALKING_START_DELAY = 140;

    constructor(playAnimation: PlayAnimationFn, options: GestureControllerOptions = {}) {
        this.playAnimation = playAnimation;
        this.getGestureDuration = options.getGestureDuration;
    }

    /**
     * Process an event and transition state accordingly.
     */
    handleEvent(event: GestureEvent): void {
        switch (event.type) {
            case 'audioStart':
                this.onAudioStart();
                break;
            case 'audioStop':
                this.onAudioStop();
                break;
            case 'gesture':
                if (event.gesture) {
                    this.onGesture(event.gesture, event.duration);
                }
                break;
        }
    }

    getState(): GestureState {
        return this.currentState;
    }

    isAudioActive(): boolean {
        return this.audioActive;
    }

    destroy(): void {
        if (this.audioStopTimeout) clearTimeout(this.audioStopTimeout);
        if (this.talkingStartTimeout) clearTimeout(this.talkingStartTimeout);
        if (this.gestureReturnTimeout) clearTimeout(this.gestureReturnTimeout);
    }

    // ── Internal transitions ────────────────────────────────────────

    private onAudioStart(): void {
        this.audioActive = true;

        // Cancel any pending audio-stop transition
        if (this.audioStopTimeout) {
            clearTimeout(this.audioStopTimeout);
            this.audioStopTimeout = null;
        }

        // If already talking or in a one-shot gesture, don't interrupt
        if (this.currentState === 'talking') return;
        if (this.isOneShot(this.currentState)) return; // let gesture finish

        // Talking-lite: short utterances should not trigger full body talking animation.
        if (!this.talkingStartTimeout) {
            this.talkingStartTimeout = setTimeout(() => {
                this.talkingStartTimeout = null;
                if (this.audioActive && this.currentState === 'idle') {
                    this.transitionTo('talking');
                }
            }, GestureController.TALKING_START_DELAY);
        }
    }

    private onAudioStop(): void {
        this.audioActive = false;

        if (this.talkingStartTimeout) {
            clearTimeout(this.talkingStartTimeout);
            this.talkingStartTimeout = null;
        }

        // Cancel any existing timeout
        if (this.audioStopTimeout) {
            clearTimeout(this.audioStopTimeout);
        }

        // Debounce: wait before transitioning out of talking
        this.audioStopTimeout = setTimeout(() => {
            this.audioStopTimeout = null;
            // Only go to idle if we're still in talking state and audio hasn't resumed
            if (this.currentState === 'talking' && !this.audioActive) {
                this.transitionTo('idle');
            }
        }, GestureController.AUDIO_STOP_DELAY);
    }

    private onGesture(gesture: GestureState, duration?: number): void {
        // Clear any pending gesture return
        if (this.gestureReturnTimeout) {
            clearTimeout(this.gestureReturnTimeout);
            this.gestureReturnTimeout = null;
        }

        // Play the one-shot gesture
        this.transitionTo(gesture);

        // Auto-return after duration
        const returnDelay = (duration || this.getDefaultDuration(gesture)) * 1000;
        this.gestureReturnTimeout = setTimeout(() => {
            this.gestureReturnTimeout = null;
            // Return to talking if audio is still active, otherwise idle
            const returnState = this.audioActive ? 'talking' : 'idle';
            this.transitionTo(returnState);
        }, returnDelay);
    }

    private transitionTo(state: GestureState): void {
        if (this.currentState === state) return;

        console.log(`[GestureController] ${this.currentState} → ${state}`);
        this.currentState = state;

        // Map state to animation name and play
        const isLoop = state === 'idle' || state === 'talking';
        this.playAnimation(state, { loop: isLoop });
    }

    private isOneShot(state: GestureState): boolean {
        return state !== 'idle' && state !== 'talking';
    }

    private getDefaultDuration(gesture: GestureState): number {
        const resolved = this.getGestureDuration?.(gesture);
        if (resolved && resolved > 0) {
            return resolved;
        }

        switch (gesture) {
            case 'waving': return 2.5;
            case 'pointing': return 2;
            case 'nodYes': return 1.5;
            case 'bow': return 3;
            default: return 2;
        }
    }
}
