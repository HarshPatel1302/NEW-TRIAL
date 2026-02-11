import fs from 'fs';
import path from 'path';

type GlbJson = {
  animations?: Array<{ name?: string }>;
  meshes?: Array<{ extras?: { targetNames?: string[] } }>;
};

function parseGlbJson(filePath: string): GlbJson {
  const buffer = fs.readFileSync(filePath);
  const magic = buffer.toString('utf8', 0, 4);
  if (magic !== 'glTF') {
    throw new Error(`Invalid GLB magic for ${filePath}`);
  }

  const totalLength = buffer.readUInt32LE(8);
  let offset = 12;
  while (offset < totalLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    offset += 4;
    const chunkType = buffer.readUInt32LE(offset);
    offset += 4;
    const chunkData = buffer.slice(offset, offset + chunkLength);
    offset += chunkLength;

    // JSON chunk
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(chunkData.toString('utf8'));
    }
  }

  throw new Error(`No JSON chunk found in ${filePath}`);
}

function resolveModelPath(): string {
  const root = path.resolve(__dirname, '../../../');
  const v2Path = path.join(root, 'public/models/receptionist/receptionist_all_6_actions_v2.glb');
  const v1Path = path.join(root, 'public/models/receptionist/receptionist_all_6_actions.glb');
  const modelVersion = process.env.REACT_APP_AVATAR_MODEL_VERSION === 'v2' ? 'v2' : 'v1';
  return modelVersion === 'v2' ? v2Path : v1Path;
}

describe('receptionist avatar GLB contract', () => {
  it('contains required animation clips and morph targets', () => {
    const modelPath = resolveModelPath();
    expect(fs.existsSync(modelPath)).toBe(true);

    const json = parseGlbJson(modelPath);
    const animationNames = new Set((json.animations || []).map((a) => a.name || ''));
    const requiredAnimations = ['idle', 'waving', 'talking', 'pointing', 'nodYes', 'bow'];
    requiredAnimations.forEach((name) => {
      expect(animationNames.has(name)).toBe(true);
    });

    const morphNames = new Set<string>();
    (json.meshes || []).forEach((mesh) => {
      (mesh.extras?.targetNames || []).forEach((name) => morphNames.add(name));
    });

    const requiredMorphs = [
      'jawOpen',
      'viseme_aa',
      'viseme_E',
      'viseme_O',
      'viseme_U',
      'viseme_FF',
      'viseme_TH',
      'viseme_PP',
      'viseme_sil',
      'mouthSmileLeft',
      'mouthSmileRight',
      'eyeBlinkLeft',
      'eyeBlinkRight',
    ];

    requiredMorphs.forEach((name) => {
      expect(morphNames.has(name)).toBe(true);
    });
  });
});
