# Toolchain

Notes on build/toolchain decisions and their rationale. Add new sections here when a
toolchain choice is made that isn't obvious from the config files alone.

## TypeScript module resolution (2026-08)

### Current settings

`tsconfig.json` uses:

```jsonc
{
  "module": "ESNext",
  "moduleResolution": "bundler",
  // no baseUrl — "paths" resolves relative to tsconfig.json since TS 4.1
  "paths": {
    "@ecs/*": ["./packages/ecs/src/*"]
    // ...
  }
}
```

The whole repo is a browser target bundled by Vite. `moduleResolution: "bundler"`
(TS 5.x's recommended mode for Vite/webpack projects) matches how the code actually
runs:

- extension-less relative imports and directory `index.ts` resolution work;
- `paths` aliases work without `baseUrl`, mirroring the `resolve.alias` entries in
  `packages/web-client/vite.config.ts`.

### Why not `NodeNext`

An attempt to switch `module`/`moduleResolution` to `NodeNext` produced 200+ errors.
`NodeNext` applies Node's native ESM rules at type-check time, which this codebase
does not follow (and does not need to, since nothing here runs unbundled in Node):

- every relative import must spell out the `.js` extension (TS2834/TS2835), and
  directories no longer resolve to `index.ts`;
- `paths` aliases are subject to the same rule, so extension-less alias imports like
  `@ecs/core/ecs/Component` fail with TS2307;
- the `exports` field of dependencies is strictly enforced (see the
  `primitive-geometry` case below).

`NodeNext` only becomes necessary if a package is published to run directly in Node
as native ESM, without a bundler. If that ever happens, that package should get its
own tsconfig; don't switch the root config.

Note: removing `baseUrl` was *not* the cause of those errors — `paths` has worked
without `baseUrl` since TS 4.1.

### Dependency `exports` maps: the `primitive-geometry` case

`moduleResolution: "bundler"` (like `NodeNext`) respects a dependency's `exports`
map. The old `"moduleResolution": "node"` (node10) mode ignored it, which let us
deep-import paths a package never officially exposed.

`primitive-geometry`'s `exports` map only exposes the package root, and the root
entry re-exports the factory functions but not their `*Options` types. Deep imports
like `primitive-geometry/types/src/box` are therefore blocked. The fix, in
[`packages/ecs/src/components/physics/mesh/types.ts`](../packages/ecs/src/components/physics/mesh/types.ts),
derives each options type from the factory function's signature instead:

```ts
import type * as primitives from 'primitive-geometry';

type OptionsOf<T> = T extends (options?: infer O, ...args: never[]) => unknown
  ? NonNullable<O>
  : never;

type BoxOptions = OptionsOf<typeof primitives.box>;
```

Apply the same pattern if another dependency's `exports` map blocks a deep type
import: prefer deriving the type from what the package officially exports over
adding `paths` workarounds or ambient module declarations.
