/**
 * Minimal read-only binary FBX parser: the node tree, typed-array properties, and the two
 * things the clip pipeline needs from a file without going through Blender — the skin
 * clusters' bind matrices, the `Pose` object, and the model names behind the ids they refer to.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const ARRAY_TYPES = {
  f: (buf) => new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4),
  d: (buf) => new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8),
  l: (buf) => new BigInt64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8),
  i: (buf) => new Int32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4),
  b: (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
};

export function readFbx(path) {
  const data = fs.readFileSync(path);
  if (data.toString('latin1', 0, 18) !== 'Kaydara FBX Binary') {
    throw new Error(`${path}: not a binary FBX`);
  }
  const version = data.readUInt32LE(23);
  const wide = version >= 7500;

  function readProperty(pos) {
    const kind = String.fromCharCode(data[pos]);
    pos += 1;
    switch (kind) {
      case 'Y':
        return [data.readInt16LE(pos), pos + 2];
      case 'C':
        return [data[pos] !== 0, pos + 1];
      case 'I':
        return [data.readInt32LE(pos), pos + 4];
      case 'F':
        return [data.readFloatLE(pos), pos + 4];
      case 'D':
        return [data.readDoubleLE(pos), pos + 8];
      case 'L':
        return [data.readBigInt64LE(pos), pos + 8];
      case 'S':
      case 'R': {
        const length = data.readUInt32LE(pos);
        const raw = data.subarray(pos + 4, pos + 4 + length);
        return [kind === 'S' ? raw.toString('utf8') : raw, pos + 4 + length];
      }
      case 'f':
      case 'd':
      case 'l':
      case 'i':
      case 'b': {
        const count = data.readUInt32LE(pos);
        const encoding = data.readUInt32LE(pos + 4);
        const byteLength = data.readUInt32LE(pos + 8);
        let raw = data.subarray(pos + 12, pos + 12 + byteLength);
        if (encoding === 1) raw = zlib.inflateSync(raw);
        // Copy so the view is aligned whatever offset the record sits at
        const copy = Buffer.from(raw);
        const array = ARRAY_TYPES[kind](copy);
        if (array.length !== count) throw new Error(`${path}: array length mismatch`);
        return [array, pos + 12 + byteLength];
      }
      default:
        throw new Error(`${path}: unknown FBX property type ${kind}`);
    }
  }

  function readNode(pos) {
    let end;
    let propertyCount;
    let nameLength;
    if (wide) {
      end = Number(data.readBigUInt64LE(pos));
      propertyCount = Number(data.readBigUInt64LE(pos + 8));
      nameLength = data[pos + 24];
      pos += 25;
    } else {
      end = data.readUInt32LE(pos);
      propertyCount = data.readUInt32LE(pos + 4);
      nameLength = data[pos + 12];
      pos += 13;
    }
    if (end === 0) return undefined;
    const name = data.toString('latin1', pos, pos + nameLength);
    pos += nameLength;
    const props = [];
    for (let i = 0; i < propertyCount; i++) {
      const [value, next] = readProperty(pos);
      props.push(value);
      pos = next;
    }
    const children = [];
    while (pos < end) {
      const child = readNode(pos);
      if (!child) break;
      children.push(child);
      pos = child.end;
    }
    return { name, props, children, end };
  }

  const nodes = [];
  let pos = 27;
  while (pos < data.length) {
    const node = readNode(pos);
    if (!node) break;
    nodes.push(node);
    pos = node.end;
  }
  return { version, nodes };
}

export function fbxChildren(node, name) {
  return node.children.filter((child) => child.name === name);
}

function fbxObjects(tree) {
  const objects = tree.nodes.find((node) => node.name === 'Objects');
  return objects ? objects.children : [];
}

// Object names are stored as "<name>\0\x01<class>"
function objectName(node) {
  return typeof node.props[1] === 'string' ? node.props[1].split('\0')[0] : '';
}

/** id -> name for every Model object. */
export function fbxModelNames(tree) {
  const names = new Map();
  for (const model of fbxObjects(tree).filter((node) => node.name === 'Model')) {
    names.set(model.props[0], objectName(model));
  }
  return names;
}

/**
 * The rest pose the file carries (a `Pose` object of type BindPose or RestPose): node name ->
 * world matrix, 16 numbers with the translation in 12..14 — FBX writes row-vector matrices,
 * whose memory layout is the column-major one gl-matrix reads. A pose stored as local
 * matrices (`Local` = 1) is not composed here and is rejected.
 */
export function fbxRestPose(tree) {
  const names = fbxModelNames(tree);
  const pose = new Map();
  for (const poseObject of fbxObjects(tree).filter((node) => node.name === 'Pose')) {
    const type = fbxChildren(poseObject, 'Type')[0]?.props[0];
    if (type !== undefined && type !== 'BindPose' && type !== 'RestPose') continue;
    for (const entry of fbxChildren(poseObject, 'PoseNode')) {
      const id = fbxChildren(entry, 'Node')[0]?.props[0];
      const matrix = fbxChildren(entry, 'Matrix')[0]?.props[0];
      const local = fbxChildren(entry, 'Local')[0]?.props[0];
      if (local)
        throw new Error('FBX pose stores local matrices, which this reader does not compose');
      const name = names.get(id);
      if (name !== undefined && matrix && matrix.length === 16) {
        pose.set(name, Float64Array.from(matrix));
      }
    }
  }
  return pose;
}

/**
 * The skin clusters' bind matrices: model id -> every TransformLink (world matrix of that bone
 * at bind time) found for it, one per cluster, duplicates collapsed. A character's node
 * defaults are its current pose, which is not the bind pose — Blender's armature importer
 * builds the rest pose from these matrices, so a bake onto that armature has to as well.
 * Meshes bound in another pose (LOD chains, props) give a bone several distinct candidates;
 * the caller picks the one its target was built from.
 */
export function fbxClusterBinds(tree) {
  const clusters = new Map();
  for (const deformer of fbxObjects(tree).filter((node) => node.name === 'Deformer')) {
    if (deformer.props[2] !== 'Cluster') continue;
    const link = fbxChildren(deformer, 'TransformLink')[0]?.props[0];
    if (link && link.length === 16) clusters.set(deformer.props[0], Float64Array.from(link));
  }
  const models = fbxModelNames(tree);
  const binds = new Map();
  const connections = tree.nodes.find((node) => node.name === 'Connections')?.children ?? [];
  for (const connection of connections) {
    if (connection.props[0] !== 'OO') continue;
    const bone = connection.props[1];
    const link = clusters.get(connection.props[2]);
    if (!link || !models.has(bone)) continue;
    const candidates = binds.get(bone) ?? [];
    const known = candidates.some((candidate) => {
      for (let i = 0; i < 16; i++) if (Math.abs(candidate[i] - link[i]) > 1e-4) return false;
      return true;
    });
    if (!known) candidates.push(link);
    binds.set(bone, candidates);
  }
  return binds;
}

/** GlobalSettings.UnitScaleFactor, or undefined. */
export function fbxUnitScale(tree) {
  const settings = tree.nodes.find((node) => node.name === 'GlobalSettings');
  const properties = settings && fbxChildren(settings, 'Properties70')[0];
  for (const property of properties?.children ?? []) {
    if (property.name === 'P' && property.props[0] === 'UnitScaleFactor') {
      return Number(property.props[property.props.length - 1]);
    }
  }
  return undefined;
}
