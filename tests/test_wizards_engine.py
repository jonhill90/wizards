#!/usr/bin/env python3
"""Tests for wizards_engine.py. Run: python3 -I test_wizards_engine.py
They use the real Azure resiliency tree (wizards/azure-resiliency/tree.json) and small
broken trees built in the tests. No test touches the network: verify_sources gets a fake fetch."""
import copy
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import wizards_engine as w  # noqa: E402

TREE_PATH = os.path.join(ROOT, "wizards", "azure-resiliency", "tree.json")
if not os.path.exists(TREE_PATH):
    raise SystemExit("tree not found: " + TREE_PATH)


def src(url="https://learn.microsoft.com/azure/x", quote="the quote"):
    return {"title": "T", "url": url, "quote": quote, "retrieved": "2026-11-18"}


def tiny():
    return {"wizard": "tiny", "version": 1, "start": "q", "nodes": {
        "q": {"type": "question", "text": "Q?", "options": [
            {"id": "a", "label": "A", "next": "r1"}, {"id": "b", "label": "B", "next": "r2"}], "sources": [src()]},
        "r1": {"type": "result", "title": "One", "summary": "s", "sources": [src()]},
        "r2": {"type": "result", "title": "Two", "summary": "s", "sources": [src()]}}}


class RealTree(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = w.load(TREE_PATH)

    def test_valid(self):
        self.assertEqual(w.validate(self.tree), [])

    def test_every_node_has_a_dated_learn_source_with_a_quote(self):
        for nid, node in self.tree["nodes"].items():
            self.assertTrue(node["sources"], nid)
            for s in node["sources"]:
                self.assertTrue(s["url"].startswith("https://learn.microsoft.com/"), nid)
                self.assertTrue(s["quote"].strip(), nid)
                self.assertRegex(s["retrieved"], r"^\d{4}-\d{2}-\d{2}$")

    def test_paths_counts(self):
        ps = w.paths(self.tree)
        self.assertEqual(len(ps), 62)
        self.assertEqual(len({r for _, r in ps}), 62)
        # every result node is reachable by at least one path
        results = {n for n, v in self.tree["nodes"].items() if v["type"] == "result"}
        self.assertEqual({r for _, r in ps}, results)

    def test_every_path_runs_to_its_result(self):
        for trail, rid in w.paths(self.tree):
            res = w.run(self.tree, trail)
            self.assertEqual(res["result"]["node"], rid, trail)
            self.assertEqual(len(res["steps"]), len(trail))

    def test_sql_regional_failover_group_path(self):
        res = w.run(self.tree, ["yes", "sql-database", "region", "no", "yes"])
        self.assertEqual(res["result"]["node"], "r-sqldb-failover-group")
        urls = {s["url"] for s in res["sources"]}
        self.assertIn("https://learn.microsoft.com/azure/azure-sql/database/failover-group-sql-db", urls)

    def test_sql_managed_instance_branches(self):
        for trail, rid in [(["yes", "sql-mi", "zone"], "r-sqlmi-zone"),
                           (["yes", "sql-mi", "region", "yes"], "r-sqlmi-georestore"),
                           (["yes", "sql-mi", "region", "no"], "r-sqlmi-failover-group"),
                           (["yes", "sql-mi", "data-loss"], "r-sqlmi-pitr")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_aks_and_app_service_branches(self):
        for trail, rid in [(["yes", "aks", "zone"], "r-aks-zone"), (["yes", "aks", "region"], "r-aks-region"),
                           (["yes", "aks", "data-loss"], "r-aks-backup"), (["yes", "app-service", "zone"], "r-appsvc-zone"),
                           (["yes", "app-service", "region"], "r-appsvc-region"),
                           (["yes", "app-service", "data-loss"], "r-appsvc-backup")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_service_bus_and_event_hubs_branches(self):
        for trail, rid in [(["yes", "service-bus", "zone"], "r-sb-zone"),
                           (["yes", "service-bus", "region"], "r-sb-region"),
                           (["yes", "service-bus", "data-loss"], "r-sb-data"),
                           (["yes", "event-hubs", "zone"], "r-eh-zone"),
                           (["yes", "event-hubs", "region"], "r-eh-region"),
                           (["yes", "event-hubs", "data-loss"], "r-eh-data")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_synapse_branches(self):
        for trail, rid in [(["yes", "synapse", "zone"], "r-synapse-zone"),
                           (["yes", "synapse", "region"], "r-synapse-region"),
                           (["yes", "synapse", "data-loss"], "r-synapse-restore")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_traffic_routing_branches(self):
        for trail, rid in [(["yes", "traffic-routing", "web"], "r-routing-frontdoor"),
                           (["yes", "traffic-routing", "dns"], "r-routing-tm")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_fabric_branches(self):
        for trail, rid in [(["yes", "fabric", "zone"], "r-fabric-zone"),
                           (["yes", "fabric", "region"], "r-fabric-region"),
                           (["yes", "fabric", "data-loss"], "r-fabric-data")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_managed_disk_branches(self):
        for trail, rid in [(["yes", "managed-disks", "zone"], "r-disk-zone"),
                           (["yes", "managed-disks", "region"], "r-disk-region"),
                           (["yes", "managed-disks", "data-loss"], "r-disk-backup")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_storage_data_loss_branches(self):
        for trail, rid in [(["yes", "storage", "data-loss", "blobs"], "r-storage-blob-backup"),
                           (["yes", "storage", "data-loss", "files"], "r-storage-files-backup"),
                           (["yes", "storage", "data-loss", "other"], "r-storage-other-backup")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_key_vault_and_sql_server_in_a_vm_branches(self):
        for trail, rid in [(["yes", "key-vault", "zone"], "r-kv-zone"),
                           (["yes", "key-vault", "region", "yes"], "r-kv-managed-failover"),
                           (["yes", "key-vault", "region", "no"], "r-kv-custom"),
                           (["yes", "key-vault", "data-loss"], "r-kv-recovery"),
                           (["yes", "sql-vm", "zone"], "r-sqlvm-zone"),
                           (["yes", "sql-vm", "region"], "r-sqlvm-region"),
                           (["yes", "sql-vm", "data-loss"], "r-sqlvm-backup")]:
            self.assertEqual(w.run(self.tree, trail)["result"]["node"], rid)

    def test_vm_region_names_site_recovery(self):
        res = w.run(self.tree, ["yes", "vm", "region"])
        self.assertIn("Site Recovery", res["result"]["title"])

    def test_no_targets_stops_at_define_targets(self):
        self.assertEqual(w.run(self.tree, ["no"])["result"]["node"], "r-define-targets")

    def test_databricks_branches(self):
        self.assertEqual(w.run(self.tree, ["yes", "databricks", "region", "yes"])["result"]["node"], "r-dbx-managed-dr")
        self.assertEqual(w.run(self.tree, ["yes", "databricks", "region", "no"])["result"]["node"], "r-dbx-diy-dr")

    def test_pending_question_when_answers_run_out(self):
        res = w.run(self.tree, ["yes", "sql-database"])
        self.assertIsNone(res["result"])
        self.assertEqual(res["pending"]["node"], "q-sqldb-failure")
        self.assertIn("[zone]", w.render(res))

    def test_deterministic(self):
        a = json.dumps(w.run(self.tree, ["yes", "cosmos", "region", "yes"]), sort_keys=True)
        b = json.dumps(w.run(self.tree, ["yes", "cosmos", "region", "yes"]), sort_keys=True)
        self.assertEqual(a, b)

    def test_render_lists_each_source_once(self):
        text = w.render(w.run(self.tree, ["yes", "storage", "zone"]))
        urls = [ln for ln in text.splitlines() if ln.startswith("  - ") and "https://" in ln]
        self.assertEqual(len(urls), len(set(urls)))

    def test_wrong_option_and_extra_answer_raise(self):
        with self.assertRaises(ValueError):
            w.run(self.tree, ["maybe"])
        with self.assertRaises(ValueError):
            w.run(self.tree, ["no", "yes"])

    def test_ask_walks_with_fed_input(self):
        out, feed = [], iter(["1", "18", "x", "1"])  # yes, other (18th), junk ignored... then end at result
        answers = w.ask(self.tree, read=lambda _p: next(feed), say=out.append)
        self.assertEqual(answers, ["yes", "other"])
        self.assertTrue(any("RESULT:" in line for line in out))


class Validation(unittest.TestCase):
    def test_tiny_is_valid(self):
        self.assertEqual(w.validate(tiny()), [])

    def problems(self, mutate):
        t = tiny()
        mutate(t)
        return w.validate(t)

    def test_missing_next(self):
        p = self.problems(lambda t: t["nodes"]["q"]["options"][0].update(next="nope"))
        self.assertTrue(any("is not a node" in x for x in p))

    def test_unreachable(self):
        def m(t):
            t["nodes"]["r3"] = {"type": "result", "title": "x", "summary": "y", "sources": [src()]}
        self.assertTrue(any("r3: not reachable" in x for x in self.problems(m)))

    def test_loop(self):
        def m(t):
            t["nodes"]["r1"] = {"type": "question", "text": "again", "sources": [src()], "options": [
                {"id": "x", "label": "X", "next": "q"}, {"id": "y", "label": "Y", "next": "r2"}]}
        p = self.problems(m)
        self.assertTrue(any(x.startswith("loop:") for x in p), p)

    def test_source_rules(self):
        self.assertTrue(any("no source" in x for x in self.problems(lambda t: t["nodes"]["r1"].update(sources=[]))))
        self.assertTrue(any("url must start" in x for x in self.problems(
            lambda t: t["nodes"]["r1"].update(sources=[src(url="https://example.com/a")]))))
        self.assertTrue(any("no quote" in x for x in self.problems(
            lambda t: t["nodes"]["r1"].update(sources=[src(quote=" ")]))))
        bad = src()
        bad["retrieved"] = "yesterday"
        self.assertTrue(any("retrieved" in x for x in self.problems(lambda t: t["nodes"]["r1"].update(sources=[bad]))))

    def test_question_and_result_shape(self):
        self.assertTrue(any("two or more" in x for x in self.problems(
            lambda t: t["nodes"]["q"].update(options=t["nodes"]["q"]["options"][:1]))))
        self.assertTrue(any("repeats" in x for x in self.problems(
            lambda t: t["nodes"]["q"]["options"][1].update(id="a"))))
        self.assertTrue(any("must not have options" in x for x in self.problems(
            lambda t: t["nodes"]["r1"].update(options=[{"id": "z"}]))))
        self.assertTrue(any("type must be" in x for x in self.problems(lambda t: t["nodes"]["r1"].update(type="note"))))

    def test_bad_slugs_and_start(self):
        self.assertTrue(any("start" in x for x in self.problems(lambda t: t.update(start="zz"))))
        t = tiny()
        t["nodes"]["Bad_Id"] = copy.deepcopy(t["nodes"]["r1"])
        self.assertTrue(any("lowercase slug" in x for x in w.validate(t)))


class VerifySources(unittest.TestCase):
    def test_quote_found_missing_and_fetch_error(self):
        t = tiny()
        t["nodes"]["r1"]["sources"] = [src(url="https://learn.microsoft.com/azure/a", quote="Zone  redundant\nstorage.")]
        t["nodes"]["r2"]["sources"] = [src(url="https://learn.microsoft.com/azure/b", quote="never on the page")]
        t["nodes"]["q"]["sources"] = [src(url="https://learn.microsoft.com/azure/c", quote="x")]
        pages = {"https://learn.microsoft.com/azure/a": "<p>Zone <b>redundant</b> storage .</p><script>x</script>",
                 "https://learn.microsoft.com/azure/b": "<p>something else</p>"}

        def fetch(url):
            if url not in pages:
                raise OSError("down")
            return pages[url]

        rows = {(n, ok) for n, _u, ok, _why in w.verify_sources(t, fetch=fetch)}
        self.assertEqual(rows, {("r1", True), ("r2", False), ("q", False)})
        reasons = {n: why for n, _u, ok, why in w.verify_sources(t, fetch=fetch)}
        self.assertIn("could not fetch", reasons["q"])
        self.assertIn("not found", reasons["r2"])

    def test_curly_quotes_and_entities_match(self):
        t = tiny()
        t["nodes"]["r1"]["sources"] = [src(url="https://learn.microsoft.com/azure/a", quote="it's here & now")]
        rows = w.verify_sources(t, fetch=lambda u: "<p>it’s here &amp; now</p>", only="/azure/a")
        self.assertTrue(all(ok for _n, _u, ok, _w in rows))
        self.assertEqual(len(rows), 1)  # `only` skipped the other nodes' sources


class Cli(unittest.TestCase):
    def run_cli(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = w.main(["wizards_engine.py", *args])
        return code, buf.getvalue()

    def test_validate_run_paths_exit_codes(self):
        code, out = self.run_cli("validate", TREE_PATH)
        self.assertEqual(code, 0)
        self.assertIn("0 problems", out)
        code, out = self.run_cli("run", TREE_PATH, "--answers", "yes,vm,zone")
        self.assertEqual(code, 0)
        self.assertIn("RESULT: Spread the VMs across availability zones", out)
        code, out = self.run_cli("run", TREE_PATH, "--answers", "no", "--json")
        self.assertEqual(json.loads(out)["result"]["node"], "r-define-targets")
        code, out = self.run_cli("paths", TREE_PATH)
        self.assertIn("62 paths", out)
        self.assertEqual(self.run_cli("bogus", TREE_PATH)[0], 2)
        self.assertEqual(self.run_cli("run", TREE_PATH)[0], 2)

    def test_invalid_tree_fails(self):
        bad = tiny()
        bad["start"] = "zz"
        path = os.path.join(os.environ.get("TMPDIR", "/tmp"), "wizards-bad-tree-test.json")
        with open(path, "w") as f:
            json.dump(bad, f)
        try:
            self.assertEqual(self.run_cli("validate", path)[0], 1)
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main(verbosity=1)
