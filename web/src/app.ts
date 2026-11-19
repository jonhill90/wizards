import { walk, WalkError, type Position, type Source, type Tree } from "./evaluator.js";
import { answerFor, formatShape, optionsFor, parseShape, resolveShape, type DrawParams, type Region, type RegionsFile, type ShapeAnswers } from "./shape.js";

// Which wizard: ?w=<slug>, default azure-resiliency. Trees and diagram specs are read from the repository root.
const slug = new URLSearchParams(location.search).get("w") ?? "azure-resiliency";
const base = `../wizards/${encodeURIComponent(slug)}`;

// Fluent UI Web Components (Microsoft, MIT) supply the controls and theme tokens; the diagram generator in
// tools/diagrams draws the picture live. Both load as plain ES modules from the repository, no bundler.
const FLUENT = new URL("../node_modules/@fluentui/web-components/dist/web-components-all.min.js", import.meta.url).href;
const TOKENS = new URL("../node_modules/@fluentui/tokens/lib/index.js", import.meta.url).href;
const DIAGRAMS = new URL("../../tools/diagrams/web/diagrams.mjs", import.meta.url).href;

interface DiagramApi {
  forPath(spec: unknown, path: readonly string[], o?: { animate?: boolean; params?: DrawParams }): { id: string; title: string; alt: string; svg: string; fromNode: string } | null;
}
interface Ui { light: Record<string, string | number>; dark: Record<string, string | number> }

const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Attrs = Record<string, string | boolean | undefined>;
function h(tag: string, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) node.append(k);
  return node;
}
const text = (s: string, size = "300", weight = "regular", extra: Attrs = {}): HTMLElement =>
  h("fluent-text", { block: true, size, weight, ...extra }, s);
// A real heading element (so assistive technology sees the outline) that wraps the Fluent text styling.
const heading = (tag: "h1" | "h2", s: string, size: string, id: string): HTMLElement =>
  h(tag, { id, class: "heading" }, h("fluent-text", { block: true, size, weight: "semibold" }, s));

// One authored check mark (24 grid, 2px round stroke) in place of a text glyph.
function checkIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "14"); svg.setAttribute("height", "14"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 12.5l4.5 4.5L19 7.5"); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.5"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg as unknown as SVGElement;
}

