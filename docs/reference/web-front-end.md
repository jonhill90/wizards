# Web front end

A temporary, basic page that walks a tree in the browser. No model runs and no server logic exists: the page reads `wizards/<name>/tree.json` and `wizards/<name>/diagrams/diagrams.json` and walks the tree with a TypeScript copy of the evaluator. Why TypeScript and Playwright: [decision 0001](../decisions/0001-write-the-front-end-in-typescript-with-playwright-tests.md).

## Run it

```text
cd web
npm ci
npm run build
npm run serve        # http://127.0.0.1:4173/
```

`?w=<slug>` picks the wizard (default `azure-resiliency`). The answers are in the address after `#a=`, as comma-separated option ids, so any state can be linked and the same link always gives the same screen: `/web/index.html#a=yes,vm,region`.

## Test it

```text
cd web
npx playwright install chromium     # once; or set CHROMIUM_PATH to an installed Chromium
npm test
```

| Test file | What it proves |
|---|---|
| `tests/parity.spec.ts` | The TypeScript evaluator gives the same paths, steps and result as the Python engine for every path |
| `tests/diagrams.spec.ts` | The diagram manifest matches the tree, files exist and are self-contained SVGs, the fallback rule works |
| `tests/ui.spec.ts` | Clicking through, back, start over, deep links, all paths render, no page errors |

## Diagrams

Each wizard may have `wizards/<name>/diagrams/diagrams.json` and the SVG files it names:

```text
{"version":1,
 "diagrams":{"<diagram-id>":{"file":"<diagram-id>.svg","title":"...","alt":"one sentence for screen readers"}},
 "nodes":{"<tree node id>":"<diagram-id>"}}
```

The page shows the diagram of the current node, or else of the nearest earlier node on the person's path that has one, so a question node can carry a service overview and each result node its own design. An SVG must set a `viewBox`, contain no script or event handlers, and reference nothing outside itself. A node with no diagram anywhere on its path shows a plain placeholder.

## Not built yet

A diagram for most nodes (only `r-vm-region` has one, and it is a sample); a check that warns on a result node with no diagram; a hosted copy; any styling work. The page is meant to be replaced.
