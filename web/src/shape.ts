// The shape step (docs/reference/tree-format.md, "Shape step"): sizing questions asked after the result.
// Pure functions, no browser calls: the same answers always give the same drawing parameters.
import type { Shape, ShapeOption, ShapeQuestion } from "./evaluator.js";

export interface Region { id: string; name: string; zones: number; pair: string | null; restricted: boolean }
export interface RegionsFile { version: number; regions: Region[] }

/** What the generator in tools/diagrams takes (DrawParams in its model.ts). */
export interface DrawParams {
  primaryName?: string; secondaryName?: string; zones?: number; instances?: number;
  link?: "internet" | "private-endpoint"; seeding?: "yes" | "no"; data?: "under" | "over";
}

export type ShapeAnswers = Record<string, string>;

export const PAIR = "pair";

/** `k~v,k~v` in the address; ids are lowercase slugs so no escaping is needed. */
export function parseShape(raw: string | undefined): ShapeAnswers {
  const out: ShapeAnswers = {};
  for (const part of (raw ?? "").split(",")) {
    const [k, v] = part.split("~");
    if (k && v && /^[a-z0-9-]+$/.test(k) && /^[a-z0-9-]+$/.test(v)) out[k] = v;
  }
  return out;
}
export function formatShape(a: ShapeAnswers): string {
  return Object.entries(a).map(([k, v]) => `${k}~${v}`).join(",");
}

const byId = (regions: readonly Region[], id: string | undefined): Region | undefined => regions.find((r) => r.id === id);

/** The region the person picked as primary, if any. */
export function primaryRegion(regions: readonly Region[], a: ShapeAnswers): Region | undefined {
  return byId(regions, a["primary"]);
}

/** The second region: the pair when "pair" is chosen, else the region picked. */
export function secondaryRegion(regions: readonly Region[], a: ShapeAnswers): Region | undefined {
  const p = primaryRegion(regions, a);
  const v = a["secondary"];
  if (v === PAIR) return p?.pair ? byId(regions, p.pair) : undefined;
  return byId(regions, v);
}

/** Options for one question, given the earlier answers. Regions come from regions.json, never from the tree. */
export function optionsFor(q: ShapeQuestion, regions: readonly Region[], a: ShapeAnswers): ShapeOption[] {
  const kind = q.kind ?? "choice";
  if (kind === "region") return regions.map((r) => ({ id: r.id, label: r.name }));
  if (kind === "second-region") {
    const p = primaryRegion(regions, a);
    const out: ShapeOption[] = [];
    if (p?.pair) {
      const pr = byId(regions, p.pair);
      if (pr) out.push({ id: PAIR, label: `${pr.name} (the region pair)` });
    }
    for (const r of regions) if (r.id !== p?.id) out.push({ id: r.id, label: r.name });
    return out;
  }
  const opts = q.options ?? [];
  if (q.id === "zones") {
    const p = primaryRegion(regions, a);
    // Only offer as many zones as the primary region has on the availability zones page.
    if (p && p.zones >= 2) return opts.filter((o) => Number(o.id) <= Math.min(3, p.zones));
  }
  return opts;
}

/** The answer in force for a question: the person's pick (while it is still an option), the pair for a second region, else nothing. */
export function answerFor(q: ShapeQuestion, regions: readonly Region[], a: ShapeAnswers): string | undefined {
  const picked = a[q.id];
  const opts = optionsFor(q, regions, a);
  if (picked !== undefined && opts.some((o) => o.id === picked)) return picked;
  if (q.kind === "second-region") {
    const p = primaryRegion(regions, a);
    return p?.pair ? PAIR : undefined;
  }
  return undefined; // no pick: the drawing keeps its default layout
}

export interface Resolved { params: DrawParams; notes: string[] }

export function resolveShape(shape: Shape, regions: readonly Region[], a: ShapeAnswers): Resolved {
  const params: DrawParams = {};
  const notes: string[] = [];
  const effective: ShapeAnswers = { ...a };
  for (const q of shape.questions) {
    const v = answerFor(q, regions, effective);
    if (v !== undefined) effective[q.id] = v;
  }
  const p = primaryRegion(regions, effective);
  if (p) params.primaryName = p.name;
  const s = secondaryRegion(regions, effective);
  if (s) params.secondaryName = s.name;
  if (p && shape.questions.some((q) => q.id === "secondary") && effective["secondary"] !== PAIR && !p.pair) {
    notes.push(`${p.name} has no region pair on the region pairs page, so the second region is your choice.`);
  }
  if (shape.questions.some((q) => q.id === "zones")) {
    if (p && p.zones < 2) notes.push(`${p.name} is not listed with availability zones on the availability zones page, so the zone layout below is the default one, not ${p.name}.`);
    else if (effective["zones"] !== undefined) params.zones = Number(effective["zones"]);
  }
  if (effective["instances"] !== undefined) params.instances = Number(effective["instances"]);
  if (effective["link"] === "internet" || effective["link"] === "private-endpoint") params.link = effective["link"];
  if (effective["seeding"] === "yes" || effective["seeding"] === "no") params.seeding = effective["seeding"];
  if (effective["data"] === "under" || effective["data"] === "over") params.data = effective["data"];
  if (params.data === "over") notes.push("One backup server protects up to 75 TB, so the drawing adds a second backup server.");
  return { params, notes };
}
