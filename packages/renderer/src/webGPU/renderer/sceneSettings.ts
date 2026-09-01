// Global scene presentation controls, mutated by stages and the calibration GUI
// (module-scoped singleton, same rule as tonemapSettings — pass-level state that belongs
// to no material or entity).
export const sceneSettings = {
  // Background of the HDR scene target, in LINEAR light — it runs through exposure x ACES
  // and the sRGB encode like every shaded pixel. Default black; showcase stages set a
  // bright studio grey so the character can be compared against in-game screenshots.
  clearColor: [0, 0, 0] as [number, number, number],
};
