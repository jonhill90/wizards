import { Canvas, STYLE, wrap } from "./canvas.js";
import type { IconSource } from "./iconparse.js";
import { resolveSpec } from "./resolve.js";
import type { BackupSpec, Item, OverviewSpec, RegionSpec, SceneNode, SceneSpec, Spec, ZoneSpec } from "./model.js";

const W = 700;
const PER_ROW = 3;

/** Lay items out in rows of up to three inside a box; returns the height used. */
function rows(c: Canvas, items: Item[], x: number, w: number, top: number, grey: boolean): number {
  let y = top;
  for (let i = 0; i < items.length; i += PER_ROW) {
    const row = items.slice(i, i + PER_ROW);
    const step = w / row.length;
    let h = 0;
    row.forEach((it, k) => {
      h = Math.max(h, c.item(x + step * k + step / 2, y, it, grey, Math.max(10, Math.floor(step / 5.6))));
    });
    y += h + 8;
  }
  return y - top - 8;
}

/** Height of rows() without drawing, from a scratch canvas. */
function rowsHeight(icons: IconSource, items: Item[], w: number): number {
  const scratch = new Canvas(W, 10, icons);
  return rows(scratch, items, 0, w, 0, false);
}

function overview(s: OverviewSpec, icons: IconSource, animate: boolean): Canvas {
  const c = new Canvas(W, 250, icons, animate);
  const chips = s.asks ?? ["Zone failure", "Region failure", "Data loss"];
  c.box(30, 30, 260, 190, { fill: STYLE.panelFill, stroke: STYLE.panelStroke, sw: 1 });
  const size = 64;
  if (s.service.icon) c.icon(s.service.icon, 160 - size / 2, 60, size);
  c.block(160, s.service.icon ? 60 + size + 8 : 120, s.service.label, 24, { size: STYLE.title, bold: true });
  c.text(480, 62, "This wizard asks which failure", { size: STYLE.title, bold: true });
  c.text(480, 78, "you must survive:", { size: STYLE.title, bold: true });
  chips.forEach((t, i) => {
    const y = 98 + i * 44;
    c.box(380, y, 200, 32, { rx: 3 });
    c.text(480, y + 20, t, { size: STYLE.label });
    c.line([[290, 125], [330, 125], [330, y + 16], [380, y + 16]], { end: true });
  });
  return c;
}

function zone(s: ZoneSpec, icons: IconSource, animate: boolean): Canvas {
  const n = s.zones ?? 3;
  const colGap = 16;
  const colW = (600 - colGap * (n - 1)) / n;
  const itemsH = rowsHeight(icons, s.items.map((i) => i), colW - 8);
  const colTop = 92;
  const colH = 26 + itemsH + 16;
  const bottomLink = s.link ? 40 : 14;
  const regionH = colTop - 52 + colH + bottomLink + 8;
  const badgeH = s.badge ? 34 : 0;
  const c = new Canvas(W, 52 + regionH + badgeH + 20, icons, animate);
  c.box(30, 52, 640, regionH, { rx: 0 });
  c.text(50, 70, s.regionName ?? "Region", { size: STYLE.title, bold: true, anchor: "start" });
  c.boundary(36, 76, 628, regionH - 30 + (s.link ? 0 : 0));
  const centres: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = 50 + k * (colW + colGap);
    c.box(x, colTop, colW, colH, { fill: STYLE.subnetFill, stroke: STYLE.subnetStroke });
    c.text(x + colW / 2, colTop + 16, `Availability zone ${k + 1}`, { size: STYLE.small, bold: true });
    rows(c, s.items, x + 4, colW - 8, colTop + 26, false);
    centres.push(x + colW / 2);
  }
  if (s.link) {
    const y = colTop + colH + 16;
    c.line([[centres[0] ?? 0, y], [centres[n - 1] ?? 0, y]], { start: true });
    c.box(350 - 4 * s.link.length - 6, y - 8, 8 * s.link.length + 12, 16, { fill: "#ffffff", stroke: "#ffffff", sw: 0 });
    c.text(350, y + 4, s.link, { size: STYLE.small });
  }
  if (s.badge) {
    const y = 52 + regionH + 10;
    c.number(48, y + 12, 1);
    c.text(64, y + 16, s.badge, { size: STYLE.label, anchor: "start" });
  }
  return c;
}

