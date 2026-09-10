import { Mesh3DComponent, SkeletonComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Entity } from '@ecs/core/ecs/Entity';
import { GLTFAnimation, GLTFModel, GLTFNode } from '@renderer/assets/GltfModel';
import { sampleGLTFSampler } from '@renderer/assets/gltfAnimations';
import { poseHumanoidClip } from '@renderer/assets/humanoid/binding';
import { sampleHumanoidParameters } from '@renderer/assets/humanoid/clip';
import { mat4, quat, vec3 } from 'gl-matrix';

/**
 * Samples glTF animation clips into per-entity joint palettes.
 *
 * Runs as a render system so it sits between the logic tick and the extraction in
 * WebGPURenderSystem: the palette it writes is read in the same updateRender pass, in
 * priority order, and never lags a frame behind the transforms it accompanies.
 *
 * The palette (worldMatrix(joint) * inverseBindMatrix) is the whole output — the renderer
 * uploads it verbatim, and the shader's linear-blend skinning is the only other half.
 *
 * A clip's channels write local TRS by node. A humanoid clip (GLTFAnimation.humanoid) has no
 * channels for the body: its muscle curves are solved against the model's Avatar
 * (GLTFModel.humanoid, attachHumanoidRig) into the same buffers first, so the clip's own
 * channels — the secondary bones — compose under the solved body, and a bone keyed both ways
 * takes the channel.
 */
export class SkeletalAnimationSystem extends System {
  private readonly scratchLocal = mat4.create();
  private readonly scratchTranslation = vec3.create();
  private readonly scratchRotation = quat.create();
  private readonly scratchScale = vec3.create();
  // Models a humanoid clip was asked to play on without an Avatar to solve it against; warned once
  private readonly unboundModels = new WeakSet<GLTFModel>();

  constructor() {
    super('SkeletalAnimationSystem', SystemPriorities.ANIMATION, 'render');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([SkeletonComponent, Mesh3DComponent]);

    for (const entity of entities) {
      const skeleton = entity.getComponent<SkeletonComponent>(SkeletonComponent.componentName);
      const model = this.resolveModel(entity);
      if (!skeleton || !model?.nodes || !model.roots) {
        continue;
      }

      if (!skeleton.initialized) {
        this.initializeSkeleton(skeleton, model);
      }

      const clip = model.animations?.[skeleton.clipIndex];
      if (clip && skeleton.playing) {
        skeleton.time = this.advanceTime(
          skeleton.time + deltaTime * skeleton.speed,
          clip,
          skeleton.loop,
        );
        this.applyClip(skeleton, clip, model);
      }

      this.composeWorldMatrices(skeleton, model.nodes, model.roots);
      this.composePalettes(skeleton, model);
    }
  }

  private resolveModel(entity: Entity): GLTFModel | undefined {
    const mesh = entity.getComponent<Mesh3DComponent>(Mesh3DComponent.componentName);
    if (!mesh || mesh.descriptor.type !== 'gltf') {
      return undefined;
    }
    return mesh.resolveAsset<'gltf'>()?.rawData as GLTFModel | undefined;
  }

  /**
   * Allocate the pose buffers and seed them with the document's bind pose. Deferred to the
   * first update because the asset may still be loading when the entity is created.
   */
  private initializeSkeleton(skeleton: SkeletonComponent, model: GLTFModel): void {
    const nodes = model.nodes!;
    const count = nodes.length;

    skeleton.translations = new Float32Array(count * 3);
    skeleton.rotations = new Float32Array(count * 4);
    skeleton.scales = new Float32Array(count * 3);
    skeleton.worldMatrices = new Float32Array(count * 16);

    for (let i = 0; i < count; i++) {
      skeleton.translations.set(nodes[i].translation, i * 3);
      skeleton.rotations.set(nodes[i].rotation, i * 4);
      skeleton.scales.set(nodes[i].scale, i * 3);
    }

    skeleton.palettes = (model.skins ?? []).map(
      (skin) => new Float32Array(skin.joints.length * 16),
    );
  }

