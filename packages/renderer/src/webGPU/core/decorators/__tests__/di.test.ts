import { beforeEach, describe, expect, it } from 'vitest';
// Inside webGPU/core, decorators come from the module, not the barrel: the barrel's own
// imports would leave the decorator undefined at decoration time under Vite SSR (CLAUDE.md).
import { Inject, SmartResource } from '../ResourceDecorators';
import { ResourceType } from '../../types/constant';
import { DIContainer, globalContainer, validateDependencies } from '../DIContainer';
import type { Token } from '../DIContainer';

interface Engine {
  start(): string;
}
const ENGINE: Token<Engine> = { key: 'TestEngine' };
const MISSING: Token<Engine> = { key: 'TestMissing' };

describe('DIContainer', () => {
  let container: DIContainer;
  beforeEach(() => {
    container = new DIContainer();
  });

  it('resolves what was provided', () => {
    const engine: Engine = { start: () => 'on' };
    container.provideValue(ENGINE, engine);
    expect(container.resolve(ENGINE)).toBe(engine);
  });

  it('throws naming the token when nothing provided it', () => {
    expect(() => container.resolve(MISSING)).toThrow(/TestMissing/);
  });

  // Silently keeping the first instance is how two live copies of a manager used to coexist
  // with only one of them reachable.
  it('refuses a second value for the same token', () => {
    container.provideValue(ENGINE, { start: () => 'a' });
    expect(() => container.provideValue(ENGINE, { start: () => 'b' })).toThrow(
      /already has an instance/,
    );
  });
});

describe('DIContainer lazy construction', () => {
  const COUNTER: Token<{ n: number }> = { key: 'TestCounter' };

  it('constructs a registered class on first resolve and then keeps it', () => {
    let built = 0;
    class Counter {
      n = ++built;
    }
    const container = new DIContainer();
    container.provideClass(COUNTER, Counter);
    expect(built).toBe(0); // registering does not construct

    const first = container.resolve(COUNTER);
    expect(built).toBe(1);
    expect(container.resolve(COUNTER)).toBe(first);
    expect(built).toBe(1);
  });

  it('names the token when a constructor resolves itself', () => {
    const container = new DIContainer();
    class SelfHungry {
      constructor() {
        container.resolve(COUNTER);
      }
    }
    container.provideClass(COUNTER, SelfHungry);
    expect(() => container.resolve(COUNTER)).toThrow(/resolved by its own constructor/);
  });
});

describe('@Inject', () => {
  beforeEach(() => {
    globalContainer.clear();
  });

  // Laziness is load-bearing, not incidental: GeometryManager and GPUResourceCoordinator
  // inject each other, so neither can resolve the other while it is being constructed.
  it('resolves on access, not on construction', () => {
    class Car {
      @Inject(ENGINE) accessor engine!: Engine;
    }
    const car = new Car(); // provider does not exist yet — must not throw
    globalContainer.provideValue(ENGINE, { start: () => 'vroom' });
    expect(car.engine.start()).toBe('vroom');
  });

  it('throws at the point of use when the dependency was never provided', () => {
    class Car {
      @Inject(MISSING) accessor engine!: Engine;
    }
    expect(() => new Car().engine).toThrow(/TestMissing/);
  });

  // The reason @Inject is a decorator rather than a hand-written getter: a getter is invisible
  // until it is called, so a missing provider only surfaces on whatever frame touches it.
  it('declares the dependency so wiring can be validated up front', () => {
    class Car {
      @Inject(MISSING) accessor engine!: Engine;
    }
    new Car();
    expect(() => validateDependencies()).toThrow(/Car\.engine needs 'TestMissing'/);
  });
});

// The registration path below is why ForwardPass can read 'timeBindGroup' from
// WebGPUResourceManager at all. It is invisible from the host class — the decorator reaches
// for `resourceManager` — so it is easy to delete by accident while refactoring. It was.
describe('@SmartResource', () => {
  it('caches by the first argument alone', () => {
    let calls = 0;
    class Manager {
      @SmartResource(ResourceType.BUFFER, { cache: true })
      create(id: string, size: number) {
        calls++;
        return { id, size };
      }
    }
    const m = new Manager();
    const first = m.create('a', 1);
    // Same label, different second argument: the cache key is the label, so this is a hit.
    expect(m.create('a', 999)).toBe(first);
    expect(calls).toBe(1);
    expect(m.create('b', 1)).not.toBe(first);
    expect(calls).toBe(2);
  });

  it('files the resource with the host resource manager when it has one', () => {
    const created: string[] = [];
    const resourceManager = {
      createResource: (d: { id: string }) => {
        created.push(d.id);
        return Promise.resolve();
      },
    };
    class WithManager {
      resourceManager = resourceManager as never;
      @SmartResource(ResourceType.BIND_GROUP, { cache: true })
      create(id: string) {
        return { id };
      }
    }
    new WithManager().create('timeBindGroup');
    expect(created).toEqual(['timeBindGroup']);
  });

  it('skips registration for a host without one', () => {
    class WithoutManager {
      @SmartResource(ResourceType.BIND_GROUP, { cache: true })
      create(id: string) {
        return { id };
      }
    }
    expect(() => new WithoutManager().create('x')).not.toThrow();
  });
});
