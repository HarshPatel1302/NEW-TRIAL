import { FacialController, resolveMorphAlias } from './facial-controller';
import { MorphDictionary } from './facial-types';

describe('resolveMorphAlias', () => {
  it('resolves alias for uppercase viseme names', () => {
    const dictionary: MorphDictionary = { viseme_AA: 4, jawOpen: 1 };
    expect(resolveMorphAlias(dictionary, 'viseme_aa')).toBe('viseme_AA');
  });

  it('returns null when channel is missing', () => {
    const dictionary: MorphDictionary = { jawOpen: 1 };
    expect(resolveMorphAlias(dictionary, 'viseme_TH')).toBeNull();
  });
});

describe('FacialController', () => {
  it('produces bounded solved values and maps to dictionary aliases', () => {
    const controller = new FacialController({ random: () => 0.5 });

    const solved = controller.solve({
      delta: 1 / 60,
      time: 1.2,
      isAudioPlaying: true,
      expressionCue: 'explaining_confident',
      lipSync: {
        volume: 0.45,
        lowBand: 0.52,
        midBand: 0.47,
        highBand: 0.28,
        voiced: 0.51,
        plosive: 0.26,
        sibilance: 0.22,
        envelope: 0.41,
        timestamp: performance.now(),
      },
    });

    expect(solved.jawOpen).toBeGreaterThan(0);
    expect(solved.jawOpen).toBeLessThanOrEqual(1);
    expect(solved.viseme_aa).toBeGreaterThanOrEqual(0);
    expect(solved.viseme_aa).toBeLessThanOrEqual(1);

    const mapped = controller.mapToDictionary(
      { jawOpen: 0, viseme_AA: 1, mouthSmileLeft: 2, mouthSmileRight: 3 },
      solved,
    );

    expect(mapped.jawOpen).toBeDefined();
    expect(mapped.viseme_AA).toBeDefined();
    expect(mapped.mouthSmileLeft).toBeDefined();
    expect(mapped.mouthSmileRight).toBeDefined();
  });
});
