# DEVELOPMENT — Chronicle の開発運用（開発担当向け）

> 下書き（laneDOCS・2026-10-31）。基準：本番 Pages `20261031-bundle71-ednedg-a`、Worker `v46.7-ns-converge`（ソース `w_wm3.js` sha `c4658504`）、管理者画面 `44aceb9c`。
> **この文書は公開リポジトリに置く前提です**（GPT #127-OO）。秘密の値・認証の細部・直っていない弱点の具体的な突き方・個人情報・物語の ID は書いていません。Worker の内部（表・環境変数・操作の一覧）は大まかな分類だけにしています。細部は非公開の記録（Owner PC の台帳など）を見てください。
> 「未確認」と書いた点は、この下書きの時点でコードや記録から確かめられなかったものです。

## 1. 全体の構成

```
[ブラウザ: PC / iPhone]
  home.html（物語の一覧）  index.html?story=<id>（ゲーム画面）  ← Cloudflare Pages: chronicle-app.pages.dev
     │  fetch は fix247 が Worker 宛てへ、fix893 が same-origin の /api/* へ付け替える
     ▼
  /api/*  ← Pages Function（/api を外して Worker へそのまま渡す）
     ▼
[Cloudflare Worker: novel-proxy]（認証・AI 中継・保存・画像・Vault・管理）
     ├─ D1               … 物語の保存・アカウント・画像・Asset v2・Vault など
     ├─ KV               … 全体設定・利用台帳
     ├─ OpenRouter        … 文章の AI（既定 deepseek/deepseek-v4.1-flash）
     └─ 画像の AI         … Together（Asset v2 は FLUX 系）・Pollinations・Fireworks（予備）
[管理者画面] 別の Pages（Owner だけが使う）→ Worker の管理用の経路
```

- **コードの正本**：GitHub `https://github.com/sansan2103-a11y/chronicle`、ブランチ `v292-rebuild`（`main` は使わない）。このブランチへのコミットが Cloudflare Pages の本番に自動で反映される（出荷手順の記録で確認。Pages 側のビルド設定の値は未確認）。リポジトリの中身と配信物 `pages_full.zip` が完全に一致するかは未確認。
- **Pages**：静的ファイル 377 本（`index.html`・`home.html`・`backup.html`・`features.js`・`v292D*.js`・`version.txt` など）。ビルドは無く、ファイルをそのまま配信する。
- **Pages Function**：`/api/*` を Worker へ渡すだけの小さな関数。配信物の zip には入っていない（置き場所と中身の本番照合は未確認）。
- **Worker の経路**（大まかな分類）：版と能力の確認（`GET /` の JSON。`workerBuild` で版を確かめる）、画像の配信、文章生成の中継、保存系（物語ごとの読み書き・競合の判定・削除・画像の記録・Vault・シナリオ）、画像生成と検品、アカウント（`/auth/me`・Google ログイン・ログアウト）、管理。保存系は 1 つの入口の中で操作名（op）で分かれる。**操作の一覧・D1 の表・環境変数の一覧はここには書かない**（Worker のソースは公開リポジトリに入っていない）。
- **Worker の設定**：AI と画像の鍵、管理用の秘密、許可リスト、機能ごとの止めスイッチを環境変数で持つ。値は Cloudflare のダッシュボードで Owner だけが見られる。

## 2. 画面の中の仕組み（ゲーム画面）

1. 入力（DO / SAY / STORY）→ `G.submit()`。
2. `Planner.build(inputType, text)` が sys（AI への指示文）と user を組み立てる。多くの fix がこれを包んで追記する。**engineMode=1 では fix192 が sys を丸ごと差し替える**ので、`Planner._extensions` に足したものは届かない（`.claude/rules/sys-injection.md`）。毎ターンの注入は fix379 の keeper（`window.__f379reg`）か `Planner.build` の包みで行い、**実際に送られた sys を傍受して確かめる**。
3. `Api.call` → fetch（fix247・fix893 が宛先を付け替え、さらに外側を Vault の sendgate や観測口が包む）→ Worker → OpenRouter。
4. 応答を `Planner.parsePlan` と `_parseExtensions` が解析（`<say>`・`<react>`・`<state>`・`<scene_move>` などのタグ）。fix77 が `<state>` を store に取り込む。
5. ターンを `S.turns` に足し、`S.save()`。`UI.appendTurn` と `UI._renderHooks` が本文と会話ログを描く。
6. 包みの順序：**後から読み込まれた部品ほど外側**になる。`window.fetch`・`localStorage.setItem`・`Planner.build`・`UI.appendTurn`・`S.save` を包む部品を足すときは、`FIX_INDEX.md` 付録 A の読込順を見て位置を決める。

## 3. 保存・同期（正本とキャッシュ）

