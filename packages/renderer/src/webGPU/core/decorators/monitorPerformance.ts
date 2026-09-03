const showLog = false;

export interface PerformanceStats {
  count: number;
  average: number;
  min: number;
  max: number;
  total: number;
}

/** Execution times per decorated method, per instance. */
const performanceSamples = new WeakMap<object, Map<string, number[]>>();

/**
 * Samples of one host's decorated methods.
 *
 * A module-level reader rather than methods installed on the instance, which is what the
 * original did — three helpers appeared on every host the first time a monitored method ran,
 * invisible to TypeScript.
 */
export function performanceStats(host: object, methodName: string): PerformanceStats {
  const times = performanceSamples.get(host)?.get(methodName);
  if (!times || times.length === 0) {
    return { count: 0, average: 0, min: 0, max: 0, total: 0 };
  }
  const total = times.reduce((a, b) => a + b, 0);
  return {
    count: times.length,
    average: total / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    total,
  };
}

/**
 * Times a method and keeps the last `maxSamples` durations, readable with performanceStats().
 * Unused as of 2026-09-03, kept as tooling.
 */
export function MonitorPerformance(
  options: { logThreshold?: number; maxSamples?: number; enableLogging?: boolean } = {},
) {
  const { logThreshold = 1, maxSamples = 100, enableLogging = true } = options;

  return function <M extends (...args: never[]) => unknown>(
    target: M,
    context: ClassMethodDecoratorContext,
  ): M {
    const methodName = String(context.name);

    const wrapped = function (this: object, ...args: unknown[]): unknown {
      const startTime = performance.now();
      try {
        return (target as unknown as (...a: unknown[]) => unknown).apply(this, args);
      } finally {
        const executionTime = performance.now() - startTime;
        let samples = performanceSamples.get(this);
        if (!samples) {
          samples = new Map<string, number[]>();
          performanceSamples.set(this, samples);
        }
        const times = samples.get(methodName) ?? [];
        times.push(executionTime);
        if (times.length > maxSamples) {
          times.shift();
        }
        samples.set(methodName, times);

        if (showLog && enableLogging && executionTime >= logThreshold) {
          console.log(`[Performance] ${methodName} took ${executionTime.toFixed(2)}ms`);
        }
      }
    };
    return wrapped as unknown as M;
  };
}