function readAnswers(): string[] {
  const m = /(?:^#|&)a=([^&]*)/.exec(location.hash);
  const raw = m?.[1];
  return raw ? decodeURIComponent(raw).split(",").filter(Boolean) : [];
}
function readShapeAnswers(): ShapeAnswers {
  const m = /(?:^#|&)s=([^&]*)/.exec(location.hash);
  return parseShape(m?.[1] ? decodeURIComponent(m[1]) : undefined);
}
function hashFor(answers: string[], shape: ShapeAnswers): string {
  const parts: string[] = [];
  if (answers.length) parts.push(`a=${encodeURIComponent(answers.join(","))}`);
  const sh = formatShape(shape);
  if (sh) parts.push(`s=${encodeURIComponent(sh)}`);
  return parts.join("&");
}
/** A new walk position: answering a question moves on and drops shape answers, which belong to one result. */
function writeAnswers(answers: string[]): void {
  location.hash = hashFor(answers, {});
}
/** A shape answer changes the drawing only: the address is rewritten without a page render. */
function writeShape(answers: string[], shape: ShapeAnswers): void {
  history.replaceState(null, "", `${location.pathname}${location.search}${hashFor(answers, shape) ? "#" + hashFor(answers, shape) : ""}`);
}
async function loadJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}
function savedTheme(): "light" | "dark" {
  try { const v = localStorage.getItem("wizard-theme"); if (v === "light" || v === "dark") return v; } catch { /* storage may be blocked */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Windows motion: Direct Entrance, 250 ms, cubic-bezier(0,0,0,1) (learn.microsoft.com/windows/apps/design/signature-experiences/motion). */
function enter(node: Element, dy = 12): void {
  if (reduced()) return;
  node.animate([{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: "none" }], { duration: 250, easing: "cubic-bezier(0,0,0,1)", fill: "backwards" });
}

function sourcesBody(sources: Source[]): HTMLElement {
  const wrap = h("div", { class: "quotes" });
  for (const s of sources) {
    wrap.append(h("blockquote", {}, `“${s.quote}”`, h("footer", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title), ` · read ${s.retrieved}`)));
  }
  return wrap;
}
function item(heading: string, body: Node, expanded = false): HTMLElement {
  return h("fluent-accordion-item", { expanded }, h("span", { slot: "heading" }, heading), body);
}
function list(items: string[]): HTMLElement {
  const ul = h("ul", { class: "plain" });
  for (const i of items) ul.append(h("li", {}, i));
  return ul;
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  const [wc, tokens, dg] = await Promise.all([
    import(FLUENT).catch(() => null),
    import(TOKENS).catch(() => null),
    import(DIAGRAMS).catch(() => null),
  ]) as [Record<string, unknown> | null, Record<string, unknown> | null, DiagramApi | null];
  const ui: Ui | null = wc && tokens ? { light: tokens.webLightTheme as Ui["light"], dark: tokens.webDarkTheme as Ui["dark"] } : null;
  let theme = savedTheme();
  // Same effect as the library's setTheme(): the theme's tokens become CSS custom properties on the page.
  const applyTheme = (): void => {
    if (ui) for (const [k, v] of Object.entries(theme === "dark" ? ui.dark : ui.light)) document.documentElement.style.setProperty(`--${k}`, String(v));
    document.documentElement.dataset.theme = theme;
  };
  applyTheme();

  const [tree, spec, regionsFile] = await Promise.all([loadJson<Tree>(`${base}/tree.json`), loadJson<{ nodes: Record<string, string> }>(`${base}/diagrams/diagrams.spec.json`), loadJson<RegionsFile>(`${base}/regions.json`)]);
  const regions: Region[] = regionsFile?.regions ?? [];
  if (!tree) { root.replaceChildren(h("fluent-message-bar", { intent: "error", class: "error" }, `Could not load the wizard "${slug}". Check the name in the address, or `, h("a", { href: "?w=azure-resiliency" }, "open the Azure resiliency wizard"), ".")); return; }
  document.title = `${tree.title} · wizard`;

  // Header
  const dark = h("fluent-switch", { id: "theme", checked: theme === "dark" });
  dark.addEventListener("change", () => {
    theme = (dark as unknown as { checked: boolean }).checked ? "dark" : "light";
    try { localStorage.setItem("wizard-theme", theme); } catch { /* ignore */ }
    applyTheme();
  });
  const header = h("header", { class: "top" },
    h("div", { class: "title" }, heading("h1", tree.title, "600", "title"),
      text("Answer a few plain questions. The same answers always give the same result; no AI runs.", "300", "regular", { class: "subtle" })),
    h("div", { class: "tools" }, h("fluent-badge", { appearance: "tint", color: "brand" }, "Temporary front end"), h("label", { class: "switch" }, "Dark", dark)));

  const ribbon = h("ol", { class: "ribbon", "aria-label": "Your answers", id: "ribbon" });
  const content = h("div", { class: "content", id: "panel", "aria-live": "polite", tabindex: "-1" });
  const nav = h("div", { class: "nav" });
  const left = h("section", { class: "card left" }, ribbon, content, nav);

  const canvas = h("div", { class: "canvas", id: "diagram", tabindex: "0", role: "group", "aria-label": "Diagram. On a narrow screen, scroll sideways to see all of it." });
  const caption = h("figcaption", { class: "caption" });
  const right = h("figure", { class: "card right" }, canvas, caption);
  root.replaceChildren(header, h("main", { class: "grid" }, left, right));

  let shownCount = 0;
  let shownDiagram = "";

  function renderRibbon(pos: Position): void {
    const done = pos.steps.length;
    ribbon.replaceChildren();
    pos.steps.forEach((s, i) => {
      const li = h("li", { class: "done" }, h("span", { class: "num", "aria-hidden": "true" }, String(i + 1)), h("span", { class: "lbl" }, s.label));
      if (i >= shownCount) enter(li, 8);
      ribbon.append(li);
    });
    const last = h("li", { class: pos.node.type === "result" ? "now final" : "now" }, h("span", { class: "num", "aria-hidden": "true" }, pos.node.type === "result" ? checkIcon() : String(done + 1)), h("span", { class: "lbl" }, pos.node.type === "result" ? "Your answer" : "You are here"));
    enter(last, 8);
    ribbon.append(last);
    shownCount = done;
  }

  /** The shape step on a result: sizing questions that change the drawing and nothing else. */
  function shapePanel(pos: Position, answers: string[]): HTMLElement | null {
    const node = pos.node;
    const shape = node.type === "result" && node.shape ? tree?.shapes?.[node.shape] : undefined;
    if (!shape || regions.length === 0) return null;
    const wrap = h("section", { class: "shape", "aria-labelledby": "shape-title" });
    wrap.append(heading("h2", "Shape the drawing", "400", "shape-title"),
      text("These answers change the picture, not the advice. The same answers always give the same drawing.", "200", "regular", { class: "subtle" }));
    const status = h("div", { class: "shape-notes", "aria-live": "polite" });
    const refresh = (): void => {
      const r = resolveShape(shape, regions, readShapeAnswers());
      status.replaceChildren(...r.notes.map((n) => h("fluent-message-bar", { intent: "info", shape: "square", class: "note" }, n)));
    };
    const fields = h("div", { class: "shape-fields" });
    const build = (): void => {
      const current = readShapeAnswers();
      fields.replaceChildren();
      for (const q of shape.questions) {
        const id = `shape-${q.id}`;
        const sel = h("select", { id, "data-shape": q.id, class: "shape-select" });
        const picked = answerFor(q, regions, current);
        sel.append(h("option", { value: "" }, q.kind === "second-region" || q.kind === "region" ? "Not chosen: use the default drawing" : "Use the default drawing"));
        for (const o of optionsFor(q, regions, current)) {
          const opt = h("option", { value: o.id }, o.label);
          if (picked === o.id) opt.setAttribute("selected", "");
          sel.append(opt);
        }
        if (picked === undefined) (sel as HTMLSelectElement).value = "";
        sel.addEventListener("change", () => {
          const next = { ...readShapeAnswers() };
          const v = (sel as HTMLSelectElement).value;
          if (v) next[q.id] = v; else delete next[q.id];
          writeShape(answers, next);
          build(); refresh();
          void renderDiagram(pos);
        });
        const field = h("div", { class: "shape-field" }, h("label", { for: id, class: "shape-label" }, q.text), sel);
        if (q.help) field.append(h("span", { class: "subtle small" }, q.help));
        fields.append(field);
      }
    };
    build(); refresh();
    const srcs = shape.questions.flatMap((q) => q.sources);
    wrap.append(fields, status, h("fluent-accordion", { class: "sources" }, item(`Sources for these questions (${srcs.length})`, sourcesBody(srcs))));
    return wrap;
  }

  function renderContent(pos: Position, answers: string[]): void {
    content.replaceChildren();
    const node = pos.node;
    if (node.type === "question") {
      content.append(heading("h2", node.text, "500", "question"));
      if (node.help) content.append(text(node.help, "300", "regular", { class: "subtle help" }));
      const opts = h("div", { class: "options", role: "group", "aria-labelledby": "question" });
      for (const o of node.options) {
        const b = h("fluent-button", { appearance: "outline", size: "large", "data-option": o.id }, o.label);
        b.addEventListener("click", () => writeAnswers([...answers, o.id]));
        opts.append(b);
      }
      content.append(opts, h("fluent-accordion", { class: "sources" }, item(`Sources (${node.sources.length})`, sourcesBody(node.sources))));
    } else {
      content.append(heading("h2", node.title, "500", "result-title"), h("fluent-message-bar", { intent: "success", shape: "square", class: "summary" }, node.summary));
      const sp = shapePanel(pos, answers);
      if (sp) content.append(sp);
      const acc = h("fluent-accordion", { class: "sources" });
      if (node.actions.length) acc.append(item("What to do", list(node.actions), true));
      if (node.caveats.length) acc.append(item("Keep in mind", list(node.caveats), true));
      acc.append(item(`Sources (${node.sources.length})`, sourcesBody(node.sources)));
      content.append(acc);
    }
    enter(content);

    nav.replaceChildren();
    if (answers.length === 0) return; // nothing to go back to: no disabled buttons for assistive technology to trip on
    const back = h("fluent-button", { appearance: "subtle", id: "back" }, "Back");
    back.addEventListener("click", () => writeAnswers(answers.slice(0, -1)));
    const restart = h("fluent-button", { appearance: "subtle", id: "restart" }, "Start over");
    restart.addEventListener("click", () => writeAnswers([]));
    nav.append(back, restart);
  }

  function currentParams(pos: Position): DrawParams {
    const node = pos.node;
    const shape = node.type === "result" && node.shape ? tree?.shapes?.[node.shape] : undefined;
    return shape ? resolveShape(shape, regions, readShapeAnswers()).params : {};
  }

  async function renderDiagram(pos: Position): Promise<void> {
    const params = currentParams(pos);
    const pick = spec && dg ? dg.forPath(spec, pos.path, { animate: true, params }) : null;
    if (!pick) {
      shownDiagram = "";
      canvas.replaceChildren(h("p", { class: "placeholder", id: "diagram-placeholder" }, "Your diagram builds here as you answer. Pick an option on the left to begin."));
      caption.replaceChildren();
      return;
    }
    const key = `${pick.id}|${JSON.stringify(params)}`;
    if (key === shownDiagram) return;
    const sameDiagram = shownDiagram.startsWith(`${pick.id}|`);
    shownDiagram = key;
    const old = canvas.firstElementChild;
    if (old && !sameDiagram && !reduced()) await old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 83, easing: "linear", fill: "forwards" }).finished.catch(() => undefined);
    if (shownDiagram !== key) return; // a newer step already replaced it
    const svg = document.importNode(new DOMParser().parseFromString(pick.svg, "image/svg+xml").documentElement, true) as unknown as SVGSVGElement;
    svg.removeAttribute("width"); svg.removeAttribute("height");
    const holder = h("div", { class: "drawing", "data-diagram": pick.id, "data-mode": "live" });
    holder.append(svg);
    canvas.replaceChildren(holder);
    const full = h("fluent-button", { appearance: "subtle", id: "fullsize" }, "Open full size");
    full.addEventListener("click", () => {
      const vb = svg.viewBox.baseVal;
      const big = svg.cloneNode(true) as SVGSVGElement;
      big.setAttribute("width", String(vb.width)); big.setAttribute("height", String(vb.height));
      const dlg = document.createElement("dialog");
      dlg.className = "fullsize"; dlg.setAttribute("aria-label", pick.title);
      const close = h("fluent-button", { appearance: "primary", id: "fullsize-close" }, "Close");
      close.addEventListener("click", () => { dlg.close(); dlg.remove(); });
      dlg.addEventListener("close", () => dlg.remove());
      dlg.append(close, h("div", { class: "fullsize-body" }, big));
      document.body.append(dlg);
      dlg.showModal();
    });
    caption.replaceChildren(text(pick.title + (pick.fromNode === pos.nodeId ? "" : " (from an earlier step)"), "300", "semibold"),
      h("span", { class: "subtle small" }, "Drawn in your browser from the diagram spec, in Microsoft Architecture Center style."), full);
  }

  const render = (): void => {
    const answers = readAnswers();
    let pos: Position;
    try { pos = walk(tree, answers); } catch (e) { if (e instanceof WalkError) { writeAnswers([]); return; } throw e; }
    renderRibbon(pos);
    renderContent(pos, answers);
    void renderDiagram(pos);
    (content.querySelector<HTMLElement>("[data-option]") ?? content).focus({ preventScroll: true });
  };
  window.addEventListener("hashchange", render);
  render();
}

void main();
