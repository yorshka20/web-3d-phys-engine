/**
 * Evaluate an FBX clip's node transforms over time, in the FBX's own world frame.
 *
 * The export writes a clip as the character's node hierarchy (`Model` objects, plain
 * translation / Euler rotation / scale, no pivots or pre-rotations) and one animation stack
 * whose curves key those properties. Rotation is Euler XYZ in degrees, and Unity's key times
 * are kept, which leaves slowly moving joints keyed sparsely: interpolating such keys in
 * Euler space is not the geodesic the source quaternion curve followed (an arm swinging 90°
 * between two keys visits orientations 0.4 m off at the hand), so every rotation curve is
 * turned into quaternion keys at its key times and interpolated as quaternions.
 */

import { mat4, quat, vec3 } from 'gl-matrix';
import { fbxChildren } from './fbx-read.mjs';

const FBX_TICKS_PER_SECOND = 46186158000;

// FbxTime::EMode -> frames per second; 14 (custom) reads GlobalSettings.CustomFrameRate
const FRAME_RATES = {
  0: 30,
  1: 120,
  2: 100,
  3: 60,
  4: 50,
  5: 48,
  6: 30,
  7: 30,
  8: 29.97,
  9: 29.97,
  10: 25,
  11: 24,
  12: 1000,
  13: 23.976,
  15: 96,
  16: 72,
  17: 59.94,
  18: 119.88,
};

function objects(tree) {
  return tree.nodes.find((node) => node.name === 'Objects')?.children ?? [];
}

function connections(tree) {
  return tree.nodes.find((node) => node.name === 'Connections')?.children ?? [];
}

function objectName(node) {
  return typeof node.props[1] === 'string' ? node.props[1].split('\0')[0] : '';
}

function properties70(node) {
  const map = new Map();
  for (const property of fbxChildren(node, 'Properties70')[0]?.children ?? []) {
    if (property.name === 'P') map.set(property.props[0], property.props.slice(4));
  }
  return map;
}

const UNSUPPORTED_TRANSFORM_PROPERTIES = [
  'PreRotation',
  'PostRotation',
  'RotationOffset',
  'RotationPivot',
  'ScalingOffset',
  'ScalingPivot',
  'GeometricTranslation',
  'GeometricRotation',
  'GeometricScaling',
];

/**
 * The node hierarchy: id -> { name, parent, translation, rotation (Euler XYZ degrees), scale }.
 * Roots are the models with no model parent.
 */
export function fbxHierarchy(tree) {
  const nodes = new Map();
  for (const model of objects(tree).filter((node) => node.name === 'Model')) {
    const props = properties70(model);
    for (const key of UNSUPPORTED_TRANSFORM_PROPERTIES) {
      const value = props.get(key);
      if (value && value.some((v) => Math.abs(Number(v)) > 1e-9)) {
        throw new Error(`${objectName(model)}: FBX ${key} is not supported by this evaluator`);
      }
    }
    const order = Number(props.get('RotationOrder')?.[0] ?? 0);
    if (order !== 0) {
      throw new Error(
        `${objectName(model)}: FBX RotationOrder ${order} is not supported (XYZ only)`,
      );
    }
    nodes.set(model.props[0], {
      id: model.props[0],
      name: objectName(model),
      parent: undefined,
      children: [],
      translation: (props.get('Lcl Translation') ?? [0, 0, 0]).map(Number),
      rotation: (props.get('Lcl Rotation') ?? [0, 0, 0]).map(Number),
      scale: (props.get('Lcl Scaling') ?? [1, 1, 1]).map(Number),
    });
  }
  for (const connection of connections(tree)) {
    if (connection.props[0] !== 'OO') continue;
    const child = nodes.get(connection.props[1]);
    const parent = nodes.get(connection.props[2]);
    if (child && parent) {
      child.parent = parent;
      parent.children.push(child);
    }
  }
  const roots = [...nodes.values()].filter((node) => !node.parent);
  return { nodes, roots };
}

/**
 * The animation's name, time span and frame rate. The export writes the stack without a
 * time span, so the span is the extent of the curves' keys; the rate is the file's TimeMode.
 */
