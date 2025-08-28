import {
  ActiveCameraTag,
  Camera3DComponent,
  Input3DComponent,
  Input3DSystem,
  Mesh3DComponent,
  PhysicsComponent,
  PhysicsSystem,
  StatsComponent,
  Transform3DComponent,
  Transform3DSystem,
  WebGPU3DRenderComponent,
  WebGPURenderSystem,
  World,
} from '@ecs';
import chroma from 'chroma-js';
import { Game } from './game/Game';

// Start the application when the page loads
window.addEventListener('load', () => {
  // new PhysicsEngineApp();
  main();
});

async function main() {
  const rootElement = document.body;

  const game = new Game();
  const world = game.getWorld();

  world.addSystem(new Input3DSystem(rootElement));
  world.addSystem(new Transform3DSystem());
  world.addSystem(new PhysicsSystem());
  world.addSystem(new WebGPURenderSystem(rootElement));

  create3DCamera(world);
  cretePlane(world);

  // Initialize the game
  await game.initialize();

  game.start();

  // @ts-ignore
  window.game = game;
}

function create3DCamera(world: World) {
  const camera = world.createEntity('camera');

  // Add camera component with 3D properties
  camera.addComponent(
    world.createComponent(Camera3DComponent, {
      fov: 75,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
      projectionMode: 'perspective',
      cameraMode: 'custom',
    }),
  );

  // Add transform component for position/rotation
  camera.addComponent(
    world.createComponent(Transform3DComponent, {
      position: [0, 5, 10], // Start camera at a better position
    }),
  );

  // Mark as active camera
  camera.addComponent(world.createComponent(ActiveCameraTag, {}));

  camera.addComponent(world.createComponent(PhysicsComponent, { velocity: [0, 0, 0] }));

  // Add input component for camera control
  camera.addComponent(
    world.createComponent(Input3DComponent, {
      mouseSensitivity: 0.1,
      moveSpeed: 1,
      sprintSpeed: 5,
      jumpForce: 3,
      gravity: 9.81,
    }),
  );

  camera.addComponent(world.createComponent(StatsComponent, { moveSpeedMultiplier: 1 }));

  world.addEntity(camera);
  return camera;
}

function cretePlane(world: World) {
  const plane = world.createEntity('object');
  plane.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: { type: 'plane', params: { sx: 30, sy: 40, nx: 3, ny: 4, direction: 'y' } },
    }),
  );
  plane.addComponent(world.createComponent(Transform3DComponent, { position: [0, 0, -5] }));
  plane.addComponent(
    world.createComponent(WebGPU3DRenderComponent, {
      material: {
        albedo: chroma('#000000'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
      },
    }),
  );

  world.addEntity(plane);
  return plane;
}
