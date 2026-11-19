/** The JSON spec a contributor edits. Everything drawn comes from here; no model runs. */

export interface Item {
  /** Icon name from icons/manifest.json. Leave out for a plain box (used only where no official icon exists). */
  icon?: string;
  label: string;
}

export interface OverviewSpec {
  template: "overview";
  service: Item;
  /** Short chips for the three failures the wizard asks about. */
  asks?: string[];
}

export interface ZoneSpec {
  template: "zone";
  /** Drawn once in each zone. */
  items: Item[];
  zones?: 2 | 3;
  /** Label on the arrow between zones, for example "Synchronous replication". */
  link?: string;
  /** Short note under the region box, for example "Zone redundant by default". */
  badge?: string;
}

export interface RegionSpec {
  template: "region";
  primary: Item[];
  secondary: Item[];
  /** A traffic router above both regions; its failover arrow to the secondary is red and dashed. */
  router?: Item;
  /** Label on the arrow between the regions. Leave out for no arrow. */
  link?: string;
  /**
   * standby: greyed, as Microsoft draws a recovery side; readable: not greyed, one-way copy;
   * live: both sides active, two-way; restore: created on demand, dashed.
   */
  secondaryKind?: "standby" | "readable" | "live" | "restore";
  primaryTitle?: string;
  secondaryTitle?: string;
  failoverLabel?: string;
}

export interface BackupSpec {
  template: "backup";
  source: Item[];
  vault: Item;
  /** Label on the arrow into the vault. */
  backupLabel?: string;
  restoreLabel?: string;
  /** Small boxes under the vault, for example "Soft delete". */
  features?: string[];
  /** An extra approver in front of the vault, for example Resource Guard. */
  guard?: Item;
  guardLabel?: string;
  /** Draw no restore arrow (for example when the data is only kept, not restored by the service). */
  noRestore?: boolean;
}

/** A free-form area: a region, a network, a zone, a server. Drawn first, in array order, so list parents before children. */
export interface SceneGroup {
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** outline: white, thin black; blue: active panel; grey: standby or not in use; vnet: dashed blue network boundary; dashed: dashed black scope. */
  kind?: "outline" | "blue" | "grey" | "vnet" | "dashed";
  titleSize?: number;
  titleAnchor?: "start" | "middle";
}

/** A thing at a fixed place. With an icon it is drawn as the official icon and its name; with box it is a plain labelled box. */
export interface SceneNode {
  id: string;
  /** Centre of the icon or box. */
  x: number;
  y: number;
  icon?: string;
  label: string;
  box?: { w: number; h: number };
  grey?: boolean;
  maxChars?: number;
}

export interface SceneEdge {
  /** Node ids. The line starts and ends at the node edge. `via` gives the bends between them. */
  from?: string;
  to?: string;
  via?: [number, number][];
  /** Exact points instead of from, to and via. */
  points?: [number, number][];
  label?: string;
  labelAt?: [number, number];
  labelAnchor?: "start" | "middle" | "end";
  dashed?: boolean;
  red?: boolean;
  /** A head at each end. */
  both?: boolean;
  /** A green numbered circle, explained by the same-numbered note. */
  n?: number;
  nAt?: [number, number];
}

export interface SceneSpec {
  template: "scene";
  width: number;
  height: number;
  groups: SceneGroup[];
  nodes: SceneNode[];
  edges: SceneEdge[];
  /** Notes under the drawing, one per numbered circle, in order. */
  notes?: string[];
}

export type Spec = OverviewSpec | ZoneSpec | RegionSpec | BackupSpec | SceneSpec;

export interface DiagramEntry {
  title: string;
  /** One sentence for screen readers. */
  alt: string;
  spec: Spec;
}

export interface SpecFile {
  version: 1;
  diagrams: Record<string, DiagramEntry>;
  /** Tree node id to diagram id. */
  nodes: Record<string, string>;
}

export interface DiagramsJson {
  version: 1;
  diagrams: Record<string, { file: string; title: string; alt: string }>;
  nodes: Record<string, string>;
}

export interface IconFile {
  pack: string;
  source: string;
  file: string;
  label: string;
}
