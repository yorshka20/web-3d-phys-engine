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
  // vector, rim light side), uploaded once per frame in the HGRP group-3 SceneLighting
  // uniform. In-game both are bound per frame and neither survived the rip (guess ledger A1,
  // formulas §10): the direction defaults to `_CharacterParams11.xyz`, the character light
  // the shader substitutes for the scene light — 30° elevation, 30° to the character's left
  // — with the x sign to be confirmed against the converted model's handedness; the color
  // and intensity (`DirectionalLightCustomData1`) are calibrated against in-game screenshots.
  // Everything else the lighting reads is a captured constant (HGRP_CHARACTER_GLOBALS), not a
  // knob — except the environment intensity and color below, which the game takes from the
  // scene probe.
  //
  // The intensity is the term that carries the whole picture's level, and it is the only one
  // that lifts skin and cloth together: light(N) = P0.y (luma(Lc) + hemi(N) x ambient), and the
  // skin variant's hemisphere is a constant 0.725 (it reads the horizontal normal, formulas §2)
  // while cloth's runs to 2.0, so raising the ambient instead brightens up-facing cloth three
  // times as much as skin. Against it, `envRadiance` below is the environment's radiance in the
  // same units — the two together are a lighting rig, and their ratio decides how directly lit
  // a character reads.
  lightDirection: [-0.433, 0.5, 0.75] as [number, number, number], // toward the light, world space
  lightColor: [1, 1, 1] as [number, number, number],
  lightIntensity: 1,
  // Environment intensity: in the captured frame the character shader took it from the scene's
  // irradiance volume (probe irradiance x _EnvironmentGlobalParams0.x = 1.67; formulas §1.4),
  // so it is scene-dependent and unknown. The shader clamps it to [0, 1.5] for the diffuse
  // ambient and to [0.5, 1.5] for the IBL; the no-probe fallback (1.67) is the ceiling of both.
  // At the ceiling the hemisphere term more than doubles light(N) from a side-facing to an
  // up-facing surface and floods every up-facing surface with the ambient color, which the
  // in-game frame's mid-grey quilted lining rules out. What this knob controls is the sky
  // shaping — how much brighter an up-facing surface is than a side-facing one — not the
  // level; the level is the key light's.
  ambientIntensity: 0.5,
  // Environment color, linear: the scene probe's irradiance color, which the game desaturates
  // (HSV saturation capped at 0.35 for cool hues, 0.7 for warm) before it multiplies both the
  // hemisphere ambient of every variant and the IBL. Unknown for the captured frame; the
  // shader's no-probe fallbacks (_CharacterParams2 blue-white for cloth, _CharacterParams3 warm
  // for skin) tinted the whole character blue in the browser, so this starts neutral.
  ambientColor: [1, 1, 1] as [number, number, number],
  // The hemisphere that stands in for the character cubemap (`_CharMaxCubemap` did not come
  // with the rip; formulas §10): looked up along the reflected view direction by the IBL term
  // of every cloth material (formulas §1.10), which multiplies it by the environment color and
  // the captured multipliers. envRadiance is its mean radiance in the same units as
  // lightIntensity above — 1 would mean the environment is as bright as the key light — and
  // envGradient the up/down contrast around that mean, which is what gives a smooth metal its
  // dark-below/bright-above depth.
  //
  // envRadiance decides how much of a DARK material's pixel is environment rather than
  // shading, because the split-sum's bias term B reaches ~0.16 at grazing incidence whatever
  // the F0: it is additive, independent of the key light, and therefore invisible on a light
  // albedo and dominant on a black one. Both are calibration knobs until a cubemap exists.
  envGradient: 0.5,
  envRadiance: 1.0,

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

// Engine globals of the character shader, as captured with the decompiled shader (learnings
// hgrp-decompiled-formulas.md §0, table of `_CharacterParams*`). Constants, not knobs: the
// shading formulas in lighting/hgrp_npr.wgsl read them by these names, and a value here
// changes only when a capture says so. The environment color and intensity are not here: in
// the game they come from the scene's irradiance volume (the shader's no-probe fallbacks,
// _CharacterParams2 / _CharacterParams3 and _EnvironmentGlobalParams0.x, are recorded in the
// formulas document), so they are the knobs above.
export const HGRP_CHARACTER_GLOBALS = {
  // _CharacterParams0: (unread, lighting multiplier, shadow multiplier, IBL multiplier)
  characterParams0: [0, 0.9, 0.8, 0.8],
  // _CharacterParams6 / _CharacterParams7: hemisphere axis; bias, scale, floor
  hemiAxis: [0, 1, 0],
  hemiParams: [0.15, 1.5, 0.5],
  // _CharacterParams11.w: added to n.l before the ramp lookup
  rampBias: -0.4,
} as const;

// SceneLighting uniform block (core/uniforms.wgsl): seven vec4s in struct order.
export const SCENE_LIGHTING_BYTE_SIZE = 112;

export function packSceneLighting(out: Float32Array = new Float32Array(28)): Float32Array {
  const g = HGRP_CHARACTER_GLOBALS;
  const [dx, dy, dz] = sceneSettings.lightDirection;
  const len = Math.hypot(dx, dy, dz) || 1;
  out.set([dx / len, dy / len, dz / len, g.rampBias], 0);
  for (let i = 0; i < 3; i++) {
    out[4 + i] = sceneSettings.lightColor[i] * sceneSettings.lightIntensity;
  }
  out[7] = sceneSettings.ambientIntensity;
  out.set(g.characterParams0, 8);
  out.set(sceneSettings.ambientColor, 12);
  out.set(g.hemiAxis, 16);
  out.set(g.hemiParams, 20);
  out.set([sceneSettings.envGradient, sceneSettings.envRadiance, 0, 0], 24);
  return out;
}
