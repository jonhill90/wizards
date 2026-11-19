# Why the diagrams work this way

A wizard answer is easier to trust when the person can see the shape of it: zones inside a region, two regions with a failover arrow, a vault holding backups. The diagrams show that shape for each result and for each service question.

## Look

The diagrams copy the drawing conventions of the Azure Architecture Center: white boxes with a thin black outline, grey group panels, blue zone panels, a dashed region boundary, black arrows with a filled head, red dashed failover lines, a greyed recovery side, and Segoe UI text with system fallbacks. Product shapes are the official Azure and Fabric icons, never redrawn.

## Why a generator

- A diagram drawn by hand drifts from the tree. A diagram generated from a spec, checked against the tree in CI, cannot name a node that does not exist.
- Four templates cover every result. A contributor describes what is in the picture and does not place pixels.
- The output is plain SVG with no script and no external reference, so it can be embedded anywhere and reviewed as text.
- The build is deterministic, so a diff shows only real changes.

## Why TypeScript

The tool is in TypeScript on Node with the built-in test runner, to match Microsoft's own tooling. The wizard evaluator stays in Python and is not touched by this tool; the two meet only at `tree.json` and `diagrams.json`.

## What the pictures do not claim

A picture is a summary of its node's cited pages. Where the tree states a gap, the diagram is left out rather than invented. Item counts such as three zones are a drawing choice unless the node says otherwise.
