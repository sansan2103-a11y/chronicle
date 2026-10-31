# TESTING — だれでも回せる最小の回帰試験

> 公開リポジトリに置く前提で作っています（GPT #127-OO §5）。**実セーブ・鍵・cookie・本番への接続情報は使いません。** 外への通信もしません。
> 目的：Cowork と Codex など、どの担当でも同じ小さな回帰試験を回して、木が壊れていないことを確かめられるようにする。大きな試験（実際の遊び方の再現・kill の互換・GATE）は Cowork の作業環境で行い、結果は台帳（QUALITY_LEDGER）に残す。

## 1. 必要なもの

- Node.js 18 以上（作成時の確認は v22）。`tests/run_all.mjs` は Node の標準機能だけで動く（npm の依存なし）。
- ブラウザの試験（任意）だけ Playwright が要る：`npm i -D playwright && npx playwright install chromium webkit`。Playwright の版と、インストールしたブラウザの版を合わせる。

## 2. 回し方

| コマンド | 何を確かめるか | かかる時間の目安 |
|---|---|---|
| `node tests/run_all.mjs` | リポジトリのいちばん上（＝配信される木）について、下の 15 項目 | 数十秒 |
| `node tests/run_all.mjs <木のフォルダ>` | 別のフォルダ（出荷候補の木など）について同じ 15 項目 | 同上 |
| `node tests/run_all.mjs --json` | 結果を JSON で出す | 同上 |
| `node tests/smoke_browser.mjs [木のフォルダ] --browser=chromium` | 画面を本当に開く試験（任意）。`--browser=webkit` で iPhone 相当 | 1〜2 分 |

終了コード：`0` = 全部 PASS、`1` = FAIL あり、`2` = 使い方の誤り、`3` = Playwright が無いので飛ばした（smoke_browser のみ）。

## 3. 何を確かめているか

### `tests/run_all.mjs`（15 項目）

1. `home.html` がある。
2. `index.html` と `home.html` の `<script src>`（HTML コメントの中は除く）が指すファイルが**全部ある**。
3. 同じファイルを 2 回読み込んでいない。
4. 読み込む `.js` の中身が HTML になっていない（配信の「無いパスにも index を返す」動作を写し取ってしまった偽物を見つける）。
5. Vault の送信の関門（`v292Dvault2-sendgate.js`）が、両方のページで**最初**に読まれている。
6. `version.txt` があり、その版名が `index.html` と `home.html` にも書かれている（版名がそろっている）。
7. 読み込まれる全部の `.js` に `node --check`（構文の確認）。
8. EDIT-01 の純関数 `reconcile()` を、作り物のターンで 2 通り試す：本文が同じならカードは 1 枚も外れない／本文から消した台詞のカードだけが外れる。

### `tests/smoke_browser.mjs`（任意・9 項目）

- `127.0.0.1` だけで木を配り、**それ以外への通信は全部止める**（Worker・AI・Google・画像のどれにも届かない）。止めた件数を表示する。
- 新しいブラウザのプロファイルで `home.html` と `index.html?story=smoke0000test`（どこにも存在しない作り物の ID）を開く。
- 確かめること：200 で開く、画面に文字が出る、`index.html` で EDIT-01・状態の取得口・fix77 が読み込まれている。
- 画面のエラーは**記録するだけ**（外への通信を全部止めているので、通信の失敗を記録する部品があるのは想定どおり）。

## 4. 期待される結果（記録時点）

| 木 | run_all | smoke（chromium） | smoke（webkit） |
|---|---|---|---|
| 本番 `20261031-bundle71-ednedg-a`（読み込む .js 363 本） | 15 PASS / 0 FAIL | 9 PASS / 0 FAIL（画面のエラー 0・止めた通信 10 件） | 9 PASS / 0 FAIL |
| 候補 `20261031-bundle77-ui-a`（365 本） | 15 PASS / 0 FAIL | 9 PASS / 0 FAIL | 9 PASS / 0 FAIL |

- 壊したときに FAIL になることも確かめた：1 本消す → 「ファイルがある」が FAIL、構文を壊す → `node --check` が FAIL、版名を変える → 版名の 2 項目が FAIL。

## 5. やってはいけないこと

- この試験を**本番の URL や本番の Worker に向けない**。`smoke_browser.mjs` は外への通信を止めるが、自分で書き換えて止めを外さない。
- 実プレイの物語・セーブ・鍵・cookie を試験に入れない。データが要る試験は、作り物のデータを `tests/` の中に置く。
- ここが PASS でも、本番の PASS ではない。本番の確認（配信 sha の照合と実機）は出荷のたびに別に行う。

## 6. 足すとき

- 新しい項目は「外へ通信しない・作り物のデータだけ・数十秒で終わる」を守る。
- 部品の純関数（`module.exports` を持つもの）は、`run_all.mjs` の §4 と同じ形で node から呼べる。
