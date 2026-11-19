# 0001: Generate the diagrams from a spec

Status: proposed

## Context

Each answer path needs an updated visual. The visuals must look like Architecture Center diagrams, use official icons, and stay in step with the trees.

## Decision

Generate self-contained SVGs from `diagrams.spec.json` with a small TypeScript tool in `tools/diagrams/`. Four templates (overview, zone, region, backup). A node-to-diagram map, `diagrams.json`, is the contract with any front end. A node without its own diagram uses the last diagram on its path.

## Consequences

- Adding a service is a JSON edit plus `npm run diagrams`.
- CI checks the spec against the tree, rebuilds, and fails on a stale file.
- A layout the four templates cannot draw needs a new template, which is a tool change in its own pull request.
- Icons are third-party files under Microsoft's terms; see `tools/diagrams/icons/NOTICE.md`.
