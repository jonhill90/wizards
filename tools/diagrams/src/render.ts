import type { DiagramEntry, Spec } from "./model.js";
import type { IconSource } from "./iconparse.js";
import { draw } from "./templates.js";

/** Sentences about structure, lines and colour that the author's alt text does not repeat. */
export function legend(s: Spec): string {
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
      if (kind === "standby" || kind === "restore") parts.push("The right box and its items are drawn in grey because they are not in use until needed.");
      if (s.link) parts.push(`A black arrow between them is labelled ${s.link}${kind === "live" ? ", with a head at each end" : ""}, and carries a green numbered circle.`);
      if (s.router) parts.push(kind === "live" ? "A router box above sends a black arrow to each region." : `A router box above sends a black arrow to the primary region and a red dashed arrow, labelled ${s.failoverLabel ?? "Failover"}, to the secondary region.`);
      return parts.join(" ");
    }
    case "backup":
      return `A box labelled Protected data is on the left and a box labelled Backup is on the right. A solid black arrow labelled ${s.backupLabel ?? "Backup"} points right, marked with a green circle numbered 1.${s.noRestore ? "" : ` A dashed black arrow labelled ${s.restoreLabel ?? "Restore"} points back left, marked 2.`}${s.features?.length ? " Grey bars inside the right box give the features." : ""}`;
    case "scene": {
      const titles = s.groups.map((g) => g.title).filter((t): t is string => !!t);
      const labels = s.edges.map((e) => e.label).filter((t): t is string => !!t);
      return `A free-form drawing with ${s.groups.length} outlined areas${titles.length ? `: ${titles.join("; ")}` : ""}. It holds ${s.nodes.length} labelled items joined by ${s.edges.length} black arrows; dashed arrows are optional, standby or asynchronous paths.${labels.length ? ` Arrow labels: ${labels.join("; ")}.` : ""}${s.notes?.length ? " Green numbered circles on arrows match the numbered notes under the drawing." : ""}`;
    }
    default: {
      const never: never = s;
      throw new Error(`unknown template ${JSON.stringify(never)}`);
    }
  }
}

/** Draw one diagram to a self-contained SVG string. Same input, same bytes. */
export function renderDiagram(entry: DiagramEntry, icons: IconSource, opts: { animate?: boolean } = {}): string {
  return draw(entry.spec, icons, opts.animate ?? false).svg(entry.title, `${entry.alt} ${legend(entry.spec)}`);
}
