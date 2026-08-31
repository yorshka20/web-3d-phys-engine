# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

Package manager is **pnpm only** — never npm or yarn. Shell is zsh.

```bash
pnpm install

# Optional: gltf-samples is a git submodule (KhronosGroup/glTF-Sample-Assets, ~1.5GB shallow).
# The gltf stage fetches sample models at runtime from VITE_GLTF_SAMPLES_BASE (web-client/.env:
# a jsDelivr CDN URL pinned to the submodule commit). To serve this local checkout instead,
# point the var at it via /@fs in web-client/.env.development.local (gitignored).
# Builds and CI never need the submodule.
git submodule update --init

# Type checking (root tsc --noEmit over all packages via the root tsconfig)
pnpm typecheck

# Linting and formatting
pnpm lint          # eslint over packages/*/src
pnpm lint:fix
pnpm format        # prettier

# Build (root tsc + vite build of web-client)
pnpm build

# Dev server — do NOT launch it yourself: this is a frontend app, the terminal
# shows no useful logs. Ask the user to run it and report browser behavior.
pnpm dev
```

### Tests

There is **no root `test` script**. Only the ecs package has a working Vitest setup
(`packages/ecs/vitest.config.ts`, jsdom + setup file):

```bash
pnpm --filter @web-3d-phys-engine/ecs test:run        # all ecs tests
pnpm --filter @web-3d-phys-engine/ecs test            # watch mode
pnpm --filter @web-3d-phys-engine/ecs exec vitest run src/core/pool/__tests__/PoolMemoryLeakTest.test.ts   # single file
pnpm --filter @web-3d-phys-engine/ecs exec vitest run -t "name pattern"                                    # single test
```

Known-broken test infrastructure (do not trust it, fix it before relying on it):

