import { GestureController } from './gesture-controller';

describe('GestureController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('uses talking-lite delay before entering talking state', () => {
    const played: string[] = [];
    const controller = new GestureController((name) => {
      played.push(name);
    });

    controller.handleEvent({ type: 'audioStart' });
    expect(played).toEqual([]);

    jest.advanceTimersByTime(100);
    expect(played).toEqual([]);

    jest.advanceTimersByTime(60);
    expect(played).toEqual(['talking']);

    controller.handleEvent({ type: 'audioStop' });
    jest.advanceTimersByTime(710);
    expect(played).toEqual(['talking', 'idle']);
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
});
