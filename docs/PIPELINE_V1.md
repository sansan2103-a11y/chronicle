# Chronicle Release Pipeline V1.1

Status: **offline candidate, fully tested, not yet bootstrapped.**
Binding rulings: `/tmp/rr/gpt_ruling_pipeline.md` (#PIPELINE) and #PIPELINE-1.
Acceptance: validator **51/51**, Worker shim **29/29**. Single run each, no retry.

```
FABLE_BUILD -> D1 QUEUE -> [release-gate Worker shim] -> [GitHub Actions gate] -> PAGES_DEPLOY -> FABLE_VERIFY
 (offline QA)   chronicle-release-queue   chronicle-release-queue-gate   (validate/apply/commit/push)
```

`OWNER_PER_RELEASE_ACTION = 0`. The Owner acts once, at bootstrap
(`docs/OWNER_ONE_TIME_SETUP.md`), and never again per release.

---

## 0. What changed from V1, and why

| # | V1 | V1.1 | reason |
| --- | --- | --- | --- |
| A | manifest embeds file bytes inline | bytes live in `release_payload` as ordered base64 chunks ≤ 512 KB; the manifest carries only a payload descriptor | a D1 row cannot reliably hold a multi-hundred-KB blob, and a single oversized manifest row would wedge the queue |
| B | GitHub holds an **account-scoped D1 read token** | GitHub holds a bearer secret for a **dedicated Worker** bound to one D1 database | **REJECTED** in V1.1 — see §1 |
| C | quarantine authority in an `actions/cache` marker | quarantine authority in the queue: the gate reports `outcome=quarantined` and the row is terminal | cache eviction made the V1 mechanism time-bounded and non-authoritative |
| D | `--allow-pipeline-admin` flag on the gate validator | flag removed; `pipeline/admin_apply.mjs` is the only path | no argument the gate could be made to pass can grant admin authority |
| E | manifest `schemaVersion: 1` | `schemaVersion: 2`, plus `manifestSha256` | the shape changed incompatibly; reusing the version number would let a V1 manifest be misread |

**Note the version bump.** V1.1 manifests are `schemaVersion: 2`. A
`schemaVersion: 1` manifest, and any manifest carrying `files[].content`, is
refused with exit 10 (harness cases T49, T50).

---

## 1. Why the account-scoped D1 token was rejected

Cloudflare's D1 permission is **account-scoped**: there is no way to scope a D1
API token to a single database. The V1 design put a "D1 Read" token in GitHub
Secrets, which would have granted read access to **every D1 database in the
account, including the production `chronicle-saves`**.

That is a standing cross-boundary capability held by a workflow that also has
`contents: write` on the repository, in exchange for one `SELECT` against one
table. The trade is not worth it, and it is not the least privilege available.

**V1.1 replacement:** a dedicated Worker, `chronicle-release-queue-gate`
(`shim/worker.js`), with:

- exactly one D1 binding, `QUEUE` → `chronicle-release-queue`;
- **no** binding to `chronicle-saves`, no account API token, no database id
  accepted from a caller;
- no arbitrary SQL — a fixed, closed set of endpoints, every statement a literal
  string with bound parameters;
- bearer auth against `RELEASE_GATE_SECRET`, compared in constant time.

GitHub now holds `RELEASE_GATE_URL` and `RELEASE_GATE_SECRET`. The worst a leak
of that secret can do is read and transition rows in the release queue — a queue
that holds candidate code already destined for a public repository. It cannot
touch `chronicle-saves`, and it cannot enumerate the account.

The shim harness asserts this structurally: `env.*` references in `worker.js`
are exactly `QUEUE` and `RELEASE_GATE_SECRET`, and nothing else (case S23).

---

## 2. Transport

The queue is a **dedicated D1 database, `chronicle-release-queue`** — never the
production `chronicle-saves`. Schema and every statement: `queue.sql`.

- **`release_queue`** — one row per release: manifest JSON **without file
  contents**, plus status, kind, and the claim/lease columns.
- **`release_payload`** — `(release_id, path, seq)` primary key, `chunk_b64`,
  `chunk_sha256`. Each chunk is at most 512 KB of base64 text, and every chunk
  except the last ends on a 4-character base64 boundary, so concatenating them
  in `seq` order yields valid base64.
- **`release_log`** — append-only audit trail.

Writers: Fable (enqueue, manual lease recovery) and the shim (the three state
transitions). Readers: the shim only. GitHub Actions never speaks D1.

### Shim API

| route | auth | purpose |
| --- | --- | --- |
| `GET /health` | none | build marker only |
| `POST /claim` | bearer | atomically claim the oldest non-admin `queued` row → 200 or 204 |
| `GET /release/:id/manifest` | bearer | the manifest |
| `GET /release/:id/payload/index` | bearer | `[{path, seq, sha256}]`, no bodies |
| `GET /release/:id/payload?path=&seq=` | bearer | one chunk |
| `POST /release/:id/result` | bearer | `claimed` → `applied` \| `quarantined`, or 409 |

There is deliberately **no `/recover`**. See §5.

---

## 3. Claim, lease and quarantine

### 3.1 Atomic claim

`POST /claim` runs one D1 batch (one transaction). The UPDATE selects its own
target through a correlated subquery, so selection and transition are the same
statement; `changes` is then asserted to be exactly 1, and 204 is returned
otherwise. Two concurrent claims therefore produce exactly one 200 and one 204
(case S07). `COALESCE(kind,'pages') <> 'pipeline-admin'` is in both the WHERE
clause and the subquery, so a pipeline-admin row is never handed out and never
blocks the queue behind it (case S09).

A claim takes a **30-minute lease** and a random `claim_token`.

### 3.2 Quarantine — authority lives in the queue

On any failure the gate calls `POST /result` with `outcome=quarantined` and the
validator exit code. That transition is terminal: nothing in the shim can set a
row back to `queued` (case S20 asserts no such statement exists in the source).
The next cron tick 10 minutes later finds nothing claimable.

This replaces V1's `actions/cache` marker entirely. The workflow now keeps **no
state between runs**, and quarantine is no longer bounded by a 7-day cache
eviction window.

Four layers still hold NO_RETRY_UNTIL_PASS:

| layer | mechanism | window |
| --- | --- | --- |
| L1 | `status='quarantined'` in D1, written by the gate through the shim | permanent |
| L2 | the 30-minute lease: a claimed row is not claimable, even mid-run | 30 min |
| L3 | `Release-Id` trailer scan in `git log` → validator exit 18 | permanent |
| L4 | at most one row in `queued` **or** `claimed`, enforced by the enqueue statement | permanent |

### 3.3 Failure modes

| # | failure | consequence | why it is acceptable |
| --- | --- | --- | --- |
| F1 | gate dies between `/claim` and `/result` | row stays `claimed`; lease expires after 30 min; **nothing re-queues it** | deliberate. The outcome is unknown, and NO_RETRY_UNTIL_PASS forbids retrying an unknown outcome. Fable reconciles manually (§5). |
| F2 | gate dies *after* push, before `/result` | the commit is in git; the row is stuck `claimed` | Fable sees the `Release-Id` trailer and marks it applied (`queue.sql` 5a). No double-apply is possible: exit 18 would stop a second attempt. |
| F3 | `/result` returns 409 (lease expired mid-run) | run logs a warning and fails; row stays `claimed` | same as F1; the summary tells Fable to reconcile. |
| F4 | shim unreachable | the run fails at `/claim`; no row changes | fail-closed. Nothing is written to the repo. |
| F5 | `RELEASE_GATE_SECRET` leaks | read + state transitions on the release queue only | no access to `chronicle-saves`, no account enumeration. Rotation = redeploy the Worker secret + update one GitHub secret. |
| F6 | a chunk is corrupted in D1 or in transit | validator exit 19, nothing applied | three independent digests: per-chunk `chunk_sha256` (checked in the workflow **and** the validator), `payloadSha256` over the reassembled base64, and `afterSha256` over the applied file. |
| F7 | branch moved between build and apply | exit 11, reported as quarantined, not retried | correct: the manifest was built against a stale base. Branch protection keeps the branch append-only, so a base sha is never revisited. |
| F8 | push rejected | exit 11, reported as quarantined | same. |

---

## 4. Manifest (schemaVersion 2)

`manifest.schema.json` is normative. Changes from V1:

```jsonc
"manifestSha256": "<64-hex>",         // NEW, top level
"files": [{
  "path": "...", "operation": "new|change|delete",
  "beforeSha256": "...", "afterSha256": "...", "size": 1234,
  "payload": {                        // REPLACES files[].content
    "encoding": "full-base64|patch-base64",
    "payloadSha256": "<64-hex>",      // over the reassembled base64 TEXT
    "chunkCount": 2,
    "totalBytes": 934000              // length of the base64 TEXT, not the file
  }
}]
```

**`manifestSha256`** is sha256 over the UTF-8 bytes of the canonical manifest
JSON: every object's keys sorted by code unit, arrays in order, no whitespace,
and the `manifestSha256` property removed before serialization. The canonical
form is pinned by harness case T01:

```
{"a":1,"b":2,"n":null,"z":[3,{"x":2,"y":1}]}
```

**`totalBytes` vs `size`** — the one field pair worth reading twice:
`totalBytes` is the length of the **encoded** payload (the base64 text, i.e. the
sum of all `chunk_b64` lengths). `size` is the length of the **decoded** file
after the operation. They are checked independently.

Limits: `maxFiles` 32, `maxTotalBytes` 4 MB, `maxFileBytes` 1 MB,
`maxChunkBytes` 512 KB. A manifest may declare lower values, never higher.

The Pages contract (`version.txt` / `BUILT` / `HOME_BUILT` trio co-movement,
`version.txt == "<releaseId>\n"`) is unchanged from V1.

---

## 5. Lease recovery is manual, on purpose

If a run dies between `/claim` and `/result`, the row stays `claimed` and its
lease expires. The shim exposes no endpoint that can un-claim it, because an
automatic un-claim **is** a retry path, and a release whose outcome is unknown
is exactly the case NO_RETRY_UNTIL_PASS exists to stop.

Fable reconciles by hand (`queue.sql` §5):

1. Check `v292-rebuild` for a `Release-Id: <releaseId>` trailer.
2. **Trailer present** → the release landed; mark it `applied` (5a).
3. **Trailer absent and the lease has expired** → outcome unknown; mark it
   `quarantined` and rebuild under a **new releaseId** (5b). Never re-queue.

---

## 5b. V1.2: the claim names its gate

From shim `release-gate-shim-v1.2.0`, `POST /claim` takes a required body
`{"kind":"pages"|"worker"}` naming the claiming **gate**, and returns only that
gate's rows. `pages` covers both `kind: pages` and `kind: rollback` — a rollback
is a Pages release. Worker releases belong to `chronicle-worker-gate.yml`.

An absent or unknown kind is **400, not "any kind"**. The queue allows at most
one row queued-or-claimed at a time and there is deliberately no un-claim, so a
gate that claimed the wrong kind could not give it back; a shim that served any
row to a caller which forgot the filter would reintroduce exactly that.

This makes the shim paste and the workflow update a single atomic change: see
`OWNER_ONE_TIME_SETUP.md` A2/A3. A 400 at the claim step means the shim is still
v1.1.x.

## 5c. Queue values never reach a shell as command text

A manifest is hostile input. The rule is that no queue-derived string is ever
pasted into a command line; it travels as an `env:` variable referenced inside
quotes, or as a file, or as one element of an argv array.

Enforced statically, on every run of the acceptance suite, over **both**
workflow files:

- no GitHub `${{ }}` expression inside any `run:` body;
- every `env:` variable reference in shell text is inside quotes — checked with
  a real quoting state machine, not a regex, after blanking the heredoc bodies
  (which are JavaScript, and `<<'MJS'` means the shell expands nothing in them);
- every heredoc delimiter is quoted;
- no `eval`, no `sh -c` / `bash -c`, no `xargs` without `-0`, no `source` of a
  variable path, no unescaped backtick;
- the validator invokes git only through `execFileSync` with an argv array,
  never a shell, and delivers the commit message with `git commit --file=-`
  (`-F -`, on stdin) rather than as argv text.

At the schema boundary the validator additionally refuses: control characters,
CR, NUL, bidi and zero-width marks in `commitMessage` and `note`; any path
segment beginning with `-` (an argv consumer would read it as an option); and a
`commitMessage` carrying a second `Release-Id:` trailer or any identity trailer
(`Co-Authored-By`, `Signed-off-by`, …) that the gate does not itself add.

Shell metacharacters are *accepted* in `commitMessage` prose — quotes, `$(…)`,
backticks, `;`, `&&`, `|` all commit verbatim — precisely because the message
never touches a shell. The acceptance suite pins that too: those cases assert
the commit is made and the bytes survive.

A 21-string injection corpus (newline, CR, CRLF, quotes, `${…}`, `$VAR`,
backtick, `$(…)`, `;`, `&&`, `|`, `>`, NUL, ESC, zero-width space, RTL
override, BOM, Cyrillic and fullwidth homoglyphs, a GitHub expression, and a
leading `-`) is applied permanently to `releaseId`, file paths, `commitMessage`,
`note`, `kind`, manifest key names and chunk record fields.

## 6. Path authority and the admin split

Denied for `pages`/`rollback` (exit 12): absolute paths, `.`/`..`/empty
segments, backslashes, control characters, any `.git` segment, `.github/**`,
`pipeline/**` except `pipeline/PROBE.md` and `pipeline/probes/<name>`,
`.gitattributes`/`.gitmodules` at any level, and any path whose target or an
ancestor is a symlink (checked by `lstat` on every ancestor, by index mode
`120000`, and by a `realpath` containment check).

### `kind: rollback` must actually roll back  (V1.1-R)

`rollbackOf` is **load-bearing**, not a label. The release it names must be
findable in the target branch's history by its `Release-Id:` trailer, and must
be a single-parent commit; the state to restore is that commit's **parent**
tree, because rolling back X means undoing X.

- every declared file's `afterSha256` and `size` must equal the blob recorded at
  `commit(rollbackOf)^:<path>` (exit 14, `rollback.bytes`);
- a path that did not exist before that release must be `delete`d, and one that
  did exist must not be (exit 14);
- the set of non-trio paths in the rollback must **equal** the set of non-trio
  paths that release changed — no partial rollback, no smuggled edit (exit 10);
- an unknown `rollbackOf` is refused (exit 10): there is no recorded state.

**Exemption, by construction.** The Pages version trio (`version.txt`,
`index.html` `BUILT`, `home.html` `HOME_BUILT`) is exempt from byte-exactness,
because `pagesContract` requires those three to carry the **rollback's own**
`releaseId`. Restoring their earlier bytes would make the live deploy marker
report a releaseId that is not deployed. They are still required to be part of
the set the rolled-back release moved, and the Pages contract still pins their
content exactly. See `docs/V11_REAUDIT.md` F2.

`kind: pipeline-admin` can be applied **only** by `pipeline/admin_apply.mjs`,
which requires `--i-am-the-owner-session` and refuses any manifest that is not
`pipeline-admin`. Three independent barriers keep it out of the gate:

1. the shim never hands out a `pipeline-admin` row (S09);
2. `validate_and_apply.mjs` exposes no flag that grants it — `runGate()` takes
   `allowPipelineAdmin`, and the CLI hard-codes `false` (T48: passing the old
   flag is an unknown-argument error, exit 2);
3. the workflow file contains neither the flag name nor the admin script name,
   enforced by a grep guard in the harness (T51).

---

## 7. Validator

`pipeline/validate_and_apply.mjs` — Node ≥ 18, zero dependencies.

```
node pipeline/validate_and_apply.mjs --repo <dir> [--manifest <file>|-]
     [--payload <chunks.json>] [--no-commit] [--json <out>] [--quiet]
```

`--payload` is the `release_payload` rows as JSON:
`[{path, seq, chunk_b64, chunk_sha256}]`.

### Check order

1. schema, schemaVersion 2 (**10**)
2. `manifestSha256` over the canonical manifest (**19**)
3. authority — pipeline-admin refused (**12**)
4. limits (**17**)
5. paths + symlinks (**12**)
6. **payload reassembly** (**19**, or **17** for an oversized chunk): no
   duplicate `seq`, complete run `0..chunkCount-1`, `chunkCount` matches the row
   count, per-chunk `chunk_sha256`, 4-char alignment on non-final chunks, no
   chunks for undeclared paths, reassembled length == `totalBytes`, reassembled
   digest == `payloadSha256`
7. commit trailer (**10**)
8. static Pages contract (**16**)
9. `baseCommit == HEAD` (**11**)
10. clean tree (**15**)
11. duplicate releaseId in history (**18**)
12. `beforeSha256` (**13**)
13. apply
14. `afterSha256` + `size` (**14**)
15. `git status` set == manifest set (**15**)
16. Pages contract on applied bytes (**16**)
17. commit as `Chronicle Release Gate`
18. post-commit: `HEAD^ == baseCommit`, one parent, trailer, author, every blob
    re-hashed from `git cat-file`, file modes, clean tree

Exit codes: 0 ok · 10 schema · 11 base · 12 path · 13 before · 14 after ·
15 unrelated · 16 pages · 17 limits · 18 duplicate · **19 integrity** · 2 internal.

All-or-nothing: any failure after the apply step triggers
`git reset --hard && git clean -fdq` before returning.

---

## 8. The gate workflow

`.github/workflows/chronicle-release-gate.yml` — `schedule: */10 * * * *` +
`workflow_dispatch` (with `dry_run`), `concurrency: {group: release-gate,
cancel-in-progress: false}`, `permissions: {contents: write}`.

Steps: checkout `v292-rebuild` full history → `POST /claim` (204 → done) →
download the payload index and every chunk, verifying each against the index
`sha256` → run the validator → `git push` (no force) → `git ls-remote` re-verify
→ `POST /result` with `applied` or `quarantined` → run summary.

The claim token is masked with `::add-mask::` as soon as it is received. Secrets
reach the steps through the environment, never a command line, and no step
echoes a response body on a failure path.

A **dry run** claims a release, validates it, and reports **nothing** — the
lease simply expires, leaving the row for manual reconciliation. Use dry runs
against an empty queue for setup verification.

---

## 9. Acceptance

**Validator — 51/51** (positive 9, negative 42). Fixture repo mirrors
`release/20260919-sp6`. Case T05 replays the real `sp6 → sp7` release through
the chunk path (2 real `diff -u` patches, 1 full file, 1 new file) and asserts
the committed `index.html` and `home.html` are **byte-identical** to
`release/20260919-sp7`. T07 round-trips a 700 KB file across 2 chunks.

New V1.1 negatives (13): oversized chunk → 17; missing chunk, duplicate chunk,
seq-run corruption, `chunk_sha256` mismatch, `totalBytes` mismatch,
`payloadSha256` mismatch, `chunkCount` mismatch, post-seal manifest tamper,
chunks for an undeclared path, chunks on a delete-only release, no chunks at
all, non-final chunk misaligned → all 19.

**Worker shim — 36/36**: auth (5), claim atomicity and exclusions (5), reads
(3), result/lease/token (6), no-recover (1), injection surface and input
validation (6), transport hygiene (2), end-to-end (1), re-audit regressions (5).
Run offline against real SQLite through a D1 adapter.

**Validator — 136/136** (24 positive / 112 negative), including 8 rollback
byte-restoration cases built against a real prior release commit, a
non-canonical-base64 payload case, and a workflow guard that fails on any
GitHub `${{ }}` expression inside a `run:` body. Full findings, fixes and run
history: `docs/V11_REAUDIT.md`.

---

## 10. Out of scope for V1.1

- **Worker deploy for the product Worker** — still Pipeline V2. Minimum V2
  manifest: `targetWorker`, `expectedCurrentBuild`, `newBuild`, `workerSha256`,
  expected env delta, `rollbackSha256`; a release declaring no env change that
  carries an env delta must FAIL.
- **Manifest signing** — not required: the transport is private and
  write-authority is limited to Fable.
