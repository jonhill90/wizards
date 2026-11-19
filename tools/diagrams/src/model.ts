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

export type Spec = OverviewSpec | ZoneSpec | RegionSpec | BackupSpec;

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
