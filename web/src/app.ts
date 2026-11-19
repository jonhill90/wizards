import { walk, WalkError, type Position, type Source, type Tree } from "./evaluator.js";
import { pickDiagram, type DiagramManifest } from "./diagrams.js";

// The wizard to show: ?w=<slug>, default azure-resiliency. Trees and diagrams are read from the repository root.
const slug = new URLSearchParams(location.search).get("w") ?? "azure-resiliency";
const base = `../wizards/${encodeURIComponent(slug)}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const k of kids) node.append(k);
  return node;
}

function sourcesBlock(sources: Source[]): HTMLElement {
  const details = el("details", { class: "sources" }, el("summary", {}, `Sources (${sources.length})`));
  for (const s of sources) {
    details.append(el("blockquote", {}, `“${s.quote}”`, el("footer", {}, el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title), ` · read ${s.retrieved}`)));
  }
  return details;
}

function list(items: string[]): HTMLElement {
  const ul = el("ul");
  for (const i of items) ul.append(el("li", {}, i));
  return ul;
}

function readAnswers(): string[] {
  const m = /(?:^#|&)a=([^&]*)/.exec(location.hash);
  const raw = m?.[1];
  return raw ? decodeURIComponent(raw).split(",").filter(Boolean) : [];
}
function writeAnswers(answers: string[]): void {
  location.hash = answers.length ? `a=${encodeURIComponent(answers.join(","))}` : "";
}

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

function renderDiagram(host: HTMLElement, manifest: DiagramManifest | null, pos: Position): void {
  host.replaceChildren();
  const choice = pickDiagram(manifest, pos.path);
  if (!choice) {
    host.append(el("p", { class: "placeholder", id: "diagram-placeholder" }, "No diagram for this step yet. Diagrams appear here as the wizard gets them."));
    return;
  }
  const img = el("img", { src: `${base}/diagrams/${choice.entry.file}`, alt: choice.entry.alt });
  img.dataset.diagram = choice.id;
  host.append(img, el("p", { class: "caption" }, choice.entry.title + (choice.fromNode === pos.nodeId ? "" : " (from an earlier step)")));
}

function renderPanel(host: HTMLElement, tree: Tree, pos: Position, answers: string[]): void {
  host.replaceChildren();
  const trail = el("ol", { class: "trail", ariaLabel: "Your answers" } as Partial<HTMLOListElement>);
  for (const s of pos.steps) trail.append(el("li", {}, el("span", { class: "q" }, s.question), " ", el("strong", {}, s.label)));
  if (pos.steps.length) host.append(trail);

  const node = pos.node;
  if (node.type === "question") {
    host.append(el("h2", { id: "question" }, node.text));
    if (node.help) host.append(el("p", { class: "help" }, node.help));
    const opts = el("div", { class: "options", role: "group" });
    for (const o of node.options) {
      const b = el("button", { type: "button", class: "option" }, o.label);
      b.dataset.option = o.id;
      b.addEventListener("click", () => writeAnswers([...answers, o.id]));
      opts.append(b);
    }
    host.append(opts, sourcesBlock(node.sources));
  } else {
    host.append(el("h2", { id: "result-title" }, node.title), el("p", { class: "summary" }, node.summary));
    if (node.actions.length) host.append(el("h3", {}, "What to do"), list(node.actions));
    if (node.caveats.length) host.append(el("h3", {}, "Keep in mind"), list(node.caveats));
    host.append(sourcesBlock(node.sources));
  }

  const nav = el("div", { class: "nav" });
  const back = el("button", { type: "button", id: "back", disabled: answers.length === 0 }, "Back");
  back.addEventListener("click", () => writeAnswers(answers.slice(0, -1)));
  const restart = el("button", { type: "button", id: "restart", disabled: answers.length === 0 }, "Start over");
  restart.addEventListener("click", () => writeAnswers([]));
  nav.append(back, restart);
  host.append(nav);
}

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) return;
  const [tree, manifest] = await Promise.all([loadJson<Tree>(`${base}/tree.json`), loadJson<DiagramManifest>(`${base}/diagrams/diagrams.json`)]);
  if (!tree) { app.replaceChildren(el("p", { class: "error" }, `Could not load the wizard "${slug}".`)); return; }
  document.title = `${tree.title} · wizard`;
  document.getElementById("title")!.textContent = tree.title;

  const panel = el("section", { class: "panel", id: "panel", ariaLive: "polite" } as Partial<HTMLElement>);
  const figure = el("figure", { class: "diagram", id: "diagram" });
  app.replaceChildren(panel, figure);

  const render = (): void => {
    const answers = readAnswers();
    let pos: Position;
    try { pos = walk(tree, answers); }
    catch (e) {
      if (e instanceof WalkError) { writeAnswers([]); return; }
      throw e;
    }
    renderPanel(panel, tree, pos, answers);
    renderDiagram(figure, manifest, pos);
    document.getElementById("progress")!.textContent = pos.node.type === "question" ? `Question ${pos.steps.length + 1}` : "Answer";
    (panel.querySelector<HTMLElement>(".option, #restart") ?? panel).focus({ preventScroll: true });
  };
  window.addEventListener("hashchange", render);
  render();
}

void main();
