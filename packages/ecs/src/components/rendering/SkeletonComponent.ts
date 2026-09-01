import { Component } from '@ecs/core/ecs/Component';

/**
 * Skeletal pose state for a glTF-sourced skinned model, plus the playback intent that drives
 * it. Buffers are allocated lazily by SkeletalAnimationSystem once the asset is resolvable —
 * their sizes come from the document's node and joint counts, so the component cannot size
 * them at construction.
 *
 * Pose and playback live in one component because a skeleton has exactly one active clip
 * today; blending would introduce its own state and can split out then.
 */
export interface SkeletonComponentProps {
  clipIndex?: number;
  speed?: number;
  loop?: boolean;
  playing?: boolean;
}

export class SkeletonComponent extends Component {
  static componentName = 'Skeleton';

  // Playback intent
  clipIndex: number;
  time: number = 0;
  speed: number;
  loop: boolean;
  playing: boolean;

  // Local pose, one entry per document node, initialized from the bind pose and overwritten
  // by the animation channels each frame. Kept as TRS because channels drive them separately.
  translations?: Float32Array; // 3 per node
  rotations?: Float32Array; // 4 per node, quaternion xyzw
  scales?: Float32Array; // 3 per node

  worldMatrices?: Float32Array; // 16 per node, composed down the hierarchy

  // One joint palette per document skin: worldMatrix(joint) * inverseBindMatrix(joint).
  // Uploaded verbatim as the skinning storage buffer.
  palettes: Float32Array[] = [];

  constructor(props: SkeletonComponentProps = {}) {
    super(SkeletonComponent.componentName);
    this.clipIndex = props.clipIndex ?? 0;
    this.speed = props.speed ?? 1;
    this.loop = props.loop ?? true;
    this.playing = props.playing ?? true;
  }

  get initialized(): boolean {
    return this.worldMatrices !== undefined;
  }

  reset(): void {
    super.reset();
    this.clipIndex = 0;
    this.time = 0;
    this.speed = 1;
    this.loop = true;
    this.playing = true;
    this.translations = undefined;
    this.rotations = undefined;
    this.scales = undefined;
    this.worldMatrices = undefined;
    this.palettes = [];
  }
}
