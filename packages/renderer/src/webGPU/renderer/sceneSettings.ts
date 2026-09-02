// Global scene presentation controls, mutated by stages and the calibration GUI
// (module-scoped singleton, same rule as tonemapSettings — pass-level state that belongs
// to no material or entity).
export const sceneSettings = {
  // Background of the HDR scene target, in LINEAR light — it runs through exposure x ACES
  // and the sRGB encode like every shaded pixel. Default black; showcase stages set a
  // bright studio grey so the character can be compared against in-game screenshots.
  clearColor: [0, 0, 0] as [number, number, number],

  // The one directional key light the NPR shading reads (n.l, SDF threshold, spec half
  // vector, rim light side) and the flat ambient term added on top of it, uploaded once per
  // frame as the HGRP group-3 SceneLighting uniform. The ripped materials describe surfaces,
  // not the scene: every value here is a calibration knob against in-game screenshots
  // (guess ledger A1/A7). The 0.75 / 0.25 split keeps a fully lit surface at exactly its
  // albedo while lifting the shadow side — without any ambient, metallic zones (silver
  // fabric) went black wherever the key light did not reach.
  lightDirection: [0.5, 1, 0.5] as [number, number, number], // toward the light, world space
  lightColor: [1, 1, 1] as [number, number, number],
  lightIntensity: 0.75,
  ambientColor: [1, 1, 1] as [number, number, number],
  ambientIntensity: 0.25,
};

// SceneLighting uniform block (core/uniforms.wgsl): three vec4s — the normalized light
// direction, the key light color pre-multiplied by its intensity, the ambient color
// pre-multiplied by its intensity.
export const SCENE_LIGHTING_BYTE_SIZE = 48;

export function packSceneLighting(out: Float32Array = new Float32Array(12)): Float32Array {
  const [dx, dy, dz] = sceneSettings.lightDirection;
  const len = Math.hypot(dx, dy, dz) || 1;
  out[0] = dx / len;
  out[1] = dy / len;
  out[2] = dz / len;
  out[3] = 0;
  for (let i = 0; i < 3; i++) {
    out[4 + i] = sceneSettings.lightColor[i] * sceneSettings.lightIntensity;
    out[8 + i] = sceneSettings.ambientColor[i] * sceneSettings.ambientIntensity;
  }
  out[7] = 0;
  out[11] = 0;
  return out;
}
