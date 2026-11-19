/**
 * Browser entry: draws a wizard diagram from its spec, in the page, with no server and no model.
 * The bundle in web/diagrams.mjs adds the icons; this file has no file access.
 */
import { parseIcon } from "./iconparse.js";
import type { Icon, IconSource } from "./iconparse.js";
import type { DiagramEntry, SpecFile } from "./model.js";
import { renderDiagram } from "./render.js";

export type { DiagramEntry, SpecFile };

export interface Drawn {
  /** The diagram id the node maps to. */
  id: string;
  title: string;
  alt: string;
  svg: string;
  /** The node the diagram was taken from: the last node on the path that has one. */
  fromNode: string;
}

export interface Renderer {
  /** Draw one diagram by id. */
  render(spec: SpecFile, id: string, opts?: { animate?: boolean }): string;
  /**
   * Diagram for a walk through the tree. `path` is the node ids visited, oldest first.
   * A node with no diagram of its own keeps the last one earlier on the path; null before any.
   */
  forPath(spec: SpecFile, path: string[], opts?: { animate?: boolean }): Drawn | null;
}

export function createRenderer(iconSvgs: Record<string, string>): Renderer {
  const cache = new Map<string, Icon>();
  const icons: IconSource = (name) => {
    const hit = cache.get(name);
    if (hit) return hit;
    const svg = iconSvgs[name];
    if (svg === undefined) throw new Error(`unknown icon "${name}"`);
    const icon = parseIcon(svg);
    cache.set(name, icon);
    return icon;
  };
  const render = (spec: SpecFile, id: string, opts: { animate?: boolean } = {}): string => {
    const entry = spec.diagrams[id];
    if (!entry) throw new Error(`unknown diagram "${id}"`);
    return renderDiagram(entry, icons, opts);
  };
  return {
    render,
    forPath(spec, path, opts = {}) {
      for (let i = path.length - 1; i >= 0; i--) {
        const node = path[i] as string;
        const id = spec.nodes[node];
        if (id !== undefined) {
          const e = spec.diagrams[id] as DiagramEntry;
          return { id, title: e.title, alt: e.alt, svg: render(spec, id, opts), fromNode: node };
        }
      }
      return null;
    },
  };
}
