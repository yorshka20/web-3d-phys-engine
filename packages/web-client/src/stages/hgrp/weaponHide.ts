import { SkeletonComponent } from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

import { applyHGRPWeaponVisibility, hgrpStage } from './characters';

// The game hides a character's weapon per clip through the Animator parameter `WeaponHide`
// (1 in the blown / touch / bomb / grab clips), which a humanoid clip carries and
// SkeletalAnimationSystem samples into SkeletonComponent.parameters each frame. What counts as
// a weapon (`S_wpn_*`) and the user's own switch are the stage's, so the rule is applied here,
// after the animation step and before extraction.
const WEAPON_HIDE_THRESHOLD = 0.5;

export class HGRPWeaponHideSystem extends System {
  constructor() {
    super('HGRPWeaponHideSystem', SystemPriorities.ANIMATION_DRIVEN, 'render');
  }

  update(): void {
    for (const character of hgrpStage.characters) {
      const entity = character.entity;
      if (!entity || character.weaponInstances.length === 0) continue;
      const skeleton = entity.getComponent<SkeletonComponent>(SkeletonComponent.componentName);
      const hide = (skeleton?.parameters.get('WeaponHide') ?? 0) >= WEAPON_HIDE_THRESHOLD;
      applyHGRPWeaponVisibility(character, entity, hide);
    }
  }
}
