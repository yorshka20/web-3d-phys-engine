import { HGRP_TEXTURE_SLOTS } from '../../material/hgrp';

// Global scene presentation controls, mutated by stages and the calibration GUI
// (module-scoped singleton, same rule as tonemapSettings — pass-level state that belongs
// to no material or entity).
// Which anti-aliasing stages close the post chain (renderer renderTick): TAA accumulates
// jittered frames into a history, FXAA is a single-frame edge filter; both together softens
// most, none presents the tonemap output as is.
export type AntiAliasingMode = 'off' | 'fxaa' | 'taa' | 'taa+fxaa';

export const sceneSettings = {
  antiAliasing: 'taa' as AntiAliasingMode,

  // Background of the HDR scene target, in LINEAR light — it runs through exposure x ACES
  // and the sRGB encode like every shaded pixel. Default black; showcase stages set a
  // bright studio grey so the character can be compared against in-game screenshots.
  clearColor: [0, 0, 0] as [number, number, number],

  // The one directional key light the NPR shading reads (n.l, SDF threshold, spec half
  // vector, rim light side) and the flat ambient term added on top of it, uploaded once per
  // frame as the HGRP group-3 SceneLighting uniform. The ripped materials describe surfaces,
  // not the scene — the presets carry 294 keys across the six characters and not one of them
  // is scene lighting — so the intensities here stay calibration knobs against in-game
  // screenshots (guess ledger A1/A7). The 0.75 / 0.25 split keeps a fully lit surface at
  // exactly its albedo while lifting the shadow side.
  lightDirection: [0.5, 1, 0.5] as [number, number, number], // toward the light, world space
  lightColor: [1, 1, 1] as [number, number, number],
  lightIntensity: 0.75,
  // Not a placeholder: this is `_CharacterParams2` as bound in the decompiled character
  // shader, one of the engine-side per-character globals no preset contains. Every one of the
  // seven material families uses it the way an indirect-light color is used — `1 - c` early
  // on, added as a floor to the shaded result, and multiplying the reflected environment.
  ambientColor: [0.783019, 0.829308, 1.0] as [number, number, number],
  ambientIntensity: 0.25,
  // Opt-in environment reflection for the metallic zones of cloth (materials/HGRPNpr.wgsl):
  // the ambient color as a hemisphere with this much up/down contrast, looked up along the
  // reflected view direction and scaled by envReflection. 0 = the term does not exist; the
  // knob exists to A/B the hypothesis that the quilted lining reads bright in-game because its
  // normal map reflects the surroundings from every direction (guess ledger A8).
  envReflection: 0,
  envGradient: 0.5,
  // The metal look of the cloth hardware zone (_MetallicGlossMap.r = 1.0; materials/
  // HGRPNpr.wgsl). A metal has almost no diffuse (metalDiffuse is the residual) and shows the
  // environment *reflected in its base color* over its whole surface — the hardware zone is
  // painted silver, (148, 147, 150) sRGB / 0.337 linear, measured off _BaseMap where
  // _MetallicGlossMap.r = 1. metalEnv is the RADIANCE of the environment the metal reflects,
  // in the same "a fully lit surface sits at its albedo" units the light/ambient split above
  // is normalized to — 1 means the environment is as bright as full lighting, and each
  // material's appearance then follows from its own albedo and roughness instead of being
  // fitted to one material's target. Checked over the metal zone of every material of all six
  // characters (scripts/hgrp-metal-zone.mjs): at 1.0 they land at 98-168 sRGB after ACES,
  // none saturating. Deliberately independent of ambientIntensity — hgrp_env is
  // pre-multiplied by it and the shader divides that back out.
  // metalEdge scales the environment BRDF's grazing term alone (1 = the fit's own value).
  // Formula constants the rip does not carry (guess ledger E7).
  metalDiffuse: 0.15,
  metalEnv: 1.0,
  metalEdge: 1.0,

  // Material debug view (generated/hgrp_debug_<permutation>.wgsl): show one texture slot of
  // every HGRP material instead of its shading, so what each map controls can be seen on the
  // mesh. 'off' = shade normally. Materials whose permutation does not bind the slot show
  // magenta — that absence is information too.
  debugView: {
    slot: 'off' as string,
    channel: 'plateau' as HGRPDebugChannel,
  },
};

// Channel modes of the debug view, in the order the shader switches on
// (core/hgrp_debug.wgsl): single channels as grey, the raw rgb, or the R channel quantized to
// the _MetallicGlossMap plateaus (0 / ~0.4 / ~0.73 / 1.0 -> grey / green / blue / red).
export const HGRP_DEBUG_CHANNELS = ['R', 'G', 'B', 'A', 'RGB', 'plateau'] as const;
export type HGRPDebugChannel = (typeof HGRP_DEBUG_CHANNELS)[number];

// Slot ids the debug view switches on: the slot's index in the HGRP_TEXTURE_SLOTS registry,
// the same numbering the generated debug fragment uses for its cases.
export const HGRP_DEBUG_SLOT_NAMES = ['off', ...Object.keys(HGRP_TEXTURE_SLOTS)] as const;

export const HGRP_DEBUG_VIEW_BYTE_SIZE = 16;

export function packHGRPDebugView(out: Float32Array = new Float32Array(4)): Float32Array {
  const slotIndex = Object.keys(HGRP_TEXTURE_SLOTS).indexOf(sceneSettings.debugView.slot);
  out[0] = slotIndex;
  out[1] = HGRP_DEBUG_CHANNELS.indexOf(sceneSettings.debugView.channel);
  out[2] = 0;
  out[3] = 0;
  return out;
}

export function isHGRPDebugViewOn(): boolean {
  return sceneSettings.debugView.slot in HGRP_TEXTURE_SLOTS;
}

// SceneLighting uniform block (core/uniforms.wgsl): four vec4s — the normalized light
// direction (w = envGradient), the key light color pre-multiplied by its intensity
// (w = ambientIntensity, so the metal term can undo the ambient's pre-multiplication), the
// ambient color pre-multiplied by its intensity (w = envReflection), and the metal look
// (residual diffuse, grazing-term scale, unused, environment reflection strength).
export const SCENE_LIGHTING_BYTE_SIZE = 64;

export function packSceneLighting(out: Float32Array = new Float32Array(16)): Float32Array {
  const [dx, dy, dz] = sceneSettings.lightDirection;
  const len = Math.hypot(dx, dy, dz) || 1;
  out[0] = dx / len;
  out[1] = dy / len;
  out[2] = dz / len;
  out[3] = sceneSettings.envGradient;
  for (let i = 0; i < 3; i++) {
    out[4 + i] = sceneSettings.lightColor[i] * sceneSettings.lightIntensity;
    out[8 + i] = sceneSettings.ambientColor[i] * sceneSettings.ambientIntensity;
  }
  out[7] = sceneSettings.ambientIntensity; // so the metal term can divide it back out
  out[11] = sceneSettings.envReflection;
  out[12] = sceneSettings.metalDiffuse;
  out[13] = sceneSettings.metalEdge;
  out[14] = 0; // unused: the environment BRDF fit has no exponent to tune
  out[15] = sceneSettings.metalEnv;
  return out;
}
