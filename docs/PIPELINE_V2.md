# Chronicle Release Pipeline V2 — Worker auto-deploy

Status: **offline candidate.** Nothing here has been deployed, pushed, or run
against production. `WORKER_V43_DEPLOY = WAIT_PIPELINE_V2` still holds: the
order is Pipeline V1.1 CLOSE → two green Pages releases → this → the v42 no-op
probe → v43 → sp8 client.

```
FABLE_BUILD → D1 QUEUE (kind='worker') → [shim v1.2] → [chronicle-worker-gate]
            → wrangler deploy → POLL GET / → FABLE_VERIFY
```

Pages and Worker releases share one queue, one shim and one bearer secret, and
are otherwise completely separate: different workflow file, different
concurrency group (`worker-gate`), different validator, different Cloudflare
credential. The Pages gate has no Cloudflare token; the worker gate has no push
credential (`permissions: contents: read`, `persist-credentials: false`).

---

## 1. The manifest — `schemaVersion: 3`, `kind: 'worker'`

| field | rule |
| --- | --- |
| `targetWorker` | must be the literal `novel-proxy`. Pinned in the validator, not taken as a free string. |
| `expectedCurrentBuild` | the `workerBuild` the release was built against. Checked against the **live** Worker before anything is deployed. |
| `newBuild` | the `workerBuild` the new bytes report. |
| `noop` | **required `true`** when `expectedCurrentBuild == newBuild`; forbidden otherwise. |
| `workerSha256` / `workerSizeBytes` | sha256 and length of the reconstructed `worker.js`. Both re-derived and compared. |
| `expectedEnvDelta` | **must be `[]`** in V2.0. Any entry ⇒ exit 21. |
| `rollbackSha256` / `rollbackBuild` | the bytes and marker to return to. `rollbackBuild` must equal `expectedCurrentBuild` — the state to roll back to *is* the state this release replaces. For a no-op, `rollbackSha256` must equal `workerSha256`. |
| `bindings` | **mandatory and exact**: `d1_databases` must be exactly `[DB]`, `kv_namespaces` exactly `[LEDGER]`, with ids. Names and ids only — never a secret value. Section 3 explains why this is not optional. |
| `compatibilityDate` | a pinned `yyyy-mm-dd`. Absent or unpinned ⇒ exit 10. |
| `compatibilityFlags` | **required**, and may be `[]`. Rendered into `wrangler.toml` always, empty included. Absent ⇒ exit 10. |
| `payload` | `{path:'worker.js', encoding:'full-base64', payloadSha256, chunkCount, totalBytes}`. A Worker script is never patched; it is replaced whole. |

The payload travels as `release_payload` chunk rows — the same chunked D1
transport, the same 4-character base64 boundary rule, the same per-chunk
sha256, and the same base64-canonicality check added in V1.1-R (F4).

**Exit codes:** 0 OK · 10 schema · 12 target authority · 14 sha/size ·
17 limits · 19 integrity · 20 live pre-check · 21 env/binding contract ·
2 internal.

---

## 2. The workflow

`chronicle-worker-gate.yml`, `concurrency: group: worker-gate`,
`cancel-in-progress: false`, `*/15` cron plus `workflow_dispatch` (with a
`dry_run` input that validates and renders `wrangler.toml` without deploying).

1. **Claim** — `POST /claim {"kind":"worker"}`. Re-checks `releaseId`, `kind`
   and `targetWorker` client-side, masks the claim token.
2. **Fetch chunks** — each verified against the payload index sha256; capped at
   64 chunks / 4 MB; refuses any path other than `worker.js`.
3. **Live pre-check** — `GET https://novel-proxy.sansan2103.workers.dev/`,
   read `workerBuild`, 3 attempts.
4. **Validate** — `pipeline/validate_worker_release.mjs` with `--live-build`.
   It writes `worker.js` and `wrangler.toml` **only** when every check passed,
   so a failed run can never leave a half-verified script where the deploy step
   would find it (harness case W33).
5. **Deploy** — `cloudflare/wrangler-action@v3`, `command: deploy --config
   wrangler.toml`, working directory = the rendered deploy dir. This is the
   only step that sees `CLOUDFLARE_API_TOKEN`, and it reaches the action
   through `with:`, never through a shell.
6. **Poll** — `GET /` every 10s for up to 5 minutes until `workerBuild ==
   newBuild`. Timeout ⇒ report, **never** an automatic rollback.
7. **Report** — `applied` or `quarantined` to the queue. Terminal either way.

No value that originated in the queue is interpolated into a shell body with
`${{ }}` — the harness fails the build if any appears (this is the V1.1-R F1
finding, applied to V2 from the start).

**Rollback is a new release, not an action.** To roll back, Fable enqueues
another `kind:'worker'` release whose payload is the `rollbackSha256` bytes,
with `expectedCurrentBuild` set to whatever is live at that moment. Automatic
rollback would be a retry, and NO_RETRY_UNTIL_PASS forbids retrying a release
whose outcome is unknown.

---

## 3. THE CRITICAL RISK — does `wrangler deploy` drop bindings?

