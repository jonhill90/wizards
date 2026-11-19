# Tree format

A tree is plain JSON, version 1. The evaluator is `scripts/wizards_engine.py`: standard library only, no clock, no randomness, and no network except `verify-sources`.

```text
{"wizard": "<slug>", "version": 1, "title": "...", "start": "<node id>", "nodes": {"<id>": <node>, ...}}
question node: {"type": "question", "text": "...", "help": "why this is asked",
                "options": [{"id": "<slug>", "label": "...", "next": "<node id>"}, ...], "sources": [...]}
result node:   {"type": "result", "title": "...", "summary": "...", "actions": ["..."], "caveats": ["..."], "sources": [...]}
source:        {"title": "...", "url": "https://learn.microsoft.com/...", "quote": "text on that page", "retrieved": "YYYY-MM-DD"}
```

## Shape step

A result may name a `shape`: sizing questions asked after the answer, such as how many availability zones, which regions, how backup traffic reaches Azure. They change the drawing and never the advice, and they add no paths, so a VM count cannot multiply the tree.

```text
tree:         {"shapes": {"<id>": {"title": "...", "questions": [<question>, ...]}}}
result node:  {..., "shape": "<id>"}
question:     {"id": "<slug>", "kind": "region" | "second-region" | "choice", "text": "...", "help": "...",
               "options": [{"id": "<slug>", "label": "..."}], "sources": [...]}
```

- `region` and `second-region` take their options from `wizards/<name>/regions.json`, built from Learn's region pairs and availability zones pages (each region's zone count, its pair, whether access is restricted). A `choice` has its own options. Each question cites a Learn page, and `verify-sources` checks those quotes and the ones in `regions.json`.
- The second region defaults to the region pair when the primary has one. The pair is a default, not a rule: the region pairs page says pairing does not make anything resilient by itself, and many regions have none.
- Answers sit in the address after `#s=` as `question~option` pairs, so a link keeps them. With no answer the drawing keeps its default layout.
- Question ids are shared across shapes and become drawing parameters: `primary`, `secondary`, `zones`, `instances`, `link`, `seeding`, `data`. See `docs/reference/diagram-spec.md`.

## Why these choices

| Choice | Why |
|---|---|
| Plain JSON | Any language can read it, there is no YAML dependency, and a contributor edits data, not code. Another evaluator can read the same file. |
| Two node kinds: question (two or more options) and result | The smallest shape that holds a question-by-question walk. Answers are option ids, so a deep link or a test is a list of ids. |
| No loops, shared subtrees allowed | A wizard that can revisit a question cannot be proven to finish. With no loops `paths` lists every path, so a test can prove every result is reachable. |
| Every node cites a source with a quote | A claim with no page behind it does not belong in a tree. |
| `verify-sources` fetches each page and checks the quote | A citation nobody checks decays. Learn pages change, so CI runs it weekly. |
| `validate` runs inside every other command | A broken tree never produces an answer. |

`validate` enforces: the start node exists; a shape's questions have unique slug ids, a known kind, options for a choice and sources; a result's shape is defined; every `next` names a node; every node is reachable from start; no loops; a question has two or more options with unique ids; a result has none; every node has at least one source on learn.microsoft.com with a non-empty quote and a retrieved date; node ids are lowercase slugs.

Commands: `validate`, `run --answers a,b,c` (also `--json`), `ask`, `paths`, `verify-sources`.
