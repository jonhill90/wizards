import type { Icon, IconSource } from "./iconparse.js";

/** Style numbers measured from Microsoft's Architecture Center SVGs (see docs/explanations/diagrams.md). */
export const STYLE = {
  font: "'Segoe UI','Segoe UI_MSFontService',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif",
  ink: "#000000",
  grey: "#737373",
  label: 11,
  small: 10,
  title: 12,
  boxStroke: 0.75,
  arrowStroke: 1.5,
  numberFill: "#107c10",
  numberRadius: 8.1,
  boundary: "#4472c4",
  panelFill: "#f2f2f2",
  panelStroke: "#bfbfbf",
  subnetFill: "#dae8fc",
  subnetStroke: "#6c8ebf",
  red: "#ff0000",
  iconSize: 32,
} as const;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Word wrap by character count; Segoe UI at 11 px is about 5.6 px a character. */
export function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > maxChars) {
      out.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  if (line) out.push(line);
  return out;
}

export interface TextOpts {
  size?: number;
  anchor?: "start" | "middle" | "end";
  bold?: boolean;
  fill?: string;
}

export class Canvas {
  readonly defs: string[] = [];
  readonly parts: string[] = [];
  private iconCount = 0;
  private usedFilter = false;
  private step = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly icons: IconSource,
    private readonly animate = false,
  ) {
    this.defs.push(
      `<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z" fill="${STYLE.ink}"/></marker>`,
      `<marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z" fill="${STYLE.red}"/></marker>`,
    );
  }

  /** Entrance-animation hook: a class and a delay that grows with drawing order. Empty when not animated. */
  private fx(kind: "box" | "line" | "fade"): string {
    if (!this.animate) return "";
    const d = Math.min(this.step++ * 40, 1400);
    return ` class="mv-${kind}" style="--d:${d}ms"`;
  }

  text(x: number, y: number, s: string, o: TextOpts = {}): void {
    const size = o.size ?? STYLE.label;
    const lines = s.split("\n");
    const tsp = lines
      .map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : (size * 1.2).toFixed(1)}">${esc(ln)}</tspan>`)
      .join("");
    this.parts.push(
      `<text${this.fx("fade")} x="${x}" y="${y}" font-size="${size}" text-anchor="${o.anchor ?? "middle"}"${o.bold ? ' font-weight="600"' : ""} fill="${o.fill ?? STYLE.ink}">${tsp}</text>`,
    );
  }

  /** Wrapped text block; returns its height. */
  block(cx: number, top: number, s: string, maxChars: number, o: TextOpts = {}): number {
    const size = o.size ?? STYLE.label;
    const lines = wrap(s, maxChars);
    this.text(cx, top + size, lines.join("\n"), o);
    return lines.length * size * 1.2;
  }

  box(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number; dash?: string; rx?: number } = {}): void {
    this.parts.push(
      `<rect${this.fx("box")} x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 0}" fill="${o.fill ?? "#ffffff"}" stroke="${o.stroke ?? STYLE.ink}" stroke-width="${o.sw ?? STYLE.boxStroke}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`,
    );
  }

  /** Blue dashed rounded boundary: a network or a scope. */
  boundary(x: number, y: number, w: number, h: number): void {
    this.box(x, y, w, h, { fill: "none", stroke: STYLE.boundary, dash: "2.25,2.25", rx: 6 });
  }

  line(pts: [number, number][], o: { end?: boolean; start?: boolean; red?: boolean; dash?: string; color?: string } = {}): void {
    const end = o.end ?? true;
    const marker = end ? ` marker-end="url(#${o.red ? "arrow-red" : "arrow"})"` : "";
    const start = o.start ? ' marker-start="url(#arrow)"' : "";
    const color = o.red ? STYLE.red : (o.color ?? STYLE.ink);
    this.parts.push(
      `<polyline${this.fx(o.dash ? "fade" : "line")}${this.animate && !o.dash ? ' pathLength="1"' : ""} points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="${STYLE.arrowStroke}" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${marker}${start}/>`,
    );
  }

  /** Green numbered circle. */
  number(cx: number, cy: number, n: number): void {
    this.parts.push(`<circle${this.fx("fade")} cx="${cx}" cy="${cy}" r="${STYLE.numberRadius}" fill="${STYLE.numberFill}"/>`);
    this.text(cx, cy + 3.2, String(n), { size: 9, bold: true, fill: "#ffffff" });
  }

  /** An official icon, scaled to `size` and centred in a square at (x, y). Grey draws the recovery side. */
  icon(name: string, x: number, y: number, size: number = STYLE.iconSize, grey = false): void {
    const ic: Icon = this.icons(name);
    const n = ++this.iconCount;
    const prefix = `ic${n}-`;
    let body = ic.body;
    const ids = new Set<string>();
    for (const m of body.matchAll(/\sid="([^"]+)"/g)) if (m[1]) ids.add(m[1]);
    for (const id of ids) {
      body = body.split(`id="${id}"`).join(`id="${prefix}${id}"`).split(`url(#${id})`).join(`url(#${prefix}${id})`).split(`href="#${id}"`).join(`href="#${prefix}${id}"`);
    }
    const s = size / Math.max(ic.w, ic.h);
    const ox = x + (size - ic.w * s) / 2;
    const oy = y + (size - ic.h * s) / 2;
    if (grey && !this.usedFilter) {
      this.defs.push('<filter id="grey"><feColorMatrix type="saturate" values="0"/></filter>');
      this.usedFilter = true;
    }
    this.parts.push(
      `<g${this.fx("fade")} transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${s.toFixed(4)})"${grey ? ' filter="url(#grey)" opacity="0.8"' : ""}>${body}</g>`,
    );
  }

  /** Icon with its name under it, centred on cx. Returns the height used. */
  item(cx: number, top: number, it: { icon?: string; label: string }, grey = false, maxChars = 16): number {
    const size = STYLE.iconSize;
    const fill = grey ? STYLE.grey : STYLE.ink;
    if (it.icon) {
      this.icon(it.icon, cx - size / 2, top, size, grey);
    } else {
      // no official icon: the label stands alone, no invented shape
      const h0 = this.block(cx, top + size / 2 - 2, it.label, maxChars + 6, { size: STYLE.label, fill });
      return Math.max(size + 5, h0 + size / 2);
    }
    const h = this.block(cx, top + size + 3, it.label, maxChars, { size: STYLE.label, fill });
    return size + 3 + h + 2;
  }

  svg(title: string, alt: string): string {
    const css = this.animate
      ? `<style>.mv-box,.mv-fade{opacity:0;animation:mv-in .45s ease-out var(--d) forwards}.mv-line{stroke-dasharray:1;stroke-dashoffset:1;animation:mv-draw .6s ease-out var(--d) forwards}@keyframes mv-in{to{opacity:1}}@keyframes mv-draw{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.mv-box,.mv-fade,.mv-line{animation:none;opacity:1;stroke-dashoffset:0}}</style>\n`
      : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}" font-family="${esc(STYLE.font)}" role="img" aria-labelledby="t d">\n` +
      `<title id="t">${esc(title)}</title><desc id="d">${esc(alt)}</desc>\n` +
      `${css}<defs>${this.defs.join("")}</defs>\n<rect width="100%" height="100%" fill="#ffffff"/>\n${this.parts.join("\n")}\n</svg>\n`
    );
  }
}
