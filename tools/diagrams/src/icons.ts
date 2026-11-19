import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IconFile } from "./model.js";

import { parseIcon } from "./iconparse.js";
import type { Icon, IconSource } from "./iconparse.js";
export { parseIcon };
export type { Icon, IconSource };

const HERE = dirname(fileURLToPath(import.meta.url));
export const ICON_DIR = join(HERE, "..", "..", "icons");

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
