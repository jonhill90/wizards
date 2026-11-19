// Evaluator for tree format version 1 (docs/reference/tree-format.md).
// Deterministic: no clock, no randomness, no network. The Python engine
// (scripts/wizards_engine.py) stays the reference; tests/parity.spec.ts proves both agree.

export interface Source { title: string; url: string; quote: string; retrieved: string }
export interface Option { id: string; label: string; next: string }
export interface QuestionNode { type: "question"; text: string; help?: string; options: Option[]; sources: Source[] }
export interface ResultNode { type: "result"; title: string; summary: string; actions: string[]; caveats: string[]; sources: Source[] }
export type TreeNode = QuestionNode | ResultNode;
export interface Tree { wizard: string; version: number; title: string; start: string; nodes: Record<string, TreeNode> }

export interface Step { node: string; question: string; answer: string; label: string }
export interface Position {
  /** Node the person is on now. */
  nodeId: string;
  node: TreeNode;
  /** Questions already answered, in order. */
  steps: Step[];
  /** Node ids visited, start first, current last. */
  path: string[];
}

export class WalkError extends Error {}

export function walk(tree: Tree, answers: readonly string[]): Position {
  let nodeId = tree.start;
  const steps: Step[] = [];
  const path = [nodeId];
  for (const answer of answers) {
    const node = tree.nodes[nodeId];
    if (!node) throw new WalkError(`unknown node ${nodeId}`);
    if (node.type !== "question") throw new WalkError(`answer "${answer}" given after the result at ${nodeId}`);
    const option = node.options.find((o) => o.id === answer);
    if (!option) throw new WalkError(`"${answer}" is not an option at ${nodeId}`);
    steps.push({ node: nodeId, question: node.text, answer, label: option.label });
    nodeId = option.next;
    path.push(nodeId);
  }
  const node = tree.nodes[nodeId];
  if (!node) throw new WalkError(`unknown node ${nodeId}`);
  return { nodeId, node, steps, path };
}

/** Every complete path from the start to a result, as the answers that lead there. */
export function allPaths(tree: Tree): { answers: string[]; result: string }[] {
  const out: { answers: string[]; result: string }[] = [];
  const visit = (id: string, answers: string[]): void => {
    const node = tree.nodes[id];
    if (!node) throw new WalkError(`unknown node ${id}`);
    if (node.type === "result") { out.push({ answers, result: id }); return; }
    for (const o of node.options) visit(o.next, [...answers, o.id]);
  };
  visit(tree.start, []);
  return out;
}
