#!/usr/bin/env python3
"""The wizards engine: walk a question tree with answers and print the result. No AI, no clock, no network
unless `verify-sources` is asked for. The same tree and answers always give the same output.

Usage:
  wizards_engine.py validate <tree.json>               exit 1 and list every problem in the tree
  wizards_engine.py run <tree.json> --answers a,b,c    walk the tree with option ids; print the path and result
                                                       [--json] prints the same as JSON
  wizards_engine.py ask <tree.json>                    ask the questions at the terminal, one number per answer
  wizards_engine.py paths <tree.json>                  list every path from start to a result, and the counts
  wizards_engine.py verify-sources <tree.json>         fetch each cited page and check the quote is on it
                                                       [--only-url <substring>]  (needs network; the only command that does)

Tree format (JSON, version 1). The design and the reason for each choice are in docs/reference/tree-format.md.
  {"wizard": "<slug>", "version": 1, "title": "...", "start": "<node id>", "nodes": {"<id>": <node>, ...}}
  question node: {"type": "question", "text": "...", "help": "why this is asked", "options": [
                    {"id": "<slug, unique in the node>", "label": "...", "next": "<node id>"}, ...], "sources": [...]}
  result node:   {"type": "result", "title": "...", "summary": "...", "actions": ["..."], "caveats": ["..."],
                  "sources": [...]}
  source:        {"title": "...", "url": "https://learn.microsoft.com/...", "quote": "text that is on that page",
                  "retrieved": "YYYY-MM-DD"}
Rules `validate` enforces: the start node exists; every `next` names a node; every node is reachable from start;
no loops; a question has two or more options with unique ids; a result has none; every node has at least one
source on learn.microsoft.com with a non-empty quote and a `retrieved` date; node ids are lowercase slugs.
Why a DAG and not a loop: a wizard that can revisit a question cannot be proven to finish; with no loops every
path is finite and `paths` can list them all.
Exit path: the tree is plain JSON; any other evaluator can read it.
"""
import html
import json
import re
import sys
import urllib.request

sys.dont_write_bytecode = True

SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SOURCE_HOST = "https://learn.microsoft.com/"


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _children(node):
    return [o.get("next") for o in node.get("options", [])]


def validate(tree):
    """A list of problems; empty means the tree is sound."""
    out = []
    nodes = tree.get("nodes")
    if tree.get("version") != 1:
        out.append("version must be 1")
    if not SLUG.match(str(tree.get("wizard", ""))):
        out.append("wizard must be a lowercase slug")
    if not isinstance(nodes, dict) or not nodes:
        return out + ["nodes must be a non-empty object"]
    start = tree.get("start")
    if start not in nodes:
        out.append(f"start {start!r} is not a node")
    for nid, node in sorted(nodes.items()):
        if not SLUG.match(nid):
            out.append(f"{nid}: node id must be a lowercase slug")
        kind = node.get("type")
        if kind == "question":
            opts = node.get("options") or []
            if len(opts) < 2:
                out.append(f"{nid}: a question needs two or more options")
            if not node.get("text"):
                out.append(f"{nid}: question has no text")
            seen = set()
            for o in opts:
                oid = o.get("id")
                if not oid or not SLUG.match(str(oid)):
                    out.append(f"{nid}: option id {oid!r} must be a lowercase slug")
                if oid in seen:
                    out.append(f"{nid}: option id {oid!r} repeats")
                seen.add(oid)
                if not o.get("label"):
                    out.append(f"{nid}/{oid}: option has no label")
                if o.get("next") not in nodes:
                    out.append(f"{nid}/{oid}: next {o.get('next')!r} is not a node")
        elif kind == "result":
            if node.get("options"):
                out.append(f"{nid}: a result must not have options")
            if not node.get("title") or not node.get("summary"):
                out.append(f"{nid}: a result needs a title and a summary")
        else:
            out.append(f"{nid}: type must be question or result, not {kind!r}")
        srcs = node.get("sources") or []
        if not srcs:
            out.append(f"{nid}: no source")
        for i, s in enumerate(srcs):
            url = s.get("url", "")
            if not url.startswith(SOURCE_HOST):
                out.append(f"{nid}: source {i} url must start with {SOURCE_HOST}")
            if not s.get("quote", "").strip():
                out.append(f"{nid}: source {i} has no quote")
            if not s.get("title"):
                out.append(f"{nid}: source {i} has no title")
            if not DATE.match(str(s.get("retrieved", ""))):
                out.append(f"{nid}: source {i} needs retrieved as YYYY-MM-DD")
    if start in nodes:
        seen, stack = set(), [start]
        while stack:
            n = stack.pop()
            if n in seen or n not in nodes:
                continue
            seen.add(n)
            stack.extend(c for c in _children(nodes[n]) if c)
        for nid in sorted(set(nodes) - seen):
            out.append(f"{nid}: not reachable from start")
        out.extend(_cycles(nodes, start))
    return out


def _cycles(nodes, start):
    """Report each loop found by depth-first search; a loop means a path that never ends."""
    state, out = {}, []

    def visit(n, trail):
        state[n] = 1
        for c in _children(nodes[n]):
            if c not in nodes:
                continue
            if state.get(c) == 1:
                out.append("loop: " + " -> ".join(trail + [n, c]))
            elif c not in state:
                visit(c, trail + [n])
        state[n] = 2

    if start in nodes:
        visit(start, [])
    return out


