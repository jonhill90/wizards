# 0002: Write the front end in TypeScript and test it with Playwright

Status: proposed (an agent's pick; the owner has not accepted it)

## Context

The owner asked for a basic front end that walks a tree and shows a diagram that updates with each answer, and said this is a Microsoft-lens project: use Microsoft-native tools where reasonable, for code and for tests. The front end is temporary; a better one comes later.

## Decision

- **TypeScript**, compiled with `tsc` straight to ES modules. No bundler and no UI framework, so the whole front end is about 250 lines and easy to throw away.
- **Playwright Test** for every test: unit-style checks run in Node, and the end-to-end checks drive a real browser. One runner and one tool for both.
- **Fluent UI Web Components** (Microsoft, MIT) for the controls and theme, loaded as plain ES modules from `node_modules`, and the diagram generator in `tools/diagrams` for the picture, drawn live in the browser.
- The Python engine stays the reference. The TypeScript evaluator is a second reader of the same JSON, and a parity test proves both give the same steps and result for all of the tree's paths.
- **.NET** was not used: nothing here needs a server, and the .NET SDK was not on the machine that built this. A later back end or CLI may use it.

## Consequences

- A change to the tree format needs a change to both evaluators, and the parity test fails until both agree.
- Tools are all free and open source (TypeScript and Playwright are Apache-2.0), which fits the owner's wider rule for the platform repo.
- Dependencies are pinned to exact versions in `web/package.json` and `web/package-lock.json`.
