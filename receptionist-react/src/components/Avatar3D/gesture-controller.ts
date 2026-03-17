/**
 * GestureController — State machine for avatar gesture animations.
 *
 * Only two skeletal animations are used: IDLE and WAVING.
 * Lip sync is handled entirely by morph targets, so no skeletal
 * "talking" animation is played — it caused distracting hand gestures.
 *
 * One-shot gestures (waving) auto-return to idle after their duration.
 */

export type GestureState = 'idle' | 'talking' | 'waving' | 'pointing' | 'nodYes' | 'bow';

export interface GestureEvent {
    type: 'audioStart' | 'audioStop' | 'gesture';
    gesture?: GestureState;
    duration?: number;
}

type PlayAnimationFn = (name: string, options?: { loop?: boolean; duration?: number }) => void;
type GetGestureDurationFn = (name: GestureState) => number | undefined;

interface GestureControllerOptions {
    getGestureDuration?: GetGestureDurationFn;
}

export class GestureController {
    private currentState: GestureState = 'idle';
    private audioActive = false;
    private gestureReturnTimeout: ReturnType<typeof setTimeout> | null = null;
    private playAnimation: PlayAnimationFn;
    private getGestureDuration?: GetGestureDurationFn;

    constructor(playAnimation: PlayAnimationFn, options: GestureControllerOptions = {}) {
        this.playAnimation = playAnimation;
        this.getGestureDuration = options.getGestureDuration;
    }

    handleEvent(event: GestureEvent): void {
        switch (event.type) {
            case 'audioStart':
                this.audioActive = true;
                break;
            case 'audioStop':
                this.audioActive = false;
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
        if (this.gestureReturnTimeout) clearTimeout(this.gestureReturnTimeout);
    }

    resetToIdle(): void {
        this.audioActive = false;
        if (this.gestureReturnTimeout) {
            clearTimeout(this.gestureReturnTimeout);
            this.gestureReturnTimeout = null;
        }
        this.transitionTo('idle');
    }

    // ── Internal transitions ────────────────────────────────────────

    private onGesture(gesture: GestureState, duration?: number): void {
        if (this.gestureReturnTimeout) {
            clearTimeout(this.gestureReturnTimeout);
            this.gestureReturnTimeout = null;
        }

        this.transitionTo(gesture);

        const returnDelay = (duration || this.getDefaultDuration(gesture)) * 1000;
        this.gestureReturnTimeout = setTimeout(() => {
            this.gestureReturnTimeout = null;
            this.transitionTo('idle');
        }, returnDelay);
    }

    private transitionTo(state: GestureState): void {
        if (this.currentState === state) return;

        console.log(`[GestureController] ${this.currentState} → ${state}`);
        this.currentState = state;

        const isLoop = state === 'idle';
        this.playAnimation(state, { loop: isLoop });
    }

    private getDefaultDuration(gesture: GestureState): number {
        const resolved = this.getGestureDuration?.(gesture);
        if (resolved && resolved > 0) {
            return resolved;
        }

        switch (gesture) {
            case 'waving': return 2.5;
            default: return 2;
        }
    }
}
