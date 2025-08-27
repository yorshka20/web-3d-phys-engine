import { WebGPURenderSystem } from '@ecs';
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

  world.addSystem(new WebGPURenderSystem(rootElement));

  // Initialize the game
  await game.initialize();

  game.start();
}
