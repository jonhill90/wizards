/**
 * Detailed scenes drawn by code from a person's answers. Same answers, same drawing: no clock, no randomness, no model.
 * Every sentence in a note states only what a Microsoft Learn page says; the pages are named in docs/reference/diagram-spec.md.
 */
import type { DrawParams, SceneEdge, SceneGroup, SceneNode, SceneSpec } from "./model.js";

interface Numbered {
  edge: SceneEdge;
  note?: string;
}

/** Number the edges that carry a note, in order, and collect the notes. */
function finish(width: number, height: number, groups: SceneGroup[], nodes: SceneNode[], items: Numbered[]): SceneSpec {
  const notes: string[] = [];
  const edges = items.map(({ edge, note }) => {
    if (note === undefined) return edge;
    notes.push(note);
    return { ...edge, n: notes.length };
  });
  return { template: "scene", width, height, groups, nodes, edges, notes };
}

/** The key box, drawn at (x, y) with only the line styles the drawing uses. */
function key(x: number, y: number, w: number, dashedLabel: string | null, vnet: boolean): { groups: SceneGroup[]; nodes: SceneNode[]; edges: Numbered[] } {
  const rows: { label: string; dashed?: boolean; both?: boolean }[] = [{ label: "Traffic or data path" }];
  if (dashedLabel) rows.push({ label: dashedLabel, dashed: true });
  rows.push({ label: "Two-way link", both: true });
  const base = 40 + 25 * (rows.length - 1) + 16;
  const h = vnet ? base + 56 : 40 + 25 * rows.length + 10;
  const groups: SceneGroup[] = [{ title: "Key", x, y, w, h, kind: "grey" }];
  const nodes: SceneNode[] = [];
  if (vnet) {
    groups.push({ title: "", x: x + 20, y: y + base, w: 60, h: 24, kind: "vnet" });
    nodes.push({ id: "k-vnet", x: x + 130, y: y + base + 16, label: "Virtual network", maxChars: 20 });
  }
  return {
    groups,
    nodes,
    edges: rows.map((r, i): Numbered => ({
      edge: { points: [[x + 20, y + 40 + 25 * i], [x + 80, y + 40 + 25 * i]], label: r.label, labelAt: [x + 90, y + 43 + 25 * i], labelAnchor: "start", dashed: r.dashed, both: r.both },
    })),
  };
}

export interface SqlVmOptions { twoRegion: boolean }