export function fbxTimeline(tree) {
  const stack = objects(tree).find((node) => node.name === 'AnimationStack');
  if (!stack) throw new Error('the FBX holds no animation stack');
  let start = Infinity;
  let stop = -Infinity;
  for (const curve of objects(tree).filter((node) => node.name === 'AnimationCurve')) {
    const times = fbxChildren(curve, 'KeyTime')[0]?.props[0];
    if (!times || times.length === 0) continue;
    start = Math.min(start, Number(times[0]) / FBX_TICKS_PER_SECOND);
    stop = Math.max(stop, Number(times[times.length - 1]) / FBX_TICKS_PER_SECOND);
  }
  if (!(stop >= start)) throw new Error('the FBX animation has no keys');
  const settings = properties70(
    tree.nodes.find((node) => node.name === 'GlobalSettings') ?? { children: [] },
  );
  const mode = Number(settings.get('TimeMode')?.[0] ?? 0);
  const custom = Number(settings.get('CustomFrameRate')?.[0] ?? -1);
  const fps = mode === 14 ? custom : FRAME_RATES[mode];
  if (!(fps > 0)) throw new Error(`FBX TimeMode ${mode} has no frame rate`);
  return { name: objectName(stack), start, stop, fps };
}

/** Node name path below `top` ("Root/Bip001/...") for every FBX node under it. */
export function fbxPathsBelow(top) {
  const byPath = new Map();
  const visit = (node, prefix) => {
    for (const child of node.children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      byPath.set(path, child);
      visit(child, path);
    }
  };
  visit(top, '');
  return byPath;
}

/**
 * World matrix of every node at its rest transform (the model FBX's node defaults are the
 * bind pose), keyed by node id.
 */
export function fbxRestWorlds(hierarchy) {
  const worlds = new Map();
  const local = mat4.create();
  const r = quat.create();
  const stack = [...hierarchy.roots];
  while (stack.length > 0) {
    const node = stack.pop();
    quaternionFromEulerXYZ(r, node.rotation);
    mat4.fromRotationTranslationScale(local, r, node.translation, node.scale);
    const world = mat4.create();
    if (node.parent) mat4.multiply(world, worlds.get(node.parent.id), local);
    else mat4.copy(world, local);
    worlds.set(node.id, world);
    for (const child of node.children) stack.push(child);
  }
  return worlds;
}

// Per model id: { 'Lcl Translation': { x: {t, v}, y, z }, 'Lcl Rotation': ..., 'Lcl Scaling': ... }
// with the curve node's defaults filling a component that has no curve.
function readCurves(tree) {
  const byId = new Map();
  for (const node of objects(tree)) byId.set(node.props[0], node);
  const curveNodes = new Map(); // curve node id -> { model id, property, components }
  const curveParents = [];
  for (const connection of connections(tree)) {
    if (connection.props[0] !== 'OP') continue;
    const child = byId.get(connection.props[1]);
    if (!child) continue;
    if (child.name === 'AnimationCurveNode') {
      const defaults = properties70(child);
      curveNodes.set(connection.props[1], {
        model: connection.props[2],
        property: connection.props[3],
        components: new Map(),
        defaults: {
          x: Number(defaults.get('d|X')?.[0] ?? NaN),
          y: Number(defaults.get('d|Y')?.[0] ?? NaN),
          z: Number(defaults.get('d|Z')?.[0] ?? NaN),
        },
      });
    } else if (child.name === 'AnimationCurve') {
      curveParents.push([connection.props[2], connection.props[3], child]);
    }
  }
  for (const [curveNodeId, component, curve] of curveParents) {
    const owner = curveNodes.get(curveNodeId);
    if (!owner) continue;
    const times = fbxChildren(curve, 'KeyTime')[0]?.props[0];
    const values = fbxChildren(curve, 'KeyValueFloat')[0]?.props[0];
    if (!times || !values) continue;
    owner.components.set(component.replace('d|', '').toLowerCase(), {
      t: Float64Array.from(times, (tick) => Number(tick) / FBX_TICKS_PER_SECOND),
      v: Float64Array.from(values),
    });
  }
  const perModel = new Map();
  for (const { model, property, components, defaults } of curveNodes.values()) {
    const entry = perModel.get(model) ?? {};
    entry[property] = { components, defaults };
    perModel.set(model, entry);
  }
  return perModel;
}

function sampleScalar(curve, time) {
  const { t, v } = curve;
  const last = t.length - 1;
  if (time <= t[0]) return v[0];
  if (time >= t[last]) return v[last];
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= time) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  const u = (time - t[i]) / (t[i + 1] - t[i]);
  return v[i] + (v[i + 1] - v[i]) * u;
}

function sampleVector(track, base, time, out) {
  for (const [i, component] of ['x', 'y', 'z'].entries()) {
    const curve = track.components.get(component);
    if (curve) out[i] = sampleScalar(curve, time);
    else out[i] = Number.isNaN(track.defaults[component]) ? base[i] : track.defaults[component];
  }
  return out;
}

