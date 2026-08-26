# WORKER v38 RECOVERY PROVENANCE

回収日: **2026-08-26**（ファイル mtime 2026-08-25 23:50:32 UTC / ローカル表示 8:50）
作成: 本セッション（Claude Opus）／裁定根拠: RULING117-C・RULING117-C2

## 1. 回収の来歴

| 項目 | 値 |
|---|---|
| Worker / script 名 | **`worker.js`**（Cloudflare Workers エディタ上の表示名）|
| service | `chronicle-proxy` |
| 公開 URL | `https://novel-proxy.sansan2103.workers.dev` |
| **deployment 識別子** | **`ed4e03f7`** |
| deployment 状態表示 | **「アクティブ」「最新」** |
| 取得元 | Cloudflare Workers ダッシュボードのコードエディタ |
| 取得者 | owner（おしん）|
| 取得方法 | エディタ表示内容をコピーし、ローカルにテキストファイルとして保存 |
| エディタ表示行数 | **3,703 行** |
| 保存先 | `chronicle\repair\chronicle-proxy-v38_recovered_active_2026-08-26.js` |

### Cloudflare 側で行った操作

| 操作 | 件数 |
|---|---|
| EDIT | **0** |
| SAVE | **0** |
| DEPLOY | **0** |
| その他の変更 | **0** |

**読み取りのみ。** 本セッションは Cloudflare ダッシュボードへ一切アクセスしていない（資格情報を保持しておらず、資格情報の入力も運用規則で禁止されている）。

## 2. 受領ファイルの実測値

```
file    : chronicle-proxy-v38_recovered_active_2026-08-26.js
bytes   : 272,071
sha256  : dc3c44b1283aa546bd316e18fe4c6c48aa726d6ea90856f210362b972e58ded0
BOM     : なし
改行     : CRLF × 3,702（単独 LF: 0 ＝ 混在なし）
末尾改行 : なし
論理行数 : 3,703  ← エディタ表示の 3,703 行と完全一致
JS 文字数 : 231,568（UTF-16 code unit）
```

### ★ 改行コードについて（重要・正直に記す）

受領ファイルは **CRLF** で保存されている。Cloudflare の Worker ソースは通常 **LF** であり、Windows 上でテキストエディタを経由した保存で変換されたと考えるのが自然。

したがって **hash を 2 つ記録する**:

| 版 | bytes | sha256 |
|---|---|---|
| **受領そのまま（CRLF）** | 272,071 | `dc3c44b1283aa546bd316e18fe4c6c48aa726d6ea90856f210362b972e58ded0` |
| **LF 正規化** | 268,369 | `b6acb1408e13bb9a5d57fed2153a80a38e7ed8010487ae5d5bb14df07ae12b0a` |

差分は **3,702 バイト = 1 行あたり `\r` 1 個**で、内容の欠落・追加は無い。

**deployed script が LF なら対応するのは LF 正規化版**だが、Cloudflare 側の bytes / hash を取得する手段が本セッションには無いため、**どちらが deployed と byte-identical かは確認できていない**。

`WORKER_V38_DEPLOYED_LINE_ENDING = UNVERIFIED`

安心材料として、**混入していたら別物確定になる要素はすべて陰性**:

- BOM **なし**（付いていれば内容不一致が確定していた）
- 単独 LF **0**（変換が全行一貫しており、部分的な壊れがない）
- 末尾改行 **なし**（エディタ最終行に改行が無いのと整合）
- 論理行数 **3,703**（エディタ表示と一致）

## 3. deployed との対応検証（回収ファイルから機械的に実施）

### live 実測

```
GET https://novel-proxy.sansan2103.workers.dev/  cache:'no-store'
200 / 810 B / sha256 21265c7bb66c7a29b37d6aeeae72c97f445dd655f25488d56030dd09113615c7
workerBuild = "v38"
```

### banner literal の照合

回収ファイルから `return json({ ok: true, service: 'chronicle-proxy' … }, 200, request)` のオブジェクトリテラルを機械抽出し、live 応答の実キー列と比較:

```
file literal keys  : 33
live response keys : 33
IDENTICAL ORDER    : True
```

**33 キー、値、挿入順すべて一致。**

### 識別力の高い一致点

| marker | 回収ファイル内の出現 | live |
|---|---|---|
| `workerBuild: 'v38'` | 1 | `"v38"` |
| **`cfgScrub: 1`** | 1 | `1` |
| **`storyTitleWrite: 1`** | 1 | `1` |
| `CHR_LEGACY_PROTOCOL_MIN = 1` | 1 | `legacyProtocolMin: 1` |
| `HASH_ALG_V25 = 'sha256-utf8-v1'` | 1 | `capabilities.packageHash` |

`cfgScrub` と `storyTitleWrite` は **R117-C で調べたアーカイブ済み artifact（local v29 / repo v33・v34・v35）のいずれにも出現 0**。

### 実装されている op

`op === 'setstorytitle'` ×2 ／ `op === 'scrubstorycfg'` ×2 ／ `op === 'deletecanonical'` ×2 ／ `op === 'promotestory'` ×3
（v38 / v36 / v35 で追加された op が揃っている）

## 4. 結論

- **`WORKER_V38_FILE_ARTIFACT = RECOVERED`**
- **`WORKER_V38_FUNCTIONAL_SOURCE_AUTHORITY = ESTABLISHED / HIGH CONFIDENCE`**（33/33 banner 一致、回収ファイルから機械検証）
- **`WORKER_V38_DEPLOYED_LINE_ENDING = UNVERIFIED`** → byte-identity は CRLF/LF のどちらかに帰着するが未確定
- **本ファイルを `BYTE_IDENTICAL_DEPLOYED_SOURCE` とは呼ばない**（RULING117-C2 の呼称規約）
- 呼称は **`RECOVERED_V38_FUNCTIONALLY_BOUND_SOURCE`**

## 5. 未クローズ

**`WORKER_DEPLOYED_BUILD_NOT_REPRODUCIBLE_FROM_CURRENT_SOURCE_CONTROL`**

回収ファイルは owner のディスクにあるが、**repository へ commit するまでこの risk は閉じない**。commit 先の候補: `sansan2103-a11y/chronicle` の `v292-rebuild` ブランチ（既存の `chronicle-proxy-v29`〜`v35` と同じ場所）。

## 6. 本ファイルの取り扱い

- 内容は Cloudflare Worker のソースコード。`env.OPENROUTER_KEY` などの**変数名**は含むが、**秘密値そのものは含まない**（すべて環境変数参照）
- 本セッションはこのファイルを**読み取りのみ**で使用し、改変していない
