# `code-reviewer` in nxgt-devkit

nxgt-devkit is the Bun workspace behind the public `@nxgt/*` testing and CI packages, on the nxgt-data skeleton. Today one package: `@nxgt/playwright` (0.3.0). The root barrel re-exports `./auth` (`authSetup`, `authFile`, `withLoginFixture`), `./config` (`defineAppConfig` with `screens`, `selectedProjects`), `./helpers` (`fillSettled` / `fillUntilEnabled`, `withHydration` / `hydrated` / `hydrationWarnings`, `nextFrames` / `settled`, `toastsGone`, `isMobileProject`, `expectNoHorizontalScroll` with its `scroller` option, `screenshotName`), `./pages` (`BasePage` / `FormPage`), `./screens` (`saveScreen`, `savingScreens`) and `./pwa` (`serviceWorkerControlled`, `cachedUrls`, `expectNotCached`). Subpaths of their own: `./a11y` (axe), `./msw` (`createMswTest`), `./react-router` (`reactRouterHydrated`, `elementHydrated`), and `./storybook` (`storybookProject` with WebP preview capture, plus the browser-only `./storybook/capture` and `./storybook/setup`). Its promise is that each export **replaces a file applications copied by hand**, so the worst defects are a helper that is subtly weaker than the copy it replaced, and a subpath that drags a peer into a consumer who never asked for it.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
```

The green bar, as CI runs it:

```bash
./node_modules/.bin/biome ci
bun run build
bun run typecheck
bun run test               # bun test src, then playwright test on test/*.pw.ts
bun run verify:artifacts   # prints a `skip … browser only` line per nxgt.browserOnly subpath
bun run changeset:status
```

The e2e specs need `bunx playwright install chromium-headless-shell`. Never run `changeset:publish`, `scripts/publish.ts` or `bun changeset`.

## Invariants

- **Every peer is optional, and each subpath needs only its own.** The root barrel re-exports `auth`, `config`, `helpers`, `pages`, `pwa`, `screens` — `@playwright/test` and `node:` builtins only. An export reaching `@axe-core/playwright`, `msw`, `@msw/playwright`, `vitest` or Storybook from the root is a finding, and so is framework-specific code there: React Router lives in `./react-router`, an adapter that plugs into `withHydration` through a `HydrationMarker`.
  `grep -n "from '" packages/playwright/src/index.ts packages/playwright/src/{auth,config,helpers,pages,pwa,screens}/*.ts | grep -v "@playwright/test\|node:\|bun:\|'\./\|'\.\./"`
- **Browser-only subpaths are declared, not silently skipped.** A subpath importing `vitest/browser` is listed in `nxgt.browserOnly`, and `verify-artifacts.ts` prints its skip. A browser-only subpath with no spec loading it in a browser, or a skip that prints nothing, is a finding.
- **`./storybook/setup` and `src/screens/clear.ts` are entry points on purpose.** `storybookProject` resolves `new URL('./setup.js', import.meta.url)` beside the built `index.js`, and `defineAppConfig({ screens })` registers `new URL('../screens/clear.js', import.meta.url)` as its global setup. Both are listed in `nxgt.entrypoints` (`clear` has no export). Folding either file into another module, or dropping it from `entrypoints`, breaks every consumer at run time while the build stays green.
- **The screens global setup only empties the screens folder.** `clear.ts` refuses a `screens.dir` that is, or holds, the config's folder or the tests' `rootDir`, since emptying it would delete the project. A change that loosens that check (`holds`) is a finding.
- **A hydration helper proves the value survived, not that it was typed.** `fillSettled` re-reads after `settle`; `fillUntilEnabled` re-checks values and the button after `settle`. A change that returns on the first success reintroduces the defect `test/e2e/helpers.pw.ts` catches. Likewise `hydrated` waits on the marker (default `html[data-hydrated]`, overridable), `settled` on frames, and `toastsGone` until none is left. These three wait on a condition; turning one into a fixed timeout is a finding (`hydration.pw.ts`, `frames.pw.ts`).
- **Each new subpath has its e2e spec.** `pwa`, `react-router`, `screens` and `config` each have one under `test/e2e/*.pw.ts`. A new export without a spec exercising it in a browser is a finding.
- **Nothing app-specific.** Test ids beyond overridable defaults (`submit`, `data-pw`), credentials, handlers, sign-in pages: a finding. They reach the package as arguments.
- **The capture's names are Storybook's.** A preview file is `componentId(story.id)`; a second slug function that could disagree with Storybook's is a finding (`titleToComponentId` exists for callers with only a title, and is tested against Storybook's ids).
