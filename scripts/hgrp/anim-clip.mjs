/**
 * Unity `.anim` YAML reader — the transform curves only.
 *
 * A line-based reader rather than a YAML parse: the usable clips are 30-40MB of keyframes
 * and only four fields per key matter. Also survives Unity's `∞` tangents, which trip
 * strict YAML number parsing.
 *
 * Only Generic clips carry readable curves. Optimized/muscle clips serialize their samples
 * into a binary `m_MuscleClip` blob that AssetRipper does not export, leaving
 * `m_RotationCurves: []` and a binding table of CRC32 path hashes — findCurveClips() exists
 * to tell the two apart before anyone spends time on a file.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const CURVE_SECTIONS = {
  m_RotationCurves: 'rotation',
  m_PositionCurves: 'translation',
  m_ScaleCurves: 'scale',
};

function parseComponents(body) {
  const out = {};
  for (const match of body.matchAll(/([xyzw]):\s*([^,}]+)/g)) {
    const raw = match[2].trim();
    out[match[1]] =
      raw === 'Infinity' || raw === '-Infinity' || raw.includes('∞')
        ? raw.startsWith('-')
          ? -Infinity
          : Infinity
        : Number.parseFloat(raw);
  }
  return out;
}

export async function parseAnimClip(file) {
  const reader = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  const curves = [];
  let section = null;
  let curve = null;
  let key = null;
  let inSettings = false;
  let name = path.basename(file, '.anim');
  let sampleRate = 60;
  let stopTime = 0;

  for await (const line of reader) {
    // Any top-level key (indent 2) closes the current curve section
    const topLevel = line.match(/^ {2}([a-zA-Z_]+):(.*)$/);
    if (topLevel) {
      if (curve) {
        curves.push(curve);
        curve = null;
      }
      const field = topLevel[1];
      inSettings = field === 'm_AnimationClipSettings';
      section =
        CURVE_SECTIONS[field] && !topLevel[2].trim().startsWith('[]')
          ? CURVE_SECTIONS[field]
          : null;
      if (field === 'm_Name') name = topLevel[2].trim() || name;
      if (field === 'm_SampleRate') sampleRate = Number.parseFloat(topLevel[2]) || 60;
      continue;
    }

    if (inSettings) {
      const stop = line.match(/^ {4}m_StopTime:\s*(\S+)/);
      if (stop) stopTime = Number.parseFloat(stop[1]);
      continue;
    }
    if (!section) continue;

    if (line === '  - curve:') {
      if (curve) curves.push(curve);
      curve = { path: null, kind: section, keys: [] };
      key = null;
      continue;
    }
    if (!curve) continue;

    // `path` trails the keyframe list, so it closes the curve's data
    const target = line.match(/^ {4}path:\s*(.*)$/);
    if (target) {
      curve.path = target[1].trim();
      continue;
    }
    if (/^ {6}- serializedVersion:/.test(line)) {
      key = {};
      curve.keys.push(key);
      continue;
    }
    if (!key) continue;

    const time = line.match(/^ {8}time:\s*(\S+)/);
    if (time) {
      key.time = Number.parseFloat(time[1]);
      continue;
    }
    const vector = line.match(/^ {8}(value|inSlope|outSlope):\s*\{(.*)\}/);
    if (vector) key[vector[1]] = parseComponents(vector[2]);
  }
  if (curve) curves.push(curve);

  return {
    name,
    sampleRate,
    duration: stopTime,
    curves: curves.filter((entry) => entry.path !== null && entry.keys.length > 0),
  };
}

/**
 * Evaluate one component of a Unity AnimationCurve at `time` (cubic Hermite between keys).
 * An infinite tangent on either side of a span is Unity's stepped-tangent encoding, so the
 * span holds the left key's value.
 */
export function evaluateComponent(keys, axis, time) {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (time <= first.time) return first.value[axis];
  if (time >= last.time) return last.value[axis];

  let low = 0;
  let high = keys.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (keys[mid].time <= time) low = mid + 1;
    else high = mid;
  }
  const k2 = keys[low];
  const k1 = keys[low - 1];

  const span = k2.time - k1.time;
  if (span <= 0) return k2.value[axis];

  const outSlope = k1.outSlope?.[axis] ?? 0;
  const inSlope = k2.inSlope?.[axis] ?? 0;
  if (!Number.isFinite(outSlope) || !Number.isFinite(inSlope)) return k1.value[axis];

  const u = (time - k1.time) / span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * k1.value[axis] +
    (u3 - 2 * u2 + u) * outSlope * span +
    (u3 - u2) * inSlope * span +
    (-2 * u3 + 3 * u2) * k2.value[axis]
  );
}

/** Clips whose curve data actually survived the rip (see the module comment). */
export function findCurveClips(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.anim'))
    .filter(
      (file) => !fs.readFileSync(path.join(dir, file), 'utf8').includes('m_RotationCurves: []'),
    );
}