// Euler XYZ (degrees; X applied first) -> quaternion, the FBX eEulerXYZ convention
const scratchX = quat.create();
const scratchY = quat.create();
const scratchZ = quat.create();
export function quaternionFromEulerXYZ(out, degrees) {
  const rad = Math.PI / 180;
  quat.setAxisAngle(scratchX, [1, 0, 0], degrees[0] * rad);
  quat.setAxisAngle(scratchY, [0, 1, 0], degrees[1] * rad);
  quat.setAxisAngle(scratchZ, [0, 0, 1], degrees[2] * rad);
  quat.multiply(out, scratchY, scratchX);
  return quat.multiply(out, scratchZ, out);
}

// A rotation track re-keyed as quaternions at the union of its component key times
function quaternionTrack(track, base) {
  const times = new Set();
  for (const curve of track.components.values()) for (const t of curve.t) times.add(t);
  const keys = [...times].sort((a, b) => a - b);
  if (keys.length === 0) keys.push(0);
  const values = new Float64Array(keys.length * 4);
  const euler = [0, 0, 0];
  const q = quat.create();
  const previous = quat.create();
  keys.forEach((time, i) => {
    quaternionFromEulerXYZ(q, sampleVector(track, base, time, euler));
    // Consecutive keys must share a hemisphere or the interpolation takes the long way round
    if (i > 0 && quat.dot(previous, q) < 0) quat.scale(q, q, -1);
    values.set(q, i * 4);
    quat.copy(previous, q);
  });
  return { t: Float64Array.from(keys), v: values };
}

function sampleQuaternion(track, time, out) {
  const { t, v } = track;
  const last = t.length - 1;
  if (time <= t[0] || last === 0) return quat.set(out, v[0], v[1], v[2], v[3]);
  if (time >= t[last]) {
    const b = last * 4;
    return quat.set(out, v[b], v[b + 1], v[b + 2], v[b + 3]);
  }
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= time) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  const u = (time - t[i]) / (t[i + 1] - t[i]);
  return quat.slerp(out, v.subarray(i * 4, i * 4 + 4), v.subarray(i * 4 + 4, i * 4 + 8), u);
}

/**
 * An evaluator for the clip: `driven` are the node ids the animation keys; `worldAt(time)`
 * returns id -> world matrix for every node (undriven nodes at their rest transform).
 * `worldAt(time, overrides)` takes id -> world matrix for nodes posed by something other than
 * the FBX curves (a humanoid clip's muscle-solved body); their children compose under them.
 */
export function fbxClipEvaluator(tree) {
  const { nodes, roots } = fbxHierarchy(tree);
  const curves = readCurves(tree);
  const tracks = new Map();
  for (const [id, byProperty] of curves) {
    const node = nodes.get(id);
    if (!node) continue;
    const rotation = byProperty['Lcl Rotation'];
    tracks.set(id, {
      translation: byProperty['Lcl Translation'],
      rotation: rotation ? quaternionTrack(rotation, node.rotation) : undefined,
      scale: byProperty['Lcl Scaling'],
    });
  }
  const t = vec3.create();
  const r = quat.create();
  const s = vec3.create();
  const local = mat4.create();
  const restRotation = new Map(
    [...nodes.values()].map((node) => [
      node.id,
      quaternionFromEulerXYZ(quat.create(), node.rotation),
    ]),
  );
  function worldAt(time, overrides) {
    const worlds = new Map();
    const stack = [...roots];
    while (stack.length > 0) {
      const node = stack.pop();
      const override = overrides?.get(node.id);
      if (override) {
        worlds.set(node.id, mat4.clone(override));
        for (const child of node.children) stack.push(child);
        continue;
      }
      const track = tracks.get(node.id);
      if (track?.translation) sampleVector(track.translation, node.translation, time, t);
      else vec3.copy(t, node.translation);
      if (track?.rotation) sampleQuaternion(track.rotation, time, r);
      else quat.copy(r, restRotation.get(node.id));
      if (track?.scale) sampleVector(track.scale, node.scale, time, s);
      else vec3.copy(s, node.scale);
      mat4.fromRotationTranslationScale(local, r, t, s);
      const world = mat4.create();
      if (node.parent) mat4.multiply(world, worlds.get(node.parent.id), local);
      else mat4.copy(world, local);
      worlds.set(node.id, world);
      for (const child of node.children) stack.push(child);
    }
    return worlds;
  }
  return { nodes, roots, driven: new Set(tracks.keys()), worldAt };
}
