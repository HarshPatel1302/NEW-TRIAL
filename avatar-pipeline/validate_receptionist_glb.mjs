#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const requiredAnimations = ["idle", "waving", "talking", "pointing", "nodYes", "bow"];
const requiredMorphs = [
  "jawOpen",
  "viseme_aa",
  "viseme_E",
  "viseme_O",
  "viseme_U",
  "viseme_FF",
  "viseme_TH",
  "viseme_PP",
  "viseme_sil",
  "mouthSmileLeft",
  "mouthSmileRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
];
const requiredMeshes = ["Head_Mesh", "Eye_Mesh", "EyeAO_Mesh", "Eyelash_Mesh", "Teeth_Mesh", "Tongue_Mesh"];

function parseGlbJson(glbPath) {
  const buffer = fs.readFileSync(glbPath);
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`Invalid GLB magic: ${glbPath}`);
  }
  const length = buffer.readUInt32LE(8);
  let offset = 12;
  while (offset < length) {
    const chunkLength = buffer.readUInt32LE(offset);
    offset += 4;
    const chunkType = buffer.readUInt32LE(offset);
    offset += 4;
    const chunkData = buffer.slice(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(chunkData.toString("utf8"));
    }
  }
  throw new Error("JSON chunk not found in GLB");
}

function failIfMissing(label, required, actualSet) {
  const missing = required.filter((item) => !actualSet.has(item));
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(", ")}`);
  }
}

function main() {
  const scriptDir = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
  const repoRoot = path.resolve(scriptDir, "..");
  const inputPath =
    process.argv[2] ||
    path.join(
      repoRoot,
      "receptionist-react",
      "public",
      "models",
      "receptionist",
      "receptionist_all_6_actions_v2.glb",
    );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`GLB file not found: ${inputPath}`);
  }

  const json = parseGlbJson(inputPath);

  const animationSet = new Set((json.animations || []).map((a) => a.name || ""));
  const meshSet = new Set((json.meshes || []).map((m) => m.name || ""));
  const morphSet = new Set();
  for (const mesh of json.meshes || []) {
    for (const targetName of mesh.extras?.targetNames || []) {
      morphSet.add(targetName);
    }
  }

  failIfMissing("Animations", requiredAnimations, animationSet);
  failIfMissing("Morph targets", requiredMorphs, morphSet);
  failIfMissing("Meshes", requiredMeshes, meshSet);

  console.log("GLB structural validation passed.");
  console.log(`File: ${inputPath}`);
  console.log(`Animations: ${Array.from(animationSet).sort().join(", ")}`);
}

try {
  main();
} catch (err) {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
}
