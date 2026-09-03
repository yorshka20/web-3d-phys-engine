import { FrameData, RenderData } from '../../../frame/types';
import { HGRPMaterialDescriptor, hgrpPermutationEnables } from '../../../material/hgrp';
import { AlphaMode, WebGPUMaterialDescriptor } from '../../../material/types';
import { vec3 } from 'gl-matrix';
import { generateSemanticCacheKey, generateSemanticPipelineKey } from '../../core/pipeline/types';
import { GeometryCacheItem } from '../../core/types';

/**
 * One sortable draw in the frame's ordered draw lists.
 *
 * Built by `buildDrawLists` with only the fields ordering needs; the GPU resource references
 * are filled in later, during each pass's async prepare phase, so that encoding can stay
 * fully synchronous. Ordering contract: docs/renderer-frame-contract.md.
 */
export interface DrawItem {
  /** The renderable this draw comes from. One renderable can appear in several lists. */
  renderable: RenderData;
  /**
   * Sort key standing in for pipeline identity. For the opaque/transparent walks it is the
   * semantic cache key, so equal keys are one pipeline and sort adjacent. Draws routed to a
   * pass-private stage carry that stage's fixed tag instead (`STAGE_TAG`): the stage builds
   * and binds its own pipeline, so the value is only a label.
   */
  pipelineKey: string;
  /** View-space distance for back-to-front ordering; 0 for lists that do not sort by depth. */
  viewDepth: number;
  /** `_TransparentSortPriority`: higher renders later (on top), between renderOrder and depth. */
  sortPriority?: number;
  /** Resolved in the prepare phase — see the interface note. */
  pipeline?: GPURenderPipeline;
  /** Resolved in the prepare phase — see the interface note. */
  geometry?: GeometryCacheItem;
}

/**
 * The frame's draws, split by the order ForwardPass has to encode them in.
 *
 * A renderable lands in exactly one of `opaque` / `transparent` / `eyeOverlay` (its main
 * draw), and may additionally appear in the hull and stencil lists, which re-draw the same
 * geometry with a different pipeline.
 */
export interface DrawLists {
  /**
   * Main draws of every non-blend material, encoded first. Sorted by state-change cost
   * (renderOrder stays the outermost contract), since depth testing makes their order
   * otherwise free.
   */
  opaque: DrawItem[];
  /**
   * Main draws of every blend material, encoded after the opaque walk and the stages that
   * depend on opaque depth. Sorted strictly back-to-front — blending correctness outranks
   * state dedup.
   */
  transparent: DrawItem[];
  /**
   * Inverted-hull outline draws of the non-blend materials with `_EnableOutline`, encoded
   * right after the opaque walk. One pipeline per distinct `_OutlineZTest`
   * (see HGRPOutlineStage).
   *
   * The hull is meant to show only in the silhouette ring, and what rejects it everywhere
   * else is the object's OWN depth — which is why the list is split by walk rather than
   * being one list encoded at one point.
   */
  outline: DrawItem[];
  /**
   * Inverted-hull outline draws of the blend materials with `_EnableOutline`, encoded after
   * the transparent walk for the reason above: encoded any earlier, the shell would pass the
   * depth test across the whole silhouette and fill it with outline color instead of ringing
   * it. What puts a blend material's depth in the buffer in time is `_TransparentDepthWrite`,
   * which every material reaching this list carries.
   */
  transparentOutline: DrawItem[];
  /**
   * Iris draws, encoded after the opaque walk with a depth-biased projection
   * (see HGRPEyeOverlayStage) instead of taking part in the opaque walk at all.
   *
   * Membership is the descriptor's declared `eyeLayer` within the `_PreZStencilRefOption`
   * show-through group; the brow shares that group but stays an ordinary opaque draw. The
   * 36 group (cloth/hair) is a different system.
   */
  eyeOverlay: DrawItem[];
  /**
   * Brow-through compositing, encoded as a pair after the eye overlay
   * (see HGRPBrowCompositeStage): `hairStencil` is the hair whose permutation enables
   * browThrough (`_DrawUnderBrow` with its sw_M mask present), stamping a masked stencil
   * mark; `browThrough` is the brow re-drawing where that mark says it is occluded. The brow
   * also keeps its ordinary draw in `opaque`.
   */
  hairStencil: DrawItem[];
  browThrough: DrawItem[];
}

/**
 * `pipelineKey` of a draw routed to a pass-private stage. The stage owns its pipeline, so
 * these are labels for debugging and for keeping the field non-empty, not cache keys.
 */
const STAGE_TAG = {
  outline: 'hgrp_outline',
  eyeOverlay: 'hgrp_eye_overlay',
  hairStencil: 'hgrp_hair_stencil',
  browThrough: 'hgrp_brow_through',
} as const;

// Plain code-unit comparison: sort keys are opaque cache ids, locale rules must not apply.
function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Cheapest encode order for draws whose visual result does not depend on order: group the
 * draws that share a material, then those that share geometry, so the encode walk re-binds
 * as rarely as possible. Every list but `transparent` uses it.
 */
