// dist/src/iconparse.js
function parseIcon(svg) {
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open)
    throw new Error("icon has no <svg> element");
  const tag = open[0];
  const inner = svg.slice(open.index + tag.length, svg.lastIndexOf("</svg>"));
  const vb = /viewBox="([^"]+)"/.exec(tag);
  const wA = /\swidth="([\d.]+)/.exec(tag);
  const hA = /\sheight="([\d.]+)/.exec(tag);
  let viewBox;
  let w;
  let h;
  if (vb?.[1]) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    viewBox = vb[1];
    w = p[2] ?? 0;
    h = p[3] ?? 0;
  } else if (wA?.[1] && hA?.[1]) {
    w = Number(wA[1]);
    h = Number(hA[1]);
    viewBox = `0 0 ${w} ${h}`;
  } else
    throw new Error("icon has neither viewBox nor width and height");
  const body = inner.replace(/<title>[\s\S]*?<\/title>/g, "");
  return { w, h, viewBox, body };
}

// dist/src/canvas.js
var STYLE = {
  font: "'Segoe UI','Segoe UI_MSFontService',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif",
  ink: "#000000",
  grey: "#737373",
  label: 10,
  small: 10,
  title: 12,
  boxStroke: 0.75,
  arrowStroke: 1.5,
  numberFill: "#107c10",
  numberRadius: 8.1,
  boundary: "#4472c4",
  panelFill: "#f2f2f2",
  panelStroke: "#bfbfbf",
  subnetFill: "#e6f2fb",
  subnetStroke: "#0078d4",
  red: "#ff0000",
  iconSize: 32
};
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function wrap(text, maxChars) {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > maxChars) {
      out.push(line);
      line = word;
    } else
      line = line ? line + " " + word : word;
  }
  if (line)
    out.push(line);
  return out;
}
var Canvas = class {
  width;
  height;
  icons;
  animate;
  defs = [];
  parts = [];
  iconCount = 0;
  usedFilter = false;
  step = 0;
  constructor(width, height, icons, animate = false) {
    this.width = width;
    this.height = height;
    this.icons = icons;
    this.animate = animate;
    this.defs.push(`<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z" fill="${STYLE.ink}"/></marker>`, `<marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z" fill="${STYLE.red}"/></marker>`);
  }
  /** Entrance-animation hook: a class and a delay that grows with drawing order. Empty when not animated. */
  fx(kind) {
    if (!this.animate)
      return "";
    const d = Math.min(this.step++ * 40, 1400);
    return ` class="mv-${kind}" style="--d:${d}ms"`;
  }
  text(x, y, s, o = {}) {
    const size = o.size ?? STYLE.label;
    const lines = s.split("\n");
    const tsp = lines.map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : (size * 1.2).toFixed(1)}">${esc(ln)}</tspan>`).join("");
    this.parts.push(`<text${this.fx("fade")} x="${x}" y="${y}" font-size="${size}" text-anchor="${o.anchor ?? "middle"}"${o.bold ? ' font-weight="600"' : ""} fill="${o.fill ?? STYLE.ink}">${tsp}</text>`);
  }
  /** Wrapped text block; returns its height. */
  block(cx, top, s, maxChars, o = {}) {
    const size = o.size ?? STYLE.label;
    const lines = wrap(s, maxChars);
    this.text(cx, top + size, lines.join("\n"), o);
    return lines.length * size * 1.2;
  }
  box(x, y, w, h, o = {}) {
    this.parts.push(`<rect${this.fx("box")} x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 0}" fill="${o.fill ?? "#ffffff"}" stroke="${o.stroke ?? STYLE.ink}" stroke-width="${o.sw ?? STYLE.boxStroke}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`);
  }
  /** Blue dashed rounded boundary: a network or a scope. */
  boundary(x, y, w, h) {
    this.box(x, y, w, h, { fill: "none", stroke: STYLE.boundary, dash: "2.25,2.25", rx: 6 });
  }
  line(pts, o = {}) {
    const end = o.end ?? true;
    const marker = end ? ` marker-end="url(#${o.red ? "arrow-red" : "arrow"})"` : "";
    const start = o.start ? ' marker-start="url(#arrow)"' : "";
    const color = o.red ? STYLE.red : o.color ?? STYLE.ink;
    this.parts.push(`<polyline${this.fx(o.dash ? "fade" : "line")}${this.animate && !o.dash ? ' pathLength="1"' : ""} points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="${STYLE.arrowStroke}" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${marker}${start}/>`);
  }
  /** Green numbered circle. */
  number(cx, cy, n) {
    this.parts.push(`<circle${this.fx("fade")} cx="${cx}" cy="${cy}" r="${STYLE.numberRadius}" fill="${STYLE.numberFill}"/>`);
    this.text(cx, cy + 3.2, String(n), { size: 9, bold: true, fill: "#ffffff" });
  }
  /** An official icon, scaled to `size` and centred in a square at (x, y). Grey draws the recovery side. */
  icon(name, x, y, size = STYLE.iconSize, grey = false) {
    const ic = this.icons(name);
    const n = ++this.iconCount;
    const prefix = `ic${n}-`;
    let body = ic.body;
    const ids = /* @__PURE__ */ new Set();
    for (const m of body.matchAll(/\sid="([^"]+)"/g))
      if (m[1])
        ids.add(m[1]);
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
    this.parts.push(`<g${this.fx("fade")} transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${s.toFixed(4)})"${grey ? ' filter="url(#grey)" opacity="0.8"' : ""}>${body}</g>`);
  }
  /** Icon with its name under it, centred on cx. Returns the height used. */
  item(cx, top, it, grey = false, maxChars = 16) {
    const size = STYLE.iconSize;
    const fill = grey ? STYLE.grey : STYLE.ink;
    if (it.icon) {
      this.icon(it.icon, cx - size / 2, top, size, grey);
    } else {
      const h0 = this.block(cx, top + size / 2 - 2, it.label, maxChars + 6, { size: STYLE.label, fill });
      return Math.max(size + 5, h0 + size / 2);
    }
    const h = this.block(cx, top + size + 3, it.label, maxChars, { size: STYLE.label, fill });
    return size + 3 + h + 2;
  }
  svg(title, alt) {
    const css = this.animate ? `<style>.mv-box,.mv-fade{opacity:0;animation:mv-in .45s ease-out var(--d) forwards}.mv-line{stroke-dasharray:1;stroke-dashoffset:1;animation:mv-draw .6s ease-out var(--d) forwards}@keyframes mv-in{to{opacity:1}}@keyframes mv-draw{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.mv-box,.mv-fade,.mv-line{animation:none;opacity:1;stroke-dashoffset:0}}</style>
` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}" font-family="${esc(STYLE.font)}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title><desc id="d">${esc(alt)}</desc>
${css}<defs>${this.defs.join("")}</defs>
<rect width="100%" height="100%" fill="#ffffff"/>
${this.parts.join("\n")}
</svg>
`;
  }
};

// dist/src/templates.js
var W = 700;
var PER_ROW = 3;
function rows(c, items, x, w, top, grey) {
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
function rowsHeight(icons, items, w) {
  const scratch = new Canvas(W, 10, icons);
  return rows(scratch, items, 0, w, 0, false);
}
function overview(s, icons, animate) {
  const c = new Canvas(W, 250, icons, animate);
  const chips = s.asks ?? ["Zone failure", "Region failure", "Data loss"];
  c.box(30, 30, 260, 190, { fill: STYLE.panelFill, stroke: STYLE.panelStroke, sw: 1 });
  const size = 64;
  if (s.service.icon)
    c.icon(s.service.icon, 160 - size / 2, 60, size);
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
function zone(s, icons, animate) {
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
  c.text(50, 70, "Region", { size: STYLE.title, bold: true, anchor: "start" });
  c.boundary(36, 76, 628, regionH - 30 + (s.link ? 0 : 0));
  const centres = [];
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
function region(s, icons, animate) {
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
  if (grey)
    c.box(rx, top, boxW, boxH, { fill: STYLE.panelFill, stroke: kind === "restore" ? STYLE.grey : STYLE.panelStroke, dash: kind === "restore" ? "4.5,4.5" : void 0 });
  else
    c.box(rx, top, boxW, boxH, { fill: STYLE.subnetFill, stroke: STYLE.subnetStroke });
  c.text(rx + boxW / 2, top + 18, s.secondaryTitle ?? (kind === "live" ? "Second region" : "Secondary region"), { size: STYLE.title, fill: grey ? STYLE.grey : STYLE.ink });
  rows(c, s.secondary, rx + 8, boxW - 16, top + 30, grey);
  const my = top + boxH / 2 + 12;
  const dashed = kind === "restore" ? "4.5,4.5" : void 0;
  if (s.link) {
    c.line([[lx + boxW + 2, my], [rx - 2, my]], { start: kind === "live", dash: dashed });
    const lines = wrap(s.link, 16);
    c.text(350, my - 14 - (lines.length - 1) * 12, lines.join("\n"), { size: STYLE.small });
    c.number(350, my, 1);
  }
  if (s.router) {
    const rc = lx + boxW / 2;
    const qc = rx + boxW / 2;
    const dash = kind === "live" ? void 0 : "4.5,4.5";
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
    if (kind !== "live")
      c.text(qc + 8, 78, s.failoverLabel ?? "Failover", { size: STYLE.label, fill: STYLE.red, anchor: "start" });
  }
  return c;
}
function backup(s, icons, animate) {
  const srcW = 250;
  const vaultW = s.guard ? 290 : 250;
  const vaultX = 700 - 30 - vaultW;
  const srcH = rowsHeight(icons, s.source, srcW - 16);
  const feats = s.features ?? [];
  const vaultItems = s.guard ? [s.vault, s.guard] : [s.vault];
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
    const step = (vaultW - 16) / 2;
    const vx = vaultX + 8 + step / 2;
    const gx = vaultX + 8 + step + step / 2;
    c.line([[gx - 22, top + 34 + 16], [vx + 22, top + 34 + 16]], { dash: "4.5,4.5" });
    if (s.guardLabel)
      c.text((vx + gx) / 2, top + 34 + 10, s.guardLabel, { size: 9 });
  }
  return c;
}
function draw(spec, icons, animate = false) {
  switch (spec.template) {
    case "overview":
      return overview(spec, icons, animate);
    case "zone":
      return zone(spec, icons, animate);
    case "region":
      return region(spec, icons, animate);
    case "backup":
      return backup(spec, icons, animate);
    default: {
      const never = spec;
      throw new Error(`unknown template ${JSON.stringify(never)}`);
    }
  }
}

// dist/src/render.js
function legend(s) {
  switch (s.template) {
    case "overview":
      return "The service icon is on a grey panel on the left. Black arrows lead from it to one box for each question the wizard asks.";
    case "zone": {
      const n = s.zones ?? 3;
      return `A solid black box labelled Region holds a dashed blue boundary. Inside are ${n} blue panels, one for each availability zone, each repeating the same items.${s.link ? ` A black arrow below the panels is labelled ${s.link}.` : ""}${s.badge ? " A green numbered circle marks the note under the box." : ""}`;
    }
    case "region": {
      const kind = s.secondaryKind ?? "standby";
      const parts = ["Two boxes sit side by side, the primary region on the left and the second region on the right."];
      if (kind === "standby" || kind === "restore")
        parts.push("The right box and its items are drawn in grey because they are not in use until needed.");
      if (s.link)
        parts.push(`A black arrow between them is labelled ${s.link}${kind === "live" ? ", with a head at each end" : ""}, and carries a green numbered circle.`);
      if (s.router)
        parts.push(kind === "live" ? "A router box above sends a black arrow to each region." : `A router box above sends a black arrow to the primary region and a red dashed arrow, labelled ${s.failoverLabel ?? "Failover"}, to the secondary region.`);
      return parts.join(" ");
    }
    case "backup":
      return `A box labelled Protected data is on the left and a box labelled Backup is on the right. A solid black arrow labelled ${s.backupLabel ?? "Backup"} points right, marked with a green circle numbered 1.${s.noRestore ? "" : ` A dashed black arrow labelled ${s.restoreLabel ?? "Restore"} points back left, marked 2.`}${s.features?.length ? " Grey bars inside the right box give the features." : ""}`;
    default: {
      const never = s;
      throw new Error(`unknown template ${JSON.stringify(never)}`);
    }
  }
}
function renderDiagram(entry, icons, opts = {}) {
  return draw(entry.spec, icons, opts.animate ?? false).svg(entry.title, `${entry.alt} ${legend(entry.spec)}`);
}

// dist/src/web.js
function createRenderer(iconSvgs) {
  const cache = /* @__PURE__ */ new Map();
  const icons = (name) => {
    const hit = cache.get(name);
    if (hit)
      return hit;
    const svg = iconSvgs[name];
    if (svg === void 0)
      throw new Error(`unknown icon "${name}"`);
    const icon = parseIcon(svg);
    cache.set(name, icon);
    return icon;
  };
  const render2 = (spec, id, opts = {}) => {
    const entry = spec.diagrams[id];
    if (!entry)
      throw new Error(`unknown diagram "${id}"`);
    return renderDiagram(entry, icons, opts);
  };
  return {
    render: render2,
    forPath(spec, path, opts = {}) {
      for (let i = path.length - 1; i >= 0; i--) {
        const node = path[i];
        const id = spec.nodes[node];
        if (id !== void 0) {
          const e = spec.diagrams[id];
          return { id, title: e.title, alt: e.alt, svg: render2(spec, id, opts), fromNode: node };
        }
      }
      return null;
    }
  };
}

// <stdin>
var ICONS = { "aks": '<svg id="af6a2c42-bd48-4857-a479-aecf8b3de4f6" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="b70c9cf1-bab8-47e0-bbdb-ce1cd664d268" x1="2.94" y1="3.74" x2="8.67" y2="3.74" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient><linearGradient id="beb69953-bd96-4515-8843-ac12546af936" x1="9.13" y1="3.79" x2="14.85" y2="3.79" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient><linearGradient id="a39c76e8-547e-4eb4-bc25-d81c0f8cda62" x1="0.01" y1="9.12" x2="5.73" y2="9.12" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient><linearGradient id="f0a2a491-17dc-4bb8-bbfc-ee58a5cf47da" x1="6.18" y1="9.08" x2="11.9" y2="9.08" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient><linearGradient id="efc6a56d-8585-417d-931a-1dac2114ccd0" x1="12.35" y1="9.13" x2="18.08" y2="9.13" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient><linearGradient id="e399aa93-341f-4df2-9c02-603b82b484c2" x1="2.87" y1="14.56" x2="8.6" y2="14.56" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient><linearGradient id="a152bba0-ba2b-483a-b8c1-0ae7de355990" x1="9.05" y1="14.6" x2="14.78" y2="14.6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b77af4" /><stop offset="1" stop-color="#773adc" /></linearGradient></defs><title>Icon-compute-23</title><polygon points="5.8 1.22 2.94 1.75 2.94 5.65 5.8 6.26 8.67 5.11 8.67 2.2 5.8 1.22" fill="url(#b70c9cf1-bab8-47e0-bbdb-ce1cd664d268)" /><path d="M5.91,6.2,8.53,5.14A.2.2,0,0,0,8.65,5V2.36a.21.21,0,0,0-.13-.18l-2.65-.9H5.75l-2.6.48A.2.2,0,0,0,3,1.94V5.47a.19.19,0,0,0,.15.19l2.63.55A.32.32,0,0,0,5.91,6.2Z" fill="none" /><path d="M2.94,1.75v3.9l2.89.61v-5Zm1.22,3.6-.81-.16v-3l.81-.13Zm1.26.23-.93-.15V2l.93-.16Z" fill="#341a6e" /><polygon points="11.99 1.27 9.13 1.8 9.13 5.7 11.99 6.31 14.85 5.15 14.85 2.25 11.99 1.27" fill="url(#beb69953-bd96-4515-8843-ac12546af936)" /><path d="M9.13,1.8V5.7L12,6.31v-5Zm1.21,3.6-.81-.16v-3l.81-.13Zm1.26.23-.93-.15V2.05l.93-.17Z" fill="#341a6e" /><polygon points="2.87 6.6 0.01 7.13 0.01 11.03 2.87 11.64 5.74 10.49 5.74 7.58 2.87 6.6" fill="url(#a39c76e8-547e-4eb4-bc25-d81c0f8cda62)" /><path d="M0,7.13V11l2.89.61v-5Zm1.21,3.61-.81-.17v-3l.81-.14ZM2.48,11l-.93-.15V7.38l.93-.16Z" fill="#341a6e" /><polygon points="9.04 6.56 6.18 7.09 6.18 10.99 9.04 11.61 11.9 10.45 11.9 7.54 9.04 6.56" fill="url(#f0a2a491-17dc-4bb8-bbfc-ee58a5cf47da)" /><path d="M6.18,7.09V11l2.88.61v-5ZM7.39,10.7l-.81-.17v-3l.81-.14Zm1.26.22-.93-.15V7.34l.93-.16Z" fill="#341a6e" /><polygon points="15.21 6.61 12.35 7.14 12.35 11.04 15.21 11.65 18.08 10.5 18.08 7.59 15.21 6.61" fill="url(#efc6a56d-8585-417d-931a-1dac2114ccd0)" /><path d="M12.35,7.14V11l2.89.61v-5Zm1.22,3.61-.81-.17v-3l.81-.14Zm1.26.22-.93-.15V7.39l.93-.16Z" fill="#341a6e" /><polygon points="5.73 12.04 2.87 12.56 2.87 16.46 5.73 17.08 8.6 15.92 8.6 13.02 5.73 12.04" fill="url(#e399aa93-341f-4df2-9c02-603b82b484c2)" /><path d="M5.84,17,8.45,16a.18.18,0,0,0,.12-.18v-2.6A.2.2,0,0,0,8.44,13L5.8,12.1a.17.17,0,0,0-.12,0l-2.6.47a.19.19,0,0,0-.16.19v3.54a.19.19,0,0,0,.15.19L5.7,17A.23.23,0,0,0,5.84,17Z" fill="none" /><path d="M2.87,12.56v3.9l2.89.62V12Zm1.22,3.61L3.28,16V13l.81-.14Zm1.26.23-.93-.15V12.81l.93-.16Z" fill="#341a6e" /><polygon points="11.91 12.08 9.05 12.61 9.05 16.51 11.91 17.12 14.78 15.97 14.78 13.06 11.91 12.08" fill="url(#a152bba0-ba2b-483a-b8c1-0ae7de355990)" /><path d="M9.05,12.61v3.9l2.89.61v-5Zm1.22,3.61-.81-.17v-3l.81-.14Zm1.26.22-.93-.15V12.86l.93-.16Z" fill="#341a6e" /></svg>', "app-service": '<svg id="b70acf0a-34b4-4bdf-9024-7496043ff915" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><radialGradient id="e2cf8746-c9a8-4eee-86c2-4951983c6032" cx="13428.81" cy="3518.86" r="56.67" gradientTransform="translate(-2005.33 -518.83) scale(0.15)" gradientUnits="userSpaceOnUse"><stop offset="0.18" stop-color="#5ea0ef" /><stop offset="1" stop-color="#0078d4" /></radialGradient><linearGradient id="bdd213dd-d313-473c-8ff4-0133fd3a9033" x1="4.4" y1="11.48" x2="4.37" y2="7.53" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ccc" /><stop offset="1" stop-color="#fcfcfc" /></linearGradient><linearGradient id="afcc63c5-3649-4476-a742-bcb53a569f3c" x1="10.13" y1="15.45" x2="10.13" y2="11.9" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ccc" /><stop offset="1" stop-color="#fcfcfc" /></linearGradient><linearGradient id="bd873f0b-9954-4aa5-a3df-9f4c64e8729d" x1="14.18" y1="11.15" x2="14.18" y2="7.38" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ccc" /><stop offset="1" stop-color="#fcfcfc" /></linearGradient></defs><title>Icon-web-41</title><path id="ee75dd06-1aca-4f76-9d11-d05a284020ad" d="M14.21,15.72A8.5,8.5,0,0,1,3.79,2.28l.09-.06a8.5,8.5,0,0,1,10.33,13.5" fill="url(#e2cf8746-c9a8-4eee-86c2-4951983c6032)" /><path d="M6.69,7.23A13,13,0,0,1,15.6,3.65a8.47,8.47,0,0,0-1.49-1.44,14.34,14.34,0,0,0-4.69,1.1A12.54,12.54,0,0,0,5.34,6.13,2.76,2.76,0,0,1,6.69,7.23Z" fill="#fff" opacity="0.6" /><path d="M2.48,10.65a17.86,17.86,0,0,0-.83,2.62,7.82,7.82,0,0,0,.62.92c.18.23.35.44.55.65A17.94,17.94,0,0,1,3.9,11.37,2.76,2.76,0,0,1,2.48,10.65Z" fill="#fff" opacity="0.6" /><path d="M3.46,6.11a12,12,0,0,1-.69-2.94,8.15,8.15,0,0,0-1.1,1.45A12.69,12.69,0,0,0,2.24,7,2.69,2.69,0,0,1,3.46,6.11Z" fill="#f2f2f2" opacity="0.55" /><circle cx="4.38" cy="8.68" r="2.73" fill="url(#bdd213dd-d313-473c-8ff4-0133fd3a9033)" /><path d="M8.36,13.67A1.77,1.77,0,0,1,8.9,12.4a11.88,11.88,0,0,1-2.53-1.86,2.74,2.74,0,0,1-1.49.83,13.1,13.1,0,0,0,1.45,1.28A12.12,12.12,0,0,0,8.38,13.9,1.79,1.79,0,0,1,8.36,13.67Z" fill="#f2f2f2" opacity="0.55" /><path d="M14.66,13.88a12,12,0,0,1-2.76-.32.41.41,0,0,1,0,.11,1.75,1.75,0,0,1-.51,1.24,13.69,13.69,0,0,0,3.42.24A8.21,8.21,0,0,0,16,13.81,11.5,11.5,0,0,1,14.66,13.88Z" fill="#f2f2f2" opacity="0.55" /><circle cx="10.13" cy="13.67" r="1.78" fill="url(#afcc63c5-3649-4476-a742-bcb53a569f3c)" /><path d="M12.32,8.93a1.83,1.83,0,0,1,.61-1A25.5,25.5,0,0,1,8.47,3.79a16.91,16.91,0,0,1-2-2.92,7.64,7.64,0,0,0-1.09.42A18.14,18.14,0,0,0,7.53,4.47,26.44,26.44,0,0,0,12.32,8.93Z" fill="#f2f2f2" opacity="0.7" /><circle cx="14.18" cy="9.27" r="1.89" fill="url(#bd873f0b-9954-4aa5-a3df-9f4c64e8729d)" /><path d="M17.35,10.54,17,10.37l0,0-.3-.16-.06,0L16.38,10l-.07,0L16,9.8a1.76,1.76,0,0,1-.64.92c.12.08.25.15.38.22l.08.05.35.19,0,0,.86.45h0a8.63,8.63,0,0,0,.29-1.11Z" fill="#f2f2f2" opacity="0.55" /><circle cx="4.38" cy="8.68" r="2.73" fill="url(#bdd213dd-d313-473c-8ff4-0133fd3a9033)" /><circle cx="10.13" cy="13.67" r="1.78" fill="url(#afcc63c5-3649-4476-a742-bcb53a569f3c)" /></svg>', "backup-vault": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="e3a1929f-235e-4bf0-912e-e32ec472d9ca" x1="11.462" y1="10.536" x2="11.462" y2="1.423" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.149" stop-color="#1882db" /><stop offset="0.373" stop-color="#378fe4" /><stop offset="0.594" stop-color="#4c99ea" /><stop offset="0.806" stop-color="#5a9eee" /><stop offset="1" stop-color="#5ea0ef" /></linearGradient><linearGradient id="a58ac033-126d-45f0-b916-25fd6d357741" x1="6.484" y1="16.577" x2="6.484" y2="7.461" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#32bedd" /><stop offset="1" stop-color="#50e6ff" /></linearGradient></defs><g id="bca2981c-4161-411d-8c69-c657beb9ef65"><g><path d="M17.891,7.681a2.889,2.889,0,0,0-2.508-2.776,3.641,3.641,0,0,0-3.75-3.482,3.735,3.735,0,0,0-3.57,2.434,3.447,3.447,0,0,0-3.03,3.317,3.5,3.5,0,0,0,3.62,3.362c.108,0,.214,0,.319-.014h5.863a.611.611,0,0,0,.155-.023A2.923,2.923,0,0,0,17.891,7.681Z" fill="url(#e3a1929f-235e-4bf0-912e-e32ec472d9ca)" /><path d="M9.835,11l.018.414.41.055a2.371,2.371,0,0,1,2.058,2.3,2.409,2.409,0,0,1-2.384,2.379h-6.3A2.976,2.976,0,0,1,.56,13.262a2.919,2.919,0,0,1,2.571-2.8l.3-.037.1-.285A3.216,3.216,0,0,1,6.609,8.021h.022A3.116,3.116,0,0,1,9.835,11Z" fill="#fff" /><path d="M13.6,5.66,12.013,4.122c-.173-.173-.319-.112-.319.156v.691a.194.194,0,0,1-.016.075.183.183,0,0,1-.108.1.194.194,0,0,1-.075.012c-1.02,0-3.864.268-3.967,4.157a.2.2,0,0,0,.2.2H8.738a.2.2,0,0,0,.08-.017.208.208,0,0,0,.067-.047.222.222,0,0,0,.042-.071.2.2,0,0,0,.01-.081,2.386,2.386,0,0,1,2.592-2.878.2.2,0,0,1,.2.2v.639c0,.32.1.372.32.156L13.6,5.989a.193.193,0,0,0,.064-.072.2.2,0,0,0,0-.185A.2.2,0,0,0,13.6,5.66Z" fill="#fff" /><path d="M3.578,16.577A3.469,3.469,0,0,1,.11,13.213v-.031A3.417,3.417,0,0,1,3.116,9.9a3.713,3.713,0,0,1,3.545-2.44,3.608,3.608,0,0,1,3.712,3.452h0a2.865,2.865,0,0,1,2.486,2.775v.017a2.9,2.9,0,0,1-2.874,2.868H3.7C3.659,16.577,3.618,16.577,3.578,16.577ZM1.1,13.2a2.483,2.483,0,0,0,2.567,2.389H9.98A1.914,1.914,0,0,0,11.87,13.7,1.876,1.876,0,0,0,10.242,11.9l-.822-.11-.035-.828A2.622,2.622,0,0,0,6.69,8.451H6.658a2.72,2.72,0,0,0-2.613,1.79l-.208.571-.6.072A2.425,2.425,0,0,0,1.1,13.2Z" fill="url(#a58ac033-126d-45f0-b916-25fd6d357741)" /></g></g></svg>', "blob": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="a9c62307-1cd0-400c-911b-17ec6a9110ce" x1="9" y1="15.834" x2="9" y2="5.788" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#32bedd" /><stop offset="0.775" stop-color="#32d4f5" /></linearGradient></defs><title>MsPortalFx.base.images-7</title><g id="f31d214e-f09e-49e3-b3d2-7c5d55682d09"><g><path d="M.5,5.788h17a0,0,0,0,1,0,0v9.478a.568.568,0,0,1-.568.568H1.068A.568.568,0,0,1,.5,15.266V5.788A0,0,0,0,1,.5,5.788Z" fill="url(#a9c62307-1cd0-400c-911b-17ec6a9110ce)" /><path d="M1.071,2.166H16.929a.568.568,0,0,1,.568.568V5.788a0,0,0,0,1,0,0H.5a0,0,0,0,1,0,0V2.734A.568.568,0,0,1,1.071,2.166Z" fill="#0078d4" /><rect x="2.328" y="7.049" width="6.281" height="3.408" rx="0.283" fill="#0078d4" /><rect x="9.336" y="7.049" width="6.281" height="3.408" rx="0.283" fill="#fff" /><rect x="2.296" y="11.128" width="6.281" height="3.408" rx="0.283" fill="#0078d4" /><rect x="9.304" y="11.128" width="6.281" height="3.408" rx="0.283" fill="#0078d4" /></g></g></svg>', "cosmos-db": '<svg id="b089cfca-0de1-451c-a1ca-6680ea50cb4f" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><radialGradient id="b25d0836-964a-4c84-8c20-855f66e8345e" cx="-105.006" cy="-10.409" r="5.954" gradientTransform="translate(117.739 19.644) scale(1.036 1.027)" gradientUnits="userSpaceOnUse"><stop offset="0.183" stop-color="#5ea0ef" /><stop offset="1" stop-color="#0078d4" /></radialGradient><clipPath id="b36c7f5d-2ef1-4760-8a25-eeb9661f4e47"><path d="M14.969,7.53A6.137,6.137,0,1,1,7.574,2.987,6.137,6.137,0,0,1,14.969,7.53Z" fill="none" /></clipPath></defs><title>Icon-databases-121</title><path d="M2.954,5.266a.175.175,0,0,1-.176-.176h0A2.012,2.012,0,0,0,.769,3.081a.176.176,0,0,1-.176-.175h0a.176.176,0,0,1,.176-.176A2.012,2.012,0,0,0,2.778.72.175.175,0,0,1,2.954.544h0A.175.175,0,0,1,3.13.72h0A2.012,2.012,0,0,0,5.139,2.729a.175.175,0,0,1,.176.176h0a.175.175,0,0,1-.176.176h0A2.011,2.011,0,0,0,3.13,5.09.177.177,0,0,1,2.954,5.266Z" fill="#50e6ff" /><path d="M15.611,17.456a.141.141,0,0,1-.141-.141h0a1.609,1.609,0,0,0-1.607-1.607.141.141,0,0,1-.141-.14h0a.141.141,0,0,1,.141-.141h0a1.608,1.608,0,0,0,1.607-1.607.141.141,0,0,1,.141-.141h0a.141.141,0,0,1,.141.141h0a1.608,1.608,0,0,0,1.607,1.607.141.141,0,1,1,0,.282h0a1.609,1.609,0,0,0-1.607,1.607A.141.141,0,0,1,15.611,17.456Z" fill="#50e6ff" /><g><path d="M14.969,7.53A6.137,6.137,0,1,1,7.574,2.987,6.137,6.137,0,0,1,14.969,7.53Z" fill="url(#b25d0836-964a-4c84-8c20-855f66e8345e)" /><g clip-path="url(#b36c7f5d-2ef1-4760-8a25-eeb9661f4e47)"><path d="M5.709,13.115A1.638,1.638,0,1,0,5.714,9.84,1.307,1.307,0,0,0,5.721,9.7,1.651,1.651,0,0,0,4.06,8.064H2.832a6.251,6.251,0,0,0,1.595,5.051Z" fill="#f2f2f2" /><path d="M15.045,7.815c0-.015,0-.03-.007-.044a5.978,5.978,0,0,0-1.406-2.88,1.825,1.825,0,0,0-.289-.09,1.806,1.806,0,0,0-2.3,1.663,2,2,0,0,0-.2-.013,1.737,1.737,0,0,0-.581,3.374,1.451,1.451,0,0,0,.541.1h2.03A13.453,13.453,0,0,0,15.045,7.815Z" fill="#f2f2f2" /></g></g><path d="M17.191,3.832c-.629-1.047-2.1-1.455-4.155-1.149a14.606,14.606,0,0,0-2.082.452,6.456,6.456,0,0,1,1.528.767c.241-.053.483-.116.715-.151A7.49,7.49,0,0,1,14.3,3.662a2.188,2.188,0,0,1,1.959.725h0c.383.638.06,1.729-.886,3a16.723,16.723,0,0,1-4.749,4.051A16.758,16.758,0,0,1,4.8,13.7c-1.564.234-2.682,0-3.065-.636s-.06-1.73.886-2.995c.117-.157.146-.234.279-.392a6.252,6.252,0,0,1,.026-1.63A11.552,11.552,0,0,0,1.756,9.419C.517,11.076.181,12.566.809,13.613a3.165,3.165,0,0,0,2.9,1.249,8.434,8.434,0,0,0,1.251-.1,17.855,17.855,0,0,0,6.219-2.4,17.808,17.808,0,0,0,5.061-4.332C17.483,6.369,17.819,4.88,17.191,3.832Z" fill="#50e6ff" /></svg>', "databricks": '<svg id="b1e71479-2138-44e0-adf0-02fe9fed5c1e" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M1.155,4.93v.512L9,9.868l7.006-3.957,0,1.6L9,11.491,1.55,7.258l-.395.22V10.54L9,14.955l7.006-3.942,0,1.586L9,16.581,1.55,12.347l-.395.22v.519L9,17.5l7.845-4.414V10.021l-.4-.218L9,14.036,1.992,10.054V8.476L9,12.414,16.845,8V4.978l-.4-.219L9,8.993,2.352,5.215,9,1.46l5.476,3.094.479-.269V3.863L9,.5Z" fill="#ff3621" /></svg>', "disks": '<svg id="ea317b31-b31a-44fd-a7c4-260774575363" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="a3aecb5c-11f5-4ece-99f7-9672f3236156" x1="15.35" y1="13.41" x2="15.37" y2="13.41" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.14" stop-color="#1782da" /><stop offset="0.37" stop-color="#368fe3" /><stop offset="0.59" stop-color="#4c98ea" /><stop offset="0.8" stop-color="#599eee" /><stop offset="0.99" stop-color="#5ea0ef" /></linearGradient><linearGradient id="b4dfb3ab-25fe-416c-a6fa-f33fcfbf22dc" x1="5.51" y1="802.5" x2="12.94" y2="810.58" gradientTransform="translate(0 -1278.76) scale(1 1.59)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.02" stop-color="#0d7ed8" /><stop offset="0.08" stop-color="#2b8ae0" /><stop offset="0.15" stop-color="#4194e7" /><stop offset="0.22" stop-color="#519beb" /><stop offset="0.29" stop-color="#5b9fee" /><stop offset="0.4" stop-color="#5ea0ef" /><stop offset="0.55" stop-color="#5b9fee" /><stop offset="0.68" stop-color="#509aeb" /><stop offset="0.8" stop-color="#3f92e6" /><stop offset="0.91" stop-color="#2688df" /><stop offset="0.99" stop-color="#127fd9" /></linearGradient></defs><title>Icon-compute-32</title><ellipse cx="8.96" cy="11.82" rx="7.5" ry="3.08" fill="#76bc2d" /><ellipse cx="9.15" cy="11.79" rx="2.49" ry="0.68" fill="#5e9624" /><path d="M15.35,13.4l0,0Z" fill="url(#a3aecb5c-11f5-4ece-99f7-9672f3236156)" /><ellipse cx="8.96" cy="4.99" rx="7.5" ry="3.08" fill="url(#b4dfb3ab-25fe-416c-a6fa-f33fcfbf22dc)" /><ellipse cx="9.15" cy="4.95" rx="2.49" ry="0.68" fill="#005ba1" /><path d="M9,14.84c4.15,0,7.5-1.38,7.5-3.08h0v1.82h0c-.14,1.65-3.44,3-7.5,3s-7.5-1.38-7.5-3.08V11.76C1.46,13.46,4.82,14.84,9,14.84Z" fill="#5e9624" /><path d="M15.35,13.4l0,0Z" fill="url(#a3aecb5c-11f5-4ece-99f7-9672f3236156)" /><path d="M9,8c4.15,0,7.5-1.38,7.5-3.08h0V6.74h0c-.14,1.65-3.44,3-7.5,3s-7.5-1.38-7.5-3.08V4.92C1.46,6.62,4.82,8,9,8Z" fill="#0078d4" /></svg>', "elastic-pool": '<svg id="bfe7cacd-ee25-481f-8f5e-25c9c27c3227" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="a3e5dfd8-a5f0-49b4-8cf9-1d0f89138e2c" x1="-3071.86" y1="6711.69" x2="-3071.86" y2="6747.69" gradientTransform="matrix(0.35, 0.35, 0.35, -0.35, -1284.32, 3474.58)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#005ba1" /><stop offset="0.1" stop-color="#0060a9" /><stop offset="0.52" stop-color="#0071c8" /><stop offset="0.75" stop-color="#0078d4" /></linearGradient></defs><title>Icon-databases-134</title><rect x="2.46" y="2.46" width="13.08" height="13.08" rx="0.61" transform="translate(-3.73 9) rotate(-45)" fill="url(#a3e5dfd8-a5f0-49b4-8cf9-1d0f89138e2c)" /><path d="M9,3.41c-.95,0-1.71-.24-1.71-.55V5.77c0,.29.75.54,1.68.54H9c.94,0,1.71-.24,1.71-.54V2.86C10.72,3.17,10,3.41,9,3.41Z" fill="#50e6ff" /><path d="M10.72,2.86c0,.31-.77.55-1.71.55S7.3,3.17,7.3,2.86,8.06,2.32,9,2.32s1.71.24,1.71.54" fill="#eaeaea" /><path d="M10.32,2.82c0,.19-.59.35-1.31.35S7.7,3,7.7,2.82,8.28,2.47,9,2.47s1.31.16,1.31.35" fill="#50e6ff" /><path d="M9,2.9A3.57,3.57,0,0,0,8,3a3.52,3.52,0,0,0,1,.14,3.52,3.52,0,0,0,1-.14A3.62,3.62,0,0,0,9,2.9Z" fill="#32bedd" /><path d="M9,12.82c-.95,0-1.71-.24-1.71-.55v2.91c0,.29.75.54,1.68.54H9c.94,0,1.71-.24,1.71-.54V12.27C10.72,12.58,10,12.82,9,12.82Z" fill="#50e6ff" /><path d="M10.72,12.27c0,.31-.77.55-1.71.55s-1.71-.24-1.71-.55.76-.54,1.71-.54,1.71.24,1.71.54" fill="#eaeaea" /><path d="M10.32,12.23c0,.19-.59.35-1.31.35s-1.31-.16-1.31-.35.58-.35,1.31-.35,1.31.16,1.31.35" fill="#50e6ff" /><path d="M9,12.31a3.57,3.57,0,0,0-1,.13,3.52,3.52,0,0,0,1,.14,3.52,3.52,0,0,0,1-.14A3.62,3.62,0,0,0,9,12.31Z" fill="#32bedd" /><path d="M13.22,8.09c-1,0-1.71-.24-1.71-.54v2.9c0,.3.75.54,1.69.55h0c.94,0,1.71-.25,1.71-.55V7.55C14.93,7.85,14.16,8.09,13.22,8.09Z" fill="#50e6ff" /><path d="M14.93,7.55c0,.3-.77.54-1.71.54s-1.71-.24-1.71-.54S12.27,7,13.22,7s1.71.25,1.71.55" fill="#eaeaea" /><path d="M14.53,7.5c0,.2-.59.35-1.31.35s-1.31-.15-1.31-.35.58-.34,1.31-.34,1.31.15,1.31.34" fill="#50e6ff" /><path d="M13.22,7.58a3.52,3.52,0,0,0-1,.14,3.57,3.57,0,0,0,1,.13,3.57,3.57,0,0,0,1-.13A3.57,3.57,0,0,0,13.22,7.58Z" fill="#32bedd" /><path d="M4.92,8.09c-.95,0-1.71-.24-1.71-.54v2.9c0,.3.75.54,1.68.55h0c.94,0,1.71-.25,1.71-.55V7.55C6.63,7.85,5.86,8.09,4.92,8.09Z" fill="#50e6ff" /><path d="M6.63,7.55c0,.3-.77.54-1.71.54s-1.71-.24-1.71-.54S4,7,4.92,7s1.71.25,1.71.55" fill="#eaeaea" /><path d="M6.23,7.5c0,.2-.59.35-1.31.35S3.61,7.7,3.61,7.5s.58-.34,1.31-.34,1.31.15,1.31.34" fill="#50e6ff" /><path d="M4.92,7.58a3.52,3.52,0,0,0-1,.14,3.57,3.57,0,0,0,1,.13,3.57,3.57,0,0,0,1-.13A3.57,3.57,0,0,0,4.92,7.58Z" fill="#32bedd" /></svg>', "event-hubs": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><title>Icon-analytics-144</title><g><g id="a53a4de8-371c-49da-a662-c4631299fc03"><path d="M10.83,8.42a.26.26,0,0,1-.24.27H8.5a.26.26,0,0,1-.27-.24V6.89a.26.26,0,0,1,.24-.27h2.09a.26.26,0,0,1,.27.24V8.42Z" fill="#76bc2d" /><path d="M14.54,10a.26.26,0,0,1-.24.27H12.21a.26.26,0,0,1-.27-.24V8.48a.26.26,0,0,1,.24-.27h2.09a.26.26,0,0,1,.27.24V10Z" fill="#76bc2d" /><path d="M10.83,11.6a.26.26,0,0,1-.24.27H8.5a.26.26,0,0,1-.27-.24V10.07a.26.26,0,0,1,.24-.27h2.09a.26.26,0,0,1,.27.24V11.6Z" fill="#76bc2d" /><path d="M7.12,6.84a.25.25,0,0,1-.23.26H4.74a.26.26,0,0,1-.27-.23V5.25A.26.26,0,0,1,4.71,5H6.8c.22,0,.32.11.32.27Z" fill="#86d633" /><path d="M7.12,10a.25.25,0,0,1-.23.27H4.74A.26.26,0,0,1,4.47,10V8.42a.26.26,0,0,1,.24-.26H6.8c.22,0,.32.11.32.26Z" fill="#76bc2d" /><path d="M7.12,13.19a.25.25,0,0,1-.23.27H4.74a.26.26,0,0,1-.27-.24V11.6a.25.25,0,0,1,.24-.26H6.8c.22,0,.32.1.32.26Z" fill="#76bc2d" /><g><path d="M1.07,1.51H2.36a0,0,0,0,1,0,0v3.6a.29.29,0,0,1-.29.29H.79A.29.29,0,0,1,.5,5.11v-3A.57.57,0,0,1,1.07,1.51Z" fill="#999" /><path d="M1.07,1.51H2.36a0,0,0,0,1,0,0v3.6a.29.29,0,0,1-.29.29H.79A.29.29,0,0,1,.5,5.11v-3A.57.57,0,0,1,1.07,1.51Z" fill="#999" opacity="0.5" /></g><g><path d="M15.64,1.51h1.29a.57.57,0,0,1,.57.57v3a.29.29,0,0,1-.29.29H15.92a.29.29,0,0,1-.29-.29V1.51A0,0,0,0,1,15.64,1.51Z" fill="#999" /><path d="M15.64,1.51h1.29a.57.57,0,0,1,.57.57v3a.29.29,0,0,1-.29.29H15.92a.29.29,0,0,1-.29-.29V1.51A0,0,0,0,1,15.64,1.51Z" fill="#999" opacity="0.5" /></g><path d="M8.66-6.08H9.91a0,0,0,0,1,0,0v17a0,0,0,0,1,0,0H8.66a.57.57,0,0,1-.57-.57V-5.52A.57.57,0,0,1,8.66-6.08Z" transform="translate(11.42 -6.58) rotate(90)" fill="#949494" /><g><path d="M.79,12.76H2.08a.29.29,0,0,1,.29.29v3.6a0,0,0,0,1,0,0H1.07a.57.57,0,0,1-.57-.57V13A.29.29,0,0,1,.79,12.76Z" fill="#999" /><path d="M.79,12.76H2.08a.29.29,0,0,1,.29.29v3.6a0,0,0,0,1,0,0H1.07a.57.57,0,0,1-.57-.57V13A.29.29,0,0,1,.79,12.76Z" fill="#999" opacity="0.5" /></g><g><path d="M15.92,12.76h1.29a.29.29,0,0,1,.29.29v3a.57.57,0,0,1-.57.57H15.64a0,0,0,0,1,0,0V13A.29.29,0,0,1,15.92,12.76Z" fill="#999" /><path d="M15.92,12.76h1.29a.29.29,0,0,1,.29.29v3a.57.57,0,0,1-.57.57H15.64a0,0,0,0,1,0,0V13A.29.29,0,0,1,15.92,12.76Z" fill="#999" opacity="0.5" /></g><path d="M8.66,7.24H9.91a0,0,0,0,1,0,0v17a0,0,0,0,1,0,0H8.66a.57.57,0,0,1-.57-.57V7.81A.57.57,0,0,1,8.66,7.24Z" transform="translate(-6.74 24.74) rotate(-90)" fill="#949494" /></g></g></svg>', "fabric": '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor"><path fill="url(#i7cb92d-a)" fill-rule="evenodd" d="m3.148 21.322-.41 1.501c-.153.48-.367 1.186-.482 1.814a3.94 3.94 0 0 0 3.247 5.313c.554.08 1.181.075 1.884-.028l3.23-.446a2.05 2.05 0 0 0 1.695-1.49l2.223-8.164z" clip-rule="evenodd"/><path fill="url(#i7cb92d-b)" d="M6.298 21.71c-3.404.527-4.103 3.096-4.103 3.096l3.26-11.979 17.035-2.304-2.323 8.438c-.12.452-.5.798-.971.87l-.095.016-12.898 1.879z"/><path fill="url(#i7cb92d-c)" fill-opacity=".8" d="M6.298 21.71c-3.404.527-4.103 3.096-4.103 3.096l3.26-11.979 17.035-2.304-2.323 8.438c-.12.452-.5.798-.971.87l-.095.016-12.898 1.879z"/><path fill="url(#i7cb92d-d)" d="m8.23 14.066 18.86-2.786c.448-.06.811-.39.926-.82l1.946-7.043a1.116 1.116 0 0 0-1.218-1.408L10.75 4.668a5.03 5.03 0 0 0-4.044 3.636L4.11 17.709c.52-1.902.84-3.05 4.12-3.643"/><path fill="url(#i7cb92d-e)" d="m8.23 14.066 18.86-2.786c.448-.06.811-.39.926-.82l1.946-7.043a1.116 1.116 0 0 0-1.218-1.408L10.75 4.668a5.03 5.03 0 0 0-4.044 3.636L4.11 17.709c.52-1.902.84-3.05 4.12-3.643"/><path fill="url(#i7cb92d-f)" fill-opacity=".4" d="m8.23 14.066 18.86-2.786c.448-.06.811-.39.926-.82l1.946-7.043a1.116 1.116 0 0 0-1.218-1.408L10.75 4.668a5.03 5.03 0 0 0-4.044 3.636L4.11 17.709c.52-1.902.84-3.05 4.12-3.643"/><path fill="url(#i7cb92d-g)" d="M8.23 14.066c-2.731.495-3.409 1.374-3.86 2.753l-2.175 7.988s.695-2.543 4.058-3.087L19.1 19.848l.095-.016c.471-.071.851-.419.972-.87l1.911-6.941-13.85 2.045Z"/><path fill="url(#i7cb92d-h)" fill-opacity=".2" d="M8.23 14.066c-2.731.495-3.409 1.374-3.86 2.753l-2.175 7.988s.695-2.543 4.058-3.087L19.1 19.848l.095-.016c.471-.071.851-.419.972-.87l1.911-6.941-13.85 2.045Z"/><path fill="url(#i7cb92d-i)" fill-rule="evenodd" d="M6.253 21.72c-2.842.46-3.775 2.342-3.997 2.916a3.94 3.94 0 0 0 3.247 5.314c.554.08 1.181.075 1.884-.028l3.23-.446a2.05 2.05 0 0 0 1.695-1.49l2.026-7.443z" clip-rule="evenodd"/><defs><linearGradient id="i7cb92d-a" x1="8.268" x2="8.268" y1="30.005" y2="19.822" gradientUnits="userSpaceOnUse"><stop offset=".056" stop-color="#2AAC94"/><stop offset=".155" stop-color="#239C87"/><stop offset=".372" stop-color="#177E71"/><stop offset=".588" stop-color="#0E6961"/><stop offset=".799" stop-color="#095D57"/><stop offset="1" stop-color="#085954"/></linearGradient><linearGradient id="i7cb92d-b" x1="21.134" x2="11.302" y1="22.617" y2="11.923" gradientUnits="userSpaceOnUse"><stop offset=".042" stop-color="#ABE88E"/><stop offset=".549" stop-color="#2AAA92"/><stop offset=".906" stop-color="#117865"/></linearGradient><linearGradient id="i7cb92d-c" x1="-3.028" x2="6.329" y1="22.097" y2="18.906" gradientUnits="userSpaceOnUse"><stop stop-color="#6AD6F9"/><stop offset="1" stop-color="#6AD6F9" stop-opacity="0"/></linearGradient><linearGradient id="i7cb92d-d" x1="4.11" x2="29.016" y1="9.855" y2="9.855" gradientUnits="userSpaceOnUse"><stop offset=".043" stop-color="#25FFD4"/><stop offset=".874" stop-color="#55DDB9"/></linearGradient><linearGradient id="i7cb92d-e" x1="4.11" x2="26.546" y1="6.373" y2="16.791" gradientUnits="userSpaceOnUse"><stop stop-color="#6AD6F9"/><stop offset=".23" stop-color="#60E9D0"/><stop offset=".651" stop-color="#6DE9BB"/><stop offset=".994" stop-color="#ABE88E"/></linearGradient><linearGradient id="i7cb92d-f" x1="6.185" x2="18.385" y1="8.323" y2="11.021" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".459" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="i7cb92d-g" x1="10.23" x2="10.518" y1="18.774" y2="10.219" gradientUnits="userSpaceOnUse"><stop offset=".205" stop-color="#063D3B" stop-opacity="0"/><stop offset=".586" stop-color="#063D3B" stop-opacity=".237"/><stop offset=".872" stop-color="#063D3B" stop-opacity=".75"/></linearGradient><linearGradient id="i7cb92d-h" x1="1.166" x2="11.592" y1="17.923" y2="19.884" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".459" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="i7cb92d-i" x1="8.698" x2="6.664" y1="27.183" y2="17.238" gradientUnits="userSpaceOnUse"><stop offset=".064" stop-color="#063D3B" stop-opacity="0"/><stop offset=".17" stop-color="#063D3B" stop-opacity=".135"/><stop offset=".562" stop-color="#063D3B" stop-opacity=".599"/><stop offset=".85" stop-color="#063D3B" stop-opacity=".9"/><stop offset="1" stop-color="#063D3B"/></linearGradient></defs></svg>', "file-shares": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="ba3d4428-273b-47d2-80ac-53671019b795" x1="-1267.23" y1="3.07" x2="-1267.52" y2="14.64" gradientTransform="matrix(-1, 0, 0, 1, -1256.13, 0)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#32d4f5" /><stop offset="0.23" stop-color="#31d0f1" /><stop offset="0.46" stop-color="#2cc3e6" /><stop offset="0.7" stop-color="#25afd4" /><stop offset="0.94" stop-color="#1c92ba" /><stop offset="1" stop-color="#198ab3" /></linearGradient></defs><g id="bce83c25-9afe-4c01-b0b0-4312ccacb0c8"><g><path d="M17.28,3.9h-.91a4.16,4.16,0,0,0-.55,0,.68.68,0,0,1-.59-1l.39-.7a1.83,1.83,0,0,0-.51-.29l-.93,1.66a.7.7,0,0,1-.6.35h-.83a.66.66,0,0,0-.32.08h0L10.86,5a.25.25,0,0,1-.16,0H5.27A.29.29,0,0,0,5,5.32v4.82l-1.75.54.13.56L5,11V13.9a.29.29,0,0,0,.29.29h9.37l1.15,1.49.49-.31-.68-1.18h1.68a.29.29,0,0,0,.3-.29V4.2A.3.3,0,0,0,17.28,3.9Z" fill="#005ba1" /><circle cx="15.88" cy="1.08" r="1.09" fill="#50e5ff" /><circle cx="16.58" cy="16.59" r="1.42" fill="#50e5ff" /><circle cx="1.77" cy="11.44" r="1.77" fill="#50e5ff" /><g><path d="M15.17,4.75l-6.91-1H8.12a1,1,0,0,0-1,.87L6.86,6.31H16L16,5.9A1,1,0,0,0,15.17,4.75Z" fill="#0078d4" /><path d="M15.1,5.18l-6.9-1H8.11a.58.58,0,0,0-.57.5L7.3,6.31h8.22l.07-.47A.58.58,0,0,0,15.1,5.18Z" fill="#fff" /></g><path d="M5.26,5h6.05a.33.33,0,0,1,.21.09l1,1a.29.29,0,0,0,.21.09h4.6a.3.3,0,0,1,.3.29V13.9a.3.3,0,0,1-.3.29h-12A.29.29,0,0,1,5,13.9V5.32A.3.3,0,0,1,5.26,5Z" fill="url(#ba3d4428-273b-47d2-80ac-53671019b795)" /></g></g></svg>', "fleet-manager": '<svg id="uuid-54cc9e20-2e30-4e65-a9a4-8bc4f07d47c6" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><g><rect x="5.974" y="0" width="6.053" height="6.053" rx=".401" ry=".401" fill="#a67af4" /><path d="M11.392,5.523H6.611c-.059,0-.107-.048-.107-.108V.638c0-.059,.048-.107,.107-.108h4.778c.059,0,.108,.048,.108,.108V5.415c0,.058-.046,.106-.105,.108Z" fill="#773adc" /><g><rect x="7.202" y=".983" width="1.257" height="4.087" fill="#b796f9" /><rect x="9.541" y=".982" width="1.257" height="4.088" fill="#b796f9" /></g></g><g><path d="M8.045,10.794c.292-.107,.598-.161,.909-.161,.303,0,.602,.052,.888,.154l2.184,.779V7.225c0-.221-.179-.401-.401-.401H6.375c-.221,0-.401,.179-.401,.401v4.327l2.071-.758Z" fill="#a67af4" /><path d="M8.045,10.794c.292-.107,.598-.161,.909-.161,.303,0,.602,.052,.888,.154l1.654,.59v-3.914c0-.059-.048-.108-.108-.108H6.611c-.059,0-.107,.048-.107,.108v3.896l1.541-.564Z" fill="#773adc" /><g><path d="M9.842,10.786l.956,.341v-3.321h-1.257v2.894c.102,.023,.202,.05,.301,.085Z" fill="#b796f9" /><path d="M8.045,10.794c.135-.05,.274-.087,.414-.113v-2.873h-1.257v3.295l.843-.309Z" fill="#b796f9" /></g></g><g><path d="M5.264,2.406H1.159c-.204,0-.37,.166-.37,.37V7.623c0,.204,.166,.37,.37,.37H5.264V2.406Z" fill="#a67af4" /><path d="M5.264,2.895H1.376c-.055,0-.099,.045-.099,.099V7.404c0,.055,.044,.099,.099,.099h3.887V2.895Z" fill="#773adc" /><g><rect x="1.922" y="3.313" width="1.161" height="3.773" fill="#b796f9" /><rect x="4.103" y="3.312" width="1.161" height="3.774" fill="#b796f9" /></g></g><g><path d="M2.807,11.517c.237-.087,.485-.131,.737-.131,.246,0,.489,.042,.72,.125l.999,.356v-3.183H1.159c-.204,0-.37,.166-.37,.37v3.202l2.019-.739Z" fill="#a67af4" /><path d="M2.807,11.517c.237-.087,.485-.131,.737-.131,.246,0,.489,.042,.72,.125l.999,.356v-2.694H1.376c-.055,0-.099,.045-.099,.099v2.804l1.53-.56Z" fill="#773adc" /><g><path d="M4.287,11.511l.977,.349v-2.269h-1.161v1.864c.062,.016,.123,.035,.184,.056Z" fill="#b796f9" /><path d="M2.807,11.517c.09-.033,.182-.058,.276-.078v-1.847H1.922v2.25l.885-.324Z" fill="#b796f9" /></g></g><g><path d="M15.136,11.517c-.237-.087-.485-.131-.737-.131-.246,0-.489,.042-.72,.125l-.999,.356v-3.183h4.105c.204,0,.37,.166,.37,.37v3.202l-2.019-.739Z" fill="#a67af4" /><path d="M15.136,11.517c-.237-.087-.485-.131-.737-.131-.246,0-.489,.042-.72,.125l-.999,.356v-2.694h3.887c.055,0,.099,.045,.099,.099v2.804l-1.53-.56Z" fill="#773adc" /><g><path d="M13.656,11.511l-.977,.349v-2.269h1.161v1.864c-.062,.016-.123,.035-.184,.056Z" fill="#b796f9" /><path d="M15.136,11.517c-.09-.033-.182-.058-.276-.078v-1.847h1.161v2.25l-.885-.324Z" fill="#b796f9" /></g></g><g><path d="M12.68,2.406h4.105c.204,0,.37,.166,.37,.37V7.623c0,.204-.166,.37-.37,.37h-4.105V2.406Z" fill="#a67af4" /><path d="M12.68,2.895h3.887c.055,0,.099,.045,.099,.099V7.404c0,.055-.044,.099-.099,.099h-3.887V2.895Z" fill="#773adc" /><g><rect x="14.86" y="3.313" width="1.161" height="3.773" fill="#b796f9" /><rect x="12.68" y="3.312" width="1.161" height="3.774" fill="#b796f9" /></g></g><path d="M17.988,17.993H0l.004-1.012c.079,.007,.164,.011,.254,.011,.726-.001,1.09-.234,1.454-.467,.365-.233,.73-.467,1.459-.467h.003c.73,0,1.094,.233,1.459,.467,.365,.233,.729,.467,1.458,.467,.729,0,1.093-.234,1.458-.467,.365-.233,.73-.467,1.459-.467h.003c.182,0,.34,.015,.482,.04,.432,.077,.708,.252,.983,.428,.365,.233,.729,.465,1.456,.466,.728,0,1.092-.234,1.456-.467,.365-.233,.73-.467,1.459-.467h.014c.725,.004,1.09,.236,1.454,.468,.365,.233,.73,.466,1.459,.466,.075,0,.145-.002,.213-.007v1.008Z" fill="#83b9f9" /><g><path d="M.092,13.594l.82,1.762,.026,.056h0l.22,.496,.128,.293c.051-.031,.102-.062,.156-.096,.38-.243,.853-.546,1.731-.546s1.349,.303,1.729,.546c.179,.114,.34,.214,.536,.284l-.243-.504-.014-.029-.032-.068-1.011-2.172-.013-.027-.01-.029c-.007-.019-.068-.194-.108-.366-.041-.176-.072-.383,.013-.586,.088-.212,.247-.385,.448-.492l-.372-.133c-.361-.129-.757-.127-1.117,.005l-2.221,.813H.758l-.58,.213c-.078,.029-.141,.089-.173,.166-.012,.03-.002,.098,.015,.171,.027,.116,.072,.244,.072,.244Z" fill="#0078d4" /><path d="M4.698,13.354l1.011,2.172,.032,.068h0l.413,.893c.534-.014,.801-.175,1.125-.383,.38-.243,.853-.546,1.731-.546,.204,0,.391,.016,.57,.048,.531,.094,.868,.309,1.165,.499,.296,.189,.55,.336,.994,.372l.44-.873,.01,.003,.04-.081,.054-.109,.045-.091,.966-1.969s.154-.415,.114-.512c-.039-.097-.118-.172-.217-.208l-.818-.292h0l-2.74-.978c-.446-.159-.933-.157-1.377,.006l-2.738,1.003h0l-.715,.262c-.096,.035-.174,.109-.213,.204-.015,.036-.003,.121,.018,.21,.033,.143,.089,.301,.089,.301Z" fill="#0078d4" /><path d="M13.967,12.607c.084,.203,.054,.411,.013,.586-.04,.171-.101,.346-.108,.366l-.01,.029-.013,.027-1.011,2.172-.032,.068-.014,.029-.249,.515c.213-.071,.385-.174,.575-.295,.372-.238,.833-.533,1.708-.544h.037c.872,.003,1.342,.304,1.721,.545,.043,.027,.083,.051,.125,.077l.12-.274,.22-.496h0l.026-.055,.82-1.762s.045-.128,.072-.244c.017-.073,.027-.141,.015-.171-.032-.077-.095-.137-.173-.166l-.58-.212h0l-2.221-.814c-.36-.132-.756-.134-1.117-.005l-.372,.133c.2,.107,.36,.28,.448,.492Z" fill="#0078d4" /></g></svg>', "front-door": '<svg id="b9c24df5-e0dd-4838-a385-7c11c2d34304" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="aa2ee697-e8d1-4da1-a8c5-64c8ebbb74cf" x1="9" y1="13.83" x2="9" y2="1.07" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.82" stop-color="#5ea0ef" /></linearGradient></defs><title>Icon-networking-73</title><path d="M18,9.83A4,4,0,0,0,14.49,6,5.1,5.1,0,0,0,9.24,1.07a5.23,5.23,0,0,0-5,3.41A4.83,4.83,0,0,0,0,9.12a4.9,4.9,0,0,0,5.07,4.71l.44,0h8.21a.78.78,0,0,0,.22,0A4.09,4.09,0,0,0,18,9.83Z" fill="url(#aa2ee697-e8d1-4da1-a8c5-64c8ebbb74cf)" /><path id="f0276135-0079-4897-a518-21eb63472c16" d="M6.63,6.82h5.06v7H6.63Z" fill="#f2f2f2" /><path id="e528878d-2ed7-4392-94e6-99c6fc971bcb" d="M12.61,6.37l-3.49-2a.25.25,0,0,0-.31.15s0,.06,0,.08V16.68a.25.25,0,0,0,.24.25h.08l3.49-2.06a.25.25,0,0,0,.17-.23v-8A.26.26,0,0,0,12.61,6.37Z" fill="#50e6ff" /></svg>', "key-vault": '<svg id="bc93169a-24c4-4686-9f37-c7e4f53b3d34" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><radialGradient id="fb114c93-7c16-4540-899a-0796041629e6" cx="9" cy="9" r="8.5" gradientUnits="userSpaceOnUse"><stop offset="0.18" stop-color="#5ea0ef" /><stop offset="0.56" stop-color="#5c9fee" /><stop offset="0.69" stop-color="#559ced" /><stop offset="0.78" stop-color="#4a97e9" /><stop offset="0.86" stop-color="#3990e4" /><stop offset="0.93" stop-color="#2387de" /><stop offset="0.99" stop-color="#087bd6" /><stop offset="1" stop-color="#0078d4" /></radialGradient><radialGradient id="ec478bd3-5b38-4e7f-b661-11f355578bff" cx="38.95" cy="182.07" r="9.88" gradientTransform="translate(-28.71 -163.24) scale(0.94 0.94)" gradientUnits="userSpaceOnUse"><stop offset="0.27" stop-color="#ffd70f" /><stop offset="0.49" stop-color="#ffcb12" /><stop offset="0.88" stop-color="#feac19" /><stop offset="1" stop-color="#fea11b" /></radialGradient></defs><title>Icon-security-245</title><path id="aacf8311-a317-400f-b613-74bd00da5ce3" d="M9,.5A8.5,8.5,0,1,0,17.5,9,8.51,8.51,0,0,0,9,.5ZM9,16.34A7.34,7.34,0,1,1,16.34,9,7.34,7.34,0,0,1,9,16.34Z" fill="url(#fb114c93-7c16-4540-899a-0796041629e6)" /><circle cx="9" cy="9" r="7.34" fill="#fff" /><g><path id="bd983c41-db73-40ec-a4f4-da1213fc9924" d="M13.44,7.33a1.84,1.84,0,0,0,0-2.59h0L10.29,1.58a1.83,1.83,0,0,0-2.58,0h0L4.56,4.74a1.84,1.84,0,0,0,0,2.59L7.18,10a.51.51,0,0,1,.15.36v4.88a.63.63,0,0,0,.18.44l1.2,1.2a.41.41,0,0,0,.58,0l1.16-1.16h0l.68-.68a.25.25,0,0,0,0-.34l-.49-.49a.27.27,0,0,1,0-.37l.49-.49a.25.25,0,0,0,0-.34l-.49-.49a.27.27,0,0,1,0-.37l.49-.49a.25.25,0,0,0,0-.34l-.68-.69v-.25ZM9,2.35A1,1,0,0,1,9,4.42,1,1,0,1,1,9,2.35Z" fill="url(#ec478bd3-5b38-4e7f-b661-11f355578bff)" /><path id="ad2e7e44-9bfd-4775-8bf4-8ef26a544921" d="M8.18,15.3h0a.23.23,0,0,0,.38-.17v-4a.24.24,0,0,0-.11-.2h0a.22.22,0,0,0-.34.2v4A.28.28,0,0,0,8.18,15.3Z" fill="#ff9300" opacity="0.75" /><rect id="a996fbff-3936-4b24-b407-369336c143ba" x="6.48" y="5.79" width="5.17" height="0.61" rx="0.28" fill="#ff9300" opacity="0.75" /><rect id="bb12d31c-3352-4a18-87dd-a169a4a8721d" x="6.48" y="6.78" width="5.17" height="0.61" rx="0.28" fill="#ff9300" opacity="0.75" /></g></svg>', "load-balancer": '<svg id="e1e71e29-065a-46f7-ad4b-52af36a0bfcb" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="ef84663a-a7b6-46a7-a275-1e419f5eae62" x1="9" y1="19.85" x2="9" y2="-1.02" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5e9624" /><stop offset="0.02" stop-color="#5f9724" /><stop offset="1" stop-color="#76bc2d" /></linearGradient></defs><title>Icon-networking-62</title><path d="M.18,8.57,8.57.18a.6.6,0,0,1,.86,0l8.39,8.39a.6.6,0,0,1,0,.86l-8.4,8.4a.6.6,0,0,1-.84,0L.18,9.43A.6.6,0,0,1,.18,8.57Z" fill="url(#ef84663a-a7b6-46a7-a275-1e419f5eae62)" /><path d="M11.2,4,9.08,1.89a.12.12,0,0,0-.16,0L6.8,4a.1.1,0,0,0,.08.18H8.12a.11.11,0,0,1,.11.11v2a.11.11,0,0,0,.11.11H9.66a.11.11,0,0,0,.11-.11v-2a.11.11,0,0,1,.11-.11h1.24A.1.1,0,0,0,11.2,4Z" fill="#b4ec36" /><path d="M4,6.61,1.9,8.74a.11.11,0,0,0,0,.15L4,11a.11.11,0,0,0,.19-.08V9.69a.11.11,0,0,1,.11-.11h2a.1.1,0,0,0,.1-.11V8.15A.1.1,0,0,0,6.33,8h-2a.1.1,0,0,1-.11-.1V6.69A.11.11,0,0,0,4,6.61Z" fill="#b4ec36" /><path d="M14.08,11l2.13-2.12a.11.11,0,0,0,0-.15L14.08,6.61a.11.11,0,0,0-.18.08V7.94a.1.1,0,0,1-.11.1h-2a.1.1,0,0,0-.1.11V9.47a.1.1,0,0,0,.1.11h2a.11.11,0,0,1,.11.11v1.24A.11.11,0,0,0,14.08,11Z" fill="#b4ec36" /><path d="M11.79,9a2.79,2.79,0,1,0-3.54,2.67v.95a1.71,1.71,0,1,0,1.57,0v-1A2.77,2.77,0,0,0,11.79,9Z" fill="#fff" /><circle id="e99c3387-15c3-4f28-bd4b-cb209b430e06" cx="9.01" cy="8.99" r="1.62" fill="#5ea0ef" /></svg>', "postgresql": '<svg id="fc890127-728b-4ac0-b5da-86cdfc191e86" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="a28dee20-4c71-46b5-b957-804c67da725a" x1="2.44" y1="10.67" x2="15.27" y2="10.67" gradientTransform="translate(0.14 -0.5) rotate(-0.01)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#005ba1" /><stop offset="0.07" stop-color="#0060a9" /><stop offset="0.36" stop-color="#0071c8" /><stop offset="0.52" stop-color="#0078d4" /><stop offset="0.64" stop-color="#0074cd" /><stop offset="0.82" stop-color="#006abb" /><stop offset="1" stop-color="#005ba1" /></linearGradient></defs><title>Icon-databases-131</title><path d="M9,5.14c-3.54,0-6.41-1-6.41-2.32V15.18c0,1.27,2.82,2.3,6.32,2.32H9c3.54,0,6.41-1,6.41-2.32V2.82C15.41,4.1,12.54,5.14,9,5.14Z" fill="url(#a28dee20-4c71-46b5-b957-804c67da725a)" /><path d="M15.41,2.82c0,1.28-2.87,2.32-6.41,2.32s-6.41-1-6.41-2.32S5.46.5,9,.5s6.41,1,6.41,2.32" fill="#e8e8e8" /><path d="M13.91,2.63c0,.82-2.2,1.48-4.91,1.48S4.08,3.45,4.08,2.64,6.28,1.16,9,1.16s4.91.66,4.91,1.47" fill="#50e6ff" /><path d="M9,3a11.65,11.65,0,0,0-3.9.57A11.53,11.53,0,0,0,9,4.11a11.47,11.47,0,0,0,3.89-.58A11.93,11.93,0,0,0,9,3Z" fill="#198ab3" /><path d="M12,9c0,.08,0,.24,0,.42a5.12,5.12,0,0,0-.08.63c0,.12,0,.3.05.46s0,.27,0,.36a1.68,1.68,0,0,1-.25.86.43.43,0,0,0,0,.07l.1.12a10.55,10.55,0,0,0,1.06-2.38h0c.28-.95.31-1.63.09-1.92a2.58,2.58,0,0,0-2.68-.86,3.29,3.29,0,0,1,.91.67A2.28,2.28,0,0,1,12,9Zm-.31.08a1.15,1.15,0,0,0-.79.09c-.29.18-.2.55,0,1a7.77,7.77,0,0,0,.35.85l.09.16h0c.05.08.08.15.11.2l.08.13a1.28,1.28,0,0,0,.18-.65,2.86,2.86,0,0,0,0-.33c0-.17,0-.36-.05-.49a6.1,6.1,0,0,1,.08-.69C11.71,9.24,11.72,9.13,11.73,9.05Zm-.3.41a.4.4,0,0,1-.18.1h0a.33.33,0,0,1-.14,0A.23.23,0,0,1,11,9.4h0c0-.07.11-.13.24-.15h.19s.09,0,.09.08A.2.2,0,0,1,11.43,9.46Zm-4.69.89c0-.07,0-.13,0-.17a1,1,0,0,0,0-.17,5.55,5.55,0,0,1,0-1A5.22,5.22,0,0,1,7,7.94,2.41,2.41,0,0,1,7.58,7,4.78,4.78,0,0,0,6.23,6.8a1.87,1.87,0,0,0-1.1.3A2,2,0,0,0,4.5,8.92,12.27,12.27,0,0,0,5,11.16c.34,1.14.73,1.84,1.07,1.95h0c.15.05.31,0,.47-.21.28-.34.54-.63.69-.8A1.88,1.88,0,0,1,6.74,10.35Zm.26.4a2.18,2.18,0,0,0,.06.56,1.5,1.5,0,0,0,.26.44,1.07,1.07,0,0,0,.35.25,1.09,1.09,0,0,0,.39.08c0-.17.14-.38.23-.6a4.35,4.35,0,0,0,.21-.59,6.61,6.61,0,0,0,0-1.11c0-.09,0-.19-.06-.3a.45.45,0,0,0-.12-.27l0,0A.66.66,0,0,0,8,9.08H7.8a1.56,1.56,0,0,0-.48.14A2,2,0,0,0,7,9.41v.11c0,.2,0,.41,0,.61v0a.86.86,0,0,1,0,.15l0,.39H7Zm.66-1.34,0,0a.46.46,0,0,1,.28,0,.6.6,0,0,1,.19.06c.09,0,.1.11.09.14h0a.37.37,0,0,1-.12.13A.3.3,0,0,1,8,9.73h0a.34.34,0,0,1-.28-.28Zm.74,3a.23.23,0,0,0-.13.06l-.14.17c-.17.21-.24.28-.73.38a.52.52,0,0,0-.26.1.58.58,0,0,0,.24.11,1.18,1.18,0,0,0,.72,0A1.7,1.7,0,0,0,8.45,13a.61.61,0,0,0,.2-.31.36.36,0,0,0-.1-.28A.15.15,0,0,0,8.4,12.39Zm4.61,0a1.63,1.63,0,0,1-1.13,0,.22.22,0,0,0-.14,0,.3.3,0,0,0-.17.14,1.09,1.09,0,0,0,0,.31,1.8,1.8,0,0,0,1.1-.1,1.36,1.36,0,0,0,.48-.34Zm-2.4-2.14c-.14-.41-.34-1,.18-1.36a1.35,1.35,0,0,1,.89-.15A3.18,3.18,0,0,0,11,7.64l-.1-.1-.06-.06h0a.34.34,0,0,0-.06-.06l0,0,0,0A2.34,2.34,0,0,0,10.11,7,2.63,2.63,0,0,0,9,6.78a1.52,1.52,0,0,0-.7.11A1.77,1.77,0,0,0,8,7a2.1,2.1,0,0,0-.74,1,5.84,5.84,0,0,0-.21,1,1.66,1.66,0,0,1,1-.23.84.84,0,0,1,.77.91,7.26,7.26,0,0,1,0,1.27,3.87,3.87,0,0,1-.23.63c-.06.17-.14.35-.18.49a.5.5,0,0,1,.38.14.66.66,0,0,1,.19.53H9c0,.08,0,.16,0,.24a6.55,6.55,0,0,0,.24,2.44.54.54,0,0,0,.24.21.6.6,0,0,0,.31.1,1.3,1.3,0,0,0,1-.34,1.05,1.05,0,0,0,.29-.66c.07-.45.22-1.7.24-2h0a.72.72,0,0,1,.09-.44.63.63,0,0,1,.27-.24A5.36,5.36,0,0,1,10.61,10.24Z" fill="#f2f2f2" /></svg>', "recovery-vault": '<svg id="b4d0e6e2-12c1-4275-b717-890060dd1560" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="f1a30f9e-7f48-44e2-9483-6a6db8928977" x1="11.13" y1="10.95" x2="11.13" y2="1.21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.16" stop-color="#1380da" /><stop offset="0.53" stop-color="#3c91e5" /><stop offset="0.82" stop-color="#559cec" /><stop offset="1" stop-color="#5ea0ef" /></linearGradient><linearGradient id="b4a5ed8d-a28d-4d26-9aad-a57e6ad0c0b9" x1="7.06" y1="16.79" x2="7.06" y2="6.78" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#198ab3" /><stop offset="0.13" stop-color="#21a0c7" /><stop offset="0.31" stop-color="#28b7db" /><stop offset="0.5" stop-color="#2ec7ea" /><stop offset="0.72" stop-color="#31d1f2" /><stop offset="1" stop-color="#32d4f5" /></linearGradient></defs><title>Icon-manage-315</title><path d="M18,7.9a3.09,3.09,0,0,0-2.68-3,3.89,3.89,0,0,0-4-3.72A4,4,0,0,0,7.5,3.81,3.68,3.68,0,0,0,4.26,7.36,3.74,3.74,0,0,0,8.13,11l.34,0h6.26l.17,0A3.13,3.13,0,0,0,18,7.9Z" fill="url(#f1a30f9e-7f48-44e2-9483-6a6db8928977)" /><path d="M14.39,5.22,12.56,3.44c-.2-.2-.37-.13-.37.18v.8a.22.22,0,0,1-.23.22c-1.18,0-4.47.31-4.59,4.81a.23.23,0,0,0,.23.23H8.77A.23.23,0,0,0,9,9.43,2.76,2.76,0,0,1,12,6.1a.23.23,0,0,1,.23.23v.74c0,.37.12.43.37.18L14.39,5.6A.23.23,0,0,0,14.39,5.22Z" fill="#fff" /><path d="M14.12,13.66a3.17,3.17,0,0,0-2.75-3.05A4,4,0,0,0,7.25,6.78,4.1,4.1,0,0,0,3.33,9.46,3.78,3.78,0,0,0,0,13.1a3.84,3.84,0,0,0,4,3.69h6.78a.47.47,0,0,0,.17,0A3.21,3.21,0,0,0,14.12,13.66Z" fill="url(#b4a5ed8d-a28d-4d26-9aad-a57e6ad0c0b9)" /></svg>', "resource-guard": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="a8ff46c3-87c7-4d10-8b34-694ab4aad841" x1="8.997" y1="774.788" x2="8.997" y2="790.251" gradientTransform="matrix(1, 0, 0, -1, 0, 791.516)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.06" stop-color="#0a7cd7" /><stop offset="0.34" stop-color="#2e8ce1" /><stop offset="0.59" stop-color="#4897e9" /><stop offset="0.82" stop-color="#589eed" /><stop offset="1" stop-color="#5ea0ef" /></linearGradient></defs><g id="b60a4615-9dba-4e5f-bd62-c0fd24a8d322"><g><g><path d="M16.494,8.4c0,4.837-5.949,8.732-7.251,9.525a.45.45,0,0,1-.486,0c-1.3-.783-7.251-4.678-7.251-9.525V2.583a.466.466,0,0,1,.456-.466C6.6,2,5.528,0,9,0s2.4,2,7.038,2.117a.466.466,0,0,1,.456.466Z" fill="#0078d4" /><path d="M15.451,8.48c0,4.169-5.121,7.513-6.243,8.188a.4.4,0,0,1-.417,0C7.67,15.993,2.549,12.649,2.549,8.48V3.518a.406.406,0,0,1,.331-.47.368.368,0,0,1,.066-.006C6.935,2.972,6.022,1.265,9,1.265s2.064,1.707,6.054,1.777a.407.407,0,0,1,.4.4Z" fill="url(#a8ff46c3-87c7-4d10-8b34-694ab4aad841)" /></g><g><polygon points="12.38 7.016 12.38 10.948 9.01 12.934 9.01 8.982 12.38 7.016" fill="#50e6ff" /><polygon points="12.38 7.016 9.01 9.002 5.62 7.016 9.01 5.03 12.38 7.016" fill="#c3f1ff" /><polygon points="9.01 9.002 9.01 12.934 5.62 10.948 5.62 7.016 9.01 9.002" fill="#9cebff" /><polygon points="5.62 10.948 9.01 8.982 9.01 12.934 5.62 10.948" fill="#c3f1ff" /><polygon points="12.38 10.948 9.01 8.982 9.01 12.934 12.38 10.948" fill="#9cebff" /></g></g></g></svg>', "service-bus": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="bbd02878-309a-4490-8196-946338d0f593" x1="8.995" y1="10.299" x2="8.995" y2="13.199" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#005ba1" /><stop offset="0.258" stop-color="#00589d" /><stop offset="0.525" stop-color="#004f90" /><stop offset="0.796" stop-color="#003f7c" /><stop offset="1" stop-color="#003067" /></linearGradient></defs><g><g id="b532e600-3623-4be6-9fa6-30d05fff56b1"><polygon points="13.387 7.4 13.382 7.396 13.382 7.384 13.363 7.384 8.997 4.405 4.631 7.384 4.612 7.384 4.612 7.396 4.606 7.4 4.612 7.4 4.612 13.201 13.382 13.201 13.382 7.4 13.387 7.4" fill="#50e6ff" /><path d="M4.606,7.4c0-.1.008,5.681.008,5.8L8.995,10.3Z" fill="#32bedd" /><path d="M13.384,7.4,8.995,10.3,13.376,13.2C13.376,13.083,13.384,7.3,13.384,7.4Z" fill="#198ab3" /><polygon points="8.995 10.299 4.614 13.194 4.614 13.199 13.376 13.199 13.376 13.194 8.995 10.299" fill="url(#bbd02878-309a-4490-8196-946338d0f593)" /><g><path d="M1.072,1.43h1.29a0,0,0,0,1,0,0v3.6a.286.286,0,0,1-.286.286H.786A.286.286,0,0,1,.5,5.035V2A.572.572,0,0,1,1.072,1.43Z" fill="#999" /><path d="M1.072,1.43h1.29a0,0,0,0,1,0,0v3.6a.286.286,0,0,1-.286.286H.786A.286.286,0,0,1,.5,5.035V2A.572.572,0,0,1,1.072,1.43Z" fill="#999" opacity="0.5" /></g><g><path d="M15.638,1.43h1.29A.572.572,0,0,1,17.5,2V5.035a.286.286,0,0,1-.286.286h-1.29a.286.286,0,0,1-.286-.286V1.43A0,0,0,0,1,15.638,1.43Z" fill="#999" /><path d="M15.638,1.43h1.29A.572.572,0,0,1,17.5,2V5.035a.286.286,0,0,1-.286.286h-1.29a.286.286,0,0,1-.286-.286V1.43A0,0,0,0,1,15.638,1.43Z" fill="#999" opacity="0.5" /></g><path d="M8.66-6.163H9.907a0,0,0,0,1,0,0v17a0,0,0,0,1,0,0H8.66a.567.567,0,0,1-.567-.567V-5.6A.567.567,0,0,1,8.66-6.163Z" transform="translate(11.337 -6.663) rotate(90)" fill="#949494" /><g><path d="M.786,12.679h1.29a.286.286,0,0,1,.286.286v3.6a0,0,0,0,1,0,0H1.072A.572.572,0,0,1,.5,16V12.965A.286.286,0,0,1,.786,12.679Z" fill="#999" /><path d="M.786,12.679h1.29a.286.286,0,0,1,.286.286v3.6a0,0,0,0,1,0,0H1.072A.572.572,0,0,1,.5,16V12.965A.286.286,0,0,1,.786,12.679Z" fill="#999" opacity="0.5" /></g><g><path d="M15.924,12.679h1.29a.286.286,0,0,1,.286.286V16a.572.572,0,0,1-.572.572h-1.29a0,0,0,0,1,0,0v-3.6A.286.286,0,0,1,15.924,12.679Z" fill="#999" /><path d="M15.924,12.679h1.29a.286.286,0,0,1,.286.286V16a.572.572,0,0,1-.572.572h-1.29a0,0,0,0,1,0,0v-3.6A.286.286,0,0,1,15.924,12.679Z" fill="#999" opacity="0.5" /></g><path d="M8.66,7.163H9.907a0,0,0,0,1,0,0v17a0,0,0,0,1,0,0H8.66a.567.567,0,0,1-.567-.567V7.73A.567.567,0,0,1,8.66,7.163Z" transform="translate(-6.663 24.663) rotate(-90)" fill="#949494" /></g></g></svg>', "sql-database": '<svg id="a96792b7-ce28-4ca3-9767-4e065ef4820f" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="ef16bf9d-a8b6-4181-b6cd-66fc5203f956" x1="2.59" y1="10.16" x2="15.41" y2="10.16" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#005ba1" /><stop offset="0.07" stop-color="#0060a9" /><stop offset="0.36" stop-color="#0071c8" /><stop offset="0.52" stop-color="#0078d4" /><stop offset="0.64" stop-color="#0074cd" /><stop offset="0.82" stop-color="#006abb" /><stop offset="1" stop-color="#005ba1" /></linearGradient><radialGradient id="bf3846c3-4d74-4743-ab9a-f334c248bd92" cx="9.36" cy="10.57" r="7.07" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f2f2f2" /><stop offset="0.58" stop-color="#eee" /><stop offset="1" stop-color="#e6e6e6" /></radialGradient></defs><title>Icon-databases-130</title><path d="M9,5.14c-3.54,0-6.41-1-6.41-2.32V15.18c0,1.27,2.82,2.3,6.32,2.32H9c3.54,0,6.41-1,6.41-2.32V2.82C15.41,4.11,12.54,5.14,9,5.14Z" fill="url(#ef16bf9d-a8b6-4181-b6cd-66fc5203f956)" /><path d="M15.41,2.82c0,1.29-2.87,2.32-6.41,2.32s-6.41-1-6.41-2.32S5.46.5,9,.5s6.41,1,6.41,2.32" fill="#e8e8e8" /><path d="M13.92,2.63c0,.82-2.21,1.48-4.92,1.48S4.08,3.45,4.08,2.63,6.29,1.16,9,1.16s4.92.66,4.92,1.47" fill="#50e6ff" /><path d="M9,3a11.55,11.55,0,0,0-3.89.57A11.42,11.42,0,0,0,9,4.11a11.15,11.15,0,0,0,3.89-.58A11.84,11.84,0,0,0,9,3Z" fill="#198ab3" /><path d="M12.9,11.4V8H12v4.13h2.46V11.4ZM5.76,9.73a1.83,1.83,0,0,1-.51-.31.44.44,0,0,1-.12-.32.34.34,0,0,1,.15-.3.68.68,0,0,1,.42-.12,1.62,1.62,0,0,1,1,.29V8.11a2.58,2.58,0,0,0-1-.16,1.64,1.64,0,0,0-1.09.34,1.08,1.08,0,0,0-.42.89c0,.51.32.91,1,1.21a2.88,2.88,0,0,1,.62.36.42.42,0,0,1,.15.32.38.38,0,0,1-.16.31.81.81,0,0,1-.45.11,1.66,1.66,0,0,1-1.09-.42V12a2.17,2.17,0,0,0,1.07.24,1.88,1.88,0,0,0,1.18-.33A1.08,1.08,0,0,0,6.84,11a1.05,1.05,0,0,0-.25-.7A2.42,2.42,0,0,0,5.76,9.73ZM11,11.32a2.34,2.34,0,0,0,.33-1.26A2.32,2.32,0,0,0,11,9a1.81,1.81,0,0,0-.7-.75,2,2,0,0,0-1-.26,2.11,2.11,0,0,0-1.08.27A1.86,1.86,0,0,0,7.49,9a2.46,2.46,0,0,0-.26,1.14,2.26,2.26,0,0,0,.24,1,1.76,1.76,0,0,0,.69.74,2.06,2.06,0,0,0,1,.3l.86,1h1.21L10,12.08A1.79,1.79,0,0,0,11,11.32ZM10,11.07a.94.94,0,0,1-.76.35.92.92,0,0,1-.76-.36,1.52,1.52,0,0,1-.29-1,1.53,1.53,0,0,1,.29-1,1,1,0,0,1,.78-.37.87.87,0,0,1,.75.37,1.62,1.62,0,0,1,.27,1A1.46,1.46,0,0,1,10,11.07Z" fill="url(#bf3846c3-4d74-4743-ab9a-f334c248bd92)" /></svg>', "sql-managed-instance": '<svg id="a5c93a83-9fd9-4ccb-ba77-53d6c609a7d3" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="acf2da4b-8aca-4b58-b995-ca6956cf663e" x1="5.41" y1="17.33" x2="5.41" y2="0.61" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#949494" /><stop offset="0.53" stop-color="#a2a2a2" /><stop offset="1" stop-color="#b3b3b3" /></linearGradient><linearGradient id="b152b416-25c2-4a4a-9d7f-a0bb2a13f84a" x1="10.04" y1="17.39" x2="10.04" y2="6.82" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.16" stop-color="#1380da" /><stop offset="0.53" stop-color="#3c91e5" /><stop offset="0.82" stop-color="#559cec" /><stop offset="1" stop-color="#5ea0ef" /></linearGradient></defs><title>Icon-databases-136</title><path d="M10.32,16.76a.58.58,0,0,1-.57.57H1.07a.57.57,0,0,1-.57-.57V1.18A.56.56,0,0,1,1.07.61H9.75a.57.57,0,0,1,.57.57Z" fill="url(#acf2da4b-8aca-4b58-b995-ca6956cf663e)" /><path d="M1.94,6.47A1.07,1.07,0,0,1,3,5.41H7.9A1.07,1.07,0,0,1,9,6.47H9A1.07,1.07,0,0,1,7.9,7.54H3A1.07,1.07,0,0,1,1.94,6.47Z" fill="#003067" /><path d="M1.94,3.31A1.07,1.07,0,0,1,3,2.24H7.9A1.07,1.07,0,0,1,9,3.31H9A1.07,1.07,0,0,1,7.9,4.37H3A1.07,1.07,0,0,1,1.94,3.31Z" fill="#003067" /><circle cx="3.06" cy="3.31" r="0.72" fill="#50e6ff" /><circle cx="3.06" cy="6.47" r="0.72" fill="#50e6ff" /><path d="M17.5,14.08a3.36,3.36,0,0,0-2.91-3.22,4.22,4.22,0,0,0-4.35-4A4.32,4.32,0,0,0,6.1,9.64a4,4,0,0,0-3.52,3.85,4.06,4.06,0,0,0,4.2,3.9l.37,0H14l.17,0A3.39,3.39,0,0,0,17.5,14.08Z" fill="url(#b152b416-25c2-4a4a-9d7f-a0bb2a13f84a)" /><path d="M13.61,14.45V11.09h-.93v4.12h2.45v-.76ZM6.51,12.8A2.23,2.23,0,0,1,6,12.49a.44.44,0,0,1-.12-.32.34.34,0,0,1,.15-.3.66.66,0,0,1,.42-.12,1.66,1.66,0,0,1,1,.29v-.86a2.89,2.89,0,0,0-1-.15,1.69,1.69,0,0,0-1.09.33,1.1,1.1,0,0,0-.41.89,1.34,1.34,0,0,0,.94,1.2,2.51,2.51,0,0,1,.61.36.42.42,0,0,1,.15.32.34.34,0,0,1-.15.3.75.75,0,0,1-.45.12,1.63,1.63,0,0,1-1.08-.42v.92A2.25,2.25,0,0,0,6,15.28,1.91,1.91,0,0,0,7.15,15a1.07,1.07,0,0,0,.43-.91,1,1,0,0,0-.25-.7A2.36,2.36,0,0,0,6.51,12.8Zm5.16,1.58A2.37,2.37,0,0,0,12,13.12,2.28,2.28,0,0,0,11.75,12a1.77,1.77,0,0,0-.69-.74A1.94,1.94,0,0,0,10,11,2.21,2.21,0,0,0,9,11.29a1.87,1.87,0,0,0-.73.77A2.52,2.52,0,0,0,8,13.2a2.26,2.26,0,0,0,.24,1.05,1.87,1.87,0,0,0,.68.74,2,2,0,0,0,1,.29l.85,1h1.2l-1.19-1.1A1.82,1.82,0,0,0,11.67,14.38Zm-.93-.25a.92.92,0,0,1-.76.35.91.91,0,0,1-.75-.36,1.5,1.5,0,0,1-.28-1,1.46,1.46,0,0,1,.29-1,.92.92,0,0,1,.77-.37.86.86,0,0,1,.74.37,1.54,1.54,0,0,1,.28,1A1.47,1.47,0,0,1,10.74,14.13Z" fill="#f2f2f2" /></svg>', "sql-server": '<svg id="b1cfe86c-f00b-4507-bce2-50d07e45fe96" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="b39dcf83-187e-4c64-98df-431bb60809d2" x1="0.5" y1="10.04" x2="13.18" y2="10.04" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#005ba1" /><stop offset="0.07" stop-color="#0060a9" /><stop offset="0.36" stop-color="#0071c8" /><stop offset="0.52" stop-color="#0078d4" /><stop offset="0.64" stop-color="#0074cd" /><stop offset="0.82" stop-color="#006abb" /><stop offset="1" stop-color="#005ba1" /></linearGradient></defs><title>Icon-databases-132</title><path d="M6.84,5.09c-3.5,0-6.34-1-6.34-2.3V15c0,1.26,2.79,2.28,6.25,2.3h.09c3.5,0,6.34-1,6.34-2.3V2.79C13.18,4.06,10.34,5.09,6.84,5.09Z" fill="url(#b39dcf83-187e-4c64-98df-431bb60809d2)" /><path d="M13.18,2.79c0,1.27-2.84,2.3-6.34,2.3S.5,4.06.5,2.79,3.34.49,6.84.49s6.34,1,6.34,2.3" fill="#e8e8e8" /><path d="M11.7,2.6c0,.81-2.18,1.46-4.86,1.46S2,3.41,2,2.6,4.16,1.14,6.84,1.14,11.7,1.8,11.7,2.6" fill="#50e6ff" /><path d="M6.84,2.94A12,12,0,0,0,3,3.49a11.25,11.25,0,0,0,3.85.57,11.25,11.25,0,0,0,3.85-.57A12,12,0,0,0,6.84,2.94Z" fill="#198ab3" /><path d="M10.74,11.1V7.72H9.81v4.14h2.46V11.1ZM3.59,9.43a1.92,1.92,0,0,1-.51-.31A.44.44,0,0,1,3,8.8a.38.38,0,0,1,.16-.31.72.72,0,0,1,.42-.11,1.67,1.67,0,0,1,1,.29V7.81a2.67,2.67,0,0,0-1-.16A1.74,1.74,0,0,0,2.38,8a1.13,1.13,0,0,0-.41.9c0,.51.32.91,1,1.21a2.9,2.9,0,0,1,.61.36.4.4,0,0,1,.16.32.38.38,0,0,1-.16.31.75.75,0,0,1-.45.12A1.6,1.6,0,0,1,2,10.77v.93a2.29,2.29,0,0,0,1.07.23,2,2,0,0,0,1.18-.32,1.1,1.1,0,0,0,.43-.92,1,1,0,0,0-.25-.7A2.42,2.42,0,0,0,3.59,9.43ZM8.79,11a2.4,2.4,0,0,0,.33-1.27,2.32,2.32,0,0,0-.25-1.1,1.81,1.81,0,0,0-.7-.75,2,2,0,0,0-1-.26,2.18,2.18,0,0,0-1.09.27,1.87,1.87,0,0,0-.73.77,2.41,2.41,0,0,0-.26,1.15,2.26,2.26,0,0,0,.24,1.05,1.83,1.83,0,0,0,.68.75,2,2,0,0,0,1,.29l.85,1H9.05l-1.2-1.11A1.81,1.81,0,0,0,8.79,11Zm-.93-.26a1,1,0,0,1-1.53,0,1.51,1.51,0,0,1-.28-1,1.48,1.48,0,0,1,.29-1,.92.92,0,0,1,.78-.37.89.89,0,0,1,.75.37,1.62,1.62,0,0,1,.27,1A1.46,1.46,0,0,1,7.86,10.77Z" fill="#f2f2f2" /><path d="M14.81,17.49l.24-.79.47-.27.81.36.52-.53V16.2l-.37-.71.22-.5.81-.29.09,0v-.73l-.1,0-.8-.24-.26-.46.35-.82-.53-.51H16.2l-.71.36L15,12l-.32-.89h-.74l0,.11-.24.79-.51.22-.87-.4-.51.53.05.1.38.74-.2.51L11.1,14v.74l.11,0,.79.24.22.51-.39.86.53.52.09-.05.74-.38.51.2.34.89h.73Zm-1.2-2.36a1.06,1.06,0,1,1,1.49-1.52,1.06,1.06,0,0,1-1.49,1.52Z" fill="#949494" /></svg>', "storage-account": '<svg id="f2f04349-8aee-4413-84c9-a9053611b319" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="ad4c4f96-09aa-4f91-ba10-5cb8ad530f74" x1="9" y1="15.83" x2="9" y2="5.79" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b3b3b3" /><stop offset="0.26" stop-color="#c1c1c1" /><stop offset="1" stop-color="#e6e6e6" /></linearGradient></defs><title>Icon-storage-86</title><path d="M.5,5.79h17a0,0,0,0,1,0,0v9.48a.57.57,0,0,1-.57.57H1.07a.57.57,0,0,1-.57-.57V5.79A0,0,0,0,1,.5,5.79Z" fill="url(#ad4c4f96-09aa-4f91-ba10-5cb8ad530f74)" /><path d="M1.07,2.17H16.93a.57.57,0,0,1,.57.57V5.79a0,0,0,0,1,0,0H.5a0,0,0,0,1,0,0V2.73A.57.57,0,0,1,1.07,2.17Z" fill="#37c2b1" /><path d="M2.81,6.89H15.18a.27.27,0,0,1,.26.27v1.4a.27.27,0,0,1-.26.27H2.81a.27.27,0,0,1-.26-.27V7.16A.27.27,0,0,1,2.81,6.89Z" fill="#fff" /><path d="M2.82,9.68H15.19a.27.27,0,0,1,.26.27v1.41a.27.27,0,0,1-.26.27H2.82a.27.27,0,0,1-.26-.27V10A.27.27,0,0,1,2.82,9.68Z" fill="#37c2b1" /><path d="M2.82,12.5H15.19a.27.27,0,0,1,.26.27v1.41a.27.27,0,0,1-.26.27H2.82a.27.27,0,0,1-.26-.27V12.77A.27.27,0,0,1,2.82,12.5Z" fill="#258277" /></svg>', "synapse": '<svg id="f2f5701e-cb3b-4d6f-b407-5866ec5b7784" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="a891901b-79ae-490a-8568-9c4334417d35" x1="9" y1="5.38" x2="9" gradientUnits="userSpaceOnUse"><stop offset="0.199" stop-color="#005ba1" /><stop offset="1" stop-color="#0078d4" /></linearGradient><linearGradient id="bbdaa009-2281-4da8-9e89-6f41689e91a7" x1="9" y1="12.713" x2="9" y2="5.287" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#198ab3" /><stop offset="0.172" stop-color="#32bedd" /><stop offset="0.5" stop-color="#50e6ff" /><stop offset="0.5" stop-color="#4fe4fd" /><stop offset="0.5" stop-color="#4bddf8" /><stop offset="0.5" stop-color="#44d2ee" /><stop offset="0.5" stop-color="#3ac1e0" /><stop offset="0.5" stop-color="#2dabce" /><stop offset="0.5" stop-color="#1d90b8" /><stop offset="0.5" stop-color="#198ab3" /><stop offset="0.662" stop-color="#32bedd" /><stop offset="0.975" stop-color="#50e6ff" /></linearGradient></defs><path d="M9,0,1.15,4.49v8.97L9,18l7.85-4.49v-9Zm6.4,12.57L9,16.27,2.6,12.609V5.38L9,1.68l6.4,3.71Z" fill="#0078d4" /><polygon points="9 0 9 0 1.15 4.49 2.6 5.38 9 1.68 9 1.68 15.4 5.38 16.85 4.49 9 0" fill="url(#a891901b-79ae-490a-8568-9c4334417d35)" /><path d="M12.74,10.475a.73.73,0,0,0-.323-.286A5.835,5.835,0,0,0,7.939,6.843L14.416,3.1,12.91,2.236,5.534,6.5A.75.75,0,0,0,5.91,7.9.684.684,0,0,0,6,7.877l.125.523a4.319,4.319,0,0,1,4.837,2.238L3.613,14.885l1.5.866L12.466,11.5a.729.729,0,0,0,.242-.236l.075-.018c-.007-.029-.018-.055-.025-.084A.735.735,0,0,0,12.74,10.475Z" fill="#50e6ff" /><path d="M12.091,9.013a1.85,1.85,0,1,0,1.85,1.85A1.85,1.85,0,0,0,12.091,9.013ZM5.909,5.267a1.85,1.85,0,1,0,1.85,1.85A1.85,1.85,0,0,0,5.909,5.267Z" fill="url(#bbdaa009-2281-4da8-9e89-6f41689e91a7)" /></svg>', "traffic-manager": '<svg id="a18b905d-93c6-4fee-ba5b-699e2562e00f" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="b02c7a20-01da-4daf-91b9-e11528418dfc" x1="9" y1="17.5" x2="9" y2="0.5" gradientUnits="userSpaceOnUse"><stop offset="0.16" stop-color="#6f4bb2" /><stop offset="0.32" stop-color="#7450b5" /><stop offset="0.51" stop-color="#825dbf" /><stop offset="0.72" stop-color="#9a72ce" /><stop offset="0.94" stop-color="#bb90e4" /><stop offset="1" stop-color="#c69aeb" /></linearGradient></defs><title>Icon-networking-65</title><path d="M12.29.5H5.71a.56.56,0,0,0-.4.17L.67,5.31a.56.56,0,0,0-.17.4v6.58a.56.56,0,0,0,.17.4l4.64,4.64a.56.56,0,0,0,.4.17h6.58a.56.56,0,0,0,.4-.17l4.64-4.64a.56.56,0,0,0,.17-.4V5.71a.56.56,0,0,0-.17-.4L12.69.67A.56.56,0,0,0,12.29.5Z" fill="url(#b02c7a20-01da-4daf-91b9-e11528418dfc)" /><path d="M6,7.64l-.07.07-1,1a.14.14,0,0,0,.1.23h3.8a.14.14,0,0,0,.14-.14V5.05A.14.14,0,0,0,8.64,5l-1,1-.07.07a.15.15,0,0,1-.2,0L4.8,3.54,3.43,4.92,6,7.44A.15.15,0,0,1,6,7.64Z" fill="#f2f2f2" /><path d="M16.18,5.91,12.09,1.82a.28.28,0,0,0-.2-.08H6.11a.28.28,0,0,0-.2.08L1.82,5.91a.28.28,0,0,0-.08.2v5.78a.3.3,0,0,0,.08.2l4.09,4.09a.28.28,0,0,0,.2.08h5.78a.28.28,0,0,0,.2-.08l4.09-4.09a.3.3,0,0,0,.08-.2V6.11A.28.28,0,0,0,16.18,5.91Zm-.36,5.45L12.67,8.21l.76-.77a.16.16,0,0,0,0-.24.16.16,0,0,0-.11,0l-2.71-.07a.17.17,0,0,0-.17.16h0L10.51,10a.16.16,0,0,0,.17.16h0a.13.13,0,0,0,.12,0l.85-.84L15,12.62l-2.54,2.54L9,11.71,9.8,11a.16.16,0,0,0,0-.24.16.16,0,0,0-.11-.05L7,10.59a.17.17,0,0,0-.17.16h0l.07,2.71a.16.16,0,0,0,.17.16h0a.17.17,0,0,0,.12-.05L8,12.74l3.08,3.08H6.17l-4-4V6.17L3.43,4.92,4.8,3.54,6.17,2.17h5.66l4,4Z" fill="#f2f2f2" /></svg>', "vm": '<svg id="fd454f1c-5506-44b8-874e-8814b8b2f70b" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="f34d9569-2bd0-4002-8f16-3d01d8106cb5" x1="8.88" y1="12.21" x2="8.88" y2="0.21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0078d4" /><stop offset="0.82" stop-color="#5ea0ef" /></linearGradient><linearGradient id="bdb45a0b-eb58-4970-a60a-fb2ce314f866" x1="8.88" y1="16.84" x2="8.88" y2="12.21" gradientUnits="userSpaceOnUse"><stop offset="0.15" stop-color="#ccc" /><stop offset="1" stop-color="#707070" /></linearGradient></defs><title>Icon-compute-21</title><rect x="-0.12" y="0.21" width="18" height="12" rx="0.6" fill="url(#f34d9569-2bd0-4002-8f16-3d01d8106cb5)" /><polygon points="11.88 4.46 11.88 7.95 8.88 9.71 8.88 6.21 11.88 4.46" fill="#50e6ff" /><polygon points="11.88 4.46 8.88 6.22 5.88 4.46 8.88 2.71 11.88 4.46" fill="#c3f1ff" /><polygon points="8.88 6.22 8.88 9.71 5.88 7.95 5.88 4.46 8.88 6.22" fill="#9cebff" /><polygon points="5.88 7.95 8.88 6.21 8.88 9.71 5.88 7.95" fill="#c3f1ff" /><polygon points="11.88 7.95 8.88 6.21 8.88 9.71 11.88 7.95" fill="#9cebff" /><path d="M12.49,15.84c-1.78-.28-1.85-1.56-1.85-3.63H7.11c0,2.07-.06,3.35-1.84,3.63a1,1,0,0,0-.89,1h9A1,1,0,0,0,12.49,15.84Z" fill="url(#bdb45a0b-eb58-4970-a60a-fb2ce314f866)" /></svg>', "vnet": '<svg id="a1606a52-fb14-4637-87de-4d524bba1829" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="f020fb7e-2243-4501-8153-5d69bd3c34f7" x1="9.88" y1="8.59" x2="11.52" y2="10.23" gradientTransform="translate(2.03 -0.4) rotate(-0.08)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#86d633" /><stop offset="1" stop-color="#5e9624" /></linearGradient><linearGradient id="b3c2bc94-8c7c-48a2-9719-6ee899a43a97" x1="6.18" y1="8.59" x2="7.81" y2="10.23" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#86d633" /><stop offset="1" stop-color="#5e9624" /></linearGradient><linearGradient id="e900c35d-0958-4d4f-b28f-302eeaaf52f5" x1="2.48" y1="8.59" x2="4.11" y2="10.23" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#86d633" /><stop offset="1" stop-color="#5e9624" /></linearGradient></defs><title>Icon-networking-61</title><circle cx="12.74" cy="8.99" r="1.16" fill="url(#f020fb7e-2243-4501-8153-5d69bd3c34f7)" /><circle cx="9.04" cy="9" r="1.16" fill="url(#b3c2bc94-8c7c-48a2-9719-6ee899a43a97)" /><circle cx="5.34" cy="9" r="1.16" fill="url(#e900c35d-0958-4d4f-b28f-302eeaaf52f5)" /><path d="M2.61,7.28h.94a.3.3,0,0,1,.3.3v6.94a.6.6,0,0,1-.6.6H2.31a0,0,0,0,1,0,0V7.58a.3.3,0,0,1,.3-.3Z" transform="translate(13.18 16.93) rotate(134.92)" fill="#50e6ff" /><path d="M2.56,2.91H3.5a.3.3,0,0,1,.3.3v7.43a0,0,0,0,1,0,0H2.86a.6.6,0,0,1-.6-.6V3.21a.3.3,0,0,1,.3-.3Z" transform="translate(5.66 -0.16) rotate(44.92)" fill="#1490df" /><path d="M14.15,7.28h.94a.6.6,0,0,1,.6.6v6.94a.3.3,0,0,1-.3.3h-.94a.3.3,0,0,1-.3-.3V7.28a0,0,0,0,1,0,0Z" transform="translate(12.32 -7.28) rotate(45.08)" fill="#50e6ff" /><path d="M14.81,2.91h.94a0,0,0,0,1,0,0v7.43a.3.3,0,0,1-.3.3H14.5a.3.3,0,0,1-.3-.3V3.51a.6.6,0,0,1,.6-.6Z" transform="translate(30.36 0.99) rotate(135.08)" fill="#1490df" /></svg>' };
var r = createRenderer(ICONS);
var render = r.render;
var forPath = r.forPath;
export {
  ICONS,
  createRenderer,
  forPath,
  render
};
