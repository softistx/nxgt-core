# `code-reviewer` in nxgt-devkit

nxgt-devkit is the Bun workspace behind the public `@nxgt/*` testing and CI packages, on the nxgt-data skeleton. Today one package: `@nxgt/playwright` — `defineAppConfig`, `BasePage` / `FormPage`, `authSetup` / `authFile` / `withLoginFixture`, `fillSettled` / `fillUntilEnabled`, `createMswTest`, and `storybookProject` with WebP preview capture (`./storybook`, and the browser-only `./storybook/capture` and `./storybook/setup`). Its promise is that each export **replaces a file applications copied by hand**, so the worst defects are a helper that is subtly weaker than the copy it replaced, and a subpath that drags a peer into a consumer who never asked for it.

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

- **Every peer is optional, and each subpath needs only its own.** The root barrel re-exports `auth`, `config`, `helpers`, `pages` — `@playwright/test` only. An export reaching `msw`, `@msw/playwright`, `vitest` or Storybook from the root is a finding.
  `grep -n "from '" packages/playwright/src/index.ts packages/playwright/src/{auth,config,helpers,pages}/*.ts | grep -v "@playwright/test\|'\./\|'\.\./"`
- **Browser-only subpaths are declared, not silently skipped.** A subpath importing `vitest/browser` is listed in `nxgt.browserOnly`, and `verify-artifacts.ts` prints its skip. A browser-only subpath with no spec loading it in a browser, or a skip that prints nothing, is a finding.
- **`./storybook/setup` is an entry point on purpose.** `storybookProject` resolves `new URL('./setup.js', import.meta.url)` beside the built `index.js`; folding `setup.ts` into another module breaks every consumer at run time while the build stays green.
- **A hydration helper proves the value survived, not that it was typed.** `fillSettled` re-reads after `settle`; `fillUntilEnabled` re-checks values and the button after `settle`. A change that returns on the first success reintroduces the defect `test/e2e/helpers.pw.ts` catches.
- **Nothing app-specific.** Test ids beyond overridable defaults (`submit`, `data-pw`), credentials, handlers, sign-in pages: a finding. They reach the package as arguments.
- **The capture's names are Storybook's.** A preview file is `componentId(story.id)`; a second slug function that could disagree with Storybook's is a finding (`titleToComponentId` exists for callers with only a title, and is tested against Storybook's ids).