- Root `vitest.config.ts` points at a nonexistent `src/` — leftover from the pre-monorepo layout.
- `tests/` at repo root is **Jest** (with jest deps in root devDependencies) and is referenced by nothing.
- `packages/renderer` has a `test` script but no vitest config, so `@ecs`/`@renderer` aliases don't resolve there.
- Any vitest config that loads renderer/ecs source needs the shared `wgslLoader`/`gltfLoader`
  plugins from `scripts/vite-asset-loaders.ts` (ecs's config uses them; web-client's vite config
  imports the same module — don't fork a second copy).
- Several directories named `test/` contain manual console-logging harnesses, not real tests
  (`renderer/src/webGPU/core/pipeline/test/`, `renderer/src/webGPU/core/shaders/test/`).

### Verifying a change

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm --filter @web-3d-phys-engine/ecs test:run` (when ecs is touched)
4. `pnpm --filter @web-3d-phys-engine/web-client exec vite build` — catches resolution/bundling
   errors that typecheck cannot
5. Rendering behavior can only be confirmed in the browser — ask the user to check.

## High-Level Architecture

### Monorepo layout and module resolution (read this first)

Three source packages plus an asset submodule:

- `packages/ecs` — ECS core plus all game components/systems (including the render *systems*).
- `packages/renderer` — WebGPU renderer, shared canvas-layer base (`src/base/`), and the legacy
  CPU rayTracing subsystem.
- `packages/web-client` — Vite app: entry point, demo stages, Svelte UI overlay.
- `packages/gltf-samples` — git submodule of Khronos glTF sample assets (no package.json).

**Nothing is ever built as a package.** All cross-package imports go through the `@ecs/*` /
`@renderer/*` aliases straight to source; the workspace packages are one compilation unit split
across directories. Package-name imports (`@web-3d-phys-engine/*`) do not appear in source, and
ecs/renderer deliberately declare no workspace dependency on each other (doing so created a pnpm
cyclic-dependency warning). `packages/renderer`'s `main: dist` + `tsc -b` build script is
vestigial — nothing consumes `dist`.

Aliases are declared in **three places that must stay in sync**: root `tsconfig.json` `paths`,
`packages/web-client/vite.config.ts` `resolve.alias`, and `packages/ecs/vitest.config.ts`.

TypeScript uses `module: ESNext` + `moduleResolution: bundler`. Why (and why NodeNext doesn't
work here, and how to handle a dependency whose `exports` map blocks deep type imports) is
documented in `docs/toolchain.md` — read it before touching module/resolution settings.

### The ecs ↔ renderer coupling

Target rule: dependencies flow one way — `web-client → ecs → renderer → (third-party only)`.
The renderer owns its input vocabulary (`geometry/`, `assets/`, `material/`, `frame/` — the
`FrameData` contract lives in `@renderer/frame/types`), and its only remaining `@ecs` imports are
inside the legacy `rayTracing/` subsystem. Old ecs paths re-export the moved types as
**transitional shims** (removal tracked as Phase 1.5 in the local architecture roadmap). Treat
any new renderer→ecs import as a layering violation, not a convenience.

### ECS package

- `World` (`packages/ecs/src/core/ecs/World.ts`) is the coordinator — there is no separate
  SystemManager. Systems register with a `SystemPriorities` value (lower = earlier;
  SPATIAL_GRID=0 … PHYSICS=700 … RENDER=9999, see `packages/ecs/src/constants/systemPriorities.ts`)
  and a `systemType` of `'logic' | 'render' | 'both'`, which routes them into `updateLogic` /
  `updateRender`. `World` is a pseudo-singleton (`World.instance`); constructing a second one
  returns a broken object.
- Components are keyed by **static `componentName` string**, not class identity.
- **Object pooling is load-bearing**: `PoolManager` + `ObjectPool` with `reset()`/`recreate()`.
  Pooled entity/component classes are registered in the hardcoded lists in
  `packages/ecs/src/core/pool/constants.ts` (`EntityPoolList`, `ComponentPoolList`). A new pooled
  component **must** be added there, or `world.createComponent` silently falls back to plain
  construction.
- Workers: `WorkerPoolManager` + `general.worker.ts` (imported with `?worker`) handle collision
  and ray-tracing tasks.

### Frame loop (who calls whom)

`web-client`'s `Game` is a façade; `GameLoop` (`packages/web-client/src/game/GameLoop.ts`) runs
**two decoupled loops**:

- **Logic**: a `setTimeout` chain at `logicFrameRate` driving a **fixed-timestep accumulator**
  (capped by `maxFramesToSkip`/`maxAccumulator` to prevent spiral-of-death); timestep size is
  delegated to `PerformanceSystem`. Calls `world.updateLogic(dt)`.
- **Render**: `requestAnimationFrame` (uncapped by default), variable timestep, calls
  `world.updateRender(dt)` — and **it also feeds the logic accumulator**, so logic time only
  advances while frames are presented.

Per frame: render systems run in priority order, ending at `WebGPURenderSystem` (priority 9999),
which extracts per-entity render data, assembles `FrameData`, and calls
`WebGPURenderer.render(dt, frameData)`.

### Renderer package

- **DI via TC39 stage-3 native decorators** (`experimentalDecorators: false` — the modern
  decorator API, not the legacy one). Every manager is `@Injectable(ServiceTokens.X)` and wires
  dependencies with `@Inject(...)` fields; `globalContainer` + `ServiceTokens` live in
  `packages/renderer/src/webGPU/core/decorators/DIContainer.ts`. `WebGPURenderer.init()` just
  constructs the ~14 managers; the decorators do the wiring.
- Specialized managers under `webGPU/core/`: Buffer/BindGroup/Texture/Geometry/Material/
  MVPUniform/Time managers, `ResourceManager` (registry + metadata), `GPUResourceCoordinator`
  (cross-cutting cache/lifecycle), `AssetLoader` (static; PMX + glTF via `@gltf-transform` WebIO)
  vs `AssetRegistry` (CPU-side registry, deliberately separate from GPU resource creation).
- **Pipelines are cached by a semantic key** (`generateSemanticPipelineKey`: renderPass,
  alphaMode, doubleSided, textures, primitive, vertexFormat, customShaderId) in
  `PipelineManager`; `PipelineFactory.createAutoPipeline(material, geometryData)` is the one used
  per frame. Renderables are grouped by semantic key, one pipeline per group.
- **No render graph.** `WebGPURenderer.renderTick` is a single hardcoded forward pass.
- **Bind group convention** (WebGPURenderer): group 0 = time (always), 1 = per-object MVP,
  2/3/4 = material/texture/animation depending on material type (PMX: 2=material+textures,
  3=animation; regular: 2=textures, 3=material).

### Shader (WGSL) system

Composition-based, not a preprocessor: a shader module = a source file + an `includes` list of
fragment paths, spliced by `ShaderCompiler` at runtime. All WGSL lives under
`packages/renderer/src/webGPU/core/shaders/` (`core/`, `math/`, `lighting/`, `bindings/`
snake_case, `materials/` PascalCase, `passes/`, `compute/`); see `shaders/README.md`.

**Adding a shader requires editing two files**: `registry.ts` (static-imports every `.wgsl`,
inlined as strings by the Vite `wgsl-loader` plugin) and `create.ts` (per-shader factory
declaring includes, defines, vertexFormat, renderState). Materials select shaders via
`material.customShaderId`, which flows into the semantic pipeline key.

### web-client

Wiring is fully explicit in `main.ts`: construct `Game`, `world.addSystem(...)` each system,
create camera/plane/coordinate entities, load a stage from `src/stages/`, `game.initialize()`,
`game.start()`. Svelte 5 **with runes** is used only for a floating overlay panel
(`ui/mountEntityPanel.svelte.ts`, `F` key toggles); the canvas itself is created imperatively by
`WebGPURenderSystem`. State shared with Svelte from plain TS must live in `.svelte.ts` files.

Vite specifics: inline `wgslLoader`/`gltfLoader` plugins inline `.wgsl`/`.gltf` as strings (also
registered for workers); Khronos sample models are never imported — `stages/gltf.ts` builds URLs
from `import.meta.env.VITE_GLTF_SAMPLES_BASE` (committed default in `web-client/.env`: the
commit-pinned jsDelivr CDN; local-submodule override via `/@fs` in `.env.development.local`);
COEP/COOP headers are set for SharedArrayBuffer/workers.

## Work-in-Progress Map

Current state that is easy to misread as bugs or dead code — check here before "fixing":

- **Only the geometry stage is active.** `main.ts` hardcodes `stages[0]`; the PMX/GLTF/zzz stage
  branches and imports are commented out (intentional, commits `305753b`, `07028f8`). Touching
  PMX/glTF paths requires re-enabling a stage first.
- **The compute pass is disabled**: `// await this.computePass(...)` in
  `WebGPURenderer.renderTick`. The PMX morph-compute path (`PMXAnimationBufferManager`,
  `compute/PMXMorphCompute.wgsl`) is dormant, part of stalled PMX morph animation work.
- **2D-era code: the keep/delete decision is settled** (2026-08-31). Deleted, because a 3D
  counterpart supersedes them: `canvas2d/` + the ecs 2D `RenderSystem` (→ WebGPURenderSystem;
  canvas-element management survives in `renderer/src/base/CanvasLayer`), 2D `TransformSystem`
  (→ Transform3DSystem), 2D `InputSystem` (→ Input3DSystem; WeaponSystem now wants an
  `AimInputSource` capability under the 'InputSystem' name). **Everything dimension-independent
  stays permanently** and awaits in-place 2D→3D evolution: gameplay systems (AI, Chase, Weapon,
  Damage, Death, Pickup, Spawn, Collision, Border, Recycle, ForceField), `ecs/src/entities/`,
  the `core/worker` pool, and `renderer/src/rayTracing/` (CPU ray tracer; its `RayTracingLayer`
  is runtime-orphaned and needs `setWorld()` injection from a future driver). The dormant
  gameplay systems read `systems/viewport.ts#getScreenViewport()` where the 2D pipeline's
  viewport used to be.
- `InstanceManager` is an **empty class** and `renderBatches` is never populated — instancing is
  planned, not implemented. `RendererInitializationManager` documents a 4-phase init that
  `WebGPURenderer.init()` does not use (orphaned refactor). Several `IWebGPURenderer` methods
  `throw new Error('Method not implemented.')`.
- **`README.md` is stale** — it describes a pre-monorepo `src/` layout, a port and a project
  phase that no longer exist. Do not use it as an architecture source; `plans/` specs describe
  intent, not necessarily current code.
- Dependency rule: **each package declares exactly what it imports** (hoisting is off in
  `.npmrc`, so a phantom dependency fails to resolve instead of silently working). Root
  package.json holds tooling only. ecs/renderer deliberately hold no workspace dependency on
  each other. No peerDependencies — nothing here has host-singleton semantics.
- Known pre-existing test rot: pool tests fail with `ComponentClass.poolConfig` on undefined
  (a `ComponentPoolList` entry is undefined under Vitest's SSR module order — same barrel-cycle
  disease as the ShaderCompiler case in Domain Notes); several `PerformanceSystem` assertions
  drifted from evolved constants.

## Code Conventions

- **TypeScript strict mode**; `noImplicitAny` is off — don't introduce new implicit `any`s anyway.
- **Path aliases**: always import cross-package via `@ecs/*` / `@renderer/*`; never deep-relative
  across package boundaries, never via `@web-3d-phys-engine/*` package names.
- **Native decorators only** (TC39 stage 3). Never turn `experimentalDecorators` back on; new
  renderer services follow the `@Injectable`/`@Inject` + `ServiceTokens` pattern.
- **Formatting**: Prettier + ESLint (root scripts). Comments in **English**.
- **Never delete existing comments** when editing code (from `.cursorrules`), and do not break
  code unrelated to the task.
- **Pooling discipline**: pooled classes implement `reset()`/`recreate()` and are registered in
  `pool/constants.ts` lists.
- **Derive, don't hardcode**: don't add a second copy of a list the module can supply
  (shader registry, ServiceTokens, priority constants are the single sources of truth).
- **Reuse over reimplementation**: promote shared logic into the owning manager/module instead of
  writing a second copy; one entry point rather than parallel near-duplicate methods.
- **Branches/commits**: conventional commits (`feat:`, `fix:`, `chore:`, ...); feature branches
  named `feature/module-name`.

## Engineering Principles

- **Read docs before implementing, update docs after changing implementation**: read the relevant
  design docs (`docs/`, `plans/`, `shaders/README.md`) before writing code; when you change the
  implementation, update the documents it affects.
- **Prefer good third-party libraries**: do not hand-roll a poor implementation when a
  high-quality library is available.
- **Hold a high implementation bar**: code with weak architectural design is never acceptable.
  Respect the existing module/system design (DI + managers in renderer, priority-ordered systems
  in ecs) when implementing within a given scope.
- **Correct me when I'm wrong**: always respect the truth. The user may be wrong, and you must
  not accept a wrong suggestion. If your view differs, check whether the user has made a mistake
  before agreeing.
- **Deleting legacy code — narrow definition of "2D-limited"**: it means *superseded by an
  existing 3D counterpart or meaningless in 3D*, NOT "currently written with 2D coordinates".
  Gameplay mechanisms (spawn/damage/pickup/AI), the worker pool, collision, and the CPU ray
  tracer are evolution bases — this repo's pattern is evolving 2D implementations to 3D in place
  (PhysicsComponent, Camera3D, LightSource3D all did). Batch deletions require the user's
  per-item approval. Upstream `vampire-survivor-like` holds same-or-newer copies of all inherited
  2D code (verified 2026-08-31), so approved deletions stay recoverable from there.

## Bug-Fixing Principle: No Patch Mindset (Root Cause First)

**Hard constraint**: When you hit a bug, first locate the **root cause** and fix it at the design
level. It is **forbidden** to suppress symptoms by stacking local patches / safety nets /
fallbacks / caches / special-case handling.

### Execution Rules

1. **Diagnose the root cause before writing code**: you must be able to answer "why does this bug
   happen" in a single sentence. "At some moment some variable held a wrong value" is a symptom,
   not a root cause — keep asking why until you reach "a design flaw in some abstraction / data
   flow / state machine".
2. **The fix must eliminate the root cause, not work around it**: a good fix **removes** the cause
   (a wrong fallback path / missing authoritative state / inconsistent semantics); a bad fix
   **stacks** new code (a memo / drift / retry / special check). If the fix makes the code more
   complex and adds more checks, first suspect that you haven't found the root cause.
3. **Typical signals of patch thinking — stop and re-examine when these appear**:
   - "If we remembered it last time…" (last-emitted memo)
   - "Add another fallback" (stacking a second layer on an existing fallback)
   - "Check Y before X" (special-case guard)
   - "Slowly drift to the correct value" (diluting a wrong state with time)
   - "Temporarily turn off / skip in this case" (feature-flag safety net)
   - "Retry N times" (don't know why it fails, so try our luck)
4. **The only scenario where a patch is allowed: a genuine edge case** — a confirmed
   uncontrollable external factor (a browser/driver bug, a known third-party library bug), where
   the cost of a root-cause fix vastly exceeds its impact. Then you must **state it explicitly**:
   mark it as an edge-case patch in the commit message / code comment, explain why it can't be
   properly cured, and leave a follow-up record (roadmap entry) for when it should be upgraded to
   a proper fix.

### How to Collaborate with the User

- Before proposing a fix, **present the root-cause diagnosis first**, then explain how the fix
  eliminates it; let the user review "whether the diagnosis is right", not just "whether the code
  is right".
- If you notice your own fix is stacking patches, **stop and re-examine on your own** — don't
  wait for the user to point it out.
- If the user rejects a fix as a patch, **redo the root-cause diagnosis**; don't submit another
  patch from a different angle.

## Comment Style: No Session-Context Comments

**Write no comments by default.** Identifiers already explain *what*; only write a comment when
the *why* is not obvious — a hidden constraint, a counter-intuitive invariant, a workaround for
an external bug, a caution point in the flow.

Comments are written in **English**. This governs comments you *add*: when editing existing code,
do not delete comments that are already there.

**Forbidden**: anything only understandable within the current task/session —
"added to fix issue X", "currently / for now / temporarily", "revisit later", "keep consistent
with field X" (temporary consistency, not an invariant), "called by X / used by flow Y"
(belongs in git blame / PR description), or an abrupt standalone JSDoc on one field when no
sibling field has one.

**Allowed**: why the code must exist (eliminates a class of bug, maintains an invariant, external
protocol constraint); error-prone flow points ("call order can't be swapped, X depends on Y's
side effect"); citations of external specs/bugs (WebGPU spec clause, chromium crbug); an
explicitly-declared edge-case patch with a follow-up link.

Self-check: **"Half a year from now, will a newcomer reading this line understand it?"** If the
answer depends on knowing the history of this change, delete it.

## Git Commit Messages

**Write them in English — subject and body both**, whatever language the conversation was in.

**Keep them short**: a conventional-commit subject plus at most a few sentences of prose on what
changed and why. Root-cause analyses, benchmark numbers, design trade-offs go into that day's
`.claude-workbook/` entry, and the commit body points at it (`See workbook YYYY-MM-DD.`).
Body ≤ 5 lines of prose; no bullet lists, tables, code blocks, or logs.

Write the workbook entry first, then write the commit against it, so the analysis exists in
exactly one place.

The `Co-Authored-By:` trailer convention is unchanged.

## Where Conventions Live

Anything the user states as a convention, preference, or working agreement goes in a
**repo-tracked file** so it travels across machines:

- **`CLAUDE.md`** (this file) — how code is written and how work is delivered: commands,
  architecture, conventions, comment style, commit style, testing, workflow.
- **`docs/`** — tracked decision records (e.g. `docs/toolchain.md`). A durable technical
  conclusion belongs there, referenced from here.

**Never** record such a rule only in an agent's private memory store — it is machine-local and
invisible to other agents.

## Workflow: Workbook & Learnings

`.claude-workbook/`, `.claude-learnings/`, and `/ROADMAP.md` are **gitignored, local-only
notes** — never `git add` them. Delivery relies on tracked code and docs.

### When starting work

1. Read this file.
2. Read `.claude-workbook/index.md` — past work (index first, then specific dated reports).
3. Read `.claude-learnings/index.md` — key project details (index first, then relevant scopes).
4. Scan `/ROADMAP.md`'s active section to pick the next step.

### When work is done

1. **Workbook**: record the work in `YYYY-MM/YYYY-MM-DD.md` (problem, root cause, solution,
   files, verification), add a line to that month's `YYYY-MM/index.md`. New month → new folder +
   month index + one line in the top-level `index.md`.
2. **Learnings**: write newly discovered key details into the matching scope file (or a new
   scope), update its `index.md`.
3. **Roadmap**: move finished items to ✅ in the scope file (with workbook date / commit hash);
   remove them from `/ROADMAP.md`'s active section. Record newly discovered requirements in
   `/ROADMAP.md` first, then expand in the scope file.

### Rules

- **`index.md` is a pure pointer layer, not a content summary.** One line per file:
  `- [name](file.md) — <one-line hook>`. **No dated deltas in an index** — deltas go in the body
  of scope/daily files. Update an index line only when a file's overall theme changes. Keep each
  index readable in one sitting (≲ 60 lines / ≲ 4KB).
- **Workbook**: folders by month `YYYY-MM/`; search primarily with
  `grep -rn "keyword" .claude-workbook/`, don't read everything. Top-level index lists months
  only; month index lists days (one short line each); full content lives only in daily files.
- **Learnings**: split by scope, add scopes as needed. Each scope file keeps at its top a Roadmap
  table (and a TOC once it exceeds ~600 lines / 20KB). Dated deltas, design details, and pitfalls
  go in the body.
- **Roadmap format**: `| Status | Priority | Task | Link / Notes |` rows with
  🔴 P0 / 🟡 P1 / 🟢 P2 / ⚪ P3 and ✅ DONE / 🚧 WIP / 📋 TODO / 💭 DESIGN. `/ROADMAP.md` lists
  only currently-active items and points into scope files; completed items live only in scope
  tables.

## Domain Notes

Non-obvious specifics that are easy to get wrong:

- **`Transform3DSystem` is registered as a `'render'` system** (not logic) — it runs in
  `updateRender` after the logic tick. Moving it changes frame semantics.
- **`world.getSystem(name, priority)`'s ordering check is advisory** — it warns on
  priority-order violations but still returns the system.
- **`updateLogic` gates on `canInvoke()` only; `updateRender` gates on
  `canInvoke() && shouldUpdate()`** — the two throttles (wall-clock gap vs frame counter) are
  independent.
- **`ObjectPool.return()` deliberately does not reset** — reset happens on `get()`. Its
  `initialSize` parameter is currently accepted but ignored (no prefill).
- The Vite `manualChunks` config splits `@ecs` and `@renderer` into separate chunks; keep alias
  keys valid when renaming.
- `.wgsl` imports are inlined strings (wgsl-loader); `.gltf` imports are inlined **unless**
  imported with `?url` (sample models are `?url` + fetched at runtime).
- **Inside `renderer/webGPU/core`, import decorators from `decorators/ResourceDecorators`, not
  the `decorators` barrel** when the barrel imports your module (it top-level imports
  `ShaderCompiler` and `WebGPUContext` for `initContainer`): the barrel cycle leaves
  `Injectable` undefined at decoration time under Vite SSR (vitest), even though Rollup's chunk
  ordering hides it in the browser build.