/** SQL Server on Azure VMs: an availability group across zones, with backup, and optionally a second region. */
export function sqlVmScene(p: DrawParams, o: SqlVmOptions): SceneSpec {
  const n = p.zones === 3 ? 3 : 2;
  const r1 = p.primaryName ?? "Region 1";
  const r2 = p.secondaryName ?? "Region 2";
  const z0 = (k: number): number => (k === 1 ? 362 : 362 + 235 + 10 + (k - 2) * 175);
  const zH = (k: number): number => (k === 1 ? 235 : 165);
  const yEnd = z0(n) + zH(n);
  const subBottom = yEnd + 12;
  const vnetBottom = subBottom + 14;
  const regBottom = vnetBottom + 14;
  const groups: SceneGroup[] = [
    { title: `${r1} (primary)`, x: 20, y: 75, w: 680, h: regBottom - 75, kind: "outline", titleSize: 12 },
    { title: "Virtual network 1", x: 35, y: 100, w: 450, h: vnetBottom - 100, kind: "vnet" },
    { title: "App subnet", x: 50, y: 125, w: 425, h: 115, kind: "outline" },
    { title: `SQL subnet (one subnet across ${n === 2 ? "both" : "all three"} zones)`, x: 50, y: 262, w: 425, h: subBottom - 262, kind: "outline" },
  ];
  for (let k = 1; k <= n; k++) {
    groups.push({ title: `Availability zone ${k}`, x: 62, y: z0(k), w: 401, h: zH(k), kind: "blue" });
    groups.push({ title: "SQL Server on Azure VM", x: 72, y: z0(k) + 18, w: 381, h: 135, kind: "outline" });
  }
  const nodes: SceneNode[] = [
    { id: "clients", x: 300, y: 45, label: "Clients", box: { w: 140, h: 28 } },
    { id: "app", x: 300, y: 168, label: "App tier VM", icon: "vm" },
    { id: "lb", x: 300, y: 305, label: "Internal load balancer\n(listener IP)", maxChars: 22, icon: "load-balancer" },
    { id: "dc1", x: 120, y: z0(1) + 183, label: "Domain controller VM", icon: "vm" },
    { id: "wit", x: 548, y: 590, label: "Storage account\n(cloud witness)", maxChars: 16, icon: "storage-account" },
    { id: "vault", x: 640, y: 590, label: "Recovery Services vault", maxChars: 14, icon: "recovery-vault" },
  ];
  for (let k = 1; k <= n; k++) {
    const y = z0(k);
    nodes.push({ id: `vm${k}`, x: 120, y: y + 63, label: `SQL-VM-${k}`, icon: "vm" });
    nodes.push({ id: `sql${k}`, x: 215, y: y + 63, label: k === 1 ? "SQL Server\nprimary replica" : "SQL Server\nsecondary replica", maxChars: 12, icon: "sql-server" });
    nodes.push({ id: `ext${k}`, x: 355, y: y + (k === 1 ? 88 : 123), label: "Azure Backup workload extension", box: { w: 130, h: 30 } });
    nodes.push({ id: `fc${k}`, x: 355, y: y + (k === 1 ? 123 : 88), label: "Failover cluster node", box: { w: 130, h: 30 } });
  }
  // Zone 1 puts the extension above the failover node; later zones put it below.
  const fcY = (k: number): number => z0(k) + (k === 1 ? 123 : 88);
  const extY = (k: number): number => z0(k) + (k === 1 ? 88 : 123);
  const sqlY = (k: number): number => z0(k) + 63;
  const items: Numbered[] = [
    { edge: { points: [[300, 59], [300, 150]], nAt: [300, 98] }, note: "Clients reach the app tier VM in the app subnet of virtual network 1." },
    { edge: { points: [[300, 216], [300, 286]], label: "Connect to the listener name", labelAt: [312, 283], labelAnchor: "start", nAt: [300, 244] },
      note: "The app connects to the availability group listener name. With the SQL Server VMs in a single subnet, an Azure internal load balancer holds the listener IP address, and each region needs its own load balancer. Placing the VMs in multiple subnets of one virtual network removes the need for the load balancer." },
    { edge: { from: "lb", to: "sql1", via: [[215, 305]], nAt: [215, 350] }, note: "The load balancer holds the listener IP address on the one cluster node that needs it at a time, the primary replica." },
    { edge: { points: [[236, sqlY(1)], [270, sqlY(1)], [270, sqlY(2)], [236, sqlY(2)]], both: true, label: "Synchronous commit,\nautomatic failover", labelAt: [278, (sqlY(1) + sqlY(2)) / 2 - 5], labelAnchor: "start", nAt: [270, (sqlY(1) + sqlY(2)) / 2 + 25] },
      note: `${n === 2 ? "SQL-VM-1 and SQL-VM-2 sit" : "SQL-VM-1, SQL-VM-2 and SQL-VM-3 sit"} in different availability zones as replicas with synchronous commit and automatic failover. They are nodes of one Windows Server failover cluster that needs an Active Directory domain, so a domain controller VM is part of the design.` },
  ];
  if (n === 3) items.push({ edge: { points: [[236, sqlY(2) + 10], [256, sqlY(2) + 10], [256, sqlY(3)], [236, sqlY(3)]], both: true } });
  if (o.twoRegion) {
    items.push({ edge: { points: [[236, 413], [868, 413]], dashed: true, label: "Asynchronous commit,\nmanual failover", labelAt: [500, 392], labelAnchor: "start", nAt: [640, 413] },
      note: "The replica in the remote region runs with asynchronous commit and manual failover. The two virtual networks are joined by virtual network peering or a site-to-site VPN gateway, and replication between regions incurs outbound data charges." });
  }
  items.push({ edge: { points: [[422, extY(1)], [640, extY(1)], [640, 571]], label: "Stream-based backup\nstraight to the vault", labelAt: [498, extY(1) - 25], labelAnchor: "start", nAt: [612, extY(1)] },
    note: "Azure Backup installs the AzureBackupWindowsWorkload extension on each SQL Server VM. It streams backups through SQL native APIs straight to the Recovery Services vault with no staging location, honours the availability group backup preference, and can take log backups as often as every 15 minutes." });
  items.push({ edge: { points: [[422, extY(2)], [688, extY(2)], [688, 590], [661, 590]] } });
  if (n === 3) items.push({ edge: { points: [[422, extY(3)], [688, extY(3)], [688, extY(2)]] } });
  items.push({ edge: { points: [[427, fcY(1)], [505, fcY(1)], [505, 590], [529, 590]], label: "Quorum vote", labelAt: [433, fcY(1) - 15], labelAnchor: "start" } });
  items.push({ edge: { points: [[427, fcY(2)], [505, fcY(2)], [505, 590]], nAt: [505, 640] },
    note: "The cloud witness gives the cluster a quorum vote, so a two-node cluster can keep running with one node online. It needs a Standard general-purpose v2 storage account with locally redundant storage; Premium storage is not supported for a cloud witness." });
  if (n === 3) items.push({ edge: { points: [[427, fcY(3)], [505, fcY(3)], [505, fcY(2)]] } });
  let width = 1040;
  let height = Math.max(regBottom + 18, 830);
  let kx = 720;
  let ky = 75;
  let kw = 300;
  if (o.twoRegion) {
    width = 1200;
    height = Math.max(regBottom + 18, 830);
    kx = 810; ky = 650; kw = 380;
    groups.push(
      { title: `${r2} (disaster recovery)`, x: 810, y: 75, w: 380, h: 555, kind: "outline", titleSize: 12 },
      { title: "Virtual network 2", x: 823, y: 100, w: 354, h: 515, kind: "vnet" },
      { title: "App subnet", x: 836, y: 125, w: 328, h: 115, kind: "outline" },
      { title: "SQL subnet", x: 836, y: 262, w: 328, h: 338, kind: "outline" },
      { title: "SQL Server on Azure VM", x: 846, y: 380, w: 308, h: 135, kind: "outline", titleAnchor: "middle" },
    );
    nodes.push(
      { id: "app2", x: 900, y: 168, label: "App tier VM\n(recovered by Site Recovery)", grey: true, maxChars: 14, icon: "vm" },
      { id: "plan", x: 1085, y: 172, label: "Recovery plan with Azure Automation runbook as pre-action", box: { w: 140, h: 56 } },
      { id: "lb2", x: 960, y: 305, label: "Internal load balancer\n(listener IP)", maxChars: 22, icon: "load-balancer" },
      { id: "sqlr", x: 890, y: 425, label: "SQL Server\nasynchronous replica", maxChars: 12, icon: "sql-server" },
      { id: "vmr", x: 980, y: 425, label: `SQL-VM-${n + 1}`, icon: "vm" },
      { id: "extr", x: 1090, y: 450, label: "Azure Backup workload extension", box: { w: 110, h: 30 } },
      { id: "fcr", x: 1090, y: 485, label: "Failover cluster node", box: { w: 110, h: 30 } },
      { id: "dc2", x: 890, y: 545, label: "Domain controller VM", icon: "vm" },
    );
    items.push({ edge: { points: [[322, 168], [878, 168]], label: "Azure Site Recovery\nreplication", labelAt: [560, 150], nAt: [760, 168] },
      note: `Site Recovery replicates the app tier VM to ${r2}. The web and app tiers fail over only after the database failover is done. The Recovery Services vault used by Site Recovery holds metadata, not customer data.` });
    items.push({ edge: { from: "lb2", to: "sqlr", via: [[890, 305]] } });
    items.push({ edge: { points: [[1085, 200], [1085, 378]], dashed: true, label: "AG fails over first", labelAt: [1078, 296], labelAnchor: "end", nAt: [1085, 340] },
      note: "A Site Recovery recovery plan runs the ASR-SQL-FailoverAG script from Azure Automation as the pre-action of its first group, which fails over the availability group before the app tier starts. This assumes a domain controller already exists in the secondary region." });
  }
  const k = key(kx, ky, kw, o.twoRegion ? "Asynchronous or manual" : null, true);
  groups.push(...k.groups);
  nodes.push(...k.nodes);
  items.push(...k.edges);
  return finish(width, height, groups, nodes, items);
}

