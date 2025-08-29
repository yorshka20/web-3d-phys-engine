import {
  ActiveCameraTag,
  Camera3DComponent,
  Entity,
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
import { GeometryInstanceDescriptor } from '@renderer/webGPU/core/types';
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

  const camera = create3DCamera(world);
  cretePlane(world);
  createGeometryEntities(world);

  // Initialize the game
  await game.initialize();

  // Create camera debug panel
  createCameraDebugPanel(camera);

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
      position: [0, 3, -10], // Position to see all geometry objects
      rotation: [0, 0, 0], // Look straight ahead towards the objects
    }),
  );

  // Mark as active camera
  camera.addComponent(world.createComponent(ActiveCameraTag, {}));

  camera.addComponent(world.createComponent(PhysicsComponent, { velocity: [0, 0, 0] }));

  // Add input component for camera control
  camera.addComponent(world.createComponent(Input3DComponent, {}));

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

function createGeometryEntities(world: World) {
  const geometries: GeometryInstanceDescriptor[] = [
    {
      type: 'cube',
      transform: {
        position: [-2, 0, 0],
        rotation: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
      },
      name: 'SmallCube',
    },
    {
      type: 'cube',
      transform: {
        position: [0, 0, 0],
        rotation: [0, Math.PI / 4, 0],
        scale: [1.0, 1.0, 1.0],
      },
      name: 'MediumCube',
    },
    {
      type: 'cylinder',
      transform: {
        position: [2, 0, 0],
        rotation: [Math.PI / 6, 0, Math.PI / 6],
        scale: [1.5, 1.5, 1.5],
      },
      name: 'Cylinder',
    },
    {
      type: 'sphere',
      transform: {
        position: [0, 2, 0],
        rotation: [Math.PI / 6, 0, Math.PI / 6],
        scale: [5, 5, 5],
      },
      name: 'Sphere',
    },
  ];

  for (const geometry of geometries) {
    const entity = world.createEntity('object');

    entity.addComponent(
      world.createComponent(Mesh3DComponent, {
        descriptor: {
          type: geometry.type,
          params: geometry.params!,
        },
      }),
    );
    entity.addComponent(
      world.createComponent(Transform3DComponent, { position: geometry.transform.position }),
    );
    entity.addComponent(
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
    world.addEntity(entity);
  }
}

// Create camera debug panel
function createCameraDebugPanel(camera: Entity) {
  const debugPanel = document.createElement('div');
  debugPanel.id = 'camera-debug-panel';
  debugPanel.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    z-index: 1000;
    min-width: 300px;
    border: 1px solid #333;
  `;

  const title = document.createElement('div');
  title.textContent = 'Camera Parameters';
  title.style.cssText = `
    font-weight: bold;
    margin-bottom: 10px;
    color: #00ff00;
    border-bottom: 1px solid #333;
    padding-bottom: 5px;
  `;

  const positionDiv = document.createElement('div');
  positionDiv.id = 'camera-position';
  positionDiv.style.marginBottom = '5px';

  const rotationDiv = document.createElement('div');
  rotationDiv.id = 'camera-rotation';
  rotationDiv.style.marginBottom = '5px';

  const fovDiv = document.createElement('div');
  fovDiv.id = 'camera-fov';
  fovDiv.style.marginBottom = '5px';

  debugPanel.appendChild(title);
  debugPanel.appendChild(positionDiv);
  debugPanel.appendChild(rotationDiv);
  debugPanel.appendChild(fovDiv);

  document.body.appendChild(debugPanel);

  // Update function
  function updateCameraInfo() {
    if (
      !camera.hasComponent(Transform3DComponent.componentName) ||
      !camera.hasComponent(Camera3DComponent.componentName)
    ) {
      return;
    }

    const transform = camera.getComponent<Transform3DComponent>(Transform3DComponent.componentName);
    const cameraComp = camera.getComponent<Camera3DComponent>(Camera3DComponent.componentName);

    if (transform && cameraComp) {
      const pos = transform.getPosition();
      const rot = transform.getRotation();

      positionDiv.innerHTML = `Position: [${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}]`;
      rotationDiv.innerHTML = `Rotation: [${((rot[0] * 180) / Math.PI).toFixed(1)}°, ${((rot[1] * 180) / Math.PI).toFixed(1)}°, ${((rot[2] * 180) / Math.PI).toFixed(1)}°]`;
      fovDiv.innerHTML = `FOV: ${cameraComp.fov}° | Mode: ${cameraComp.projectionMode}`;
    }

    requestAnimationFrame(updateCameraInfo);
  }

  updateCameraInfo();
}