  private advanceTime(time: number, clip: GLTFAnimation, loop: boolean): number {
    if (clip.duration <= 0) {
      return 0;
    }
    if (!loop) {
      return Math.min(time, clip.duration);
    }
    // Modulo rather than subtraction: a large dt (tab regains focus) must not leave the
    // clock beyond the clip
    const wrapped = time % clip.duration;
    return wrapped < 0 ? wrapped + clip.duration : wrapped;
  }

  private applyClip(skeleton: SkeletonComponent, clip: GLTFAnimation, model: GLTFModel): void {
    if (clip.humanoid) {
      if (model.humanoid) {
        poseHumanoidClip(
          model.humanoid,
          clip.humanoid,
          skeleton.time,
          skeleton.translations!,
          skeleton.rotations!,
        );
      } else if (!this.unboundModels.has(model)) {
        this.unboundModels.add(model);
        console.warn(
          `[SkeletalAnimationSystem] humanoid clip ${clip.name} plays on a model without an Avatar binding: only its secondary bones move`,
        );
      }
      sampleHumanoidParameters(clip.humanoid, skeleton.time, skeleton.parameters);
    } else if (skeleton.parameters.size > 0) {
      skeleton.parameters.clear();
    }
    for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler];
      if (!sampler || channel.path === 'weights') {
        continue;
      }

      const stride = channel.path === 'rotation' ? 4 : 3;
      const target =
        channel.path === 'rotation'
          ? skeleton.rotations!
          : channel.path === 'translation'
            ? skeleton.translations!
            : skeleton.scales!;

      sampleGLTFSampler(
        sampler,
        skeleton.time,
        stride,
        channel.path === 'rotation',
        target,
        channel.node * stride,
      );
    }
  }

  /**
   * Compose local TRS down the hierarchy. Iterative depth-first from the scene roots — a
   * glTF node graph is a forest, and recursion depth on a 300-bone rig is not worth the
   * call frames.
   */
  private composeWorldMatrices(
    skeleton: SkeletonComponent,
    nodes: GLTFNode[],
    roots: number[],
  ): void {
    const world = skeleton.worldMatrices!;
    const stack: number[] = [...roots];
    const parents: (number | -1)[] = roots.map(() => -1);

    while (stack.length > 0) {
      const index = stack.pop()!;
      const parent = parents.pop()!;

      vec3.set(
        this.scratchTranslation,
        skeleton.translations![index * 3],
        skeleton.translations![index * 3 + 1],
        skeleton.translations![index * 3 + 2],
      );
      quat.set(
        this.scratchRotation,
        skeleton.rotations![index * 4],
        skeleton.rotations![index * 4 + 1],
        skeleton.rotations![index * 4 + 2],
        skeleton.rotations![index * 4 + 3],
      );
      vec3.set(
        this.scratchScale,
        skeleton.scales![index * 3],
        skeleton.scales![index * 3 + 1],
        skeleton.scales![index * 3 + 2],
      );
      mat4.fromRotationTranslationScale(
        this.scratchLocal,
        this.scratchRotation,
        this.scratchTranslation,
        this.scratchScale,
      );

      const target = world.subarray(index * 16, index * 16 + 16);
      if (parent < 0) {
        target.set(this.scratchLocal);
      } else {
        mat4.multiply(
          target as unknown as mat4,
          world.subarray(parent * 16, parent * 16 + 16) as unknown as mat4,
          this.scratchLocal,
        );
      }

      for (const child of nodes[index].children) {
        stack.push(child);
        parents.push(index);
      }
    }
  }

  private composePalettes(skeleton: SkeletonComponent, model: GLTFModel): void {
    const skins = model.skins ?? [];
    for (let s = 0; s < skins.length; s++) {
      const skin = skins[s];
      const palette = skeleton.palettes[s];
      for (let j = 0; j < skin.joints.length; j++) {
        mat4.multiply(
          palette.subarray(j * 16, j * 16 + 16) as unknown as mat4,
          skeleton.worldMatrices!.subarray(
            skin.joints[j] * 16,
            skin.joints[j] * 16 + 16,
          ) as unknown as mat4,
          skin.inverseBindMatrices.subarray(j * 16, j * 16 + 16) as unknown as mat4,
        );
      }
    }
  }
}
