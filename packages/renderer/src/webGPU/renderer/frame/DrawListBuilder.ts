import { FrameData, RenderData } from '@renderer/frame/types';
import { HGRPMaterialDescriptor } from '@renderer/material/hgrp';
import { AlphaMode, WebGPUMaterialDescriptor } from '@renderer/material/types';
import { vec3 } from 'gl-matrix';
import { generateSemanticCacheKey, generateSemanticPipelineKey } from '../../core/pipeline/types';
import { GeometryCacheItem } from '../../core/types';

// One sortable draw in the frame's ordered draw lists. Resource references are resolved in
// the prepare phase so that encoding stays fully synchronous.
export interface DrawItem {
  renderable: RenderData;
  pipelineKey: string;
  viewDepth: number;
  pipeline?: GPURenderPipeline;
  geometry?: GeometryCacheItem;
}

export interface DrawLists {
  opaque: DrawItem[];
  transparent: DrawItem[];
  // Inverted-hull outline draws (HGRP materials with _EnableOutline, opaque only): the same
  // renderables again, drawn by the single pass-private outline pipeline after the opaque
  // walk. pipelineKey is a fixed tag — outline has exactly one pipeline.
  outline: DrawItem[];
}

// Plain code-unit comparison: sort keys are opaque cache ids, locale rules must not apply.
function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

/**
 * Build the frame's ordered draw lists. Opaque draws are sorted by state-change cost
 * (renderOrder stays the outermost contract); transparent (blend) draws are sorted strictly
 * back-to-front — blending correctness outranks state dedup.
 * Ordering contract: docs/renderer-frame-contract.md.
 */
export function buildDrawLists(frameData: FrameData): DrawLists {
  const opaque: DrawItem[] = [];
  const transparent: DrawItem[] = [];
  const outline: DrawItem[] = [];
  const viewMatrix = frameData.scene.camera.viewMatrix;

  for (const renderable of frameData.renderables) {
    const semanticKey = generateSemanticPipelineKey(
      renderable.material as WebGPUMaterialDescriptor,
      renderable.geometryData,
    );
    const item: DrawItem = {
      renderable,
      pipelineKey: generateSemanticCacheKey(semanticKey),
      viewDepth: 0,
    };

    if ((renderable.material as { alphaMode?: AlphaMode }).alphaMode === 'blend') {
      item.viewDepth = computeViewDepth(renderable, viewMatrix);
      transparent.push(item);
    } else {
      opaque.push(item);

      if (
        renderable.material.materialType === 'hgrp' &&
        (renderable.material as HGRPMaterialDescriptor).floats._EnableOutline === 1
      ) {
        outline.push({ renderable, pipelineKey: 'hgrp_outline', viewDepth: 0 });
      }
    }
  }

  opaque.sort(
    (a, b) =>
      a.renderable.renderOrder - b.renderable.renderOrder ||
      compareKeys(a.pipelineKey, b.pipelineKey) ||
      compareKeys(a.renderable.materialKey, b.renderable.materialKey) ||
      compareKeys(a.renderable.geometryId, b.renderable.geometryId),
  );
  transparent.sort(
    (a, b) => a.renderable.renderOrder - b.renderable.renderOrder || b.viewDepth - a.viewDepth,
  );
  outline.sort(
    (a, b) =>
      compareKeys(a.renderable.materialKey, b.renderable.materialKey) ||
      compareKeys(a.renderable.geometryId, b.renderable.geometryId),
  );

  return { opaque, transparent, outline };
}
