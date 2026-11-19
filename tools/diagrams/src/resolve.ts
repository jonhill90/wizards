import type { DrawParams, Spec } from "./model.js";
import { mabsScene, sqlVmScene } from "./scenes.js";

const repeat = <T,>(items: T[], n: number | undefined): T[] =>
  n && n > 1 ? items.flatMap((i) => Array.from({ length: n }, () => i)) : items;

/** Apply a person's shape answers to a spec, giving the spec that is drawn. Pure: the same inputs give the same output. */
export function resolveSpec(spec: Spec, p: DrawParams = {}): Spec {
  switch (spec.template) {
    case "zone":
      return {
        ...spec,
        regionName: p.primaryName ?? spec.regionName,
        zones: p.zones === 2 || p.zones === 3 ? p.zones : spec.zones,
        items: repeat(spec.items, p.instances),
      };
    case "region":
      return {
        ...spec,
        primaryTitle: p.primaryName ? `${p.primaryName} (primary)` : spec.primaryTitle,
        secondaryTitle: p.secondaryName ? `${p.secondaryName} (secondary)` : spec.secondaryTitle,
        primary: repeat(spec.primary, p.instances),
        secondary: repeat(spec.secondary, p.instances),
      };
    case "scene-fn":
      return spec.scene === "sql-vm-ha-dr"
        ? sqlVmScene(p, { twoRegion: spec.defaults?.twoRegion ?? false })
        : mabsScene(p, { kind: spec.defaults?.kind ?? "vmware" });
    default:
      return spec;
  }
}
