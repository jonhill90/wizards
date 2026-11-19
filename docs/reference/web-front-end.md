# Web front end

A temporary page that walks a tree in the browser. No model runs and there is no server logic: the page reads `wizards/<name>/tree.json` and `wizards/<name>/diagrams/diagrams.spec.json`, walks the tree with a TypeScript copy of the evaluator, and draws the diagram live with the generator in `tools/diagrams`. Why TypeScript and Playwright: [decision 0002](../decisions/0002-write-the-front-end-in-typescript-with-playwright-tests.md).

## Run it

```text
cd web && npm ci && npm run build        # tools/diagrams/web/diagrams.mjs is committed, so it needs no build here
npm run serve        # http://127.0.0.1:4173/
```

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
| `tests/ui.spec.ts` | Click-through, back, start over, deep links, all 62 results render with the right diagram, the ribbon grows, the theme switch works, reduced motion works, and the browser's drawing is byte-identical to the committed SVG for every diagram |

## Not built yet

A hosted copy (the page reads `web/node_modules` and `tools/diagrams/web` from the repository root, so it needs a build step to publish); a keyboard and screen-reader pass; any work on a phone-sized layout beyond stacking the two cards.
