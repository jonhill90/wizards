import type { SpecFile } from "./model.js";

interface TreeNode { type: "question" | "result"; }
interface Tree { nodes: Record<string, TreeNode>; }

/** Nodes allowed to have no diagram of their own: they fall back to the last diagram on the path. */
// r-synapse-zone: the tree states a gap (no cited page gives a zone layout), so no diagram is drawn.
export const NO_DIAGRAM_OK = new Set<string>(["q-targets", "q-service", "r-define-targets", "r-other-service", "r-synapse-zone"]);

export function checkSpec(spec: SpecFile, tree: Tree, iconExists: (name: string) => boolean): string[] {
  const problems: string[] = [];
  const ids = new Set(Object.keys(spec.diagrams));
  for (const [node, diagram] of Object.entries(spec.nodes)) {
    if (!(node in tree.nodes)) problems.push(`nodes: "${node}" is not a node of the tree`);
    if (!ids.has(diagram)) problems.push(`nodes: "${node}" names diagram "${diagram}", which is not defined`);
  }
  const used = new Set(Object.values(spec.nodes));
  for (const id of ids) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) problems.push(`diagram id "${id}" is not a lowercase slug`);
    if (!used.has(id)) problems.push(`diagram "${id}" is not used by any node`);
    const e = spec.diagrams[id];
    if (!e) continue;
    if (!e.title.trim()) problems.push(`diagram "${id}" has no title`);
    if (e.alt.trim().split(/\s+/).length < 6) problems.push(`diagram "${id}" needs an alt sentence of at least six words`);
    const s = e.spec;
    const items =
      s.template === "overview" ? [s.service]
      : s.template === "zone" ? s.items
      : s.template === "region" ? [...s.primary, ...s.secondary, ...(s.router ? [s.router] : [])]
      : s.template === "backup" ? [...s.source, s.vault, ...(s.guard ? [s.guard] : [])]
      : s.nodes;
    for (const it of items) {
      if (!it.label.trim()) problems.push(`diagram "${id}" has an item with no label`);
      if (it.icon && !iconExists(it.icon)) problems.push(`diagram "${id}" uses unknown icon "${it.icon}"`);
    }
  }
  for (const [node, v] of Object.entries(tree.nodes)) {
    if (v.type === "result" && !(node in spec.nodes) && !NO_DIAGRAM_OK.has(node)) {
      problems.push(`result "${node}" has no diagram (add it to nodes, or to NO_DIAGRAM_OK with a reason)`);
    }
  }
  return problems;
}
