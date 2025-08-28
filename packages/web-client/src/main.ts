import {
  Camera3DComponent,
  Input3DComponent,
  Input3DSystem,
  Transform3DComponent,
  WebGPURenderSystem,
  World,
} from '@ecs';
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
  world.addSystem(new WebGPURenderSystem(rootElement));

  create3DCamera(world);

  // Initialize the game
  await game.initialize();

  game.start();

  // @ts-ignore
  window.game = game;
}

function create3DCamera(world: World) {
  const camera = world.createEntity('camera');
  camera.addComponent(
    world.createComponent(Camera3DComponent, {
      fov: 75,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
    }),
  );
  camera.addComponent(world.createComponent(Transform3DComponent, { position: [0, 0, 0] }));
  camera.addComponent(
    world.createComponent(Input3DComponent, {
      mouseSensitivity: 0.1,
      moveSpeed: 5,
      sprintSpeed: 10,
      jumpForce: 10,
      gravity: 9.81,
    }),
  );
  world.addEntity(camera);
  return camera;
}
