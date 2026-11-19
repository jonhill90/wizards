# Tree format

A tree is plain JSON, version 1. The evaluator is `scripts/wizards_engine.py`: standard library only, no clock, no randomness, and no network except `verify-sources`.

```text
{"wizard": "<slug>", "version": 1, "title": "...", "start": "<node id>", "nodes": {"<id>": <node>, ...}}
question node: {"type": "question", "text": "...", "help": "why this is asked",
                "options": [{"id": "<slug>", "label": "...", "next": "<node id>"}, ...], "sources": [...]}
result node:   {"type": "result", "title": "...", "summary": "...", "actions": ["..."], "caveats": ["..."], "sources": [...]}
source:        {"title": "...", "url": "https://learn.microsoft.com/...", "quote": "text on that page", "retrieved": "YYYY-MM-DD"}
```

## Why these choices

| Choice | Why |
|---|---|
| Plain JSON | Any language can read it, there is no YAML dependency, and a contributor edits data, not code. Another evaluator can read the same file. |
| Two node kinds: question (two or more options) and result | The smallest shape that holds a question-by-question walk. Answers are option ids, so a deep link or a test is a list of ids. |
| No loops, shared subtrees allowed | A wizard that can revisit a question cannot be proven to finish. With no loops `paths` lists every path, so a test can prove every result is reachable. |
| Every node cites a source with a quote | A claim with no page behind it does not belong in a tree. |
| `verify-sources` fetches each page and checks the quote | A citation nobody checks decays. Learn pages change, so CI runs it weekly. |
| `validate` runs inside every other command | A broken tree never produces an answer. |

`validate` enforces: the start node exists; every `next` names a node; every node is reachable from start; no loops; a question has two or more options with unique ids; a result has none; every node has at least one source on learn.microsoft.com with a non-empty quote and a retrieved date; node ids are lowercase slugs.

Commands: `validate`, `run --answers a,b,c` (also `--json`), `ask`, `paths`, `verify-sources`.