function region(s: RegionSpec, icons: IconSource, animate: boolean): Canvas {
  const kind = s.secondaryKind ?? "standby";
  const boxW = 270;
  const itemsH = Math.max(rowsHeight(icons, s.primary, boxW - 16), rowsHeight(icons, s.secondary, boxW - 16));
  const boxH = 30 + itemsH + 14;
  const top = s.router ? 130 : 56;
  const c = new Canvas(W, top + boxH + 24, icons, animate);
  const grey = kind === "standby" || kind === "restore";
  const lx = 30;
  const rx = 400;
  c.box(lx, top, boxW, boxH, { fill: STYLE.subnetFill, stroke: STYLE.subnetStroke });
  c.text(lx + boxW / 2, top + 18, s.primaryTitle ?? "Primary region", { size: STYLE.title });
  rows(c, s.primary, lx + 8, boxW - 16, top + 30, false);
  if (grey) c.box(rx, top, boxW, boxH, { fill: STYLE.panelFill, stroke: kind === "restore" ? STYLE.grey : STYLE.panelStroke, dash: kind === "restore" ? "4.5,4.5" : undefined });
  else c.box(rx, top, boxW, boxH, { fill: STYLE.subnetFill, stroke: STYLE.subnetStroke });
  c.text(rx + boxW / 2, top + 18, s.secondaryTitle ?? (kind === "live" ? "Second region" : "Secondary region"), { size: STYLE.title, fill: grey ? STYLE.grey : STYLE.ink });
  rows(c, s.secondary, rx + 8, boxW - 16, top + 30, grey);
  // arrow between the regions
  const my = top + boxH / 2 + 12;
  const dashed = kind === "restore" ? "4.5,4.5" : undefined;
  if (s.link) {
    c.line([[lx + boxW + 2, my], [rx - 2, my]], { start: kind === "live", dash: dashed });
    const lines = wrap(s.link, 16);
    c.text(350, my - 14 - (lines.length - 1) * 12, lines.join("\n"), { size: STYLE.small });
    c.number(350, my, 1);
  }
  if (s.router) {
    const rc = lx + boxW / 2;
    const qc = rx + boxW / 2;
    const dash = kind === "live" ? undefined : "4.5,4.5";
    if (s.router.icon) {
      c.item(350, 12, s.router, false, 20);
      c.line([[334, 28], [rc, 28], [rc, top - 2]]);
      c.line([[366, 28], [qc, 28], [qc, top - 2]], kind === "live" ? {} : { red: true, dash });
      c.number((334 + rc) / 2, 28, 1);
      c.number((366 + qc) / 2, 28, 2);
    } else {
      const bw = Math.max(110, s.router.label.length * 6.4 + 20);
      c.box(350 - bw / 2, 14, bw, 28, { fill: STYLE.panelFill, stroke: STYLE.panelStroke, sw: 1, rx: 3 });
      c.text(350, 32, s.router.label, { size: STYLE.label });
      c.line([[350 - bw / 2, 28], [rc, 28], [rc, top - 2]]);
      c.line([[350 + bw / 2, 28], [qc, 28], [qc, top - 2]], kind === "live" ? {} : { red: true, dash });
      c.number((350 - bw / 2 + rc) / 2, 28, 1);
      c.number((350 + bw / 2 + qc) / 2, 28, 2);
    }
    if (kind !== "live") c.text(qc + 8, 78, s.failoverLabel ?? "Failover", { size: STYLE.label, fill: STYLE.red, anchor: "start" });
  }
  return c;
}

