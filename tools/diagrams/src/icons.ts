import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IconFile } from "./model.js";

export interface Icon {
  /** Width and height in the icon's own units. */
  w: number;
  h: number;
  viewBox: string;
  /** Contents of the icon's <svg>, with its <defs> kept. */
  body: string;
}

export type IconSource = (name: string) => Icon;

const HERE = dirname(fileURLToPath(import.meta.url));
export const ICON_DIR = join(HERE, "..", "..", "icons");

export function parseIcon(svg: string): Icon {
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) throw new Error("icon has no <svg> element");
  const tag = open[0];
  const inner = svg.slice(open.index + tag.length, svg.lastIndexOf("</svg>"));
  const vb = /viewBox="([^"]+)"/.exec(tag);
  const wA = /\swidth="([\d.]+)/.exec(tag);
  const hA = /\sheight="([\d.]+)/.exec(tag);
  let viewBox: string;
  let w: number;
  let h: number;
  if (vb?.[1]) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    viewBox = vb[1];
    w = p[2] ?? 0;
    h = p[3] ?? 0;
  } else if (wA?.[1] && hA?.[1]) {
    w = Number(wA[1]);
    h = Number(hA[1]);
    viewBox = `0 0 ${w} ${h}`;
  } else throw new Error("icon has neither viewBox nor width and height");
  const body = inner.replace(/<title>[\s\S]*?<\/title>/g, "");
  return { w, h, viewBox, body };
}

export function loadManifest(dir = ICON_DIR): Record<string, IconFile> {
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { icons: Record<string, IconFile> };
  return m.icons;
}

export function fileIconSource(dir = ICON_DIR): IconSource {
  const manifest = loadManifest(dir);
  const cache = new Map<string, Icon>();
  return (name: string) => {
    const hit = cache.get(name);
    if (hit) return hit;
    const entry = manifest[name];
    if (!entry) throw new Error(`unknown icon "${name}"; add it to icons/manifest.json`);
    const icon = parseIcon(readFileSync(join(dir, entry.file), "utf8"));
    cache.set(name, icon);
    return icon;
  };
}
