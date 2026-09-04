# Code Map

An interactive architecture map of the monorepo: every server module and client
feature, what calls what, and the end-to-end flows that matter most.

## Opening it

`codemap.html` is a single self-contained file — no build step, no server, no
network. Open it directly:

```bash
open docs/codemap/codemap.html          # macOS
xdg-open docs/codemap/codemap.html      # Linux
```

Or drag the file into any browser. It works offline and over `file://` because
the data is embedded in the page.

GitHub renders `.html` as source rather than as a page, so the map has to be
opened locally.

## Using it

- The graph runs in four lanes, ordered by request direction: client features →
  platform → server domain modules → data and external services. Backward-curving
  arrows are the interesting ones — a module reaching back into a lane to its
  left, like `games` calling through `feed` to publish a post.
- **Expand client** and **Expand external** unfold those two collapsed lanes into
  their individual nodes. **Show minor modules** reveals `health`, `contact`,
  `analytics`, `follows` and `export`.
- Click any node for its role, its callers, what it depends on, what it can break
  downstream, and the test files covering it.
- **Key end-to-end flows** traces the paths worth understanding before changing
  them, step by step, each step naming the exact file and symbol.

## The three files

| File           | What it is                                                           |
| -------------- | -------------------------------------------------------------------- |
| `codemap.html` | The viewer. Embeds the same data as `codemap.json`; open this one.   |
| `codemap.json` | The data on its own, for scripting or diffing.                       |
| `codemap.lock` | Integrity record — the commit it was built from and a hash per file. |

## Telling when it has gone stale

The map is generated, not live. `codemap.lock` records the commit it was built
from, along with a truncated SHA-256 of every file it describes, so drift is
measurable rather than a guess:

```bash
# What has changed since the map was generated?
git diff --stat "$(python3 -c "import json;print(json.load(open('docs/codemap/codemap.lock'))['generatedFrom']['commit'])")..HEAD
```

`verification.problems` in the lock is empty when every node path, source file,
test file and flow-step file resolved on disk and every flow-step symbol was
found inside the file it names.

Regenerate after structural changes — a new module or client feature, a new
Mongoose model, a new cross-module call, or a flow whose steps have moved. Ask
Claude to "update the codemap"; it reads the lock to work out what drifted, and
re-derives the server module graph from the actual `require()` calls rather than
trusting the previous map.

Keep `codemap.json` and the copy embedded in `codemap.html` in sync — they are
the same data, and the viewer reads the embedded copy.