**Short answer: assume yes for bindings and vars; no for secrets. The manifest
therefore carries the full binding set and the generated config sets
`keep_vars = true`.**

### What the documentation actually says

1. **A version is the complete state, not a patch.**
   > "A version captures the complete state of your Worker at a point in time:
   > its bundled code, static assets, bindings, and compatibility settings."
   — [Versions and deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)

   `wrangler deploy` uploads a new version built from the Wrangler
   configuration. Bindings are *part of* that version, so they come from the
   configuration, not from whatever the previous version had.

2. **Vars are deleted and re-set unless you opt out.**
   > "If you change your environment variables in the Cloudflare dashboard,
   > Wrangler will override them the next time you deploy. If you want to
   > disable this behaviour set `keep-vars` to `true`."
   — [`wrangler deploy`](https://developers.cloudflare.com/workers/wrangler/commands/workers/)

   With `keep_vars` false (the default) Wrangler deletes all vars before
   setting those in the configuration.

3. **Secrets are safe.**
   > "Secrets are never deleted by a deployment whether this flag is true or
   > false."
   — [`wrangler deploy`](https://developers.cloudflare.com/workers/wrangler/commands/workers/)

   and, for the `--secrets-file` path:
   > "Existing secrets not included in the file are preserved from the previous
   > version."
   — [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

4. **The configuration file is the source of truth, and the dashboard fields
   become read-only.** Stated explicitly for Pages Functions, which use the
   same Wrangler config model:
   > "When used in your Pages Functions projects, your Wrangler file is the
   > source of truth. You will be able to see, but not edit, the same fields
   > when you log into the Cloudflare dashboard."
   — [Pages Functions Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

### What the documentation does **not** say

There is **no** statement anywhere that KV, D1 or Durable Object bindings
configured in the dashboard are inherited by a deploy that does not declare
them. The `keep_vars` escape hatch exists for vars and has no equivalent for
bindings — which is itself evidence: if bindings were inherited, `keep_vars`
would be unnecessary for the class of things a deploy replaces.

### The conclusion this pipeline acts on

Combining (1) and the absence of any inheritance promise: **a `wrangler.toml`
without `[[d1_databases]]` and `[[kv_namespaces]]` produces a live Worker whose
`env.DB` and `env.LEDGER` are `undefined`.** For novel-proxy that is
catastrophic and *silent*: `wrangler deploy` reports success, the root JSON
still answers (it reads `env.DB` only as a boolean `d1:` flag), and every
`/save` returns the `no-binding` contract while every session lookup and image
ledger write fails. The worker's own header says it plainly, at line 742:

> `・**binding を 1 つも増やさない**（NO_BINDING_CHANGE。増やすと Cloudflare 側で rollback が拒否される）。`

So V2 does not rely on inheritance:

- `bindings` is a **required** manifest field, and the validator refuses a
  manifest whose D1 set is not exactly `[DB]` and KV set not exactly `[LEDGER]`
  — under-declaring removes a binding, over-declaring adds one nobody reviewed.
  Harness cases W11–W15.
- the generated `wrangler.toml` renders those bindings and sets
  `keep_vars = true`, so the ~23 plain-text vars are preserved as well.
- secrets need no protection and are never touched: no `wrangler secret`, no
  `--secrets-file`, no `--var`. The harness fails the build if any appears.

**One Owner confirmation is still required**, and it is unavoidable: the
`database_id` of `chronicle-saves` and the namespace `id` of `LEDGER` are
account facts this repository cannot know. They are names and ids, not
credentials. See `OWNER_ONE_TIME_SETUP_V2.md` item 3.

### `compatibility_date` and `compatibility_flags`

**Neither is determinable from here. Both are required manifest fields, and the
Owner supplies them once.**

`compatibility_flags` is required *and allowed to be empty*, deliberately. It is
part of the version exactly as the date is, so a flag that is live today and
missing from the rendered config is **switched off by the deploy** - the same
silent-removal failure as a dropped binding. Defaulting it to `[]` would make
"no flags" indistinguishable from "nobody was asked"; requiring it makes the
empty array an answer someone gave. It is rendered into `wrangler.toml`
unconditionally, including as `compatibility_flags = []`.

**What was tried machine-side, and why it failed.** The Cloudflare connector
available here exposes `workers_get_worker`, and for `novel-proxy` it returns
only:

```
name          id
novel-proxy   405d25292e694c3bb1f80cb965c375de
```

No compatibility settings, no flags, no bindings. No connector method reads
script settings, so this cannot be obtained without the Owner.

**Three ways the Owner can get it** (any one; the dashboard is simplest):

1. **Dashboard** - Workers & Pages -> `novel-proxy` -> **Settings -> Runtime** ->
   *Compatibility date* and *Compatibility flags*. No token, no CLI.
2. **Wrangler** - `wrangler versions list` to find the deployed version id, then
   `wrangler versions view <VERSION-ID>`, which shows that version's details
   including its compatibility settings.
3. **REST, one curl with the Owner's own token** (Workers Scripts **Read** is
   enough; the Part B token already has Edit, which includes it):

   ```
   curl -s -H "Authorization: Bearer $CF_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/e983beada2b20fa639184ad49e18329e/workers/scripts/novel-proxy/settings" \
     | jq '{compatibility_date, compatibility_flags, bindings: [.bindings[]?|{type,name}]}'
   ```

   That is the *Get Worker Script Settings* endpoint,
   `GET /accounts/{account_id}/workers/scripts/{script_name}/settings`. I could
   not render its API-reference page to quote the response schema verbatim, so
   treat the exact shape as **unconfirmed**: if it 404s, the older
   `.../workers/scripts/novel-proxy/script-settings` is the fallback spelling.
   **Report whatever it prints** - the same call also answers the bindings
   question in section 3, which is why it is worth one curl.

   The token is the Owner's, typed by the Owner, run by the Owner. It is never
   pasted into a Claude conversation, and neither this pipeline nor this session
   ever calls that endpoint.

*Why it must be right.* Compatibility settings are part of a Worker version
(citation 1). Omitting the date makes Wrangler pick one; omitting a live flag
turns it off. Either moves the runtime under a release whose only intent is to
change bytes. The validator refuses a manifest missing either field.

---

## 4. The no-op probe — first worker release

The first release through this pipeline changes nothing:

| field | value |
| --- | --- |
| payload | `release/storypass_w6/worker.js` — the bytes already live |
| `workerSha256` | `1d573e360a70b547ade182aad84dd6c7602a525f30537b5b935cc628bbc6fa1d` |
| `workerSizeBytes` | `323937` |
| `expectedCurrentBuild` | `v42.0-provenance` |
| `newBuild` | `v42.0-provenance` |
| `noop` | `true` |
| `rollbackSha256` | the same digest |
| `expectedEnvDelta` | `[]` |

It exercises the claim filter, the chunked transport, the sha/size checks, the
live pre-check, the rendered `wrangler.toml`, the real `wrangler deploy`, the
poll and the queue report — with zero behavioural change if it works, and a
byte-identical Worker if it does not.

**The honest limitation, enforced in code.** Because `expectedCurrentBuild ==
newBuild`, the post-deploy poll *cannot* distinguish "deployed successfully"
from "never deployed at all" — it would pass either way. The validator
therefore requires `noop: true` (exit 10 otherwise), and both the poll step and
the run summary say so in as many words. **The proof that the probe deployed is
the new version id in the `wrangler deploy` output, not the poll.** Read it
before declaring the probe green.

---

## 5. Prerequisite: shim v1.2

`v2/shim/worker.js` is `release-gate-shim-v1.2.0`. The whole delta from
v1.1.1 is that `POST /claim` now takes a required body `{"kind":"pages"|"worker"}`
and only hands out rows that gate owns (`pages` covers `pages` **and**
`rollback`).

This is not optional. The queue's enqueue statement allows **at most one row
queued-or-claimed at a time**, and there is deliberately no un-claim: without a
filter, whichever gate polled first would claim the other's release and could
not give it back. An absent or unknown `kind` is **400, not "any kind"** — a
shim that silently served any row to a caller that forgot the filter would
reintroduce the bug it closes.

Because v1.2 refuses a claim with no kind, the shim paste and the
pipeline-admin release that teaches `chronicle-release-gate.yml` to send
`{"kind":"pages"}` **must ship together**. Harness case W35 covers all of it.

---

## 6. Harness

`pipeline_v2_acceptance_v1.mjs` — **35/35 PASS** (6 positive, 29 negative),
offline, no network, no wrangler, no Cloudflare account.

- positives: the real v42 no-op probe end to end (byte-exact round trip +
  `wrangler.toml` assertions), a build-changing release, a 7-chunk payload;
- negatives: env delta ×2, sha mismatch, size mismatch, wrong `targetWorker`,
  missing `rollbackSha256`, live-build mismatch, six binding-contract cases,
  two compatibility-date cases, four no-op/rollback consistency cases, and
  eight schema/integrity cases;
- the failed-validation case asserts the deploy directory is left **empty**;
- the workflow is YAML-parsed, every `run:` body passes `bash -n`, every
  embedded `MJS` heredoc passes `node --check`, and 12 forbidden tokens
  (api-token echo, `CF_D1_READ_TOKEN`, `api.cloudflare.com`, `wrangler secret`,
  `secrets-file`, `d1 execute`, `chronicle-saves`, `--var`, `set -x`, secret
  echoes) are absent from the executable text;
- shim v1.2's filter is exercised against a real SQLite queue.

---

## 7. Out of scope for V2.0

- **Any env, var, secret or binding change.** `expectedEnvDelta` must be `[]`.
  A release that needs one is an Owner dashboard action plus a separate code
  release afterwards.
- **Automatic rollback.** A rollback is a new queued release.
- **Any Worker other than `novel-proxy`.**
- **Gradual deployments / version splits.** V2.0 deploys one version to 100%.
- **Manifest signing** — unchanged from V1.1: the transport is private and
  write authority is limited to Fable.