### 3.1 どこに何があるか

| 場所 | 中身 | 立場 |
|---|---|---|
| D1（Worker の保存系の操作が読み書きする物語ごとの行。細部は未整理） | 物語ごとの正式な版（canonical）。rev と hash を持つ | **正本** |
| 端末の localStorage `chr6_slot_<物語id>`（と既定の `chr6`） | 物語の本体（S の JSON） | 写し（キャッシュ）。進んでいても正本ではない |
| `chr6_slots_meta` | ホームの一覧（題名・削除の墓標 `deleted:true` など） | 写し |
| `chr6_active_slot` | 開いている物語 | 互換用の写し。**真実は URL の `?story=`**（fix527） |
| 物語ごとの付随データ（fix77 の状態・longmem・会話ログ抽出・カルテ・別名台帳など） | 物語 id を含む別キー（fix246 が振り分け） | 写し。復元にはこれも要る（fix564） |
| IndexedDB | 画像・Asset v2 のキャッシュ・Memory Engine の記録 | 端末だけ |
| sessionStorage | 物語ごとの合言葉のトークン（fix859）・入力欄の一時退避 | タブだけ |

### 3.2 流れ

- **新しい物語**：サーバーに行が無ければ、fix756 が最初から schema2 の canonical として D1 に作る（fix750 の prepare → commitSchema2 を 1 回だけ）。
- **開くとき**：fix705 が server の getstory で物語を分類し（CANONICAL / NOT_FOUND / SHADOW / STOP）、canonical を端末へ当てる。fix781 が「端末に未同期の進行があるのに server の古い版で上書きする」ことを止める。fix900 は分類が決まるまで画面の一部を隠す。
- **保存するとき**：`S.save()` → 端末に書く → fix697 が putcanonical / commitstate（期待 rev＋hash の CAS）。結果が分からないときは fix590 の台帳で決着。届かないときは fix758 のバナー。
- **旧方式**：fix399 / fix402（アカウント単位のパッケージ同期）も読み込まれている。per-story canonical の物語では fix702 の mask が旧方式の上書きを止める。**新しい変更を旧方式の上に作らない**。
- **競合**：409（rev が合わない）は「黙って上書き」しない。fork を保存成功と扱わない（fix826）。複数タブ（fix525・fix945）、開いたまま別端末が進めた（fix912）、を個別に扱う。
- **用語の注意**：「S2」「schema2」が 3 つの意味で使われている。①クラウド正本の schema2（fix743/750/756）、②Asset v2 の物語（`assetSchema:2`・fg3 の「S2 の物語」）、③削除の不具合チケット「S-2」（DL2）。①と②の関係は**未整理**。

### 3.3 削除

- 正規の入口は**ホームの削除シートだけ**（DL2）。サーバーに墓標を書くソフト削除で、画面から元に戻す手段は無い。
- サーバーは、保護している物語・Vault で隠した物語・この端末にしか無い物語の削除を断る。owner 以外のアカウントには削除ボタンを出さない（fix933）。
- 端末側の墓標（`chr6_slots_meta` の `deleted:true`）と、それを守る部品（fix579・fix587・fix602・fix588・fix660）がある。墓標の物語は開けない・作り直さない。
- **本番 D1 を直接 DELETE しない**。安全装置（保護・墓標・Vault）を迂回しない。

## 4. 認証とユーザーの分離

- 通常の経路：Google でログイン（fix328）→ サーバーが Google の ID トークンを検証し、Google のアカウント（発行者と利用者番号）から Chronicle のアカウント ID を引く（無ければ作る）→ ログインの状態は **HttpOnly の cookie** で持つ。端末の localStorage には認証情報を置かない（fix893 が付け替えと掃除をする）。
- `/auth/me`：アカウント ID・状態・権限の種類（owner / beta など）・機能の設定（Memory Engine・Asset v2 など）を返す。**Owner 限定の機能はこれで判定する**（fix905・fix933・BF1・UI1）。端末の localStorage の印だけで Owner 扱いにしない。
- 古い認証の経路は、1.0 に向けて「Google → アカウント ID → セッション」に一本化する方針で、依存が無くなったものから撤去する（細部は非公開の記録）。
- 分離の部品：iso2（送信時に「データの持ち主」と「送信先アカウント」を照合）・fix946（アカウントが変わったら画像系の端末状態を退避）・Vault v2（隠した物語の送信・複製を止める）。新しい送信・保存の経路を作るときは、これらの外側を通ることを確かめる。

## 5. 試験（QA）

