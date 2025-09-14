import {
  ActiveCameraTag,
  Camera3DComponent,
  CameraControlComponent,
  Entity,
  Input3DComponent,
  Input3DSystem,
  Mesh3DComponent,
  OrbitCameraControlSystem,
  PhysicsComponent,
  PhysicsSystem,
  StatsComponent,
  Transform3DComponent,
  Transform3DSystem,
  Vertex3D,
  WebGPU3DRenderComponent,
  WebGPURenderSystem,
  World,
} from '@ecs';
import { AssetLoader } from '@renderer/webGPU/core/AssetLoader';
import chroma from 'chroma-js';
import { Game } from './game/Game';
import { createGeometryStage } from './stages/geometry';
import { createPMXModelStage } from './stages/pmxModel';

// Start the application when the page loads
window.addEventListener('load', () => {
  // new PhysicsEngineApp();
  main();
});

type Stage = 'geometry' | 'pmxModel';

const stages: Stage[] = ['geometry', 'pmxModel'];

const stage: Stage = stages[1];

async function main() {
  const rootElement = document.body;

  const game = new Game();
  const world = game.getWorld();

  world.addSystem(new Input3DSystem(rootElement));
  world.addSystem(new Transform3DSystem());
  world.addSystem(new PhysicsSystem());
  world.addSystem(new OrbitCameraControlSystem());
  world.addSystem(new WebGPURenderSystem(rootElement));

  const camera = create3DCamera(world);
  cretePlane(world);
  createCoordinate(world);

  switch (stage) {
    case 'geometry':
      await createGeometryStage(world);
      break;
    case 'pmxModel':
      await createPMXModelStage(world);
      break;
    default:
      break;
  }

  // Initialize the game
  await game.initialize();

  // Create camera debug panel
  // createCameraDebugPanel(camera);

  game.start();

  // @ts-expect-error - Adding game to window for debugging purposes
  window.game = game;
  // @ts-expect-error - Adding game to window for debugging purposes
  window.assetLoader = AssetLoader;
}

const defaultMaterial = {
  albedo: chroma('#000000'),
  metallic: 0,
  roughness: 0.5,
  emissive: chroma('#000000'),
  emissiveIntensity: 0,
  materialType: 'normal' as const,
};

function create3DCamera(world: World) {
  const camera = world.createEntity('camera');
  camera.setLabel('camera');

  // Add camera component with 3D properties
  camera.addComponent(
    world.createComponent(Camera3DComponent, {
      fov: 75,
      aspectRatio: 16 / 9,
      near: 0.1,
      far: 1000,
      projectionMode: 'perspective',
      cameraMode: 'custom',
      controlMode: 'orbit',
      target: [0, 0, 0],
    }),
  );
  camera.addComponent(
    world.createComponent(CameraControlComponent, {
      mode: 'orbit',
      config: {
        orbit: {
          target: [0, 0, 0],
          distance: 10,
          minDistance: 1,
          maxDistance: 100,
          panSensitivity: 0.01,
          zoomSensitivity: 0.001,
          rotationSensitivity: 0.005,
          enablePan: true,
          enableZoom: true,
          enableRotation: true,
        },
      },
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

  camera.addComponent(world.createComponent(StatsComponent, { moveSpeedMultiplier: 5 }));

  world.addEntity(camera);
  return camera;
}

function cretePlane(world: World) {
  const plane = world.createEntity('object');
  plane.setLabel('plane');
  plane.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: {
        type: 'plane',
        params: { sx: 30, sy: 40, nx: 30, ny: 40, direction: 'y' },
      },
    }),
  );
  plane.addComponent(world.createComponent(Transform3DComponent, { position: [0, -1, 0] }));
  plane.addComponent(
    world.createComponent(WebGPU3DRenderComponent, {
      material: {
        albedo: chroma('#000000'),
        metallic: 0,
        roughness: 0.5,
        emissive: chroma('#000000'),
        emissiveIntensity: 0,
        customShaderId: 'checkerboard_shader',
        materialType: 'normal' as const,
      },
    }),
  );

  world.addEntity(plane);
  return plane;
}

function createCoordinate(world: World) {
  const coordinate = world.createEntity('object');
  coordinate.setLabel('coordinate');
  // prettier-ignore
  const coordinateVertex3D: Vertex3D[] = [
    // x axis - red
    { position: [0.0, 0.0, 0.0], color: [1.0, 0.0, 0.0, 1.0] },
    { position: [1.0, 0.0, 0.0], color: [1.0, 0.0, 0.0, 1.0] },
    // y axis - green
    { position: [0.0, 0.0, 0.0], color: [0.0, 1.0, 0.0, 1.0] },
    { position: [0.0, 1.0, 0.0], color: [0.0, 1.0, 0.0, 1.0] },
    // z axis - blue
    { position: [0.0, 0.0, 0.0], color: [0.0, 0.0, 1.0, 1.0] },
    { position: [0.0, 0.0, 1.0], color: [0.0, 0.0, 1.0, 1.0] },
  ];
  const indices = [0, 1, 2, 3, 4, 5];
  coordinate.addComponent(
    world.createComponent(Mesh3DComponent, {
      descriptor: {
        type: 'mesh',
        vertices: coordinateVertex3D,
        indices,
        primitiveType: 'line-list',
      },
    }),
  );
  coordinate.addComponent(world.createComponent(Transform3DComponent, { position: [0, 0, 0] }));
  coordinate.addComponent(
    world.createComponent(WebGPU3DRenderComponent, {
      material: { ...defaultMaterial, customShaderId: 'coordinate_shader' },
    }),
  );
  world.addEntity(coordinate);
  return coordinate;
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
