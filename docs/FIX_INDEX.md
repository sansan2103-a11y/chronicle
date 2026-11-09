# FIX_INDEX — Chronicle fix 辞典（開発担当向け）

> 下書き（laneDOCS・2026-10-31・第 1 段。2026-11-01 に 80-int-a、続けて 81-admg-a、82b-iconux-b、83-flow-c、MSW1-c、2026-11-02 に 84-b37g-a、85-imgsafe（Worker だけ）、86-lc1ox-d、87-lc1ox2-a、Worker v46.28-r1920b-fc、89-r1920-b、90-a、2026-11-03 に 90-b、Worker v46.29-rphold-fc、Worker v46.30-public-fc と管理者画面 `53e2d067`、91-b、92-a、2026-11-03 に 93-a（MIDICON3 mx3-d・Worker `v46.30-public-mx3c-fc`・管理者画面 `abd3084d`）、2026-11-07 に 93-b、Worker `v46.31-diag1b-fc`、管理者画面 `5c9c9f28`、Worker `v46.33b-limit1-fc`、管理者画面 `18594749`（admhub1）、93-c 、2026-11-07 夜に Worker `v46.34b-ready1-proarg-fc`・管理者画面 `e5198d0a`・93-d（ISO1e）・93-e（OPEN1・READY1 の端末側）、2026-11-08 に 93-f（npcq1 C2）、Worker `v46.35b-custimg1-fc`・管理者画面 `a2ea35ca`（ADMBULK1）、Worker `v46.35c-hang1-fc`、93-g（SETUI1・BOOTOFF1・NEWACCT1）、Worker `v46.35d-initslow1-fc`（INITSLOW1）、Worker `v46.36-wmxreg-fc`（W-MXREG・`midicon1` を READY に）・管理者画面 `f2258e33`、93-h（HOMERETRY1・OLDMX1・IDSPLIT2・GENDER1）、2026-11-09 に Worker `v46.37-keys-fc`（鍵 `starticon1`・`idsplit2`）・管理者画面 `752c623a`・93-i（STARTICON・W-MXREG の端末側・IDSPLIT2 の鍵）の出荷を反映）。
> **基準の本番（2026-11-10 未明）**：Pages `20261110-bundle93-k`（GitHub コミット `c260582`・version `af33aa91`・index `4e7d32d3`・home `eb166fb1`。93-j の上に 7 本：fix873 `486d4b7c`（SEEDNPC1b：「いっしょに出る人」の説明だけの人は名前を空にして AI に名前を付けさせる）・STARTICON `9b626070`（キャラ一覧を開いたままでも 1 回の再読み込みへ進む・読み直し後に一覧を開き直す・一覧の行の「絵あり」を読み直してもらう）・LC1 作業欄 `f4564ac3`（読み直しの口 `refreshPtr`）・av2-portrait `8c744237`（RENAME1：名前を変えた NPC の会話ログ・設定の丸に絵を出す。表示だけ）・index（BUILT と変えた 3 本の ?cb=`20261110-bundle93-k`）・home（HOME_BUILT と fix873 の ?cb）・version。本番の読み戻しで 7 本とも一致（2026-11-10 JST））。Worker `v46.39-kn1-fc`・管理者画面 `d2e83021` は 93-j のまま。戻し先：93-j の同名 7 本（fix873 `e29e2d50`・STARTICON `5f092874`・LC1 `aea27e80`・av2-portrait `e3e3f498`・index `38f7c45a`・home `e37fa094`・version `0739b145`）。消すファイルは無い。
> **93-j 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261109-bundle93-j`（GitHub コミット `a9a5a76`・version `0739b145`・index `38f7c45a`・home `e37fa094`。93-i〔＋SEEDNPC1a〕の上に 10 本：fix492 `6a8d3d5b`・av2-portrait `e3e3f498`・fixB37 `899aaaa5`・av2-migrate-ui `a5dcf137`（この 4 本は、絵を作らなかったときの文を「絵は作っていないため、画像の費用はかかっていません」に。分類 AI の費用は記帳される）・ADMF1 `697272e3`（鍵 `kn1` を知る）・STARTICON `5f092874`（200 `IN_FLIGHT` のあとの 1 回だけの再試行。§2.9）・新ファイル KN1 `v292DfixKN1-knowledge-canary.js` `63f439a1`（`index.html` の最後・SETUI1 の後。`home.html` は読まない。§2.1）・index（BUILT と変えたファイルの ?cb=`20261109-bundle93-j`）・home（HOME_BUILT だけ）・version。本番の読み戻しで一致（2026-11-09 20:4x JST））＋ Worker `v46.39-kn1-fc`（ソース `06776d69`・Cloudflare の版 `4439b04f`。鍵 `kn1`・範囲 CANARY）＋ 管理者画面 `d2e83021`。戻し先：Pages は 93-i〔＋SEEDNPC1a〕の同名 9 本（index `3dbb2d32`・home `c04369cb`・version `3ec43759`・fix492 `bd95a709`・av2-portrait `0cc62adf`・fixB37 `0e2c5681`・av2-migrate-ui `488999e4`・ADMF1 `b35e6324`・STARTICON `d2e2bc95`）を戻し、KN1 のファイルを消す。Worker は `v46.38-custlease1-fc`（ソース `bbfff492`）。管理者画面は `e13dac1e`。
> **93-i 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261108-bundle93-i`（ビルド名の日付は 11-08。GitHub コミット `32d360b`〔コミット時刻 11-09 04:34 JST〕・version `3ec43759`・index `3dbb2d32`・home `39eff416`。93-h の上に 9 本：av2-data `bc08ce7b`（STARTICON の外見の由来 `profile.origin`）・fix697 `36367c10`（W-MXREG の `character_id` の送信口）・ADMF1 `b35e6324`（鍵 `mxreg1`・`starticon1`・`idsplit2` を知る）・IDSPLIT2 `3f75a2f2`（gate を Owner 固定から鍵 `idsplit2` に）・MIDICON `fbdcd485`（W-MXREG の端末側）・新ファイル STARTICON `v292DfixSTARTICON-start-icons.js` `d2e2bc95`（`index.html` だけが読む）・index（BUILT と変えたファイルの ?cb=`20261108-bundle93-i`）・home（HOME_BUILT・av2-data／fix697 の ?cb=）・version。本番の読み戻しで 9 本とも一致。出荷後の Owner のホームで `/api/save`・`/api/auth/me` がすべて 200。fix469・GENDER1 などは 93-h のまま）＋ Worker `v46.37-keys-fc`（ソース `2a74a00c`・Cloudflare の版 `5fd0a423`。v46.36 からの変更は 4 か所だけ：`CHR_ACCT_FLAG_KEYS` に `starticon1`・`idsplit2` を足した〔8 → 10 個〕、`CHR_ACCT_FLAG_UNSET` で両方 `'off'`〔行なし＝OFF〕、`CHR_FEAT_SCOPE` で両方 READY、`workerBuild` の名前。`/auth/me` の accountFlags に `mxreg1` と同じ形で出る〔§2.8 ADMF1〕。その下の `v46.36-wmxreg-fc`〔ソース `d8a6ce55`・版 `7f41d4fe`〕で W-MXREG・MXALL、`v46.35d-initslow1-fc`〔`9b94f399`〕で INITSLOW1）＋ **SEEDNPC1a（11-09・GitHub `9378d15`）**：home `39eff416`→`c04369cb`（fix873 の ?cb=`20261109-seednpc1a` の 1 行だけ）・fix873 `cc7c42f3`→`e29e2d50`。物語の種の「いっしょに出る人」に「名前：説明」が区切り（改行 ／ / ； ; ｜ |）で 2〜6 個並ぶときだけ人ごとの NPC に分ける（93-i では全文が NPC 1 人の名前になっていた）。1 人の「名前：説明」は名前と説明に分け、かな読みは説明へ、20 文字を超える名前は空にして AI に決めさせる。version.txt・index は変えていない。読み戻しで 2 本とも一致、本番のホームで分割の結果を確認（`window.__v292DfixSEEDNPC1.parse`）。戻すときは 93-i の 2 本（rollback：/home/claude/laneSEEDNPC1/pkg_LOCAL_ONLY/rollback）。kill `v292DfixSEEDNPC1Off`。GPT レビューは事後（#127-RL）＋ 管理者画面 `752c623a` → 11-09 `e13dac1e`（ADMGRP1・お客さまのまとめ表示。§2.8）（`starticon1`〔画像の費用あり〕・`idsplit2`〔費用なし〕の行を足し、`midicon1`・`mxreg1`・`starticon1`・`idsplit2` の 4 行に「OFF の理由」「ON にする条件」を 1 行ずつ〔GPT #127-RK ②〕。一括の確認に画像の費用が出る機能の一覧と新たに ON になるアカウント数〔うちお客さま数〕。一括 ON は READY だけ。アカウントごとの「まとめて ON」も Owner で CANARY〔`lc1`・`npres1`〕を含めなくなった。§2.8）。`starticon1`・`idsplit2` の D1 の行の有無はこの資料では未記録（行なし＝OFF）。**IDSPLIT2 は Owner のアカウントでも `idsplit2`=1 の行が無いと止まる**（93-h では Owner 固定で動いていた）。未確認：本番での実画像の生成（W-MXREG・STARTICON）、お客さまの 1 日の上限・imgsafe の拒否、実機。
> **93-h 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261108-bundle93-h`（出荷は 2026-11-08 19:5x JST 頃・GitHub コミット `33665d1`・version `982f1064`・index `3a740498`・home `bf778277`。93-g の上に 10 本：MIDICON `d8c971bc`（OLDMX1）・fix469 `1dc25074`（IDSPLIT2 の B だけ）・fix335 `fc96f630`・fix436 `3a5d6160`・fix823 `d1837ab4`（この 3 本は GENDER1）・新ファイル IDSPLIT2 `v292DfixIDSPLIT2-selfname-merge.js` `6ba937c2`（`index.html` だけが読む）・新ファイル GENDER1 `v292DfixGENDER1-autogender.js` `3291ae11`（`index.html` と `home.html` が読む）・index（BUILT と変えたファイルの ?cb=`20261108-bundle93-h`）・home（HOMERETRY1・HOME_BUILT・GENDER1 の読み込み・fix335／fix436／fix823 の ?cb=）・version。本番の読み戻しで 10 本とも sha が一致。出荷後の Owner のホームの読み直しで HOME_BUILT=`20261108-bundle93-h`・Worker への要求 13 本がすべて 200・「同期できませんでした」は出なかった。fix889・SETUI1 は 93-g のまま。STARTICON は入っていない）＋ Worker `v46.36-wmxreg-fc`（ソース `d8a6ce55`・12620 行・Cloudflare の版 `7f41d4fe`・11-08 17:0x JST 頃に出荷。v46.35d からの変更：W-MXREG＝`portrait.mx_ensure` に `character_id` を付けると、絵も確定した外見も無い登録 NPC に最初の絵だけを作る〔新しい鍵 `mxreg1`・READY。§2.9 W-MXREG。**端末側の呼び出しは 93-i で出した。93-h の画面からは呼ばれなかった**〕、MXALL＝`CHR_FEAT_SCOPE` の `midicon1` を CANARY から READY に〔§2.8 ADMF1〕。その下の `v46.35d-initslow1-fc`〔ソース `9b94f399`・Cloudflare の版 `a32dc87b`・11-08 14:2x〕で INITSLOW1、`v46.35c-hang1-fc`〔`7ffa92b1`〕で WKRHANG1、`v46.35b-custimg1-fc`〔`dca5e74e`〕で CUSTIMG1）＋ 管理者画面 `f2258e33`（Pages のプロジェクト chronicle-admin。`midicon1` の文言を全員〔READY〕向けに直し、`mxreg1` の行を足し、「全機能を一括 ON」の対象を Worker が返す READY の鍵から作る〔今は `midicon1`・`mxreg1` を含む＝画像の費用が出る機能も入る。確認に「画像の費用あり」〕。§2.8）。出荷の時点の D1 `account_feature`：`midicon1`=1 と `lc1`=1 は Owner のアカウントだけ、`mxreg1` の行は 0 件（新しく影響を受けた人はいない）。`npres1`・`lc1` は CANARY のまま。Owner の方針（2026-11-08）：新しい機能は全アカウントへ出し、管理者画面で ON／OFF する（Owner だけの CANARY にしない）。
> **93-g 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261108-bundle93-g`（出荷は 2026-11-08 11:52 JST・GitHub コミット `acb1b87`・version `d43c74b5`・index `2cf16543`・home `fac1e7ab`。93-f の上に fix889 `4221f41d`〔BOOTOFF1〕・新ファイル SETUI1 `3892c38f`・index・home〔NEWACCT1〕・version の 5 本）＋ Worker `v46.35d-initslow1-fc`（ソース `9b94f399`・Cloudflare の版 `a32dc87b`・14:2x JST に出荷。93-g を出したときは `v46.35c-hang1-fc`〔`7ffa92b1`〕）＋ 管理者画面 `a2ea35ca`（ADMBULK1）。運用の状態：D1 の `cust_img`=1（08:10 JST に Owner が ON）。Knowledge v0 は既定 OFF のまま。
> **93-e 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261107-bundle93-e`（ビルド名の日付は 11-07。出荷は 2026-11-07 21:53 JST・GitHub コミット `c84a35d`・version `9d39d014`・index `e7874016`・home `8847625b`。93-d の上に 4 本：fix527 `8c62d316`・fix870 `f4381e0a`・RC1 `fdeb53e9`・index・home・version。ISO1 `0f1ff245` は 93-d から）＋ Worker `v46.34b-ready1-proarg-fc`（ソース `dde9c4d8`。出荷は 11-07 18:2x JST 頃。sha の読み戻しで確認。v46.33b からの変更：READY1＝`CHR_FEAT_SCOPE` の `sfl1`・`ld1`・`rc1`・`oma1` を READY に、PROARG1＝FLUX.2-pro の仕様で `upsampleParam:false`）＋ 管理者画面 `e5198d0a`（READY の範囲とアカウントごとの規則を表示）。11-07 の出荷は Owner の許可（16:21「出荷は Claude が押してよ」）で出した。ルートの JSON の `workerBuild` は `v46.34b-ready1-proarg-fc`（11-07 22 時台に読み戻し）。
> **92-a のあとの出荷の流れ**：2026-11-03 に Worker `v46.30-public-mx3c-fc`（ソース `99edff17`・Cloudflare の版 `968cd4ad`・ルートの `midicon`=`mx3c`）→ 管理者画面 `abd3084d` → Pages 93-a（コミット `7a27e62`・version `2a746e78`・index `6d3e7cd1`・home `1b29a38c`。8 本：新しい MIDICON `97c98380`・av2-portrait `0cc62adf`・fix697 `d8c44cd4`・ADMF1 `93d1ac47`・ICF `e41d22e6`。GPT #127-QQ・台帳 2237）。11-03 16:29 に Owner が管理者画面で `midicon1` を ON（台帳 2238）。2026-11-07 に Pages だけ 93-b（コミット `4a7fd5f`・version `0a38ebfb`・index `b61dbdc7`・home `d84a79a0`・MIDICON `1b7bbfa3`。4 本。GPT #127-QS・台帳 2241）→ Worker `v46.31-diag1`（Cloudflare の版 `cc85f598`・ソースの sha 未確認）→ `v46.31-diag1b-fc`（ソース `e878ea50`・Cloudflare の版 未確認。GPT #127-QU・台帳 2242）→ 管理者画面 `5c9c9f28`（admin_b2。台帳 2248）→ Worker `v46.33b-limit1-fc` ＋ 管理者画面 `18594749` ＋ Pages 93-c（台帳 2250）。`v46.32-friend1-fc`（ソース `5682e83f`）・`v46.33-imgmodel1-fc`（`875c830d`）と、その管理者画面（`128a430b`・`30a05b30`）は単独では出していない（v46.33b と `18594749` に含む）。
> **93-c のあとの流れ（11-07）**：Worker `v46.34b-ready1-proarg-fc` ＋ 管理者画面 `e5198d0a`（18:2x JST 頃）→ Pages 93-d（GitHub `f2d24a2`・19:40 JST・home `67a060f4`・index `46a77fe9`・新ファイル ISO1 `0f1ff245`・ビルド ISO1e）→ Pages 93-e（GitHub `c84a35d`・21:53 JST。OPEN1・RC1 の端末側）。93-e の戻し先は 93-d。
> **93-e のあとの流れ（11-08）**：Pages 93-f（GitHub `e66e884`・00:05 JST。npcq1 C2＝重傷・強い恐怖の【制約】の拡張と NPC の自発の文の免除を、Owner〔owner かつ active〕のアカウントでだけ有効にする CANARY。Worker・管理者画面は不変）→ Worker `v46.35b-custimg1-fc` ＋ 管理者画面 `a2ea35ca`（出荷の時刻は出荷の記録を正とする）→ 03:40〜04:05 JST にログイン後の `/save` が 60 秒以上返らない事象（WKRHANG1 の資料は v46.35b の上の事象として扱う。env を 1 つ足した再デプロイ＝isolate の作り直しで、同じコードのまま回復）→ 08:10 に Owner が `cust_img` を ON → Worker `v46.35c-hang1-fc`（WKRHANG1・GPT #127-RG の条件付き GO）→ Pages 93-g（GitHub `acb1b87`。SETUI1・BOOTOFF1・NEWACCT1。GPT #127-RE／#127-RG）。v46.35c と 93-g の前後は出荷の記録を正とする。93-g の戻し先は 93-f、93-f の戻し先は 93-e。
> **93-g のあとの流れ（11-08）**：Worker `v46.35d-initslow1-fc`（14:2x JST。INITSLOW1）→ Worker `v46.36-wmxreg-fc`（17:0x JST 頃。W-MXREG・MXALL。GPT #127-RI ②の Local 実装 GO と Owner の指示〔全アカウント・管理者画面で入れ切り〕）→ 管理者画面 `f2258e33`（Worker との前後と時刻は出荷の記録を正とする）→ Pages 93-h（GitHub `33665d1`・19:5x JST 頃。HOMERETRY1・OLDMX1・IDSPLIT2〔B だけ〕・GENDER1）。93-h の戻し先は 93-g、v46.36 の戻し先は v46.35d、`f2258e33` の戻し先は `a2ea35ca`。
> **93-h のあとの流れ（11-09）**：Worker `v46.37-keys-fc`（鍵 `starticon1`・`idsplit2`）・管理者画面 `752c623a`・Pages 93-i（GitHub `32d360b`。STARTICON・W-MXREG の端末側・IDSPLIT2 の gate を鍵 `idsplit2` に・ADMF1 の鍵）。3 つの前後と時刻は出荷の記録を正とする。93-i の戻し先は 93-h、v46.37 の戻し先は v46.36（ソース `d8a6ce55`・Cloudflare の版 `7f41d4fe`）、`752c623a` の戻し先は `f2258e33`。
> **戻し先（93-i 時点）**：Pages は 93-h の同名 8 本（home `bf778277`・index `3a740498`・version `982f1064`・av2-data `a0c5774a`・fix697 `d8c44cd4`・ADMF1 `93d1ac47`・IDSPLIT2 `6ba937c2`・MIDICON `d8c971bc`）を戻し、新しい STARTICON のファイル（`d2e2bc95`）を消す。データの巻き戻しは不要。ただし STARTICON が書いた外見（`profile.origin`=`starticon_auto`）と作った絵、W-MXREG で作った絵は残る（93-h の av2-data は `origin` を読まないので、残った自動の外見は本人が確定した外見と同じに扱われる見立て・コードからの推定）。Worker は `d8a6ce55`（v46.36。Cloudflare の前の版 `7f41d4fe`。v46.36 は `starticon1`・`idsplit2` を返さないので、93-i の端末のままでも STARTICON・IDSPLIT2 は OFF になる）。管理者画面は `f2258e33`。止めるだけなら：管理者画面で `starticon1`・`idsplit2`・`mxreg1` を 0（W-MXREG は env `CHR_MXREG_OFF=1` も可）。端末ごとの kill は localStorage `v292DfixSTARTICONOff`・`v292DfixMIDICONregOff`・`v292DfixIDSPLIT2Off`（どれも `'1'`。`v292DfixSTARTICONNoAI='1'` は STARTICON で文章 AI の案だけを使わない）。
> **戻し先（93-h 時点）**：Pages は 93-g の同名 8 本（home `fac1e7ab`・index `2cf16543`・version `d43c74b5`・MIDICON `0a145cc7`・fix469 `d968b745`・fix335 `d70eb54d`・fix436 `ff50b6f7`・fix823 `e86d3a62`）を戻し、新しい 2 本（IDSPLIT2・GENDER1）を消す。データの巻き戻しは不要。ただし IDSPLIT2 が Owner の物語で結び付けた別名（localStorage `v292Dfix277Quasi_slot_<物語ID>` の ali）と会話ログの話者の直しは残る（控えは `chr6_bk_fix538_<時刻>`）。Worker は `9b94f399`（v46.35d。Cloudflare の前の版 `a32dc87b`。残った `account_feature` の `mxreg1` の行と KV `featcfg:mxreg1` は v46.35d が読まない。W-MXREG で作った絵は残る）。管理者画面は `a2ea35ca`。止めるだけなら：W-MXREG は env `CHR_MXREG_OFF=1`（MIDICON ごと止めるなら `CHR_MX_OFF=1`、機能スイッチ全部は `CHR_ACCT_FLAGS_OFF=1`）か管理者画面で `mxreg1` を 0。端末ごとの kill は localStorage `v292DfixHOMERETRY1Off`・`v292DfixMIDICONrosOff`・`v292DfixIDSPLIT2Off`・`v292DfixGENDER1Off`（どれも `'1'`）。
> **戻し先（93-g 時点）**：Pages は 93-f の同名 4 本（home `a5cc59fd`・index `982883c2`・fix889 `82edc1ad`・version `0f3ddd57`）を戻し、新しい SETUI1 のファイルを消す（データは書かないので巻き戻しは不要）。NEWACCT1 だけを外すときは、パッケージの `alt_without_NEWACCT1/home.html`（`63ad92bb`）を使う。その前は 93-e の同名 5 本（fix414 `fdad99f5`・fix192 `931d1310`・index `e7874016`・home `8847625b`・version `9d39d014`）。Worker は `dca5e74e`（v46.35b。D1・KV の変更は無い）→ `dde9c4d8`（v46.34b。KV の日の枚数のキー `custimg:d:…` と D1 の `cust_img` の行は v46.34b では読まれない）。管理者画面は `e5198d0a`。止めるだけなら：知人の絵は管理者画面の「知人の画像」を OFF（`cust-img-set`）か env `CHR_CUSTOMER_IMG` を消す。端末ごとの kill は localStorage `v292DfixSETUI1Off`・`v292DfixBOOTOFF1Off`・`v292DfixNEWACCT1Off`・`v292Dfix414WidenOff`・`v292Dfix192LicOff`（どれも `'1'`）。
> **戻し先（93-e 時点・記録のまま）**：Pages は 93-d の同名ファイル（home `67a060f4`・index `46a77fe9`・fix527・fix870・RC1 は前の版・version は 93-e の前の版）、新しい ISO1 は残してよい（93-d の戻しでは消す）。その前は 93-c（home `73da3ed3`・index `90e04c3f`・version `6a6575de`。ISO1 のファイルは消す）→ 93-b の同名 5 本（MIDICON `1b7bbfa3`・fix307 `bada1da9`・index `b61dbdc7`・home `d84a79a0`・version `0a38ebfb`）→ 93-a の同名 4 本 → 92-a。Worker は `c312e86a`（v46.33b）→ `e878ea50`（v46.31-diag1b）→ `99edff17`（mx3c）→ `761b4e67`（v46.30）。管理者画面は `18594749` → `5c9c9f28` → `abd3084d` → `53e2d067`。止めるだけなら env：`CHR_MX_OFF=1`（自動アイコン）・`CHR_IMG_MODEL_FORCE_DEV=1`（画像モデルを dev に固定）・`CHR_ACCT_ADMIN_OFF=1`（招待の操作。予算の変更も止まる）。端末ごとの ISO1 の kill は localStorage `v292DfixISO1Off='1'`。Worker の診断（DIAG）の行は 11-14 に外す予定（予約済みの作業。台帳 2250）。
> **92-a 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261103-bundle92-a`（version `f4acd620`・index `0de7fe1d`・home `d7012132`。91-b の上にコミット `a5c6878`。5 本：新しい EDLOG `4cb1ed47`・新しい ICF80 `592a85ca`（どちらも `index.html` だけが読む・既定 OFF・Owner の PC だけの CANARY）。GPT #127-QO・台帳 2236）。その下の 91-b（version `5adb7fc4`・index `315b347e`・home `59119b0c`。90-b の上にコミット `9182d31`。6 本：新しい NDI1 `54dadff9`（`index.html`・`home.html` の最初のスクリプト）・fix315 `4864a7ee`・fix295 `993f7976`（fix295e）。GPT #127-QO・台帳 2234）。その下の 90-b（version `e5b31932`・index `1d7b39c8`・home `e4c281c5`。90-a（コミット `ebdc457`・version `ccd55617`）の上にコミット `2b538ad`。7 本を入れ替え・表示だけ：av2-data `a0c5774a`・av2-portrait `12c563bf`・fix492 `bd95a709`・LC1 作業欄 `aea27e80`。外見の案 `5556f614`・ICONUX2 `673bf47a`・core `fb23cf9e`・B37 の部品は不変）＋ Worker `v46.30-public-fc`（ソース `761b4e67`・Cloudflare の版 `60059e2f`・ルートの `publicMode`=`pm1`・`imgSafe`=`imgsafex:owner`・`acctFlags`=`admg1`・`admView`=`admpriv1`・`modelSw`=`msw3`・`tombstoneGuard`=true・`vaultTransport`=`body`。v46.28 `d7b768bd` の上に v46.29-rphold-fc（ソース `d0c25092`・Cloudflare の版 `9680cd8a`・実在の人物の肖像の保留・鍵 `xh5`）と v46.30（一般公開のスイッチの段階 1）を重ねたもの）＋ 管理者画面 `53e2d067`（`b4c007d6` の上に「一般公開」のカード）。env `CHR_IMGSAFE_ENFORCE=owner`（未設定＝従来の画像の経路＋ dry run だけ／`owner`＝Owner と許可された internal_qa だけ／`all`＝全員・HOLD）、`CHR_IMGSAFE_OFF=1` で全部止める、`CHR_IMGSAFE_REALPERSON_HOLD`（未設定＝保留／`"0"`＝v46.28 の動き）、`CHR_PUBLIC_FORCE_OFF=1` で公開を緊急 OFF。2026-11-03 に出荷（GPT #127-QE・#127-QK・#127-QO。台帳 2225・2229・2234・2236。台帳の番号は統括の記録を正とする）。sha は出荷パッケージの値で、本番の読み直しで 90-b の 7 本・91-b の 6 本・92-a の 5 本・管理者画面とも一致を確認済み。それまでの流れ：86-lc1ox-d（version `ccb576f6`）＋ Worker `v46.27-thin1lc1c-fc`（ソース `033c4e7b`・Cloudflare の版 `d8ca42f5`）→ Pages だけ 87-lc1ox2-a（コミット `9237e13`・version `aac19175`）→ Worker `v46.28-r1920b-fc`（ソース `d7b768bd`・Cloudflare の版 `7e759b58`）→ Pages 89-r1920-b（コミット `b395bd2`・version `e49339f7`）→ Pages だけ 90-a（GPT #127-QA）→ Pages だけ 90-b → Worker v46.29 → Worker v46.30 ＋ 管理者画面 `53e2d067` → Pages だけ 91-b → Pages だけ 92-a。戻し先は Pages 91-b の同名 3 本（index `315b347e`・home `59119b0c`・version `5adb7fc4`。新しい 2 本は残してよい）、その前は 90-b の同名 5 本（fix315 `67589324`・fix295 `3e3c528b`・index・home・version。NDI1 は 90-b の index・home が読まない。さらに前は 90-a の同名 7 本、89-b の同名 6 本）、Worker `d0c25092`（v46.29）→ `d7b768bd`（v46.28）→ `033c4e7b`（v46.27）、管理者画面 `b4c007d6`。env は `CHR_PUBLIC_FORCE_OFF=1`・`CHR_IMGSAFE_REALPERSON_HOLD="0"`・`CHR_IMGSAFE_ENFORCE` を外す。
> **「本番稼働」の判定は、上の本番の `index.html` / `home.html` が実際に読み込むかどうかだけで行っています。** ファイルが配信物にあるだけのもの・コメントアウトされたものは「読み込まれていない」と書きます。
> 確かめていないことは「未確認」と書きます。過去の資料（記憶メモ・2026-07 の knowledge/）にあった説明は、コードと照らして合っている部分だけ使いました。

## 0. この辞典の使い方

- **番号で探す**：このファイルを `fix333` のように検索。手書き項目（§2）と、全部品の一覧（付録 A）の両方に出ます。
- **ファイル名**：ほぼすべて `v292D<番号>-<名前>.js`（例 `fix333` → `v292Dfix333-actor-reality.js`）。正確な名前・読込順・sha は付録 A。`fix660` のように同じ番号で 2 ファイルあるものもあります。
- **分野で探す**：§1 の索引から §2 の各節へ。付録 A の「分野（推定）」列でも絞れます（ファイル名からの自動推定なので目安）。
- **スイッチ（localStorage キー）で探す**：付録 C（全 708 キー → それを読む部品）。
- 項目の書き方：
  - **状態**：本番稼働（読込位置 `i93` = index.html の 93 番目、`h5` = home.html の 5 番目）／Local 候補／読み込まれていない。
  - **i 番号は 71-a の読込順で数えた値**です。80-int-a で 4 本（ADMF1・UX72・JMP・NPRES）が途中に入ったため、今の本番では `i9`〜`i70` が +1、`i71`〜`i165` が +2、`i166`〜`i339` が +3、`i340`〜`i350` が +4 ずれます（全行の振り直しを避けた。新しい 4 本だけは 80-int-a の番号で書き、そう明記）。81-admg-a はファイルの増減が無いので、番号は 80-int-a と同じ。82b で 3 本（ICONUX2・SETAV1 は LC1 の作業欄の直後、FLW3 は最後）、83 で 4 本（ICF・FLW2・FLW4・FLW5。UI1 の後ろ）が入ったため、今の本番（83）では `i340`〜`i344` が +4、`i345`〜`i350` が +6 ずれます（`i9`〜`i339` のずれは上と同じ。新しい 7 本は 83 の番号で書き、そう明記）。**86-lc1ox-d**：`v292DfixIMGSAFE-core.js` が `i16`（`index.html` の 16 番目）に入ったため、それ以降は上のずれに更に +1。86 で sha を直した行（av2-data `i25` `h20`・fix315 `i160`・fix492 `i295`・av2-portrait `i345`・LC1 の 2 本 `i348` `i349`・ICONUX2 `i350`・FLW2 `i360`）は 86 の番号を添えた。ほかの「83 の番号」の行は +1 してください（`home.html` は core を読まないので不変）。**91-b**：`v292DfixNDI1-no-direct-image.js` が `index.html`・`home.html` の両方で最初（`i1`・`h1`）に入ったため、すべての `i` と `h` の番号に更に +1（番号は振り直していない。NDI1 だけ 91-b の番号で書いた）。**92-a**：`index.html` に 2 本（EDLOG は SFLTap の直後、ICF80 は ICF の直後）が入ったため、それぞれの後ろの `i` は更に +1、+2（`home.html` は不変。番号は振り直していない）。**93-a**：`index.html` に 1 本（MIDICON は SETAV1 の直後）が入ったため、それより後ろの `i` は更に +1（`home.html` は読まない・不変。番号は振り直していない）。93-b・93-c はファイルの増減なし。**93-g**：SETUI1 は `index.html` の最後（FLW5 の後）に入ったため、ほかの `i` 番号は動かない（`home.html` は読まない）。93-f はファイルの増減なし。**93-h**：`index.html` に 2 本（GENDER1 は fix335 の直前、IDSPLIT2 は fix620 の直後）、`home.html` に 1 本（GENDER1 は fix436 の直前）が入ったため、それぞれの後ろの `i`・`h` は更に +1（番号は振り直していない）。**93-i**：`index.html` に 1 本（STARTICON は MIDICON の直後）が入ったため、それより後ろの `i` は更に +1（`home.html` は読まない・不変。番号は振り直していない）。
  - **sha**：本番ファイルの sha256 先頭 8 桁。**?cb=**：index.html に書かれたキャッシュ破棄の値（最後に入れ替わった出荷の目安）。
  - **スイッチ**：`キー='1'` の形。kill が常に優先するのが原則（例外は項目に記載）。端末ごと（localStorage）の設定です。
- 数字（件数・sha）は記録時点の値です。出荷のたびに、変わった項目だけを直してください。

### 用語

- **S**：ゲーム画面の状態オブジェクト（`index.html` の中核 inline script が持つ）。`S.turns`（ターン）・`S.cast`（主人公 `hero` と NPC `npcs`）・`S.scene`・`S.cfg`。正式な取得口は `window.__chronicleGetState`（fix539 系。古い部品は `window.S` や間接 eval で取る）。
- **ターン**：`{inputType, playerText, narrative, plan, _convSays, _convSayMeta, …}`。`_convSays` が会話ログのカード（`{who, say, …}`）。
- **sys**：AI へ送る指示文（system）。`Planner.build` が組み立て、多数の部品が包んで追記する。
- **store（fix77）**：キャラごとの状態（からだ・こころ・本能・傷）を持つ端末側の保存。`window.__v292Dfix77Store`。
- **canonical（正本）**：クラウド（D1）にある物語の正式な版。端末の `chr6_slot_*` は写し（キャッシュ）。詳しくは `DEVELOPMENT.md` §3。
- **影モード（shadow）**：判定や記録だけをして、挙動は変えない段階。

## 1. 分野別の索引

| 分野 | 主な部品（§2 に項目あり） |
|---|---|
| 生成の中心・プロンプト | features.js、fix192、fix226、fix379、FLW4、fix459、smrc1、MSW1（Worker）、BF1、fix80、fix247 |
| NPC・キャラ状態 | fix77、fix305、fix333、fix414、fix145、fix298、fix277、fix307、fix641、fix853、CP1、NPRES、E64、fix797 |
| 話者・会話ログ・編集 | fix66、fix469、IDSPLIT2、fix606、fix611、fix620、fix957、SFL1、SFLTap、EDIT01、EDLOG、EDN（inline）、fix295 |
| 記憶 | fix135、fix313、fix314、fix670、fix796、fix793、fix905、fix950/953、RC1 |
| 保存・同期 | fix246、fix228、fix525、fix527（FLW5）、fix543、fix654、fix399、fix402、fix590、fix826、fix697、fix702、fix705、fix743/750/756、fix781、fix758、fix912、fix945、fix859、fix564/721/726/291、WKRHANG1・INITSLOW1（Worker） |
| 削除・墓標 | DL2、fix933、fix587、fix579、fix602、fix660、fix577、fix710、fix642、JR1 |
| Vault・ユーザー分離 | vault2-sendgate、vault2-copygate、vault2-ui、LE4、fix889（BOOTOFF1）、iso2、ISO1、fix946 |
| 認証・アカウント | fix893、ADMF1、fix328、fix886/890、bav2-beta、FRIEND1・LIMIT1（Worker・管理者画面）、ADMHUB1・ADMBULK1（管理者画面）、MXALL（Worker・管理者画面 `f2258e33`）、鍵 `starticon1`・`idsplit2`（Worker `v46.37`・管理者画面 `752c623a`） |
| アイコン・画像 | av2-data、av2-portrait（FLW1）、av2-migrate-ui、LD1、LC1、ICONUX2、SETAV1、FLW2、ICF、fg3、fix63（fix979b）、fix197、fix523、fix990、p8d、ICONFIX1（Worker）、PUBMODE（Worker・管理者画面）、NDI1、ICF80、MIDICON（OLDMX1）、W-MXREG（Worker・93-i から端末側も）、STARTICON、IMGMODEL1（Worker・管理者画面）、CUSTIMG1（Worker・管理者画面）、DIAG1b（Worker） |
| UI・画面 | UI1、IS1、UX72、JMP、FLW3、LE3、fix777、fix243/270、fix880、SETUI1 |
| シナリオ・ホーム | fix819、fix825、fix873、fix335、GENDER1、NEWACCT1・HOMERETRY1（home.html の inline） |

---

## 2. 主要 fix の手書き項目

### 2.1 生成の中心・プロンプト

#### features.js — ゲーム本体のモジュール群
- 状態：本番稼働 `i62`・sha `143763f8`・?cb=`20261025-bundle55-sfl-a`。
- 役割：入力モード（DO/SAY/STORY）、`PromptRegistry` / `UserMessageRegistry` / `Planner._extensions` / `UI._renderHooks` などの登録口、会話ログ抽出、状態推論、表示の仕組み。index.html の中核 inline script（S・Api・Planner・UI・G.submit・保存）と組で動く。
- 注意：`Planner._extensions` は fix192（engineMode=1）では sys に乗らない「死に経路」（`.claude/rules/sys-injection.md`、fix226、fix313 の冒頭に記録）。新しい sys 注入は `Planner.build` を包むか、fix379 の keeper に登録する。

#### fix192 — 新プロンプトエンジン（生成の sys を丸ごと差し替える）
- 状態：本番稼働 `i105`・sha `6fbdcca4`・?cb=`20261107-bundle93-f`（**93-f の npcq1 C2 で更新**。前は `931d1310`・?cb=`20261101-bundle79-npres73d4b-on78c`＝80-int-a で NPRES の gate を呼ぶようにした版）。
- npcq1 C2（93-f・Owner だけの CANARY）：「入力を待たず NPC から言葉を発してよい」の文に「（ただし A は重傷・強い恐怖で動きが縛られているため除く）」を 1 つ付ける。有効なのは画面のアカウントが owner かつ active（fix893 の `/auth/me` の答え。ISO1・RC1 と同じ読み口）で匿名の経路でないときだけ。毎回評価する。招待した知人（beta）・none・suspended・ログアウト・匿名・`/auth/me` の未応答・例外では 93-e と同じ出力（Local の試験で sys の SHA が一致）。kill `v292Dfix192LicOff='1'`。H2（【制約】を最優先にする変更）は入っていない。
- 役割：`Planner.build` を最も外側で包み、`engineMode=1` のとき sys を「良い 1 ターンの形＋見本」の短い指示へ差し替える。進行度・台詞量・続きの検知・キャラ状態（fix77 の store を直接読む `stateBlock`）・記憶の文字列（fix796 から）を自分で注入する。出力形式（`<say>` / `<react>` / `<state>` タグ）は旧エンジンと同じ。
- engineMode の決まり方：`S.cfg.engineMode` が主、無ければ localStorage `v292EngineMode`。**新しい物語での既定値は 1 になる見込み（コードを読んだだけ・未実測）**：fix317（`v292Dfix317-slot-leak.js`）の `syncSelectors` が、物語の切り替えのときセーブの cfg に engineMode が無ければ既定値 1（`def:1`）を `S.cfg` に入れる（台帳 2230）。fix192 自身の既定は 0＝従来。実機での確認は未。
- 依存：fix77（store）、fix796（記憶）、fix226（旧エンジン用注入の退役）、fix379（keeper）。中に後から足された分岐が多い（fix812/813/832/903/930/932/956、A1、B0、B38、GQ2 など。スイッチは付録 C）。
- 既知の問題（laneNPRES 2026-10-31・合成物語で実測）：`stateBlock` は store の**全員**の状態を、何ターン前のものでも載せる。退場した NPC の様子が sys に残る。→ **NPRES が ON のアカウントでは抑制**（場面にいない／未確認の人物の からだ・こころ・本能・目的を載せず、【この場面の種】【自発】の候補からも外す。80-int-a）。**OFF のアカウントでは従来どおり**。NPRES の効果の本番での長ターン確認は未確認。

#### fix226 — 旧エンジン用 sys 注入の退役
- 状態：本番稼働 `i108`。役割：engineMode=1 で無駄に計算されていた旧注入（fix74/71/76/77/69/79/82 の sys 側）を、印を保ったまま無害な関数に置き換える。parse 側は残す。戻し：`v292EngineUnifyOff='1'`。

#### fix379 — wrap-keeper（sys 注入の登録簿と予算）
- 状態：本番稼働 `i195`・sha `6f406375`・?cb=`20261101-bundle83-flow-c`（83 で更新：【キャラ属性】の「名前=性別」の後ろに FLW4 の `suffix()` を足す。fix366 の予備経路も同じ）。
- 役割：sys 注入ブロックを `window.__f379reg` に `{off, marker, text}` で登録すると、毎ターン確実に、優先度つきの文字数予算の中で注入する（build の包みが外れる競合の根治）。
- 注意：予算からあふれた低優先のブロックは黙って落ちる前歴あり（記憶メモ「keeper 予算飽和」）。新しいブロックを足すときは実際の sys を傍受して確かめる。スイッチ：`v292Dfix379Off`・`v292Dfix379V4Off` ほか。
- FLW4（`v292DfixFLW4-cast-age.js`・83 の番号で `i360`・sha `e2b2877a`・?cb=`20261101-bundle83-flow-c`）：NPC の説明文（または構造化された `n.age`）に本人の年齢がはっきりあるときだけ、【キャラ属性】の「名前=性別」の後ろに「・17歳」を足す（FLW4-r2）。他人・過去・幅の書き方、2 つ以上の違う年齢、台詞の中、推測（「少女」「十代」など）からは足さない。主人公には足さない。保存・通信 0。kill `v292DfixFLW4Off='1'`（送信ごとに評価）。ほかの sys ブロック・予算・マーカーは変えない。

#### fix459 — sys の重複クラスタの統合
- 状態：本番稼働 `i260`・sha `8243a236`。役割：話者の同一性・出力形式・展開の進め方などで重複していたブロックを 1 つにまとめる。スイッチ：`v292Dfix459Off`、クラスタ別 `v292Dfix459AOff`〜`DOff`。

#### smrc1-model-registry — 使う AI モデルの登録簿
- 状態：本番稼働 `i16`・`h9`・sha `52ca67f1`。
- 役割：文章の主モデルを 1 行で決める（`deepseek/deepseek-v4.1-flash`、表示名「DS V4.1 Flash」）。モデル切替の UI は fix256・fix354・fix370。
- 注意：Worker 側にも使ってよいモデルの許可リストがある。

#### MSW1 — 文章のモデルの切り替え（Worker・管理者画面だけ。MSW1-c）
- 状態：本番稼働（Worker `v46.17-msw1c-fc`・ソース `033fa29c`・ルートの `modelSw`=`msw3`。管理者画面 `b4c007d6`。画面（Pages）の部品は無い）。台帳 2183・GPT #127-PI。
- 役割：管理者画面で、本文のモデルを `deepseek/deepseek-v4.1-flash`（既定・「DS V4.1 Flash」）と `deepseek/deepseek-v4.1-flash-1017`（「DS V4.1 Flash 1017」）から選ぶ。Worker は OpenRouter へ送る直前にモデル名だけを差し替える。差し替えるのは Owner（entitlement owner かつ active＝CANARY）の要求だけで、ほかのアカウント・旧経路はいつも V4.1 Flash（切り替えの KV も読まない）。
- 設定：KV `modelcfg:storyFlash`（＋ 目安の数 `:stat`・短い遮断 `:trip`）。1017 は許可モデルの一覧に入っていることが前提。1017 にする前に OpenRouter の endpoints API（鍵を送らない GET）で実在を確かめ、確かめられなければ 422 で断る。
- 安全網：「モデル・提供元が使えない」とはっきり分かる失敗のときだけ V4.1 Flash で 1 回だけ送り直し、その後 120 秒は 1017 を使わない（端末の再送と掛け算にしない）。時間切れ・通信の失敗・ほかの失敗では送り直さない。予算と記帳は今までどおりで、記帳するのは成功した 1 回だけ。
- 止める：env `CHR_MODELSW_OFF=1`（v46.13 と同じ動き）。戻し：Worker `95b4f70a`（`v46.13-admg-fc`）・管理者画面 `0b825943`。
- 端末の設定画面の「モデル管理」の表示は V4.1 Flash のまま（画面の変更なし）。1017 の料金・品質の比べ方は未確認。

#### BF1 — 推論で使い切った空応答の再送を「条件を変えた 1 回」にする
- 状態：本番稼働 `i96`。既定：**Owner だけ既定 ON**（`/auth/me` の entitlement owner・active）。ほかは `v292DfixBF1On='1'` で opt-in。kill：`v292DfixBF1Off='1'`。
- 背景：DeepSeek V4.1 Flash の一部 provider が推論で `max_tokens` を食い潰し、空の応答（finish_reason=length）を返す（2026-10-21 実測）。fix80 の再送と組み合わせて動く。

#### fix80 — 生成のゲートと再送
- 状態：本番稼働 `i97`・sha `6b90a1f2`。役割：応答が空・壊れているときの再送。fix494 の「1 論理ターンの送信は最大 3 回」の共通予算（記憶メモ 2026-07-19。現行コードでの上限値は未確認）。E65 系（1 ターンの送信回数と料金）の調査対象。

#### fix247 — API プロキシ切替（鍵をブラウザに置かない）
- 状態：本番稼働 `i57`・`h43`・sha `06dd6d0f`。
- 役割：`openrouter.ai/...` や画像 provider への通信を Worker（`novel-proxy`）の `/openrouter.ai` `/image` などへ書き換える。さらに pages.dev では fix893 が Worker 宛てを same-origin の `/api/*` へ付け替える（2 段）。

#### KN1 — Knowledge の Owner だけの試験（参考知識カードを user の末尾へ。93-j・鍵 `kn1`。`v292DfixKN1-knowledge-canary.js`）
- 状態：本番稼働（11-09・93-j）・`index.html` の最後（SETUI1 の後。`home.html` は読まない）・sha `63f439a1`・?cb=`20261109-bundle93-j`・版 `kn1-canary-20261109-a`。**既定 OFF**。GPT #127-RO ②。
- 公開の範囲：ADMF1 の鍵 `kn1`（Worker `v46.39-kn1-fc` で CANARY＝owner かつ active のアカウントだけ・行なし＝OFF）。
- 中身：承認済みのカード 4 枚（klib-0.2・kn2ab の B 条件と同じ文面）。今回の入力文にカードの名前・別名があり、物語の適用範囲に合うときだけ、`Planner.build` の戻りの user の末尾だけに参考知識のブロックを足す（sys には足さない）。失敗したら元の戻りのまま。
- 止める：管理者画面で `kn1` を 0。端末の kill `v292DfixKN1Off='1'`。診断 `window.__v292DfixKN1.status()`／`log()`／`logText()`。記録 localStorage `v292DfixKN1Log_v1`。

### 2.2 NPC・キャラ状態

#### fix77 — 状態の記憶（state memory）
- 状態：本番稼働 `i93`・sha `d53f65aa`・?cb=`20261019-bundle31-a`。
- 役割：AI に本文末で `<state who="名前" からだ="…" こころ="…" 本能="…"/>` を出させ、解析して端末に保存し（localStorage `v292Dfix77States`。fix246 で物語ごとのキーに振り分け）、表示からは必ず剥がす。次のターンで状態を sys に戻す（engineMode=1 では fix192 の stateBlock が担当）。
- データ：`window.__v292Dfix77Store`。fix190（傷の正本）・fix961（保留）と関わる。
- 依存・関係：fix192、fix305、fix333、fix414、fix853（切り詰め名の防止）、fix970（取り込み脱落の記録・既定 OFF）、E64（捨てた応答の取り込みを残さない）。
- 既知の問題：store の値は退場後も残り、fix192 と fix333 がそれを使う（§2.1 fix192、§2.2 fix333。NPRES が ON のアカウントでは使う側で抑制）。✎ 編集（EDIT01）は store を直さない。
- スイッチ：`v292Dfix532Off`・`v292Dfix901Off`・`v292Dfix938Off`・`v292Dfix961Off`（後から足された分岐。fix77 全体を止めるキーはファイル内に見当たらない＝未確認）。

#### fix305 — キャラ状態のトリガー注入（登場中の人だけ）
- 状態：本番稼働 `i132`・sha `1e1d23c9`。スイッチ：`v292Dfix305Off='1'`。
- 役割：fix77 が sys に入れた「【各キャラの現在の状態】」ブロックを、直近 4 ターンに名前が出た人物（＋主人公）の行だけに絞る。
- **既知の問題：新エンジン（fix192）の sys にはこの見出しが無いため、engineMode=1 では実質的に効いていない**（laneNPRES 2026-10-31 の実測）。

#### fix333 — 身体の現実エンジン ＋ NPC の前面化（actor-reality）
- 状態：本番稼働 `i171`・sha `7a4f567a`・?cb=`20261101-bundle79-npres73d4b-on78c`。**保護ファイル**（出荷時に変えない 9 本の 1 つ）。80-int-a で、前面化の候補を NPRES の `fgRestrict()` で絞る呼び出しだけを追加（コード内の注記は GPT #127-OG の条件付き許可）。
- 役割：
  - A：キャラの身体状態（fix77 の store）から、不可能な命令（拘束中に走る等）を「試してみる」形と身体状態の正史に差し替えてから生成させる（user 側の書き換え）。
  - C：前面化（foregroundSelector）。重要度で 1〜2 人の NPC を前に出し、しばらく黙っている NPC を順番に出す。指示は `Api.call` の直前（最後尾）に入れる。
- スイッチ：全体 `v292Dfix333Off='1'`、モード `v292Dfix333`=`observe`/`off`、NPC 前面化だけ止める `v292Dfix333Npc='0'`、`v292Dfix333HeroLabelOff`・`v292Dfix333SelOnceOff`・`v292Dfix927Off`。
- 既知の問題：前面化の候補を store の全員から選ぶため、退場した人物が強制的に戻ることがある。弱い離れの語（「画面」「電話」「待って」）で同席者まで外す害も記録あり（laneNPRES・台帳 2156）。→ **NPRES が ON のアカウントでは抑制**（CP1 の結果から、場面にいない／未確認の人物を外す。名前は足さない）。**OFF のアカウントでは従来どおり**。本番での長ターン確認は未確認。

#### fix414 — 身体・心理の制約エンジン（重傷・解離・凍結のコスト）
- 状態：本番稼働 `i221`・sha `371f8ce8`・?cb=`20261107-bundle93-f`（**93-f の npcq1 C2 で更新**。前は `fdad99f5`）。既定 ON（fix428 で ON 化）。止める：`v292Dfix414Off='1'`。
- npcq1 C2（93-f・Owner だけの CANARY。有効の条件は §2.1 fix192 の C2 と同じ）：重傷・強い恐怖のときも「動きは小さく遅い」「短い発話のみ」などの【制約】を作る（従来は傷の部位が分からないと何も出なかった）。Owner 以外は 93-e と同じ出力。kill `v292Dfix414WidenOff='1'`（拡張だけを止める）。試験（Local・偽の AI）：ユニット 35/0、10 ターン × 6 通りで owner は【制約】10/10・ほかの 5 通りは 0/10、MIDICON 87/0（Chromium・WebKit）、2 タップ 30/0。**本物のモデルが行動を変えるかは未測定**。語彙で判定するため、過去の傷や比喩の「出血」で反応し得る（owner だけ）。【制約】は予算が厳しいと落ち得る（H2 は未対応）。
- 役割：store から毎ターン導出したキャラ別の【制約】行を keeper（fix379・prio2）で注入する。関連：fix416（痛覚・既定 ON）、fix417（反応系の統合ブロック）、fix850〜852（同じターンの身体・姿勢・精神の能力制約。RR-1〜3）。

#### fix145 — キャラ一覧（モーダル）
- 状態：本番稼働 `i66`・sha `e7b06fd1`・?cb=`20261101-bundle79-npres73d4b-on78c`（80-int-a で更新：NPRES が ON のとき、✎ で描写が消えた状態値を一覧に出さない）。
- 役割：登場したキャラ（主人公・登録 NPC・長期記憶の自動抽出）の一覧、自動抽出キャラの正式 NPC への昇格、説明の編集、検索、入力欄への名前の挿入、「🎨 外見を作り直す」（fix773）。
- 書くもの：`S.cast.npcs`（昇格・編集）→ `S.save()`。
- 既知の問題：「最終登場」は本文から、状態は store から読むので表示が食い違うことがある（laneNPRES）。

#### fix298 — 永続キャラロスター（死亡・負傷の表示、手動退場）
- 状態：本番稼働 `i168`。止める：`v292Dfix298Off`。役割：fix277 由来の登場キャラを一覧に常に出し、死亡・負傷の表示と手動の退場を持つ。

#### fix277 — 準登録カルテ ＋ 帰属品質パック
- 状態：本番稼働 `i119`・sha `581842fc`。**保護ファイル**。
- 役割：未登録キャラが累計 3 ターン登場したら「準登録」にして状態行を整える。別名台帳（fix528/537/538/540）など同一性の処理も内蔵。
- 既知の問題：過去に別の物語のカルテが混入した前歴（記憶メモ 2026-07-28〜29。汚染データは削除済み）。fix641 はこのカルテを読まない設計。

#### fix307 — NPC 重要度ロスター抽出器
- 状態：本番稼働 `i140`・sha `574b4448`・?cb=`20261103-bundle93-c`（93-c で更新。前は `bada1da9`・?cb=`20261009-bh1`）。役割：要約 AI に弧の文脈を渡し、無名の重要な存在（「濡れた黒髪の女」等）に呼称を付けて一覧に載せる（重要度は高・中・低）。この名簿が MIDICON（§2.9）の候補の元。止める：`v292Dfix307Off`。
- 93-c の変更（GPT #127-QW ③・台帳 2244・2245）：名簿の更新が止まる件の修正。取得位置（localStorage `v292Dfix307Last_slot_*`）を AI を呼ぶ前に進めていたため、呼び出しか解析が黙って失敗すると名簿が止まっていた（本番の QA 物語で、位置は 33 まで進んだのに名簿の中身は 30 ターンのままだった。台帳 2245）。失敗（通信エラー・解析失敗・物語やスロットの差し替え・履歴の変更）では位置を元に戻し、60 秒後にやり直す（同時実行は 1 本）。AI の `max_tokens` を 600 → 1200（途中で切れて解析に失敗するのを防ぐ）。**本番での効果の実測は未確認**（出荷前に、次は 36 ターン目まで待つ計画だった）。

#### fix641 — 証拠が揃った人物だけを NPC として自動登録
- 状態：本番稼働 `i310`。役割：fix640 の証拠台帳だけを見て、2 ターン以上・強い証拠 2 系統以上の人物を `S.cast.npcs` へ登録。止める：`v292Dfix641Off`。

#### fix853 — 切り詰めた名前（「菅野」→「野」）の幽霊 NPC 防止
- 状態：本番稼働 `i339`・sha `14e1e6de`。**保護ファイル**。役割：AI が既知キャラの名前を切り詰めて出したタグで store に別人が作られるのを防ぐ。止める：`v292Dfix853Off`。

#### CP1 — 今の場面に誰がいるか（PRESENT / ABSENT / UNKNOWN）
- ファイル：`v292DfixCP1-scene-presence.js`（`i145`・sha `5ef63c79`）と観測口 `v292DfixCP1-final-tap.js`（`i4`・sha `22ac1bca`）。どちらも**保護ファイル**。
- 既定：**OFF**。opt-in `v292DfixCP1On='1'`、kill `v292DfixCP1Off='1'`（常に優先）。index.html に `window.__v292DfixCP1IdxAtt='att-r5'` の印があることが前提。
- 役割：NPC ごとの所在の最小の正本。場面移動（`<scene_move>` タグ）で全員 UNKNOWN に戻すなど。

#### NPRES — NPC 場面整合（場面にいない NPC を前面化・状態注入から外す）
- 状態：本番稼働（80-int-a・73-d4b＋admf2）。`v292DfixNPRES-presence-gate.js`・80-int-a の番号で `i343`・sha `99b249a8`・?cb=`20261101-bundle80-int-a`。
- 既定：**OFF**。ON になるのは管理者画面でそのアカウントの `npres1`=1 のときだけ（ADMF1 の `gate('npres1')`。行なし・取得失敗・未ログイン・待ちは OFF）。**端末の `v292DfixNPRESOn` ではもう ON にならない**（診断の表示だけ）。記録時点では Owner のアカウントだけ ON（限定カナリア）。一般は HOLD。81-admg-a から Worker の公開範囲で `npres1`=CANARY：Owner（entitlement owner かつ active）以外のアカウントは、行があっても `/auth/me` で明示の 0（§2.8 ADMF1）。
- スイッチ：kill `v292DfixNPRESOff='1'`（常に勝つ・その場で効く）。部分 kill `v292DfixNPRESd1Off`〜`v292DfixNPRESd4Off`。
- 役割：NPC を「場面にいる／未確認／別の場所」に分けるだけ（読むだけ。localStorage・S・store・サーバーへは書かない）。呼ぶ側：fix192（`gate()`：stateBlock と【この場面の種】【自発】）、fix333（`fgRestrict()`：前面化）、fix145（`orphan()`：一覧の表示）。通話の相手は「電話（無線／画面）の向こうにいる。この場にはいない。声だけで会話に加われる」の 1 行で残す。OFF のときは呼ぶ側が従来と同じ動き。
- 未確認：本番での長ターンの効果。

#### E64 — 捨てた応答の取り込み・保存を止める
- ファイル：`v292DfixE64-save-tap.js`（`i5`・`h3`、保存の共通の出口）と `v292DfixE64-discard-guard.js`（`i328`）。**保護ファイル**。
- 既定：OFF（Owner opt-in `v292DfixE64On='1'`）。kill `v292DfixE64Off`。
- 役割：書き直しの際に捨てた 1 回目の応答の `<state>` などが残らないようにし、「続きを止めた」印のある物語の汚染されたかもしれない state を Worker へ送らない。

#### fix797 — 同じターンの能力の矛盾（Layer2）
- 状態：本番稼働 `i327`・sha `346c7119`。**保護ファイル**。既定 ON（fix817）。kill `v292Dfix797Off`。
- 役割：明示された能力の境界（例：両手を縛られている）を、同じターンの生成が無視して完遂したときに検出し、書き直しを頼む。E65-D（中断の扱い）の対象。

### 2.3 話者・会話ログ・編集

#### fix66 — 会話ログの描画フック修復（＋未登録キャラのアバター文体）
- 状態：本番稼働 `i84`・sha `9dda0a16`。
- 役割：会話ログのカードが毎ターン消える不具合（fix54〜65 の包みの連鎖）を描画フックで根治。`repair()` は**足すだけ**（古いカードは消さない）。スイッチ多数（付録 C）。

#### fix469 — 話者同定「点数制＋否定証拠＋棄権」
- 状態：本番稼働 `i270`・sha `1dc25074`・?cb=`20261108-bundle93-h`（93-h で IDSPLIT2 の B の分岐を足した。前は `d968b745`・?cb=`20261025-bundle55-sfl-a`）。
- 役割：会話カードの話者を、台詞の前後の文から点数で判定する。元のタグは +60 で保護し、強い反証のときだけ変える。
- 既知の問題：隣の行の動作（「真鍋は封筒の口を開けた」）を話者の証拠と数えて反転させた事故（fix610 で「口を開」を発話動詞から除外）。→ fix611（中央ゲート）・fix620（適用）へ。
- IDSPLIT2 の B の分岐（93-h・Owner だけ。93-i から鍵 `idsplit2` が ON のアカウントだけ）：IDSPLIT2 が別名台帳に足した「登録 NPC を正名とする記述的な呼び名」を、IDSPLIT2 が有効な画面（判定は IDSPLIT2 の `aliasFor`。fix469 のファイルは 93-i で変えていない）に限り別人の候補にせず、その NPC の手がかりにする。kill `v292DfixIDSPLIT2Off`。全員に効く (A)「読み仮名を外す修正」は入れていない（下の IDSPLIT2）。

#### IDSPLIT2 — 名乗りで、記述的な呼び名を登録 NPC に結び付ける（93-h・B だけ。93-h は Owner だけの CANARY、93-i から管理者画面の鍵 `idsplit2`。`v292DfixIDSPLIT2-selfname-merge.js`）
- 状態：本番稼働（11-08・93-h。11-09 の 93-i で gate を変更）・`index.html` の fix620 の直後（`home.html` は読まない）・sha `3f75a2f2`・?cb=`20261108-bundle93-i`（93-h は `6ba937c2`・?cb=`20261108-bundle93-h`）。**93-i から**：効くのは、ADMF1 の鍵 `idsplit2` がそのアカウントで ON（アカウントの行 → 全体の値 → 無ければ OFF。Worker `v46.37-keys-fc` の範囲は READY・行なし＝OFF）で、`/auth/me` のアカウントが active で、匿名の経路でないときだけ（毎回評価）。ADMF1 が無い・鍵を知らない・答え待ち・停止中・ログアウト・例外は ON にしない（観測もしない）。**Owner も `idsplit2`=1 の行（か全体の値の ON）が無いと止まる**（93-h の「owner かつ active なら ON」の固定はやめた）。`repairPast` も鍵が ON のアカウントだけ。証拠の規則・kill は 93-h と同じ。管理者画面 `752c623a` に行がある（画像の費用なし。§2.8）。93-h の状態：効くのは owner かつ active で匿名でないアカウントだけ（npcq1 C2 と同じ判定）。kill `v292DfixIDSPLIT2Off='1'`（この部品と fix469 の B の分岐の両方が止まる）。GPT #127-RE ③（Owner の CANARY・条件付き GO）。gate を鍵に変えたのは Owner の方針（11-08：新しい機能は全アカウントへ・管理者画面で入れ切り）による。お客さまへ広げることについての裁定の更新は、この資料では未確認。
- 経緯（IDSPLIT1 の捕獲）：知人の試験用アカウントの物語で、登録 NPC がずっと「少女」のような記述的な呼び名で書かれ、fix307 の自動抽出で別人として一覧に出た。あとの名乗りの台詞を fix469 が記述的な呼び名の方へ反転させ、会話ログに 2 人として並んだ。
- 中身：新しいターンの会話カードの話者が記述的な呼び名（fix537 と同じ語尾）で、その台詞が「一人称＋登録 NPC のフルネーム」型の本人の名乗りで、名乗った登録 NPC がちょうど 1 人、同じ場面、候補が 1 人、説明が合う（種類の語、または性別と年齢層の両方）、別人を示す情報が無い、両方に fix77 の状態が無い、のすべてがそろうときだけ、fix277 の別名台帳に 1 件足し（fix537 と同じ置き場）、fix538 で会話ログの話者を登録名へ寄せる（先に控え `chr6_bk_fix538_<時刻>`）。1 つでも欠けたら観測だけ（メモリの中・表示もデータも変えない）。アイコン・cast・ロスター・状態・sys は変えない。過去のターンは開いたときに書き換えない（`repairPast({apply:true})` の明示の呼び出しだけ・Owner だけ）。観測口 `window.__v292DfixIDSPLIT2`。
- 試験（93-i・Local）：IDSPLIT2 の unit 141/0、ブラウザで鍵 ON 262/0、お客さまの行 ON 28/0。
- 試験（Local・nonet2・偽 AI・93-h の統合の木）：node 単体 129/0、fix469 17/5（落ちた 5 件は (A) を外したため落ちる項目で、レーンの B だけ版の記録と同じ）、実物語の再生 12/0、ブラウザ 15 本で 262/0（Chromium 11 本・WebKit 4 本）。WebKit の否定対照など 7 本は今回は未実行（レーンでは合格）。
- 残り・注意：結び付けた呼び名は以後その物語では同じ人を指す（あとから同じ種類の別の人が出ると混ざりうる）。GENDER1 で作ったキャラに対する動きは専用には試していない（未確認）。本物の端末・AI では未確認。Pages を戻しても、結び付けた別名と会話ログの直しは残る（上の「戻し先（93-h 時点）」）。93-i だけを戻す（93-h の `6ba937c2`）と Owner 固定に戻る。

#### fix606 / fix611 / fix620 — 話者の来歴・中央ゲート・適用
- fix606（`i273`）：どのカードの話者が何を根拠に決まったかを数えるだけ（書かない）。
- fix611（`i274`）：話者を書き換える補正器 9 本（fix303/376/383/388/390/462/465/469/489）の変更を「中央で通すか」判定する影モード。kill `v292Dfix611SpeakerGateOff`、`v292Dfix619ReconcilerOff`。
- fix620（`i276`）：新しいターンが確定した瞬間に、fix611 の 12 条件をすべて満たすカードだけ `who` を AI のタグに揃える。過去のターンは `repairPast()` を明示的に呼んだときだけ（既定は dryRun）。元の値は `v292Dfix620_restore_<スロットid>` に残す。kill `v292Dfix620ApplyOff`。

#### fix957 — 独立行の裸の「」の後方照応
- 状態：本番稼働 `i275`。**既定 ON**（コードの `DEFAULT_ON = true`）。端末で止める `v292Dfix957Off='1'`。
- 注意：index.html のこの行のコメントは「既定 OFF」と書いてあるが古い。

#### SFL1 — 話者の手動訂正（✎ 編集パネルの中）
- 状態：本番稼働 `i83`・sha `92fa4e4f`・?cb=`20261031-bundle78-admf-c`（80-int-a で更新）。
- 既定：kill `v292DfixSFL1Off='1'` が常に勝つ。それ以外は ADMF1 の `gate('sfl1')` で決まる：管理者画面の値（1=ON／0=OFF。端末の設定より優先）／行なし＝段階 1 では従来どおり端末の opt-in `v292DfixSFL1On='1'`（home の `?sfl=1` で書く・`?sfl=0` で消す）／取得失敗・未ログイン・待ち（最大 10 秒）・ADMF1 が無い・`v292DfixADMF1Off` は OFF。記録時点では管理者画面で Owner のアカウントだけ ON。
- **81-admg-a から**：Worker の公開範囲で `sfl1`=CANARY。Owner（entitlement owner かつ active）以外のアカウントは行の有無に関係なく `/auth/me` で明示の 0 になり、**招待者などは `?sfl=1`（端末の opt-in）でも使えない**（80 の段階 1 からの意図した変更・GPT #127-PC）。端末の opt-in が効くのは Owner のアカウントで行が無いときだけ。SFL1 のファイル自体は変わっていない。
- 役割：✎ 編集パネルに、カードごとの話者の選択欄を足す。保存は本文の編集と同じ 1 回の `S.saveD('UI.saveEdit')`。訂正の記録はターンの中（`turn._sflCorrections[]`、カードの安定 ID `_convSays[i]._sid`）。
- 80-int-a（78-admf-c）で管理者画面からアカウントごとに ON/OFF できるようになった（§2.8 ADMF1）。

#### SFLTap — 会話カードをタップして話者を直す
- 状態：本番稼働 `i86`・sha `197a15c6`（65-b）。SFL1 が使えるときだけ動く。kill `v292DfixSFLTapOff`。
- 役割：カード本体をタップ → 小さな選択シート → SFL1 の ✎ 経路（`UI.openEdit` → `UI.saveEdit`）をそのまま使って保存。アイコン・✕・ボタンのタップは対象外。スクロール直後 0.4 秒以内・文字選択中は無視。

#### EDIT01 — 本文を編集したら会話ログを本文に合わせる ＋ カード ✕
- 状態：本番稼働 `i85`・sha `5a41e946`・?cb=`20261031-bundle71-ednedg-a`（71-a で更新）。既定 ON。kill `v292DfixEdit01Off='1'`。
- 役割：✎ で本文を保存したとき、本文から消えた台詞のカードを外し、言い回しを直した行は話者を残して台詞だけ更新する。**71-a（69-edg）**：本文が変わっていなければ（改行コードの違いだけでも）整理をしない＝カードが消えない。この部分だけ止める `v292DfixEDGOff='1'`。
- 既知の問題：本文を**書き換えた**とき、本文にそのままの形で無い台詞のカードが外れることがある（案 B・未着手）。store（fix77）と `plan._v254who` は直さない。

#### EDLOG — 本文の手編集の記録（92-a・既定 OFF）
- 状態：本番稼働（`index.html` の SFLTap の直後・sha `4cb1ed47`・?cb=`20261103-bundle92-a`。`home.html` は読まない）。**既定 OFF**。ON は localStorage `v292DfixEDLogOn='1'`、kill `v292DfixEDLogOff='1'`（常に先）。対象は Owner の QA 物語 1 本だけ（物語 ID はコードに固定）。GPT #127-QO：Owner の PC だけの CANARY。Owner の PC の Chrome で ON、iPhone は OFF（台帳 2236）。
- 役割：✎ で本文を直して保存したとき、差分の記録を `turn._narrEdits[]` に 1 編集 1 件で足す。既存の保存（`UI.saveEdit` = SFL1(EDIT-01(元の saveEdit))）の外側を 1 回だけ包み、中から同期的に呼ばれる `S.saveD('UI.saveEdit')` の直前に記録を足すので、本文と記録は**同じ 1 回の保存**に入る（新しい保存経路・新しい localStorage キー・Worker の新しい op は無い）。保存が `ran:true` を返さなければ足した記録を外す。本文が同じなら記録しない（SFLTap の保存も同じ包みを通る）。
- 記録の形：`{ v:1, eid, ts, story, ti, tk, h0, h1, l0, l1, ops:[{p,d,i}], tr, rev0, g0, build, src:'edit', cd, cr, nq, sfl, pd }`。本文の全文は持たず、変わった区間だけ（`ops`）と編集前後のハッシュ（cyrb53）・文字数を持つ。上限は 1 ターン 12 件・1 物語 120000 字で、超えたら `ops` を持たずハッシュだけ（`tr`=2／3）。`rev0`（fix705）と `g0`（fix781）は編集した時点の値。保存後の rev・クラウド確定は書かない（後の分析でクラウドの書き出しに同じ `eid` があるかで見る）。
- 未確認：本番での記録はまだ 0 件（編集していない・台帳 2236）。iPhone。

#### EDN（inline script `v292DfixEDN-btn`）— ✎ 編集ボタンを本文の終わりへ
- 状態：本番稼働（index.html 554 行目の inline。80-int-a の行番号。71-a で追加）。CSS だけ。kill `v292DfixEDNBtnOff='1'`。

#### fix295 — 会話ログのスクロール保持 ＋ アイコン即同期
- 状態：本番稼働 `i124`・sha `993f7976`・?cb=`v292Dfix295e`（91-b で fix295e。90-b までは `3e3c528b`・?cb=`v292Dfix295d`）。
- 役割：会話ログが再描画されても、読んでいた位置（最下部なら最下部）へ戻す。再描画直後 350ms のスクロールは記録しない。fix197.sweep() でアイコンのずれを即同期。
- fix295e（91-b・GPT #127-QO）：新しいターンのあと会話ログが上端（0）に戻る件の直し。実測の型は 2 つ：①ログを空にして組み直す経路（例 EDIT01 の clearStream → UI.renderAll）でブラウザが scrollTop を 0 に丸め、最下部へ戻す書き込みが fix222 の門（`__convPinned=false`）で断られる。②物語を開き直したとき、UI1 の自動たたみの中でカードが入り、未スクロールの 0 を利用者の位置として記録する（台帳 2232）。直し：(a) 再描画後の復元が済むまで（pending）のスクロールは記録しない (b) 利用者のスクロールで最下部と記録したら `window.__convPinned=true` にそろえる (c) 最下部への書き込みが通らなければ記録した lastTop へ戻す (d) 装着のときは最新へ追従で始め、1 回だけ戻す。新しい timer・observer は無い。本番の QA 物語（Owner の PC）では、開き直したときと本文を変えずに保存したあとも一番下（台帳 2234）。iPhone の実機は未確認。
- 止める：`v292Dfix295eOff='1'`（295d と同じ動き）。部品全体は `v292ConvStabilityOff='1'`。

### 2.4 記憶

#### fix135 — 長期記憶（あらすじ・自動ワールド情報・重要イベント）
- 状態：本番稼働 `i64`。役割：数ターンごとに 1 回の AI 呼び出しで、あらすじ（約 300 字）・登場人物や場所の DB（fix136）・重要イベント（fix137）を作り、端末に保存（fix246 で物語ごとのキー）。`window.__longmem`。fix299 で永続化の欠落を根治した記録あり。

#### fix313 — 設定カード（トリガー式の永久の設定）
- 状態：本番稼働 `i155`。保存：`S.scene.cards[]`（物語の保存に相乗り）。注入：`Planner.build` を外側で包み、常時カード＋直近に語が出たカードを sys 末尾へ。止める：`v292Dfix313Off`。関連：fix951〜954（カード選択・届いたかの検出。fix953 は全体既定 ON）。

#### fix314 — 記憶メモ ＋ コンテキスト透視
- 状態：本番稼働 `i156`。保存：`S.scene.memoryNote`。毎ターン sys へ注入。透視（エンジンが今どう覚えているか）は読むだけ。止める：`v292Dfix314Off`（データは残る）。

#### fix670 / fix796 / fix793 / fix905 — Memory Engine（ME）
- fix670（`i316`）：採用済みターンから「世界の事実の候補」を決定的なルールで抽出し、端末の IndexedDB に記録。物語生成には使わない。
- fix793（`i322`）：canonical memory（memoryV1）を保存に載せる。fix796（`i104`）：記憶の取り出し（memoryText / guardText を fix192 へ渡す）。**既定 OFF**（`v292Dfix796On='1'`）。
- fix905（`i15`）：本番での ME の有効条件 = サーバー由来の entitlement owner **かつ** account_feature.memoryEngine（`/auth/me` の `features.memoryEngine`）**かつ** `v292DmeOff` が '1' でない。本番では端末の On フラグだけでは ON にならない。
- 全体の kill：`v292DmeOff='1'`。

#### RC1 — 昔の発言の想起（想起を求める入力のときだけ、本当にあった入力・台詞を user JSON に足す）
- 状態：本番稼働 `i144`（71-a の番号）・sha `fdeb53e9`・?cb=`20261107-ready1`（93-e の READY1 で更新。前は `975952be`・`20261101-bundle81-admg-a`）。kill `v292DfixRC1Off='1'`（常に先）。
- READY1 の端末側（93-e）：部品の中の `ownerGate` が、owner に加えて beta（status active）も通す。`rc1` の範囲は READY（Worker `v46.34b`）。READY だけでは何も開かない。アカウントごとの行（または全体の値の ON）が要る。
- 既定：ON になるのは ADMF1 の `gate('rc1', 端末の opt-in v292DfixRC1On)` が true、かつ従来どおり `/auth/me` が owner・active で匿名経路でないときだけ。`rc1` の公開範囲は CANARY（Owner のアカウントだけ ON にできる）。Owner のアカウントで行が無いときは段階 1＝端末の opt-in。81-admg-a で変わったのは opt-in の 1 行だけ。管理者画面で ON にすると、そのアカウントのすべての端末で ON。
- 役割：この物語の `S.turns` から、プレイヤーの実入力と話者の確かな NPC の台詞を `playerInputs`（storySoFar の直後）に足す（≤ 1,000 字・≤ 8 件。sys は触らない・保存しない）。

### 2.5 保存・同期（危険領域）

全体像は `DEVELOPMENT.md` §3。ここでは部品ごとの役割だけ。

| 部品 | 状態・位置 | 役割（ひとこと） | 主なスイッチ |
|---|---|---|---|
| fix246 | `i35` | per-story の付随データ（fix77 状態・longmem・会話ログ抽出など）を `localStorage` の読み書きの段階で物語ごとのキーへ振り分ける | `v292Dfix783Off` |
| fix228 | `i109` | スロットの自動世代バックアップ（直近 3 世代 `__gen_<slotKey>`）と巻き戻り検知。`window.__v292Restore()` | `v292SlotGenOff` |
| fix525 | `i298` | タブの所有権ピン（他タブの切替で自分の物語を他スロットへ書かない） | `v292Dfix525Off` |
| fix527 | `i60` | 開いている物語の真実を URL の `?story=` にする（`chr6_active_slot` は互換用ミラー）。83 で sha `2ee15cb3`・?cb=`20261101-bundle83-flow-c`：「🏠 ホーム」の押下を先に FLW5 へ渡す。FLW5（83 の番号で `i361`・sha `c3679050`）＝保存が書く形（保存先の妥当な origin を含む）で比べ、意味の無い差（origin・`cast.av2.known.*.appeared`）だけを外して同じなら書かない。DIRTY の印には触れない（② は GPT #127-PG で外した）。kill `v292DfixFLW5Off`。**93-e（OPEN1）で sha `8c62d316`・?cb=`20261107-open1`**：ISO1 の関門が掛かっているあいだは `touchOpened`／`lastOpenedAt` を書かない。fix889 の関門が掛かっているときは解除まで待つ（最大約 60 秒・250 ms ごとに確認）。解除後にだけ書く | `v292Dfix527Off`・`v292DfixFLW5Off` |
| fix543 | `i36` | 保存（setItem）の失敗を無言にしない。物語の保存失敗はトースト | `v292Dfix543Off` |
| fix654 | `i7` `h4` | iOS Safari で localStorage のラッパが素通りする問題（第 18 型）を `Storage.prototype` のアクセサで根治。localStorage を包む部品より前に読まれることが前提（index では 7 番目。前にある部品との関係は未整理） | `v292Dfix654Off` |
| fix399 | `i210` | 旧方式の端末間同期（アカウント単位のパッケージ）。起動時 pull・保存時 push・楽観ロック | `v292Dfix399Off`・`v292Dfix399AutoOff` |
| fix402 | `i216` | 不可視の双方向同期（確認ダイアログなし・rev/baseRev・fork は非モーダルの選択）。既定 ON | `v292Dfix402Off` |
| fix590 | `i32` `h19` | コミット台帳（送ったが応答を取り逃した「結果不明」を記録して自力で決着） | `v292Dfix590Off` |
| fix826 | `i29` `h35` | fork を保存成功と扱わない・古い pull 応答を当てない | `v292Dfix826Off` |
| fix697 | `i39` `h22` | per-story canonical への書き込み（putstory / putcanonical / commitstate）。多数の後続分岐を内蔵（fix781b/c・909・910・911・913・914・BCJ1/2 など） | `v292Dfix697Off` ほか。93-a（sha `d8c44cd4`・?cb=`20261103-bundle93-a`）で、MIDICON の専用の口 `assetV2Mx` を足した（op は `portrait.mx_list`・`portrait.mx_ensure`・`portrait.mx_claim` の 3 つだけ・送る項目は op ごとに固定・何も保存しない・既存の `assetV2WriteImpl` と canonical の CAS には触らない）。93-i（sha `36367c10`・?cb=`20261108-bundle93-i`）で、`portrait.mx_ensure` に `character_id` を付ける口を足した（W-MXREG。登録 NPC の id の形だけ通す・`ch_mx` の id と variants つきは断る・localStorage `v292DfixMIDICONregOff='1'` なら送らない。§2.9 W-MXREG） |
| fix702 | `i45` | legacy → per-story canonical の権限の切替（promotestory 等）。**既定 OFF**（`v292Dfix702On`）。C1 の in-memory permit でも通る。legacy apply mask は既定 ON | `v292Dfix702Off`・`v292Dfix702MaskOff` |
| fix705 | `i25` | 起動時に物語を server の getstory で分類し、canonical を当てる読み取りの関門（fix706/707/757 の改訂を含む） | `v292Dfix705Off` |
| fix743 | `i329`・動的 | schema2 の組み立て・当て込みの関数群（CC2）。単体では何もしない | `v292DfixCC2On`／`Off`・`v292Dfix743Off` |
| fix750 | `i330` | 1 つの物語を schema1 → schema2 canonical へ移す状態機械（prepare は可逆・commitSchema2 は不可逆） | `v292Dfix750On`／`Off` |
| fix756 | `i331` | **サーバーに行が無い新しい物語は最初から schema2 にする**（製品の既定。fix750 を 1 回だけ呼ぶ） | `v292Dfix756Off`・`v292Dfix810Off` |
| fix781 | `i17` | 未同期のローカル進行を server canonical で上書きしない（データ消失の根治） | `v292Dfix781Off` ほか |
| fix758 | `i333` | 「クラウドに保存できていません」等のバナー（表示だけ・5 秒ごとに fix697 を読む） | `v292Dfix758Off` |
| fix912 | `i40` | 開いたままの物語で別端末が進めたとき、PUT せず idle で 1 回 reload して収束 | `v292Dfix912Off` |
| fix945 | `i299` | 同じ物語を 2 タブで開いたとき、古いタブが新しい編集を巻き戻すのを防ぐ | `v292Dfix945Off`。93-a の本番 QA（11-03）で「この物語は別のタブ（または画面）で更新されました」の帯が 1 度出て、そのターンは保存されなかった。**原因は未確認**（MIDICON・EDLOG・ICF80 が物語の鍵に書く経路は静的にも動的にも見つからず、93-b の試験では再現しなかった。台帳 2238・2240）。再び出たら、読み直す前に `window.__v292Dfix945.state()`（`stale.why`・`detail`）・保存の応答・ターン数・MIDICON の状態を取る（GPT #127-QS） |
| fix745 / fix746 / fix748 | `i18`〜`i20` | 複数キーをまたぐ書き込みの直列化（Web Lock）・スロット分離の権限・Class D の受け入れ | 各 `Off` |
| fix698 | `i21` `h10` | 正本の変更を許可された経路だけに通すバス | `v292Dfix698Off` |
| fix859 | `i24` `h21` | 物語ごとの合言葉（STORY_PASSCODE）のセッショントークンを sessionStorage に持つ | `v292Dfix859Off` |
| fix490 | `i290` | スロット上書き事故の防止（上書き前の自動控え・setItem の常設ガード） | `v292Dfix490Off` |
| fix564 / fix721 / fix726 / fix291 | `i50`・`i52`・`i51`・`i122` | 付随データ込みのスナップショット／安全な丸ごと復元（`localStorage.clear()` 禁止）／書き出す控えから認証情報を落とす／書き出し・読み込みの UI | 各 `Off` |

#### WKRHANG1 — ログイン後の保存が返らないまま止まるのを防ぐ（Worker `v46.35c-hang1-fc`）
- 状態：本番稼働（11-08。ソース `7ffa92b1`＝第 2 版 r2。11-08 14:2x から INITSLOW1 の v46.35d の土台として本番に入っている。GPT #127-RG の条件付き GO を受けて確かめを 3 つ足し、共有の promise を消すのは「その promise 自身」が失敗したときだけにした）。画面（Pages）の部品は無い。D1 の表・KV のキーは足していない。
- 経緯：11-08 03:40〜04:05 JST に、ログインした状態の `POST /save`（listshadow・vault2visible など）が 60 秒以上返らなかった（outcome canceled・CPU 0 ms）。ログイン前に断られる要求・`/auth/me`・D1 そのものは速かった。isolate の作り直しで、同じコードのまま回復した。**原因は仮説**（isolate ごとに 1 回走る D1 の表の準備〔約 44 本の DDL〕の共有 promise が決着しないまま残り、後の要求が全部それを待った。最初の要求が途中で切られた可能性が高め）。
- 中身：共有の準備の promise（D1 の準備・アカウントの表・KV の config／`acct:` の読み・Vault v2・Asset v2・機能・監査の 6 つ）を待つのを、待つ要求ごとに env `CHR_INIT_TIMEOUT_MS`（50〜30000。未設定・不正は 8000 ms）までにする。超えたら：D1 の準備は 503 `D1_INIT_TIMEOUT`（`retryable:true`・`keepLocal:true`。KV 側へは落とさない）、アカウントの表と KV の読みは 503 `ACCOUNT_STORE_TIMEOUT`（`retryable:true`。「記録が無い＝通す」や 403 にはしない）。Vault v2・Asset v2・機能は従来の失敗の答えのまま。D1・KV が「すぐ失敗する」ときの動きは従来と同じ。ログは `{"evt":"INIT_TIMEOUT","tag":…}`／`{"evt":"INIT_STALE"}`（コードだけ・アカウント ID や SQL は出さない）。
- 試験（Local・偽の D1 と KV・外部通信 0）：hang1_fx 41/0、hang1_rg_fx 41/0（時間切れの 503 を返した保存は D1 に何も書かない）、本物の画面で 503 から戻れるか（手元の 2 ターンは残り、二重にならない）。
- 残り・注意：D1 が本当に止まっているあいだは要求ごとに最大 8 秒待ってから 503（複数の準備が同時に止まると 1 要求で最大およそ 40 秒）。画面は 503 の保存を自分からは送り直さない（fix697 の設計）ので、直ったあとも次の保存か読み直しまでクラウドは手元より遅れる。出荷後の確かめ：`INIT_TIMEOUT`／`INIT_STALE` が普段 0 件・`/save` の wall time の P99 が 10 秒未満・canceled の減少。本番での観測の結果は未記録。
- 戻す：Worker `dca5e74e`（v46.35b-custimg1-fc）を貼り直す。D1・KV に変更が無いので何も残らない。

#### INITSLOW1 — 冷えた Worker の最初の保存が 8 秒の時間切れになるのを減らす（Worker `v46.35d-initslow1-fc`）
- 状態：本番稼働（11-08 14:2x JST。ソース `9b94f399`・Cloudflare の版 `a32dc87b`。17:0x から W-MXREG の v46.36 の土台として本番に入っている）。画面（Pages）の部品は無い。D1 の表・KV のキー・成功したときの答えは変えていない。
- 経緯：93-g の出荷直後、新しい isolate の最初のログイン後の `/save` が 8 秒で 503 `D1_INIT_TIMEOUT` を 7 回返し、約 15 秒後に自力で戻った。手元で数えると、isolate ごとの最初の要求は D1 と約 55 往復を順番にし、うち 44 本は表がそろっていても毎回流す DDL だった（「止まった」のではなく「遅かった」という見立て・確度 中）。
- 中身：①表・index・列がそろっているかを読み取り 4 本（並列）で先に確かめ、すべてあれば DDL を省く。1 つでも欠けていれば従来の DDL をそのまま流す。止め方 env `CHR_D1_FASTCHECK_OFF=1`。②時間切れでも進行中の準備を捨てず、次の要求がそれを待つ。捨てるのは env `CHR_INIT_ABANDON_MS`（既定 16 秒）を過ぎても決着しないときだけ。準備が残っている間は `ctx.waitUntil` で要求の寿命を延ばす（30 秒以下）。止め方 env `CHR_INIT_REUSE_OFF=1`（v46.35c と同じ動き）。③ログ `{"evt":"D1_INIT","path":"fast|full","ms":…}`。時間切れは今までどおり 503（fail-closed）。
- 試験（Local・偽の D1 と KV・外部通信 0）：initslow1_fx unit 33/0。冷えた起動の再現 16 通り（往復が多い型で、v46.35c は最初の 200 が 28.5 秒、v46.35d は 503 なしで 4.3 秒）。WKRHANG1 の試験 2 本は止め方 ON で 41/0。
- 本番での確認：出荷直後の新しい isolate で、Owner のホームの `/save` 9 本・`/auth/me` 5 本がすべて 200（503 は 0）、最初の `/save` は 1.7 秒。Observability の `D1_INIT` の件数・時間は未確認。
- 引き換え：本当に止まった準備からの立ち直りが約 8 秒から最大約 16 秒に延びる。
- 戻す：Worker `7ffa92b1`（v46.35c-hang1-fc）を貼り直す。D1・KV に何も残らない。

### 2.6 削除・墓標（危険領域）

#### DL2 — サーバーの版を基準にした物語の削除（S-2）
- 状態：本番稼働 `i154`（`data-dl2="index"`）・`h32`（`data-dl2="home"`）・sha `34507755`。kill `v292DfixDL2Off`。
- 役割：**削除の入口はホームだけ**。確認シート（画面内。confirm/alert は使わない）を開く前に `/api/auth/me` の accountId と listshadow を読み、server の rev / hash を基準に `deletestory2` を送る。ゲーム画面とギャラリーの削除の入口はホームへ誘導するだけ。
- サーバーが拒否するもの：保護している物語、Vault で隠した物語、この端末にしかない物語。サーバーに墓標を書くソフト削除で、**元に戻す手段は無い**。
- 関連：DP3（端末の一覧から外す。`v292DfixDP3On`。HOLD 中）、DP4。

#### fix933 — 招待テスト中は owner 以外に削除を使わせない
- 状態：本番稼働 `i153`・`h27`。owner 以外（beta・paid・不明）は削除ボタンを出さない（fail-closed）。kill `v292Dfix933Off`。

#### fix587 / fix579 / fix602 / fix660 / fix577 / fix710 / fix642 / JR1 — 旧来の削除の安全装置群
- fix587（`i149` `h26`）：StoryLifecycleService。削除の正規の手順（再読込 → exact key と hash → 控え → 墓標 → …）。cc2 を必要時に動的読込。
- fix579（`i148` `h18`）：墓標のスキーマとマージ規則（`chr6_slots_meta` の `deleted:true`）。
- fix602（`i150` `h28`）：墓標が立ったスロットへの書き込みを影監視（拒否しない・記録だけ）。
- fix660（`v292Dfix660-delete-gateway.js` `i34` `h12`、`v292Dfix660-backup-gc.js` `i53` `h17`）：物理削除の唯一の実行者と、何を消すかを決める BackupGC。
- fix577（`i151`）：削除の入口を 1 つに寄せる。fix710（`h31`）：ホームで保留中の削除を起動時に 1 回再開。fix642（`h29`）：削除の read-back（操作専用）。
- JR1（`i332` `h34`）：サーバーで削除済みの物語を指したまま残った fix750 の journal を退避し、新しい物語が作れない・全物語が止まる状態を解く。

### 2.7 Vault（物語を隠す）・ユーザー分離（危険領域）

#### vault2-sendgate / vault2-copygate / vault2-ui / LE4 — Vault v2
- sendgate（`i1` `h1`、**最初に読まれる**）：物語由来の外部送信の関門。プロキシ経路には `body.chrStoryId` を付けて Worker に毎回見える状態か判定させ、直接の外部送信は直前に `vault2visible` で確認。kill `v292Dvault2GateOff`。
- copygate（`i2` `h2`）：隠した物語の新しい複製（localStorage・sessionStorage などへの新規キー）を作らせない。kill `v292Dvault2CopyGateOff` ほか。
- vault2-ui（`h49`）：ホームの右上の鍵ボタン 1 つ（閉じている／開いている。開くと全端末で閉じるまで隠した物語が一覧に戻る）。kill `v292Dvault2UiOff`。
- LE4（`i69` `h50`）：開いている物語ページが再施錠・非表示化に追従（覆いを掛けて reload → fix889 の扉へ）。kill `v292DfixLE4Off`。
- 冒頭コメントは「OFFLINE CANDIDATE / NOT FOR DEPLOY」のままだが、本番で読み込まれている。
- Worker 側にも Vault v2 の判定がある（誰に使わせるかの設定はサーバー側。現在値は非公開の記録を参照）。

#### fix889 — 旧 Vault（v1）クライアント
- 状態：本番稼働 `i22` `h42`・sha `4221f41d`・?cb=`20261108-bundle93-g`（93-g の BOOTOFF1 で更新。前は `82edc1ad`）。v7.8 で**通常の利用者には入口を出さない**（`v292Dfix889QA='1'` の端末だけ）。扉・起動時の関門は動いている。実装は凍結（93-g の BOOTOFF1 だけを足した）。
- BOOTOFF1（93-g）：クラウドの物語を開くとき、一度「オフラインのため…」の扉で止まると自動で聞き直さなかったのを、`probeGate()` の失敗の枝で最大 4 回（2・6・15 秒）聞き直す。契機はタイマー・認証の変化・`chr:account-me`・online・focus／表示。聞き直しは「もう一度確認する」と同じ経路。**サーバーが ready と答えるまで扉は閉じたまま**（fail-open なし）。reload は従来の `gateReload` だけ（`REL_MAX=2` のまま）。Vault の隠しと書き込みは変えていない。kill `v292DfixBOOTOFF1Off='1'`（93-f と同じ動き）。観測は状態の `bo1`（読むだけ）。試験（Local）：7 つの場面で、93-f は全部閉じたまま、93-g は遅い・401・503・通信の一瞬の失敗・遅い応答の 5 つで開き（3.7〜24 秒）、オフライン・非表示の 2 つは閉じたまま。kill の通しの最初の 1 回だけ「開いた」（4.4 秒）が、再実行では 93-f と同じ（タイミングの競合と判断）。

#### iso2 / fix946 — 送信時の持ち主照合・画像のアカウント境界
- iso2（`i13` `h8`）：送信の時点で「データの持ち主」と「送信先のアカウント」を照合。kill `v292Diso2Off`。
- fix946（`i12`）：アカウントが変わったら、画像系の端末状態を退避してから持ち主の印を付け替える（第 1 段 M3）。

#### ISO1 — 他人・持ち主不明の端末内だけの物語を隠す（93-d で追加・93-e で OPEN1 を足した。`v292DfixISO1-local-only-foreign-hide.js`）
- 状態：本番稼働（2026-11-07 19:40 JST・93-d。ビルド ISO1e）・sha `0f1ff245`・?cb=`20261107-iso1e`。読込：index.html は fix893 の直後、home.html は iso2 の後・fix889 の前。kill（端末ごと）`localStorage v292DfixISO1Off='1'`。状態の確認：`window.__v292DfixISO1.status()`。
- 役割：端末の中だけにある物語（クラウドに無い）のうち、持ち主の証拠が**別のアカウント**または**不明**のものを、ホームでは隠し、物語を開く関門で断る。**消さない・動かさない・書き換えない**（隠すだけ）。
- 証拠：①iso2 の印（作った人と最後に書いた人が、このアカウント）②このページの `/auth/me` と fix889 の listshadow の答え（同じアカウントのとき。ISO1 だけの台帳 `v292DfixISO1_srv`）。`/auth/me` がログインの印と食い違うとき（`srvMeDisagrees`）は証拠に使わない。
- 引き取りの画面は無効（`CLAIM_ON=false`）。CUTOFF `2026-11-07T19:45+09:00` は引き取りが無効のあいだ使われず、再出荷でも更新しない。
- OPEN1（93-e）：関門が掛かっているあいだは fix527 が `touchOpened`／`lastOpenedAt` を書かない（上の fix527 の行）。fix870 の続きから遊ぶも見える物語だけ。
- 試験（Local）：関門 17/0、MIDICON 14 モード 87/0（PC・WebKit）、2 タップ 30/0、ISO の場面は両ブラウザで失敗 0。93-e：PC の MIDICON 87/0、2 タップ 30/0、ISO の場面は両ブラウザ失敗 0、OPEN1 のログアウト 11/0・touch 11/0・cont 7/0（両ブラウザ）、RC1 の画面 12/0（両ブラウザ）。**WebKit の MIDICON は 93-e では再実行していない。**
- 本番での確認：93-d について Owner の実機（PC と iPhone のログイン・35 ターンの同期）は合格。93-e の実機での確認は未記録。

### 2.8 認証・アカウント（危険領域）

#### fix893 — アカウント cookie の付け替え（same-origin）
- 状態：本番稼働 `i8` `h5`・sha `151c41bf`・?cb=`20261031-bundle78-admf-c`（80-int-a で更新）。kill `v292Dfix893Off`（`v292Dfix897Off` も）。
- 役割：pages.dev でだけ動く。Worker 宛ての fetch / XHR を same-origin の `/api/*` へ付け替え、旧来の認証ヘッダを外して CSRF 対策のヘッダを付ける。認証は HttpOnly の cookie だけ。localStorage に認証情報を置かせない。ログインは Google → `POST /api/auth/google` → cookie。`window.__v292Dfix893.me()` が `/auth/me` の結果（accountId・status・entitlement・features）を配る。
- 他の部品が頼る：fix905（ME の Owner 判定）、fix933、UI1、BF1、DL2 など。
- 80-int-a（78-admf-c）：`/auth/me` の答えの機能スイッチ（accountFlags）を端末のメモリにだけ写し（`flagsSnap()`）、失敗・ログアウト・別アカウントへの切り替えのたびに捨てる。ADMF1 が読む。

#### ADMF1 — アカウントごとの機能スイッチ（管理者画面 → 各端末）
- 状態：本番稼働（81-admg-a・admg1。80-int-a の admf2 から更新）。`v292DfixADMF1-account-flags.js`・80-int-a の番号で `i9`（fix893 の直後。home.html では読まない）・sha `697272e3`・?cb=`20261109-bundle93-j`（93-j で鍵 kn1 を追加。93-i は `b35e6324`）（93-i で `mxreg1`・`starticon1`・`idsplit2` を足した。版 `admg1-20261101-bundle81+starticon2+idsplit2`。93-a〜93-h は `93d1ac47`・?cb=`20261103-bundle93-a`〔93-a で `midicon1` を足した〕。81-admg-a〜92-a は `5077be9b`・?cb=`20261101-bundle81-admg-a`）。kill `v292DfixADMF1Off`（ADMF1 を使う機能は OFF になる）。Worker 側の停止は env `CHR_ACCT_FLAGS_OFF=1`。
- 役割：読むだけ（localStorage・cookie・DOM・通信へは書かない）。fix893 の `flagsSnap()` から「その機能を使ってよいか」を答える。値は管理者画面の acct-flag-set（CAS）で D1 の `account_feature` に 0/1 で書く。許可キーは 7 つ（93-a から。81-admg-a〜92-a は 6 つ）：`sfl1`（SFL1）・`npres1`（NPRES）・`lc1`（LC1 の作業欄）・`ld1`（LD1）・`rc1`（RC1）・`oma1`（fix335 おまかせ。fix334 の入口ハブのボタンと index.html の設定のボタンも同じ判定）。`lc1`〜`oma1` は 81-admg-a で追加。7 つ目の `midicon1`（MIDICON の自動アイコン。§2.9）は 93-a で追加（行なしは常に OFF・Worker の範囲は CANARY・管理者画面の「まとめて ON」に入らない＝noBulk）。Worker `v46.36-wmxreg-fc` から `midicon1` は READY、管理者画面 `f2258e33` から一括 ON に入る。8 つ目の `mxreg1`（W-MXREG。§2.9）は Worker `v46.36` と管理者画面 `f2258e33` に加わり、端末の ADMF1 は 93-i（`b35e6324`）から知る（93-h までの `93d1ac47` は知らなかった）。**93-i から許可キーは 10 個**：9 つ目の `starticon1`（STARTICON。§2.9）と 10 個目の `idsplit2`（IDSPLIT2。§2.3）を Worker `v46.37-keys-fc`・管理者画面 `752c623a`・端末の ADMF1 `b35e6324` で足した。`mxreg1`・`starticon1`・`idsplit2` はどれも行なし＝OFF（端末の opt-in は無い）。`/auth/me` の accountFlags には `mxreg1` と同じ形で出る。
- 公開の範囲（81-admg-a・GPT #127-OW／#127-PC）：Worker の定数 `CHR_FEAT_SCOPE` が鍵ごとに決める（変えるのは Worker の更新＝裁定のあと）。
  - `READY`＝全体の値を書ける・読む。どのアカウントも ON にできる。`CANARY`＝ON にできるのは entitlement owner かつ active のアカウントだけ。全体の値は書かない・読まない。`HOLD`＝管理者画面に出すが、全体もアカウントも ON にできない。
  - 記録時点の値（Worker `v46.37-keys-fc` から）：`sfl1`・`ld1`・`rc1`・`oma1`・`midicon1`・`mxreg1`・`starticon1`・`idsplit2`＝READY、`npres1`・`lc1`＝CANARY、HOLD は 0 個（Worker の定数 `CHR_FEAT_SCOPE`）。v46.37 の v46.36 との差は 4 か所だけ（`CHR_ACCT_FLAG_KEYS` に 2 つ〔8 → 10 個〕・`CHR_ACCT_FLAG_UNSET` で 2 つとも `'off'`・`CHR_FEAT_SCOPE` で 2 つとも READY・`workerBuild` の名前）。`v46.36` は `starticon1`・`idsplit2` が無い 8 個。`v46.34b`〜`v46.35d` は `midicon1` も CANARY（READY1 で `sfl1`・`ld1`・`rc1`・`oma1` を READY に）。v46.36 での `/auth/me` の変化：招待した知人の `midicon1` は「範囲の外の明示の 0」から、行が無ければ「キーなし」になる（端末の ADMF1 は行なしを OFF とみなす＝見え方は同じ）。**READY だけでは何も開かない。アカウントごとの行（または全体の値の ON）が要る。全体の ON は、entitlement `none` のアカウントにも届くため使わない。**（`v46.33b` までは 7 つとも CANARY・READY は 0 個。`lc1` は 86 の Worker `v46.27` で HOLD から CANARY に変更。81〜85 は HOLD）。
  - 範囲の外の ON は Worker が断る（acct-flag-set・feat-global-set とも 403 `SCOPE_REFUSED`、管理者の監査に `refused`）。
  - `/auth/me`：そのアカウントに許されない鍵（HOLD の鍵すべて・CANARY で Owner でないアカウント）は、**行が無くても明示の 0**（端末の opt-in でも ON にならない）。READY の鍵で行が無いときだけ全体の値で埋める（KV の機能ごとのキー `featcfg:<鍵>`。読めない・壊れている＝0。反映は最大約 1 分の結果整合。書き込みは expect つき＋読み直しの BEST_EFFORT）。旧 Worker はこのキーを読まない。
- 判定の順：部品の kill ＞ `v292DfixADMF1Off` ＞ 範囲（Worker）＞ アカウントの行 ＞ 全体の値（READY だけ）＞ 行なしの扱い。答えが無い・読めない・別アカウントの答え・fix893 が無い配信先は OFF。
- 行なしのとき（範囲の中に限る）：`npres1` は常に OFF（`midicon1`〔93-a〕・`mxreg1`・`starticon1`・`idsplit2`〔93-i〕も常に OFF）。それ以外の 5 つは段階 1＝従来どおり端末の opt-in（`?sfl=1`・`v292DfixLC1On`・`v292DfixLD1On`・`v292DfixRC1On`・`v292Dfix335`）、段階 2＝OFF（本番の段階の設定値は未確認。未設定なら段階 1）。
- `whenOn(key, devFn, cb)`（81-admg-a）：読み込み時にしか判定しない部品（LC1・LD1・おまかせのボタン）用。答えが後から届いて ON になったら cb を 1 回だけ呼ぶ（OFF→ON の 1 回だけ。ON→OFF は次に開いたときから）。
- 管理者画面：「機能スイッチ」の表（1 行 1 機能・6 行。93-a の `abd3084d` から `midicon1` の行が加わり 7 行、`f2258e33` で `mxreg1` が加わり 8 行、`752c623a` で `starticon1`・`idsplit2` が加わり 10 行）に、範囲・全体の値・アカウントごとの値と「このアカウントの機能をまとめて ON」。81-admg-a から既定は閲覧制限モード（下の「管理者画面の伏字」）。83（管理者画面 `0b825943`・表示だけ）から、範囲が許す機能がすべて ON なら状態の 1 行「利用可能な機能はすべて ON（n）」、そうでなければボタン「利用可能な機能をまとめて ON（n）」（HOLD・範囲の外は数えない）。押したときの確認はブラウザの confirm ではなく画面の中に出す。送る内容・順番は変えていない。MSW1-c の管理者画面 `b4c007d6` はこの上に「文章のモデルの切り替え」を足したもの。
- 管理者画面 `e5198d0a`（2026-11-07 夜。戻し `18594749`）：READY の範囲と、アカウントごとの規則（READY でも行か全体の ON が要る）を表示する。
- 管理者画面 `a2ea35ca`（ADMBULK1・11-08。戻し `e5198d0a`）：①機能スイッチの一番上に「全機能を一括 ON（全体）」。対象は Worker が返した範囲が **READY の機能だけ**（今は `sfl1`・`ld1`・`rc1`・`oma1`。決め打ちなし）で、全体が ON でないものにだけ既存の `feat-global-set` を 1 つずつ送る（今の値を `expect` に付ける・最初のエラーで止める・成功／失敗／未実行と読み直した状態を出す）。CANARY・HOLD・一般公開・画像モデル・知人の画像・予算・招待・診断・安全装置は含まない（理由と解除の条件を表示）。確認は画面の中。「一括 OFF」は無い。**全体の ON は招待した知人にも届く**（上の「全体の ON は none のアカウントにも届くため使わない」の注意について、パッケージの説明は「招待していないアカウントは遊べない」としている。実際に押したかは未記録）。②ページ上部の目次（見出しから自動で作る）と CSS だけの見やすさの調整。③画像モデルの行の下に「知人の画像（CUSTIMG1）」の行（§2.9 CUSTIMG1。一括 ON に入らない）。④Chronicle Knowledge（学習機能）の読むだけの行（テスト中・READY ではない・スイッチなし。**Knowledge v0 は既定 OFF のまま**＝A/B を 2 回行い採否は未決）。試験（Local）：admbulk1 31/31（Chromium の PC・スマホ幅・WebKit iPhone）、既存の admready1 10/10・friend1_admin 11/11、admhub1 17/21・pub4630 13/14（落ちた分は元の本番ページでも同じ）、imgmodel1_admin 11/12（「画像モデル行が最後の行」の照合だけ。知人の画像の行を足したための想定どおりの差）。
- 管理者画面 `f2258e33`（MXALL・11-08。戻し `a2ea35ca`）：①`midicon1` の行の文言を全員向けに直した（登録されていない人物に 1 ターン 1 枚・お客さまは「知人の画像（CUSTIMG1）」が ON のときだけ FLUX.2-pro・予算と 1 日の上限。範囲の表示は Worker の答えのまま）。noBulk を外した。②`midicon1` の次に `mxreg1` の行「登録 NPC の最初の自動アイコン（W-MXREG）」。③「全機能を一括 ON（全体）」とアカウントごとの「まとめて ON」の対象を、決め打ちの文字から Worker が返す範囲の答えで作るようにした（今は READY の 6 つ＝`sfl1`・`ld1`・`rc1`・`oma1`・`midicon1`・`mxreg1`。対象外は `npres1`・`lc1`）。**画像の費用が出る機能（`midicon1`・`mxreg1`）も一括に入る**：全体の確認に「画像の費用が出る機能」の 1 行、アカウントごとの確認に「（画像の費用あり）」。お客さまの費用はアカウントごとの予算（試験用の知人は上限 $3）と 1 日の上限で抑えられる。「一括 OFF」は今までどおり無い。送る内容の形・CAS・監査は変えていない。④ICF80 の読むだけの行の文言。古い Worker（v46.35d）と組み合わせても壊れない（`mxreg1` の行は出ず、`midicon1` は CANARY として一括の対象外）。試験（Local・nonet2・node の中の本物の Worker）：adm_mxall_fx 14/14（PC Chromium）・14/14（iPhone WebKit）、既存の admbulk1 31/31（本番の画面と新しい画面の両方・v46.35d）。本番の画面での操作・iPhone の実機は未実行。GPT #127-QM（MIDICON は Owner だけ・画像の費用が出るので一括に入れない）とは食い違う。Owner の方針（11-08）に従って変えたもので、裁定の更新はこの資料では未確認。
- 管理者画面 `752c623a`（11-09。戻し `f2258e33`）：①`starticon1`（STARTICON・画像の費用あり）と `idsplit2`（IDSPLIT2・画像の費用なし）の行を足した（行の表示名はこの資料では未確認）。②`midicon1`・`mxreg1`・`starticon1`・`idsplit2` の 4 行に、「OFF の理由」「ON にする条件」を 1 行ずつ出す（GPT #127-RK ②）。③一括の確認に、画像の費用が出る機能の一覧と、新たに ON になるアカウントの数（うちお客さまの数）を出す。一括 ON の対象は今までどおり READY だけ。④**変更点**：アカウントごとの「まとめて ON」も、Owner のアカウントで CANARY の鍵（`lc1`・`npres1`）を含めなくなった（`f2258e33` までは Owner なら CANARY も入っていた）。試験（Local）：管理者画面の新しい試験 PC 17/0・iPhone 17/0。本番の画面での操作・iPhone の実機は未実行。
- 管理者画面 `e13dac1e`（11-09 ADMGRP1。戻し `752c623a`。Worker の変更なし）：機能スイッチの各行で、アカウントを「Owner の行／お客さま 全員（N 人＝active かつ利用権が owner・none 以外）の行（全員の値は最多の値。同数なら 未設定→OFF→ON）／例外 n 人（折りたたみ）／全員の値と同じ m 人（折りたたみ）／数えないアカウント（停止中・利用権なし。灰色）」にまとめた。「まとめて ON／OFF」は既存の `acct-flag-set` をお客さま 1 人ずつ expect 付きで順に送り、失敗したら止めて読み直す（全体の値 `feat-global-set` とは別。確認に人数・画像の費用が出る機能・CUSTIMG1 の状態を出す）。CANARY・HOLD にはボタンなし。試験 admgrp1_fx PC 19/0・iPhone 19/0（元の画面では 0/3）、adm_93i 17/0×2。
- Worker `v46.38-custlease1-fc`（11-09 CUSTLEASE1。ソース `bbfff492`・Cloudflare の版 `b27d388c`。戻し `v46.37-keys-fc`〔`2a74a00c`・版 `5fd0a423`〕。GPT #127-RO ① の案 (b) の Worker 側）：お客さまの画像（custimg かつ allow）で `ensure_first`（まだ絵が無いとき）と `regenerate` を、`mx_ensure` と同じ口座単位の札（`portrait_lease` の `(acct,'__mx__','__acct__')`・300 秒・条件付き UPSERT で排他）の中で「判定の読み直し → 生成 → 記帳」にした。札が取れなければ 200 `IN_FLIGHT`（端末は「作成中です」を出し、送り直さない）。直したもの：同時に送ると 1 日の上限（`CHR_CUSTOMER_IMG_DAILY`）と月予算（`limitUsd`）を同時本数ぶん超える F1。Owner・internal_qa・既に絵がある `ensure_first` は不変。kill env `CHR_CUSTLEASE_OFF=1`。Local：CUSTCAP1 232/0（v46.37 は 228/4）・札の試験 15/0・既存の Worker 試験 11 本は数が同じ。本番：出荷直後の Owner のホームで `/api` 15 本すべて 200。既知の制限：同じお客さまで STARTICON と MIDICON（または 2 端末の STARTICON）が重なると片方が `IN_FLIGHT` になり、STARTICON はそのキャラを自動で作り直さない（端末の再試行は次の 93-j）。
- 管理者画面の表示の追加（admin_b2 `5c9c9f28`・admhub1 `18594749`。**表示だけ**・送る内容は変えない・Worker の変更は不要。新しい呼び出しも書き込みも無い）：
  - admin_b2（2026-11-07・台帳 2246・2248。戻し `abd3084d`）：表の各行に「対象」（READY=全員／CANARY=Owner だけ／HOLD=停止中）・「Owner の実効状態」・「OFF の理由」・「解除の条件」を出す。鍵・まとめて ON・Worker は変えない。
  - admhub1（同日・台帳 2250。戻し `5c9c9f28`）：各機能に「customer の実効（招待した知人）」の列を足した。規則：範囲が READY で、緊急停止（`CHR_ACCT_FLAGS_OFF`）が掛かっておらず、全体の値が ON のときだけ customer は ON。CANARY は customer では OFF（理由「Owner だけの試験中」）、HOLD は Owner も customer も OFF。READY でも全体が未設定なら「端末の設定のまま」と出す。個別に OFF にした知人の人数も補足に出す。Worker が値を返していなければ推測せず「不明」。
  - 表の下に「読むだけの行」を 8 つ足した（スイッチもボタンも無い）：Memory Engine・CP1・EDLOG・ICF80・SEE（fix315・停止中）・MSW1（文章 AI の切り替え）・imgsafe（画像の安全の検査）・お客様（招待した知人）の画像。各行に状態・Owner と customer の実効・スイッチの場所・OFF／不明の理由・ON になるまでに残ること。「画像モデル」の行（§2.9 IMGMODEL1）は表の最後の行のまま。狭い画面は 1 列の積み重ねで、横スクロールは出ない。
  - **画面で「不明」になるもの（Worker が状態を返していない）**：Memory Engine の Owner 側（アカウントごとの行は acct-flag-list の対象外）、CP1・EDLOG・ICF80（端末側の部品）。SEE の「停止中のため OFF」は Owner 側の取り決めに基づく表示で、Worker の値ではない。**CP1・EDLOG・ICF80・SEE の説明文は資料からの推定で、正確な役割は未確認**（`index.html` の `renderHubInfo` の文面。正しい説明が分かれば差し替える）。
  - 試験（Local・偽のネットワーク）：admhub1_fx 21/0（chromium・webkit）、既存の imgmodel1_admin 12/0・admin_pub4630 14/0・friend1_admin 11/0（各 chromium・webkit）。本番の管理者画面の読み戻しは sha 一致（台帳 2248・2250）。
- 80 からの動きの違い（81-admg-a）：Owner 以外のアカウントでは 6 つとも OFF（行・端末キー・`?sfl=1` に関係なく）／Owner でも `lc1` は OFF（HOLD）／取得失敗・未ログイン・fix893 の無い配信先・`v292DfixADMF1Off` では、端末キーがあっても LC1・LD1・RC1・おまかせは OFF／範囲の外の古い ON の行は 0 として扱う。

#### 管理者画面の伏字（ADMG-PRIV・Worker `admView`=`admpriv1`・81-admg-a）
- 管理者画面（`e19b2569`）は要求に `masked:true` を付ける。Worker はそのときだけ、合言葉・許可メール・アカウント ID の全文を答えに入れず、伏字と参照用の印（ref）を返す。書き込みは ref で受けて Worker の中で元の値へ戻す（見つからない ref の書き込みも監査に `invalid`）。残高・tg-test の答えは、外部サービスから来る名前・ラベルを伏字にし、エラー本文・アカウント名・キー一覧を落とす（数値と既知の語だけ残す）。
- 全文の表示は 1 件ずつの `reveal` だけ（監査に `adm-reveal`・値は記録しない・回数の目安の上限あり）。「すべて表示」・全文表示へ戻す kill は作っていない。管理者トークンは画面に描かない。
- `masked` の無い要求（80 の管理者画面）は従来どおりの答え（戻しのため）。新しい管理者画面を古い Worker で開くと、何も読み込まず、接続設定以外の操作もできない。
- **限界**：伏字は誤表示を防ぐ仕組みで、権限の分離ではない（同じ管理者トークンを持つ相手は止められない）。GPT #127-PC：誤表示防止として限定 GO。AI に管理者の権限を自由に任せることは保留。読むだけの別の権限は後続の設計候補。

#### FRIEND1 / LIMIT1 — 招待した知人を遊べるようにする（Worker `v46.34b-ready1-proarg-fc`〔`v46.33b-limit1-fc` で出荷〕＋ 管理者画面 `e5198d0a`〔`18594749` で出荷〕）
- 状態：本番稼働（2026-11-07。READY1 により、招待した知人は、アカウントごとの行があれば `sfl1`・`ld1`・`rc1`・`oma1` を使える。台帳 2250・GPT #127-QY ①⑦）。ルートの `acctEntitle`=`fr1`（`CHR_ACCT_ADMIN_OFF=1` のとき 0＝管理者画面のボタンが消える）。画面（Pages）の部品は無い。Owner の方針（台帳 2249）は「最初の完成目標はプライベート版＝Owner と招待した知人が同じ機能で遊べる」。一般公開・有料化は別のフェーズ。
- FRIEND1（`v46.32-friend1-fc` 相当）：管理者の新しい操作 `acct-entitle-set`（`acct-budget-set` と同じ入口 `POST /admin`・同じ `x-admin-token`・kill は同じ `CHR_ACCT_ADMIN_OFF=1`）。entitlement を `none` ⇄ `beta`（status は active／suspended）にだけ変える。書き込みは `expect` つきの条件付き UPDATE（対象の行だけ）で、読み直して答える。拒否：値が `owner`／`paid` → 403 `ENTITLEMENT_VALUE_REFUSED`、対象が Owner → 403 `OWNER_FIXED`、paid などほかの値 → 403 `ENTITLEMENT_FIXED`、`expect` 不一致 → 409 `STALE`、KV の台帳 `acct:<id>` が無い・無効 → 409 `ACCOUNT_LEDGER_MISSING`（台帳は作らない）。監査は `admin_audit`（attempt → applied／refused／stale など）。答えにメールは出さず、伏字モードでは `idShort` だけ。画像・公開モード・`account_role`・機能スイッチ・予算の台帳は触らない。
- LIMIT1（`v46.33b`・GPT #127-QY ①）：招待（beta／active）は、そのアカウントの台帳に月の上限 `limitUsd > 0` があるときだけ。無い（0・未設定＝無制限）ときは 409 `ACCOUNT_LIMIT_UNSET`（監査に `refused 'ledger unlimited'`・何も書かない）。先に管理者画面の予算で上限を入れてから招待する。止める（`none`）はいつでもできる。新しくログインしたアカウントの台帳の既定は $1（試験での値。本番の設定は未確認）。
- 招待された知人にできること：文章と保存。画像は一般公開が OFF のあいだ 403 `PUBLIC_MODE_OFF`（変わらない）。**ただし Worker `v46.35b` 以降で CUSTIMG1 の 2 つのスイッチが ON のときは、beta（active）の知人も FLUX.2-pro だけでキャラの絵を作れる**（§2.9 CUSTIMG1。11-08 から ON）。`/auth/me` の `memoryEngine` は false。
- 管理者画面：「Googleログインのアカウント（月の利用上限）」の表の none／beta の行に「遊べるようにする（招待）」「止める」。Owner と paid の行にはボタンが無い。ボタンはルートの `acctEntitle==='fr1'` のときだけ出る。押す前に画面の中で確認を 1 回出す（文章と保存が使える・画像は OFF のまま・月の上限・知人向け）。上限なしで断られたときの文を `18594749` で足した。
- 試験（Local・偽の外部・送信なし）：limit1_fx 9/0（上限 0 で断る・断られた知人は遊べない・上限 $1 を入れると招待できる・止めるはいつでも・無制限に戻すと再招待を断る・既定 $1 は従来どおり）、friend1_fx 19/1・imgmodel1_fx 31/1（落ちた各 1 件は `workerBuild` の名前の照合だけ）、pub4630 37/0、管理者画面 friend1_admin 11/0（chromium・webkit）。
- 未確認・残り：**招待の操作そのものを本番で実行した記録は、この資料には無い**（11-08 に知人の試験用アカウントで CUSTIMG1 の絵ができたので、そのアカウントは beta・active とみられる。§2.9 CUSTIMG1）。本物の Google ログインと iPhone Safari での知人のアカウント分離の確認は未実施（台帳 2250）。本番の `account` は owner／active 1・beta／suspended 1 の 2 行だけ（件数のみの照会）。
- 戻す：Worker `e878ea50`。管理者画面 `5c9c9f28`。新しい D1 の表は無い。

#### fix328 — Google ログイン（GIS）
- 状態：本番稼働 `i167`。Google Identity Services を読み込んで ID トークンを得る（pages.dev では、その後の認証は fix893 の cookie 方式）。

#### fix886 / fix890 — 匿名のお試し（public anon）
- 状態：本番稼働 `i347` `i348`。Worker が匿名の経路を使えると名乗るときだけ動く。Owner の方針は「匿名お試しは無しでよい」。

#### bav2-beta — 招待者（beta）を最初から Asset v2 で始める
- 状態：本番稼働 `i9` `h6`。`/auth/me` の `features.assetV2Beta` が true の端末で Asset v2 の端末フラグを ON にする（自分で ON にした分だけ戻す）。

### 2.9 アイコン・画像

#### av2-data / av2-portrait / av2-migrate-ui / LD1 / fg3 — Asset v2（新しいアイコンの仕組み）
- av2-data（`i23` `h20`。89-b では `i25` `h20`・sha `bc08ce7b`・?cb=`20261108-bundle93-i`（93-i で STARTICON の外見の由来：`setProfile` は `origin` に `starticon_auto` だけを受け付け〔ほかの値は `BAD_ORIGIN`〕、そのとき profile に `origin` と `basis`〔`desc`＝説明文の句そのまま／`ai`＝文章 AI の案〕を入れる。自動の保存は、CAS の中でサーバーにもう外見があれば書かない〔`APPEARANCE_EXISTS`〕。`suggestAppearance` の `current.origin` で読める。ボタンからの保存は origin なし＝自動の外見を置き換える。90-b〜93-h は `a0c5774a`・?cb=`20261103-bundle90-b`。90-b で、422 `APPEARANCE_UNSAFE_POLICY` の答えの `imgsafeWhy` のうち `real_person`・`explicit` だけを結果に渡す）。89-b〜90-a は `d208ae87`、86〜87 は `c1931013`。89-b で 422 `APPEARANCE_UNSAFE_POLICY` も「絵を作っていない（呼び出し 0）」として返す）：データ層。キャラごとの ID と絵の結び付け（bindings）をサーバーが正として持つ。保存の 4 か所の境界（fix697・fix743・fix705）で押し引きする。
- av2-portrait（`i340`。86 では `i345`）：表示層。`portrait.list` / `asset.get`、asset_id ごとの IndexedDB キャッシュ、保留・拒否・競合の理由表示、明示の削除 UI。sha `0cc62adf`・?cb=`20261103-bundle93-a`（93-a で、MIDICON の画像専用の控え `ch_mx` の絵を出す表示を足した：未登録の話者で呼び名か言い換えが控えと同じなら控えの絵＋小さな「自動」・控えが登録キャラに引き継がれてそのキャラに絵があればそちらを優先・登録キャラにまだ絵が無いあいだは控えの絵を出したまま。データは MIDICON が渡すだけで、`img` の `src` を書くのはこの部品の `applyImg`／`sweep` だけ。90-b〜92-a は `12c563bf`・?cb=`20261103-bundle90-b`。90-b で `APPEARANCE_UNSAFE_POLICY` の文を `imgsafeWhy` で分ける：`real_person`・`explicit`・理由なしは中立の文。89-b〜90-a は `00a31caf`。89-b で更新：`APPEARANCE_UNSAFE_POLICY` の理由の文と外見の欄の道具。86〜87 は `15a51215`。86 で更新：Worker が 422 `APPEARANCE_UNSAFE_MINOR` を返したときの理由の文と、分類の 2 語（種類だけ）の添え方。外見の欄の道具は開いたままにする）。前は sha `fdd77f2a`・?cb=`20261101-bundle83-flow-c`。82b で FLW1（キャラ一覧の「最初の絵を作る」「この外見で確定」「削除」の確認をカードの中に出す。文面と OK のあとの処理は同じ。DOM が使えないときだけ従来の confirm。kill `v292DfixFLW1Off`）、83 で FLW2 の呼び出し口（外見の確定のあとの読み直しの前に FLW2 を呼ぶ）。
- av2-migrate-ui（`i345`）：Owner 向けの移行 UI（準備 → 今の絵を候補として確保 → 採用 → …）。入口は UI1 で「⚙ 設定 → ⚙ システム → 詳細設定」へ。サーバー側の許可リストが最終の権限。
- LD1（`i341`）：今の画風（preset）で採用された絵を出す（表示だけ）。sha `a7a98a65`・?cb=`20261101-bundle81-admg-a`（81-admg-a で更新）。kill `v292DfixD1Off`（常に先）。81-admg-a から ON は ADMF1 の `gate('ld1', 端末の opt-in v292DfixLD1On)`（公開範囲 CANARY＝Owner のアカウントだけ。Owner で行が無いときは端末の opt-in）。答えが後から届いて ON になったら `whenOn` で 1 回だけ起動。記録時点で Owner のアカウントが ON かは未確認。
- LC1（`i343` 外見の案・`i344` 作業欄）：「👥 キャラ」の最上段の作業欄（1 人ずつ「絵を作る／絵を変える」・「まとめて絵を作る」）。作業欄 `v292DfixLC1-workbench.js` の sha `aea27e80`・?cb=`20261103-bundle90-b`（90-b で `APPEARANCE_UNSAFE_POLICY` の文を `imgsafeWhy` で分ける。90-a は `75c596c0`（下書きの知らせ）。89-b は `8def3834`（`APPEARANCE_UNSAFE_POLICY` の理由の文・やり直しなし・「外見を直す」）、86〜87 は `db457b4c`）・外見の案 `v292DfixLC1-appearance-proposal.js` の sha `5556f614`・?cb=`20261102-bundle90-a`（版 `LC1prop-r4f-90a`。89-b は `fb4e689f`（88-e）、87 は `4dbacfc2`、86 は `48be7f2a`、84 以前は `a012e615`）（86 の番号で外見の案 `i348`・作業欄 `i349`）。kill `v292DfixLC1Off`（常に先）。81-admg-a から ON は ADMF1 の `gate('lc1', 端末の opt-in v292DfixLC1On)`。**公開範囲は 86 から CANARY＝Owner のアカウントだけ ON にできる**（Worker `v46.27` で HOLD から変更・GPT #127-PQ）。Owner の実機 QA（5 人）は PASS（GPT #127-PU）。一般公開は HOLD。外見の案の作り方：①86 の LC1OX：水着・細身・華奢・太もも・胸元のリボン・普段着や衣装などの普通の言葉を下書きに残す。②87 の LC1OX-2：年少者かどうかは描かれる本人の文（外見・設定）だけで決め、世界観の文は見ない。AI が足す句の年少者向けの検査は体の強調だけ（腰までの髪・腰の剣・脚の長い などは通す）。③89-b の LC1OX-3（88-e）：種族・役割の語は「顔の特徴」の枠を埋めない／体格の枠（任意。AI を呼ぶ理由にはしない）／服は重ね着・小物なら 2 句・特徴も 2 句まで／種族・役割らしい見た目の案（説明と食い違う印は足さない。「人間と見分けがつかない」などと書かれた人物には、AI が足す牙・赤い瞳・尖った耳・角・尻尾・獣の耳・翼を落とす）／表に無い種族の見た目を 1 句まで／1 文だけの短い設定（末尾の「。」を除く）は名詞句と同じに残す（性的な語を含むときを除く）／算用数字の「30代」も年代／「大人の女性・大人の男性」を年代の語に／性別と食い違う AI の年代の語は落とす（男装・女装・中性的・ボーイッシュなどの人物は除く）／色の例を指示文から外した（赤い瞳の偏り）。AI が足す誘う響きの語（むっちり・艶めかし・色っぽ・妖艶 など）は年少者のときだけ落とし、成人の普通の色気は残す。ユーザーが自分で書いた言葉と確定した外見は変えない。④90-a（表示だけ）：外見の案が `droppedVisual`（見た目らしいのに下書きに入れなかった句。性的な語で外した句を含む）を返し、空でなければ作業欄に「元の設定の一部を画像用の外見に反映していません。内容を確認してください。」と出す（語は出さない・確認の手順なし）。性格・経歴だけを外したときは今までどおり「性格・経歴などの説明は含めていません。」。同じ句から外した性格の断片も dropped に数える。
- fg3（`i346`）：Asset v2 の物語の画風を 3 択（デフォルト／クール／ダーク）にする。正本は canonical の `body.cfg.artPreset`。
- ICONUX2（`v292DfixICONUX2-twotap.js`・86 の番号で `i350`・sha `673bf47a`・?cb=`20261102-bundle90-a`（90-a で近道の下書きにも `droppedVisual` を渡すだけ。86〜89-b は `58254d0c`・?cb=`20261102-bundle86-lc1ox-d`）。前は 83 の番号で `i349`・sha `984a534d`・?cb=`20261101-bundle82-iconux-b`。版 `ICONUX2-r3d-lc1ox`）：キャラ一覧のカードで、絵を 2 タップで作る（「🎨 絵を作る」→ 下書き →「この外見で作る」／「🎨 絵を変える」→ 候補を選ぶ。confirm なし）。働くのは LC1 が ON のときだけ（毎回 `__v292DfixLC1.on()` を読む）。**LC1 が CANARY（86 から）なので、動くのは Owner のアカウントで `lc1` が ON のときだけ**。外見の案の近道は年代の語だけを足し、LC1 と同じ語の表の検査に当たれば近道を使わず LC1 の案に任せる。結果が分からない失敗の間は主ボタンを止める。kill `v292DfixICONUXOff`。
- SETAV1（`v292DfixSETAV1-settings-avatar.js`・83 の番号で `i350`・sha `d2146d0e`・?cb=`20261101-bundle82-iconux-b`）：⚙ 設定の「キャラ」で、Asset v2（schema2）の物語の主人公・NPC の欄に `<img>` が無いときだけ `<img alt="名前">` を 1 つ入れる。絵を入れるのは従来どおり av2-portrait の applyImg と LD1。表示だけ（通信・保存・localStorage への書き込み 0）。schema2 でない物語では何もしない。kill `v292DfixSETAV1Off`。
- FLW2（`v292DfixFLW2-reload-notice.js`・86 の番号で `i360`・sha `82323dfa`・?cb=`20261102-bundle86-lc1ox-d`。前は 83 の番号で `i359`・sha `0bb9f347`。版 `FLW2-r2-is3`）：外見の欄から確定して読み直す直前に、画面全体へ「外見を保存しました。表示をそろえるため読み直しています」を出す。結果は sessionStorage の 1 key（`v292DfixFLW2`）に状態のコードだけを持ち越し（物語 ID・キャラ ID・結果の種類・理由コード・時刻。本文・外見の文・名前は入れない）、同じ物語・120 秒以内・読み直しのときだけ 1 回読んで消し、カードに結果を出す。読み直しそのものは残す。86 から、理由が `APPEARANCE_UNSAFE_MINOR` のときだけ分類の 2 語（種類のコードだけ。決まった語以外は捨てる）も持ち越し、読み直しのあとの文に「当たった語の種類」を添える。kill `v292DfixFLW2Off`。
- ICF（`v292DfixICF-icon-fail-log.js`・83 の番号で `i357`・sha `e41d22e6`・?cb=`20261103-bundle93-a`（93-a で、MIDICON の `portrait.mx_ensure` の記録を足した：失敗は `p:'mx'`・`o:'mx_ensure'`・`x`=`mxk_<class>`・コードと HTTP と時間だけ／成功は回数だけ／端末だけで決まった見送りは回数 `mxNote`。ハンドル・外見・id は残さない。版は `ICF-a1-mx3c`。83〜92-a は `c393f1a8`・?cb=`20261101-bundle83-flow-c`）：アイコンの失敗の入口・段階・理由コード・HTTP status などを、この端末の localStorage `v292DfixICF_log` にだけ記録する（失敗は最大 100 件・全体 20,000 文字。成功は回数と時間だけ）。文章・名前・物語 ID・画像・URL・鍵は入れない・どこへも送らない。要求・応答・画像・保存は変えない（見るだけ）。読む口 `window.__chrIconFail`。kill `v292DfixICFOff`。
- ICF80（`v292DfixICF80-record.js`・`index.html` の ICF の直後・sha `592a85ca`・?cb=`20261103-bundle92-a`。92-a・既定 OFF。ON は `v292DfixICF80On='1'`、kill `v292DfixICF80Off='1'`）：アイコンを作らなかった理由（通信しないで見送ったものを含む）を、既存の ICF の記録 `v292DfixICF_log` へ 1 行足す口 `window.__icfRecord(category, meta)`。分類は `IMGSAFE_REFUSED`・`CAP_REACHED`・`PROVIDER_FAILED`・`PUBLIC_MODE_OFF`・`NOT_YET_ELIGIBLE`＋`OTHER`（ほかの文字列は理由コードとして `classify()` で分類）。`meta` は決まった形だけ受け取る（理由コード・キャラ id の短いハッシュ・HTTP 番号・上限の名前・requestId・時間・呼んだ部品）。文章・名前・物語 ID・画像・URL・鍵は残さない。通信しない・DOM に触らない・誰も包まない。読む口 `__icfRecord.summary()`（ICF の行も含めて分類ごとに数える）・`.status()`・`.enabled()`。呼ぶ側は MIDICON（93-a から本番。端末だけで決まった見送りを `NOT_YET_ELIGIBLE`／`CAP_REACHED` で記録する。Worker が答えた `mx_ensure` の結果は ICF 自身のラッパが記録する。MIDICON は ICF80 が無くても動く）。本番の Owner の PC で試験の 1 行を書けることを確かめた（`NOT_YET_ELIGIBLE`・台帳 2236。GPT #127-QO の「mx3-c の前に ICF80 の本番の記録を確かめる」）。
- 冒頭コメントはどれも「offline candidate, NOT DEPLOYED」のままだが、本番で読み込まれている。
- Worker：画像生成の失敗は理由を問わず 502 GENERATION_FAILED になり、画面には「絵を作れませんでした」。Worker の失敗分類（R74-FC：失敗の段階を Workers Logs に 1 行出すだけ・応答の中身は変えない）は `v46.10-admf2-fc` から入っている（差分で確認）。端末側の記録は 75-icf-a が 80 から除外されたあと、83 で ICF として本番に入った（上の ICF）。
- **ICONFIX1（Worker だけ・2026-11-01・`v46.11-iconfix1` → `v46.12-iconfix1b`、今の `v46.13-admg-fc` にもそのまま入っている）**：2026-10-22 ごろから Together（FLUX.2-dev）が要求を 400 で断っていた件の修正（GPT #127-OY／#127-PA。#127-PC で CLOSED）。
  - 要求の形：`response_format` を `'b64_json'` → `'base64'`、`prompt_upsampling` は送らない（r1 で false を残したら 400・param `prompt_upsampling` が返ったため 1b で削除）。model・prompt・width/height 512・steps・n 1・seed は不変。
  - 4xx の診断：4xx のときだけ応答の error の `code`・`type`・`param` を、許可した語の一覧（それ以外は `OTHER`。読めなければ null）でだけ Workers Logs の失敗行に足す（`upstream_error`）。message・未加工の本文・prompt・キャラの情報・キーは記録しない。本文が長すぎるときは解析しない。502 の応答と保存の挙動は変えない。GPT #127-PA で常設 GO。
  - 切り分け用の停止：env `CHR_ICONFIX1_OFF='1'` で旧の要求の形（`b64_json`＋`prompt_upsampling`）に戻り、診断の本文も読まない（復旧用ではない）。
  - 本番：ICONFIX1b で候補 1 枚の成功を受理（限定 `PRODUCTION_PASS`・#127-PA）。画風の品質・薄い外見の 422・タップ数などは別課題。
  - 共通ルール（#127-PA）：モデル固有の公式仕様と実測のエラーを、推測上の既定値より優先する。受け付けない引数は値に関係なく送らない。

#### IMGSAFE — 画像の安全確認（Worker ＋ 画面側の部品。85-imgsafe・86-lc1ox-d・v46.28 ＋ 89-r1920-b・90-b ＋ v46.29）
- 状態：本番稼働（Worker `v46.30-public-fc`（ソース `761b4e67`）に含む。判定の部分は v46.29-rphold-fc（ソース `d0c25092`）から変わっていない。ルートの `imgSafe`=`imgsafex:owner`。Pages 89-r1920-b の `v292DfixIMGSAFE-core.js` は 86 の番号で `i16`・sha `fb23cf9e`・?cb=`20261102-bundle89-r1920-b`（86〜87 は `e0df08e6`）。`home.html` は読まない）。台帳 2190〜2200・GPT #127-PK〜#127-PW。**効くのは Owner のアカウントだけ**（env `CHR_IMGSAFE_ENFORCE=owner`。v46.30 からは、公開 OFF のあいだ画像を作れる internal_qa にも Owner と同じ分類をかける）。全員に効かせる（`all`）のは HOLD。台帳 2225・2229・GPT #127-QE・#127-QK。
- 役割：描かれる人物が未成年で、かつ性的な描写があるときだけ、絵を作らない（422 `APPEARANCE_UNSAFE_MINOR`・画像の provider は呼ばない・費用なし）。判定は 2 段：①ER1x の JSON に「描く姿の年齢」と「性的か」の分類を足し、未成年かつ性的が none 以外なら止める（案X。語の表を足し続ける案Yは採らない）。②AI が none と答えても止める小さな床だけ持つ（描かれる未成年 × 裸・性行為・下着を着ている姿。成人・過去の経歴・持ち物・背景の言及は数えない。広い禁止語は足さない）。分類が欠けた・不正なときは provider を呼ばず止める（再試行なし・10 分だけ覚える）。旧い絵の作り方（`/image`）も同じ分類を 1 回通す。キャッシュ鍵 `xh4`（規則を変えたら古い結果を使わない・アカウントと物語ごとに分ける。85〜86 は `xf1`）。床の版 `xg2`：v46.28 で、床の「性行為」の語に「性的な場面・ポーズ・行為・描写・姿・奉仕」「性的に描く・強調・見せる」を足した（40 件の dry run の見逃し R02「小学生の女の子、性的な場面」で AI が child/none と答えた件。性的少数者・性的指向などは数えない。描かれる未成年が要る）。
- R19/R20（v46.28 ＋ 89-b の画面）：①分類 `sexual=explicit`（裸・性行為。性的暴力・同意のない性的な行為も explicit）は年齢を問わず止める。②ER1x の JSON に `real_person`（yes/no）を足し、`yes` かつ性的な描写が none 以外なら止める。yes は、よく知られた実在の公人か、入力が実在の人物だと明言したときだけ（氏名だけでは yes にしない・実在か分からないときは no）。③性的な描写があるのに `real_person` が無いときだけ判定できないとして止める（sexual=none の普通の肖像は影響なし）。どれも 422 `APPEARANCE_UNSAFE_POLICY`（画像の provider は呼ばない・費用なし）。画面は 89-b から理由の文と「外見を設定」「外見を直す」の入口を出す（av2-data・av2-portrait・LC1 作業欄・fix492）。止めないもの：成人の露骨でない色気・普通の水着や衣装・氏名だけの架空の人物・性的でない流血やホラー。追加の入力は約 +146 トークン（呼び出しは増えない）。
- 実在の人物の保留（v46.29・GPT #127-QC／#127-QE）：`real_person=yes` なら `sexual` に関係なく 422 `APPEARANCE_UNSAFE_POLICY`（答えに `imgsafeWhy`=`real_person`）。普通の肖像も契約を確かめるまで保留する。env `CHR_IMGSAFE_REALPERSON_HOLD` が未設定なら保留、`"0"` で v46.28 の動き（実在の人物 × 性的だけ）。キャッシュ鍵は `xh5`（v46.28 は `xh4`）。画面は 90-b から `imgsafeWhy` で文を分ける（av2-data・av2-portrait・LC1 作業欄・fix492。`real_person` は GPT #127-QE の推奨文、理由なしは中立の文）。本物の AI の dry run 6 件（rules `xh5`・provider 0）：実在の首相・実在の選手の普通の肖像は止まり、フルネームの会社員・架空と明示したフルネーム × 色気・一般的な剣士・色っぽい 40 代の女主人は通った（台帳 2225）。
- Owner 専用の dry run：`POST /imgsafe-dryrun`（Owner かつ active・1 日 30 回・provider 0・保存 0・ログにはラベルと件数だけ）。
- THIN1（86 の Worker）：画像の安全確認が効いている経路では、見た目の種類が 1 つ、または描く対象がはっきりしていれば足りる（従来は 2 種類必要）。既定の外見を作って保存することはしない。2 種類の語の表そのものは変えていない。
- 画面側（`v292DfixIMGSAFE-core.js`）：Worker と同じバイトの判定部分を持ち、「👁 見る」（fix315）が送る文の確認と、理由に添える分類の文言だけに使う。通信・保存はしない。観測口 `window.__chrImgSafe`。端末の kill：`v292DfixIMGSAFEOff='1'`（画面側の確認だけ止める。Worker 側は env）。
- 同時に変わった部品（86）：fix315（SEE）は既定 OFF（`v292Dfix315On='1'` で許可したときだけボタンが出る。許可しても送る前に core で確かめる。**91-b から、許可があっても作らない**＝`seeOn()` が常に false。場面の絵は Pollinations へ直接つなぐ経路しか無いため）、fix492（旧い絵の作り方が 422 `APPEARANCE_UNSAFE_MINOR` を返したときの理由のトースト）、av2-data（同じ理由を、結果不明ではなく「絵を作っていない（呼び出し 0）」として返す）、av2-portrait、FLW2（上の各項）。
- 止める・戻す：env `CHR_IMGSAFE_OFF=1`（全部止める。dry run も 403）。`CHR_IMGSAFE_ENFORCE` を外すと画像の経路は msw1c と同じ（dry run だけ）。`CHR_IMGSAFE_REALPERSON_HOLD="0"` で実在の人物の保留だけ外す。Worker の戻し：`d0c25092`（v46.29。公開のスイッチなし）→ `d7b768bd`（v46.28。実在の人物の保留なし）→ `033c4e7b`（`v46.27`。R19/R20 と床 xg2 なし）、さらに前は `42ebab48`（`v46.24`）／`033fa29c`（msw1c）。Pages の戻し：90-b の文は 90-a の同名 7 本、89-b の部品は 87 の同名 9 本（core も 87 の版 `e0df08e6`）。
- 未確認：iPhone Safari。未知の 40 件の dry run は v46.28 の版で正常 20/20・止めるべき 20/20（台帳 2221）で、GPT #127-QC が限定的な QA として PASS で受理した。全員に効かせる条件（GPT #127-PQ・#127-QE）のうち、非 Owner の経路の実確認・PC と iPhone の同期・Together 経由の FLUX.2 [dev] の商用利用の権限が残る（確かめられなければ新しい画像の生成のモデルの切り替えか一時停止を判断する。既存の画像は消さない）。

#### PUBMODE — 一般公開のスイッチ・段階 1（Worker `v46.30-public-fc` ＋ 管理者画面 `53e2d067`）
- 状態：本番稼働（Worker ソース `761b4e67`・Cloudflare の版 `60059e2f`・ルートの `publicMode`=`pm1`。管理者画面 `53e2d067`。画面（Pages）の部品は無い）。台帳 2226〜2229・GPT #127-QG／#127-QI／#127-QK。
- 状態の正本：D1 の `chr_public_mode`（1 行・k='public'）。画像の要求ごとにキャッシュせずに読む。表が無い・行が無い・読めない・値が壊れている＝OFF。段階 1 はコードの定数 `CHR_PUB_ON_OPERABLE=false` で、D1 に 1 があっても OFF として動く。`public-set` の ON は準備の確かめ直しで必ず断る（403 `PUBLIC_NOT_READY`・監査に refused）。OFF の書き込みは常にできる（`expect` つき・読み直し・`admin_audit`）。env `CHR_PUBLIC_FORCE_OFF=1` は D1 より優先。
- 公開 OFF のあいだ画像を作れる主体：Owner（entitlement）・D1 `account_role` で internal_qa かつ testAccount=1 のアカウント・env `CHR_IMG_INTERNAL_QA` のアカウント ID（認証したアカウントの ID だけ。`code:`・`ACCESS_CODE`・`allow:` は書いても無視）。それ以外は、Asset v2 の `portrait.ensure_first` / `portrait.regenerate` と旧 `/image`（Together・Pollinations・無料 GET・Fireworks の予備・`debug420`）のすべてで 403 `PUBLIC_MODE_OFF`（imgsafe の AI・費用の関門・provider より前。送信 0）。**例外（Worker `v46.35b` 以降）**：CUSTIMG1 の env と D1 の値が両方 ON のときだけ、招待した知人（beta・active）の Asset v2 の要求は FLUX.2-pro で通す（§2.9 CUSTIMG1。paid・旧 `/image` は従来どおり閉じたまま）。Asset v2 の既存の絵は今までどおり EXISTS を返す。ログイン・閲覧・保存・文章は変わらない。
- 判定は `chrPubEffective(publicMode, who, env, route)` の一か所。provider には決まった env（`__chrPub`）だけを渡し、決まっていない・拒否のときは fetch しない。返り値には上限・登録・課金・規約・契約の空き枠（`later`）がある。ON（段階 5 以降）では商用モデルだけを使い、dev へ自動で戻さない。旧 `/image` は ON では Owner も含めて 409 `PUBLIC_LEGACY_IMAGE_CLOSED`（Local の QA 版でだけ試した）。
- 役割（GPT #127-QI）：role（owner／internal_qa／customer。既定 customer）・status・contract（まだ持たない）・testAccount（0/1）を分けて持つ。role と testAccount は D1 `account_role` に、管理者の `acct-role-set`（`x-admin-token`・CAS・監査つき・owner の行は変えられない）だけで書く。利用者の経路からは書けない。entitlement は変えない（beta との互換）。beta・paid・`allow:`・`code:` はそれだけでは internal_qa にならない。
- D1 の表 `account_role`・`chr_public_mode` は管理者の最初の書き込みのときに作る（ALTER なし）。古い Worker はこの表を無視する。
- 管理者画面 `53e2d067`：「一般公開」のカード（段階 1 では ON のボタンは押せない。D1 が ON のときだけ OFF を押せる。確認は画面の中で 1 回）・今の状態と最後の変更・商用モデルが無いことを示す理由の行・準備の一覧（6 つのまとまり・表示だけ）・アカウントごとの役割のボタン。古い Worker で開くとカードは「使えない」と出る。
- 試験（Local・偽のネットワーク）：公開モード 37/0、管理者画面 13/0（chromium・webkit）、MSW1 35/0・31/0・26/0（×2）。本番では、出荷後に Owner の 2 タップで絵ができることを確かめた（台帳 2229）。
- 戻す・止める：env `CHR_PUBLIC_FORCE_OFF=1`（緊急 OFF）。Worker の戻し `d0c25092`（v46.29）か `d7b768bd`（v46.28）、管理者画面の戻し `b4c007d6`。
- 未確認・残り：公開 ON の拒否・緊急 OFF・戻しの本番での試験（管理者のトークンが要る。Local では合格）。Pages の古いコード（fix315・features.js・index・home・fix487・fix499・fix338・fix420・fix471・fix478・fix476・fix481）が Pollinations を直接呼ぶ経路は Worker では止められないため、91-b の NDI1（下）でブラウザ側を止めた。OpenRouter の許可の一覧に画像を出すモデルが無いかは未監査（文章の経路で画像の出力を断る強化は別のレーンで GO・GPT #127-QO）。旧い主体（`code:master`・`allow:`）で Owner が `/image` を使うと、v46.30 では止まる（アカウントのセッションは影響なし）。FLUX.2-pro の要求の形と価格は本物の API で未確認。画面は新しい 403 に専用の文を出さず、一般の画像のエラーを出す。

#### NDI1 — ブラウザから画像サービスへ直接つながない（91-b）
- 状態：本番稼働 `i1` `h1`（91-b の番号。`index.html`・`home.html` の最初のスクリプト＝ほかのラッパより内側。fix247 が gen.pollinations.ai を Worker の `/image` へ書き換えたあとに通る）・sha `54dadff9`・?cb=`20261103-bundle91-b`。GPT #127-QK・#127-QO・台帳 2234。
- 役割：画像を作る通信を Worker（`/image`・Asset v2 の `/save`）だけにする。宛先のホストが pollinations.ai・together.xyz・together.ai・fireworks.ai のとき：fetch は送らずに 422 `DIRECT_IMAGE_BLOCKED`（`retry:false`）を返す。XMLHttpRequest・sendBeacon も送らない。`<img>`／`<source>` の src・srcset、setAttribute、innerHTML／outerHTML／insertAdjacentHTML、style の url() は、通信しない仮の絵（頭文字の丸。av2-portrait の placeholderImage と同じ形）に置き換え、元の URL を `data-av-legacy` に残す（fix209 の運び方。fix197 が Worker 経由で作り直せる）。Worker の URL・data:／blob: の画像・Asset v2 の採用済みの絵は触らない。新しい画像の基盤は作らない。
- 止める：kill は無い（止める方向の安全装置）。戻すときは 90-b の index・home（NDI1 を読まない）へ戻す。観測口 `window.__v292DfixNDI1.status()`。
- 本番の確認（QA 物語・Owner の PC の Chrome、台帳 2234）：24 ターンを読み込み、画像 83 枚のうち画像サービスの URL は 0。置き換えたのは会話ログのカードに焼き込まれた古い URL の 83 か所。読み込まれた絵は Asset v2 の 13 枚。古い直接 URL の絵が頭文字になるのは受け入れる（自動で作り直さない・GPT #127-QO）。
- 未確認・残り：iPhone の実機・Owner の実プレイの物語での見た目。CSP（GPT #127-QO：91-b が落ち着いてから監査だけ）。

#### MIDICON — 途中から登場したキャラの自動アイコン（93-a・93-b・93-c・93-h・93-i。93-g までは Owner だけの CANARY、Worker `v46.36` から READY）
- 状態：本番稼働（`index.html` の SETAV1 の直後。`home.html` は読まない）・sha `fbdcd485`・?cb=`20261108-bundle93-i`。履歴：93-a（11-03）`97c98380` → 93-b（11-07）`1b7bbfa3` → 93-c（11-07）`0a145cc7` → 93-h（11-08）`d8c971bc`（OLDMX1。`status().ver`=`mx3e-20261103+oldmx1`）→ 93-i（11-09）`fbdcd485`（W-MXREG の端末側。`status().ver`=`mx3e-20261103+oldmx1+wmxreg1`。下の W-MXREG）。Worker はルートの `midicon`=`mx3c`（`v46.30-public-mx3c-fc` 以降）。GPT #127-QM・#127-QO・#127-QQ・#127-QS・#127-QW。台帳 2235・2237〜2242・2244・2250。
- 公開の範囲：ADMF1 の鍵 `midicon1`。**Worker `v46.36-wmxreg-fc`（11-08 17:0x）から READY**＝どのアカウントも、アカウントごとの行か全体の値で ON にできる（行も全体の値も無ければ OFF。止まっているアカウントは OFF）。管理者画面 `f2258e33` から一括 ON に入る。それまでは CANARY（Owner のアカウントだけ・「まとめて ON」に入らない）。**11-03 16:29 に Owner が管理者画面で ON にした**（台帳 2238。この D1 の行は v46.36 でもそのまま効く）。出荷の時点で `midicon1`=1 の行は Owner のアカウントだけ。お客さま（beta）で ON にすると、CUSTIMG1 の経路（FLUX.2-pro・アカウントの予算・1 日 20 枚・imgsafe）で動く（Local の試験で確認。本番では未実行）。止める 3 つ：管理者画面の OFF・env `CHR_MX_OFF=1`（Worker が 501 `MX_OFF`・ルートの `midicon`=0）・端末の `v292DfixMIDICONOff='1'`（表示も作成も止める）。端末の小さな記録は localStorage `v292DfixMIDICON_v1`（日付・アカウントの日ごとの数など。スイッチではない）。
- 役割：物語の途中から出てきた人物（名前の無い怪異も）に、自動で絵を付ける。候補の元は fix307 の NPC 名簿（§2.2）。画像専用の控え `ch_mx`（登録キャラの正本とは別・ID は Worker が決める）。絵を表示するのは av2-portrait だけ。控えの呼び名が正式な登録の呼び名になったら `portrait.mx_claim` で引き継ぐ。画面には何も出さない（絵ができるまでは頭文字のまま）。
- 通り道：2 タップと同じ Worker の入口（`/save` → `chrAv2Handle` → 予算 402 → 公開モード → 記帳 → 毎月・毎分の上限 → imgsafe・上限）。新しい provider の経路は 0。端末は fix697 の専用口 `assetV2Mx`（op は `portrait.mx_list`／`mx_ensure`／`mx_claim` の 3 つ）。1 ターンの要求は最大 2（読む 1・作る 1）。
- 候補の条件（端末で先に確かめる。最終判断は Worker）：
  - 「高」（従来）：fix307 の名簿で重要度「高」の人物。主人公・登録キャラ・別名・字形の揺れは除く。固有名は別々のターン 2 つ以上・最後が直近 3 ターン以内・見た目の語 1 つ以上。記述名（固有名なし）は別々のターン 3 つ以上・見た目の枠 2 つ以上・登録キャラ全員と比べて A 同一／B 独立／C 不明（C は作らない）・1 物語 2 人まで。
  - 「中」（**93-c**・GPT #127-QW。Owner だけ）：次の 3 つすべて。①一番新しいターンで話している（`<say>` かログの話者。別名解決あり）②見た目の語が 1 つ以上 ③同一性の判定を通して 2 ターン以上に登場。満たさないときの理由コードの 1 つが `MID_NOT_SPEAKING`。「低」は対象外。Worker の守りは緩めていない。
  - 新しく遊んだターンだけ（開き直し・取り込み・undo／redo・写しでは作らない。Worker も一番新しいターンに出ていなければ 422 `MX_NOT_YET`）。名前らしい文字列だけでは作らない（見た目の語が重なることが要る。`MX_FEW_FEATURES`）。
- 上限（Worker が数える。env `CHR_MX_CAP_*` で変えられる。既定）：1 ターン 1 枚・1 物語 1 日 2 枚・1 物語累計 6 枚・1 物語の記述名 2 人・1 アカウント 1 日 5 枚。試行の数：1 物語 1 日 4・1 アカウント 1 日 10・1 人あたり 1 回（`attPerExtra`=1＝provider が一時的に失敗しただけでも、その人は自動ではもう作らない）。予約（`write_quota`）を全部取れたときだけ進み、D1 が失敗したら止める側に倒す。GPT #127-QQ：上限は緩めない。
- 93-b（mx3-e・GPT #127-QS）：①`A_ALIAS` で飛ばすのは、別名の先が**登録済みのキャラ**のときだけ（以前は話す新しい人物「郵便屋のトマス→トマス」などが全員飛ばされていた。話者名だけの別名は候補の名前の 1 つとして扱う）。②`TURN_MISMATCH`（Worker のターン数が端末より少ない）は、15 秒以上あと・静かなときに、同じターンを 1 回だけやり直す。やり直す前にサーバーのターンを取り直して一致を確かめ、待つあいだにターンや物語が変わったとき・保存の競合（fix945 の `isStale()`）のときは作らない（`xtab-stale`）。409 を無条件に再送しない。
- 93-c（GPT #127-QW）：「中」の候補条件（上）。**翌日の再試行（5xx・429・タイムアウトのみ・最大 2 回）は未実装**（失敗した人はその日は作られない）。
- OLDMX1（93-h・Owner の希望「古い物語でも、続きを遊んでいるときは自動アイコンが働くように」）：候補は fix307 の名簿からしか出ないが、名簿の抽出（3 ターンごと・数秒〜十数秒）は、ターンが落ち着いて 3 秒後のこの判定より遅れて届くことが多い。古い物語の続きで、名簿に居なかった人が再登場したターンで「候補なし」と決まり、絵が付かなかった。→ 遊んだターンの判定が「候補なし」だったあと、そのターンがまだ最新のうちに名簿が変わったら、同じターンをもう 1 回だけ判定し直す（1 ターン 1 回・ターンが落ち着いてから 90 秒以内。規則・上限・Worker の確認は同じ。開いただけでは作らないのも同じ）。名簿は hash だけをメモリに持つ。kill `v292DfixMIDICONrosOff='1'`（この見直しだけ止める。全体は今までどおり `v292DfixMIDICONOff`）。試験（Local・93-h の統合の木）：oldlag・oldlagoff・old・oldnoros・oldreg・newctl × 2 ブラウザ＝84/0、MIDICON 14 モード PC 87/0・WebKit 87/0、2 タップ 30/0。**登録キャラになっている過去の NPC には、今も自動の絵が付かない**（Worker 側の W-MXREG は v46.36 で出したが、端末側は後の 93-i）。STARTICON（始めたときのアイコン自動作成）は入っていない。（93-i から、登録キャラは鍵 `mxreg1` が ON のとき W-MXREG で、始めたときのアイコンは鍵 `starticon1` が ON のとき STARTICON で扱う。下の 2 項）
- 記録：失敗の種類 `mxk`（ok／race／imgsafe／cap／provider／not_yet／identity／gate）を ICF に残す。端末だけの見送りは ICF80 の `__icfRecord`（無い・OFF なら ICF の `mxNote`）。
- 試験（Local・偽の AI と画像・PC Chromium と iPhone WebKit）：93-c は GATE 8/0、MIDICON の画面 177/0（mid 6/0×2・ros 5/0×2・ほか 155/0）、2 タップ 30/0。93-b は 122/0（res_f）。mx3-c の Worker・規則の試験は 325/0（台帳 2235）。
- 本番での確認（Owner の PC・QA 物語。台帳 2238〜2242）：ON にした直後、開き直しだけでは作らないこと・上限を Worker から読めることを確認。11-07 の 93-b で、トマスに対して**自動の生成が本番で初めて走った**が、画像サービスが 400 を返して失敗した（`GENERATION_FAILED`・「1 人 1 回」のためもう自動では作らない）。途中から出る人（「宿屋の女将マルタ」）が名簿で「中」になり `NO_CANDIDATE` だった件が、93-c の「中」の条件を入れた理由。**自動で作られた本物の絵は、台帳 2242 の時点で 0 枚**（#127-QQ の本番確認 8 項目は未完了）。93-c を出したあとの本番確認は未実施。
- 未確認・残り：本物の分類 AI と画像での生成・費用・時間、iPhone Safari の実機（「自動」の表示・遊んだターンの検出）、本番 D1 の予約の行（`mx:`・`ch_mx`）、PC と iPhone の同期での二重の絵が無いこと、Owner の実プレイでの対象数と上限の値。**遊んだターンかどうかは端末の側だけで決まる**（Worker は遊んだターンと同期で届いた写しを区別できない。Owner の CANARY では受け入れ。customer に広げる前に再裁定。GPT #127-QQ。v46.36 で `midicon1` を READY にしたのは Owner の方針〔11-08〕による。この点の裁定の更新はこの資料では未確認）。名乗りも見た目の一致も無い改名では 2 枚目ができ得る。
- 戻す：Pages は 93-h の `d8c971bc`（W-MXREG の端末側を外す）→ 93-g の `0a145cc7`（OLDMX1 を外す）→ 93-b（`rollback_93b`）→ 93-a → 92-a の同名のファイル。`midicon1` を CANARY に戻すのは Worker `9b94f399`（v46.35d）。さらに前は `761b4e67`（v46.30）。

#### W-MXREG — 絵も確定した外見も無い登録 NPC に、最初の絵だけを付ける（Worker `v46.36-wmxreg-fc`・93-i の端末側・鍵 `mxreg1`）
- 状態：Worker の部分は本番稼働（11-08 17:0x JST 頃・ソース `d8a6ce55`・12620 行・Cloudflare の版 `7f41d4fe`。戻し `9b94f399`・前の版 `a32dc87b`。11-09 から `v46.37-keys-fc` の土台）。**端末側は 93-i（11-09）で本番**：MIDICON `fbdcd485`（`character_id` を付けて呼ぶ部分）・fix697 `36367c10`（送信口）・ADMF1 `b35e6324`（鍵 `mxreg1`）・端末の kill `v292DfixMIDICONregOff='1'`。93-h までの画面からは呼ばれなかった。Worker の出荷の時点で D1 に `mxreg1` の行は 0 件（93-i の出荷の時点の行の数は未記録）。GPT #127-RI ②（Local 実装 GO・本番は QA を見て判断）と Owner の指示（11-08：全アカウント・管理者画面で入れ切り・env の緊急停止は残す）。
- 端末側（93-i・MIDICON の中）：遊んだターンの判定は、`midicon1` か `mxreg1` のどちらかが ON なら回る。未登録の人物は今までどおり `midicon1` が要る。そのターンに未登録の候補が無いときだけ（1 ターン 1 枚）、`portrait.list` を 1 回読んで、絵の無い登録 NPC から MIDICON と同じ証拠の規則（2 ターン以上〔記述名は 3〕・一番新しいターン・本文と画像用の外見の両方に見た目の語）で 1 人を選び、`character_id` を付けて `mx_ensure` を送る。主人公・削除済み・確定した外見がある（`profile` に性別・年齢層・種族・特徴・外見のどれか）・確認済みの印（`source_appearance_present`）・MIDICON の控えと呼び名が重なる・同じ呼び名の別の登録キャラ・前に試した人、は端末で先に外す。結果は物語ごとに `'r:'+character_id` のハッシュ → 理由だけを持つ（名前・id そのものは残さない）。作れたら av2-portrait に読み直させる。診断 `__v292DfixMIDICON.regDryRun()`。
- 中身：`portrait.mx_ensure` に `character_id` を付けたときだけ新しい道。付けない要求は従来の MIDICON と同じ答え。その登録 NPC の絵（pointer）だけを作り、外見の文（profile）は書かない（profile・story_shadow には書く口が無い）。データの印は `gen_json.mxreg`・`created_by_op`=`mx_ensure_reg`。D1 の表・列・index は足していない。
- Worker が強制すること：id は同じアカウントの今の物語の、削除されていない・主人公でない NPC（違えば 404 `NOT_FOUND`。ほかのアカウント・ほかの物語の id も同じ 404）。既に絵がある → 200 `EXISTS`（作らない）。採用前の候補がある → 200 `CANDIDATES_PENDING`。確定した外見がある（性別だけでも）→ 409。そのキャラ自身の登録名でない → 409。証拠（2 ターン以上・一番新しいターン・見た目の語）・上限（1 ターン 1 枚は MIDICON と共有・物語の日 2・累計 6・アカウントの日 5・1 人 1 回）・予算・CUSTIMG1 の経路・imgsafe は MIDICON と同じで、imgsafe が効かない env では 503 `MXREG_IMGSAFE_REQUIRED`（画像 0）。同じ人の 2 枚目を作らない判定（MIDICON の控えと呼び名が重なる・同格・「正体は」の文・同じ見た目 → 409）。
- 鍵：新しい鍵 `mxreg1`（READY）。行が無ければ全体の値（KV `featcfg:mxreg1`）、それも無ければ OFF（出荷しただけではだれにも何も起きない）。Owner とお客さまの区別はこの鍵に無い。止まっているアカウントは 0。管理者画面 `f2258e33` に行がある（§2.8）。
- 止める：env `CHR_MXREG_OFF=1`（501 `MXREG_OFF`・W-MXREG だけ。MIDICON 本体はそのまま）／`CHR_MX_OFF=1`（MIDICON と一緒に 501 `MX_OFF`）／`CHR_ACCT_FLAGS_OFF=1`（403）。管理者画面で行 0 か全体 0。ルートの `mxReg`=`r1`（kill のとき 0）。
- そのほかの変化：GET / に `mxReg`、acct-flag-list の keys に `mxreg1`（7 → 8）、`/auth/me` の accountFlags に `mxreg1`。`portrait.mx_list` は `midicon1` で 403 のときだけ、`mxreg1` が ON なら 200（読むだけ）。`mx_ensure` の記録行に W-MXREG のときだけ `"reg":1`（名前・id・アカウントは出さない）。同じ Worker で MXALL（`midicon1` を READY に。上の MIDICON）。
- 試験（Local・nonet2・偽の AI と画像・SQLite の D1 代わり）：wmxreg_fx 87/87（親のセッションが独立に再実行して 87/87）、端末込みのブラウザの通し試験 85/0（PC Chromium・iPhone WebKit。端末は 93-i 候補の変更込み）、既存の Worker 試験 7 本は v46.35d との差が想定どおりの 2 種類だけ（新しいキーが見える・`midicon1` が READY）。93-i（Local）：W-MXREG のブラウザの通し試験 85/0、MIDICON 14 モード PC 87/0・WebKit 87/0、OLDMX1 84/0。
- 未確認・残り：本番での実画像の生成・実機・本物の画像サービスでは未実行（93-i の本番の確認は Owner のホームの `/api/save`・`/api/auth/me` が 200 まで）。お客さまの 1 日の上限・imgsafe の拒否も本番では未確認。自動で付いた絵は、画面では手動の絵と区別できない（データでは区別できる）。性別だけ入っている登録 NPC は対象外。1 人 1 回だけ試す。（STARTICON は 93-i で自分の鍵 `starticon1` を持つようになった。下の STARTICON）
- 戻す：端末側だけは Pages を 93-h の MIDICON `d8c971bc`・fix697 `d8c44cd4`・ADMF1 `93d1ac47` へ（止めるだけなら `mxreg1` を 0 か `v292DfixMIDICONregOff='1'`）。Worker `9b94f399`（v46.35d）。残る `mxreg1` の行と KV `featcfg:mxreg1` は v46.35d が読まない。作った絵は残り、手動の絵と同じに表示される。

#### STARTICON — 新しい物語を始めたとき、主人公と登録 NPC の最初の絵を自動で作る（93-i・鍵 `starticon1`。`v292DfixSTARTICON-start-icons.js`）
- 状態：本番稼働（11-09・93-i）・`index.html` の MIDICON の直後（`home.html` は読まない）・sha `5f092874`・?cb=`20261109-bundle93-j`（93-j で IN_FLIGHT の 1 回だけの再試行。93-i は `d2e2bc95`）・版 `starticon-b-20261108`（ファイル冒頭のコメントは「Local 候補・本番 HOLD」のままだが、本番で読み込まれている）。Owner の希望（11-07：「スタートしたときアイコンが自動で作られるように・工程は少なく」）。GPT #127-RI ①（条件付き GO：Owner の「自動で作って」を確認の代わりにする・由来を付ける）。
- 公開の範囲：ADMF1 の鍵 `starticon1`（Worker `v46.37-keys-fc` で READY・行なし＝OFF・既定 OFF）だけで決める。Owner とお客さまの区別はコードに持たない。鍵が 0・行なし・鍵を返さない古い Worker・停止中のアカウントでは通信 0・表示 0（頭文字の丸のまま）。**お客さまでは CUSTIMG1（知人の画像）を先に ON にしておく**（絵の経路は手動と同じ `ensure_first` で、知人は CUSTIMG1 の FLUX.2-pro・予算・1 日の上限・imgsafe を通る）。LC1（`lc1`）の行が無くても動く（外見の案の部品は LC1 の ON/OFF と関係なく読み込まれる）。ICONUX2 が要る（`v292DfixICONUXOff='1'` なら動かない）。管理者画面 `752c623a` に行がある（画像の費用あり。§2.8）。
- 中身：新しい物語だけ（物語の ID の作成時刻から 6 時間以内、かつ開いたときのターン数が 2 以下。読めない・古い物語は `NOT_NEW` で何もしない）に、物語ごとに 1 回、絵の無い主人公 1 人＋登録 NPC 最大 3 人（1 物語最大 4 枚）について：①外見の下書き：説明文（`cast.desc`）から ICONUX2 の近道（説明文の見た目の句をそのまま・AI なし＝`basis`=`desc`）か LC1 の外見の案（文章 AI 1 回＝`basis`=`ai`。説明文に無い特徴を含み得る）。**確定済みの外見があるキャラは上書きしない**。説明文が空・性的な語や若く見える人物の体の語がある（ICONUX2 の検査）キャラは自動では作らず、手動の 2 タップに残す。②av2-data の `setProfile` で、由来 `profile.origin`=`starticon_auto`（`basis` つき）を付けて保存（サーバーに外見が既にあれば書かない＝`APPEARANCE_EXISTS`。CAS で一致しないときも書かない）。本人があとで「この外見で作る」「この外見で確定」を押すと、origin の無い本人の外見で置き換わる。③書いたときだけ、入力中・生成中・画面が開いている・操作の直後でないときに 1 回だけ再読み込み（短い表示つき）。④`ensureFirst` を 1 人ずつ順に。結果が分からない（5xx・時間切れ）・上限・混雑・利用記録の不調・使えない（403／501）ならそこで止める（自動の再試行なし）。サーバーが断ったとき（403・501・402・429・お客さまの 503 `CUSTOMER_IMG_*`）は、このタブではもう試さない（sessionStorage `v292DfixSTARTICON_hold`）。422（imgsafe など）はそのキャラだけ失敗にして次へ。新しい通信の経路は作らない（手動の 2 タップと同じ部品・同じ順）。Worker の予算・上限・imgsafe はそのまま。
- 重複を作らない：作った端末（URL `new=1`）以外では、どのキャラにもまだ絵が無いときだけ始める。端末の記録は localStorage `v292DfixSTARTICON_v1`（物語ごとの段階とキャラ ID のハッシュ → 理由コード。名前・本文・番号そのものは残さない。送る前に「送った」と書く）。端末の上限：1 日（UTC）に自動で始める物語 5 つまで。B37 の自動案内の印 `v292DfixB37onb_<物語ID>` を付ける（👥 が勝手に開かないように。手動の入口はそのまま）。S・長期記憶・名簿・sys には書かない。Vault の物語・未ログイン・schema 2 でない・`v292Dav2Off='1'` では何もしない。
- 止める：管理者画面で `starticon1` を 0。端末の kill `v292DfixSTARTICONOff='1'`。`v292DfixSTARTICONNoAI='1'` は文章 AI の案を使わない（説明文の句をそのまま使えるキャラだけ）。診断 `window.__v292DfixSTARTICON.status()`。
- 93-j（sha `5f092874`・?cb=`20261109-bundle93-j`）：200 `IN_FLIGHT`（口座の札）を受けたら、20〜40 秒待って portrait.list で確かめ、まだなら 1 回だけ再試行（その間は他のキャラにも送らない）。2 回目も `IN_FLIGHT` なら見送る。kill `v292DfixSTARTICONRetryOff`。
- 93-k（sha `9b626070`・?cb=`20261110-bundle93-k`・版 `starticon-d-20261109-ifretry-listopen`）：段 A のあとの 1 回の再読み込みを、👥 キャラ一覧を「見ているだけ」（文字の入った欄・選択欄・チェック・確認欄・ピッカー・ほかのダイアログが無い）なら一覧が開いていても進める（本番で Owner が一覧を開いて待ち、MODAL で止まった件）。読み直した後、落ち着いたページで同じ一覧を 1 回だけ開き直す（sessionStorage `v292DfixSTARTICON_reopen`・2 分・同じ物語）。入力中などで待つ間は「キャラ一覧を閉じると絵の準備を続けます」を 1 回出す。段 C で絵が付くたび LC1 の `refreshPtr` を呼ぶ（portrait.list 1 回・読むだけ）。kill `v292DfixSTARTICONListOff`（= 93-j）。Local 試験：listopen 7/0・listopenctl 6/0・listedit 5/0・listkill 5/0（Chromium・WebKit 同数）。
- 試験（Local）：12 モード PC 53/0・WebKit 53/0。
- 未確認・残り：本番での実画像の生成・お客さまの 1 日の上限・imgsafe の拒否・実機（iPhone）。出荷の時点で `starticon1` が ON のアカウントの有無は、この資料では未記録。自動の外見（`basis`=`ai`）は説明文に無い特徴を含み得る。
- 戻す：Pages 93-h の同名ファイルに戻して STARTICON のファイルを消す（上の「戻し先（93-i 時点）」）。作った外見と絵は残る。

#### 93-k の表示・物語の種の直し（2026-11-10・LC1 refreshPtr・av2 RENAME1・fix873 SEEDNPC1b）
- LC1（`f4564ac3`）：`refreshPtr(why)` を足した（絵を付けた別の部品が呼ぶ読み直し。控え `W.ptr` には足すだけ）。一覧を開いたまま STARTICON が絵を付けると「絵を作る」のままになっていた件（押しても ensureFirst が EXISTS・calls 0 で止まる＝費用 0）。kill `v292DfixLC1PtrRefreshOff`。
- av2-portrait RENAME1（`8c744237`）：⚙ 設定で NPC の名前を変えると、会話ログのカード・設定の丸が頭文字の丸のままだった（名前→キャラの対応 `cast.av2.bindings` は登録時の名前だけ＝保存された対応表なので再読み込みでは直らない）。表示だけ：その名前がどの対応にも無いときに限り、👥 一覧と同じ決まり（今の名前と完全一致・削除でない・1 人だけ）でそのキャラの絵を出す。対応表・保存・通信は変えない。kill `v292Dav2pRenameOff`。恒久の直し（改名時に addBinding）は書き込みの経路なので未実装。Local 試験 rename 9/0・renamekill 9/0（両ブラウザ）。
- fix873 SEEDNPC1b（`486d4b7c`・版 `seednpc1-b-20261109`）：「いっしょに出る人」が説明だけ（人を表す語・敬称で終わり、その前に修飾がある）の人は name を空・desc に全文 → fix823 が AI で名前を付ける（AI 呼び出しは 1 回のまま）。名前だけの人（汐里・桜井ひなの・あやの先輩）・名前の並びは今までどおり。複数人は区切りで分けた項目が全部説明のときだけ人ごとに。kill `v292DfixSEEDNPC1bOff`（= 93-j）・`v292DfixSEEDNPC1Off`（= 93-i）。Local 試験 node 153/0・ブラウザ b1after 44/0・b1kill 9/0。
- 未確認：本番・iPhone 実機・本物の AI。⚙ 設定の NPC 欄の行が消える件は Local で再現せず原因未確定。MIDICON 側の一覧の控えは未修正。

#### IMGMODEL1 — 画像モデルの切り替え（Worker `v46.34b-ready1-proarg-fc` ＋ 管理者画面 `e5198d0a`）
- 状態：本番稼働（2026-11-07。台帳 2250・GPT #127-QY ②⑥）。ルートの `imgModel`=`im1`。**D1 の `img_model` の行は未設定＝実効は dev（FLUX.2 [dev]・非商用・1 枚 約 $0.0154）のまま**。pro（FLUX.2 [pro]・商用可・約 $0.03）への切り替えは未実施。
- PROARG1（`v46.34b`）：FLUX.2-pro の仕様を `upsampleParam:false` にした（Together が pro への `prompt_upsampling` を 400 で断ったため）。本番での pro の手動 1 枚のテストは成功（asset READY・image/jpeg・モデル FLUX.2-pro・費用 $0.03 を記録）。テストのあとも D1 の `img_model` は未設定（dev）。お客様の画像はライセンスの確認まで HOLD。
- 仕組み：選択は D1 `chr_public_mode` の 1 行（k=`img_model`・v は 0=dev／1=pro の整数）。画像の要求のたびにキャッシュせず読む。行が無い・読めない・壊れている＝dev。優先順位：env `CHR_IMG_MODEL_FORCE_DEV=1`（緊急・D1 より優先。Owner の試験 env `CHR_IMG_MODEL_TRIAL` も止める）＞ D1 の行 ＞ 既定 dev。管理操作 `img-model-set`（`public-set` と同じ入口・認証・条件付き書き込み・監査・読み戻し）。判定は `chrPubEffective` の一か所。
- 効く相手：今すでに画像を作れる主体（Owner・内部の QA）だけ。**新しく画像を作れる人は増えない**（知人は pro にしても 403 `PUBLIC_MODE_OFF`）。v46.35b の CUSTIMG1 では、知人の絵はこの選択に関係なく必ず pro（下の CUSTIMG1）。自動アイコン（MIDICON）も 2 タップも同じ入口で、選んだモデルを使う。上限・1 枚ごとの費用の記帳（pro は $0.03。env `TOGETHER_PRO_USD` の推定）・imgsafe・予算は変えない。旧 `/image` は対象外。
- 管理者画面：「機能スイッチ」の表の最後の行「画像モデル」（まとめて ON に入らない）。今の実効モデル・ライセンスの注記（dev=非商用／pro=商用可）・1 枚の目安・切り替えボタン（画面の中の確認に費用の変化 約 1.9 倍を出す）。古い Worker では「切り替えがありません」。
- 方針（GPT #127-QY）：pro の手動 1 枚は GO（自動の画像を止めて、成否にかかわらず dev に戻す）。**知人の画像は pro が第一候補。dev の customer 開放は HOLD（ライセンス）**。
- 試験（Local・偽の相手）：imgmodel1_fx 31/1（落ちた 1 件は `workerBuild` の名前の照合だけ）、imgmodel1_admin 12/0（chromium・webkit）、pub4630 37/0。
- 未確認・残り：pro の 1 枚（11-07）は成功したが、画質の評価・複数枚での価格は未確認。残高の推計（COST1）は dev の単価で数えるため pro が混ざるとずれる（記帳は正しい）。pro の絵は dev と絵柄が違い、同じキャラの絵が混ざり得る。
- 戻す：Worker `c312e86a`（v46.33b。pro の要求が 400 になる版）または `e878ea50`。管理者画面 `18594749` または `5c9c9f28`。D1 の行が残っても古い Worker は読まない。

#### CUSTIMG1 — 招待した知人のキャラの絵（FLUX.2 [pro] だけ。Worker `v46.35b-custimg1-fc` ＋ 管理者画面 `a2ea35ca`）
- 状態：本番稼働（Worker `v46.35b-custimg1-fc`〔ソース `dca5e74e`〕から。今の本番 `v46.37-keys-fc` にもそのまま入っている）。GPT #127-RC-1 の条件（管理者画面で実効の状態を確かめられ、OFF に戻せること）を足した版。ルートの目印 `custImg`=`ci1`。**11-08 08:10 JST に Owner が管理者画面で ON**（D1 `chr_public_mode` の k=`cust_img`=1）。画面（Pages）の部品は無い（今の画面のボタンをそのまま使う）。
- 開く条件（両方そろったときだけ）：①env `CHR_CUSTOMER_IMG='1'`（親のスイッチ。消せば管理者画面に関係なく止まる）②D1 の `cust_img`=1（行が無い・壊れている・読めない＝OFF）。対象は entitlement が beta で停止されていない知人だけ。paid・none・suspended は対象外（403 `PUBLIC_MODE_OFF`）。D1 の値を読むのは知人の要求のときだけ。
- 作り方：知人の絵は、管理者画面の画像モデルの選択（dev／pro）に関係なく**必ず FLUX.2 [pro]**。dev（非商用）は知人には使わない。pro が使えないとき（`CHR_IMG_MODEL_FORCE_DEV=1`・鍵なし・単価が不正）は dev に落とさず 503 `CUSTOMER_IMG_PRO_UNAVAILABLE`。画像の安全の検査は一般公開のときと同じ強さで必ずかける（`CHR_IMGSAFE_OFF=1` のときは 503 `CUSTOMER_IMG_IMGSAFE_REQUIRED`）。Owner の動きは変わらない（選択どおり dev／pro）。一般公開は OFF のまま。
- 費用と上限：作る前に、その人の今月の残りの予算で pro 1 枚（`TOGETHER_PRO_USD`。未設定は $0.03）が払えるか確かめる（足りなければ画像の会社を呼ばずに 402 `CUSTOMER_IMG_BUDGET`。上限 0＝無制限は 402 `CUSTOMER_IMG_LIMIT_UNSET`）。費用はその人の利用額（`usedUsd`）に記帳。1 人 1 日の枚数は env `CHR_CUSTOMER_IMG_DAILY`（既定 20。日の区切りは UTC＝日本時間 9 時。超えると 429 `CUSTOMER_IMG_DAILY_CAP`）。D1・KV が読めないときは 503 `CUSTOMER_IMG_STORE_UNAVAILABLE`。
- 知人が今の画面でできること：👥 キャラ一覧のカードの「最初の絵を作る」「確定してアイコンを作る」「新しいデザインを生成（候補のみ）」→「候補から選ぶ」→「この絵にする」、新しい物語の始めの B37 の案内（作るのは本人が押したときだけ）。2 タップ（LC1 の `lc1` が CANARY）は使えない。自動アイコンは、Worker `v46.36` から `midicon1` が READY になったので、管理者画面でその知人の `midicon1` を ON にすれば同じ経路（FLUX.2-pro・予算・1 日 20 枚）で動く（11-08 の出荷の時点で知人の行は無い＝OFF。v46.35d までは 403 `MX_NOT_ENABLED`）。93-i から、登録 NPC の最初の自動アイコン（`mxreg1`）と物語を始めたときの自動アイコン（`starticon1`）も、その知人の行を ON にすれば同じ経路で動く（STARTICON は CUSTIMG1 を先に ON にしておく。本番では未確認）。押さずに絵ができる道は、この 3 つの鍵を ON にしたときだけ。前提：知人の物語が Asset v2 であること（env `CHR_AV2_OPEN_ENT` に beta。本番の env はレーンでは未確認）。
- 管理者画面 `a2ea35ca`：画像モデルの行のすぐ下の「知人の画像（CUSTIMG1）」の行。`public-get` の `custImg`（env・D1・実効・緊急 OFF・1 日の上限・1 枚の単価）を出し、`cust-img-set`（`expect` に今の値・監査・読み戻し）で ON／OFF。一括 ON には入らない。v46.35b より古い Worker では「切り替えがありません」。
- 本番での確認（11-08）：知人の試験用アカウントで FLUX.2-pro の絵 3 枚ができ、そのアカウントの物語だけに入った（ほかのアカウントへの混入なし）。予算の差し引きも確認（上限 $3 のうち $0.1141 使用。pro 3 枚の記帳に、外見の文を英語に直す文章 AI の小さな費用を含むとみられる）。
- 試験（Local・偽の相手）：custimg1_fx 66/0（v46.34b で同じ試験は 19/36＝落ちるのが正しい）、既存の ready1 25/1・imgmodel1 31/1・friend1 19/1・limit1 8/1（落ちた各 1 件はビルド名の照合だけ）、pub4630 37/0。
- 残り・注意：**pro の絵を第三者（知人）に渡すことの Together／BFL のライセンスは確認中**（レーンの資料の記載のまま。確認の結果はこの資料では未記録）。画面の表示が pro に合っていない（B37 の費用の目安は dev の $0.0154／枚・429 は「混み合っています」と出る）。日の枚数と予算は「読んでから足す」ので、同時に何本も押すと数枚こえ得る。知人の絵（pro）と Owner の絵（dev）で絵柄が少し違い得る。
- 止める・戻す：いちばん軽いのは管理者画面で OFF（次の要求から知人は 403「準備中」）。管理者画面が使えないときは env `CHR_CUSTOMER_IMG` を消す。`CHR_PUBLIC_FORCE_OFF=1` でも知人の絵は止まる（Owner は影響なし）。Worker の戻しは `dde9c4d8`（v46.34b。KV の `custimg:d:<id>:<日付>` は 3 日で消え、D1 の `cust_img` の行は読まれない。作った絵は残る）。管理者画面の戻しは `e5198d0a`。

#### DIAG1 / DIAG1b — 画像サービスの 4xx の理由を取る診断（Worker `v46.31-diag1`・`v46.31-diag1b-fc`）
- 状態：2026-11-07 に出荷（台帳 2242・GPT #127-QT／#127-QU）。`v46.31-diag1b-fc`（ソース `e878ea50`）の診断は `v46.33b` にもそのまま入っている。**11-14 に外す予定**（予約済みの作業。今の Worker から DIAG の行だけを外す）。
- 経緯：11-07 の 03:35〜10:28 に、Together の FLUX.2-dev が 400 `invalid_request_error` を少なくとも 4 回返し、手動の「絵を変える」・自動・2 タップのどれも 502 `GENERATION_FAILED`（「絵を作れませんでした」）になった。11-03 には同じ Worker・同じモデルで作れていた。10:31 に手動 1 回が成功（候補 1 枚・15.5 秒）して回復を確認。依頼の形は 11-03 から変わっていないため、Together 側の一時的な不具合の見込み。**理由の本文は取れていない＝原因は未確認**。
- 中身：4xx のときだけ、許可した欄（`raw_code`・`raw_param`・`msg`）をログに足す。diag1 はログ関数 `chrIconfix1Diag` が足した欄を落とすことが分かり、diag1b でログ関数の側でも通すようにした。`msg` は英数字と記号だけ・240 字まで・鍵を伏せる・prompt の先頭 12 字が含まれたら記録しない。鍵・prompt・人物の設定は出さない。偽の AI での Worker の試験は 47/1（1 件は `workerBuild` の文字の期待）。
- 方針（GPT #127-QU）：画像が全体で失敗しているあいだは `midicon1` を一時 OFF にすることを推奨。原因が不明なうちに pro へ切り替えるのは HOLD。実際に `midicon1` を OFF にしたかの記録は未確認。

#### fix197 / fix523 / fix990 / p8d — 旧アイコンの仕組みと安全装置
- fix197（`i106`）：AI アイコン（seed 固定・キャラ単位）。再生成（fix403）・サーバー URL 優先（fix400）・正名寄せ（fix424）など多数の追加を内蔵。
- fix523（`i297`）：アイコンの端末間伝播（Worker の imgmanifest の rev で新しいときだけ上書き）。
- fix990（`i10`）：Asset v2 必須のアカウントで旧画像の op が 409 を返し続ける空回りを、10 分止める。
- p8d（`i14`）：画像生成の送信直前に、人物名や日本語の文がそのまま provider へ出るのを止める（fail-closed）。
- fix63（`i80`）の fix979b（82b・sha `77b3d9b2`・?cb=`20261101-bundle82-iconux-b`）：会話ログの丸いアイコンの明るさ・コントラストの補正（`brightness(1.12) contrast(1.06)`）を既定で外す（明るい背景の新しい絵の白飛び）。拡大 1.0・目印 `data-f979`・kill `v292Dfix979Off` はそのまま。補正の強さは端末の `v292Dfix979Filter`（`none` 既定／`soft`／`old`＝従来の補正に戻す）。

### 2.10 UI・画面

| 部品 | 状態・位置 | 役割 | スイッチ |
|---|---|---|---|
| UI1 | `i350`（最後） | プレイ画面の引き算：Asset v2 移行の固定ボタンを外し（Owner だけ詳細設定に置く）、空の会話ログを畳み、補助操作を設定へ移す | `v292DfixUI1Off` ほか |
| IS1 | `i70` | アイコンの大きさ（小・中・大）。表示だけ。「🎛 調整」からも選べるのは UX72（下） | `v292DfixIS1Off` |
| UX72 | `i72`（80-int-a の番号） | 「🎛 調整」の中に 🖼 アイコン欄（大きさ・顔の寄せ）。設定の中の本物の欄の写しで、新しい保存キーは無い。端末だけの見え方。全員 ON。sha `c4dcaa07`・?cb=`20261031-bundle72-ux-a` | `v292DfixUX72Off` |
| FLW3 | `i358`（83 の番号） | 「▶ 物語を始める」の幕開けを STORY で送ったあと、ターンが増えて最後のターンが幕開けのときだけ、入力の種類を押す前の種類（ふつうは DO）へ戻す。失敗のときは STORY のまま。開き直したとき、ターンが幕開け 1 つだけで STORY なら表示を DO に（保存はしない）。sha `f2e896a4`・?cb=`20261101-bundle82-iconux-b`（82b） | `v292DfixFLW3Off` |
| JMP | `i168`（80-int-a の番号） | 展開の描写・会話ログをさかのぼっているときだけ、パネルの下に「↓ 最新へ」。読むだけ（押したときだけスクロール）。全員 ON。sha `b726e645`・?cb=`20261031-bundle76-jmp-a` | `v292DfixJMPOff` |
| LE3 | `i68` | iPhone 幅（520px 以下）だけ上のバーを 1 行にして ☰ にまとめ、展開の描写を広げる | `v292DfixLE3Off` |
| fix777 | `i67` | アイコンをタップで拡大表示 | — |
| fix243 / fix270 | `i112` / `i115` | 上のバーの折りたたみ・整理 | — |
| fix880 | `i173` | ⚙ システムを 3 段（通常・詳細・開発）に畳む（DOM の移動だけ） | `v292Dfix880Off` |
| fix334 / fix335 | `i172` / `i176` `h37` | 入口ハブ（空白フォームで始めない）・おまかせ生成。81-admg-a で sha `c98c2c6c` / `d70eb54d`・?cb=`20261101-bundle81-admg-a`：おまかせを使えるかは ADMF1 の `gate('oma1', 端末の opt-in v292Dfix335)`（公開範囲 CANARY＝Owner のアカウントだけ。Owner で行が無いときは端末の opt-in）。入口ハブのプレビューのボタン・index.html の設定の「🎲 おまかせで埋める」のボタンも同じ判定で、答えが後から届いたときも出す。OFF の案内は「管理者画面の「おまかせで埋める」が OFF です」。home.html の fix335（`h37`・API の `draw` だけを fix823 が使う）は判定を通らない。93-h で fix335 は sha `fc96f630`・?cb=`20261108-bundle93-h`（GENDER1：自分で選んだ名前の性別を一緒に決める。§2.11） | `v292DfixB37eOff`（fix334）・`v292Dfix335`（opt-in） |
| SETUI1 | `index.html` の最後（FLW5 の後・93-g。home では読まない）・sha `3892c38f`・?cb=`20261108-bundle93-g` | ⚙ 設定の画面の配置（93-g）。スマホで下の固定部分が画面の大半を占めていたのを「✔ 保存してゲーム開始」「閉じる」の 1 行だけにする。🎲 おまかせで埋める／🎲 設定の空欄を AI で埋める／その結果 → 🌍 世界タブの先頭（長い説明は畳んだ「ⓘ 説明」）。物語リセット・完全リセットの説明 → ⚙ システムタブのボタンの隣（確認画面は従来どおり）。🛠 AI への追加指示 → ⚙ システムタブ。利用規約・プライバシーの行 → ⚙ システムタブの一番下。600px 以下では設定の画面を画面いっぱい（100dvh・ノッチ対応・横スクロールなし）。要素を動かすだけで、id・ボタンの動作・確認は変えない。実測（390×844）：入力欄の高さ 32% → 68%、下の固定部分 349px → 58px。試験（Local）：before 11/11×2、after 29/29（スマホ）・27/27（PC）、kill 12/12×2、MIDICON 87/0。「画像: Pollinations」の表記は変えていない（運営の判断待ち）。状態の確認 `window.__v292DfixSETUI1.status()` | `v292DfixSETUI1Off` |

### 2.11 シナリオ・ホーム

- fix819（`h38`）：原本（シナリオ）から独立した物語を作る。fix820（原本の保存）・fix872（原本のクラウド同期）・fix823（種の変換）・fix829（種の文の補強）。
- fix825（`h45`）：ホームの原本 UI と「この物語を始める」。fix873（`h47`）：シナリオ作成。fix870（`h46`。93-e の OPEN1 で sha `f4381e0a`・?cb=`20261107-open1`：「▶ 続きから遊ぶ」`#contBtn` と `latestStory`・`storyCount` は fix889 の `mayShowRow` が許す行だけで数える。1 件も無ければ隠す。`onChange` と `chr:account-me` で再適用）：ホームの入口。fix885（`h48`）：ホームのデータ欄の折りたたみ。B37-home-menu（`h33`）。
- NEWACCT1（93-g・`home.html` の inline の中。ファイルは無い）：新しいアカウントの「空っぽ」の状態のホームの表示を直す。①Pages 版（fix893 の cookie）では端末にログインの情報が無いのが正常なので、「ログインしていないため同期できません」を出さず中立の文（確認しています／まだ招待されていません）にする。`/auth/me` が答えてログインの状態になったら同期を 1 回だけやり直して古い表示を消す。②クラウドに保存が 1 件も無いアカウントは `op:'get'` が 200 `{ok:true, data:null, rev:0}` を返すので、空のときだけ「☁ 最新です」で終える（何も書かない。500・通信断・時間切れは従来どおり「同期できませんでした」）。③起動直後の物語の一覧の問い合わせが 1 回届かないと、聞き直さずにオフラインの扱いのままだったのを、ログイン中なら 5 秒後・15 秒後と、ログインの状態が確定したときに読み取りだけ聞き直す（fix889 が `cache`／`blind` のとき listshadow を聞き直す。最大 4 回）。④空の一覧の案内を実際のボタンの名前（「✎ シナリオを作る」。`#scBtn` の表示名を読む）にする。kill `v292DfixNEWACCT1Off='1'`（従来どおり）。試験（Local・両ブラウザ）：fresh 13/13・early 5/5（リグの印を消すコピーで。元のリグでは 4/1）・noinvite 4/4・fail 11/11、offline は Chromium 3/2・WebKit 4/1。**③の「5・15 秒の聞き直し」が効くことはリグで未検証**（このリグでは 93-f のままでも最初の失敗を再現できない。本番で何が 1 回目を失敗させたかも未再現）。
- GENDER1（93-h・新ファイル `v292DfixGENDER1-autogender.js`・sha `3291ae11`・?cb=`20261108-bundle93-h`。`index.html` は fix335 の直前、`home.html` は fix436 の直前に読む）：おまかせ・AI でキャラを作るとき、性別を自動で決める（Owner「性別が未設定になるのは良くない」）。全員に効く。利用者に操作は増えない（ダイアログ・ボタン 0）。決め方の順：①利用者が選んだ性別（ラジオ・シナリオの gender）は触らない ②説明の文にはっきりした語（少女・女性・少年・男性・「性別: 女」など。「母」「娘」など他人の性別を指しうる語は使わない。男女の語が混ざれば決めない）③AI が返した性別の欄（fix436・fix823 のプロンプトに 1 項目足しただけ・追加の通信 0。性別だけが空欄のときは AI を呼ばない）④種バンクのおまかせ（AI なし）では fix335 が自分で選んだ名前の性別 ⑤どれでも決められない（人外・曖昧）→ 未設定のまま。変えたファイル：fix335 `fc96f630`・fix436 `3a5d6160`・fix823 `d1837ab4`（どれも ?cb=`20261108-bundle93-h`。前は `d70eb54d`・`ff50b6f7`・`e86d3a62`）。kill `v292DfixGENDER1Off='1'`（呼び出し側は従来どおり）。観測口 `window.__v292DfixGENDER1`。試験（Local・nonet2・偽 AI）：node 単体 66/0、ブラウザ home・modal・kill × 2 ブラウザ＝82/0。GENDER1 で性別が入ったキャラに対する IDSPLIT2 の動きは専用には試していない（未確認）。本物の AI での確認は未実施。
- HOMERETRY1（93-h・`home.html` の inline の中。ファイルは無い）：93-g の出荷直後、Worker の冷えた起動で `/save` が 503 `D1_INIT_TIMEOUT` を返したあと、ホームの「☁ 同期できませんでした」が Worker が直っても戻らなかった件の対策。一時的と分かる失敗（HTTP 503 で `retryable:true`、または `D1_INIT_TIMEOUT`／`ACCOUNT_STORE_TIMEOUT`、または通信そのものの失敗）のときだけ、`pull()` とクラウドの物語の行（f757）を、1 ページで最大 3 回（2・6・15 秒後）聞き直す。online になったら待たずに聞き直す（回数に数える）。500・403・401・409・`ok:false` の 200 は従来どおり聞き直さない。関門（判定・墓標・fix826 など）は通常どおり通す。聞き直す予定がある間だけ「☁ 同期できませんでした（少し待って自動でもう一度試します）」と出し、表示をほかの処理が書き換えていたら何もしない。kill `v292DfixHOMERETRY1Off='1'`（93-g と同じ）。試験（Local・nonet2）：7 場面 ×（after・kill）× Chromium・WebKit＝28 回で 152/0。online のときの即時の聞き直しは未確認。全部失敗すると最大約 1 分「…自動でもう一度試します」が出る。本番の確認：出荷後の Owner のホームの読み直しで Worker への要求 13 本がすべて 200・「同期できませんでした」なし（聞き直しが実際に走った場面は未観測）。

---

## 3. Local 候補（まだ本番ではない）

記録時点（2026-11-09 に更新。表の行の多くは 2026-11-02 までの記録のまま）。「80-int-a で本番」「81-admg-a で本番」「82b で本番」「83 で本番」「MSW1-c で本番」「84 で本番」「85 で本番」「86 で本番」「本番」と書いた行を除き、**Owner の承認前で、本番には入っていません**。土台・sha は各パッケージの MANIFEST が正。

| 候補 | 中身 | 土台 | 状態（GPT 裁定） | 置き場所 |
|---|---|---|---|---|
| 77-ui-a | 74-ux72a（「🎛 調整」の中に 🖼 アイコン欄。kill `v292DfixUX72Off`）＋ 76-jmp（「↓ 最新へ」ボタン。kill `v292DfixJMPOff`） | 71-a | **80-int-a で本番**（全員 ON） | 本番 |
| 78-admf-c | 管理者画面からアカウントごとに SFL を ON/OFF。Worker・Pages 6 本・管理者画面 | 77-ui-a | **80-int-a で本番**（ADMF1・SFL1。記録時点で Owner のアカウントだけ ON） | 本番 |
| 73-npres-d3 | NPC の前面化・状態注入から、場面にいない人物を外す（電話の相手は「声だけ」で残す） | （c333 系） | **80-int-a で本番**（73-d4b＋admf2。管理者画面の npres1 で Owner のアカウントだけ ON＝限定カナリア。一般の既定 ON は HOLD。本番の長ターン確認は未確認） | 本番 |
| ICONFIX1 / 1b | Worker だけ：Together FLUX.2-dev への要求の形（`response_format`=`base64`・`prompt_upsampling` を送らない）＋ 4xx の code・type・param だけの診断ログ。停止 env `CHR_ICONFIX1_OFF='1'` | `v46.10-admf2-fc` | **本番**（`v46.12-iconfix1b` で限定 PRODUCTION_PASS・#127-PA。#127-PC で CLOSED。`v46.13-admg-fc` にも含む） | 本番 |
| 81-admg-a（ADMG） | 管理者画面の機能スイッチを 6 鍵に（`lc1`・`ld1`・`rc1`・`oma1` を追加）・公開範囲 READY／CANARY／HOLD を Worker が強制・全体の値（KV `featcfg:<鍵>`）・管理者画面の伏字。Worker・Pages 9 本・管理者画面 | 80-int-a ＋ ICONFIX 1b | **81-admg-a で本番**（#127-PC：条件付き出荷 GO。初期 CANARY＝sfl1・npres1・ld1・rc1・oma1、HOLD＝lc1。NPRES の一般 ON は HOLD 継続。伏字は誤表示防止として限定 GO） | 本番 |
| 75-icf-a | アイコン生成の失敗を端末に記録（最大 100 件・名前や文章は持たない）。kill `v292DfixICFOff` | 71-a | 80 では除外（M1e の flake・比較試験の作り直しが先）。**ICF として 83 で本番**（83-flow-c に合流） | 本番 |
| 82b-iconux-b | ICONUX2（2 タップの絵・LC1 が ON のときだけ）・fix979b（会話ログのアイコンの白飛び）・FLW1（確認をカードの中へ）・FLW3（幕開けのあと入力の種類を戻す）・SETAV1（設定の「キャラ」の絵）。Pages 8 本。パッケージの Worker `v46.14-iconux-fc`（`lc1` を CANARY に）は出していない | 81-admg-a | **82b で本番**（Pages だけ。台帳 2181。LC1 は HOLD のままなので ICONUX2 は動かない） | 本番 |
| 83-flow-c | FLW2（読み直しの前の案内）・FLW4-r2（本人の年齢を【キャラ属性】へ）・FLW5 ①（🏠 で同じなら書かない。② は GPT #127-PG で外した）・ICF・管理者画面の「まとめて ON」の表示。Pages 11 本＋管理者画面 `0b825943`。Worker は 81 のまま | 82b | **83 で本番**（台帳 2182） | 本番 |
| MSW1-c | 文章のモデルの切り替え（V4.1 Flash ⇔ V4.1 Flash 1017・Owner だけ＝CANARY・実在の事前確認・1 回だけの安全網と 120 秒の遮断）。Worker `v46.17-msw1c-fc`（`033fa29c`・Cloudflare の版 `4e443c60`）＋管理者画面 `b4c007d6`。Pages なし。停止 env `CHR_MODELSW_OFF=1` | `v46.13-admg-fc` ＋ 83 の管理者画面 | **MSW1-c で本番**（台帳 2183・GPT #127-PI。戻し Worker `95b4f70a`・管理者画面 `0b825943`） | 本番 |
| 84-b37g-a | 初心者向けの案内（B37）が、👥 一覧・確認が開いているとき・入力中・直近 4 秒の操作中は自動で開かない（以前は自動で開いて一覧を閉じ、「この外見で確定」の押下が失われた）。手動の開き方は不変。Pages 4 本（B37-onboard `0e2c5681`・index `fda89e45`・home `3ce5c243`・version `8071113f`）。kill `v292DfixB37gOff` | 83-flow-c | **84-b37g-a で本番**（台帳 2189・GPT #127-PK。戻し 83 の 4 本） | 本番 |
| 85-imgsafe（X-d〜X-f） | Worker だけ：画像の安全確認（案X）。ER1x の分類＋小さな床・旧い絵の作り方も同じ分類・Owner 専用の dry run・env `CHR_IMGSAFE_ENFORCE`（未設定／`owner`／`all`）と `CHR_IMGSAFE_OFF=1`。`v46.22-imgsafexd`（ソース `9d879f49`）→ `v46.23-imgsafexe`（`085742bf`。性的の定義を絞る）→ `v46.24-imgsafexf`（`42ebab48`。普通の体型・普段着を none にする文言）。env `CHR_IMGSAFE_ENFORCE=owner` を設定。Pages は 84 のまま | msw1c ＋ 84 | **85 で本番**（台帳 2190〜2200 の範囲・GPT #127-PK〜#127-PO。戻し Worker は 1 つ前の版か msw1c `033fa29c`。Owner の実機 QA の結果は未確認） | 本番 |
| 86-lc1ox-d | Pages 12 本（core 追加）＋ Worker `v46.27-thin1lc1c-fc`（`033c4e7b`・Cloudflare の版 `d8ca42f5`）：THIN1（短い外見でも絵を作る）・LC1 の公開範囲 HOLD→CANARY（Owner だけ）・LC1OX（普通の語を下書きに残す）・SEE 既定 OFF・画面側の core・理由の文言。Pages は version `ccb576f6`・index `16a28966`・home `da8ae5fe` | 84-b37g-a ＋ Worker `v46.24` | **86 で本番**（台帳 2190〜2200・GPT #127-PQ。全員への強制は HOLD。戻し：Pages 84 の 11 本・Worker `42ebab48` か `085742bf` か `033fa29c`・env を外す） | 本番 |
| 87-lc1ox2-a | Pages 4 本（外見の案 `4dbacfc2`・index `0ad8f67b`・home `32ba38bc`・version `aac19175`。コミット `9237e13`）：LC1OX-2（年少者の判定を本人の文だけで・AI が足す普通の見た目を残す） | 86-lc1ox-d | **87 で本番**（GPT #127-PS。戻し 86 の 4 本） | 本番 |
| v46.28-r1920b-fc ＋ 89-r1920-b | Worker（ソース `d7b768bd`・Cloudflare の版 `7e759b58`）：R19/R20（explicit は年齢を問わず・実在の人物 × 性的）・床 xg2（R02）・鍵 `xh4`。Pages 9 本（コミット `b395bd2`・version `e49339f7`・index `4578a867`・home `58af17d4`）：LC1OX-3（88-e の外見の案 `fb4e689f`）・`APPEARANCE_UNSAFE_POLICY` の理由の文（av2-data `d208ae87`・av2-portrait `00a31caf`・LC1 作業欄 `8def3834`・fix492 `98e37759`）・core `fb23cf9e` | 87 ＋ Worker `v46.27` | **89-b で本番**（Worker → Pages の順・Owner だけ・GPT #127-PW。戻し：Pages 87 の 9 本・Worker `033c4e7b`） | 本番 |
| 90-a | Pages 6 本（コミット `ebdc457`・version `ccd55617`・index `f2dca471`・home `fbe67784`・外見の案 `5556f614`・作業欄 `75c596c0`・ICONUX2 `673bf47a`）：下書きに入れなかった見た目の句の知らせ（表示だけ・新しい制限なし） | 89-r1920-b | **90-a で本番**（GPT #127-QA。戻し 89-b の 6 本） | 本番 |
| 90-b ＋ v46.29-rphold-fc | Pages 7 本（コミット `2b538ad`・version `e5b31932`・index `1d7b39c8`・home `e4c281c5`・av2-data `a0c5774a`・av2-portrait `12c563bf`・fix492 `bd95a709`・作業欄 `aea27e80`）：`APPEARANCE_UNSAFE_POLICY` の文を `imgsafeWhy` で分ける（表示だけ）。Worker（ソース `d0c25092`・Cloudflare の版 `9680cd8a`）：`real_person=yes` なら `sexual` に関係なく POLICY・env `CHR_IMGSAFE_REALPERSON_HOLD`・鍵 `xh5` | 90-a ＋ Worker v46.28 | **90-b・v46.29 で本番**（Pages → Worker の順・Owner だけ・GPT #127-QE・台帳 2225。戻し：Pages 90-a の 7 本・Worker `d7b768bd` か env `"0"`） | 本番 |
| v46.30-public-fc ＋ 管理者画面 `53e2d067` | Worker（ソース `761b4e67`・Cloudflare の版 `60059e2f`）：一般公開のスイッチの段階 1（公開 OFF のあいだは Owner と内部の QA だけが画像を作れる・ON は操作できない・`CHR_PUBLIC_FORCE_OFF`・役割の表）。管理者画面：「一般公開」のカード。Pages なし（§2.9 PUBMODE） | v46.29 ＋ 管理者画面 `b4c007d6` | **v46.30 で本番**（GPT #127-QK・台帳 2229。戻し：Worker `d0c25092`・管理者画面 `b4c007d6`） | 本番 |
| 91-b | Pages 6 本（コミット `9182d31`・version `5adb7fc4`・index `315b347e`・home `59119b0c`）：NDI1 `54dadff9`（新規・ブラウザから画像サービスへ直接つながない）・fix315 `4864a7ee`（「👁 見る」は許可があっても作らない）・fix295 `993f7976`（fix295e・会話ログが上端に戻る件）。91-a（NDI1・SEE）に fix295e を合わせたもの。Worker・管理者画面は不変 | 90-b ＋ Worker v46.30 | **91-b で本番**（GPT #127-QO・台帳 2234。戻し 90-b の 5 本。iPhone の実機は未確認） | 本番 |
| 92-a | Pages 5 本（コミット `a5c6878`・version `f4acd620`・index `0de7fe1d`・home `d7012132`）：EDLOG `4cb1ed47`（新規・本文の手編集の記録）・ICF80 `592a85ca`（新規・作らなかった理由の記録の口）。どちらも既定 OFF。Worker・管理者画面は不変 | 91-b | **92-a で本番**（GPT #127-QO：Owner の PC だけの CANARY・台帳 2236。戻し 91-b の 3 本。新しい 2 本は残してよい） | 本番 |
| EDLOG | 本文の手動編集の記録（`_narrEdits`） | — | **92-a で本番**（既定 OFF・Owner の QA 物語 1 本だけ・Owner の PC だけ ON。§2.3 EDLOG） | 本番 |
| 93-a ＋ Worker `v46.30-public-mx3c-fc` ＋ 管理者画面 `abd3084d` | MIDICON3 mx3-d：途中から登場したキャラの自動アイコン（§2.9）。Worker（ソース `99edff17`・Cloudflare の版 `968cd4ad`・`midicon`=`mx3c`・`portrait.mx_list`／`mx_ensure`／`mx_claim`・鍵 `midicon1`＝CANARY）。Pages 8 本（コミット `7a27e62`・version `2a746e78`・index `6d3e7cd1`・home `1b29a38c`・MIDICON `97c98380`・av2-portrait `0cc62adf`・fix697 `d8c44cd4`・ADMF1 `93d1ac47`・ICF `e41d22e6`）。管理者画面に `midicon1` の行（まとめて ON に入らない） | 92-a ＋ Worker v46.30 | **93-a で本番**（Worker → 管理者画面 → Pages の順・Owner だけ・GPT #127-QQ・台帳 2237。11-03 16:29 に Owner が `midicon1` を ON。戻し：Pages は 92-a の同名 7 本・Worker `761b4e67`・管理者画面 `53e2d067`） | 本番 |
| 93-b | Pages 4 本（コミット `4a7fd5f`・version `0a38ebfb`・index `b61dbdc7`・home `d84a79a0`・MIDICON `1b7bbfa3`）：mx3-e（話す新しい人物を登録済みの別名と取り違えない・ターン数の食い違いは 1 回だけやり直す・保存の競合のときは作らない）。Worker・管理者画面は不変 | 93-a | **93-b で本番**（11-07・GPT #127-QS・台帳 2241。戻し 93-a の 4 本。本物の絵は未生成＝画像サービスが 400） | 本番 |
| v46.31-diag1 / diag1b | Worker だけ：画像サービスの 4xx の理由をログに取る診断（§2.9 DIAG1）。diag1（Cloudflare の版 `cc85f598`）→ diag1b（ソース `e878ea50`）。Pages なし | v46.30-public-mx3c-fc | **11-07 に本番**（GPT #127-QU・台帳 2242。戻し `99edff17`。11-14 に外す予定） | 本番 |
| admin_b2 | 管理者画面 `5c9c9f28`：機能スイッチの表に対象・Owner の実効・OFF の理由・解除の条件（表示だけ。§2.8） | `abd3084d` | **11-07 に本番**（Owner の許可・台帳 2248。戻し `abd3084d`） | 本番 |
| v46.33b-limit1-fc ＋ 管理者画面 `18594749`（admhub1） | Worker（ソース `c312e86a`）：招待の操作 `acct-entitle-set`（FRIEND1）・画像モデルの切り替え `img-model-set`（IMGMODEL1）・招待は月の上限 > 0 のときだけ（LIMIT1）。管理者画面：「customer の実効」の列・読むだけの 8 行・画像モデルの行・招待のボタン・上限なしで断られた文（§2.8・§2.9） | v46.31-diag1b ＋ 管理者画面 `5c9c9f28` | **11-07 に本番**（GPT #127-QY ①②・台帳 2250。戻し：Worker `e878ea50`・管理者画面 `5c9c9f28`。招待の実行・pro への切り替えは未実施） | 本番 |
| v46.34b-ready1-proarg-fc ＋ 管理者画面 `e5198d0a` | Worker（ソース `dde9c4d8`）：READY1＝`sfl1`・`ld1`・`rc1`・`oma1` を READY に（招待した知人にアカウントごとの行で配れる。READY だけでは開かない）／PROARG1＝FLUX.2-pro の仕様 `upsampleParam:false`。管理者画面：READY の範囲とアカウントごとの規則の表示 | v46.33b ＋ `18594749` | **11-07 に本番**（18:2x JST 頃・sha 読み戻し。戻し：Worker `c312e86a`・管理者画面 `18594749`。pro の 1 枚テスト成功・D1 `img_model` は未設定。お客様の画像は HOLD） | 本番 |
| 93-c | Pages 5 本（コミット `9ef9cd0`・version `6a6575de`・index `90e04c3f`・home `73da3ed3`・MIDICON `0a145cc7`・fix307 `574b4448`）：MIDICON の「中」の候補条件・fix307 名簿の失敗→位置戻し／60 秒後の再試行。Worker・管理者画面は不変 | 93-b | **93-c で本番**（11-07・GPT #127-QY ③・台帳 2250。戻し 93-b の 5 本。本番での確認は未実施） | 本番 |
| 93-d（ISO1e） | Pages（GitHub `f2d24a2`・19:40 JST）：新ファイル ISO1 `v292DfixISO1-local-only-foreign-hide.js`（`0f1ff245`・?cb=`20261107-iso1e`）。端末内だけの他人・持ち主不明の物語をホームで隠し、開く関門で断る（消さない）。index は fix893 の直後、home は iso2 の後・fix889 の前に読む。引き取りの画面は無効（`CLAIM_ON=false`）。home `67a060f4`・index `46a77fe9` | 93-c | **93-d で本番**（11-07。Owner の実機〔PC と iPhone のログイン・35 ターンの同期〕合格。戻し 93-c の home `73da3ed3`・index `90e04c3f`・version `6a6575de`＋ ISO1 のファイルを消す） | 本番 |
| 93-e（OPEN1・READY1 端末側） | Pages（GitHub `c84a35d`・21:53 JST）：home `8847625b`・index `e7874016`・fix527 `8c62d316`・fix870 `f4381e0a`・RC1 `fdeb53e9`・version `9d39d014`。OPEN1＝拒否された物語で `lastOpenedAt` を書かない・「続きから遊ぶ」は見える物語だけ。RC1 の `ownerGate` は owner と beta（active） | 93-d | **93-e で本番**（11-07。戻し 93-d の同名ファイル〔home `67a060f4`・index `46a77fe9`・fix527・fix870・RC1 は前の版〕。WebKit の MIDICON は未再実行） | 本番 |
| npcq1（C2・H2）＝ 93-f | Pages 5 本（GitHub `e66e884`・11-08 00:05 JST・version `0f3ddd57`・index `982883c2`・home `a5cc59fd`〔HOME_BUILT だけ〕・fix414 `371f8ce8`・fix192 `6fbdcca4`。?cb=`20261107-bundle93-f`）：C2＝重傷・強い恐怖でも【制約】を作り、NPC の自発の文から重傷の人を除く。Owner（owner かつ active・匿名でない）のアカウントだけ。kill `v292Dfix414WidenOff`・`v292Dfix192LicOff`。H2（【制約】を最優先）は HOLD で入っていない。93-d は旧案の ISO1c／ISO1d（自動帰属）をやめ、ISO1e（隠すだけ）として出荷した（上の行） | 93-e | **93-f で本番**（C2 は Owner の CANARY で GO。戻し 93-e の同名 5 本〔fix414 `fdad99f5`・fix192 `931d1310`・index `e7874016`・home `8847625b`・version `9d39d014`〕。本物のモデルでの効果は未測定） | 本番 |
| v46.35b-custimg1-fc ＋ 管理者画面 `a2ea35ca`（CUSTIMG1・ADMBULK1） | Worker（ソース `dca5e74e`）：招待した知人（beta・active）のキャラの絵を FLUX.2-pro だけで作る（env `CHR_CUSTOMER_IMG=1` と D1 の `cust_img` の両方が要る。予算の事前確認・1 日 20 枚・imgsafe 必須。§2.9 CUSTIMG1）。管理者画面：READY の機能だけの一括 ON・目次・知人の画像の行・Knowledge の読むだけの行（§2.8） | v46.34b ＋ `e5198d0a` | **11-08 に本番**（GPT #127-RC-1。08:10 に Owner が `cust_img` を ON。知人の試験用アカウントで pro 3 枚・予算 $0.1141／$3。戻し：Worker `dde9c4d8`・管理者画面 `e5198d0a`。ライセンスの確認の結果は未記録） | 本番 |
| v46.35c-hang1-fc（WKRHANG1） | Worker だけ（ソース `7ffa92b1`・r2）：共有の準備の promise を待つのを `CHR_INIT_TIMEOUT_MS`（既定 8000 ms）までにし、超えたら 503 `D1_INIT_TIMEOUT`／`ACCOUNT_STORE_TIMEOUT`（retryable）。ログ `INIT_TIMEOUT`／`INIT_STALE`（§2.5 WKRHANG1） | v46.35b | **11-08 に本番**（GPT #127-RG の条件付き GO。戻し `dca5e74e`。14:2x から v46.35d の土台） | 本番 |
| 93-g（SETUI1・BOOTOFF1・NEWACCT1） | Pages 5 本（GitHub `acb1b87`・version `d43c74b5`・index `2cf16543`・home `fac1e7ab`・fix889 `4221f41d`・新ファイル SETUI1 `3892c38f`。?cb=`20261108-bundle93-g`）：SETUI1＝⚙ 設定の下の固定部分を 1 行に（§2.10）、BOOTOFF1＝「オフライン」の扉で最大 4 回自動で聞き直す（§2.7 fix889）、NEWACCT1＝新しいアカウントのホームの同期の表示（§2.11）。Worker・管理者画面は不変 | 93-f | **93-g で本番**（11-08 昼・GPT #127-RE／#127-RG。戻し 93-f の同名 4 本〔home `a5cc59fd`・index `982883c2`・fix889 `82edc1ad`・version `0f3ddd57`〕＋ SETUI1 のファイルを消す。通しの試験で一過性の失敗が数件〔単独の再実行 24 回は全部合格〕。実機での確認は未記録） | 本番 |
| v46.35d-initslow1-fc（INITSLOW1） | Worker だけ（ソース `9b94f399`・版 `a32dc87b`）：表がそろっていれば準備の DDL を省く（kill env `CHR_D1_FASTCHECK_OFF=1`）、時間切れでも進行中の準備を捨てない（kill env `CHR_INIT_REUSE_OFF=1`）、ログ `D1_INIT`（§2.5 INITSLOW1） | v46.35c | **11-08 14:2x に本番**（Owner の常設の出荷承認。出荷直後の冷えた起動で 503 は 0。戻し `7ffa92b1`。Observability の確認は未記録。17:0x から v46.36 の土台） | 本番 |
| v46.36-wmxreg-fc ＋ 管理者画面 `f2258e33`（W-MXREG・MXALL） | Worker（ソース `d8a6ce55`・版 `7f41d4fe`）：W-MXREG＝`portrait.mx_ensure` に `character_id` を付けると、絵も確定した外見も無い登録 NPC に最初の絵だけ（新しい鍵 `mxreg1`・READY。kill env `CHR_MXREG_OFF=1`。§2.9 W-MXREG）、MXALL＝`midicon1` を CANARY → READY。管理者画面：`mxreg1` の行・`midicon1` の文言・一括 ON の対象を READY の答えから（画像の費用が出る機能も入る。§2.8） | v46.35d ＋ `a2ea35ca` | **11-08 に本番**（Worker 17:0x JST 頃。GPT #127-RI ②＋ Owner の指示。出荷の時点で `midicon1`・`lc1` の行は Owner だけ・`mxreg1` の行は 0 件。端末側は 93-i〔11-09〕で出した〔93-h までの画面からは呼ばれなかった〕。戻し：Worker `9b94f399`・管理者画面 `a2ea35ca`。試験 wmxreg_fx 87/87・ブラウザ 85/0・adm_mxall_fx 14/14 ×2） | 本番 |
| 93-h（HOMERETRY1・OLDMX1・IDSPLIT2・GENDER1） | Pages 10 本（GitHub `33665d1`・version `982f1064`・index `3a740498`・home `bf778277`・MIDICON `d8c971bc`・fix469 `1dc25074`・fix335 `fc96f630`・fix436 `3a5d6160`・fix823 `d1837ab4`・新ファイル IDSPLIT2 `6ba937c2`・新ファイル GENDER1 `3291ae11`。?cb=`20261108-bundle93-h`）：HOMERETRY1＝ホームの同期の一時的な失敗を最大 3 回聞き直す（§2.11）、OLDMX1＝名簿が遅れて届いたターンを 1 回だけ判定し直す（§2.9 MIDICON）、IDSPLIT2＝名乗りで記述的な呼び名を登録 NPC に結び付ける（B だけ・Owner だけの CANARY。§2.3）、GENDER1＝自動で作るキャラの性別を自動で決める（全員。§2.11）。STARTICON は入っていない。Worker・管理者画面は不変 | 93-g | **93-h で本番**（11-08 19:5x JST 頃。本番の読み戻しで 10 本の sha 一致。Owner のホームで HOME_BUILT=`20261108-bundle93-h`・要求 13 本すべて 200。戻し 93-g の同名 8 本〔home `fac1e7ab`・index `2cf16543`・version `d43c74b5`・MIDICON `0a145cc7`・fix469 `d968b745`・fix335 `d70eb54d`・fix436 `ff50b6f7`・fix823 `e86d3a62`〕＋ 新しい 2 本を消す。本物の端末・AI での確認は未実施） | 本番 |
| v46.37-keys-fc ＋ 管理者画面 `752c623a` ＋ 93-i（STARTICON・W-MXREG の端末側・IDSPLIT2 の鍵） | Worker（ソース `2a74a00c`・Cloudflare の版 `5fd0a423`）：v46.36 との差は 4 か所だけ（`CHR_ACCT_FLAG_KEYS` に `starticon1`・`idsplit2`〔8 → 10 個〕・`CHR_ACCT_FLAG_UNSET` で両方 `'off'`・`CHR_FEAT_SCOPE` で両方 READY・`workerBuild`）。管理者画面：`starticon1`（画像の費用あり）・`idsplit2`（費用なし）の行、4 行に「OFF の理由」「ON にする条件」（GPT #127-RK ②）、一括の確認に画像の費用の機能一覧と新たに ON になるアカウント数（うちお客さま数）、アカウントごとの「まとめて ON」も CANARY を含めない（§2.8）。Pages 9 本（GitHub `32d360b`・version `3ec43759`・index `3dbb2d32`・home `39eff416`・av2-data `bc08ce7b`・fix697 `36367c10`・ADMF1 `b35e6324`・IDSPLIT2 `3f75a2f2`・MIDICON `fbdcd485`・新ファイル STARTICON `d2e2bc95`。?cb=`20261108-bundle93-i`）：STARTICON＝新しい物語の主人公＋登録 NPC 最大 3 人に最初の絵（鍵 `starticon1`。§2.9 STARTICON）、W-MXREG の端末側（鍵 `mxreg1`。§2.9 W-MXREG）、IDSPLIT2 の gate を Owner 固定から鍵 `idsplit2` に（§2.3）、ADMF1 が 3 つの鍵を知る（§2.8） | 93-h ＋ v46.36 ＋ `f2258e33` | **11-09 に本番**（本番の読み戻しで Worker・管理者画面・Pages とも一致。Owner のホームで `/api/save`・`/api/auth/me` がすべて 200。Owner でも `idsplit2`=1 の行が無いと IDSPLIT2 は止まる。試験〔Local〕：Worker の新しい fixture 17/0・W-MXREG のブラウザ通し 85/0・STARTICON 12 モード PC 53/0／WebKit 53/0・MIDICON 14 モード PC 87/0／WebKit 87/0・OLDMX1 84/0・IDSPLIT2 unit 141/0／ブラウザ鍵 ON 262/0／お客さまの行 ON 28/0・管理者画面 PC 17/0／iPhone 17/0。未確認：実画像の生成〔W-MXREG・STARTICON〕・お客さまの 1 日の上限と imgsafe の拒否・実機。戻し：Pages 93-h の同名 8 本＋ STARTICON を消す・Worker `d8a6ce55`（版 `7f41d4fe`）・管理者画面 `f2258e33`） | 本番 |
| DP3 | 削除済み・未保存の物語を端末の一覧から外す | — | HOLD | — |
| UX72 単体 / 76-jmp 単体 / 74 単体 | 77-ui-a に合流 | — | — | — |

## 4. まだ整理していないこと（第 2 段で拡充）

- 手書き項目は主要分野の約 110 部品（単独の見出し 47、表・まとめ項目を含む）。残り約 250 部品は付録 A の機械抽出（ファイル名・読込順・sha・スイッチ）のみ。
- 各部品の「書く保存データ」の網羅（localStorage・IndexedDB・sessionStorage のキー一覧）。
- 同じ関数を包む部品どうしの順序と競合（`window.fetch`、`localStorage.setItem`、`Planner.build`、`UI.appendTurn`、`S.save`）の表。
- Worker の op ごとの説明と、client のどの部品が呼ぶか。
- engineMode の既定値の決まり方（コードを読んだだけ・未実測。§2.1 fix192。台帳 2230）。
## 付録A　本番で読み込まれる部品の全一覧（機械抽出）

- 抽出元：本番 `20261031-bundle71-ednedg-a` の `pages_full.zip`（index `9a205026`・home `795af03c`・version `f45d7f71` を照合済み）から機械抽出。**今の本番 `20261101-bundle80-int-a`**（index `0ad99051`・home `7c581720`・version `fad4757c`。読み込まれる 373 本を 2026-11-01 に本番でバイト照合）に合わせ、変わった 5 本（fix893・fix145・SFL1・fix192・fix333）の sha と ?cb= だけを実物で直した。**81-admg-a**（index `140afddc`・home `b9b033e8`・version `ed3b4a64`）で変わった 6 本（RC1・fix334・fix335・LD1・LC1-workbench・ADMF1）の sha と ?cb= も、出荷パッケージの実物で直した（ファイルの増減なし）。**82b-iconux-b**（index `0d974f9c`・home `8dbade5a`・version `0eb99cb4`）で変わった 2 本（av2-portrait・fix63）と、**83-flow-c**（index `a2fdc990`・home `f26d8391`・version `3f90783e`）で変わった 4 本（av2-portrait・fix366・fix379・fix527）の sha と ?cb= も、出荷パッケージの実物で直した。82b で足した 3 本・83 で足した 4 本は末尾の別表（下の「82b・83 で足した部品」）。**86-lc1ox-d**（index `16a28966`・home `da8ae5fe`・version `ccb576f6`）で変わった 7 本（av2-data・fix315・fix492・av2-portrait・LC1 の 2 本・ICONUX2・FLW2。この表の sha と ?cb= は直した）と、足した 1 本（IMGSAFE-core。表の末尾に追加）。**93-a**（index `6d3e7cd1`・home `1b29a38c`・version `2a746e78`）で変わった 4 本（av2-portrait・fix697・ADMF1・ICF。この表の sha と ?cb= は直した）と足した 1 本（MIDICON。表の末尾に追加）。**93-b**（index `b61dbdc7`・home `d84a79a0`・version `0a38ebfb`）で MIDICON が `1b7bbfa3` に、**93-c**（index `90e04c3f`・home `73da3ed3`・version `6a6575de`）で MIDICON が `0a145cc7`、fix307 が `574b4448` になった（fix307 の行は直した）。**93-f**（index `982883c2`・home `a5cc59fd`・version `0f3ddd57`）で fix414 が `371f8ce8`、fix192 が `6fbdcca4` に、**93-g**（index `2cf16543`・home `fac1e7ab`・version `d43c74b5`）で fix889 が `4221f41d` になり（3 本とも行を直した）、SETUI1 `3892c38f` を足した（表の末尾に追加）。sha は出荷パッケージの実物で確かめた値。
- **新しい 4 本は末尾の別表**（下の「80-int-a で足した部品」）。途中に入ったため振り直すとほぼ全行の番号が動くので、上の表の `i` 番号は 71-a の読込順のまま（ずれ方は §0）。
- 判定：`index.html` / `home.html` / `backup.html` の `<script src>` を、HTML コメント `<!-- -->` を除いて読んだ順。ほかに動的読込 1 件（`v292Dfix743-cc2-client.js` を home.html の inline と fix587 が必要時に読む）。
- 「分野」はファイル名からの**自動推定**です。正確な役割は本文の手書き項目か、ファイル冒頭のコメントを見てください（冒頭コメントは古いことがあります）。
- 「?cb=」は index.html（無ければ home.html）に書かれたキャッシュ破棄の値。そのファイルが最後に入れ替わった出荷の**目安**です（正確な履歴ではありません）。
- スイッチは、そのファイルの中に現れる `v292D…Off` / `…On` の localStorage キー（最大 4 件。全件は付録 C）。

| # | 番号 | ファイル | 読込（index順/home順） | sha256先頭 | ?cb= | 分野（推定） | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 1 | vault2-sendgate | `v292Dvault2-sendgate.js` | i1 h1 | `d430be8b` | 20261021-laneE-a | Vault・非表示 | `v292Dvault2GateOff` |
| 2 | vault2-copygate | `v292Dvault2-copygate.js` | i2 h2 | `2ac107be` | 20261011-ab8 | Vault・非表示 | `v292Dfix893Off` `v292Dvault2AB8Off` `v292Dvault2ABOff` `v292Dvault2CopyGateOff` |
| 3 | fix950 | `v292Dfix950-card-delivery-probe.js` | i3 | `7a74b853` | 20261014-f950r2 | 記憶 | `v292Dfix950Off` |
| 4 | fixCP1 | `v292DfixCP1-final-tap.js` | i4 | `22ac1bca` | 20261023-bundle43a-r5 | NPC・キャラ状態 | `v292DfixCP1Off` `v292DfixCP1On` |
| 5 | fixE64 | `v292DfixE64-save-tap.js` | i5 h3 | `104547ff` | 20261024-bundle45-e64-d | NPC・キャラ状態 | `v292DfixE64Off` `v292DfixE64On` |
| 6 | fix953 | `v292Dfix953-card-canary-gate.js` | i6 | `99598aed` | 20261015-bundle1-cardA-f957on | 記憶 | `v292Dfix953Off` `v292Dfix953On` |
| 7 | fix654 | `v292Dfix654-storage-trap.js` | i7 h4 | `9ee9821a` | v292Dfix731 | 保存・同期 | `v292Dfix654Off` |
| 8 | fix893 | `v292Dfix893-account-cookie-shim.js` | i8 h5 | `151c41bf` | 20261031-bundle78-admf-c | 認証・アカウント | `v292Dfix893Off` `v292Dfix897Off` |
| 9 | bav2-beta | `v292Dbav2-beta.js` | i9 h6 | `de95b737` | 20261019-bundle33-b | 認証・アカウント | `v292Dav2On` `v292Dbav2Off` |
| 10 | fix990 | `v292Dfix990-legacy-img-breaker.js` | i10 | `bdb527d2` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix990Off` |
| 11 | fixS1 | `v292DfixS1-entry-notice.js` | i11 h7 | `980196d5` | 20261019-bundle31-a | 認証・アカウント | `v292DfixS1Off` |
| 12 | fix946 | `v292Dfix946-img-isolation.js` | i12 | `54d22bd5` | 20261014-iso1c | アイコン・画像 | `v292Dfix946M3Off` `v292Dfix946Off` |
| 13 | iso2-owner-send-guard | `v292Diso2-owner-send-guard.js` | i13 h8 | `621fc588` | 20261014-iso2b | Vault・非表示 | `v292Dfix946M3Off` `v292Dfix946Off` `v292Diso2Off` |
| 14 | p8d-image-egress-guard | `v292Dp8d-image-egress-guard.js` | i14 | `15e91a71` | 20261009-p8d2 | アイコン・画像 | `v292Dp8dOff` |
| 15 | fix905 | `v292Dfix905-me-owner-gate.js` | i15 | `701becfa` | 20260929-ac17 | 認証・アカウント | `v292Dfix905Off` `v292Dfix905cOff` `v292Dfix917Off` `v292DmeOff` |
| 16 | smrc1-model-registry | `v292Dsmrc1-model-registry.js` | i16 h9 | `52ca67f1` | 20261022-bf1owner | モデル・API | `v292DfixBF1Off` `v292DfixBF1On` `v292DfixCmfOff` |
| 17 | fix781 | `v292Dfix781-unsynced-guard.js` | i17 | `8c861398` | 20261019-bundle31-a | 保存・同期 | `v292Dfix729tOff` `v292Dfix781Off` `v292Dfix781bOff` `v292Dfix781cOff` |
| 18 | fix745 | `v292Dfix745-gws-lock.js` | i18 | `4e422c58` | 20260830-fix756 | 保存・同期 | `v292Dfix743Off` `v292Dfix745Off` `v292Dfix750Off` `v292Dfix750On` |
| 19 | fix746 | `v292Dfix746-slot-isolation-authority.js` | i19 | `2cbe79e5` | 20260829-fix748 | 保存・同期 | `v292Dfix746Off` |
| 20 | fix748 | `v292Dfix748-class-d-admission.js` | i20 | `c9ba87aa` | 20260829-fix748 | 保存・同期 |  |
| 21 | fix698 | `v292Dfix698-mutation-bus.js` | i21 h10 | `406075da` | 20260908-fix837 | 保存・同期 | `v292Dfix698Off` `v292Dfix698On` `v292Dfix837Off` |
| 22 | fix889 | `v292Dfix889-secret-vault.js` | i22 h42 | `4221f41d` | 20261108-bundle93-g | Vault・非表示 | `v292Dfix889Off` `v292Dfix902Off` `v292DfixBOOTOFF1Off` |
| 23 | av2-data | `v292Dav2-data.js` | i23 h20（86 では i25 h20） | `bc08ce7b` | 20261108-bundle93-i | アイコン・画像 | `v292Dav2Off` `v292Dav2On` `v292DbndOff` `v292DknwOff` |
| 24 | fix859 | `v292Dfix859-story-session.js` | i24 h21 | `5bb41ddd` | 20260916-sp2 | Vault・非表示 | `v292Dfix859Off` |
| 25 | fix705 | `v292Dfix705-canonical-read-gate.js` | i25 | `337ec0b1` | 20261019-bundle33-b | 認証・アカウント | `v292Dfix705Off` `v292Dfix705bdOff` `v292Dfix781Off` `v292Dfix837Off` |
| 26 | fix900 | `v292Dfix900-hydrate-ui-gate.js` | i26 | `48c9765f` | 20260928-ac8 | 保存・同期 | `v292Dfix900Off` |
| 27 | fix892 | `v292Dfix892-held-input-guard.js` | i27 | `95996398` | 20261011-s1b | 保存・同期 | `v292Dfix892Off` `v292DfixS1BOff` |
| 28 | fix569 | `v292Dfix569-gc-shadow.js` | i28 h11 | `3d87ed16` | v292Dfix574 | 削除・墓標 | `v292Dfix569Off` `v292Dfix574DenyOff` |
| 29 | fix826 | `v292Dfix826-revision-coherence.js` | i29 h35 | `11f7f450` | 20260907-fix826 | 保存・同期 | `v292Dfix826Off` |
| 30 | fix827 | `v292Dfix827-mat-recovery-ux.js` | i30 | `803d894b` | 20260907-fix827 | 保存・同期 | `v292Dfix827Off` |
| 31 | fix580 | `v292Dfix580-meta-sync-coordinator.js` | i31 | `e9d45e63` | v292Dfix583 | 保存・同期 | `v292Dfix580Off` |
| 32 | fix590 | `v292Dfix590-commit-ledger.js` | i32 h19 | `b6c6d8f7` | 20261006-n1 | 保存・同期 | `v292Dfix590Off` `v292Dfix828Off` `v292DlpsGate1Off` `v292Dlpsid1Off` |
| 33 | fix658 | `v292Dfix658-lineage-shadow.js` | i33 h30 | `7f30422b` | 20260908-fix837 | 保存・同期 | `v292Dfix658Off` `v292Dfix837Off` |
| 34 | fix660 | `v292Dfix660-delete-gateway.js` | i34 h12 | `63ebcb33` | v292Dfix680 | 削除・墓標 | `v292Dfix660Off` |
| 35 | fix246 | `v292Dfix246-store-slot-isolation.js` | i35 | `1304aea2` | 20260901-fix783 | 保存・同期 | `v292Dfix783Off` |
| 36 | fix543 | `v292Dfix543-save-guard.js` | i36 | `28bf9923` | 20260829-fix748 | 保存・同期 | `v292Dfix543Off` |
| 37 | fix802 | `v292Dfix802-refresh-orchestrator.js` | i37 | `092278a1` | 20260930-ac24 | 保存・同期 | `v292Dfix802Off` `v292Dfix802On` `v292Dfix924Off` `v292DmeOff` |
| 38 | fix803 | `v292Dfix803-auto-materialize.js` | i38 | `4b113de5` | 20260930-ac25 | 保存・同期 | `v292Dfix803Off` `v292Dfix803On` `v292Dfix904Off` `v292Dfix924Off` |
| 39 | fix697 | `v292Dfix697-shadow-story-commit.js` | i39 h22 | `36367c10` | 20261108-bundle93-i | 保存・同期 | `v292Dfix697Off` `v292Dfix697pOff` `v292Dfix697q2Off` `v292Dfix697qOff` |
| 40 | fix912 | `v292Dfix912-s2-insession.js` | i40 | `fa9862e1` | 20261022-bundle41-a | 保存・同期 | `v292Dfix911Off` `v292Dfix912Off` `v292Dfix913Off` `v292DfixGC1Off` |
| 41 | fix729 | `v292Dfix729-title-sync.js` | i41 h24 | `95ce2b1d` | 20261010-rs1 | 保存・同期 | `v292Dfix729Off` `v292Dfix729tOff` `v292Dfix842Off` |
| 42 | fix843 | `v292Dfix843-capability-notice.js` | i42 h25 | `d9c8ef62` | 20260909-fix843 | 認証・アカウント | `v292Dfix843Off` |
| 43 | fix846 | `v292Dfix846-access-gate-notice.js` | i43 | `6c2d01ae` | 20260926-sp24 | 認証・アカウント | `v292Dfix846Off` |
| 44 | fix700 | `v292Dfix700-nonauthoritative-mirror.js` | i44 | `cef9e3ac` | 20260916-sp2 | 保存・同期 | `v292Dfix700Off` `v292Dfix700On` `v292Dfix837Off` |
| 45 | fix702 | `v292Dfix702-authority-cutover.js` | i45 | `44e19d8c` | 20261019-bundle31-a | 保存・同期 | `v292Dfix702MaskOff` `v292Dfix702Off` `v292Dfix702On` `v292Dfix837Off` |
| 46 | fix860 | `v292Dfix860-story-unlock-ui.js` | i46 h23 | `6de33b75` | 20260916-sp2 | Vault・非表示 | `v292Dfix860Off` |
| 47 | fix573 | `v292Dfix573-hero-guard.js` | i47 | `c90d8be8` | 20261009-f573b | NPC・キャラ状態 | `v292Dfix573Off` `v292Dfix573bOff` |
| 48 | fix553 | `v292Dfix553-punct-probe.js` | i48 | `1d54eb16` | 20260913-q119b5 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292DQ119PhaseBOn` `v292Dfix553Off` |
| 49 | fix562 | `v292Dfix562-backup-inventory.js` | i49 h13 | `a878f4d0` | v292Dfix735 | 保存・同期 | `v292Dfix562Off` |
| 50 | fix564 | `v292Dfix564-snapshot.js` | i50 h14 | `134543bc` | v292Dfix567 | 保存・同期 | `v292Dfix564Off` |
| 51 | fix726 | `v292Dfix726-export-secret-guard.js` | i51 h15 backup | `fecc81d7` | 20261019-bundle31-a | 保存・同期 | `v292Dfix726Off` |
| 52 | fix721 | `v292Dfix721-safe-restore.js` | i52 h16 | `62e39f67` | 20260829-fix748 | 保存・同期 | `v292Dfix721Off` |
| 53 | fix660 | `v292Dfix660-backup-gc.js` | i53 h17 | `ea2ac157` | v292Dfix680 | 削除・墓標 | `v292Dfix660Off` |
| 54 | fix555 | `v292Dfix555-punct-repair.js` | i54 | `b3aa85c8` | v292Dfix560 | 文章品質・プロンプト | `v292Dfix555Off` |
| 55 | fix499 | `v292Dfix499-freeget-style-canon.js` | i55 | `d63bcfc4` | v292Dfix499 | 認証・アカウント | `v292Dfix499Off` |
| 56 | fix484 | `v292Dfix484-style-canon.js` | i56 | `726c2038` | 20261019-bundle31-a | 認証・アカウント | `v292Dfix484Off` `v292Dfix980Off` |
| 57 | fix247 | `v292Dfix247-proxy.js` | i57 h43 | `06dd6d0f` | 20260909-fix841 | 認証・アカウント | `v292Dfix837Off` `v292Dfix841Off` |
| 58 | fix247b | `v292Dfix247b-proxy-admin.js` | i58 | `3bdbfbac` | v292Dfix247b | 認証・アカウント | `v292Dfix247bOff` |
| 59 | fix600 | `v292Dfix600-new-story-guard.js` | i59 | `d874abc9` | v292Dfix601 | 保存・同期 | `v292Dfix600Off` |
| 60 | fix527 | `v292Dfix527-story-url.js` | i60 | `8c62d316` | 20261107-open1 | 保存・同期 | `v292Dfix527NoopHomeSaveOff` `v292Dfix527Off` `v292Dfix588Off` `v292DfixSN1aOff` |
| 61 | fix659 | `v292Dfix659-fork-choice.js` | i61 | `d6e39622` | v292Dfix680 | 保存・同期 | `v292Dfix659Off` |
| 62 | features | `features.js` | i62 | `143763f8` | 20261025-bundle55-sfl-a | 本体（ゲーム中核） | `v292Dfix190Off` `v292Dfix205gOff` `v292Dfix748SaveRefuseOff` `v292Dfix834Off` |
| 63 | fixP0 | `v292DfixP0-scenario-blocker.js` | i63 | `7c6d79f0` | v292Dfix680 | シナリオ・ホーム |  |
| 64 | fix135 | `v292Dfix135-longmem.js` | i64 | `1eb21253` | 20260927-ac3 | 記憶 | `v292Dfix894Off` |
| 65 | fix138 | `v292Dfix138-continue.js` | i65 | `db8f5e85` | 20260929-ac18 | 記憶 | `v292Drp1Off` |
| 66 | fix145 | `v292Dfix145-charlist.js` | i66 | `e7b06fd1` | 20261101-bundle79-npres73d4b-on78c | NPC・キャラ状態 | `v292Dfix410Off` `v292Dfix487ListOff` `v292Dfix529Off` `v292Dfix773Off` |
| 67 | fix777 | `v292Dfix777-icon-lightbox.js` | i67 | `19adb4d6` | 20261021-laneE-a | アイコン・画像 | `v292Dfix777Off` `v292DfixLE2Off` |
| 68 | fixLE3 | `v292DfixLE3-iphone-nav.js` | i68 | `d4a5a7f5` | 20261021-laneE-a | UI・画面 | `v292DfixLE3Off` |
| 69 | fixLE4 | `v292DfixLE4-relock-follow.js` | i69 h50 | `a67a87f4` | 20261022-bundle40-b | Vault・非表示 | `v292DfixLE4Off` |
| 70 | fixIS1 | `v292DfixIS1-icon-size.js` | i70 | `dc33c66f` | 20261022-bundle41-a | アイコン・画像 | `v292DfixIS1Off` `v292DfixLE2Off` |
| 71 | fix53 | `v292Dfix53-readability-v2.js` | i71 | `75e08f3a` | v292Dfix53 | 文章品質・プロンプト |  |
| 72 | fix54 | `v292Dfix54-gender-pronoun.js` | i72 | `c17c4838` | 20260901-fix783 | NPC・キャラ状態 | `v292Dfix783Off` |
| 73 | fix55 | `v292Dfix55-gm-mode.js` | i73 | `f465582c` | v292Dfix55c | 文章品質・プロンプト |  |
| 74 | fix56 | `v292Dfix56-conversation-log-fix.js` | i74 | `551d0c71` | v292Dfix200 | 話者・会話ログ |  |
| 75 | fix57 | `v292Dfix57-script-style-dialogue.js` | i75 | `bfea0dfd` | v292Dfix57 | 話者・会話ログ |  |
| 76 | fix58 | `v292Dfix58-prompt-rebuild.js` | i76 | `dbe6a382` | 20260829-fix748 | 文章品質・プロンプト |  |
| 77 | fix60 | `v292Dfix60-display-pipeline.js` | i77 | `fc5144f4` | v292Dfix60 | アイコン・画像 |  |
| 78 | fix59 | `v292Dfix59-hybrid-extractor.js` | i78 | `12c56db5` | v292Dfix59 | NPC・キャラ状態 |  |
| 79 | fix61 | `v292Dfix61-alpha-strip-protect.js` | i79 | `7cbb4781` | 20260829-fix748 | 文章品質・プロンプト |  |
| 80 | fix63 | `v292Dfix63-avatar-style.js` | i80 | `77b3d9b2` | 20261101-bundle82-iconux-b | アイコン・画像 | `v292Dfix979Off` |
| 81 | fix65 | `v292Dfix65-dialogue-rescue.js` | i81 | `a616558a` | v292Dfix65b | 話者・会話ログ |  |
| 82 | fix74 | `v292Dfix74-ext-dedup-and-say.js` | i82 | `a7131790` | 20260912-q119s4 | 話者・会話ログ | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` |
| 83 | fixSFL1 | `v292DfixSFL1-speaker-correct.js` | i83 | `92fa4e4f` | 20261031-bundle78-admf-c | 話者・会話ログ | `v292Dfix781Off` `v292DfixCP1Off` `v292DfixSFL1Off` `v292DfixSFL1On` |
| 84 | fix66 | `v292Dfix66-renderhook-repair.js` | i84 | `9dda0a16` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix455Off` `v292Dfix457Off` `v292Dfix783Off` `v292Dfix808Off` |
| 85 | fixEDIT01 | `v292DfixEDIT01-edit-reconcile.js` | i85 | `5a41e946` | 20261031-bundle71-ednedg-a | 話者・会話ログ | `v292DfixEDGOff` `v292DfixEdit01Off` |
| 86 | fixSFLTap | `v292DfixSFLTap-card-correct.js` | i86 | `197a15c6` | 20261031-bundle65-sfltap-b | 話者・会話ログ | `v292Dfix457Off` `v292DfixSFLTapOff` |
| 87 | fix68 | `v292Dfix68-cliche-sentence-aware.js` | i87 | `0b3e2a28` | v292Dfix68 | 文章品質・プロンプト |  |
| 88 | fix69 | `v292Dfix69-literary-prose.js` | i88 | `35c17050` | v292Dfix69 | 文章品質・プロンプト |  |
| 89 | fix71 | `v292Dfix71-anti-recap.js` | i89 | `f44a7f21` | 20261025-bundle48-qa-a | 文章品質・プロンプト | `v292Dfix71DlgOff` `v292Dfix71DlgOn` `v292DfixCL1gOff` |
| 90 | fix72 | `v292Dfix72-within-turn-dedup.js` | i90 | `a47966c7` | 20261009-bh1 | 文章品質・プロンプト | `v292DfixCL1hOff` |
| 91 | fix75 | `v292Dfix75-history-dedup.js` | i91 | `4ae2143f` | v292Dfix75 | 文章品質・プロンプト |  |
| 92 | fix76 | `v292Dfix76-human-foundation.js` | i92 | `e60a34f5` | v292Dfix76b | NPC・キャラ状態 |  |
| 93 | fix77 | `v292Dfix77-state-memory.js` | i93 | `d53f65aa` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix532Off` `v292Dfix901Off` `v292Dfix938Off` `v292Dfix961Off` |
| 94 | fix78 | `v292Dfix78-tag-case-normalize.js` | i94 | `bd33ee86` | 20260912-q119s4 | 話者・会話ログ | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` |
| 95 | fix79 | `v292Dfix79-momentum-anchor.js` | i95 | `78d3c840` | v292Dfix79 | NPC・キャラ状態 |  |
| 96 | fixBF1 | `v292DfixBF1-reasoning-fallback.js` | i96 | `85c75741` | 20261022-bf1owner | モデル・API | `v292DfixBF1Off` `v292DfixBF1On` |
| 97 | fix80 | `v292Dfix80-gen-gate-retry.js` | i97 | `6b90a1f2` | 20260929-ac23 | モデル・API | `v292Dfix504Off` `v292Dfix923Off` |
| 98 | fix82 | `v292Dfix82-injury-reaction-root.js` | i98 | `cf4e514f` | v292Dfix82 | NPC・キャラ状態 |  |
| 99 | fix83 | `v292Dfix83-name-truncation-repair.js` | i99 | `109f7ff6` | v292Dfix83 | NPC・キャラ状態 |  |
| 100 | fix84 | `v292Dfix84-sampling.js` | i100 | `1e09b21d` | v292Dfix482 | 文章品質・プロンプト |  |
| 101 | fix85 | `v292Dfix85-reaction-spectrum.js` | i101 | `0f0ee85b` | v292Dfix85 | NPC・キャラ状態 |  |
| 102 | fix81 | `v292Dfix81-strip-incomplete-tags.js` | i102 | `f58f2480` | v292Dfix81 | 文章品質・プロンプト |  |
| 103 | fix90 | `v292Dfix90-extension-dedup.js` | i103 | `4434f189` | v292Dfix90 | 文章品質・プロンプト |  |
| 104 | fix796 | `v292Dfix796-memory-retrieve.js` | i104 | `c7b43471` | 20261021-bundle38-b | 記憶 | `v292Dfix796BackfillOff` `v292Dfix796DedupeOff` `v292Dfix796F1On` `v292Dfix796HonOn` |
| 105 | fix192 | `v292Dfix192-newengine.js` | i105 | `6fbdcca4` | 20261107-bundle93-f | 文章品質・プロンプト（生成の中心） | `v292Dfix425Off` `v292Dfix796HonOn` `v292Dfix812Off` `v292Dfix813Off` |
| 106 | fix197 | `v292Dfix197-avatar-key.js` | i106 | `ef0ec3e6` | 20261019-bundle31-a | アイコン・画像 | `v292DavProvOff` `v292Dfix403Off` `v292Dfix403cOff` `v292Dfix411Off` |
| 107 | fix221 | `v292Dfix221-recent-dialogues-authoritative.js` | i107 | `9def1578` | v292Dfix221 | 話者・会話ログ |  |
| 108 | fix226 | `v292Dfix226-engine-unify.js` | i108 | `d966519b` | v292Dfix226 | 文章品質・プロンプト |  |
| 109 | fix228 | `v292Dfix228-slot-generations.js` | i109 | `392213e5` | 20260901-fix783 | 保存・同期 | `v292Dfix651SlotBackupGuardOff` `v292Dfix783Off` |
| 110 | fix237 | `v292Dfix237-avatar-carrier-guard.js` | i110 | `94dbe30c` | 20261002-ac36 | アイコン・画像 |  |
| 111 | fix239 | `v292Dfix239-noncast-avatar-race.js` | i111 | `c55ec8b1` | v292Dfix239 | アイコン・画像 |  |
| 112 | fix243 | `v292Dfix243-topbar-collapse.js` | i112 | `f4b82fc3` | 20260916ux2 | 文章品質・プロンプト |  |
| 113 | fix244 | `v292Dfix244-psych-merge.js` | i113 | `4d3cebae` | 20261020-bundle35-b | NPC・キャラ状態 | `v292Dfix244F3Off` |
| 114 | fix256 | `v292Dfix256-model-select.js` | i114 | `6b5a0306` | 20261021-laneE-a | モデル・API |  |
| 115 | fix270 | `v292Dfix270-topbar-ui.js` | i115 | `76c1bfca` | 20260916-sp3 | UI・画面 |  |
| 116 | fix274 | `v292Dfix274-build-flag-guard.js` | i116 | `388ea580` | v292Dfix274 | 保存・同期 |  |
| 117 | fix275 | `v292Dfix275-settings-tabs.js` | i117 | `0691b349` | v292Dfix275 | UI・画面 |  |
| 118 | fix854 | `v292Dfix854-firstrun-key-tab.js` | i118 | `ab98b76f` | 20260916-ux4 | UI・画面 | `v292Dfix854Off` |
| 119 | fix277 | `v292Dfix277-quasi-pack.js` | i119 | `581842fc` | 20261025-bundle58-npcp1-b | NPC・キャラ状態 | `v292DQ119PageCanaryOff` `v292Dfix277CaseViewOff` `v292Dfix277rOff` `v292Dfix528Off` |
| 120 | fix288 | `v292Dfix288-tooltips.js` | i120 | `c99a08cb` | 20260913-dsmrc1 | UI・画面 |  |
| 121 | fix290 | `v292Dfix290-mobile.js` | i121 | `79f7e619` | v292Dfix290 | UI・画面 |  |
| 122 | fix291 | `v292Dfix291-saveexport.js` | i122 | `3ece608e` | v292Dfix721 | 保存・同期 |  |
| 123 | fix292 | `v292Dfix292-health.js` | i123 | `330545d5` | v292Dfix398 | UI・画面 |  |
| 124 | fix295 | `v292Dfix295-convlog-stability.js` | i124 | `993f7976` | v292Dfix295e | 話者・会話ログ | `v292ConvStabilityOff` `v292Dfix295eOff` |
| 125 | fix297 | `v292Dfix297-ai-instructions.js` | i125 | `9de10919` | 20260901-fix783 | 文章品質・プロンプト | `v292Dfix783Off` |
| 126 | fix300 | `v292Dfix300-readability.js` | i126 | `ac3a0993` | v292Dfix419c | 文章品質・プロンプト | `v292Dfix300Off` |
| 127 | fix301 | `v292Dfix301-longmem-stale-guard.js` | i127 | `a740bd94` | v292Dfix301 | 記憶 | `v292Dfix301Off` |
| 128 | fix302 | `v292Dfix302-undo-state-rollback.js` | i128 | `75fd08d4` | 20261009-bh1 | NPC・キャラ状態 | `v292Dfix302Off` `v292Dfix926Off` |
| 129 | fix732 | `v292Dfix732-session-turn-scope.js` | i129 | `13991982` | v292Dfix732 | （未分類） |  |
| 130 | fix303 | `v292Dfix303-speaker-backref.js` | i130 | `0850a3af` | 20260829-fix748 | 話者・会話ログ | `v292Dfix303Off` |
| 131 | fix304 | `v292Dfix304-emotion.js` | i131 | `18b944a7` | v292Dfix419c | NPC・キャラ状態 | `v292Dfix304Off` |
| 132 | fix305 | `v292Dfix305-trigger-states.js` | i132 | `1e1d23c9` | v292Dfix305 | NPC・キャラ状態 | `v292Dfix305Off` |
| 133 | fix306 | `v292Dfix306-npc-liveliness.js` | i133 | `f60ae3fb` | v292Dfix738 | NPC・キャラ状態 | `v292Dfix306Off` |
| 134 | fix764 | `v292Dfix764-name-variant-fold.js` | i134 | `78be3ba8` | v292Dfix764 | NPC・キャラ状態 | `v292Dfix764Off` |
| 135 | fix830 | `v292Dfix830-entity-match-resolver.js` | i135 | `34dd81e4` | 20260907-fix832 | NPC・キャラ状態 | `v292Dfix764Off` `v292Dfix830Off` |
| 136 | fix766 | `v292Dfix766-canonical-appearance.js` | i136 | `960c7d11` | 20261019-bundle31-a | 認証・アカウント | `v292Dfix766Off` `v292Dfix766On` `v292Dfix776Off` `v292Dfix778Off` |
| 137 | fix983 | `v292Dfix983-appearance-dict.js` | i137 | `e63a1b85` | 20261019-bundle31-a | アイコン・画像 |  |
| 138 | fix767 | `v292Dfix767-icon-recipe-adapter.js` | i138 | `05be1ba0` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix769Off` `v292Dfix770Off` `v292Dfix773Off` `v292Dfix774Off` |
| 139 | fixRC | `v292DfixRC-regen-candidate.js` | i139 | `ee717776` | 20261019-bundle31-a | アイコン・画像 | `v292DfixRCOff` |
| 140 | fix307 | `v292Dfix307-npc-roster.js` | i140 | `574b4448` | 20261103-bundle93-c | NPC・キャラ状態 | `v292Dfix307Off` `v292Dfix307fOff` |
| 141 | fixSC1 | `v292DfixSC1-sidecar-eligibility.js` | i141 | `b1b3b546` | 20261009-bh1 | （未分類） | `v292DfixSC1Off` `v292DfixSC1On` |
| 142 | fixGQ4 | `v292DfixGQ4-summary-request.js` | i142 | `d98338e2` | 20261010-gq1 | 記憶 | `v292DfixGQ4Off` `v292DfixGQ4On` |
| 143 | fixCTX | `v292DfixCTX-context-restore.js` | i143 | `80e1aec4` | 20261010-gq1 | 記憶 | `v292DfixCTXOff` `v292DfixCTXOn` |
| 144 | fixRC1 | `v292DfixRC1-recall-inputs.js` | i144 | `fdeb53e9` | 20261107-ready1 | 記憶 | `v292DfixRC1Off` `v292DfixRC1On` |
| 145 | fixCP1 | `v292DfixCP1-scene-presence.js` | i145 | `5ef63c79` | 20261025-bundle47-cp1r-c | NPC・キャラ状態 | `v292DfixCP1Off` `v292DfixCP1On` |
| 146 | fix308 | `v292Dfix308-creepy-toggle.js` | i146 | `c198ae9f` | v292Dfix308 | 文章品質・プロンプト | `v292Dfix308Disable` |
| 147 | fix309 | `v292Dfix309-progression.js` | i147 | `dd7bc61c` | v292Dfix419c | NPC・キャラ状態 | `v292Dfix309Off` |
| 148 | fix579 | `v292Dfix579-tombstone-schema.js` | i148 h18 | `fcdbf7df` | v292Dfix588 | 削除・墓標 |  |
| 149 | fix587 | `v292Dfix587-story-lifecycle.js` | i149 h26 | `34b53284` | 20261020-bundle35-b | 削除・墓標 | `v292Dfix587Off` `v292Dfix708Off` `v292DfixDP1Off` |
| 150 | fix602 | `v292Dfix602-tombstone-write-shadow.js` | i150 h28 | `625d0bf2` | v292Dfix602 | 削除・墓標 | `v292Dfix602ShadowOff` |
| 151 | fix577 | `v292Dfix577-delete-entry-guard.js` | i151 | `08fdce73` | v292Dfix577 | 削除・墓標 | `v292Dfix577Off` |
| 152 | fix310 | `v292Dfix310-gallery.js` | i152 | `85178fee` | 20261009-p8b2 | アイコン・画像 | `v292DcoverExtOn` `v292Dfix310Off` |
| 153 | fix933 | `v292Dfix933-beta-delete-off.js` | i153 h27 | `844607ec` | 20261019-bundle31-a | 削除・墓標 | `v292Dfix933Off` |
| 154 | fixDL2 | `v292DfixDL2-server-delete.js` | i154 h32 | `34507755` | 20261020-bundle35-b | 削除・墓標 | `v292DfixDL2Off` `v292DfixDP3On` `v292DfixDP4Off` |
| 155 | fix313 | `v292Dfix313-story-cards.js` | i155 | `1a5ff334` | 20261019-bundle31-a | 記憶 | `v292Dfix313Off` `v292Dfix951Off` `v292Dfix954Off` `v292Dfix954On` |
| 156 | fix314 | `v292Dfix314-memory.js` | i156 | `977ccdf0` | 20260829-fix748 | 記憶 | `v292Dfix314Off` |
| 157 | fix315 | `v292Dfix315-see.js` | i157（86 では i160） | `4864a7ee` | 20261103-bundle91-b | アイコン・画像 | `v292Dfix315On`（91-b から効かない）`v292DfixIMGSAFEOff` |
| 158 | fix316 | `v292Dfix316-gallery-search.js` | i158 | `8010df68` | v292Dfix316 | アイコン・画像 | `v292Dfix316Off` |
| 159 | fix317 | `v292Dfix317-slot-leak.js` | i159 | `50557366` | 20260901-fix783 | 保存・同期 | `v292Dfix317Off` `v292Dfix783Off` |
| 160 | fix318 | `v292Dfix318-perslot-len-creepy.js` | i160 | `5fcd8478` | 20260901-fix783 | 保存・同期 | `v292Dfix318Off` `v292Dfix783Off` |
| 161 | fix322 | `v292Dfix322-state-line-strip.js` | i161 | `d1c1d809` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix322Off` |
| 162 | fix323 | `v292Dfix323-boundary-guards.js` | i162 | `0e868be8` | v292Dfix419c | 文章品質・プロンプト | `v292Dfix323Off` |
| 163 | fix324 | `v292Dfix324-show-dont-tell.js` | i163 | `cb420c8d` | v292Dfix419c | 文章品質・プロンプト | `v292Dfix324Off` |
| 164 | fix325 | `v292Dfix325-state-rederive.js` | i164 | `c6841692` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix325Off` `v292Dfix894Off` |
| 165 | fix326 | `v292Dfix326-story-scroll.js` | i165 | `ae9e2108` | v292Dfix326 | UI・画面 | `v292Dfix326Off` |
| 166 | fix327 | `v292Dfix327-turn-counter.js` | i166 | `f6c82db7` | v292Dfix327 | UI・画面 | `v292Dfix327Off` |
| 167 | fix328 | `v292Dfix328-google-login.js` | i167 | `378383bd` | 20260908-fix837 | 認証・アカウント | `v292Dfix831Off` `v292Dfix835Off` `v292Dfix837Off` |
| 168 | fix298 | `v292Dfix298-roster.js` | i168 | `e615c276` | 20261001-ac34 | NPC・キャラ状態 | `v292Dfix298Off` `v292Dfix783Off` `v292DlbRosterAuthOff` |
| 169 | fix330 | `v292Dfix330-somatic-guard.js` | i169 | `7222de72` | v292Dfix419c | NPC・キャラ状態 | `v292Dfix330Off` |
| 170 | fix332 | `v292Dfix332-uifold.js` | i170 | `d4eed8fa` | v292Dfix332 | UI・画面 |  |
| 171 | fix333 | `v292Dfix333-actor-reality.js` | i171 | `7a4f567a` | 20261101-bundle79-npres73d4b-on78c | NPC・キャラ状態 | `v292Dfix333HeroLabelOff` `v292Dfix333Off` `v292Dfix333SelOnceOff` `v292Dfix927Off` |
| 172 | fix334 | `v292Dfix334-entryhub.js` | i172 | `c98c2c6c` | 20261101-bundle81-admg-a | シナリオ・ホーム | `v292DfixB37eOff` |
| 173 | fix880 | `v292Dfix880-settings-fold.js` | i173 | `d6a1b061` | 20260919-sp10a | UI・画面 | `v292Dfix880Off` |
| 174 | fix881 | `v292Dfix881-public-strings.js` | i174 | `7f0e75f1` | 20260921-sp18r2 | 認証・アカウント | `v292Dfix881Off` |
| 175 | fix884 | `v292Dfix884-byok-dev-only.js` | i175 | `f5cfe849` | 20260919-sp14 | 認証・アカウント | `v292Dfix884Off` |
| 176 | fix335 | `v292Dfix335-omakase.js` | i176 h37 | `fc96f630` | 20261108-bundle93-h | シナリオ・ホーム |  |
| 177 | fix351 | `v292Dfix351-settings-draft.js` | i177 | `ba802aca` | 20261008-int1 | UI・画面 | `v292Dfix351Off` `v292Dfix351dOff` |
| 178 | fix352 | `v292Dfix352-hero-placeholder.js` | i178 | `2f89677d` | v292Dfix352 | NPC・キャラ状態 | `v292Dfix352Off` |
| 179 | fix353 | `v292Dfix353-omakase-fill-rest.js` | i179 | `a6e99b70` | v292Dfix353 | シナリオ・ホーム | `v292Dfix353Off` |
| 180 | fix354 | `v292Dfix354-default-model.js` | i180 | `d20657ac` | 20260913-dsmrc1 | モデル・API | `v292Dfix354Off` |
| 181 | fix355 | `v292Dfix355-selector-cleanup.js` | i181 | `7fa6a56c` | 20260829-fix748 | UI・画面 | `v292Dfix355Off` |
| 182 | fix359 | `v292Dfix359-gender-avatar.js` | i182 | `64ef641c` | v292Dfix359 | アイコン・画像 | `v292Dfix359Off` |
| 183 | fix360 | `v292Dfix360-seed-ux.js` | i183 | `a0355998` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix360Off` |
| 184 | fix361 | `v292Dfix361-phaseb-preview.js` | i184 | `0ad7e105` | v292Dfix361 | シナリオ・ホーム |  |
| 185 | fix363 | `v292Dfix363-player-seed.js` | i185 | `648c3a3e` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix363Off` |
| 186 | fix364 | `v292Dfix364-reset-help.js` | i186 | `593e0057` | v292Dfix365 | UI・画面 | `v292Dfix364Off` |
| 187 | fix366 | `v292Dfix366-cast-gender.js` | i187 | `438e5a4d` | 20261101-bundle83-flow-c | NPC・キャラ状態 | `v292Dfix366Off` |
| 188 | fix370 | `v292Dfix370-model-guard.js` | i188 | `210a5e98` | 20260913-dsmrc1 | UI・画面 | `v292Dfix370Off` |
| 189 | fix371 | `v292Dfix371-reset-dialog-text.js` | i189 | `5720d35d` | v292Dfix371 | 文章品質・プロンプト | `v292Dfix371Off` |
| 190 | fix372 | `v292Dfix372-gender-radio-guard.js` | i190 | `867ce977` | v292Dfix372 | NPC・キャラ状態 | `v292Dfix372Off` |
| 191 | fix374 | `v292Dfix374-default-style-guard.js` | i191 | `635abe5a` | 20260901-fix783 | UI・画面 | `v292Dfix374Off` `v292Dfix783Off` |
| 192 | fix376 | `v292Dfix376-speaker-guard.js` | i192 | `c282fa65` | 20260902-fix800 | 話者・会話ログ | `v292Dfix376Off` `v292Dfix469Off` |
| 193 | fix377 | `v292Dfix377-voice-anchor.js` | i193 | `442efa8b` | 20261010-gq1 | 話者・会話ログ | `v292Dfix377COff` `v292Dfix377Off` `v292DfixGQ1aOff` `v292DfixGQ1bOff` |
| 194 | fix378 | `v292Dfix378-species-judge.js` | i194 | `c0e2fa1f` | v292Dfix378 | NPC・キャラ状態 | `v292Dfix378Off` |
| 195 | fix379 | `v292Dfix379-wrap-keeper.js` | i195 | `6f406375` | 20261101-bundle83-flow-c | 文章品質・プロンプト | `v292Dfix363Off` `v292Dfix366Off` `v292Dfix376Off` `v292Dfix377Off` |
| 196 | fix822 | `v292Dfix822-start-rules-block.js` | i196 | `45f8e559` | 20260906-fix822 | 文章品質・プロンプト | `v292Dfix822Off` |
| 197 | fix381 | `v292Dfix381-reaction.js` | i197 | `eeaf39ce` | v292Dfix381 | NPC・キャラ状態 | `v292Dfix381Off` |
| 198 | fix382 | `v292Dfix382-auto-dial.js` | i198 | `329ba7a6` | 20260901-fix783 | 文章品質・プロンプト | `v292Dfix382Off` `v292Dfix783Off` |
| 199 | fix383 | `v292Dfix383-vocative-fix.js` | i199 | `b8ed502d` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix383Off` `v292Dfix972Off` |
| 200 | fix384 | `v292Dfix384-auto-restore.js` | i200 | `e38b334e` | 20260901-fix783 | 保存・同期 | `v292Dfix382Off` `v292Dfix384Off` `v292Dfix783Off` |
| 201 | fix385 | `v292Dfix385-voice-correction.js` | i201 | `a8bf77a1` | v292Dfix385 | 話者・会話ログ | `v292Dfix385Off` |
| 202 | fix386 | `v292Dfix386-relation-gauge.js` | i202 | `caee1459` | v292Dfix386b | NPC・キャラ状態 | `v292Dfix386HeroOff` `v292Dfix386Off` |
| 203 | fix387 | `v292Dfix387-confession.js` | i203 | `a7c89168` | v292Dfix387 | NPC・キャラ状態 | `v292Dfix387Off` |
| 204 | fix388 | `v292Dfix388-first-person-speaker.js` | i204 | `f1b8de3f` | 20260829-fix748 | 話者・会話ログ | `v292Dfix388Off` |
| 205 | fix389 | `v292Dfix389-npc-relations.js` | i205 | `454756f8` | v292Dfix389 | NPC・キャラ状態 | `v292Dfix389Off` |
| 206 | fix390 | `v292Dfix390-speaker-fullname.js` | i206 | `5c5a6623` | 20260829-fix748 | 話者・会話ログ | `v292Dfix390Off` |
| 207 | fix393 | `v292Dfix393-restyle-unify.js` | i207 | `22a0d356` | 20261021-laneE-a | アイコン・画像 | `v292Dfix393Off` |
| 208 | fix395 | `v292Dfix395-default-darkanime.js` | i208 | `ffd1364b` | 20260901-fix783 | アイコン・画像 | `v292Dfix395Off` `v292Dfix783Off` |
| 209 | fix398 | `v292Dfix398-scream-attribution.js` | i209 | `dd510800` | v292Dfix496 | 話者・会話ログ | `v292Dfix398Off` |
| 210 | fix399 | `v292Dfix399-cloudsync.js` | i210 | `fa028ed2` | 20261014-iso2b | 保存・同期 | `v292DbbhOff` `v292Dfix399AutoOff` `v292Dfix399Off` `v292Dfix399SelfHealOn` |
| 211 | fix400 | `v292Dfix400-img-url.js` | i211 | `442fe5d2` | 20261014-iso1c | アイコン・画像 | `v292Dfix400Off` `v292Dfix837Off` |
| 212 | fix336 | `v292Dfix336-proxy-sentinel-fix.js` | i212 | `3b41d7ad` | 20261006-a0 | 認証・アカウント | `v292Dfix336MemOnlyOff` `v292Dfix336Off` `v292Dfix837Off` `v292Dfix841Off` |
| 213 | fix338 | `v292Dfix338-artstyle.js` | i213 | `d16e7eef` | 20260829-fix748 | アイコン・画像 | `v292Dfix338Off` `v292Dfix396Off` `v292Dfix429Off` `v292Dfix461Off` |
| 214 | fix346 | `v292Dfix346-idb-avatars.js` | i214 | `4f6ac713` | 20261014-iso1c | アイコン・画像 | `v292Dfix346Off` |
| 215 | fix356 | `v292Dfix356-avatar-eager.js` | i215 | `c89ecbad` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix356EagerOff` `v292Dfix450Off` `v292Dfix977Off` |
| 216 | fix402 | `v292Dfix402-invisible-sync.js` | i216 | `0771aa4a` | 20261019-bundle31-a | 保存・同期 | `v292DbbhOff` `v292Dfix399AutoOff` `v292Dfix402Off` `v292Dfix402On` |
| 217 | fix405 | `v292Dfix405-state-freshness.js` | i217 | `e0e7e38b` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix405D1SuppressOff` `v292Dfix405Off` `v292Dfix405SlimOff` `v292Dfix962Off` |
| 218 | fix406 | `v292Dfix406-automode.js` | i218 | `4a563296` | v292Dfix417d | UI・画面 | `v292Dfix406Off` |
| 219 | fix407 | `v292Dfix407-load-noconfirm.js` | i219 | `9287401c` | v292Dfix407 | UI・画面 | `v292Dfix407Off` |
| 220 | fix409 | `v292Dfix409-handle-merge.js` | i220 | `297d7f30` | 20260901-fix784 | 保存・同期 | `v292Dfix409Off` `v292Dfix409bOff` `v292Dfix409cOff` `v292Dfix783Off` |
| 221 | fix414 | `v292Dfix414-constraint-engine.js` | i221 | `371f8ce8` | 20261107-bundle93-f | NPC・キャラ状態 | `v292Dfix414Off` `v292Dfix414WidenOff` |
| 222 | fix77X | `v292Dfix77X-clear.js` | i222 | `71551453` | 20261019-bundle31-a | NPC・キャラ状態 |  |
| 223 | fix415 | `v292Dfix415-opening-mask.js` | i223 | `93e0d740` | v292Dfix415b | 文章品質・プロンプト | `v292Dfix415Off` |
| 224 | fix416 | `v292Dfix416-pain-style.js` | i224 | `7e4a98de` | v292Dfix428 | NPC・キャラ状態 | `v292Dfix416Off` `v292Dfix425Off` |
| 225 | fix417 | `v292Dfix417-reaction-unified.js` | i225 | `84166817` | v292Dfix426 | NPC・キャラ状態 | `v292Dfix379V4Off` `v292Dfix417Off` `v292Dfix425Off` |
| 226 | fix418 | `v292Dfix418-genkeep.js` | i226 | `a9c5e3a0` | v292Dfix418 | 文章品質・プロンプト | `v292Dfix418Off` |
| 227 | fix420 | `v292Dfix420-stylelora.js` | i227 | `510ea41b` | v292Dfix420v2 | アイコン・画像 | `v292Dfix420Off` |
| 228 | fix474 | `v292Dfix474-candidate.js` | i228 | `d68cac44` | 20261002-ac36 | アイコン・画像 |  |
| 229 | fix475 | `v292Dfix475-recipe-v3.js` | i229 | `f4cf5808` | v292Dfix486 | アイコン・画像 | `v292Dfix471Off` `v292Dfix471On` `v292Dfix475Off` |
| 230 | fix477 | `v292Dfix477-autocomplete-off.js` | i230 | `6ec39ad3` | v292Dfix477 | UI・画面 | `v292Dfix477Off` |
| 231 | fix478 | `v292Dfix478-imggen-retry.js` | i231 | `a51c89af` | v292Dfix478b | アイコン・画像 | `v292Dfix478Off` |
| 232 | fix491 | `v292Dfix491-imggen-freefallback.js` | i232 | `b0cf90ad` | v292Dfix491v4 | アイコン・画像 | `v292Dfix491Off` |
| 233 | fix476 | `v292Dfix476-pipeline.js` | i233 | `05f41bdf` | v292Dfix779 | アイコン・画像 | `v292Dfix476Off` `v292Dfix779Off` |
| 234 | fix481 | `v292Dfix481-provider-switch.js` | i234 | `f9ed6537` | v292Dfix481 | アイコン・画像 | `v292Dfix481Off` |
| 235 | fix483 | `v292Dfix483-genbudget-sync.js` | i235 | `29ccca69` | v292Dfix495 | 保存・同期 | `v292Dfix483Off` `v292Dfix483gbOff` |
| 236 | fix427 | `v292Dfix427-output-sanitize.js` | i236 | `f57387e8` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix427Off` `v292Dfix427TailOff` `v292Dfix975Off` |
| 237 | fix430 | `v292Dfix430-carrier-block.js` | i237 | `d74e943a` | v292Dfix430 | アイコン・画像 | `v292Dfix430Off` |
| 238 | fix436 | `v292Dfix436-seed-expand.js` | i238 h36 | `3a5d6160` | 20261108-bundle93-h | シナリオ・ホーム | `v292Dfix436Off` `v292Dfix855Off` `v292DfixB37cOff` |
| 239 | fix437 | `v292Dfix437-regen-instant.js` | i239 | `cadb419f` | 20261002-ac36 | アイコン・画像 | `v292Dfix437Off` |
| 240 | fix438 | `v292Dfix438-inline-dialogue.js` | i240 | `7e44532e` | 20261019-bundle31-a | 話者・会話ログ | `v292Dfix438Off` `v292Dfix959Off` |
| 241 | fix439 | `v292Dfix439-readability.js` | i241 | `cec796ef` | v292Dfix457 | 文章品質・プロンプト | `v292Dfix439Off` |
| 242 | fix440 | `v292Dfix440-block-rescue.js` | i242 | `7c10214d` | 20261021-bundle38-b | 文章品質・プロンプト | `v292Dfix440Off` `v292DfixB38Off` |
| 243 | fix500 | `v292Dfix500-sys-dedup.js` | i243 | `3d792742` | v292Dfix500 | 文章品質・プロンプト | `v292Dfix500Off` |
| 244 | fix509 | `v292Dfix509-sys-consolidate.js` | i244 | `f0685e61` | v292Dfix509 | 文章品質・プロンプト | `v292Dfix509Off` |
| 245 | fix510 | `v292Dfix510-sys-p1-style.js` | i245 | `0f8e8762` | v292Dfix513 | 文章品質・プロンプト | `v292Dfix510Off` |
| 246 | fix512 | `v292Dfix512-say-attribution.js` | i246 | `010a7a8f` | v292Dfix512 | 話者・会話ログ | `v292Dfix512Off` |
| 247 | fix514 | `v292Dfix514-say-fullname.js` | i247 | `8f0cf53d` | v292Dfix514 | 話者・会話ログ | `v292Dfix514Off` |
| 248 | fix441 | `v292Dfix441-sys-at-send.js` | i248 | `868917f9` | v292Dfix514 | 文章品質・プロンプト | `v292Dfix441Off` |
| 249 | fix442 | `v292Dfix442-folklore.js` | i249 | `d7940bcd` | v292Dfix442 | 文章品質・プロンプト | `v292Dfix442Off` |
| 250 | fix443 | `v292Dfix443-drama-rescue.js` | i250 | `16a897f5` | v292Dfix443 | 文章品質・プロンプト | `v292Dfix443Off` |
| 251 | fix483 | `v292Dfix483-beat-director.js` | i251 | `2be886d6` | v292Dfix483 | 文章品質・プロンプト | `v292Dfix483Off` |
| 252 | fix444 | `v292Dfix444-world-law.js` | i252 | `39d1eeb9` | 20261014-iso2b-c953r3 | NPC・キャラ状態 | `v292Dfix444Off` `v292Dfix444gOff` `v292Dfix451Off` |
| 253 | fix445 | `v292Dfix445-handle-lock.js` | i253 | `a3e972f8` | 20260901-fix784 | 保存・同期 | `v292Dfix445LabelOff` `v292Dfix445Off` `v292Dfix445SpkOff` `v292Dfix445WiOff` |
| 254 | fix446 | `v292Dfix446-fill-robust.js` | i254 | `ab8f1d41` | v292Dfix446 | 文章品質・プロンプト | `v292Dfix446Off` |
| 255 | fix447 | `v292Dfix447-json-force.js` | i255 | `38463b2c` | v292Dfix447 | 文章品質・プロンプト | `v292Dfix447Off` |
| 256 | fix448 | `v292Dfix448-genloading.js` | i256 | `f5fc2bfb` | v292Dfix448 | UI・画面 | `v292Dfix448Off` |
| 257 | fix453 | `v292Dfix453-src-coalesce.js` | i257 | `b82f3cb8` | v292Dfix453 | 文章品質・プロンプト | `v292Dfix453Off` |
| 258 | fix454 | `v292Dfix454-dash.js` | i258 | `868cca04` | v292Dfix457 | 文章品質・プロンプト | `v292Dfix454Off` |
| 259 | fix458 | `v292Dfix458-dash-post.js` | i259 | `5f9a8424` | 20260901-fix784 | 文章品質・プロンプト | `v292Dfix458Off` `v292Dfix625Off` `v292Dfix760Off` `v292Dfix762Off` |
| 260 | fix459 | `v292Dfix459-sys-v2.js` | i260 | `8243a236` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix459AOff` `v292Dfix459BOff` `v292Dfix459COff` `v292Dfix459DOff` |
| 261 | fix460 | `v292Dfix460-slotgrid.js` | i261 | `7b19dfd7` | v292Dfix460 | 保存・同期 | `v292Dfix460Off` |
| 262 | fix461 | `v292Dfix461-appearance-en.js` | i262 | `775fcc85` | 20261002-ac36 | アイコン・画像 | `v292Dfix461Off` `v292Dfix461V21Off` `v292Dfix461V21On` |
| 263 | fix462 | `v292Dfix462-bare-speaker.js` | i263 | `e2c7f062` | 20260829-fix748 | 話者・会話ログ | `v292Dfix462Off` `v292Dfix469Off` |
| 264 | fix463 | `v292Dfix463-human-guard.js` | i264 | `02f85257` | v292Dfix463 | NPC・キャラ状態 | `v292Dfix463Off` |
| 265 | fix464 | `v292Dfix464-say-promote.js` | i265 | `518f21b3` | v292Dfix465 | 話者・会話ログ | `v292Dfix464Off` |
| 266 | fix465 | `v292Dfix465-role-who.js` | i266 | `4754d718` | 20260829-fix748 | 話者・会話ログ | `v292Dfix465Off` |
| 267 | fix466 | `v292Dfix466-dup-say.js` | i267 | `bbe05320` | v292Dfix466 | 話者・会話ログ | `v292Dfix466Off` |
| 268 | fix467 | `v292Dfix467-readability-rules.js` | i268 | `cf5dcbb3` | v292Dfix468 | 文章品質・プロンプト | `v292Dfix467Off` |
| 269 | fix468 | `v292Dfix468-gen-timing.js` | i269 | `37f638a7` | v292Dfix468 | UI・画面 | `v292Dfix468Off` |
| 270 | fix469 | `v292Dfix469-speaker-score.js` | i270 | `1dc25074` | 20261108-bundle93-h | 話者・会話ログ | `v292Dfix469DropOn` `v292Dfix469Off` `v292Dfix469TagGuardOff` `v292Dfix469ToneFlipOff` |
| 271 | fix680 | `v292Dfix680-bare-speaker-provenance.js` | i271 | `653cc57c` | 20260829-fix748 | 話者・会話ログ | `v292Dfix680Off` `v292Dfix680On` |
| 272 | fix681 | `v292Dfix681-player-say-claim.js` | i272 | `a9683dc8` | 20260829-fix748 | 話者・会話ログ | `v292Dfix681Off` |
| 273 | fix606 | `v292Dfix606-speaker-provenance.js` | i273 | `77950540` | v292Dfix630 | 話者・会話ログ | `v292Dfix606Off` |
| 274 | fix611 | `v292Dfix611-speaker-gate.js` | i274 | `6795a98e` | v292Dfix630 | 話者・会話ログ | `v292Dfix611SpeakerGateOff` `v292Dfix619ReconcilerOff` |
| 275 | fix957 | `v292Dfix957-speaker-cataphora.js` | i275 | `ad2d8bff` | 20261022-bundle41-a | 話者・会話ログ | `v292Dfix957Off` `v292Dfix957On` `v292Dfix974Off` `v292DfixSP1BOff` |
| 276 | fix620 | `v292Dfix620-speaker-apply.js` | i276 | `3d4a774e` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix620ApplyOff` `v292Dfix783Off` |
| 277 | fix616 | `v292Dfix616-say-provenance-persist.js` | i277 | `4bf42e71` | 20260829-fix748 | 話者・会話ログ | `v292Dfix616Off` |
| 278 | fix805 | `v292Dfix805-speaker-abstain.js` | i278 | `1a3edab6` | 20260905-fix805v2 | 話者・会話ログ | `v292Dfix616Off` `v292Dfix805EphOff` `v292Dfix805Off` `v292Dfix805On` |
| 279 | fix806 | `v292Dfix806-npc-consistency-observer.js` | i279 | `3e1b7a0d` | 20260928-ac13 | NPC・キャラ状態 | `v292Dfix806Off` `v292Dfix806On` `v292DmeOff` |
| 280 | fix816 | `v292Dfix816-posture-transition-observer.js` | i280 | `36244da0` | 20260906-fix816b | NPC・キャラ状態 | `v292Dfix816Off` `v292Dfix816On` |
| 281 | fix624 | `v292Dfix624-degeneration-probe.js` | i281 | `7913f9ff` | v292Dfix630 | 文章品質・プロンプト | `v292Dfix624Off` |
| 282 | fix470 | `v292Dfix470-style-tail.js` | i282 | `87bb7a62` | v292Dfix470e | アイコン・画像 | `v292Dfix338Off` `v292Dfix470Off` `v292Dfix470On` `v292Dfix470WasOn` |
| 283 | fix471 | `v292Dfix471-style-c.js` | i283 | `b0b1bd27` | v292Dfix472 | アイコン・画像 | `v292Dfix338Off` `v292Dfix470Off` `v292Dfix470On` `v292Dfix471Off` |
| 284 | fix472 | `v292Dfix472-icon-protect.js` | i284 | `5e8bb3c5` | v292Dfix472 | アイコン・画像 | `v292Dfix472Off` |
| 285 | fix487 | `v292Dfix487-unknown-guard.js` | i285 | `495ae289` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix487IconOff` |
| 286 | fix488 | `v292Dfix488-nonhuman-detail.js` | i286 | `8960f249` | v292Dfix488b | アイコン・画像 | `v292Dfix488Off` |
| 287 | fix456 | `v292Dfix456-name-space.js` | i287 | `084cb79e` | v292Dfix456 | 話者・会話ログ | `v292Dfix456Off` |
| 288 | fix482 | `v292Dfix482-output-quality.js` | i288 | `895da7e1` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix482Off` `v292Dfix482RetryOff` `v292Dfix482RetryOn` `v292Dfix482mOff` |
| 289 | fix489 | `v292Dfix489-convlog-gate.js` | i289 | `2263d032` | 20260901-fix784 | 話者・会話ログ | `v292Dfix489DropOn` `v292Dfix489Off` `v292Dfix783Off` |
| 290 | fix490 | `v292Dfix490-slot-write-guard.js` | i290 | `874dce71` | v292Dfix565 | 保存・同期 | `v292Dfix490Off` `v292Dfix576Off` |
| 291 | fix492 | `v292Dfix492-genfail-toast.js` | i291（86 では i295） | `6a8d3d5b` | 20261109-bundle93-j | UI・画面 | `v292Dfix492Off` |
| 292 | fix501 | `v292Dfix501-legacy-appearance-probe.js` | i292 | `bd3bb1ca` | v292Dfix501 | アイコン・画像 | `v292Dfix501Off` |
| 293 | fix515 | `v292Dfix515-icon-persist-probe.js` | i293 | `dd96cd56` | v292Dfix515 | アイコン・画像 | `v292Dfix515Off` `v292Dfix515On` |
| 294 | fix516 | `v292Dfix516-regen-local-display.js` | i294 | `115a78e1` | 20261002-ac36 | アイコン・画像 | `v292Dfix516Off` |
| 295 | fix517 | `v292Dfix517-local-authoritative-avatar.js` | i295 | `85ef4054` | 20261002-ac36 | アイコン・画像 | `v292Dfix517Off` |
| 296 | fix519 | `v292Dfix519-icon-p2p.js` | i296 | `2f70451c` | 20260908-fix837 | アイコン・画像 | `v292Dfix519Off` `v292Dfix837Off` |
| 297 | fix523 | `v292Dfix523-icon-sync-versioned.js` | i297 | `1c4cea0e` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix523Off` `v292Dfix837Off` `v292Dfix960Off` |
| 298 | fix525 | `v292Dfix525-slot-ownership.js` | i298 | `8543fc23` | v292Dfix525 | 保存・同期 | `v292Dfix525Off` |
| 299 | fix945 | `v292Dfix945-xtab-stale-guard.js` | i299 | `6c3bad75` | 20261010-rs1 | 保存・同期 | `v292Dfix945EvtOff` `v292Dfix945Off` |
| 300 | fix526 | `v292Dfix526-story-naming.js` | i300 | `d283a91f` | 20260829-fix748 | 保存・同期 | `v292Dfix526Off` |
| 301 | fix631 | `v292Dfix631-avatar-inventory.js` | i301 | `39c65cca` | fix631 | アイコン・画像 | `v292Dfix631Off` |
| 302 | fix632 | `v292Dfix632-img-content-dirty.js` | i302 | `08ed559c` | fix638 | アイコン・画像 | `v292Dfix632Off` |
| 303 | fix633 | `v292Dfix633-icon-sweep-full.js` | i303 | `3c2bdc64` | 20260908-fix837 | アイコン・画像 | `v292Dfix633Live` `v292Dfix633Off` `v292Dfix633Shadow` `v292Dfix655Off` |
| 304 | fix634 | `v292Dfix634-aiappearance-sync.js` | i304 | `be628cfb` | 20261005-c1 | アイコン・画像 | `v292Dfix634Off` `v292Dfix837Off` |
| 305 | fix635 | `v292Dfix635-new-story-guard-rearm.js` | i305 | `ff2bd338` | v292Dfix637 | 保存・同期 | `v292Dfix600Off` `v292Dfix635Off` |
| 306 | fix636 | `v292Dfix636-npc-presence-evidence.js` | i306 | `b5994d3d` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix636Off` |
| 307 | fix637 | `v292Dfix637-cast-bootstrap-probe.js` | i307 | `4094ba14` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix637Apply` `v292Dfix637Off` |
| 308 | fix638 | `v292Dfix638-pull-image-guard.js` | i308 | `2e24d579` | fix638 | アイコン・画像 | `v292Dfix638BackfillOff` `v292Dfix638LockOff` `v292Dfix638Off` |
| 309 | fix640 | `v292Dfix640-cast-evidence-ledger.js` | i309 | `b927d749` | 20260913-f640pga1 | NPC・キャラ状態 | `v292Dfix640Off` `v292Dfix640PgOff` `v292Dfix640PgOn` `v292Dfix783Off` |
| 310 | fix641 | `v292Dfix641-cast-auto-register.js` | i310 | `e301921a` | 20260926-sp20 | NPC・キャラ状態 | `v292Dfix641Live` `v292Dfix641Off` `v292Dfix765Off` `v292DmeOff` |
| 311 | fix643 | `v292Dfix643-collapse-rescue.js` | i311 | `381c9ce9` | v292Dfix680 | 文章品質・プロンプト | `v292Dfix643Live` `v292Dfix643Off` |
| 312 | fix645 | `v292Dfix645-scene-move-shadow.js` | i312 | `2cb3a791` | 20260912-q119s4 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292Dfix645Off` `v292Dfix647Off` |
| 313 | fix648 | `v292Dfix648-punct-collapse.js` | i313 | `dfb84a03` | 20260912-q119s4 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292Dfix648Off` |
| 314 | fix650 | `v292Dfix650-rescue-safety.js` | i314 | `9cd0ba28` | v292Dfix680 | 文章品質・プロンプト | `v292Dfix643Live` `v292Dfix650Off` |
| 315 | fix651 | `v292Dfix651-guards.js` | i315 | `296486c0` | v292Dfix680 | 文章品質・プロンプト | `v292Dfix651SlotBackupGuardOff` `v292Dfix651StreamGuardOff` `v292Dfix651ZeroTurnGuardOff` `v292Dfix652StreamGuardAllLive` |
| 316 | fix670 | `v292Dfix670-memory-engine.js` | i316 | `f4902ef3` | 20261001-ac34 | 記憶 | `v292Dfix670Off` `v292Dfix670On` `v292Dfix786Off` `v292Dfix787Off` |
| 317 | fix801 | `v292Dfix801-events-story-adapter.js` | i317 | `96a598db` | 20260903-fix802 | 記憶 |  |
| 318 | fix789 | `v292Dfix789-semantic-adjudication.js` | i318 | `54aa3fe7` | 20260928-ac13 | 記憶 | `v292Dfix670On` `v292Dfix789Off` |
| 319 | fix790 | `v292Dfix790-dedupe-lineage.js` | i319 | `795e2c4a` | 20260930-ac25 | 記憶 | `v292Dfix670On` `v292Dfix790Off` `v292Dfix906Off` `v292Dfix915Off` |
| 320 | fix791 | `v292Dfix791-lineage-relations.js` | i320 | `b4c721b2` | 20260928-ac13 | 記憶 | `v292Dfix670On` `v292Dfix791Off` |
| 321 | fix792 | `v292Dfix792-referent-resolution.js` | i321 | `c11974cd` | 20260929-ac15 | 記憶 | `v292Dfix670On` `v292Dfix792Off` `v292Dfix907Off` |
| 322 | fix793 | `v292Dfix793-memory-canonical.js` | i322 | `6ce684c6` | 20260930-ac25 | 認証・アカウント | `v292Dfix793Off` `v292Dfix793On` `v292Dfix904Off` `v292Dfix915Off` |
| 323 | fix804 | `v292Dfix804-memory-preserve.js` | i323 | `ad1a7ea3` | 20260928-ac13 | 記憶 | `v292Dfix793Off` `v292Dfix793On` `v292Dfix804Off` |
| 324 | fix740 | `v292Dfix740-cap-telemetry.js` | i324 | `a328e139` | v292Dfix740 | NPC・キャラ状態 | `v292Dfix740Off` |
| 325 | fix741 | `v292Dfix741-severity-lane.js` | i325 | `bbc576e3` | v292Dfix741 | NPC・キャラ状態 | `v292Dfix741Off` |
| 326 | fix742 | `v292Dfix742-physical-bridge.js` | i326 | `5c13f1ec` | v292Dfix742 | NPC・キャラ状態 | `v292Dfix742Off` |
| 327 | fix797 | `v292Dfix797-layer2-contradiction.js` | i327 | `346c7119` | 20261025-bundle50-e65d-d | NPC・キャラ状態 | `v292Dfix797N1P2Off` `v292Dfix797N1P2On` `v292Dfix797Off` `v292Dfix797On` |
| 328 | fixE64 | `v292DfixE64-discard-guard.js` | i328 | `cdbc8c70` | 20261025-bundle50-e65d-d | NPC・キャラ状態 | `v292DfixE64Off` `v292DfixE64On` `v292DfixE65DOff` |
| 329 | fix743 | `v292Dfix743-cc2-client.js` | i329 動的 | `dd0106ac` | 20261019-bundle33-b | 保存・同期 | `v292Dfix743Off` `v292DfixCC2Off` `v292DfixCC2On` |
| 330 | fix750 | `v292Dfix750-c1-materialize.js` | i330 | `37b8aa65` | 20261019-bundle31-c | 保存・同期 | `v292Dfix750Off` `v292Dfix750On` `v292DfixM3Off` `v292DfixOrgfOff` |
| 331 | fix756 | `v292Dfix756-new-story-schema2.js` | i331 | `113db1e4` | 20261021-bundle36-a | 保存・同期 | `v292Dfix756Off` `v292Dfix756rOff` `v292Dfix810Off` `v292Dfix810On` |
| 332 | fixJR1 | `v292DfixJR1-journal-retire.js` | i332 h34 | `af07f42a` | 20261021-bundle36-a | 削除・墓標 | `v292DfixJR1Off` |
| 333 | fix758 | `v292Dfix758-cloud-save-pending.js` | i333 | `7f34f1b1` | 20261024-bundle44-b | 保存・同期 | `v292Dfix758Off` `v292Dfix758bOff` `v292Dfix758cOff` |
| 334 | fix844 | `v292Dfix844-provisional-handle-prompt-semantics.js` | i334 | `408757bf` | 20260912-fix844v22 | 記憶 | `v292Dfix844Off` `v292Dfix844On` |
| 335 | fix845 | `v292Dfix845-selfnaming-shadow-observer.js` | i335 | `a6298d05` | 20260913-f845ss1 | 保存・同期 | `v292Dfix783Off` `v292Dfix845Off` |
| 336 | fix850 | `v292Dfix850-turn-local-physical.js` | i336 | `f7c9d872` | 20261001-ac31 | NPC・キャラ状態 | `v292Dfix850Off` `v292Dfix850On` `v292Dfix929Off` `v292Dfix930Off` |
| 337 | fix851 | `v292Dfix851-posture-directive.js` | i337 | `22543ee2` | 20261001-ac33 | NPC・キャラ状態 | `v292Dfix851Off` `v292Dfix851On` `v292Dfix936Off` `v292DrrOff` |
| 338 | fix852 | `v292Dfix852-mental-capability.js` | i338 | `dbd6fffe` | 20261001-ac33 | NPC・キャラ状態 | `v292Dfix852Off` `v292Dfix852On` `v292Dfix936Off` `v292DrrOff` |
| 339 | fix853 | `v292Dfix853-truncated-name-guard.js` | i339 | `14e1e6de` | 20261025-bundle58-npcp1-b | NPC・キャラ状態 | `v292Dfix853Off` `v292Dfix853pOff` `v292DfixA4Off` |
| 340 | av2-portrait | `v292Dav2-portrait.js` | i340（86 では i345） | `8c744237` | 20261110-bundle93-k | アイコン・画像 | `v292Dav2pOff` `v292Dfix993Off` `v292DfixB37aOff` `v292DfixFG1cOff` `v292Dav2pRenameOff` |
| 341 | fixLD1 | `v292DfixLD1-preset-portrait.js` | i341 | `a7a98a65` | 20261101-bundle81-admg-a | アイコン・画像 | `v292DfixD1Off` `v292DfixLD1On` |
| 342 | fixB37 | `v292DfixB37-onboard.js` | i342 | `899aaaa5` | 20261109-bundle93-j | シナリオ・ホーム | `v292DfixB37bOff` `v292DfixB37gOff` |
| 343 | fixLC1 | `v292DfixLC1-appearance-proposal.js` | i343（86 では i348） | `5556f614` | 20261102-bundle90-a | アイコン・画像 | `v292DfixLC1Off` |
| 344 | fixLC1 | `v292DfixLC1-workbench.js` | i344（86 では i349） | `f4564ac3` | 20261110-bundle93-k | アイコン・画像 | `v292DfixLC1Off` `v292DfixLC1On` `v292DfixLC1PtrRefreshOff` |
| 345 | av2-migrate-ui | `v292Dav2-migrate-ui.js` | i345 | `a5dcf137` | 20261109-bundle93-j | アイコン・画像 | `v292Dav2Off` `v292Dav2On` `v292Dav2mOff` |
| 346 | fg3-artpreset | `v292Dfg3-artpreset.js` | i346 | `5c575d27` | 20261021-bundle37-a | アイコン・画像 | `v292Dfg3Off` `v292DfixB37fOff` |
| 347 | fix886 | `v292Dfix886-public-anon-client.js` | i347 | `0d4b103e` | 20260921-sp16r | 認証・アカウント | `v292Dfix837Off` `v292Dfix841Off` `v292Dfix886Off` `v292Dfix886TurnOff` |
| 348 | fix890 | `v292Dfix890-anon-gate-yield.js` | i348 | `f832fbfc` | 20260920-sp14j | 認証・アカウント |  |
| 349 | fix970 | `v292Dfix970-state-intake-shadow.js` | i349 | `66ae0ba2` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix970Off` `v292Dfix970On` |
| 350 | fixUI1 | `v292DfixUI1-subtract.js` | i350 | `f1abc3e3` | 20261025-bundle54-ui1-a | UI・画面 | `v292DfixUI1AuxOff` `v292DfixUI1DlgOff` `v292DfixUI1LabelOff` `v292DfixUI1MigOff` |
| 351 | fix642 | `v292Dfix642-delete-readback.js` | h29 | `e6a4102d` | 20260927-ac1 | 削除・墓標 | `v292Dfix642Off` |
| 352 | fix710 | `v292Dfix710-home-delete-autoresume.js` | h31 | `38dc93b4` | 20261020-bundle34-a | 削除・墓標 | `v292Dfix708Off` `v292Dfix710Off` |
| 353 | fixB37 | `v292DfixB37-home-menu.js` | h33 | `0bfa028b` | 20261021-bundle37-a | シナリオ・ホーム | `v292DfixB37dOff` |
| 354 | fix819 | `v292Dfix819-story-instantiator.js` | h38 | `b48b4522` | 20261019-bundle31-a | シナリオ・ホーム | `v292Dfix819Off` `v292Dfix871Off` |
| 355 | fix820 | `v292Dfix820-scenario-original-store.js` | h39 | `44d2c23f` | 20261020-bundle35-b | シナリオ・ホーム | `v292Dfix820Off` `v292Dfix868Off` `v292Dfix871Off` `v292Dfix872AutoOff` |
| 356 | fix872 | `v292Dfix872-scenario-cloud-sync.js` | h40 | `d59abecd` | 20261020-bundle35-b | 保存・同期 | `v292Dfix837Off` `v292Dfix872AutoOff` `v292Dfix872Off` `v292Dfix872On` |
| 357 | fix823 | `v292Dfix823-scenario-seed-adapter.js` | h41 | `d1837ab4` | 20261108-bundle93-h | シナリオ・ホーム | `v292Dfix823Off` |
| 358 | fix829 | `v292Dfix829-seed-text-enrichment.js` | h44 | `6336e81b` | 20260907-fix829r | 文章品質・プロンプト | `v292Dfix829Off` |
| 359 | fix825 | `v292Dfix825-scenario-ui.js` | h45 | `ec3c0b71` | 20261020-bundle35-b | シナリオ・ホーム | `v292Dfix825Off` `v292Dfix872Off` `v292Dfix872On` `v292Dfix966Off` |
| 360 | fix870 | `v292Dfix870-home-entry.js` | h46 | `f4381e0a` | 20261107-open1 | シナリオ・ホーム | `v292Dfix870Off` |
| 361 | fix873 | `v292Dfix873-scenario-creator.js` | h47 | `486d4b7c` | 20261110-bundle93-k | シナリオ・ホーム | `v292Dfix873Off`・`v292DfixSEEDNPC1Off`・`v292DfixSEEDNPC1bOff` |
| 362 | fix885 | `v292Dfix885-home-data-fold.js` | h48 | `f1447152` | 20260919-sp14 | シナリオ・ホーム | `v292Dfix885Off` |
| 363 | vault2-ui | `v292Dvault2-ui.js` | h49 | `1a3eba03` | 20261021-bundle37-a | Vault・非表示 | `v292Dfix964Off` `v292DfixB37dOff` `v292Dvault2MsOff` `v292Dvault2UiOff` |

**80-int-a で足した部品**（読込は **80-int-a の index 順**。どれも index.html だけで、home.html では読まない。81-admg-a・82b・83 でも位置は同じ）

| # | 番号 | ファイル | 読込（80-int-a の index順） | sha256先頭 | ?cb= | 分野 | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 364 | fixADMF1 | `v292DfixADMF1-account-flags.js` | i9（fix893 の直後） | `697272e3` | 20261109-bundle93-j | 認証・アカウント | `v292Dfix893Off` `v292DfixADMF1Off` `v292DfixNPRESOn` `v292DfixSFL1Off` |
| 365 | fixUX72 | `v292DfixUX72-adjust-icon.js` | i72（IS1 の直後） | `c4dcaa07` | 20261031-bundle72-ux-a | UI・画面 | `v292DfixUX72Off` |
| 366 | fixJMP | `v292DfixJMP-jump-latest.js` | i168（fix326 の直後） | `b726e645` | 20261031-bundle76-jmp-a | UI・画面 | `v292DfixJMPOff` |
| 367 | fixNPRES | `v292DfixNPRES-presence-gate.js` | i343（fix853 の直後） | `99b249a8` | 20261101-bundle80-int-a | NPC・キャラ状態 | `v292DfixNPRESOff` `v292DfixNPRESOn` `v292DfixNPRESd1Off` `v292DfixNPRESd2Off` |

**82b・83 で足した部品**（読込は **83-flow-c の index 順**。どれも index.html だけで、home.html では読まない）

| # | 番号 | ファイル | 読込（83 の index順） | sha256先頭 | ?cb= | 分野 | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 368 | fixICONUX2 | `v292DfixICONUX2-twotap.js` | i350（86 の番号。LC1-workbench の直後。83 では i349） | `673bf47a` | 20261102-bundle90-a | アイコン・画像 | `v292DfixICONUXOff` `v292DfixLC1On` |
| 369 | fixSETAV1 | `v292DfixSETAV1-settings-avatar.js` | i350（ICONUX2 の直後） | `d2146d0e` | 20261101-bundle82-iconux-b | アイコン・画像 | `v292DfixSETAV1Off` |
| 370 | fixICF | `v292DfixICF-icon-fail-log.js` | i357（UI1 の直後・83） | `e41d22e6` | 20261103-bundle93-a | アイコン・画像 | `v292DfixICFOff` `v292DfixB37aOff` |
| 371 | fixFLW3 | `v292DfixFLW3-opening-mode.js` | i358（82b では i357＝最後） | `f2e896a4` | 20261101-bundle82-iconux-b | UI・画面 | `v292DfixFLW3Off` |
| 372 | fixFLW2 | `v292DfixFLW2-reload-notice.js` | i360（86 の番号。83 では i359） | `82323dfa` | 20261102-bundle86-lc1ox-d | アイコン・画像 | `v292DfixFLW2Off` |
| 373 | fixFLW4 | `v292DfixFLW4-cast-age.js` | i360 | `e2b2877a` | 20261101-bundle83-flow-c | 文章品質・プロンプト | `v292DfixFLW4Off` |
| 374 | fixFLW5 | `v292DfixFLW5-home-noop-save.js` | i361（最後） | `c3679050` | 20261101-bundle83-flow-c | 保存・同期 | `v292DfixFLW5Off` `v292Dfix527NoopHomeSaveOff` `v292DfixOrgOff` |
| 375 | fixIMGSAFE | `v292DfixIMGSAFE-core.js` | i16（86 の番号。home では読まない） | `fb23cf9e` | 20261102-bundle89-r1920-b | アイコン・画像 | `v292DfixIMGSAFEOff` |
| 376 | fixNDI1 | `v292DfixNDI1-no-direct-image.js` | i1 h1（91-b の番号。両方で最初） | `54dadff9` | 20261103-bundle91-b | アイコン・画像 | （kill なし） |
| 377 | fixEDLOG | `v292DfixEDLOG-narr-edit-log.js` | SFLTap の直後（92-a。home では読まない） | `4cb1ed47` | 20261103-bundle92-a | 話者・会話ログ | `v292DfixEDLogOn`（既定 OFF）`v292DfixEDLogOff` |
| 378 | fixICF80 | `v292DfixICF80-record.js` | ICF の直後（92-a。home では読まない） | `592a85ca` | 20261103-bundle92-a | アイコン・画像 | `v292DfixICF80On`（既定 OFF）`v292DfixICF80Off` |
| 379 | fixMIDICON | `v292DfixMIDICON-auto-icon.js` | SETAV1 の直後（93-a。home では読まない） | `fbdcd485` | 20261108-bundle93-i | アイコン・画像 | `v292DfixMIDICONOff` `v292DfixMIDICONrosOff` `v292DfixMIDICONregOff` |
| 380 | fixISO1 | `v292DfixISO1-local-only-foreign-hide.js` | index：fix893 の直後／home：iso2 の後・fix889 の前（93-d） | `0f1ff245` | 20261107-iso1e | Vault・ユーザー分離 | `v292DfixISO1Off` |
| 381 | fixSETUI1 | `v292DfixSETUI1-settings-layout.js` | index の最後（FLW5 の後・93-g。home では読まない） | `3892c38f` | 20261108-bundle93-g | UI・画面 | `v292DfixSETUI1Off` |
| 382 | fixIDSPLIT2 | `v292DfixIDSPLIT2-selfname-merge.js` | index：fix620 の直後（93-h。home では読まない） | `3f75a2f2` | 20261108-bundle93-i | 話者・会話ログ | `v292DfixIDSPLIT2Off` |
| 383 | fixGENDER1 | `v292DfixGENDER1-autogender.js` | index：fix335 の直前／home：fix436 の直前（93-h） | `3291ae11` | 20261108-bundle93-h | シナリオ・ホーム | `v292DfixGENDER1Off` |
| 384 | fixSTARTICON | `v292DfixSTARTICON-start-icons.js` | index：MIDICON の直後（93-i。home では読まない） | `9b626070` | 20261110-bundle93-k | アイコン・画像 | `v292DfixSTARTICONOff` `v292DfixSTARTICONNoAI` `v292DfixSTARTICONRetryOff` `v292DfixSTARTICONListOff` |
| 385 | fixKN1 | `v292DfixKN1-knowledge-canary.js` | index の最後（SETUI1 の後・93-j。home では読まない） | `63f439a1` | 20261109-bundle93-j | 文章品質・プロンプト | `v292DfixKN1Off` |

## 付録B　ファイルはあるが読み込まれていないもの（＝本番で動いていない）

| ファイル | 状態 | sha256先頭 | メモ |
|---|---|---|---|
| `v292Dfix52-readability.js` | index.html でコメントアウト（4408 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix62-avatar-fix.js` | index.html でコメントアウト（4419 行目付近） | `d6c08a38` | 廃止扱い。ファイルは残っている |
| `v292Dfix64-conversation-log-restore.js` | index.html でコメントアウト（4423 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix70b-order-convsays.js` | index.html でコメントアウト（4439 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix73-card-dedup.js` | index.html でコメントアウト（4439 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix86-avatar-eager-blob.js` | index.html でコメントアウト（4453 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix89-convlog-cleanup.js` | index.html でコメントアウト（4455 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `worker_r4_prod.js` | どこからも読まれない（コメントの中で行番号として言及されるだけ） | `b6f9b3ab` | 旧 Worker のソースの写し。**本番では配信されていない**（2026-11-01 の本番確認で、無いパスと同じ index の応答だった）。手元の配信物の写しにだけ入っている。GPT #127-QO：次の Pages の束で消す。92-a で消そうとしたが、環境の権限で GitHub の削除が拒否された（台帳 2236）。**93-c のコミット `9ef9cd0` の追跡ファイルには無い**（クローンで確認。いつ・どの出荷で消えたかは台帳の 2232〜2250 の抜粋では未確認） |

- このほか：`scripts.txt`（345 行の古い読込一覧。**現行の読込順ではない**）は本番で実際に配信されている（GitHub のルートにもある）。削除予定（近日、単独のコミットで消す）。`_PROVENANCE.txt` は手元の写しにだけあり、本番では配信されていない。どちらも HTML・JS・Worker から参照されていない。
- 手元の配信物の写し（`pages_full.zip`）は、2026-10-15 に本番をブラウザで取得して組み直した木（prod5、348 本）を土台にしている。上の HTML の写し 6 本・旧 Worker の写し・`_PROVENANCE.txt` はその時から入っている。出荷では変わったファイルだけを GitHub に上げるので、これらは GitHub にも本番にも無い。

### inline script（ファイルではなく HTML の中に直接書かれた部品）

- index.html：10 個（81-admg-a の行番号。80-int-a と同じ行。字数は 332 行目と 1010 行目が変わった。83-flow-c でも行・字数は同じ）。[48行目・11748字] [332行目・1233字] [554行目・id=v292DfixEDN-btn・881字] [567行目・id=v292Dfix890-early・3002字] [754行目・13800字] [1010行目・305字（おまかせのボタンを ADMF1 の `oma1` で出す）] [1034行目・153999字] [3414行目・id=v100-patch・35064字] [4165行目・9509字] [4520行目・38字]
- home.html：3 個。[251行目・1196字] [277行目・749字] [420行目・162047字]
  - index.html の主なもの：1034 行目（約 15 万字）＝ゲーム本体の中核（S・UI・G・保存）、3414 行目 `v100-patch`、554 行目 `v292DfixEDN-btn`（✎ の位置）、567 行目 `v292Dfix890-early`。
## 付録C　スイッチ（localStorage キー）→ それを読む部品（機械抽出）

- 本番で読み込まれる部品と index.html の中に現れる `v292…Off` / `v292…On` の文字列を全部拾ったもの（713 件：Off 641・On 72。93-a で `v292DfixMIDICONOff`、93-d で `v292DfixISO1Off`、93-f で `v292Dfix414WidenOff`・`v292Dfix192LicOff`、93-g で `v292DfixBOOTOFF1Off`・`v292DfixSETUI1Off`・`v292DfixNEWACCT1Off`、93-h で `v292DfixHOMERETRY1Off`・`v292DfixMIDICONrosOff`・`v292DfixIDSPLIT2Off`・`v292DfixGENDER1Off`、93-i で `v292DfixMIDICONregOff`・`v292DfixSTARTICONOff` を手で足した。86 で `v292DfixIMGSAFEOff`・`v292Dfix315On` の 2 件を手で足した。71-a で拾った 697 件に、80-int-a の新しい 9 件を手で足した）。
- 拾っただけなので、**そのキーが実際にどう効くか（全体停止か一部か、既定 ON/OFF のどちらを切り替えるか）は部品のコードで確かめてください**。名前が `Off` で終わらない停止キー（例 `v292SlotGenOff`・`v292EngineUnifyOff`・`v292GoogleLoginOff`）や値で切り替えるキー（例 `v292Dfix333`=`observe`）は一部しか拾えていません。
- 「読む部品」は id（`fix77` など。fix 以外はファイル名）。index.html は inline の中を含む。

- `v292AgendaOff` — fix192
- `v292AiInstrOff` — fix297
- `v292AliasOff` — fix277, fix830, index.html
- `v292AvCarrierGuardOff` — fix237
- `v292BuildGuardOff` — fix274
- `v292ConvlogSoloOff` — features
- `v292ConvStabilityOff` — fix295
- `v292Dav2mOff` — av2
- `v292Dav2Off` — av2, fixMIDICON, fixSTARTICON
- `v292Dav2On` — av2, bav2
- `v292Dav2pOff` — av2
- `v292DavProvOff` — fix197
- `v292Dbav2Off` — bav2
- `v292DbbhOff` — fix399, fix402
- `v292DbndOff` — av2
- `v292DcoverExtOn` — fix310
- `v292Dfg3Off` — fg3
- `v292Dfix190Off` — features
- `v292Dfix192LicOff` — fix192（93-f から。npcq1 C2 の「重傷の人を自発の文から除く」一文だけを止める。Owner のアカウントでだけ効く）
- `v292Dfix205gOff` — features
- `v292Dfix244F3Off` — fix244
- `v292Dfix247bOff` — fix247b
- `v292Dfix277CaseViewOff` — fix277
- `v292Dfix277rOff` — fix277
- `v292Dfix295eOff` — fix295（91-b から。fix295e の直しだけを止める＝295d と同じ動き）
- `v292Dfix298Off` — fix298
- `v292Dfix300Off` — fix300
- `v292Dfix301Off` — fix301
- `v292Dfix302Off` — fix302
- `v292Dfix303Off` — fix303
- `v292Dfix304Off` — fix304
- `v292Dfix305Off` — fix305
- `v292Dfix306Off` — fix306
- `v292Dfix307fOff` — fix307
- `v292Dfix307Off` — fix307
- `v292Dfix309Off` — fix309
- `v292Dfix310Off` — fix310
- `v292Dfix313Off` — fix313
- `v292Dfix314Off` — fix314
- `v292Dfix315On` — fix315（86 から：「👁 見る」は既定 OFF。`1` で許可したときだけボタンが出る。91-b から、`1` でも作らない）
- `v292Dfix316Off` — fix316
- `v292Dfix317Off` — fix317
- `v292Dfix318Off` — fix318
- `v292Dfix322Off` — fix322
- `v292Dfix323Off` — fix323
- `v292Dfix324Off` — fix324
- `v292Dfix325Off` — fix325
- `v292Dfix326Off` — fix326
- `v292Dfix327Off` — fix327
- `v292Dfix330Off` — fix330
- `v292Dfix333HeroLabelOff` — fix333
- `v292Dfix333Off` — fix333
- `v292Dfix333SelOnceOff` — fix333
- `v292Dfix336MemOnlyOff` — fix336
- `v292Dfix336Off` — fix336
- `v292Dfix338Off` — fix338, fix470, fix471
- `v292Dfix346Off` — fix346
- `v292Dfix351dOff` — fix351
- `v292Dfix351Off` — fix351
- `v292Dfix352Off` — fix352
- `v292Dfix353Off` — fix353
- `v292Dfix354Off` — fix354
- `v292Dfix355Off` — fix355
- `v292Dfix356EagerOff` — fix356
- `v292Dfix359Off` — fix359
- `v292Dfix360Off` — fix360
- `v292Dfix363Off` — fix363, fix379
- `v292Dfix364Off` — fix364
- `v292Dfix366Off` — fix366, fix379
- `v292Dfix370Off` — fix370
- `v292Dfix371Off` — fix371
- `v292Dfix372Off` — fix372
- `v292Dfix374Off` — fix374
- `v292Dfix376Off` — fix376, fix379
- `v292Dfix377COff` — fix377
- `v292Dfix377Off` — fix377, fix379
- `v292Dfix378Off` — fix378
- `v292Dfix379Off` — fix379
- `v292Dfix379V4Off` — fix379, fix417
- `v292Dfix381Off` — fix381
- `v292Dfix382Off` — fix382, fix384
- `v292Dfix383Off` — fix383
- `v292Dfix384Off` — fix384
- `v292Dfix385Off` — fix385
- `v292Dfix386HeroOff` — fix386
- `v292Dfix386Off` — fix386
- `v292Dfix387Off` — fix387
- `v292Dfix388Off` — fix388
- `v292Dfix389Off` — fix389
- `v292Dfix390Off` — fix390
- `v292Dfix393Off` — fix393
- `v292Dfix395Off` — fix395
- `v292Dfix396Off` — fix338
- `v292Dfix398Off` — fix398
- `v292Dfix399AutoOff` — fix399, fix402
- `v292Dfix399Off` — fix399
- `v292Dfix399SelfHealOn` — fix399
- `v292Dfix400Off` — fix400
- `v292Dfix402cOff` — fix402
- `v292Dfix402dOff` — fix402
- `v292Dfix402Off` — fix402
- `v292Dfix402On` — fix402
- `v292Dfix403cOff` — fix197
- `v292Dfix403Off` — fix197
- `v292Dfix405D1SuppressOff` — fix405
- `v292Dfix405Off` — fix405
- `v292Dfix405SlimOff` — fix405
- `v292Dfix406Off` — fix406
- `v292Dfix407Off` — fix407
- `v292Dfix409bOff` — fix409
- `v292Dfix409cOff` — fix409
- `v292Dfix409Off` — fix409
- `v292Dfix410Off` — fix145
- `v292Dfix411Off` — fix197, fix402
- `v292Dfix412Off` — fix197
- `v292Dfix414Off` — fix414
- `v292Dfix414WidenOff` — fix414（93-f から。npcq1 C2 の【制約】の拡張だけを止める。Owner のアカウントでだけ効く）
- `v292Dfix415Off` — fix415
- `v292Dfix416Off` — fix416
- `v292Dfix417cOff` — index.html
- `v292Dfix417Off` — fix417
- `v292Dfix418Off` — fix418
- `v292Dfix420Off` — fix420
- `v292Dfix424Off` — fix197
- `v292Dfix425Off` — fix192, fix416, fix417
- `v292Dfix427Off` — fix427
- `v292Dfix427TailOff` — fix427
- `v292Dfix429Off` — fix338
- `v292Dfix430Off` — fix430
- `v292Dfix436Off` — fix436
- `v292Dfix437Off` — fix437
- `v292Dfix438Off` — fix438
- `v292Dfix439Off` — fix439
- `v292Dfix440Off` — fix440
- `v292Dfix441Off` — fix441
- `v292Dfix442Off` — fix442
- `v292Dfix443Off` — fix443
- `v292Dfix444gOff` — fix444
- `v292Dfix444Off` — fix444
- `v292Dfix445LabelOff` — fix445
- `v292Dfix445Off` — fix445
- `v292Dfix445SpkOff` — fix445
- `v292Dfix445WiOff` — fix445
- `v292Dfix446Off` — fix446
- `v292Dfix447Off` — fix447
- `v292Dfix448Off` — fix448
- `v292Dfix450Off` — fix356
- `v292Dfix451Off` — fix444
- `v292Dfix453Off` — fix453
- `v292Dfix454Off` — fix454
- `v292Dfix455Off` — fix66
- `v292Dfix456Off` — fix197, fix445, fix456
- `v292Dfix457Off` — fix197, fix66, fixSFLTap
- `v292Dfix458Off` — fix458
- `v292Dfix459AOff` — fix459
- `v292Dfix459BOff` — fix459
- `v292Dfix459COff` — fix459
- `v292Dfix459DOff` — fix459
- `v292Dfix459Off` — fix459
- `v292Dfix460Off` — fix460
- `v292Dfix461Off` — fix338, fix461
- `v292Dfix461V21Off` — fix461
- `v292Dfix461V21On` — fix461
- `v292Dfix462Off` — fix462
- `v292Dfix463Off` — fix463
- `v292Dfix464Off` — fix464
- `v292Dfix465Off` — fix465
- `v292Dfix466Off` — fix466
- `v292Dfix467Off` — fix467
- `v292Dfix468Off` — fix468
- `v292Dfix469DropOn` — fix469
- `v292Dfix469Off` — fix376, fix462, fix469
- `v292Dfix469TagGuardOff` — fix469
- `v292Dfix469ToneFlipOff` — fix469
- `v292Dfix470Off` — fix470, fix471
- `v292Dfix470On` — fix470, fix471
- `v292Dfix470WasOn` — fix470
- `v292Dfix471Off` — fix471, fix475
- `v292Dfix471On` — fix471, fix475
- `v292Dfix471WasOn` — fix471
- `v292Dfix472Off` — fix472
- `v292Dfix475Off` — fix475
- `v292Dfix476Off` — fix476
- `v292Dfix477Off` — fix477
- `v292Dfix478Off` — fix478
- `v292Dfix480Off` — fix197
- `v292Dfix481Off` — fix481
- `v292Dfix482mOff` — fix482
- `v292Dfix482Off` — fix482
- `v292Dfix482RetryOff` — fix482
- `v292Dfix482RetryOn` — fix482
- `v292Dfix482sOff` — fix482
- `v292Dfix483gbOff` — fix483
- `v292Dfix483Off` — fix483
- `v292Dfix484Off` — fix484
- `v292Dfix487IconOff` — fix487
- `v292Dfix487ListOff` — fix145
- `v292Dfix488Off` — fix488
- `v292Dfix489DropOn` — fix489
- `v292Dfix489Off` — fix489
- `v292Dfix490Off` — fix490
- `v292Dfix491Off` — fix491
- `v292Dfix492Off` — fix492
- `v292Dfix493Off` — fix197
- `v292Dfix499Off` — fix499
- `v292Dfix500Off` — fix500
- `v292Dfix501Off` — fix501
- `v292Dfix504Off` — fix80
- `v292Dfix509Off` — fix509
- `v292Dfix510Off` — fix510
- `v292Dfix512Off` — fix512
- `v292Dfix514Off` — fix514
- `v292Dfix515Off` — fix515
- `v292Dfix515On` — fix515
- `v292Dfix516Off` — fix516
- `v292Dfix517Off` — fix517
- `v292Dfix519Off` — fix519
- `v292Dfix523Off` — fix523
- `v292Dfix525Off` — fix525
- `v292Dfix526Off` — fix526
- `v292Dfix527NoopHomeSaveOff` — fix527
- `v292Dfix527Off` — fix527
- `v292Dfix528Off` — fix277
- `v292Dfix529Off` — fix145
- `v292Dfix532Off` — fix77
- `v292Dfix535Off` — fix469
- `v292Dfix536Off` — fix469
- `v292Dfix537Off` — fix277
- `v292Dfix537PtOff` — fix277
- `v292Dfix537PtOn` — fix277
- `v292Dfix537SlotLogOff` — fix277
- `v292Dfix537SlotLogOn` — fix277
- `v292Dfix538Off` — fix277
- `v292Dfix540Off` — fix277
- `v292Dfix543Off` — fix543
- `v292Dfix553Off` — fix553
- `v292Dfix553PbOff` — fix553
- `v292Dfix553PbOn` — fix553
- `v292Dfix555Off` — fix555
- `v292Dfix562Off` — fix562
- `v292Dfix564Off` — fix564
- `v292Dfix569Off` — fix569
- `v292Dfix573bOff` — fix573
- `v292Dfix573Off` — fix573
- `v292Dfix574DenyOff` — fix569
- `v292Dfix575Off` — fix399
- `v292Dfix576Off` — fix490
- `v292Dfix577Off` — fix577
- `v292Dfix580Off` — fix580
- `v292Dfix582Off` — fix399
- `v292Dfix584Off` — fix402
- `v292Dfix587Off` — fix587
- `v292Dfix588Off` — fix399, fix402, fix527
- `v292Dfix590Off` — fix590
- `v292Dfix600Off` — fix600, fix635
- `v292Dfix602ShadowOff` — fix602
- `v292Dfix604Off` — fix469
- `v292Dfix605Off` — fix399
- `v292Dfix606Off` — fix606
- `v292Dfix610Off` — fix469
- `v292Dfix611SpeakerGateOff` — fix611
- `v292Dfix616Off` — fix616, fix805
- `v292Dfix619ReconcilerOff` — fix611
- `v292Dfix620ApplyOff` — fix620
- `v292Dfix624Off` — fix624
- `v292Dfix625Off` — fix458
- `v292Dfix631Off` — fix631
- `v292Dfix632Off` — fix632
- `v292Dfix633Off` — fix633
- `v292Dfix634Off` — fix634
- `v292Dfix635Off` — fix635
- `v292Dfix636Off` — fix636
- `v292Dfix637Off` — fix637
- `v292Dfix638BackfillOff` — fix638
- `v292Dfix638LockOff` — fix638
- `v292Dfix638Off` — fix638
- `v292Dfix640Off` — fix640
- `v292Dfix640PgOff` — fix640
- `v292Dfix640PgOn` — fix640
- `v292Dfix641Off` — fix641
- `v292Dfix642Off` — fix642
- `v292Dfix643Off` — fix643
- `v292Dfix645Off` — fix645
- `v292Dfix646Off` — fix379
- `v292Dfix647Off` — fix645
- `v292Dfix648Off` — fix648
- `v292Dfix650Off` — fix650
- `v292Dfix651SlotBackupGuardOff` — fix228, fix651
- `v292Dfix651StreamGuardOff` — fix651
- `v292Dfix651ZeroTurnGuardOff` — fix651
- `v292Dfix654Off` — fix654
- `v292Dfix655Off` — fix633
- `v292Dfix658Off` — fix658
- `v292Dfix659Off` — fix659
- `v292Dfix660Off` — fix660
- `v292Dfix670Off` — fix670
- `v292Dfix670On` — fix670, fix789, fix790, fix791, fix792
- `v292Dfix680Off` — fix680
- `v292Dfix680On` — fix680
- `v292Dfix681Off` — fix681
- `v292Dfix694Off` — index.html
- `v292Dfix697Off` — fix697
- `v292Dfix697pOff` — fix697
- `v292Dfix697q2Off` — fix697
- `v292Dfix697qOff` — fix697
- `v292Dfix698Off` — fix698
- `v292Dfix698On` — fix698
- `v292Dfix700Off` — fix700
- `v292Dfix700On` — fix700
- `v292Dfix702MaskOff` — fix702
- `v292Dfix702Off` — fix702
- `v292Dfix702On` — fix702
- `v292Dfix705bdOff` — fix705
- `v292Dfix705Off` — fix705
- `v292Dfix708Off` — fix587, fix710
- `v292Dfix710Off` — fix710
- `v292Dfix71DlgOff` — fix71
- `v292Dfix71DlgOn` — fix71
- `v292Dfix721Off` — fix721
- `v292Dfix726Off` — fix726
- `v292Dfix729Off` — fix729
- `v292Dfix729tOff` — fix697, fix729, fix781
- `v292Dfix740Off` — fix740
- `v292Dfix741Off` — fix741
- `v292Dfix742Off` — fix742
- `v292Dfix743Off` — fix743, fix745
- `v292Dfix745Off` — fix745
- `v292Dfix746Off` — fix746
- `v292Dfix748SaveRefuseOff` — features
- `v292Dfix750Off` — fix745, fix750
- `v292Dfix750On` — fix745, fix750
- `v292Dfix756Off` — fix756
- `v292Dfix756rOff` — fix756
- `v292Dfix757Off` — index.html
- `v292Dfix758bOff` — fix758
- `v292Dfix758cOff` — fix758
- `v292Dfix758Off` — fix758
- `v292Dfix760Off` — fix458
- `v292Dfix761Off` — index.html
- `v292Dfix762Off` — fix458
- `v292Dfix763Off` — fix458
- `v292Dfix764Off` — fix764, fix830
- `v292Dfix765Off` — fix641
- `v292Dfix766Off` — fix766
- `v292Dfix766On` — fix766
- `v292Dfix769Off` — fix767
- `v292Dfix770Off` — fix767
- `v292Dfix773Off` — fix145, fix767
- `v292Dfix774Off` — fix767
- `v292Dfix775Off` — fix767
- `v292Dfix776Off` — fix766, fix767
- `v292Dfix777Off` — fix777
- `v292Dfix778Off` — fix766, fix767
- `v292Dfix779Off` — fix476, fix766
- `v292Dfix781bOff` — fix697, fix781
- `v292Dfix781cOff` — fix697, fix781
- `v292Dfix781Off` — fix705, fix781, fixSFL1
- `v292Dfix783Off` — fix228, fix246, fix277, fix297, fix298, fix317, fix318, fix374, fix382, fix384, fix395, fix409, fix445, fix458, fix469, fix489, fix54, fix620, fix640, fix66, fix766, fix845, index.html
- `v292Dfix786Off` — fix670
- `v292Dfix787Off` — fix670
- `v292Dfix788Off` — fix670
- `v292Dfix789Off` — fix789
- `v292Dfix790Off` — fix790
- `v292Dfix791Off` — fix791
- `v292Dfix792Off` — fix792
- `v292Dfix793Off` — fix793, fix804
- `v292Dfix793On` — fix793, fix804
- `v292Dfix796BackfillOff` — fix796
- `v292Dfix796DedupeOff` — fix796
- `v292Dfix796F1On` — fix796
- `v292Dfix796HonOn` — fix192, fix796
- `v292Dfix796Off` — fix796
- `v292Dfix796On` — fix796
- `v292Dfix796RerOff` — fix796
- `v292Dfix797N1P2Off` — fix797
- `v292Dfix797N1P2On` — fix797
- `v292Dfix797Off` — fix797
- `v292Dfix797On` — fix797
- `v292Dfix802Off` — fix802
- `v292Dfix802On` — fix802
- `v292Dfix803Off` — fix803
- `v292Dfix803On` — fix803
- `v292Dfix804Off` — fix804
- `v292Dfix805EphOff` — fix805
- `v292Dfix805Off` — fix805
- `v292Dfix805On` — fix805
- `v292Dfix806Off` — fix806
- `v292Dfix806On` — fix806
- `v292Dfix807Off` — index.html
- `v292Dfix808Off` — fix66
- `v292Dfix809Off` — fix697
- `v292Dfix810Off` — fix756
- `v292Dfix810On` — fix756
- `v292Dfix811Off` — index.html
- `v292Dfix811On` — index.html
- `v292Dfix812Off` — fix192
- `v292Dfix813Off` — fix192
- `v292Dfix815Off` — fix645
- `v292Dfix816Off` — fix816
- `v292Dfix816On` — fix816
- `v292Dfix818Off` — index.html
- `v292Dfix819Off` — fix819
- `v292Dfix820Off` — fix820
- `v292Dfix821Off` — fix399, fix402
- `v292Dfix821On` — fix399, fix402
- `v292Dfix822Off` — fix822
- `v292Dfix823Off` — fix823
- `v292Dfix825Off` — fix825
- `v292Dfix826Off` — fix826
- `v292Dfix827Off` — fix827
- `v292Dfix828Off` — fix402, fix590
- `v292Dfix829Off` — fix829
- `v292Dfix830Off` — fix830
- `v292Dfix831Off` — fix328
- `v292Dfix832Off` — fix192
- `v292Dfix833Off` — index.html
- `v292Dfix834Off` — features
- `v292Dfix835Off` — fix328
- `v292Dfix837Off` — fix247, fix328, fix336, fix399, fix400, fix402, fix519, fix523, fix633, fix634, fix658, fix697, fix698, fix700, fix702, fix705, fix872, fix886
- `v292Dfix838Off` — fix697, fix705
- `v292Dfix840Off` — fix705
- `v292Dfix841Off` — fix247, fix336, fix705, fix886
- `v292Dfix842Off` — fix697, fix729
- `v292Dfix843Off` — fix843
- `v292Dfix844Off` — fix844
- `v292Dfix844On` — fix844
- `v292Dfix845Off` — fix845
- `v292Dfix846Off` — fix846
- `v292Dfix850Off` — fix850
- `v292Dfix850On` — fix850
- `v292Dfix851Off` — fix851
- `v292Dfix851On` — fix851
- `v292Dfix852Off` — fix852
- `v292Dfix852On` — fix852
- `v292Dfix853Off` — fix853
- `v292Dfix853pOff` — fix853
- `v292Dfix854Off` — fix854
- `v292Dfix855Off` — features, fix436
- `v292Dfix859Off` — fix859
- `v292Dfix860Off` — fix860
- `v292Dfix868Off` — fix820
- `v292Dfix870Off` — fix870
- `v292Dfix871Off` — fix697, fix819, fix820
- `v292Dfix872AutoOff` — fix820, fix872
- `v292Dfix872Off` — fix820, fix825, fix872
- `v292Dfix872On` — fix820, fix825, fix872
- `v292Dfix873Off` — fix873
- `v292DfixSEEDNPC1Off` — fix873（SEEDNPC1。手で追記：「いっしょに出る人」の 1 行を人ごとに分ける処理だけ止め、93-i と同じ動きに戻す）
- `v292Dfix880Off` — fix880, index.html
- `v292Dfix881Off` — fix881, index.html
- `v292Dfix884Off` — fix884, index.html
- `v292Dfix885Off` — fix885
- `v292Dfix886Off` — fix886
- `v292Dfix886TurnOff` — fix886
- `v292Dfix889Off` — fix889, index.html
- `v292Dfix892Off` — fix892
- `v292Dfix893Off` — fix893, fixADMF1, vault2
- `v292Dfix894Off` — fix135, fix325
- `v292Dfix895Off` — fix697
- `v292Dfix896Off` — fix705
- `v292Dfix897Off` — fix893
- `v292Dfix898Off` — fix697
- `v292Dfix899bOff` — index.html
- `v292Dfix899Off` — index.html
- `v292Dfix900Off` — fix900
- `v292Dfix901Off` — fix77
- `v292Dfix902Off` — fix889
- `v292Dfix903Off` — fix192
- `v292Dfix904Off` — fix793, fix803
- `v292Dfix905cOff` — fix905
- `v292Dfix905Off` — fix905
- `v292Dfix906Off` — fix790
- `v292Dfix907Off` — fix792
- `v292Dfix908Off` — fix670
- `v292Dfix909bOff` — fix697, fix781
- `v292Dfix909Off` — fix697
- `v292Dfix910cOff` — fix697
- `v292Dfix910Off` — fix697
- `v292Dfix911Off` — fix697, fix705, fix781, fix912
- `v292Dfix912Off` — fix912
- `v292Dfix913Off` — fix697, fix912
- `v292Dfix914Off` — fix697
- `v292Dfix915Off` — fix670, fix790, fix793
- `v292Dfix916Off` — fix705
- `v292Dfix917Off` — fix905
- `v292Dfix918Off` — fix793
- `v292Dfix919Off` — fix670
- `v292Dfix921Off` — fix796
- `v292Dfix922Off` — fix66
- `v292Dfix923Off` — fix80, index.html
- `v292Dfix924Off` — fix697, fix790, fix793, fix796, fix802, fix803
- `v292Dfix925aOff` — fix790, fix793, fix796, fix803
- `v292Dfix925bOff` — fix796
- `v292Dfix925Off` — fix402
- `v292Dfix926Off` — fix302, fix702
- `v292Dfix927Off` — fix333, fix402, fix705, fix781
- `v292Dfix928Off` — fix277, fix697
- `v292Dfix929Off` — fix850
- `v292Dfix930Off` — fix192, fix850
- `v292Dfix932Off` — fix192
- `v292Dfix933Off` — fix933
- `v292Dfix934Off` — fix850
- `v292Dfix936Off` — fix851, fix852
- `v292Dfix938Off` — features, fix77
- `v292Dfix945EvtOff` — fix945
- `v292Dfix945Off` — fix945
- `v292Dfix946M3Off` — fix946, iso2
- `v292Dfix946Off` — fix946, iso2
- `v292Dfix950Off` — fix950
- `v292Dfix951Off` — fix313, fix459
- `v292Dfix952Off` — fix459
- `v292Dfix953Off` — fix953
- `v292Dfix953On` — fix953
- `v292Dfix954Off` — fix313
- `v292Dfix954On` — fix313
- `v292Dfix955Off` — features
- `v292Dfix955On` — features
- `v292Dfix956Off` — fix192
- `v292Dfix956On` — fix192
- `v292Dfix957Off` — fix957
- `v292Dfix957On` — fix957
- `v292Dfix958Off` — fix459
- `v292Dfix959Off` — fix438, index.html
- `v292Dfix960Off` — fix523
- `v292Dfix961Off` — fix77
- `v292Dfix962Off` — fix405
- `v292Dfix962On` — fix405
- `v292Dfix963Off` — fix145
- `v292Dfix964Off` — vault2
- `v292Dfix965Off` — fix766
- `v292Dfix966Off` — fix825
- `v292Dfix967Off` — fix766
- `v292Dfix970Off` — fix970
- `v292Dfix970On` — fix970
- `v292Dfix971Off` — fix482
- `v292Dfix972Off` — fix383
- `v292Dfix974Off` — fix957
- `v292Dfix975Off` — fix427
- `v292Dfix976Off` — fix197
- `v292Dfix977Off` — fix356
- `v292Dfix978Off` — fix197
- `v292Dfix979Off` — fix63
- `v292Dfix980Off` — fix484
- `v292Dfix983FrameOff` — fix767
- `v292Dfix983Off` — fix767
- `v292Dfix990Off` — fix990
- `v292Dfix993Off` — av2
- `v292DfixA1Off` — fix192
- `v292DfixA4Off` — fix853
- `v292DfixADMF1Off` — fixADMF1
- `v292DfixB0Off` — fix192
- `v292DfixB0On` — fix192
- `v292DfixB37aOff` — av2
- `v292DfixB37bOff` — fixB37, fixSTARTICON
- `v292DfixB37gOff` — fixB37（84-b37g の「一覧・確認が開いている／操作中は自動で開かない」見張りだけを止める）
- `v292DfixB37cOff` — fix436
- `v292DfixB37dOff` — fixB37, vault2
- `v292DfixB37eOff` — fix334
- `v292DfixB37fOff` — fg3
- `v292DfixB38Off` — fix192, fix440
- `v292DfixBCJ1Off` — fix697
- `v292DfixBCJ2Off` — fix697
- `v292DfixBCJ3Off` — fix697
- `v292DfixBF1Off` — fixBF1, smrc1
- `v292DfixBF1On` — fixBF1, smrc1
- `v292DfixBOOTOFF1Off` — fix889（93-g から。「オフライン」の扉の自動の聞き直しを止め、93-f と同じ動きにする）
- `v292DfixCC2Off` — fix743, fix745
- `v292DfixCC2On` — fix743, fix745
- `v292DfixCL1aOff` — fix66
- `v292DfixCL1bOff` — index.html
- `v292DfixCL1cOff` — index.html
- `v292DfixCL1dOff` — index.html
- `v292DfixCL1eOff` — index.html
- `v292DfixCL1fOff` — index.html
- `v292DfixCL1gOff` — fix71
- `v292DfixCL1hOff` — fix72
- `v292DfixCmfOff` — smrc1
- `v292DfixCP1Off` — fixCP1, fixSFL1
- `v292DfixCP1On` — fixCP1
- `v292DfixCTXOff` — fixCTX
- `v292DfixCTXOn` — fixCTX
- `v292DfixD1Off` — fixLD1
- `v292DfixDL2Off` — fixDL2
- `v292DfixDP1Off` — fix587
- `v292DfixDP3On` — fixDL2
- `v292DfixDP4Off` — fixDL2
- `v292DfixE64Off` — fixE64
- `v292DfixE64On` — fixE64
- `v292DfixE65AOff` — index.html
- `v292DfixE65DOff` — fix797, fixE64
- `v292DfixE65Off` — features
- `v292DfixE65On` — features
- `v292DfixEDGOff` — fixEDIT01
- `v292DfixEdit01Off` — fixEDIT01
- `v292DfixEDLogOff` — fixEDLOG（92-a から。止める）
- `v292DfixEDLogOn` — fixEDLOG（92-a から。既定 OFF。`1` で ON）
- `v292DfixEDNBtnOff` — index.html
- `v292DfixFG1cOff` — av2
- `v292DfixGC1Off` — fix912
- `v292DfixGENDER1Off` — fixGENDER1, fix436, fix823（93-h から。性別の自動決定を止め、従来どおりにする。fix335 は GENDER1 の `on()` を通して同じく止まる）
- `v292DfixGC1On` — fix912
- `v292DfixGQ1aOff` — fix377
- `v292DfixGQ1bOff` — fix377
- `v292DfixGQ1bOn` — fix377
- `v292DfixGQ2Off` — fix192
- `v292DfixGQ3Off` — fix797
- `v292DfixGQ4Off` — fixGQ4
- `v292DfixGQ4On` — fixGQ4
- `v292DfixHK1Off` — fix697
- `v292DfixHOMERETRY1Off` — home.html（93-h から。inline の HOMERETRY1。ホームの同期の自動の聞き直しを止め、93-g と同じにする）
- `v292DfixICF80Off` — fixICF80（92-a から。止める）
- `v292DfixICF80On` — fixICF80（92-a から。既定 OFF。`1` で ON）
- `v292DfixIDSPLIT2Off` — fixIDSPLIT2, fix469（93-h から。IDSPLIT2 と fix469 の B の分岐の両方を止める。93-i から ON は管理者画面の `idsplit2`＝ADMF1 の行で、localStorage のキーではない）
- `v292DfixIMGSAFEOff` — IMGSAFE-core, fix315（86 から。画面側の安全確認の部品だけを止める。Worker 側は env `CHR_IMGSAFE_OFF=1`）
- `v292DfixIS1Off` — fixIS1
- `v292DfixJMPOff` — fixJMP
- `v292DfixJR1Off` — fixJR1
- `v292DfixKN1Off` — fixKN1（93-j から。Knowledge の試験〔参考知識カード〕を止める。ON は管理者画面の `kn1`＝ADMF1 の行）
- `v292DfixKP1Off` — index.html
- `v292DfixKP1On` — index.html
- `v292DfixLC1Off` — fixLC1
- `v292DfixLC1On` — fixLC1（81-admg-a から ADMF1 の範囲・アカウントの値が先。`lc1` は HOLD なので記録時点ではこの値で ON にならない）
- `v292DfixLD1On` — fixLD1（81-admg-a から ADMF1 の範囲・アカウントの値が先。効くのは Owner のアカウントで行が無いときだけ）
- `v292DfixLE1pvOff` — av2
- `v292DfixLE2Off` — fix777, fixIS1
- `v292DfixLE3Off` — fixLE3
- `v292DfixLE4Off` — fixLE4
- `v292DfixM3Off` — fix750
- `v292DfixMIDICONOff` — fixMIDICON（93-a から。止める。表示も作成も止める。`midicon1` の ON は管理者画面＝ADMF1 の行で、localStorage のキーではない）
- `v292DfixMIDICONregOff` — fixMIDICON, fix697（93-i から。W-MXREG〔登録 NPC の最初の自動アイコン〕だけを止める。`mxreg1` の ON は管理者画面＝ADMF1 の行で、localStorage のキーではない）
- `v292DfixMIDICONrosOff` — fixMIDICON（93-h から。OLDMX1 の「名簿が変わったら 1 回だけ判定し直す」だけを止める）
- `v292DfixISO1Off` — fixISO1（93-d から。端末ごとの kill。隠す関門と判定を止める。`localStorage v292DfixISO1Off='1'`）
- `v292DfixNEWACCT1Off` — home.html（93-g から。inline の NEWACCT1。新しいアカウントのホームの同期の表示を従来どおりに戻す）
- `v292DfixNPRESd1Off` — fixNPRES
- `v292DfixNPRESd2Off` — fixNPRES
- `v292DfixNPRESd3Off` — fixNPRES
- `v292DfixNPRESd4Off` — fixNPRES
- `v292DfixNPRESOff` — fix192, fixNPRES
- `v292DfixNPRESOn` — fix192, fixADMF1, fixNPRES（80-int-a から端末の値では ON にならない。診断の表示だけ）
- `v292DfixOrgfOff` — fix697, fix750
- `v292DfixOrgOff` — features
- `v292DfixRC1Off` — fixRC1
- `v292DfixRC1On` — fixRC1（81-admg-a から ADMF1 の範囲・アカウントの値が先。効くのは Owner のアカウントで行が無いときだけ）
- `v292DfixRCOff` — fixRC
- `v292DfixS1AOff` — fix697, fix705
- `v292DfixS1BOff` — fix892
- `v292DfixS1Off` — fixS1
- `v292DfixS4bUiOff` — fix825
- `v292DfixSC1Off` — fixSC1
- `v292DfixSC1On` — fixSC1
- `v292DfixScDateOff` — fix820, fix825
- `v292DfixSETUI1Off` — fixSETUI1（93-g から。⚙ 設定の配置を従来のフッターのままにする）
- `v292DfixSFL1Off` — fixADMF1, fixSFL1
- `v292DfixSFL1On` — fixADMF1, fixSFL1（81-admg-a から、効くのは Owner のアカウントで行が無いときだけ。招待者などは `?sfl=1` でも ON にならない）
- `v292DfixSFLTapOff` — fixSFLTap
- `v292DfixSN1aOff` — fix527, fix697
- `v292DfixSN1bOff` — fix697
- `v292DfixSP1BOff` — fix957, index.html
- `v292DfixSP1BOn` — fix957, index.html
- `v292DfixSP1Off` — fix66, fix957, index.html
- `v292DfixSTARTICONOff` — fixSTARTICON（93-i から。物語を始めたときの自動アイコンを止める〔何もしない〕。ON は管理者画面の `starticon1`＝ADMF1 の行。`v292DfixSTARTICONNoAI='1'` は文章 AI の案だけを使わない）
- `v292DfixSTARTICONRetryOff` — fixSTARTICON（93-j から。200 `IN_FLIGHT` のあとの 1 回だけの再試行をしない＝93-i と同じ）
- `v292DfixSEEDNPC1bOff` — fix873（93-k から。説明だけの人の名前を空にする処理だけ止める＝93-j と同じ）
- `v292DfixSTARTICONListOff` — fixSTARTICON（93-k から。キャラ一覧を開いたままの再読み込み・開き直し・待ちの表示・LC1 の読み直しを止める＝93-j と同じ）
- `v292DfixLC1PtrRefreshOff` — fixLC1（93-k から。refreshPtr を何もしない）
- `v292Dav2pRenameOff` — av2-portrait（93-k から。名前を変えたキャラの絵を今の名前で出す表示を止める＝93-j と同じ）
- `v292DfixUI1AuxOff` — fixUI1
- `v292DfixUI1DlgOff` — fixUI1
- `v292DfixUI1LabelOff` — fixUI1
- `v292DfixUI1MigOff` — fixUI1
- `v292DfixUI1Off` — fixUI1
- `v292DfixUX72Off` — fixUX72
- `v292DiconS2Off` — fix197
- `v292Diso2Off` — fix399, fix402, iso2
- `v292DknwOff` — av2
- `v292DlbMeAuthOff` — fix670
- `v292DlbRosterAuthOff` — fix298
- `v292DlpsGate1Off` — fix590
- `v292Dlpsid1Off` — fix590
- `v292DmeOff` — fix641, fix670, fix793, fix796, fix802, fix803, fix806, fix905
- `v292DngsOff` — features
- `v292Dp8dOff` — p8d
- `v292DpafOff` — fix399, fix402
- `v292Dpcp1Off` — fix399, fix402
- `v292DpcpOff` — fix399, fix402
- `v292DQ119PageCanaryOff` — fix277, fix553, fix645, fix648, fix74, fix78
- `v292DQ119PageCanaryOn` — fix553, fix645, fix648, fix74, fix78
- `v292DQ119PhaseBOn` — fix553
- `v292Drp1bOff` — fix66
- `v292Drp1Off` — fix138, fix66
- `v292DrrOff` — fix850, fix851, fix852
- `v292Dvault2AB8Off` — vault2
- `v292Dvault2ABOff` — vault2
- `v292Dvault2CopyGateOff` — vault2
- `v292Dvault2F1Off` — vault2
- `v292Dvault2GateOff` — vault2
- `v292Dvault2GKOff` — vault2
- `v292Dvault2MsOff` — vault2
- `v292Dvault2O1Off` — vault2
- `v292Dvault2ODOff` — vault2
- `v292Dvault2UiOff` — vault2
- `v292EngineUnifyOff` — fix226
- `v292GoogleLoginOff` — fix328, fix893
- `v292HealthOff` — fix292
- `v292IconUnifyOff` — fix277
- `v292Lane16Off` — fix885
- `v292MiniExOff` — fix192
- `v292MobileUiOff` — fix290
- `v292ModelSelOff` — fix256
- `v292NcAvRaceOff` — fix239
- `v292NoTagJudgeOff` — index.html
- `v292ProxyOff` — fix247, fix336, fix476, fix491
- `v292PsychMergeOff` — fix244
- `v292PublicAiOff` — fix886
- `v292QuasiCastOff` — fix277
- `v292QuotaGuardOff` — fix228
- `v292ReactVoiceOff` — index.html
- `v292RecentDlgAuthOff` — fix221
- `v292ReconcileOff` — fix66
- `v292ResetModalOff` — features
- `v292SaveExportOff` — fix291, fix721
- `v292ScrollGuardOff` — fix66
- `v292SeedOff` — fix192
- `v292SelfMimicOff` — fix192
- `v292SettingsTabsOff` — fix275
- `v292ShortGateOff` — index.html
- `v292SlotGenOff` — fix228
- `v292SpiceOff` — fix192
- `v292StoreSlotIsoOff` — fix246, fix746
- `v292SuspenseOff` — fix192
- `v292TagFixOff` — index.html
- `v292TooltipsOff` — fix288
- `v292TopbarCollapseOff` — fix243
- `v292TopbarUiOff` — fix270
