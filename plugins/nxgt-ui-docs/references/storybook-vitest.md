# Storybook in Vitest browser mode — smoke tests and previews

Both component libraries take this from **`@nxgt/playwright/storybook`**
(`softistx/nxgt-devkit`). Nothing is copied: a fix to the capture is a
release of that package, and both libraries bump it.

## Install

```sh
bun add -d @nxgt/playwright @storybook/addon-vitest@<storybook version> \
  @vitest/browser-playwright@<vitest version> playwright
bunx playwright install chromium-headless-shell
```

- `@storybook/addon-vitest` at **the same version as `storybook`**,
  `@vitest/browser-playwright` at **the same version as `vitest`**.
- Do **not** call `setProjectAnnotations`: since Storybook 10.3 the addon
  applies `preview.ts` itself. The package's own setup file only registers
  the capture.
- Arch / Manjaro: Playwright falls back to an Ubuntu build, which usually
  works. If it does not, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
  — never install Ubuntu packages on those systems.

## Wire it

```ts
// vite.config.ts
import { storybookProject } from '@nxgt/playwright/storybook';

export default defineConfig({
	// …the library's own plugins: react() or vue(), tailwindcss()
	test: {
		projects: [
			{ extends: true, test: { name: 'unit', environment: 'node' } },
			storybookProject(),                  // every story, a smoke test
			storybookProject({ capture: true }), // stories tagged `preview` → docs/previews/
		],
	},
});
```

```jsonc
// package.json
"test": "vitest run --project unit",
"test:stories": "vitest run --project storybook",
"docs:previews": "vitest run --project previews"
```

`capture` takes `{ dir, tag, padding, maxWidth, quality, settle }`; the
defaults (`docs/previews`, `preview`, 24, 960, 0.82, 600 ms) are what this
skill assumes. Change them in both libraries or in neither.

## What the capture does

Screenshots the page at 1280×800, crops to the union of what is **painted**
(text, media, backgrounds, borders, shadows — portals included) plus the
padding, scales to `maxWidth`, encodes WebP in the browser, and writes
`<dir>/<component id>.webp`, where the component id is Storybook's id for
the title. A story needing a provider (router, i18n, store) gets it from a
decorator in `preview.ts`, exactly as in Storybook.

A test that times out under a full run usually passes alone: the full run
renders every chart, editor and PDF reader in one browser. Re-run the file
before debugging the story.
