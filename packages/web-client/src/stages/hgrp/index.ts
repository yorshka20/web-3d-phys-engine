import { World } from '@ecs/core/ecs/World';
import { sceneSettings } from '@renderer/webGPU/renderer/sceneSettings';

import { registerDebugTab } from '../../ui/debugTabs';
import { createHGRPCharacterTab } from '../../ui/hgrpCharacterPanel';
import { createHGRPStageTab } from '../../ui/hgrpStagePanel';
import { hgrpStage, loadHGRPCharacter, relayoutHGRPStage, resetHGRPStage } from './characters';

// Stage B: the converted HGRP characters render through the HGRP material family — materials
// joined from preset.json by glb material name. The roster, the lazy per-character load and
// the row layout all live in characters.ts; this file is the stage's wiring only.
export async function createHGRPStage(world: World) {
  // Bright studio backdrop (linear light, pre-tonemap) — the in-game character showcase
  // sits on a light grey ground, and look comparison against screenshots needs it
  sceneSettings.clearColor = [0.7, 0.7, 0.73];

  resetHGRPStage();

  // The calibration UI belongs to this stage, not to main: the Character tab gives every
  // character on stage its own section, so characters are tuned and saved independently,
  // and the Stage tab switches the rest of the roster on.
  registerDebugTab(createHGRPCharacterTab());
  registerDebugTab(createHGRPStageTab(world));

  for (const character of hgrpStage.characters) {
    if (character.visible) {
      await loadHGRPCharacter(world, character);
    }
  }
  relayoutHGRPStage();
}
