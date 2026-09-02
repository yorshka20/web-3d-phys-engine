// World scale of the current draw, read off the model matrix (length of its first column; the
// stage applies uniform scales only — global stage scale x per-character scale). Every HGRP
// constant that is a length is authored in the ASSET's metre space (a character ≈ 1.7 tall)
// and multiplied by this at its use site, so the stage can be rescaled freely without
// retuning shaders. The 10x stage of 2026-09-01 had to hand-scale three such constants and
// scale them back when the stage returned to 1x; this function is what removes that coupling.
fn hgrp_model_scale() -> f32 {
    return length(mvp.model_matrix[0].xyz);
}
