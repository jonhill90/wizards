# Web front end

A temporary page that walks a tree in the browser. No model runs and there is no server logic: the page reads `wizards/<name>/tree.json` and `wizards/<name>/diagrams/diagrams.spec.json`, walks the tree with a TypeScript copy of the evaluator, and draws the diagram live with the generator in `tools/diagrams`. Why TypeScript and Playwright: [decision 0002](../decisions/0002-write-the-front-end-in-typescript-with-playwright-tests.md).

## Run it

```text
cd web && npm ci && npm run build        # tools/diagrams/web/diagrams.mjs is committed, so it needs no build here
npm run serve        # http://127.0.0.1:4173/
```

To get a copy that needs no `node_modules` and no checkout, run `npm run build && node build-site.mjs` in `web/`. It writes `web/site/` (about 2 MB: the page, the compiled scripts, the Fluent bundle and tokens, the diagram module and `wizards/`), which any static file host can serve; the layout mirrors the repository, so no path changes. Locally: `SITE_ROOT=site node serve.mjs 4174`. This repository does not publish it anywhere; hosting is a separate decision.

`?w=<slug>` picks the wizard (default `azure-resiliency`). The answers are in the address after `#a=`, as comma-separated option ids, so any state can be linked and the same link always gives the same screen: `/web/index.html#a=yes,vm,region`.

## What you see

- **Left card:** a numbered step ribbon that gains one green circle per answer, then the question (or the result with What to do, Keep in mind and Sources). Controls are Fluent UI Web Components: `fluent-button`, `fluent-text`, `fluent-accordion`, `fluent-message-bar`, `fluent-badge`, `fluent-switch`.
- **Right card:** the diagram for the current step, drawn in the browser by `tools/diagrams/web/diagrams.mjs` from the spec and animated in (items fade up in drawing order, solid arrows draw themselves). A step with no diagram keeps the last one earlier on the path. The canvas stays white in both themes, as Microsoft draws architecture diagrams.
- **Theme:** light or dark, from the system setting and a switch. The theme's tokens are set as CSS custom properties on the page (the effect of the library's `setTheme()`).

## Design sources

| Choice | Source |
|---|---|
| Fluent UI Web Components v3 (MIT), loaded as ES modules with no bundler | [Fluent UI Web Components overview](https://learn.microsoft.com/fluent-ui/web-components/) and the package's own README and exports |
| Theme tokens (colour, font, radius, shadow, motion) from `@fluentui/tokens` | package source, `lib/global/borderRadius.js`, `curves.js`, `durations.js`; [Styling the components](https://learn.microsoft.com/fluent-ui/web-components/getting-started/styling) |
| 4px corners on controls, 8px on cards | [Geometry in Windows](https://learn.microsoft.com/windows/apps/design/signature-experiences/geometry); the tokens `borderRadiusMedium` and `borderRadiusXLarge` carry the same values |
| Card elevation 8 with a 1px stroke, two layers (base and content) | [Elevation in Windows](https://learn.microsoft.com/windows/apps/design/signature-experiences/layering) |
| Entrance motion 250 ms with `cubic-bezier(0,0,0,1)`, fade 83 ms linear; no custom animation beyond that | [Motion in Windows](https://learn.microsoft.com/windows/apps/design/signature-experiences/motion), animation properties table |
| Segoe UI Variable, 14/20 body, titles semibold, sentence case, 50 to 60 characters a line | [Typography in Windows](https://learn.microsoft.com/windows/apps/design/signature-experiences/typography) |
| Diagram look: Architecture Center style, green numbered circles | `docs/explanations/diagrams.md` |

The Fluent 2 site itself (fluent2.microsoft.design) was not reachable when this was built, so the Windows pages above, which describe how Fluent is applied, and the package source stand in for it.

## Test it

```text
cd web
npx playwright install chromium     # once; or set CHROMIUM_PATH to an installed Chromium
npm test
```

| Test file | What it proves |
|---|---|
| `tests/parity.spec.ts` | The TypeScript evaluator gives the same paths, steps and result as the Python engine for every path |
| `tests/diagrams.spec.ts` | The static manifest matches the tree, files exist and are self-contained, the fallback rule works |
| `tests/quality.spec.ts` | axe-core (the engine of Microsoft's Accessibility Insights) finds no WCAG 2.2 AA violations on the question and result screens in light, dark and Windows high contrast; keyboard-only use works; the diagram has a text description; on a phone (390 px) the page does not grow wider, the drawing scrolls inside its own box and every button is at least 44 x 44; at 320 px (400% zoom) the page does not scroll sideways |
| `tests/static.spec.ts` | The built `web/site/` served alone (no repository, no node_modules) loads Fluent, the tree and the live diagram with no failed request |
| `tests/ui.spec.ts` | Click-through, back, start over, deep links, all 62 results render with the right diagram, the ribbon grows, the theme switch works, reduced motion works, and the browser's drawing is byte-identical to the committed SVG for every diagram |

## Accessibility and phone

Checked against Microsoft's Learn guidance: [Touch interactions](https://learn.microsoft.com/windows/apps/develop/input/touch-interactions) (touchable is 40 x 40 epx, touch-optimized 44 x 44 with 4 epx between targets) and the [Accessibility checklist](https://learn.microsoft.com/windows/apps/design/accessibility/accessibility-checklist) (names, keyboard, contrast of at least 4.5:1, high contrast, automated checks in CI). The headings are real `h1`/`h2` elements, Back and Start over appear only when there is something to go back to, and on a phone the drawing keeps a readable size and scrolls sideways inside its own focusable box. A manual pass with Narrator and a real phone has not been done: the automated checks cannot replace it.

## Polish pass

Refined (not redesigned) with the Operate-surface guidance of the open-source Impeccable design skill (Apache-2.0, pbakaus/impeccable: `polish`, `operate` and the craft floor), kept inside the Fluent look. What changed: the diagram card is now the white canvas itself instead of a box inside a box, and is wider (4 : 8 columns); a left stripe on quotes became a tinted block (no coloured side borders); the text check mark became a drawn SVG; step labels wrap instead of being cut off; headings balance their lines and have more space above than below; selection colour, native controls, scrollbar, link underline offset and numerals follow the palette; the loading state is a skeleton; the empty diagram and the unknown-wizard error say what to do next. Kept on purpose, where the two sources differ: card elevation plus a 1 px stroke (Windows layering guidance) and the staged diagram animation (asked for by the owner). The Impeccable detector was not run (it downloads a binary and phones home); the checks are the Playwright suite above.

## Not built yet

A hosted copy (the build above is ready to host, but nothing publishes it); a Narrator and real-device pass; the Fluent 2 design site's own pages (blocked from the build environment, so the design follows Learn and the package source); the layout on a phone puts the drawing below the questions.
