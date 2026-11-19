/** Browser-safe part of the icon code: no file access. */
export interface Icon {
  /** Width and height in the icon's own units. */
  w: number;
  h: number;
  viewBox: string;
  /** Contents of the icon's <svg>, with its <defs> kept. */
  body: string;
}

export type IconSource = (name: string) => Icon;

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

