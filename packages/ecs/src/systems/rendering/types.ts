// The frame contract (FrameData/RenderData/SceneData/...) moved to the
// renderer package: it is the renderer's input format, so the renderer owns
// it. Re-exported here so existing @ecs import paths keep working.
export * from '@renderer/frame/types';
