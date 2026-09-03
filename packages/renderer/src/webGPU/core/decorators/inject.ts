import { declareDependency, globalContainer, Token } from './DIContainer';

/**
 * Declares that this class is the provider for `token`.
 *
 * Registration happens when the class is DEFINED, and the container constructs it on first
 * resolve — so services are never instantiated by hand, in any particular order, or at all if
 * nothing asks for them. It does not touch the prototype and does not replace the class (the
 * version before 2026-09-03 did both, which cost every manager its `.name` and made merely
 * constructing one mutate global state).
 *
 * The parameter type is `new () => T`, not a bare class: the container constructs services
 * with no arguments, so a class that needs constructor arguments cannot be a service, and
 * saying so here makes that a compile error rather than a runtime surprise.
 */
export function Injectable<T>(token: Token<T>) {
  return function (target: new () => T, _context: ClassDecoratorContext): void {
    globalContainer.provideClass(token, target);
  };
}

/**
 * Declares a dependency, resolved from the container on access.
 *
 * ```ts
 * @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
 * ```
 *
 * The token carries its service type, so a field typed as something else is a compile error.
 * The `!` cannot be avoided — TypeScript has no way to know a decorator supplies the value —
 * but it is honest here: resolution throws rather than yielding `undefined`.
 */
export function Inject<T>(token: Token<T>) {
  return function (
    _target: ClassAccessorDecoratorTarget<unknown, T>,
    context: ClassAccessorDecoratorContext<unknown, T>,
  ): ClassAccessorDecoratorResult<unknown, T> {
    // Recorded at construction so validateDependencies() can report a missing provider while
    // wiring, instead of on whatever frame first touches the field. This is the reason @Inject
    // is a decorator rather than a hand-written getter: a getter is invisible until called.
    context.addInitializer(function (this: unknown) {
      const owner = (this as { constructor?: { name?: string } }).constructor?.name;
      declareDependency(owner ?? '<anonymous>', String(context.name), token.key);
    });

    return {
      // Resolved on access, never cached here: the container holds one instance per token, and
      // laziness is load-bearing — GeometryManager and GPUResourceCoordinator inject each
      // other, so neither could resolve the other while being constructed.
      get(): T {
        return globalContainer.resolve(token);
      },
    };
  };
}