function byStateCost(a: DrawItem, b: DrawItem): number {
  return (
    compareKeys(a.renderable.materialKey, b.renderable.materialKey) ||
    compareKeys(a.renderable.geometryId, b.renderable.geometryId)
  );
}

const scratchBoundsCenter = vec3.create();

/**
 * View-space distance of the geometry bounds center, for transparent draw ordering
 */
function computeViewDepth(renderable: RenderData, viewMatrix: Float32Array): number {
  const { min, max } = renderable.geometryData.bounds;
  vec3.set(
    scratchBoundsCenter,
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  );
  vec3.transformMat4(scratchBoundsCenter, scratchBoundsCenter, renderable.worldMatrix);
  vec3.transformMat4(scratchBoundsCenter, scratchBoundsCenter, viewMatrix);
  // Camera looks down -Z in view space, so distance in front of the camera is -z
  return -scratchBoundsCenter[2];
}

/** The HGRP descriptor behind a renderable, or undefined for every other material family. */
function hgrpMaterialOf(renderable: RenderData): HGRPMaterialDescriptor | undefined {
  return renderable.material.materialType === 'hgrp'
    ? (renderable.material as HGRPMaterialDescriptor)
    : undefined;
}

/** A draw that a pass-private stage encodes: fixed tag, no depth ordering. */
function stageDraw(renderable: RenderData, tag: string): DrawItem {
  return { renderable, pipelineKey: tag, viewDepth: 0 };
}

/**
 * Build the frame's ordered draw lists. Routing (which lists a renderable joins) and ordering
 * (how each list is sorted) are kept apart on purpose: the first is material semantics, the
 * second is a property of the pass that encodes the list.
 */
export function buildDrawLists(frameData: FrameData): DrawLists {
  const lists: DrawLists = {
    opaque: [],
    transparent: [],
    outline: [],
    transparentOutline: [],
    eyeOverlay: [],
    hairStencil: [],
    browThrough: [],
  };
  const viewMatrix = frameData.scene.camera.viewMatrix;

  for (const renderable of frameData.renderables) {
    route(renderable, lists, viewMatrix);
  }

  lists.opaque.sort(
    (a, b) =>
      a.renderable.renderOrder - b.renderable.renderOrder ||
      compareKeys(a.pipelineKey, b.pipelineKey) ||
      byStateCost(a, b),
  );
  lists.transparent.sort(
    (a, b) =>
      a.renderable.renderOrder - b.renderable.renderOrder ||
      (a.sortPriority ?? 0) - (b.sortPriority ?? 0) ||
      b.viewDepth - a.viewDepth,
  );
  // The hulls write depth and test against it, so overlapping shells resolve correctly
  // whatever order they are encoded in — state cost is the only thing left to optimize.
  lists.outline.sort(byStateCost);
  lists.transparentOutline.sort(byStateCost);
  lists.eyeOverlay.sort(byStateCost);
  lists.hairStencil.sort(byStateCost);
  lists.browThrough.sort(byStateCost);

  return lists;
}

/** Which lists one renderable joins. */
function route(renderable: RenderData, lists: DrawLists, viewMatrix: Float32Array): void {
  const material = hgrpMaterialOf(renderable);

  // An optional material layer this character has not unlocked (HGRPCharacterFlags) draws
  // nowhere at all.
  if (material?.enabled === false) {
    return;
  }

  // The iris leaves the opaque walk entirely rather than joining it as well.
  if (material?.eyeLayer === 'iris' && material.floats._PreZStencilRefOption !== undefined) {
    lists.eyeOverlay.push(stageDraw(renderable, STAGE_TAG.eyeOverlay));
    return;
  }

  const isBlend = (renderable.material as { alphaMode?: AlphaMode }).alphaMode === 'blend';

  // `_EnableOutline` alone decides whether a material outlines at all; which of the two hull
  // lists it joins is a separate question about depth availability, not about outlining.
  // Gating this on the opaque branch silently dropped every blend material's outline.
  if (material?.floats._EnableOutline === 1) {
    (isBlend ? lists.transparentOutline : lists.outline).push(
      stageDraw(renderable, STAGE_TAG.outline),
    );
  }

  const semanticKey = generateSemanticPipelineKey(
    renderable.material as WebGPUMaterialDescriptor,
    renderable.geometryData,
  );
  const item: DrawItem = {
    renderable,
    pipelineKey: generateSemanticCacheKey(semanticKey),
    viewDepth: 0,
  };

  if (isBlend) {
    item.viewDepth = computeViewDepth(renderable, viewMatrix);
    item.sortPriority = material?.floats._TransparentSortPriority ?? 0;
    lists.transparent.push(item);
    return;
  }

  lists.opaque.push(item);

  if (material && hgrpPermutationEnables(material.permutation, 'browThrough')) {
    lists.hairStencil.push(stageDraw(renderable, STAGE_TAG.hairStencil));
  }
  if (material?.variant === 'CharacterNPR_Eye') {
    lists.browThrough.push(stageDraw(renderable, STAGE_TAG.browThrough));
  }
}
