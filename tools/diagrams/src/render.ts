import type { DiagramEntry } from "./model.js";
import type { IconSource } from "./icons.js";
import { draw } from "./templates.js";

/** Draw one diagram to a self-contained SVG string. Same input, same bytes. */
export function renderDiagram(entry: DiagramEntry, icons: IconSource): string {
  return draw(entry.spec, icons).svg(entry.title, entry.alt);
}
