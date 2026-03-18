import { GestureController } from './gesture-controller';

describe('GestureController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('stays idle on audioStart (production: no full-body talking)', () => {
    const played: string[] = [];
    const controller = new GestureController((name) => {
      played.push(name);
    });

    controller.handleEvent({ type: 'audioStart' });
    expect(played).toEqual([]);

    jest.advanceTimersByTime(500);
    expect(played).toEqual([]);

    controller.handleEvent({ type: 'audioStop' });
    jest.advanceTimersByTime(800);
    expect(played).toEqual([]);
  });

  it('derives one-shot return duration from callback', () => {
    const played: string[] = [];
    const controller = new GestureController(
      (name) => {
        played.push(name);
      },
      {
        getGestureDuration: (gesture) => (gesture === 'waving' ? 1.2 : undefined),
      },
    );

    controller.handleEvent({ type: 'gesture', gesture: 'waving' });
    expect(played).toEqual(['waving']);

    jest.advanceTimersByTime(1100);
    expect(played).toEqual(['waving']);

    jest.advanceTimersByTime(150);
    expect(played).toEqual(['waving', 'idle']);
  });

  it('can hard reset to idle and cancel pending transitions', () => {
    const played: string[] = [];
    const controller = new GestureController((name) => {
      played.push(name);
    });

    controller.handleEvent({ type: 'gesture', gesture: 'waving', duration: 1.5 });
    expect(played).toEqual(['waving']);

    controller.resetToIdle();
    expect(played).toEqual(['waving', 'idle']);

    jest.advanceTimersByTime(1600);
    expect(played).toEqual(['waving', 'idle']);
  });
});
