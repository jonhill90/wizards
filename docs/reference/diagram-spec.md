# Diagram spec

Each wizard can carry a diagram set in `wizards/<wizard>/diagrams/`. The set is built from one JSON file, `diagrams.spec.json`. A contributor edits that file; the generator in `tools/diagrams/` turns it into SVGs and a node map. No model runs at build time, and the same spec gives the same bytes.

## Files

| File | Made by | What it is |
|---|---|---|
| `diagrams.spec.json` | a person | The source: diagram definitions and the node map |
| `<id>.svg` | `npm run diagrams` | One self-contained SVG per diagram |
| `diagrams.json` | `npm run diagrams` | Node id to diagram id, with each diagram's title, alt text and file name. A front end reads this file |

Never edit the SVGs or `diagrams.json` by hand. The tests fail if they differ from a fresh build.

## `diagrams.spec.json`

```json
{
  "diagrams": {
    "<id>": { "title": "…", "alt": "…", "spec": { "template": "zone", "items": [] } }
  },
  "nodes": { "<tree node id>": "<diagram id>" }
}
```

- `id` is a lowercase slug.
- `title` is a short name. `alt` is a sentence of at least six words that describes the picture; it becomes the start of the SVG `desc` for screen readers. The generator appends sentences on structure, arrows and colour (the legend), so do not repeat those in `alt`.
- Every diagram must be used by at least one node, and every key in `nodes` must be a node of the tree.
- Every result node needs a diagram, or must be listed in `NO_DIAGRAM_OK` in `tools/diagrams/src/check.ts`. A listed node is a stated gap and a front end keeps the previous diagram on the path.

## Templates

An item is `{ "icon": "<name>", "label": "…" }`. The icon is optional. Without one the label stands alone; the generator never draws a stand-in shape.

| Template | Fields | Shows |
|---|---|---|
| `overview` | `service`, `asks?` | The service and the three failures the wizard asks about |
| `zone` | `items`, `zones?` (2 or 3), `link?`, `badge?` | One region with availability zones, items repeated in each |
| `region` | `primary`, `secondary`, `router?`, `link?`, `secondaryKind?` (`standby`, `live`, `restore`), `primaryTitle?`, `secondaryTitle?`, `failoverLabel?` | Two regions, an optional router above them, and an arrow between them |
| `backup` | `source`, `vault`, `backupLabel?`, `restoreLabel?`, `features?`, `guard?`, `guardLabel?`, `noRestore?` | Protected data, a backup target, and the backup and restore arrows |

Zone counts and replica counts in a diagram are illustrative unless the node's cited page gives a number.

## Icons

Icon names are the keys in `tools/diagrams/icons/manifest.json`. A name that is not in the manifest fails the check. See `tools/diagrams/icons/NOTICE.md` for sources and terms.

## Commands

Run from `tools/diagrams/`:

```text
npm ci
npm run diagrams   # write the SVGs and diagrams.json
npm run check      # build in memory and fail if the committed files differ or the spec is wrong
npm test           # node:test suite
```
