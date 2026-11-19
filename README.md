# wizards

Deterministic question-tree wizards. A person answers plain questions and code walks a data tree to an answer. No model runs when a wizard is used, so the same answers always give the same output.

This is a consulting knowledge product, not infrastructure. Nothing here deploys anything.

## Wizards

| Wizard | What it answers | Tree |
|---|---|---|
| Azure resiliency | For an Azure service, what to use for high availability, disaster recovery and backup, for a zone failure, a region failure or data loss | [wizards/azure-resiliency/tree.json](wizards/azure-resiliency/tree.json) |

Every node of every tree cites a Microsoft Learn page and a quote that is on it. The Azure resiliency tree covers the services listed in its own node list; a service it does not cover gets a result that points to Microsoft's list of services with zone support.

## Use it

Python 3 standard library only.

```text
python3 -I scripts/wizards_engine.py ask wizards/azure-resiliency/tree.json
python3 -I scripts/wizards_engine.py run wizards/azure-resiliency/tree.json --answers yes,vm,zone
python3 -I scripts/wizards_engine.py paths wizards/azure-resiliency/tree.json
```

## Use it in a browser

A basic front end walks the tree and shows a diagram that updates with each answer. It is temporary. See [docs/reference/web-front-end.md](docs/reference/web-front-end.md).

```text
cd web && npm ci && npm run build && npm run serve
```

## Check it

```text
python3 -I scripts/wizards_engine.py validate wizards/azure-resiliency/tree.json
python3 -I tests/test_wizards_engine.py
python3 -I scripts/wizards_engine.py verify-sources wizards/azure-resiliency/tree.json
```

`verify-sources` is the only command that uses the network: it fetches each cited page and checks that the quote is on it. A quote being on a page does not prove the wording around it is right, so read the page around every quote you add.

## Contribute

One service branch per pull request. Read [AGENTS.md](AGENTS.md) and [docs/reference/tree-format.md](docs/reference/tree-format.md) first. CI runs `validate`, the engine tests and the front-end tests on every pull request, and `verify-sources` weekly because Learn pages change.