def run(tree, answers):
    """Walk the tree with option ids. Returns {"steps", "result", "pending", "sources"}.
    `pending` is the question still to answer when the answers run out; `result` is None then."""
    nodes = tree["nodes"]
    cur, steps, sources = tree["start"], [], []

    def cite(node, nid):
        for s in node.get("sources", []):
            sources.append({"node": nid, **s})

    for a in answers:
        node = nodes[cur]
        if node["type"] == "result":
            raise ValueError(f"answer {a!r} given after the result {cur!r}")
        match = [o for o in node["options"] if o["id"] == a]
        if not match:
            raise ValueError(f"{cur}: no option {a!r}; options are {[o['id'] for o in node['options']]}")
        cite(node, cur)
        steps.append({"node": cur, "question": node["text"], "answer": a, "label": match[0]["label"]})
        cur = match[0]["next"]
    node = nodes[cur]
    cite(node, cur)
    if node["type"] == "result":
        return {"steps": steps, "result": {"node": cur, **node}, "pending": None, "sources": sources}
    return {"steps": steps, "result": None, "pending": {"node": cur, **node}, "sources": sources}


def paths(tree):
    """Every answer list that leads from start to a result, in option order."""
    nodes, out = tree["nodes"], []

    def walk(n, trail):
        node = nodes[n]
        if node["type"] == "result":
            out.append((trail, n))
            return
        for o in node["options"]:
            walk(o["next"], trail + [o["id"]])

    walk(tree["start"], [])
    return out


def render(res):
    lines = []
    for i, s in enumerate(res["steps"], 1):
        lines.append(f"{i}. {s['question']}\n   -> {s['label']}")
    if res["result"]:
        r = res["result"]
        lines += ["", f"RESULT: {r['title']}", r["summary"]]
        if r.get("actions"):
            lines += ["", "Do this:"] + [f"  - {a}" for a in r["actions"]]
        if r.get("caveats"):
            lines += ["", "Check before you rely on it:"] + [f"  - {c}" for c in r["caveats"]]
        lines += ["", "Sources:"]
        seen = set()
        for s in res["sources"]:
            if s["url"] not in seen:
                seen.add(s["url"])
                lines.append(f"  - {s['title']}: {s['url']}")
    else:
        p = res["pending"]
        lines += ["", f"NEXT QUESTION: {p['text']}"]
        for o in p["options"]:
            lines.append(f"  [{o['id']}] {o['label']}")
    return "\n".join(lines)


def ask(tree, read=input, say=print):
    """Interactive walk. `read` and `say` are arguments so a test can feed answers."""
    answers = []
    while True:
        res = run(tree, answers)
        if res["result"]:
            say(render(res))
            return answers
        p = res["pending"]
        say("\n" + p["text"])
        if p.get("help"):
            say("  (" + p["help"] + ")")
        for i, o in enumerate(p["options"], 1):
            say(f"  {i}. {o['label']}")
        while True:
            raw = read("> ").strip()
            if raw.isdigit() and 1 <= int(raw) <= len(p["options"]):
                answers.append(p["options"][int(raw) - 1]["id"])
                break
            say("Type the number of an option.")


def _norm(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<(script|style).*?</\1>", "", text)))
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r" ([.,;:!?)])", r"\1", text)  # a tag boundary leaves "word ." where the page reads "word."
    return re.sub(r"\( ", "(", text).strip().lower()


def fetch_page(url):
    req = urllib.request.Request(url, headers={"User-Agent": "wizards-source-check/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def verify_sources(tree, fetch=fetch_page, only=None):
    """[(node, url, ok, reason)] for every cited quote. Network only through `fetch`."""
    cache, out = {}, []
    for nid, node in sorted(tree["nodes"].items()):
        for s in node.get("sources", []):
            if only and only not in s["url"]:
                continue
            url = s["url"]
            if url not in cache:
                try:
                    cache[url] = _norm(fetch(url))
                except Exception as e:  # report, never hide, a page that cannot be read
                    cache[url] = e
            page = cache[url]
            if isinstance(page, Exception):
                out.append((nid, url, False, f"could not fetch: {page}"))
            elif _norm(s["quote"]) in page:
                out.append((nid, url, True, ""))
            else:
                out.append((nid, url, False, "quote not found on the page"))
    return out


def main(argv):
    if len(argv) < 3 or argv[1] not in {"validate", "run", "ask", "paths", "verify-sources"}:
        print(__doc__)
        return 2
    cmd, tree = argv[1], load(argv[2])
    bad = validate(tree)
    if cmd == "validate":
        for b in bad:
            print("FAIL", b)
        print(f"{len(tree.get('nodes', {}))} nodes, {len(bad)} problems")
        return 1 if bad else 0
    if bad:
        print("The tree is not valid; run validate.", file=sys.stderr)
        return 1
    if cmd == "run":
        if "--answers" not in argv:
            print("run needs --answers a,b,c")
            return 2
        raw = argv[argv.index("--answers") + 1]
        res = run(tree, [a for a in raw.split(",") if a])
        print(json.dumps(res, indent=2) if "--json" in argv else render(res))
        return 0
    if cmd == "ask":
        ask(tree)
        return 0
    if cmd == "paths":
        ps = paths(tree)
        for trail, rid in ps:
            print(",".join(trail), "=>", rid)
        results = {r for _, r in ps}
        print(f"{len(ps)} paths, {len(results)} distinct results, "
              f"{sum(1 for n in tree['nodes'].values() if n['type'] == 'question')} questions")
        return 0
    only = argv[argv.index("--only-url") + 1] if "--only-url" in argv else None
    rows = verify_sources(tree, only=only)
    for nid, url, ok, why in rows:
        print("ok  " if ok else "FAIL", nid, url, why)
    failed = sum(1 for r in rows if not r[2])
    print(f"{len(rows)} quotes checked, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
