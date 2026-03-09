import { AvatarEngineState } from './types';

const VALID_TRANSITIONS: Record<AvatarEngineState, AvatarEngineState[]> = {
  idle: ['listening', 'thinking', 'error'],
  listening: ['thinking', 'speaking', 'idle', 'error'],
  thinking: ['speaking', 'listening', 'error', 'idle'],
  speaking: ['listening', 'thinking', 'error', 'idle'],
  error: ['listening', 'idle'],
};

export class AvatarStateMachine {
  private state: AvatarEngineState = 'idle';
  private onChange?: (next: AvatarEngineState, prev: AvatarEngineState) => void;

  constructor(onChange?: (next: AvatarEngineState, prev: AvatarEngineState) => void) {
    this.onChange = onChange;
  }

  getState(): AvatarEngineState {
    return this.state;
  }

  canTransition(next: AvatarEngineState): boolean {
    if (next === this.state) return false;
    return VALID_TRANSITIONS[this.state].includes(next);
  }

  transition(next: AvatarEngineState): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    const prev = this.state;
    this.state = next;
    this.onChange?.(next, prev);
    return true;
  }

  reset(): void {
    this.state = 'idle';
  }
}
