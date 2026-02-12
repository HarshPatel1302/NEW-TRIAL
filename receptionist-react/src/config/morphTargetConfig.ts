// Morph Target Configuration
// Maps the template to TypeScript constants

export const MORPH_TARGETS = {
    blink: ['eyeBlinkLeft', 'eyeBlinkRight'],
    jaw: ['jawOpen'],
    visemes: [
        'viseme_AA',  // "Ahh" - wide open
        'viseme_O',   // "Oh" - rounded
        'viseme_E',   // "Eee" - wide smile
        'viseme_U',   // "Ooo" - pucker
        'viseme_FV',  // "Fff" - bite lip
        'viseme_MBP', // "Mmm" - lips closed
        'viseme_L',   // "Lll" - tongue to teeth
        'viseme_CH',  // "Shh" - pucker forward
        'viseme_TH',  // "Thh" - tongue between teeth
        'viseme_R',   // "Rrr" - tight lips
    ],
    expressions: [
        'mouthSmileLeft',
        'mouthSmileRight',
        'browInnerUp',
        'browDownLeft',
        'browDownRight',
    ],
} as const;

export const MORPH_RANGES = {
    default: { min: 0.0, max: 1.0 },
    jawOpen: { min: 0.0, max: 0.8 },
} as const;

// Viseme mapping from phonemes to morph targets
export const VISEME_MAP: Record<string, string> = {
    'AA': 'viseme_AA',
    'AE': 'viseme_AA',
    'AH': 'viseme_AA',
    'AO': 'viseme_O',
    'OW': 'viseme_O',
    'EH': 'viseme_E',
    'IY': 'viseme_E',
    'UW': 'viseme_U',
    'F': 'viseme_FV',
    'V': 'viseme_FV',
    'M': 'viseme_MBP',
    'B': 'viseme_MBP',
    'P': 'viseme_MBP',
    'L': 'viseme_L',
    'CH': 'viseme_CH',
    'SH': 'viseme_CH',
    'TH': 'viseme_TH',
    'R': 'viseme_R',
};

// Animation names from Mixamo
export const ANIMATIONS = {
    IDLE: 'Idle',
    WAVE: 'Wave',
    TALKING: 'Talking',
    NOD: 'Nod',
    POINT: 'Point',
    BOW: 'Bow',
} as const;
