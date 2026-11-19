# Agent rules for this repository

*(`CLAUDE.md` is a symlink to this file.)*

This repository holds deterministic question-tree wizards: data trees and a small evaluator. No AI runs when a wizard is used.

## Rules

- This repository is public. Write no personal or employer details, client or business details, hostnames, private network names or secrets.
- Every tree node cites at least one Microsoft Learn page with a quote that is on that page. Quote whole sentences, not table labels or fragments. Read the whole page around a quote before you write the node's wording: a quote on the page does not prove your paraphrase is right.
- One service branch per pull request. A node states only what its cited pages say. Where no page says it, write a result that says so and name the gap; do not fill it from memory.
- Before you say a tree works, run `validate`, the tests and `verify-sources` and show the output (see README.md).
- When you add or remove nodes, update the path counts the tests pin.
- Trees are data: a contributor edits JSON, not the evaluator. A change to `scripts/wizards_engine.py` needs its own pull request and tests.
- The front end is in `web/` (TypeScript, tested with Playwright). It must stay in step with `scripts/wizards_engine.py`: change the tree format in both, and `web/tests/parity.spec.ts` must pass. Diagrams follow `docs/reference/web-front-end.md`.
- Diagrams are data too: edit `diagrams.spec.json`, run `npm run diagrams` in `tools/diagrams/`, and commit the output. Never hand-edit a generated SVG. Use only icons in `tools/diagrams/icons/manifest.json`; do not draw a product icon yourself. When you add or remove tree nodes, update the diagram map.
- Branch `<type>/<short-description>`; pull request title `<type>: <summary>`; types `feat`, `fix`, `docs`, `chore`, `refactor`, `ci`, `test`, `revert`.
- No workflows on `pull_request_target`, `issue_comment` or `issues`, and no workflow that runs an agent or reads secrets. Checks here are plain scripts.

## Docs or notebook?

Is it about this repository, saying why it is so, what it is, or how to use or change it? Yes: it goes here, by pull request. No, or still working material (research, measurements, notes): it goes in the agent notebook, which may link here but never copies these docs. Nothing here links into the notebook.
