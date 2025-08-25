import {
  DeathMarkComponent,
  HealthComponent,
  StateComponent,
  TransformComponent,
} from '@ecs/components';
import { ItemDropRate } from '@ecs/constants/itemDropRate';
import { PowerupStats, WeaponMap } from '@ecs/constants/resources';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { SoundManager } from '@ecs/core/resources/SoundManager';
import { GameStore } from '@ecs/core/store/GameStore';
import { createItemEntity } from '@ecs/entities/Item';
import { SystemPriorities } from '../../constants/systemPriorities';

export class DeathSystem extends System {
  private dropItemsMap: { rate: number; create: (position: [number, number]) => void }[] = [];
  private gameStore: GameStore;

  constructor() {
    super('DeathSystem', SystemPriorities.DEATH, 'logic');
    this.dropItemsMap = [
      {
        rate: ItemDropRate.HEALTH,
        create: (position) => this.createHealthPickup(position[0], position[1], 20),
      },
      {
        rate: ItemDropRate.WEAPON,
        create: (position) => this.createWeaponPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.POWERUP,
        create: (position) => this.createPowerupPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.MAGNET,
        create: (position) => this.createMagnetPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.GLOBAL_PULL,
        create: (position) => this.createGlobalPullPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.LASER_BURST,
        create: (position) => this.createLaserBurstPickup(position[0], position[1]),
      },
    ];
    // Track kills for elite spawn logic
    this.gameStore = GameStore.getInstance();
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesByType('enemy');
    const entitiesToRemove: Entity[] = [];

    for (const entity of entities) {
      // Check for death mark first
      if (entity.hasComponent(DeathMarkComponent.componentName)) {
        // Play death sound if entity has sound effect component
        SoundManager.playSound(entity, 'death');
        // Drop items
        this.dropItems(entity);
        entitiesToRemove.push(entity);
        continue;
      }

      // Only check health if no death mark
      if (entity.hasComponent(HealthComponent.componentName)) {
        const health = entity.getComponent<HealthComponent>(HealthComponent.componentName);
        if (health.isDead && !entity.hasComponent(DeathMarkComponent.componentName)) {
          // Add death mark to ensure consistent handling
          entity.addComponent(this.world.createComponent(DeathMarkComponent, undefined));
          entitiesToRemove.push(entity);
        }
      }
    }

    // Remove dead entities
    for (const entity of entitiesToRemove) {
      // Increment kill counter for normal enemies only (exclude elite/boss/legendary)
      const state = entity.getComponent<StateComponent>(StateComponent.componentName);
      const type = state?.getEnemyType?.();
      if (type === undefined || type === 'normal' || type === 'magic') {
        this.gameStore.incrementNormalEnemyKills(1);
      }
      this.world.removeEntity(entity);
    }
  }

  private dropItems(enemy: Entity): void {
    const transform = enemy.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!transform) return;

    const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
    const position = transform.getPosition();

    // Always drop experience
    this.createExperienceGem(
      position[0],
      position[1],
      10 * health.maxHealth + Math.floor(Math.random() * 20),
    );

    // Chance for other drops
    const dropChance = Math.random();
    let accumulatedChance = 0;

    // Judge which item should drop based on ItemDropRate
    const judgeDrop = (chance: number): boolean => {
      const dropped = dropChance < accumulatedChance;
      accumulatedChance += chance;
      return dropped;
    };

    for (const config of this.dropItemsMap) {
      if (judgeDrop(config.rate)) {
        config.create(position);
        break;
      }
    }
  }

  private createExperienceGem(x: number, y: number, value: number): void {
    const gem = createItemEntity(this.world, {
      position: [x, y],
      type: 'experience',
      value,
      pullable: true,
    });

    this.world.addEntity(gem);
  }

  private createHealthPickup(x: number, y: number, value: number): void {
    const health = createItemEntity(this.world, {
      position: [x, y],
      type: 'health',
      value,
      pullable: true,
    });

    this.world.addEntity(health);
  }

  private createWeaponPickup(x: number, y: number): void {
    // const randomWeapon = WeaponList[Math.floor(Math.random() * WeaponList.length)];
    const randomWeapon = WeaponMap.Laser;

    const weapon = createItemEntity(this.world, {
      position: [x, y],
      type: 'weapon',
      weapon: [randomWeapon],
      pullable: false,
    });

    this.world.addEntity(weapon);
  }

  private createPowerupPickup(x: number, y: number): void {
    const randomPowerup = PowerupStats[Math.floor(Math.random() * PowerupStats.length)];
    const powerup = createItemEntity(this.world, {
      position: [x, y],
      type: 'powerup',
      powerup: randomPowerup,
      pullable: true,
    });

    this.world.addEntity(powerup);
  }

  private createMagnetPickup(x: number, y: number): void {
    const pickup = createItemEntity(this.world, {
      position: [x, y],
      type: 'magnet',
      pullable: true,
      value: 0.01,
    });

    this.world.addEntity(pickup);
  }

  private createGlobalPullPickup(x: number, y: number): void {
    const pickup = createItemEntity(this.world, {
      position: [x, y],
      type: 'globalPull',
      size: [40, 40],
      pullable: false,
    });

    this.world.addEntity(pickup);
  }

  private createLaserBurstPickup(x: number, y: number): void {
    const pickup = createItemEntity(this.world, {
      position: [x, y],
      type: 'laserBurst',
      size: [40, 40],
      pullable: false,
    });

    this.world.addEntity(pickup);
  }
}