| 段階 | 何をするか | どこで |
|---|---|---|
| 単体 | 部品の関数を node（vm）で試す | 作業コンテナ |
| 画面の試験 | 合成の物語・決定的な fixture で、PC Chromium と WebKit（iPhone 相当）の両方。kill を入れたときに前の版と同じ動き・同じ保存データになることも見る | Cowork の作業環境では `nonet2`（ネットワーク名前空間で外への通信を物理的に断つ箱）の中。**だれでも同じものを回せる最小の回帰試験は `docs/TESTING.md` と `tests/`** |
| 組み立ての点検（GATE） | 2 回組んでバイト一致・変わるファイルが想定どおり・保護ファイル不変・外すと前の版の木に戻る | 出荷パッケージの `tools/` と `GATE_*.log` |
| 実 AI の比較（STEP 2） | 必要なときだけ。本番の QA タブ・QA 物語で、送信回数と費用の上限を決め、保存の書き込み 0 で | 本番（読むだけ）。費用は Owner の承認範囲内 |
| 本番の確認 | アップロード後、配信 sha の読み直し＋ Owner の iPhone で数分の確認 | 本番 |

- 本番で試すときは QA 物語だけを使う。Owner の実プレイの物語・隠した物語では試さない。
- 実行していない試験を PASS と書かない。Local の PASS と本番の PASS を分けて記録する。
- 以前の手順（`knowledge/TEST_MATRIX.md`・`CLAUDE.md` の「DO/SAY/STORY 各 1 ターンの実機」）は今も考え方として有効だが、手順の細部は 2026-07 時点のもの。

## 6. 出荷と戻し

### 6.1 出荷パッケージ（作業環境の `pkg_<版名>/`）

- `_DEPLOY_<版名>/`：アップロードするファイルだけ（変わったものだけ）。
- `pages_full.zip`：配信物の全体（377 本）。`SHA256SUMS_pages_full.txt`。
- `MANIFEST_<版名>.json`：土台の版と sha、変わるファイルの前後の sha、スイッチ、保護ファイルの sha（`protected_unchanged`）、Worker・D1・sys への影響の有無。
- `pages_rollback_files/`：前の版と同じバイトの戻し用ファイル。
- `OWNER_*.md`：Owner 向けの平易な説明（変わること・上げるファイル・確認手順・戻し方・確かめたこと・まだ確かめていないこと・承認欄）。
- `GATE_*.log`・`QA/`・`QA_scripts/`・`tools/`。

### 6.2 手順

1. 最新の GPT 裁定で GO（保存・同期・権限・Worker などは差分と限定 QA の結果を示してレビュー済み）。
2. 本番の `version.txt` が前提の版であることを照合。出荷は 1 本ずつ、確定した本番の木の上に組み直す（Local 候補どうしを勝手に重ねない）。
3. **Owner の明示の承認**。Pages は、Owner が GitHub `sansan2103-a11y/chronicle` のブランチ `v292-rebuild` で「Add file → Upload files」から `_DEPLOY_<版名>/` の中のファイルをまとめてアップロードし、そのブランチへ直接コミットする → Cloudflare Pages が自動で反映（`version.txt?nc=<数字>` が新しい版名になるまで待つ）。Worker は Owner が Cloudflare のダッシュボードに貼る。管理者画面は別の Pages。順序が要るときは Worker → Pages → 管理者画面。
4. 出荷後、配信された `version.txt`・`index.html`・`home.html`・変わった部品の sha を読み直して照合。Worker はルート JSON の `workerBuild`。
5. 結果を作業台帳（`QUALITY_LEDGER.md`）と引き継ぎ（`HANDOFF_SESSION_A_20261010.md` の「0. いまの状態」）に記録し、`FIX_INDEX.md`・`FEATURES.md` の該当項目だけ直す。

### 6.3 版の名前とキャッシュ

- 版の名前：`YYYYMMDD-bundleNN-<内容>-<a|b|c>`。`index.html` の `BUILT`・`home.html` の版・`version.txt` を同じ値にする（自動再読込の判定に使う）。
- `.js` を入れ替えたら、その `<script src>` の `?cb=` を新しい版名に上げる。

### 6.4 戻し方

- 全体：`pages_rollback_files/` を上げ直す（前の版とバイト一致）。
- 端末だけ（急ぎ）：その部品の kill キー（例 `localStorage.setItem('v292DfixEDGOff','1'); location.reload();`）。
- **保存データの形を変える変更は、ファイルを戻してもデータは戻らない**（schema2 への移行・墓標・D1 の行）。こういう変更は出荷前に戻し方と影響を Owner に示す。

## 7. 秘密と実プレイの物語を守る

- 秘密の値は、文書・ログ・コミット・GPT や他 AI への入力・試験データに書かない。書き出す控えから認証情報を落とす仕組み（fix726）を迂回しない。
- **Vault で隠した物語**は、Owner の了承なく本文・会話ログ・キャラ情報を見ない・抜き出さない・AI へ送らない（D1 SELECT・バックアップ・Local の写し・デバッグログ・AI 入力のどれでも）。詳しくは `AGENTS.md` §9。
- 実プレイの物語の本文を、試験の fixture や文書に写さない。調査はメタデータ（rev・hash・件数・エラーコード）で行う。
- 本番 D1 は原則 SELECT のみ。

