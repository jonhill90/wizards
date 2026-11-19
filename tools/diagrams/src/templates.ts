import { Canvas, STYLE, wrap } from "./canvas.js";
import type { IconSource } from "./icons.js";
import type { BackupSpec, Item, OverviewSpec, RegionSpec, Spec, ZoneSpec } from "./model.js";

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
      h = Math.max(h, c.item(x + step * k + step / 2, y, it, grey, Math.max(10, Math.floor(step / 6.2))));
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

function overview(s: OverviewSpec, icons: IconSource): Canvas {
  const c = new Canvas(W, 250, icons);
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

function zone(s: ZoneSpec, icons: IconSource): Canvas {
  const n = s.zones ?? 3;
  const colGap = 16;
  const colW = (600 - colGap * (n - 1)) / n;
  const itemsH = rowsHeight(icons, s.items.map((i) => i), colW - 8);
  const colTop = 92;
  const colH = 26 + itemsH + 16;
  const bottomLink = s.link ? 40 : 14;
  const regionH = colTop - 52 + colH + bottomLink + 8;
  const badgeH = s.badge ? 34 : 0;
  const c = new Canvas(W, 52 + regionH + badgeH + 20, icons);
  c.box(30, 52, 640, regionH, { rx: 0 });
  c.text(50, 70, "Region", { size: STYLE.title, bold: true, anchor: "start" });
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

function region(s: RegionSpec, icons: IconSource): Canvas {
  const kind = s.secondaryKind ?? "standby";
  const boxW = 270;
  const itemsH = Math.max(rowsHeight(icons, s.primary, boxW - 16), rowsHeight(icons, s.secondary, boxW - 16));
  const boxH = 30 + itemsH + 14;
  const top = s.router ? 130 : 56;
  const c = new Canvas(W, top + boxH + 24, icons);
  const grey = kind === "standby" || kind === "restore";
  const lx = 30;
  const rx = 400;
  c.box(lx, top, boxW, boxH);
  c.text(lx + boxW / 2, top + 18, s.primaryTitle ?? "Primary region", { size: STYLE.title });
  rows(c, s.primary, lx + 8, boxW - 16, top + 30, false);
  c.box(rx, top, boxW, boxH, { stroke: kind === "restore" ? STYLE.grey : STYLE.ink, dash: kind === "restore" ? "4.5,4.5" : undefined });
  c.text(rx + boxW / 2, top + 18, s.secondaryTitle ?? (kind === "live" ? "Second region" : "Secondary region"), { size: STYLE.title, fill: grey ? STYLE.grey : STYLE.ink });
  rows(c, s.secondary, rx + 8, boxW - 16, top + 30, grey);
  // arrow between the regions
  const my = top + boxH / 2 + 12;
  const dashed = kind === "restore" ? "4.5,4.5" : undefined;
  if (s.link) {
    c.line([[lx + boxW + 2, my], [rx - 2, my]], { start: kind === "live", dash: dashed });
    const lines = wrap(s.link, 16);
    c.text(350, my - 6 - (lines.length - 1) * 12, lines.join("\n"), { size: STYLE.small });
  }
  if (s.router) {
    const rc = lx + boxW / 2;
    const qc = rx + boxW / 2;
    const dash = kind === "live" ? undefined : "4.5,4.5";
    if (s.router.icon) {
      c.item(350, 12, s.router, false, 20);
      c.line([[334, 28], [rc, 28], [rc, top - 2]]);
      c.line([[366, 28], [qc, 28], [qc, top - 2]], kind === "live" ? {} : { red: true, dash });
    } else {
      const bw = Math.max(110, s.router.label.length * 6.4 + 20);
      c.box(350 - bw / 2, 14, bw, 28, { fill: STYLE.panelFill, stroke: STYLE.panelStroke, sw: 1, rx: 3 });
      c.text(350, 32, s.router.label, { size: STYLE.label });
      c.line([[350 - bw / 2, 28], [rc, 28], [rc, top - 2]]);
      c.line([[350 + bw / 2, 28], [qc, 28], [qc, top - 2]], kind === "live" ? {} : { red: true, dash });
    }
    if (kind !== "live") c.text(qc - 40, 20, s.failoverLabel ?? "Failover", { size: STYLE.label, fill: STYLE.red });
  }
  return c;
}

function backup(s: BackupSpec, icons: IconSource): Canvas {
  const srcW = 250;
  const vaultW = s.guard ? 290 : 250;
  const vaultX = 700 - 30 - vaultW;
  const srcH = rowsHeight(icons, s.source, srcW - 16);
  const feats = s.features ?? [];
  const vaultItems: Item[] = s.guard ? [s.vault, s.guard] : [s.vault];
  const vaultH = rowsHeight(icons, vaultItems, vaultW - 16);
  const innerH = Math.max(srcH, vaultH + feats.length * 30 + (feats.length ? 10 : 0));
  const boxH = innerH + 30;
  const c = new Canvas(W, 40 + boxH + 20, icons);
  const top = 40;
  c.box(30, top, srcW, boxH);
  c.text(30 + srcW / 2, top + 20, "Protected data", { size: STYLE.title });
  rows(c, s.source, 38, srcW - 16, top + 34, false);
  c.box(vaultX, top, vaultW, boxH);
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
  c.text(gapMid, my - 6 - (bl.length - 1) * 12, bl.join("\n"), { size: STYLE.small });
  if (!s.noRestore) {
    const ry = my + 28;
    c.line([[gapR, ry], [gapL, ry]], { dash: "4.5,4.5" });
    c.text(gapMid, ry + 14, wrap(s.restoreLabel ?? "Restore", chars).join("\n"), { size: STYLE.small });
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

export function draw(spec: Spec, icons: IconSource): Canvas {
  switch (spec.template) {
    case "overview": return overview(spec, icons);
    case "zone": return zone(spec, icons);
    case "region": return region(spec, icons);
    case "backup": return backup(spec, icons);
    default: {
      const never: never = spec;
      throw new Error(`unknown template ${JSON.stringify(never)}`);
    }
  }
}