function backup(s: BackupSpec, icons: IconSource, animate: boolean): Canvas {
  const srcW = 250;
  const vaultW = s.guard ? 290 : 250;
  const vaultX = 700 - 30 - vaultW;
  const srcH = rowsHeight(icons, s.source, srcW - 16);
  const feats = s.features ?? [];
  const vaultItems: Item[] = s.guard ? [s.vault, s.guard] : [s.vault];
  const vaultH = rowsHeight(icons, vaultItems, vaultW - 16);
  const innerH = Math.max(srcH, vaultH + feats.length * 30 + (feats.length ? 10 : 0));
  const boxH = Math.max(innerH + 30, 120);
  const c = new Canvas(W, 40 + boxH + 20, icons, animate);
  const top = 40;
  c.box(30, top, srcW, boxH, { fill: STYLE.subnetFill, stroke: STYLE.subnetStroke });
  c.text(30 + srcW / 2, top + 20, "Protected data", { size: STYLE.title });
  rows(c, s.source, 38, srcW - 16, top + 34, false);
  c.box(vaultX, top, vaultW, boxH, { fill: STYLE.panelFill, stroke: STYLE.panelStroke });
  c.text(vaultX + vaultW / 2, top + 20, "Backup", { size: STYLE.title });
  rows(c, vaultItems, vaultX + 8, vaultW - 16, top + 34, false);
  feats.forEach((f, i) => {
    const y = top + 34 + vaultH + 12 + i * 30;
    c.box(vaultX + 20, y, vaultW - 40, 22, { fill: STYLE.panelFill, stroke: STYLE.panelStroke, sw: 1, rx: 3 });
    c.text(vaultX + vaultW / 2, y + 15, f, { size: STYLE.small });
  });
  const gapL = 30 + srcW + 2;
  const gapR = vaultX - 2;
  const gapMid = (gapL + gapR) / 2;
  const my = top + boxH / 2 - 8;
  c.line([[gapL, my], [gapR, my]]);
  const chars = Math.floor((gapR - gapL - 6) / 5.6);
  const bl = wrap(s.backupLabel ?? "Backup", chars);
  c.text(gapMid, my - 14 - (bl.length - 1) * 12, bl.join("\n"), { size: STYLE.small });
  c.number(gapMid, my, 1);
  if (!s.noRestore) {
    const ry = my + 28;
    c.line([[gapR, ry], [gapL, ry]], { dash: "4.5,4.5" });
    c.number(gapMid, ry, 2);
    c.text(gapMid, ry + 22, wrap(s.restoreLabel ?? "Restore", chars).join("\n"), { size: STYLE.small });
  }
  if (s.guard) {
    // dashed approval arrow from the guard (right) to the vault (left)
    const step = (vaultW - 16) / 2;
    const vx = vaultX + 8 + step / 2;
    const gx = vaultX + 8 + step + step / 2;
    c.line([[gx - 22, top + 34 + 16], [vx + 22, top + 34 + 16]], { dash: "4.5,4.5" });
    if (s.guardLabel) c.text((vx + gx) / 2, top + 34 + 10, s.guardLabel, { size: 9 });
  }
  return c;
}

/** Edge point on a node's outline, towards another point (axis-aligned: the longer of dx and dy wins). */
function edgePoint(n: SceneNode, toward: [number, number]): [number, number] {
  const hw = n.box ? n.box.w / 2 : 19;
  const hh = n.box ? n.box.h / 2 : 19;
  const dx = toward[0] - n.x;
  const dy = toward[1] - n.y;
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) return [n.x + Math.sign(dx) * (hw + 2), n.y];
  return [n.x, n.y + Math.sign(dy || 1) * (hh + 2)];
}

