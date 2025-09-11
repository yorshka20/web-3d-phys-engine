# 语义分组优化 (Semantic Grouping Optimization)

## 概述

本次优化将渲染分组逻辑从简单的 `RenderPurpose` 分组升级为基于完整 `SemanticPipelineKey` 的智能分组，显著提高了管线复用效率和渲染性能。

## 问题分析

### 原有问题

之前的 `groupRenderablesByPurpose()` 方法只考虑了 `RenderPurpose` 一个因素：

```typescript
// 旧方法 - 只考虑渲染目的
const purpose = determineRenderPurpose(renderable.material);
```

这导致以下问题：

1. **管线切换频繁**：相同目的但不同材质的对象使用不同管线
2. **资源浪费**：无法充分利用管线缓存
3. **性能下降**：频繁的管线状态切换影响GPU性能

### 优化目标

使用 `SemanticPipelineKey` 的所有因素进行精确分组：

```typescript
interface SemanticPipelineKey {
  renderPass: 'opaque' | 'transparent' | 'wireframe' | 'shadow';
  alphaMode: 'opaque' | 'mask' | 'blend';
  doubleSided: boolean;
  vertexFormat: 'simple' | 'full';
  hasTextures: boolean;
  primitiveType: 'triangle' | 'line';
  customShaderId?: string;
}
```

## 实现方案

### 1. 更新 RenderGroup 接口

```typescript
// 新的 RenderGroup 接口
interface RenderGroup {
  semanticKey: SemanticPipelineKey; // 完整的语义键
  semanticCacheKey: string; // 缓存键
  renderables: RenderData[]; // 使用相同管线的渲染对象
  pipeline?: GPURenderPipeline; // 可选的管线缓存
}
```

### 2. 新的分组方法

```typescript
private groupRenderablesBySemanticKey(renderables: RenderData[]): RenderGroup[] {
  const groups = new Map<string, RenderGroup>();

  for (const renderable of renderables) {
    // 生成完整的语义键
    const semanticKey = generateSemanticPipelineKey(
      renderable.material,
      renderable.geometryData
    );

    // 生成缓存键用于分组
    const semanticCacheKey = generateSemanticCacheKey(semanticKey);

    if (!groups.has(semanticCacheKey)) {
      groups.set(semanticCacheKey, {
        semanticKey,
        semanticCacheKey,
        renderables: [],
      });
    }
    groups.get(semanticCacheKey)!.renderables.push(renderable);
  }

  return Array.from(groups.values());
}
```

### 3. 调试和监控

添加了分组统计信息，帮助监控优化效果：

```typescript
// 每300帧输出分组统计
if (this.frameCount % 300 === 0) {
  console.log(`[WebGPURenderer] Render grouping stats:`, {
    totalRenderables: renderables.length,
    totalGroups: renderGroups.length,
    groupsBySemanticKey: renderGroups.map((g) => ({
      semanticKey: g.semanticKey,
      count: g.renderables.length,
    })),
  });
}
```

## 优化效果

### 1. 更精确的分组

**之前**：只按 `RenderPurpose` 分组

- `opaque` 组：所有不透明对象
- `transparent` 组：所有透明对象

**现在**：按完整语义键分组

- `opaque_simple_no_textures` 组：简单顶点格式的无纹理不透明对象
- `opaque_full_with_textures` 组：完整顶点格式的有纹理不透明对象
- `transparent_blend_double_sided` 组：双面混合透明对象
- 等等...

### 2. 性能提升

1. **减少管线切换**：相同语义特征的对象使用同一管线
2. **提高管线复用**：更精确的分组提高管线缓存命中率
3. **优化GPU状态**：减少不必要的状态切换

### 3. 内存优化

1. **减少管线数量**：避免创建重复的管线
2. **提高缓存效率**：更精确的缓存键减少冲突
3. **降低内存占用**：减少重复资源创建

## 使用示例

### 场景1：混合材质场景

```typescript
// 场景包含：
// - 10个简单立方体（无纹理，不透明）
// - 5个复杂模型（有纹理，不透明）
// - 3个透明玻璃（混合模式，双面）
// - 2个线框模型（线框模式）

// 优化前：4个组（按RenderPurpose）
// - opaque: 15个对象
// - transparent: 3个对象
// - wireframe: 2个对象

// 优化后：4个组（按SemanticPipelineKey）
// - opaque_simple_no_textures: 10个对象
// - opaque_full_with_textures: 5个对象
// - transparent_blend_double_sided: 3个对象
// - wireframe_simple: 2个对象
```

### 场景2：复杂材质场景

```typescript
// 场景包含：
// - 5个PBR材质模型（有纹理，不透明）
// - 3个PBR材质模型（有纹理，双面）
// - 2个自定义着色器模型

// 优化前：1个组（都是opaque）
// - opaque: 10个对象

// 优化后：3个组（按完整语义键）
// - opaque_full_with_textures: 5个对象
// - opaque_full_with_textures_double_sided: 3个对象
// - opaque_full_with_textures_custom_shader: 2个对象
```

## 兼容性

### 向后兼容

- 保持了原有的 `RenderGroup` 接口结构
- 渲染流程保持不变
- 不影响现有的材质和几何体系统

### 扩展性

- 支持新的语义键因素
- 支持自定义分组策略
- 支持更复杂的管线选择逻辑

## 监控和调试

### 分组统计

每300帧输出详细的分组统计信息：

```typescript
{
  totalRenderables: 25,
  totalGroups: 4,
  groupsBySemanticKey: [
    {
      semanticKey: {
        renderPass: 'opaque',
        alphaMode: 'opaque',
        doubleSided: false,
        vertexFormat: 'simple',
        hasTextures: false,
        primitiveType: 'triangle'
      },
      count: 10
    },
    // ... 其他组
  ]
}
```

### 性能指标

可以通过以下指标监控优化效果：

- 管线切换次数
- 管线缓存命中率
- 渲染批次数量
- GPU状态切换次数

## 总结

这次优化通过使用完整的 `SemanticPipelineKey` 进行渲染分组，实现了：

1. **更精确的分组**：考虑所有影响管线选择的因素
2. **更好的性能**：减少管线切换，提高管线复用
3. **更高的效率**：优化GPU状态管理
4. **更好的可维护性**：清晰的语义分组逻辑

这个优化为WebGPU渲染器提供了更智能、更高效的渲染分组机制，为后续的性能优化和功能扩展奠定了坚实基础。