export interface MabsOptions { kind: "vmware" | "agent" }

/** Azure Backup Server protecting on-premises machines to a Recovery Services vault. */
export function mabsScene(p: DrawParams, o: MabsOptions): SceneSpec {
  const pe = p.link === "private-endpoint";
  const seed = p.seeding === "yes";
  const over = p.data === "over";
  const vmware = o.kind === "vmware";
  const azureH = pe ? 420 : seed ? 330 : 250;
  const groups: SceneGroup[] = [{ title: "On-premises datacenter", x: 20, y: 60, w: 770, h: 580, kind: "outline", titleSize: 12 }];
  const nodes: SceneNode[] = [];
  const items: Numbered[] = [];
  if (vmware) {
    groups.push(
      { title: "VMware vSphere environment", x: 35, y: 95, w: 300, h: 520, kind: "blue" },
      { title: "ESXi host", x: 48, y: 185, w: 274, h: 185, kind: "outline" },
      { title: "ESXi host", x: 48, y: 385, w: 274, h: 110, kind: "outline" },
      { title: "vCenter VM folder", x: 58, y: 410, w: 254, h: 76, kind: "dashed" },
    );
    nodes.push(
      { id: "vc", x: 185, y: 140, label: "vCenter Server", box: { w: 150, h: 30 } },
      { id: "w1", x: 95, y: 240, label: "Windows VM", icon: "vm" },
      { id: "l1", x: 185, y: 240, label: "Linux VM\n(file-consistent only)", maxChars: 14, icon: "vm" },
      { id: "x1", x: 275, y: 240, label: "VM with pass-through disk", grey: true, maxChars: 14, icon: "vm" },
      { id: "w2", x: 110, y: 449, label: "Windows VM", icon: "vm" },
      { id: "w3", x: 260, y: 449, label: "Windows VM", icon: "vm" },
      { id: "lim", x: 185, y: 535, label: "Not supported: vApps, VMs with existing snapshots, pass-through disks or pRDM", grey: true, box: { w: 250, h: 44 } },
      { id: "ver", x: 185, y: 585, label: "vSphere 6.5 to 8.0 with MABS v4; 9.0 needs v4 UR2 or later", grey: true, box: { w: 250, h: 36 } },
      { id: "cred", x: 680, y: 140, label: "VMware account with a limited role", box: { w: 160, h: 34 } },
      { id: "cert", x: 680, y: 400, label: "VMware CA certificate in the trusted root store", box: { w: 150, h: 34 } },
    );
    items.push({ edge: { points: [[598, 140], [262, 140]], both: true, label: "TCP 443", labelAt: [377, 130], nAt: [340, 140] },
      note: "MABS needs no agent on vCenter or the ESXi hosts. It talks to vCenter over HTTPS on TCP 443, using a VMware account that holds a role with only the privileges backup needs. Where vCenter manages the ESXi hosts, add vCenter, not the hosts, to the protection group. For HTTPS, import the VMware CA certificate on the MABS server." });
    items.push({ edge: { points: [[323, 262], [441, 262]], label: "TCP 443 and 902", labelAt: [381, 250], nAt: [377, 262] },
      note: "MABS reads the VM data from the ESXi hosts over TCP 443 and TCP 902 and keeps it first on local disk, in a storage pool that can be direct attached storage, a Fibre Channel SAN or iSCSI storage. A vCenter VM folder can be protected as one unit and new VMs in it are picked up daily." });
    items.push({ edge: { points: [[323, 440], [385, 440], [385, 276], [441, 276]] } });
  } else {
    groups.push({ title: "Production servers", x: 35, y: 95, w: 300, h: 520, kind: "blue" });
    nodes.push(
      { id: "hv", x: 185, y: 170, label: "Hyper-V host\n(MABS protection agent)", box: { w: 230, h: 44 } },
      { id: "ph", x: 185, y: 262, label: "Physical Windows server\n(MABS protection agent)", box: { w: 230, h: 44 } },
      { id: "ap", x: 185, y: 354, label: "Application server, for example SQL Server\n(MABS protection agent)", box: { w: 230, h: 56 } },
      { id: "lim", x: 185, y: 480, label: "Virtual machines with pass-through disks or a remote VHD: use guest-level backup with an agent on the VM", grey: true, box: { w: 250, h: 56 } },
    );
    items.push({ edge: { points: [[301, 170], [385, 170], [385, 252], [441, 252]] } });
    items.push({ edge: { points: [[301, 262], [441, 262]], label: "Protection agent", labelAt: [371, 250], nAt: [377, 262] },
      note: "A MABS protection agent is installed on each machine that will be backed up. Machines and apps are backed up to local storage on the MABS server." });
    items.push({ edge: { points: [[301, 354], [385, 354], [385, 276], [441, 276]] } });
  }
  groups.push({ title: vmware ? "MABS server (Windows Server VM)" : "MABS server (dedicated Windows Server)", x: 420, y: 95, w: 350, h: 365, kind: "outline" });
  if (vmware) groups.push({ title: "Other production servers", x: 420, y: 475, w: 350, h: 120, kind: "grey" });
  groups.push({ title: "Azure", x: 850, y: 60, w: 330, h: azureH, kind: "outline", titleSize: 12 });
  nodes.push(
    { id: "mv", x: 470, y: 190, label: "MABS server", maxChars: 14, icon: "vm" },
    { id: "pg", x: 680, y: 205, label: "Protection group: disk short term, online protection", box: { w: 160, h: 44 } },
    { id: "pool", x: 485, y: 262, label: "Storage pool\n(DAS, Fibre Channel SAN or iSCSI)", maxChars: 18, icon: "disks" },
    { id: "mars", x: 670, y: 262, label: "MARS agent", box: { w: 110, h: 30 } },
    { id: "db", x: 495, y: 400, label: "MABS database (DPMDB)", box: { w: 130, h: 30 } },
    { id: "vault", x: 1015, y: 262, label: "Recovery Services vault", maxChars: 14, icon: "recovery-vault" },
  );
  if (vmware) {
    nodes.push({ id: "fs", x: 545, y: 545, label: "Windows file server with the MABS protection agent", box: { w: 200, h: 44 } });
  }
  if (over) nodes.push({ id: "second", x: 595, y: 440, label: "Over 75 TB: add a second MABS server", grey: true, box: { w: 270, h: 26 } });
  items.push({ edge: { points: [[505, 262], [613, 262]], nAt: [560, 262] },
    note: vmware ? "The protection group sets the short-term disk retention. The MARS agent that runs on the MABS server then backs up the MABS disks to the Recovery Services vault."
      : "The MARS agent that runs on the MABS server backs up the MABS disks to a Recovery Services vault in Azure by using Azure Backup." });
  items.push({ edge: { points: [[726, 262], [996, 262]], label: "Online backup", labelAt: [905, 254], nAt: [800, 262] },
    note: vmware ? "Online protection sends recovery points from MABS to the vault on the schedule you set. There is no time limit on retention; the limit is 9999 recovery points per protected instance." : "Online protection sends recovery points from MABS to the vault on the schedule you set." });
  items.push({ edge: { points: [[996, 282], [773, 282]], dashed: true, label: "Restore", labelAt: [905, 300], nAt: [800, 282] },
    note: vmware ? "For recovery you can restore the whole VM or, for Windows VMs, files and folders without restoring the whole VM. Recovery goes through MABS." : undefined });
  if (vmware) {
    items.push({ edge: { points: [[620, 523], [620, 462]], label: "Agent-based", labelAt: [632, 508], labelAnchor: "start", nAt: [620, 492] },
      note: "Machines outside VMware, such as a physical Windows file server, run the MABS protection agent and back up to the same MABS server. Linux VMs on VMware are protected as a whole VM, with file-consistent snapshots only." });
  }
  if (pe) {
    groups.push({ title: "Virtual network", x: 900, y: 335, w: 265, h: 120, kind: "vnet" });
    nodes.push({ id: "pe", x: 1015, y: 400, label: "Private endpoint", box: { w: 110, h: 30 } });
    items.push({ edge: { points: [[772, 400], [958, 400]], dashed: true, label: "Private endpoint path", labelAt: [810, 390], nAt: [810, 410] },
      note: "With a private endpoint on the vault, connect the on-premises network to the virtual network that hosts the endpoint, so the MARS agent's backup traffic goes through it." });
    items.push({ edge: { points: [[1015, 385], [1015, 322]], dashed: true } });
  }
  if (seed) {
    nodes.push({ id: "off", x: 1015, y: 170, label: "Offline seeding: initial backup on disks", box: { w: 170, h: 44 } });
    items.push({ edge: { points: [[1015, 193], [1015, 244]], dashed: true, nAt: [1015, 222] },
      note: "For a large first backup, offline seeding copies the initial backup to disks that are transferred to Azure." });
  }
  items.push({ edge: { points: [[495, 385], [495, 340], [670, 340], [670, 278]], dashed: true, label: "DPMDB backup to Azure", labelAt: [505, 332], labelAnchor: "start", nAt: [640, 340] },
    note: "The MABS database, DPMDB, holds the MABS configuration and backup data. Back it up to Azure too, so any MABS server registered in the vault can recover it." });
  const k = key(850, 500, 330, "Optional or restore", pe);
  groups.push(...k.groups);
  nodes.push(...k.nodes);
  items.push(...k.edges);
  return finish(1200, pe ? 680 : 660, groups, nodes, items);
}