function scene(s: SceneSpec, icons: IconSource, animate: boolean): Canvas {
  const notes = s.notes ?? [];
  const noteChars = Math.floor((s.width - 90) / 5.4);
  const noteLines = notes.map((t) => wrap(t, noteChars));
  const notesH = notes.length ? 16 + noteLines.reduce((a, l) => a + l.length * 12 + 8, 0) : 0;
  const c = new Canvas(s.width, s.height + notesH, icons, animate);
  for (const g of s.groups) {
    const kind = g.kind ?? "outline";
    if (kind === "vnet") c.boundary(g.x, g.y, g.w, g.h);
    else if (kind === "blue") c.box(g.x, g.y, g.w, g.h, { fill: STYLE.subnetFill, stroke: STYLE.subnetStroke });
    else if (kind === "grey") c.box(g.x, g.y, g.w, g.h, { fill: STYLE.panelFill, stroke: STYLE.panelStroke });
    else if (kind === "dashed") c.box(g.x, g.y, g.w, g.h, { fill: "none", dash: "4.5,4.5" });
    else c.box(g.x, g.y, g.w, g.h, { rx: 0 });
    if (g.title) {
      const mid = g.titleAnchor === "middle";
      c.text(mid ? g.x + g.w / 2 : g.x + 8, g.y + 14, g.title, { size: g.titleSize ?? STYLE.label, bold: true, anchor: mid ? "middle" : "start" });
    }
  }
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const need = (id: string): SceneNode => {
    const n = byId.get(id);
    if (!n) throw new Error(`scene edge names unknown node "${id}"`);
    return n;
  };
  for (const e of s.edges) {
    let pts: [number, number][];
    if (e.points) pts = e.points;
    else {
      const a = need(e.from ?? "");
      const b = need(e.to ?? "");
      const via = e.via ?? [];
      const first: [number, number] = via[0] ?? [b.x, b.y];
      const last: [number, number] = via[via.length - 1] ?? [a.x, a.y];
      pts = [edgePoint(a, first), ...via, edgePoint(b, last)];
    }
    c.line(pts, { start: e.both, dash: e.dashed ? "4.5,4.5" : undefined, red: e.red });
  }
  for (const n of s.nodes) {
    if (n.box) {
      c.box(n.x - n.box.w / 2, n.y - n.box.h / 2, n.box.w, n.box.h, { fill: n.grey ? STYLE.panelFill : "#ffffff", stroke: n.grey ? STYLE.panelStroke : STYLE.ink });
      const lines = wrap(n.label, Math.floor((n.box.w - 8) / 5.4));
      c.text(n.x, n.y - ((lines.length - 1) * 12) / 2 + 3.5, lines.join("\n"), { size: STYLE.label, fill: n.grey ? STYLE.grey : STYLE.ink });
    } else {
      c.item(n.x, n.y - 16, { icon: n.icon, label: n.label }, n.grey ?? false, n.maxChars ?? 16);
    }
  }
  for (const e of s.edges) {
    if (e.label) {
      const at = e.labelAt ?? [0, 0];
      c.text(at[0], at[1], wrap(e.label, 22).join("\n"), { size: STYLE.small, anchor: e.labelAnchor ?? "middle" });
    }
    if (e.n !== undefined) {
      const at = e.nAt ?? e.points?.[0] ?? [0, 0];
      c.number(at[0], at[1], e.n);
    }
  }
  let y = s.height + 12;
  notes.forEach((t, i) => {
    c.number(40, y + 6, i + 1);
    const lines = noteLines[i] ?? [];
    c.text(58, y + 9.5, lines.join("\n"), { size: STYLE.label, anchor: "start" });
    y += lines.length * 12 + 8;
  });
  return c;
}

export function draw(spec: Spec, icons: IconSource, animate = false): Canvas {
  switch (spec.template) {
    case "overview": return overview(spec, icons, animate);
    case "zone": return zone(spec, icons, animate);
    case "region": return region(spec, icons, animate);
    case "backup": return backup(spec, icons, animate);
    case "scene": return scene(spec, icons, animate);
    case "scene-fn": return draw(resolveSpec(spec), icons, animate);
    default: {
      const never: never = spec;
      throw new Error(`unknown template ${JSON.stringify(never)}`);
    }
  }
}