## 8. 本番と Local の区別

- **本番**：Cloudflare Pages に今配信されているファイルと、今動いている Worker。確かめ方は `AGENTS.md` §3。
- **Local 候補**：作業環境や Owner PC にある、承認前の出荷パッケージ。本番ではない。
- **古い写し（使わない）**：Owner PC の作業フォルダ直下にある `index.html`・`features.js`・`v292Dfix*.js` などは 2026-07〜08 の版で、**今の本番ではない**。正本は `v292-rebuild`。
- **作業コンテナは消えることがある**。大事な成果物は Owner PC か共有リポジトリへ写す。

## 9. 公開範囲と資料の置き場所

- このリポジトリは **Public** で、既定のブランチは `v292-rebuild`（GPT #127-OO で確認）。`v292-rebuild` の中身は Cloudflare Pages からも配信される。
- 置き場所の決まり（Owner 決定 2026-10-31・GPT #127-OO）：
  - **GitHub（ここ）**：公開してよい `AGENTS.md`・`docs/`・`tests/`（機能一覧・fix 辞典・基本の規約・小さな回帰試験）。
  - **Google Drive の「Chronicle」フォルダ**：企画・ロードマップ・UI の画像・Owner 向けの資料・アクセス制限が必要な資料。GitHub へはリンクで参照し、同じ資料を二重に持たない。
  - **QUALITY_LEDGER**（Owner PC）：QA・裁定・実測の詳細と証拠。**HANDOFF_SESSION_A**（Owner PC）：今の位置と次の作業。
  - 非公開の技術情報が必要になったら、その部分だけを非公開リポジトリに分ける（今は全部を移さない）。
- ここに書かないもの：秘密の値、認証の細部、直っていない弱点の具体的な突き方、個人情報、実セーブ、物語の ID。
- `_redirects` で文書を隠すことはしない（道筋を変えるだけでアクセス制御にならず、GitHub と公開履歴に残るため）。
- Pages は、存在しないパスにも `index.html` を 200 で返す（SPA の既定動作）。「URL が 200 を返した＝ファイルがある」とは限らないので、配信の確認は中身と sha で行う。

## 10. 壊してはいけない約束（要約）

元は Owner PC の `knowledge/INVARIANTS.md`（2026-07-10・Codex 作成。GitHub には未収録）。原則は今も有効。細部の「状態」欄は古い。

| 番号 | 約束 | 壊れ方の例 |
|---|---|---|
| INV-01 | プレイヤーの入力を無視しない・別のキャラに帰属させない（SAY は主人公の発話、DO は主人公の行動、STORY は場面の方向づけ） | SAY を NPC の台詞にする、STORY の指示が本文に漏れる |
| INV-02 | 前のターンを繰り返さず、連続性を保って前へ進む | 同じ被害・同じ台詞の言い換え。逆に、前進を強くしすぎて主人公を勝手に動かす |
| INV-03 | NPC は自分で考えて動くが、主人公の選択（重大な台詞・内面・決断）は奪わない | NPC の「自律」が世界改変や主人公の代理決定に広がる |
| INV-04 | 重傷でも静かな反応は許すが、全部の能力がそのまま使える状態にしない | 重傷なのに長台詞・精密動作・最適な計画が同時にできる |
| INV-05 | 鎮痛・解離・凍結は「反応の型」で、万能にしない。内部のラベルを本文に出さない | 毎回同じ反動、内部ラベルの漏れ |
| INV-06 | 不可能な命令を無条件に成功させないが、試す・部分的に成功する・代償を払う、は残す | 入力そのものを無視する、「強いから」で拘束を消す |
| INV-07 | 正史（キャスト・設定カード・記憶）・状態・入力を同時に整合させ、正史を黙って書き換えない | 要約や同期で正史を上書き、別スロットの状態が混ざる |
| INV-08 | 主人公の強さと身体・状況の制約を両立する | 能力差を全部の成功に直結させる |
| INV-09 | 自然な日本語・地の文と「」の台詞・メタやタグの漏れなし。会話ログと本文の話者を一致させる | 英語・JSON・内部指示の混入 |
| INV-10 | 成人・残酷表現は「無制限」と決めつけない（確定仕様ではない） | 表現を必須化する、provider の制限を回避する実装 |
| INV-11 | 保存の互換・スロットの分離・戻せることを守る。各 fix に止めるスイッチ | 共通キーへの固定、古い rev の自動適用、archive のコードの復元 |
