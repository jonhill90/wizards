// Diagram manifest: wizards/<name>/diagrams/diagrams.json (contract agreed with the diagram work).
//   {"version":1,"diagrams":{"<id>":{"file":"<id>.svg","title":"...","alt":"..."}},"nodes":{"<node id>":"<diagram id>"}}
// The page shows the diagram of the current node, or else of the nearest earlier node on the path that has one.

export interface DiagramEntry { file: string; title: string; alt: string }
export interface DiagramManifest { version: number; diagrams: Record<string, DiagramEntry>; nodes: Record<string, string> }
export interface DiagramChoice { id: string; entry: DiagramEntry; fromNode: string }

export function pickDiagram(manifest: DiagramManifest | null, path: readonly string[]): DiagramChoice | null {
  if (!manifest) return null;
  for (let i = path.length - 1; i >= 0; i--) {
    const nodeId = path[i];
    if (nodeId === undefined) continue;
    const id = manifest.nodes[nodeId];
    const entry = id === undefined ? undefined : manifest.diagrams[id];
    if (id !== undefined && entry) return { id, entry, fromNode: nodeId };
  }
  return null;
}

/** Problems in a manifest against a tree's node ids; empty means fine. */
export function checkManifest(manifest: DiagramManifest, nodeIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (manifest.version !== 1) problems.push(`unsupported manifest version ${manifest.version}`);
  for (const [id, d] of Object.entries(manifest.diagrams)) {
    if (!d.file.endsWith(".svg") || d.file.includes("/") || d.file.includes("..")) problems.push(`diagram ${id}: file must be a plain .svg name`);
    if (!d.title || !d.alt) problems.push(`diagram ${id}: title and alt are required`);
  }
  for (const [node, id] of Object.entries(manifest.nodes)) {
    if (!nodeIds.has(node)) problems.push(`mapping names unknown node ${node}`);
    if (!(id in manifest.diagrams)) problems.push(`node ${node} maps to unknown diagram ${id}`);
  }
  return problems;
}
