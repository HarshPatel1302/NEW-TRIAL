# Receptionist v2 Blender Workflow

## Files
- `audit_receptionist_rig.py`: imports current unified GLB, validates required meshes/actions, writes `receptionist_master.blend`.
- `export_receptionist_v2.py`: exports `receptionist_all_6_actions_v2.glb` from master blend.
- `validate_receptionist_glb.mjs`: contract checks required animation + morph channels.
- `build_receptionist_v2.sh`: end-to-end command.

## Run
```bash
cd avatar-pipeline
./build_receptionist_v2.sh
```

## Expression Presets To Author In Blender
- `neutral_professional`
- `welcome_warm`
- `listening_attentive`
- `explaining_confident`
- `confirming_yes`
- `empathy_soft`
- `goodbye_formal`

Use shape keys and keep output values normalized in `0.0 - 1.0`.

## Required Runtime Clip Names
- `idle`
- `waving`
- `talking`
- `pointing`
- `nodYes`
- `bow`

## Required Morph Channels
- `jawOpen`
- `viseme_aa`
- `viseme_E`
- `viseme_O`
- `viseme_U`
- `viseme_FF`
- `viseme_TH`
- `viseme_PP`
- `viseme_sil`
- `mouthSmileLeft`
- `mouthSmileRight`
- `eyeBlinkLeft`
- `eyeBlinkRight`
