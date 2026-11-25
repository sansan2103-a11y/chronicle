# FIX_INDEX — Chronicle fix 辞典（開発担当向け）

> 下書き（laneDOCS・2026-10-31・第 1 段。2026-11-01 に 80-int-a、続けて 81-admg-a、82b-iconux-b、83-flow-c、MSW1-c、2026-11-02 に 84-b37g-a、85-imgsafe（Worker だけ）、86-lc1ox-d、87-lc1ox2-a、Worker v46.28-r1920b-fc、89-r1920-b、90-a、2026-11-03 に 90-b、Worker v46.29-rphold-fc、Worker v46.30-public-fc と管理者画面 `53e2d067`、91-b、92-a、2026-11-03 に 93-a（MIDICON3 mx3-d・Worker `v46.30-public-mx3c-fc`・管理者画面 `abd3084d`）、2026-11-07 に 93-b、Worker `v46.31-diag1b-fc`、管理者画面 `5c9c9f28`、Worker `v46.33b-limit1-fc`、管理者画面 `18594749`（admhub1）、93-c 、2026-11-07 夜に Worker `v46.34b-ready1-proarg-fc`・管理者画面 `e5198d0a`・93-d（ISO1e）・93-e（OPEN1・READY1 の端末側）、2026-11-08 に 93-f（npcq1 C2）、Worker `v46.35b-custimg1-fc`・管理者画面 `a2ea35ca`（ADMBULK1）、Worker `v46.35c-hang1-fc`、93-g（SETUI1・BOOTOFF1・NEWACCT1）、Worker `v46.35d-initslow1-fc`（INITSLOW1）、Worker `v46.36-wmxreg-fc`（W-MXREG・`midicon1` を READY に）・管理者画面 `f2258e33`、93-h（HOMERETRY1・OLDMX1・IDSPLIT2・GENDER1）、2026-11-09 に Worker `v46.37-keys-fc`（鍵 `starticon1`・`idsplit2`）・管理者画面 `752c623a`・93-i（STARTICON・W-MXREG の端末側・IDSPLIT2 の鍵）の出荷を反映）。
> **基準（2026-11-16・GitHub HEAD `9e585fb`・版 `20261115-contract1`）**：`bea6bae` の上に 7 コミット。HIDE2 撤去（`d39414c`）→ DISCARD2（`ad76fd4`・手動専用）→ AUTOCLEAN1（既定 OFF）・STORYSIZE1（`a0e0323`）→ BEAT2a／BEAT2b（`12e5248`・既定 OFF・実験）→ CLEANUP3（index.html の読み込み 12 本とコメントの行 6 本を外した）・DELETE141（参照の無いファイル 141 個を GitHub から削除）（`7d927e5`）→ PRUNE3（既定 OFF・実験）・HDRNL1（既定 ON）（`e5d5d30`）→ CONTRACT1（`9e585fb`・既定 OFF・実験）。index `38fcffeb`・home `f842197a`・version `9f32354a`（GitHub HEAD の実物。本番の読み戻しは、この資料では未確認）。新しいファイル 3 本（付録 A の #413〜#415）。
> **基準の本番（2026-11-16・GitHub HEAD `3c57fc3`・版 `20261115-fear2r2`）**：11-15 の基準（`9a74d7d`）の上に 4 コミット。STATE4（`019686c`）→ FEAR1・QUOTE1・PLACE1 r7（`fbbff01`）→ ARM2・CHEAD1・ST4B・OPT1・FEAR2 r1（`3ec9d68`・FEAR2 は既定 OFF で出荷）→ FEAR2 r2 を全員既定 ON・PLACE1 r8（`3c57fc3`）。index `f94b27a1`・home `169a1dc1`（BUILT／HOME_BUILT だけ）・version `bd6f148d`（GitHub HEAD の実物。本番の読み戻しは、この資料では未確認）。新しいファイルは無い。戻し先は各コミットの 1 つ前。
> **基準の本番（2026-11-15・GitHub HEAD `9a74d7d`・版 `20261115-state3`）**：11-12 の基準（`8311948`）の上に、11-12〜11-15 の出荷 41 コミット（GitHub `e4d982e`〜`9a74d7d`）。index `a19bd431`・home `c0094670`・version `23938ae5`・features.js `3f128dee`（いずれも GitHub HEAD の実物から取った。**本番の読み戻しは、この資料では未確認**）。新しいファイル 17 本（付録 A の #394〜#410）。GitHub の順（要約）：KEY1・SOL1（`e4d982e`）→ STORE1b r2（`a46c2f1`）→ ACTOR1・STATEQ1・PURGE1c（`5b8a837`）→ UI3・LAT1（`f2b6d56`）→ UI4・FF1・GC1（`63bfe48`・`9dab027`）→ GC1b・SPK2/HB1（`b385f25`）→ SCENE2 r2c・SEVERE1・DRIVE1・EX192（`c228821`）→ F850Ord（`8f80b0a`）→ CAST1・CALL1・SPK3、SCENE2 の天候の控えを撤去（`ea768d0`・`0c70ca2`）→ LEAK1・NUM1（`d24bbd5`・`7338a53`・`0a44c44`）→ SEVERE1 r3（`494b09c`）→ LIM1（`2361a19`・Worker `v46.45-lim1-fc`）→ STUCK1（`e37f802`）→ LEAK1 の適用を既定 ON（`452285c`）→ ICONFIX2（`2317dbe`）→ SAVE1＝REG1・SD1・LSF1・ZT1（`972330d`）→ GUIDE1（`6b22963`）→ ICONFIX3（`19fe4f4`）→ HEROVOICE1（`747a505`・`85b3be2`）→ ECHO1（`5a13762`・`72a7237` で撤去）→ MXREGFIX1（`2e37066`）→ PLACE1 r1〜r6（`f35a302`・`340c495`・`8ff0354`・`53fbdfd`・`72ab286`・`9a74d7d`）→ ERRNOTE1（`4f0f2b1`）→ RETRY1（`72a7237`）→ SPKW1・SPKW1b・SPKW2・KANA1（`802ef66`・`650cff9`・`11493dc`）→ FREE2・FREE2c・FREE2d（`650cff9`・`2e6e2c9`・`72ab286`）→ OWNERON1（`2b3271e`）→ RETRY2（`248cc36`）→ LEAK2（`9cf5e24`）→ FANOUT1（`2e6e2c9`）→ STATE3・FIX850A・CARD80（`9a74d7d`）。Worker は LIM1 の `v46.45-lim1-fc` までをコミットの文と端末のコードで確認（それより後の Worker の版は、この資料では未確認）。戻し先は各コミットの 1 つ前。
> **基準の本番（2026-11-12）**：11-11 の FLOW3（GitHub `e484735`）の上に、11-11 夜〜11-12 朝の出荷（読み戻しの結果は出荷の記録を正とする。GitHub の版はブランチ `v292-rebuild` の履歴から取った）。現在の本番 HEAD は GitHub `8311948`。GitHub の順：UI2（`2f04062`・?cb=`20261111-ui2b`。CSS だけの小修正。ホームの主ボタンを 1 つにする規則は Owner 判断で外した）→ PRUNE1（`a085c42`・新しい `v292DfixPRUNE1-sys-prune.js` `f2f590d3`・?cb=`20261111-prune1`）→ CLEANUP1（`4dcd38c`・9 本の読み込みを停止）→ SCENE1＋F333a（`125c261`・fix58 `1603d3c1`・fix192 `0530bb9b`・fix850 `44794344`・features.js `cca12be1`）→ UNPROT（`83a8859`・DL2 `22e0432c`）→ CLEANUP2（`05da4aa`・23 本の読み込みを停止）→ GHOST1（`98cf4bc`・home.html だけ・新しい `v292DfixGHOST1-legacy-slot-ghost.js` `cf49f461`）→ XSS1＋PRUNE2（`b1e2a5d`・features.js `6d812ce8`・新しい `v292DfixPRUNE2-sys-prune2.js` `254f46dd`・?cb=`20261111-prune2`。PRUNE2 は P2c だけ既定 ON）→ SCID2＋F333b（`e70f7d2`・fix820 `edc59752`・fix850 `91e0af75`）→ ICONQ1（`8311948`・NH1 `96ac383f`・LC1 の外見の案 `05b810a0`・?cb=`20261111-iconfix1`。部品名と kill のキーは ICONFIX1 で始まるが、11-01 の Worker の ICONFIX1 とは別件）。Worker：`v46.43-delall-fc` → `v46.43b-sec0-fc`（ソース `457468ed`）→ `v46.44-sec1-fc`（`f345181e`。合言葉・旧ヘッダの認証を退役・画像の配信を厳しく・管理 API は伏字のみ）→ `v46.44b-unprot-fc`（`1c585c24`）→ `v46.44b-unprot-ifx11-fc`（`9878917f`・現行）。管理者画面は ADM3b（手元の `admin/index.html` `7fa89716`・戻し先 `8101b836`）。最終の sha：index `b937cb3e`・home `df9ed280`。Worker と管理者画面の出荷の前後・時刻は出荷の記録を正とする。戻し先は各コミット・各ファイルの 1 つ前。この資料の sha は GitHub `8311948` の実物から取った（Worker と管理者画面は手元のファイルから）。本番の読み戻し・実機は、この資料では未確認（ICONQ1 の実画像の確認だけ §2.9 を参照）。
> **基準の本番（2026-11-11）**：11-10 夜の基準の上に 11-11 の出荷（読み戻しの結果は出荷の記録を正とする）。RESCUEON（GitHub `72df0ea`・fix945 v2.6・退避が既定 ON）→ READYALL（Worker `v46.42-readyall-fc`・ソース `28a36bf0`・鍵 `npres1`・`lc1`・`kn1` を READY に）＋ ADMALL2（管理者画面 `8101b836`・戻し先 `b6e6d211`。一番上に「すべての機能を全員に ON」の箱）→ DELALL（GitHub `8b688f2`・Worker `v46.43-delall-fc`・ソース `15d46408`。知人も自分の物語を削除できる）→ SEEDHERO1＋SEEDNPC1e（`0475772`）→ SAVEUI（`0756755`）→ SCID1（`5c0ba2c`・fix820）→ FLOW2（GitHub `daeb3a9`・STATEAGE1・FRZ1・出荷済み・本番の読み戻し一致）→ FLOW3（GitHub `e484735`・?cb=`20261111-flow3`・FACTS1・CONT1・CLICHE2・DEDUPQ1・出荷済み・本番の読み戻し一致。index `93b91210`）。Worker は `v46.43-delall-fc`（11-11 のこの段の時点。その後は上の 11-12 の段）。戻し先は各コミット・各ファイルの 1 つ前。Owner の台帳 2323〜2330。この資料の sha は GitHub `5c0ba2c` の実物から取った。本番の読み戻し・実機は、この資料では未確認。
> **基準の本番（2026-11-10 夜）**：Pages は 93-m の上に 11-10 午後〜夜の追加出荷 5 件（読み戻しはすべて一致）。AGENCY1b（GitHub `062773c`：fix192 `43364471`・AGENCY1 `b9b0b406`）→ SEEDWORLD1（`05e5c04`：fix873 `f372bda5`・home `74b9efb3`）→ AGENCY1c（`75116dd`：AGENCY1 `0079579c`）→ SEEDNPC1d（`3b4a6fe`：fix873 `90e4744b`・home 最終 `246d1945`）→ SPBASE1（`e71fde6`：av2-data `68243311`・index 最終 `59767f39`・?cb=`20261110-spbase1`。GPT #127-RW の条件付き GO）。最終の sha：index `59767f39`・home `246d1945`・fix192 `43364471`・AGENCY1 `0079579c`・fix873 `90e4744b`・av2-data `68243311`。Worker `v46.40-lore1agency1-fc`・管理者画面 `8f5e0704` は不変。Owner の運用（管理者画面）：`lore1` は全体 ON（11-10 18:18）、`agency1` は Owner だけ ON（11-10 18:15）。戻し先は各コミットの 1 つ前（SPBASE1 → `3b4a6fe` の av2-data `bc08ce7b`・index・home）。version.txt は未確認。
> **93-m 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261110-bundle93-m`（GitHub コミット `73c6ed1`・version `4aacfaee`・index `9765ea16`・home `6cb38f59`。93-l〔GitHub `76b20d2`〕の上に 5 本：fix192 `f229dbc2`（SAY/DO の入力説明の行から AGENCY1 を呼ぶ 1 行）・新ファイル AGENCY1 `v292DfixAGENCY1-player-intent.js` `83d4b781`（`index.html` の fix192 の直後。`home.html` は読まない）・index `9765ea16`（土台 `149dbdac` に BUILT・fix192 の ?cb=`20261110-bundle93-m`・AGENCY1 の読み込み 1 行）・home `6cb38f59`（土台 `488093e4` に HOME_BUILT だけ）・version `4aacfaee`。本番の読み戻しで 5 本とも一致（2026-11-10 午後））。Worker `v46.40-lore1agency1-fc`・管理者画面 `8f5e0704` は 93-l のまま（鍵 `agency1` は 93-l で配線済み）。AGENCY1 は既定は影（送信は 93-l とバイト一致）。本物の AI の A/B は未実行。戻し先：Pages は 76b20d2 の同名 4 本（index `149dbdac`・home `488093e4`・version `d9a3bbe8`・fix192 `6fbdcca4`）を戻し、AGENCY1 のファイルを消す（残しても 93-l の index は読まない）。
> **93-l 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261110-bundle93-l`（GitHub コミット `76b20d2`・version `d9a3bbe8`・index `149dbdac`・home `488093e4`。93-k〔＋SEEDNPC1c・BEAT1＝GitHub `e9606a8`〕の上に 6 本：fix459 `5175518c`（MARKERS に 2 つ）・ADMF1 `8e51e63e`（鍵 `lore1`・`agency1` を知る）・新ファイル LORE1 `v292DfixLORE1-world-lore.js` `34c9217d`（`index.html` の最後・KN1 の後。`home.html` は読まない）・index `149dbdac`（土台 `a51256f5` に BUILT・LORE1 の読み込み 1 行・fix459 と ADMF1 の ?cb=`20261110-bundle93-l`）・home `488093e4`（土台 `8a0da98a` に HOME_BUILT だけ）・version `d9a3bbe8`。本番の読み戻しで 6 本とも一致（2026-11-10 昼））＋ Worker `v46.40-lore1agency1-fc`（ソース `09b9103d`。ルート JSON の `workerBuild` で確認。v46.39 からの変更は 4 か所：`CHR_ACCT_FLAG_KEYS` に `lore1`・`agency1`〔11 → 13 個〕・`CHR_ACCT_FLAG_UNSET` で両方 `'off'`・`CHR_FEAT_SCOPE` で両方 READY・`workerBuild`）＋ 管理者画面 `8f5e0704`（`lore1`・`agency1` の行・READY・一括の対象外。読み戻し一致）。`agency1` は鍵の配線だけ（端末側の本体は別レーン・GPT #127-RS）。戻し先：Pages は e9606a8 の同名 5 本（index `a51256f5`・home `8a0da98a`・version `af33aa91`・fix459 `8243a236`・ADMF1 `697272e3`）を戻し、LORE1 のファイルを消す（残しても 93-k の index は読まない）。Worker は `v46.39-kn1-fc`（`06776d69`）。管理者画面は `d2e83021`。
> **93-k〜BEAT1 時点の本番（1 つ前の基準。以降に変わったものは上に書いた）**：Pages `20261110-bundle93-k`（GitHub コミット `c260582`・version `af33aa91`・index `4e7d32d3`・home `eb166fb1`。93-j の上に 7 本：fix873 `486d4b7c`（SEEDNPC1b：「いっしょに出る人」の説明だけの人は名前を空にして AI に名前を付けさせる）・STARTICON `9b626070`（キャラ一覧を開いたままでも 1 回の再読み込みへ進む・読み直し後に一覧を開き直す・一覧の行の「絵あり」を読み直してもらう）・LC1 作業欄 `f4564ac3`（読み直しの口 `refreshPtr`）・av2-portrait `8c744237`（RENAME1：名前を変えた NPC の会話ログ・設定の丸に絵を出す。表示だけ）・index（BUILT と変えた 3 本の ?cb=`20261110-bundle93-k`）・home（HOME_BUILT と fix873 の ?cb）・version。本番の読み戻しで 7 本とも一致（2026-11-10 JST））。Worker `v46.39-kn1-fc`・管理者画面 `d2e83021` は 93-j のまま。戻し先：93-j の同名 7 本（fix873 `e29e2d50`・STARTICON `5f092874`・LC1 `aea27e80`・av2-portrait `e3e3f498`・index `38f7c45a`・home `e37fa094`・version `0739b145`）。消すファイルは無い。**その後 SEEDNPC1c（GitHub `854cb71`）**：fix873 `486d4b7c`→`2b7add30`・home `eb166fb1`→`8a0da98a`（fix873 の ?cb だけ）。version・index は 93-k のまま。戻しは 93-k の 2 本。**その後 BEAT1（GitHub `e9606a8`）**：fix66 `9dda0a16`→`48d98f7f`・index `4e7d32d3`→`a51256f5`（fix66 の ?cb だけ）。戻しは 854cb71 の 2 本。
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
  - 2026-11-11 の PRUNE1・PRUNE2（index の 5・6 番目）と、CLEANUP1・CLEANUP2（index.html から 32 本を停止）で、`index.html` の `i` 番号はさらにずれた。新しい行（付録 A の #390〜#393）は、位置を言葉で書いた。
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
| 生成の中心・プロンプト | features.js、fix192、fix226、fix379、FLW4、fix459（RW1・BEAT2）、PRUNE3、HDRNL1、CONTRACT1、smrc1、MSW1（Worker）、BF1、fix80、fix247、PRUNE1、PRUNE2、SCENE1（NOW1・FACTS2・STATE2）、ACTOR1、HEROVOICE1、LEAK1・LEAK2・OPT1、NUM1、PLACE1、CAST1・CALL1・SPK3、SEVERE1・DRIVE1・EX192（SEVDRV）、ECHO1（撤去）、CARD80、RETRY1・RETRY2、FANOUT1 |
| NPC・キャラ状態 | fix77、fix305、fix333、fix414、fix145、fix298、fix277、fix307、fix641、fix853、CP1、NPRES、E64、fix797、F333a・F333b（fix850）、STATEQ1（PH1・SREP1・POSE1）、STATE3、STATE4・ST4B（fix77）、FEAR1・FEAR2・ARM2・CHEAD1・EYE1・LEG1（fix414）、FIX850A・F850Ord（fix850） |
| 話者・会話ログ・編集 | fix66、fix469、fix465（RW1）、IDSPLIT2、fix606、fix611、fix620、fix957、SFL1、SFLTap、EDIT01、EDLOG、EDN（inline）、fix295、SPKW1・SPKW2・QUOTE1、KANA1・FF1（index.html）、SPK2・HB1 |
| 記憶 | fix135、fix313、fix314、fix670、fix796、fix793、fix905、fix950/953、RC1 |
| 保存・同期 | fix246、fix228、fix525、fix527（FLW5）、fix543、fix654、fix399、fix402、fix590、fix826、fix697、fix702、fix705、fix743/750/756、fix781、fix758、fix912、fix945、fix859、fix564/721/726/291、WKRHANG1・INITSLOW1（Worker）、REG1・LSF1（SAVE1）、GC1・GC1b（fix912）、KEY1、SOL1 |
| 削除・墓標 | DL2、fix933、fix587、fix579、fix602、fix660、fix577、fix710、fix642、JR1、UNPROT（DL2）、DISCARD2・AUTOCLEAN1（STORE1b）、SD1・FREE2（DL2）、STORE1b（PURGE1c・P0-B・STUCK1・ZT1・FREE2c/d・DISCARD1） |
| Vault・ユーザー分離 | vault2-sendgate、vault2-copygate、vault2-ui、LE4、fix889（BOOTOFF1）、iso2、ISO1、fix946 |
| 認証・アカウント | fix893、ADMF1、fix328、fix886/890、bav2-beta、FRIEND1・LIMIT1（Worker・管理者画面）、ADMHUB1・ADMBULK1（管理者画面）、MXALL（Worker・管理者画面 `f2258e33`）、鍵 `starticon1`・`idsplit2`（Worker `v46.37`・管理者画面 `752c623a`）、SEC0・SEC1・UNPROT（Worker）、ADM3b（管理者画面）、LIM1（Worker `v46.45-lim1-fc`・ADMF1）、OWNERON1 |
| アイコン・画像 | av2-data、av2-portrait（FLW1）、av2-migrate-ui、LD1、LC1（APPX1）、ICONUX2、SETAV1、FLW2、ICF、fg3、fix63（fix979b）、fix197、fix523、fix990、p8d、ICONFIX1（Worker）、PUBMODE（Worker・管理者画面）、NDI1、ICF80、MIDICON（OLDMX1）、W-MXREG（Worker・93-i から端末側も）、STARTICON、IMGMODEL1（Worker・管理者画面）、CUSTIMG1（Worker・管理者画面）、DIAG1b（Worker）、ICONQ1（LC1 の外見の案・NH1・Worker。名前は ICONFIX1 で始まる）、ICONFIX2、ICONFIX3、MXREGFIX1（MIDICON） |
| UI・画面 | UI1、IS1、UX72、JMP、FLW3、LE3、fix777、fix243/270、fix880、SETUI1、UI2、XSS1、UI3、LAT1、UI4、ERRNOTE1、HOLDNOTE1、STORYSIZE1、HOLDNOTE2 |
| シナリオ・ホーム | fix819、fix825、fix873、fix335、GENDER1、NEWACCT1・HOMERETRY1（home.html の inline）、SCID2（fix820）、GHOST1、GUIDE1（fix873） |
| 読み込みを止めた部品 | CLEANUP1・CLEANUP2（§2.12。32 本。ファイルは残る）、CLEANUP3（§2.12。12 本。ファイルは残る）、DELETE141（§2.12。141 個を削除） |

---

## 2. 主要 fix の手書き項目

### 2.1 生成の中心・プロンプト

#### features.js — ゲーム本体のモジュール群
- 状態：本番稼働 `i62`・sha `6d812ce8`・?cb=`20261111-xss1`（XSS1 の版。前は `cca12be1`・`20261111-scene1`〔SCENE1 の STATE2〕、その前は `e446efe5`・`20261111-flow3`。この項の元の記載 `143763f8`・`20261025-bundle55-sfl-a` は 55 のときの値）。
- 役割：入力モード（DO/SAY/STORY）、`PromptRegistry` / `UserMessageRegistry` / `Planner._extensions` / `UI._renderHooks` などの登録口、会話ログ抽出、状態推論、表示の仕組み。index.html の中核 inline script（S・Api・Planner・UI・G.submit・保存）と組で動く。
- 注意：`Planner._extensions` は fix192（engineMode=1）では sys に乗らない「死に経路」（`.claude/rules/sys-injection.md`、fix226、fix313 の冒頭に記録）。新しい sys 注入は `Planner.build` を包むか、fix379 の keeper に登録する。

#### FLOW3 — 流れを見失う原因の残り 3 つ（2026-11-11・出荷済み〔GitHub `e484735`・本番の読み戻し一致〕・?cb=`20261111-flow3`）
- FACTS1（fix58 `4e5f780e`・既定 ON・kill `v292DfixFACTS1Off='1'`＝送信バイト同一）：AI に渡る本文は直近 2 ターンだけで、storySoFar は fix75 の重複除去の後「これまで N ターン経過。」になる。user JSON の storySoFar の直後に `earlierFacts`（rule＋items）を足す。items は recentScenes より前の各ターンの「プレイヤーの入力（40 字まで・続きを書くは入れない）」と「本文の数＋助数詞を含む地の文を前から 2 文まで（台詞の中は使わない・1 文 70 字・「一番」は数えない）」で、新しい方を優先して合計 600 字まで。追加の AI 呼び出し 0・保存 0・sys 0 字。rule に「本文で振り返り・言い換え・引用をしない／ここにも recentScenes にも無いことを前にあった事実として作らない」。過去の fix35（sys 末尾に本文の 1 文目を番号付きで並べ「上記の経緯を踏まえ続きを書く」）が語り直し→保存→増幅の反復崩壊を起こした条件（本文の書き出しの列挙・sys 末尾・続きを促す文）を避けた。本文と同じ文が出たら従来どおり fix71 が落とす。
- CONT1（fix443 `710f47dd`・既定 ON・kill `v292DfixCONT1Off='1'`＝送信バイト同一）：「続きを書く」の回だけ、【続きを書く＝物語を"横"に広げる】の「主人公は受け身の観察に留めず…自分から動く（…救出…）」を「前進は世界と NPC の側で起こす。主人公の決定的な行動（救出・脱出・攻撃・重大な決断）は書かず、知覚と身体の反射まで」に、【続きの転換点】の例「状況急変（逃走/拘束変化/治療/別の脅威の出現）」を「（危険の悪化/別の脅威の出現/新しい糸口）」にし、「進行中の危機（宙吊り・拘束・追跡・負傷の悪化など）は、この回で解決させない。…決着はプレイヤーの次の入力に残す」を足す。AGENCY1b の「主人公の台詞（「」）を書かない」が sys に無いときだけ「主人公に重要な台詞も言わせない。」を添える（二重にしない）。前進の指示（新しい要素を 1 つ・一段階進める）はそのまま。sys は CONT の回だけ +112 字（AGENCY1b あり）／+128 字。
- CLICHE2（fix68 `1ed2f6d0`・features.js fix27・既定 ON・kill `v292DfixCLICHE2Off='1'`＝従来どおり）：13 種の言い回し（息を呑・目を見開いた・背筋が凍 等）を含む文・要素を消さない（文は 1 字も変えない。言い回しだけを抜くと文が壊れるため）。fix68 の「1 字以下の行を落とす」filter は従来どおり。
- DEDUPQ1（fix68 に本体・fix27・fix71・fix72・既定 ON・kill `v292DfixDEDUPQ1Off='1'`＝従来どおり）：重複の削除で台詞の中の文を消さない。parse の段階では fix61 が `<say who="X">…</say>` を U+E000 X U+E001 … U+E002 に置き換えていて、各 fix の「台詞か」の判定（「」や <say>）をすり抜け、地の文として全ターン照合・ターン内照合で消えていた（laneFLOW1 A T12「私、ここで待ってる。」の型。Local で再現）。生の応答（raw）の <say>・U+E000 の形・「」『』の中身を台詞の集合にし、文（先頭の話者名を除く）がその中に含まれれば台詞として扱う。同じ台詞が直前の要素と続けて同じ（壊れた連続）ときだけ従来どおり 1 つにする。地の文の重複削除（fix71 の語り直し対策）は変えない。
- 試験（出荷前）：ユニット（node vm）63 件・kill で HEAD とバイト同一。偽 AI の Local ブラウザ（Chromium・WebKit）でページエラー 0・kill で HEAD と全送信と本文がバイト一致。本番の本物の AI で A/B（端末だけの上書き・旧 3 本／新 3 本・56 ターン・$0.61）。
- 既知：SAY の回の主人公ロック（index.html parsePlan の `湊[はがを].{0,20}(殴|刺|掴|捕まえ|蹴|握|縛|押|叫び)`）が行ごと消し、同じ行の NPC の動作も巻き添えになる（本番 A/B で 3 回・9 文）。今回は変えていない。STORY 入力の inputSeed「直後のミクロな展開(0.5〜3秒)」と全体の「状況を一段階進める」の食い違いも未修正（毎ターンの user に入るため A/B が要る）。
- 本物の AI での A/B の事実（出荷版・2 回・標本が小さいので傾向の目安）：5 ターン以上あとに「鍵の本数」を覚えているか＝旧 3 本は 3/3 が誤り、新は 1 本が正解・1 本がほぼ正解。「続きを書く」で危機が自動で解決した割合＝旧 1/7、新 0/7。
- index.html は `93b91210`（上の 6 本の ?cb を 20261111-flow3 にしただけ）。

#### SCENE1 — いまの場面・事実の固定・一般語の傷（2026-11-11・GitHub `125c261`・?cb=`20261111-scene1`）
- NOW1（fix58 `1603d3c1`・fix192 `0530bb9b`・既定 ON・kill `v292DfixNOW1Off='1'`＝送信バイト同一。`v292DfixB38Off='1'` でも止まる）：直前ターン本文の地の文の最後の 2〜3 文（150 字まで）と、この回の入力を、user JSON の recentScenes の直後に `nowScene { rule, text }` として置く。sys には置かない。追加の AI 呼び出しなし。1 ターン目以降、user 側の `scene.location` のキーを「物語開始時の場所・時刻（現在地・現在時刻を保証しない）」と書く（B38-e と同じ。`b38eUser` を NOW1 でも通す）。
- FACTS2（fix58・既定 ON・kill `v292DfixFACTS2Off='1'`＝FACTS1 のまま）：earlierFacts のうち 数・受け渡し・けが・約束／期限 を含む行を新しい方から 5 行まで固定し、残りを新しい行で埋める（600 字）。寸法・指の数だけの文は拾わない。
- STATE2（fix192・features.js の fix190・既定 ON・kill `v292DfixSTATE2Off='1'`＝送信バイト同一）：部位も原因も無い 傷（「負傷している」等）を【各キャラの現在の状態】に載せない（保存値は変えない）。fix190 の captureExt も同じ判定の 傷 を取り込まない（`window.__v292DfixSTATE2.generic`）。未解決は STATEAGE1 の数え方で 3 ターン以上同じ値なら「N ターン前の様子」の側へ（`v292DfixSTATEAGE1Off` で従来）。
- 本物の AI での効果は、この資料では未確認。

#### fix192 — 新プロンプトエンジン（生成の sys を丸ごと差し替える）
- 状態：本番稼働 `i105`・sha `0530bb9b`・?cb=`20261111-scene1`（**SCENE1 で NOW1・STATE2 を入れた版**。GitHub `125c261`。前は `58b7acbd`・?cb=`20261111-flow2`〔**FLOW2 で STATEAGE1 を入れた版**。GitHub `daeb3a9`・本番の読み戻し一致〔出荷済み〕〕。さらに前は `43364471`・?cb=`20261110-agency1b`〔AGENCY1b で STORY の方向づけの行からも AGENCY1 を呼ぶようにした版〕。その前は `f229dbc2`・?cb=`20261110-bundle93-m`〔93-m で AGENCY1 を呼ぶ 1 行を足した版〕。その前は `6fbdcca4`・?cb=`20261107-bundle93-f`〔93-f の npcq1 C2〕。さらにその前は `931d1310`・?cb=`20261101-bundle79-npres73d4b-on78c`＝80-int-a で NPRES の gate を呼ぶようにした版）。
- 93-m：buildSys の SAY/DO の入力説明の行（`inputLine`。B38-a の後）で `window.__v292DfixAGENCY1.suffix(m, inputLine)` を呼び、文字列が返ったら行の末尾に足す（try/catch。新ファイルが無い・例外・文字列以外 → 何も足さない）。STORY・続き・オートでは呼ばない（93-m の時点）。
- AGENCY1b（`20261110-agency1b`）：STORY の方向づけの行にも suffix を呼ぶ。続き・オート（入力説明の行なし）は blocks に 1 ブロック足す。
- npcq1 C2（93-f・Owner だけの CANARY）：「入力を待たず NPC から言葉を発してよい」の文に「（ただし A は重傷・強い恐怖で動きが縛られているため除く）」を 1 つ付ける。有効なのは画面のアカウントが owner かつ active（fix893 の `/auth/me` の答え。ISO1・RC1 と同じ読み口）で匿名の経路でないときだけ。毎回評価する。招待した知人（beta）・none・suspended・ログアウト・匿名・`/auth/me` の未応答・例外では 93-e と同じ出力（Local の試験で sys の SHA が一致）。kill `v292Dfix192LicOff='1'`。H2（【制約】を最優先にする変更）は入っていない。
- 役割：`Planner.build` を最も外側で包み、`engineMode=1` のとき sys を「良い 1 ターンの形＋見本」の短い指示へ差し替える。進行度・台詞量・続きの検知・キャラ状態（fix77 の store を直接読む `stateBlock`）・記憶の文字列（fix796 から）を自分で注入する。出力形式（`<say>` / `<react>` / `<state>` タグ）は旧エンジンと同じ。
- engineMode の決まり方：`S.cfg.engineMode` が主、無ければ localStorage `v292EngineMode`。**新しい物語での既定値は 1 になる見込み（コードを読んだだけ・未実測）**：fix317（`v292Dfix317-slot-leak.js`）の `syncSelectors` が、物語の切り替えのときセーブの cfg に engineMode が無ければ既定値 1（`def:1`）を `S.cfg` に入れる（台帳 2230）。fix192 自身の既定は 0＝従来。実機での確認は未。
- 依存：fix77（store）、fix796（記憶）、fix226（旧エンジン用注入の退役）、fix379（keeper）。中に後から足された分岐が多い（fix812/813/832/903/930/932/956、A1、B0、B38、GQ2 など。スイッチは付録 C）。
- STATEAGE1（laneFLOW2・2026-11-11・出荷済み〔GitHub `daeb3a9`・本番の読み戻し一致〕・既定 ON・kill `v292DfixSTATEAGE1Off='1'`＝送信バイト同一。`v292DfixSTALE1Off` とは別物）：【各キャラの現在の状態】の組み立てだけを変える。直前のターンで更新されなかった その瞬間の値（からだ・こころ・本能・目的）と、持ち物・姿勢・接触を表す 関係 は、行の末尾へ移して「（N ターン前の様子・今も同じとは限らない）」を付け、付いたときだけ「直近の本文と食い違うときは本文を正とし、反応の前提にしない（傷はそのまま引き継ぐ）」の 1 行を添える。傷・ほかの関係・未解決は従来どおり。経過は fix77 の entry.turn（parse 時＝push 前の S.turns.length）から、項目ごとの経過は画面のメモリ（保存しない・物語が変われば捨てる・読込直後は entry.turn とみなす）。保存値・store・Worker は不変。試験：ユニット（node vm）・偽 AI の Local ブラウザ 6 ターン（最終送信で確認・kill で HEAD と全送信バイト一致）・本番の本物の AI で A/B（端末だけの上書き・各 2 本 × 8 ターン）。A/B の結果：古い状態が本文に漏れたターンは、旧版 2 ターン → 新版 0 ターン（2 本 × 8 ターン。標本は小さい）。
- 既知の問題（laneNPRES 2026-10-31・合成物語で実測）：`stateBlock` は store の**全員**の状態を、何ターン前のものでも載せる。退場した NPC の様子が sys に残る。→ **NPRES が ON のアカウントでは抑制**（場面にいない／未確認の人物の からだ・こころ・本能・目的を載せず、【この場面の種】【自発】の候補からも外す。80-int-a）。**OFF のアカウントでは従来どおり**。NPRES の効果の本番での長ターン確認は未確認。

#### fix226 — 旧エンジン用 sys 注入の退役
- 状態：本番稼働 `i108`。役割：engineMode=1 で無駄に計算されていた旧注入（fix74/71/76/77/69/79/82 の sys 側）を、印を保ったまま無害な関数に置き換える。parse 側は残す。戻し：`v292EngineUnifyOff='1'`。

#### fix379 — wrap-keeper（sys 注入の登録簿と予算）
- 状態：本番稼働 `i195`・sha `6f406375`・?cb=`20261101-bundle83-flow-c`（83 で更新：【キャラ属性】の「名前=性別」の後ろに FLW4 の `suffix()` を足す。fix366 の予備経路も同じ）。
- 役割：sys 注入ブロックを `window.__f379reg` に `{off, marker, text}` で登録すると、毎ターン確実に、優先度つきの文字数予算の中で注入する（build の包みが外れる競合の根治）。
- 注意：予算からあふれた低優先のブロックは黙って落ちる前歴あり（記憶メモ「keeper 予算飽和」）。新しいブロックを足すときは実際の sys を傍受して確かめる。スイッチ：`v292Dfix379Off`・`v292Dfix379V4Off` ほか。
- FLW4（`v292DfixFLW4-cast-age.js`・83 の番号で `i360`・sha `e2b2877a`・?cb=`20261101-bundle83-flow-c`）：NPC の説明文（または構造化された `n.age`）に本人の年齢がはっきりあるときだけ、【キャラ属性】の「名前=性別」の後ろに「・17歳」を足す（FLW4-r2）。他人・過去・幅の書き方、2 つ以上の違う年齢、台詞の中、推測（「少女」「十代」など）からは足さない。主人公には足さない。保存・通信 0。kill `v292DfixFLW4Off='1'`（送信ごとに評価）。ほかの sys ブロック・予算・マーカーは変えない。

#### fix459 — sys の重複クラスタの統合
- 状態：本番稼働 `i260`・sha `5175518c`・?cb=`20261110-bundle93-l`（93-l で MARKERS に 2 つ足した。前は `8243a236`・?cb=`20261019-bundle31-a`）。役割：話者の同一性・出力形式・展開の進め方などで重複していたブロックを 1 つにまとめる。スイッチ：`v292Dfix459Off`、クラスタ別 `v292Dfix459AOff`〜`DOff`。
- 93-l：MARKERS に `【世界設定・参照データ】`・`【世界設定ここまで】` を登録（LORE1 のブロックが直前のブロックへ吸収・道連れ削除されないように）。sha `8243a236` → `5175518c`・?cb=`20261110-bundle93-l`。LORE1 が足さないときは組み替えの結果が従来とバイト一致（Local）。
- RW1（11-15・GitHub `fac7b6e`・既定 ON・kill `v292DfixRW1Off='1'`）：役割名→登録名の対応表（roleMap）で、説明文の「主人公」を役割語「主人」に数えない（店の主人・宿の主人・ご主人は従来どおり）。fix465 も同じ鍵。
- HIDE1 r1（11-15・GitHub `fac7b6e`・既定 OFF・鍵 `v292DfixHIDE1On`）：隠し事のある物語だけ【展開】に 1 文を足す試験。実 AI の A/B で不採用、HIDE2 で撤去済み。
- HIDE2（GitHub `bea6bae`・既定 OFF・鍵 `v292DfixHIDE2On`／`v292DfixHIDE2Off`）：隠している事実のある物語だけ fix192 の開示を促す文を置き換える試験。**不採用・撤去（2026-11-15・GPT #127-UL）。対策案としての HIDE1/HIDE2 を閉じただけで、秘密の先漏れの問題自体は未解決（実プレイで再現したら原因側から）**。撤去後の fix459 は RW1 だけの fix459 とバイト一致。

#### PRUNE1 — 最終 sys の当て布の整理（重複を外す・食い違いをなくす・危機を優先。`v292DfixPRUNE1-sys-prune.js`）
- 状態：本番稼働（2026-11-11・GitHub `a085c42`）・sha `f2f590d3`・?cb=`20261111-prune1`・版 `prune1-20261111-c`。既定 ON。`index.html` の先頭近く、CP1-final-tap の直後（PRUNE2 の次。fetch を包む部品の内側＝fix459・fix441・fix443・fix514 など sys を書き換える部品がすべて済んだ後に当たる）。`home.html` は読まない。
- 中身：物語生成の送信だけ（sys に ＜あなたの役割＞・【出力の形式】・【話者】・【文体】があるもの＝fix459 の組み替え後）を対象に、決まった文字列だけを外す／差し替える。見つからない文はその 1 手だけ何もしない。
  - 外す（別の場所に同じ規則がある 6 つ）：【反復の禁止】／【出力の鉄則】／【展開】の ①〜④ の行（fix500 と同じ）／【守ること】末尾「同じ語・同じ言い回しを連続で繰り返さない。」／【読みやすさ】2 行目／【描写の芯】5 行目（物理的に破綻させない）。
  - 言い換える（7 つ）：【展開】「まだ出していないものを一つ動かす」→「場面を一つ動かす。危機の最中はその危機そのものを動かす」／【読みやすさ】「各キャラの反応」→「それへの反応」／【反応と身体】「場にいるキャラは毎ターン…反応する」→「反応を描くキャラは…（毎ターン全員を順に反応させなくてよい）」／【描写の芯】3・4 行目を短く（「傍観者はその後に短く」を外す）／fix333【この一手で前面に出す人物】「局所反応か小さな動きを一つだけ」→「具体的な反応を一つ…別の用事に逃さない」／【背景の人物】→「平常の場面では前面化しない。変化がある時だけ一句で示す。」
  - 進行エンジン 3 行 → 入力の回「入力の直後を描き、状況が一つ動いたところで止める（時間を飛ばさない・場面を変えない・関係のない新しい出来事を足さない）」／続きの回「【続きを書く】【続きの転換点】に従って局面を一つ進める」。入力の回は【物語の推進＝標準】を外す（弱め・強めは触らない）。
  - 【自発】の人物ごとの定型文を 1 行にまとめ「危機の最中は持ち出さない」を添える（fix812 の文が出ているときだけ）。
  - 【危機のとき】を ★最終判断の直前に新設（4 行）：掴まれる・吊られる・拘束・重傷・襲撃の最中は前面／背景の区別をやめ、場にいる全員がまず危機に向き合う／危機と関係のない行動・台詞を書かない（目的・欲求・未解決・psychAnchors より先）／続きの回の新しい要素も危機に関わるものに／順番に一言ずつ叫ぶ形にしない。
  - user 側：inputSeed.instruction の「次の3秒…0.5〜3秒の範囲を超解像で」→「このターンの起点…直後に起きることを、結果が一つ出るところまで（時間は飛ばさない）」／deltaInstruction「直後だけを描写」→「直後から描写（結果が一つ出るところまで）」。
- 触らない：安全に関わる文／役割／【出力の形式】／<state> <say> <react> <scene_move> の契約／見本／【話者】【話者タグの徹底】【出力の掟】の <say> の文／【キャラ属性】【口調】／【各キャラの現在の状態】／【身体状態・正史】／【制約】／世界設定・記憶・設定カード。元の部品（fix192・fix333〔保護〕・fix440・fix443・fix459・fix58・features.js）は PRUNE1 の出荷で変えていない。AI の呼び出しは増えない。
- 止める：端末の kill `v292DfixPRUNE1Off='1'`（毎回評価・再読み込み不要・リクエストのオブジェクトをそのまま渡す＝送信バイト同一）。localStorage が読めないときも何もしない。fix459 を切っているとき（`v292Dfix459Off`）も何もしない。
- 診断：`window.__v292DfixPRUNE1.last()`（直近の before/after 字数・当てた手の名前）・`.stats()`・`.VER`。本文・入力文は残さない。
- 戻し方：`index.html` から 1 行消し `v292DfixPRUNE1-sys-prune.js` を消す（保存データ・Worker は触っていない）。
- 既知の注意：①fix333 の【身体状態・正史】が人違いで出ているとき、【危機のとき】がそれを強める疑いがあった（主人公の姿勢が引きずられた例）。身体状態の人違いは F333a・F333b で減らした（§2.2 fix333）。②ほかの部品が対象の文を 1 字でも変えると、その手は黙って当たらなくなる（`.last().ops` で確認）。

#### PRUNE2 — 最終 sys／user の整理・第 2 弾（出荷したのは user 側の P2c だけ。`v292DfixPRUNE2-sys-prune2.js`）
- 状態：本番稼働（2026-11-11・GitHub `b1e2a5d`）・sha `254f46dd`・?cb=`20261111-prune2`・版 `prune2-20261111-a`。`index.html` の CP1-final-tap の直後・PRUNE1 の直前（＝PRUNE1 の後・tap の前に当たる。順が逆でも結果は同じ）。`home.html` は読まない。**既定で ON なのは P2c だけ**。P2a・P2b は作ってあるが既定 OFF（本物の AI の比較が 1 本ずつで保留したため）。端末キー `v292DfixPRUNE2aOn='1'`・`v292DfixPRUNE2bOn='1'` を入れた端末だけ ON になる。
- 中身：物語生成の送信だけ（sys に ＜あなたの役割＞・【出力の形式】・【話者】があるもの）を対象に、決まった文字列だけを差し替える。見つからない文はその 1 手だけ何もしない。3 つのスイッチは独立。
  - P2c user 側（**既定 ON**）：末尾の【プレイヤー入力の逐語反映 — 厳守】を短くする（逐語・言い換えない・敬体↔常体を変えない・固有名詞と小道具を省かない・再演しない、は残す）／psychAnchors の注記から決まり文句の列挙を外し「場面がそれに触れたとき」にする。
  - P2a 話者・書式（既定 OFF）：<say> の細則を末尾の【話者タグの徹底（最優先）】（fix514 のブロック）1 か所に、箇条書きと例 1 つでまとめる。【出力の形式】の <say> の 2 項は核の 1 文（必ず <say>・裸の「」を置かない）に、【出力の掟】の「キャラの発話は必ず…」と【話者】の 2 項（役割名で who を書かない／主人公への返答は本人の <say>）は外す。3 つの錨（【出力の形式】の 2 項・【出力の掟】の 1 項・fix514 のブロック）が全部あるときだけ当てる。
  - P2b 見本と種（既定 OFF）：見本 A を外す（見本 B・ミニ見本は残す。長文の見本には当てない）／【プレイヤーの種】【NPCの登場】を短くし「危機の最中に持ち出さない／増やさない」を添える／fix512 の「自分自身を『先輩』と呼ばない」→「呼びかけるセリフの who は、呼ばれた相手ではなく呼んだ本人」。
- 触らない：見出し（【出力の形式…】【話者】【出力の掟】【話者タグの徹底（最優先）】【プレイヤーの種】【NPCの登場】【プレイヤー入力の逐語反映 — 厳守】）／<react> <state> <scene_move> の契約／【セリフと物音の区別】／【話者】の登録名の一覧・悲鳴の帰属・代名詞の項／psychAnchors のデータ。元の部品（fix192・fix306・fix363/379・fix459・fix512・fix514・features.js）と PRUNE1 のファイルは変えていない。AI の呼び出しは増えない。
- 止める：端末の kill `v292DfixPRUNE2Off='1'`（3 つとも。リクエストのオブジェクトをそのまま渡す＝送信バイト同一）／`v292DfixPRUNE2aOff`・`v292DfixPRUNE2bOff`・`v292DfixPRUNE2cOff`（個別）。毎回評価・再読み込み不要。localStorage が読めないとき・fix459 を切っているときも何もしない。
- 診断：`window.__v292DfixPRUNE2.last()`（直近の前後の字数・当てた手 ops / uops・有効なスイッチ）・`.stats()`・`.flags()`・`.VER`。本文・入力文は残さない。
- 戻し方：`index.html` から 1 行消し `v292DfixPRUNE2-sys-prune2.js` を消す（保存データ・Worker は触っていない）。
- 既知の注意：①ほかの部品が対象の文を 1 字でも変えると、その手は黙って当たらなくなる（P2a は錨が 1 つ変わると丸ごと当たらない）。fix512・fix514・fix459 blockA/B・fix306・fix363/379・features.js の verbatim／fix24 の注記を変えるときは PRUNE2 の文字列も合わせる。②P2a・P2b を端末で ON にした本物の AI の比較は、この資料では記録が無い（未確認）。

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

#### LORE1 — 世界観メモ（scene.lore）を毎ターンの sys へ参照データとして届ける（93-l・鍵 `lore1`。`v292DfixLORE1-world-lore.js`）
- 状態：本番稼働（11-10・93-l）。既定は影モード（組み立てて診断だけ残し、送信には足さない＝e9606a8〔93-k〜BEAT1〕と送信がバイト一致。Local の実測）。本物の AI の A/B は未実行。`index.html` の最後（KN1 の後。`home.html` は読まない）・sha `34c9217d`・?cb=`20261110-bundle93-l`・版 `lore1-20261110-b`。GPT #127-RQ ② 案 A。
- 公開の範囲：ADMF1 の鍵 `lore1`（Worker `v46.40-lore1agency1-fc` で READY・行なしかつ全体の値なし＝OFF）。管理者画面の行・全体のボタンだけで切り替える（「全機能を一括 ON」「まとめて ON」の対象外＝noBulk。A/B と Owner の実プレイの後に全体を ON にする）。運用：Owner が管理者画面で全体 ON にした（11-10 18:18）。端末キー `v292DfixLORE1On='1'` でも足す（試験用。管理者画面の行 0 より強い＝止めたい端末は Off を使う）。
- 背景：93-j まで、世界観メモ（設定画面の🌍世界観）は毎ターンの送信に入っていなかった（旧 base sys の【世界設定】は fix192 の buildSys 差し替えで落ちていた。laneLORE1 の実測）。lore が間接に届くのは fix444【世界の掟】（禁止の文を言い換えて最大 2 件）だけだった。
- 中身：fix379 keeper に prio1（予算外）で `\n【世界設定・参照データ】<固定の制御文>\n<lore>\n【世界設定ここまで】\n` を 1 ブロック。Planner.build は包まない。lore は送る時だけ ①GM 専用の節を外す（fix444g／fix951 r2 と同じ規則）②今有効な構造の見出しと完全一致する所だけ〔〕へ（fix822 と同じ。【種】などはそのまま）③400 コードポイントを超えたら上限内の最後の文の終わりで切る（文の終わりが無ければ 400 で切る）。保存原文は変えない。fix444 が掟として抜く文も lore 側にそのまま残す（既定）。S にも保存にも書かない。
- 判定の順：kill `v292DfixLORE1Off` ＞ Vault で隠した物語（fix889・KN1 と同じ・fail-closed）＞ 鍵 `lore1`（ADMF1 が鍵を知っていて gate('lore1') が true）または端末キー `v292DfixLORE1On='1'` ＞ それ以外は影。ADMF1 が古い・無い・答え待ち（読み込みから最長 10 秒）・Worker が鍵を返さない・ADMF1Off・gate が例外は影（fail-closed）。fix459 が見出しを知らない古い版のときも足さない。
- 止める：管理者画面で `lore1` を 0（アカウントか全体）。端末の kill `v292DfixLORE1Off='1'`（次の build から・再読み込み不要）。診断 `window.__v292DfixLORE1.status()`（mode・admf・長さ・切ったか・ハッシュ・keeper で入ったか・送信前の sys に 1 回あったか。本文と物語 ID は残さない）。A/B 用 `v292DfixLORE1LawDedup='1'`。

#### AGENCY1 — SAY/DO の回に「入力されていない主人公の意図・発話内容を確定しない」1 文（93-m・鍵 `agency1`。`v292DfixAGENCY1-player-intent.js`）
- 状態：本番稼働（11-10・93-m → AGENCY1b → AGENCY1c）。現在は sha `0079579c`・?cb=`20261110-agency1c`・版 `agency1-20261110-c`（1b は `b9b0b406`・`agency1-20261110-b`、93-m は `83d4b781`・`agency1-20261110-a`）。Owner の運用：管理者画面で Owner だけ ON（11-10 18:15。案 A）。下の「既定は影」は 93-m 出荷時の記述。既定は影（文を足さない・足すはずだった事実だけ記録。送信は 76b20d2〔93-l〕とバイト一致＝Local の実測）。本物の AI の A/B は未実行。`index.html` の fix192 の直後（`home.html` は読まない）・sha `83d4b781`・?cb=`20261110-bundle93-m`・版 `agency1-20261110-a`。GPT #127-RS ②。
- 中身：fix192 buildSys の SAY/DO の入力説明の行（【プレイヤー入力＝主人公の発話】／【プレイヤー入力＝主人公の行動】）の末尾に、採用文「入力されていない主人公の意図・発話内容を勝手に確定しない。NPCは自分の知識や関心から質問・推測・提案してよいが、それを主人公が元から考えていた内容として扱わず、主人公の次の選択を残す。」を足す（93 字）。SAY/DO の文は STORY・続き・オートには足さない（STORY 側は別の文。下の AGENCY1b）。見出しを持たないので fix459 の MARKERS は変えていない（入力説明のブロックの中にとどまり、組み替え後も残る）。B38-a が ON のときは B38-a の文の後ろ。fix235 の書き直しは変えない（同じ sys を使う）。
- AGENCY1b（Owner 決定 11-10 案 A・統括追加の版 B）：STORY の方向づけ・続きを書く／オートの回に「プレイヤーが台詞を入力していないターンでは主人公の台詞を書かない…」（版 B は「短いひと言（10字程度まで）…」）を 1 文。kill `v292DfixAGENCY1StoryOff`（STORY 腕だけ止める）・`v292DfixAGENCY1StoryMode`（'B' で版 B。既定 A。Owner は A 採用・B 不採用）。既定は影・kill・Vault・gate `agency1`・端末 On は SAY/DO と同じ。本物の AI の A/B は未実行。fix192 は `43364471`。
- AGENCY1c（`0079579c`・`agency1-20261110-c`・GPT #127-RU ②）：SAY/DO の文・STORY（方向づけ・続き・オート）の文のすべての直後に「NPCが主人公の過去の発言・決定を事実として述べる場合は、既存の記録に基づく。根拠のない推測や嘘はNPC自身の認識として扱い、確定した事実にしない。」を 1 回だけ続ける。NPC の自発的な質問・提案・嘘・誤解は禁止しない。既定は影・判断は従来どおり。fix192 は変えない。
- 公開の範囲：ADMF1 の鍵 `agency1`（Worker `v46.40-lore1agency1-fc` で READY・行なしかつ全体の値なし＝OFF。管理者画面 `8f5e0704` の行・一括の対象外）。ADMF1 が鍵を知っていて `gate('agency1')` が true のときだけ足す。端末キー `v292DfixAGENCY1On='1'` でも足す（試験用）。ADMF1 が無い・古い（鍵を知らない）・読めないときは影。Vault で隠した物語（fix889・無い/例外も隠した扱い）では足さず、記録もしない。
- 止める：管理者画面で `agency1` を 0。端末の kill `v292DfixAGENCY1Off='1'`（次の組み立てから。何も記録しない）。診断 `window.__v292DfixAGENCY1.status()`（mode・admfKnown・admf・last・lastSend・stats。本文・入力文・物語 ID は残さない）。
- 依存：fix192 の 1 行・fix889・fix697・ADMF1・Api._preCallHooks（読むだけ）。保存データ・S には書かない。

#### READ1 — 読みやすさの小さな直し（GPT #127-RY ①・11-10。`v292DfixREAD1-scene-consistency.js`）
- 状態：GitHub `93bcfd0`（?cb=`20261110-read1a`）で出荷。**既定は影**（送信は READ1 無しとバイト一致）。ファイルの本番 sha `a8dc06b1`（fix459 `0f975c5f`）。
- 中身：ON のとき、①keeper prio1 のブロック【場面の一貫性】（「確定した時刻・場所・階・建物・明るさ・所持品を、描写上の理由なく変えない。時間経過・移動・特殊現象がある場合は、その変化を物語内で分かるようにする。」）を毎ターン sys に 1 回、②fix459 の【話者】ブロック末尾に 1 文（「台詞の話者は、発言前または同じ段落で判別できるようにする。主語を省略しても人物が曖昧にならないようにする。」）を足す。約 +138 字。fix459 の MARKERS に【場面の一貫性】を登録。
- ON／止める：端末キー `v292DfixREAD1On='1'`、または管理者画面の鍵 `read1`（Worker v46.41 以降・範囲 READY・行なし = OFF）。kill = `v292DfixREAD1Off='1'`（On・行より優先）。
- Local 実測：OFF／kill の送信 sys は READ1 無しとバイト一致（5 条件×12 送信）。ON は全送信で【場面の一貫性】1 回・【話者】末尾文 1 回・+138 字・他ブロックは削られず・budget dropped 0。
- 本物の AI の A/B（各腕 3 本×8T）：効果は見えず、副作用もなかった → 影のままにする。また本番の送信 sys では【話者】末尾の 1 文が載らず、【話者厳守】が残っていた（**原因は未調査**）。
- 戻し方：端末は `v292DfixREAD1Off='1'`。管理者画面は read1 を OFF。Pages は rollback/pages の 5 本を戻し v292DfixREAD1-scene-consistency.js を消す。Worker は戻さなくてよい（read1 の行は v46.40 が読まない・無害）。

#### ACTOR1 — 入力の主体を正しく伝える（a）／台詞の無い回に主人公を喋らせない（b）（11-12・GitHub `5b8a837`・`v292DfixACTOR1-input-actor.js`）
- 状態：本番の index.html が読む（CP1-final-tap の直後・PRUNE2 の前＝fetch の境界。home は読まない）。(a) DO の腕は既定 ON、STORY の腕は既定 OFF（`v292DfixACTOR1aStoryOn='1'` の端末だけ）。(b) は既定 OFF（`v292DfixACTOR1bOn='1'` の端末だけ・HEROVOICE1 が C〔おまかせ〕のときだけ）。
- 中身：(a) DO の入力に「登録キャラ名＋が」が主語の部分があり証明できるときだけ、入力説明の行の「他キャラの行動にしない」を「…の主語は〇〇（主人公ではない）。主人公に移さない」に置き換える。証明できないときは何もしない。(b) SAY でない回に「主人公の台詞を「」でも <say> でも書かない」を user 末尾へ、sys の食い違う 2 文を直す。
- 止める：`v292DfixACTOR1Off='1'`（全部・送信バイト同一）／`v292DfixACTOR1aOff='1'`／`v292DfixACTOR1bOff='1'`。診断 `window.__v292DfixACTOR1.status()`。
- 注意：ファイル冒頭のコメントは「Local 候補」のまま（HEAD では index.html が読み込んでいる）。

#### HEROVOICE1 — 物語ごとの「主人公はどれくらい喋る？」（11-14・GitHub `747a505`・B の名前は `85b3be2`・`v292DfixHEROVOICE1-hero-voice.js`）
- 状態：本番の index.html が読む（ACTOR1 の直前の行）。全員に設定の欄が出る。既定は C「おまかせ」（今までと送信も保存も同じ）。
- モード：A「よく喋る・反応する」／B「控えめに喋る」（旧名「自分からは喋らない」。11-14 に表示名だけ変更。痛み・驚きの反応と 10 字程度の短い声まで）／C「おまかせ」。A・B のとき送信直前に sys の決まった文を置き換え、parsePlan の主人公ロックも A・B 用の判定に任せる。ACTOR1(b) は C のときだけ動く。
- 保存：この端末の localStorage に物語ごと 1 キー `v292DfixHEROVOICE1:<物語キー>`（'A'／'B'。C はキーなし）。物語の本体・クラウドには書かない＝別の端末には伝わらない（既知の制限）。
- 止める：`v292DfixHEROVOICE1Off='1'`（常に C・欄も出さない）。試験用の上書き `v292DfixHEROVOICE1Force='A'|'B'|'C'`。診断 `window.__v292DfixHEROVOICE1.status()`。

#### LEAK1 / LEAK2 — 本文に混ざる「物語でない行」を取り除く（11-13 追加・11-14 に適用を既定 ON・11-15 に LEAK2。`v292DfixLEAK1-nonstory-lines.js`）
- 状態：本番の index.html が読む。影（件数だけの記録・本文は記録しない）は常時。**適用は 11-14（GitHub `452285c`）から既定 ON**。
- 適用で取り除くもの（r2 で 2 種に絞り、r3 で追加）：単独行の既知の内部ラベル（（状態ラベル）など）・タグ領域の後ろの英語が主の作業メモ・状態の欄の写し（state-field echo）と自己点検のブロック。finish=length で本文との境界を決められない回は hold（既存の失敗の経路＝入力を戻す・自動の再送なし）。
- LEAK2（GitHub `9cf5e24`）：最終境界で、JSON の切れ端だけの行（`key": value` の形）と「→修正します。」だけの行も落とす。止める `v292DfixLEAK1JkvOff='1'`（この 2 種は数えるだけに戻す）。
- OPT1（GitHub `3ec9d68`・既定 ON・kill `v292DfixLEAK1OptOff='1'`・適用の鍵 ApplyOff／Off にも従う）：本文の末尾にある、プレイヤーへ選択を促すまとまりを取り除く。形は 2 つだけ（括弧の見出し行＋箇条書き 2 行以上で本文が終わる／箇条書き 2 行以上＋最後の行が「あなた・プレイヤー …どうする？」で終わる）。途中にあるもの・台詞の中・物語の行が混ざるものは取り除かない。
- jp_meta（影だけ）：本文の最後の段落が読み手への依頼と書き手視点の語を両方含むときに数えるだけ。取り除かない。
- 止める：`v292DfixLEAK1ApplyOff='1'`（適用だけ）／`v292DfixLEAK1Off='1'`（影も含め全部）。旧 `v292DfixLEAK1Apply` は読まない。
- LEAK3（11-17・GPT #127-VV ■4・**既定 OFF**＝数えるだけ。On `v292DfixLEAK3On='1'`・kill `v292DfixLEAK3Off='1'`。`v292DfixLEAK3-internal-lines.js`・LEAK1.gate の入口から呼ぶ・LEAK1 の kill とは独立）：r3（再レビューを受けて絞った）: (i) fix459 の登録の見出しに、その見出し自身の sys の文（先頭 10 字）が同じ行か次の行で続く塊（sys でしか使わない固有の見出しだけの行は、この塊の中だけ）、(ii) 行頭の開き引用符が欠けた「鍵": "値」の断片で、鍵がコードの内部 JSON の鍵（fix135・fix335・fix823）であり、前後 2 行以内に別の内部の印（消す見出しの塊・別の鍵の断片）がある行、を取り除く。固有の見出しの単独の行・物語にも出る見出しだけの行・一致しない見出し＋文・一致しない続きの行・単独の鍵の断片・引用符のそろった JSON の行・推定の鍵（unresolved 等 5 個）・括弧のト書きは数えるだけ。取り除くと本文が空になる回は何もしない。観測 `window.__v292DfixLEAK3.stats()`／`.log()`。
- 注意：index.html の script タグのコメントは「適用 既定 OFF」のまま（コードの既定は ON）。保存・sys・送信は変えない。

#### NUM1 — 序盤のプレイヤー入力の数・約束を earlierFacts に残す（11-13・GitHub `d24bbd5`・r2 `7338a53`・`v292DfixNUM1-input-ledger.js`）
- 状態：本番の index.html が読む。**既定 OFF**（`v292DfixNUM1On='1'` の端末だけ）。kill `v292DfixNUM1Off='1'`（On より優先）。FACTS1 の kill 中も出さない。
- 中身：earlierFacts の窓から落ちたターンの「プレイヤーの入力にある数量・約束」を、earlierFacts.items の先頭に最大 5 行・200 字（入力の語のまま・「N ターン目の入力の時点」と書く）。r2（NUM2）で、本文に決定的に読める消費・受け渡しがあれば「今の数は不明」と添える（引き算はしない）。保存なし・sys 0 字・AI の呼び出し 0。

#### PLACE1 — 物の持ち主・置き場所と、その場にいない人の控えを user の whereNow に渡す（11-14〜11-16・r1〜r8・`v292DfixPLACE1-where-now.js`・版 `place1-20261115-r8`）
- 状態：本番の index.html が読む（fix58 の userExt が呼ぶ純関数）。**既定 OFF**（`v292DfixPLACE1On='1'` の端末だけ）。**Owner のアカウント（OWNERON1）では鍵なしで ON**。kill `v292DfixPLACE1Off='1'` が常に優先。保存しない・AI を呼ばない・sys 0 字・本文とカードは変えない。
- 中身：その回の S.turns から毎回作る。プレイヤーの入力（DO・STORY）の決まった言い方（渡す・預ける・置く・〜へ行く 等）と、本文の登録名どうしの受け渡しを拾い、nowScene の直後（無ければ recentScenes の直後）に `whereNow { rule, items }`（r4 から最大 8 行・320 字）。優先順は 最新の入力 ＞ 後の本文 ＞ 古い行（r3）。r4 で行に出どころ（ターン番号・引用）を付けないようにした。
- 版ごとの鍵：`v292DfixPLACE1NarrOff='1'`（本文からの読み取りだけ止める）・`v292DfixPLACE1Absent='A'|'B'`（いない人の行の言い方の試験用の鍵。無ければ従来。'A'＝強い言い方〔「この場にいる人物として直接話させたり動かしたりしない」〕は GPT #127-UD で不採用・次の整理で撤去候補。鍵の扱いは判断待ち（GPT #127-UP・QUALITY_LEDGER 2454・2455））・`v292DfixPLACE1R5Off='1'`（r5〔入力で決まった「いない」は明示の戻りか後の入力でだけ消す・離れる一言の橋渡し〕を止め r4 と同じ行）・`v292DfixPLACE1R6Off='1'`（r6〔「〜まで送ってもらう」の橋渡し・退場が入力で確定したときだけ〕を止め r5 と同じ行）。
- r7（GitHub `fbbff01`・kill `v292DfixPLACE1R7Off='1'`＝r6 と同じ行・同じ状態欄）：「二人／みんな／全員 が戻ってきた」も、誰のことかが一意なときだけ戻りとして読む。「向かったはずの二人が、戻ってきている」の連体の「はず」は仮定にしない。PLACE1 が「この場にいない」とした人は、fix192 の【各キャラの現在の状態】で 本能・目的 の項目だけを載せない（`absentNames()`。保存値は変えない）。
- r8（GitHub `3c57fc3`・kill `v292DfixPLACE1R8Off='1'`＝r7 と同じ行）：「X の影が現れる」「X が部屋に入ってくる／顔を出す／姿を見せる」などの明確な帰還を足す（その人の名前が主語・動きの語が 30 字以内のときだけ・消すのはその人の行だけ）。声・足音・電話・回想・夢・鏡・「はず」・「戻ろうとした」・「誰か」・否定・組の一部だけ、は帰還にしない。PLACE1 と同じく Owner のアカウント（OWNERON1）だけ既定で効く。
- 診断：`window.__v292DfixPLACE1`（obs()：行数・落とした理由の件数。本文・入力の文は入れない）。

#### CAST1 / CALL1 / SPK3 — 開始場面の NPC の説明・呼称の先例・直近の台詞の話者（11-13・GitHub `ea768d0`・`v292DfixCAST1-opening-cast.js`・`v292DfixCALL1-confirmed-speech.js`）
- 状態：本番の index.html が読む（fix58 の userExt が呼ぶ純関数）。**3 つとも既定 OFF のまま**（送信バイト同一）。鍵は別々。
- CAST1（`v292DfixCAST1On='1'`／比較腕 `'2'`・kill `v292DfixCAST1Off='1'`・人数の根拠だけ止める `v292DfixCAST1CountOff='1'`）：最初の回だけ、開始条件や入力から「開始場面にいると確定している NPC」の説明を user の cast.npcs に補う（600 字まで）。
- CALL1（`v292DfixCALL1On='1'`・kill `v292DfixCALL1Off='1'`）：話者が確定した発話だけから「呼称の先例」1 行（120 字まで）を earlierFacts の最後に足す。
- SPK3（`v292DfixSPK3On='1'`・kill `v292DfixSPK3Off='1'`）：recentScenes の直後に recentSpeakers（直近 2 ターンの話者が確定した台詞・最大 10 件）。

#### SEVERE1 / DRIVE1 / EX192 — 状態の判定の短期比較（11-13・`v292DfixSEVDRV-state-judge.js`）
- 状態：本番の index.html が読む（判定の純関数だけ。fix192 が呼ぶ）。**すべて既定 OFF**。鍵：`v292DfixSEVERE1On='1'`（kill `v292DfixSEVERE1Off`）・`v292DfixDRIVE1On='1'`（kill `v292DfixDRIVE1Off`）・`v292DfixEX192On='1'`（案 A）／`'2'`（案 B）（kill `v292DfixEX192Off`）。SEVERE1 r3（`494b09c`）は こころ の「意識がない」も読む。
- 撤去：同じ束で入れた SCENE2（天候・時刻・出来事の控え）は GPT #127-SU ⑤ で撤去した（`ea768d0`・ファイル `v292DfixSCENE2-ambient.js` は `0c70ca2` で削除）。

#### ECHO1 — 追加して撤去（11-14）
- `5a13762` で既定 OFF（鍵 `v292DfixECHO1On`）として追加し、盲検 A/B で効果が無かったため `72a7237`（GPT #127-TR）で撤去した。HEAD のコードに ECHO1 は残っていない。

#### ITEM2 — 実験 CLOSED・撤去（11-17）
- ITEM2（3 ターンごとの名簿抽出に所持品〔名・持ち主・場所・受け渡し〕の欄を足して数える shadow・`309a5f5`）は不採用・撤去（GPT #127-VP 2）。fix307 は ITEM2 の前（`99c49ad`）とバイト同じに戻した。既存の名簿抽出は変えない。代わりは既存 summary の shadow 検証（裁定 2）。

#### ALIAS1・MXSHORT1・PACE1 — 実験 CLOSED・撤去（11-17）
- ALIAS1（名簿の抽出に別名候補を足して数える shadow・fix307）と MXSHORT1（記述名の語尾の一般名を MIDICON の証拠に数える・short_tail）は、正しい別名候補 0・誤候補 23 で実験 CLOSED・撤去（GPT #127-VJ 1）。fix307 は ALIAS1 の前（`faed897`）とバイト同じに戻した。MIDICON は MXSHORT1 の部分だけを外した（BILL1c・TMPICON1 以後の変更は残す）。名簿抽出・MIDICON・STARTICON・PROMOICON1・MXALIAS1・LIM1b・BILL1c／BILL1c2・TMPICON1 は変えない。Worker 側の short_tail の受け口は別便。
- PACE1a／PACE1b（`v292DfixPACE1-objective-presence.js`・既定 OFF の比較用）は不採用（GPT #127-VB 1）。index.html の読み込みとファイルを撤去した。「NPC が早く登場する」問題は未解決のまま（原因側から調べる）。

#### CARD80 — 会話カードの文字数（11-15・GitHub `9a74d7d`・index.html と fix58）
- 既定 ON・kill `v292DfixCARD80Off='1'`（従来の 80 字・送信バイト同一）。会話カードの台詞は最大 1000 字、主人公の SAY のカードは入力の全文。AI へ渡す recentDialogues は 1 発言 300 字で丸める（fix58 の card80Cap）。

#### RETRY1 / RETRY2 — 失敗した送信を自動で送り直すかの判定（11-14〜11-15・fix80 と G.submit・`v292DfixRETRY2-send-policy.js`）
- RETRY1（GitHub `72a7237`・fix80）：503 で errorCode が LEDGER_UNHEALTHY のときは自動で送り直さない。既定 ON・kill `v292DfixRETRY1Off='1'`。
- RETRY2（GitHub `248cc36`・fix80 の直前に読む）：送り直し・別モデルへの切替を 1 か所で決める。既定 ON。上流へ届いたか分からない要求（上流へ送った後の 5xx・通信断・時間切れ）・Worker が断った応答・402・429 以外の上流の 4xx は送り直さない。429 は Retry-After（無ければ 8 秒・30 秒超は送らない）で 1 回だけ。別モデルへの自動の切替は既定で止める（`v292DfixRETRY2CmfOn='1'` で 429 と空の本文に限り従来の切替を許す）。要求 ID `chrReqId` は既定 OFF（`v292DfixRETRY2IdOn='1'`。Worker が受け取って消すようになってから ON にする前提）。通信断・時間切れでも ERRNOTE1 の知らせを出す。
- 止める：`v292DfixRETRY2Off='1'`（fix80 と G.submit が土台の動き＝最大 9 回・別モデルへの切替あり）。診断 `window.__v292DfixRETRY2.status()`。

#### FANOUT1 — 同じアカウントから文章の要求を同時に何本も出さない（11-15・GitHub `2e6e2c9`・features.js と fix80）
- 既定 ON・kill `v292DfixFANOUT1Off='1'`。(a) 旧 AI アイコンの外見文（features.js の genAsync）を 1 本ずつ送り、送り直しに上限を付ける。(b) 補助の呼び出し（Api.call に allowShort を渡したもの）は短くても正しい答えなら再送しない。本編の生成の判定（20 字未満は失敗）は変えない。

#### BEAT2a / BEAT2b — 会話の拍を縮めない 2 つの腕（11-16・GitHub `12e5248`・fix459 の中）
- 状態：**実験・既定 OFF**（鍵が無ければ sys は従来とバイト一致）。腕 a `v292DfixBEAT2aOn='1'`（登場人物は相手が実際に言った言葉・行動にだけ答える。まだ言われていない拒否や問いに先回りしない）／腕 b `v292DfixBEAT2bOn='1'`（主人公か同行者の返事が要る所で区切ってプレイヤーに返す。NPC どうしで 2 往復以上進めない・複数人への問いに代表して答えない）。両方 ON 可。kill `v292DfixBEAT2Off='1'`（On より優先）。fix459 の C（`v292Dfix459COff`）を止めていると出ない。【展開】の後ろに足すだけ。
- 判断待ち（GPT #127-UP・QUALITY_LEDGER 2454・2455）。

#### PRUNE3 — 「進めよ」の重複・待たずに話してよい・返事の決まりを、今ある文の置き換えで整理（11-15・GitHub `e5d5d30`・`v292DfixPRUNE3-sys-prune3.js`・版 `prune3-20261115-a`）
- 状態：**実験・既定 OFF**（`v292DfixPRUNE3On='1'` の端末だけ）。`v292DfixPRUNE3Off='1'` は On より強い（送信バイト同一）。`v292DfixPRUNE3Parts='P1,P2'`（カンマ区切り）でその部分だけ。無い・空なら全部。index.html の先頭近く（HEROVOICE1 の直後）。
- 部分：P1「進める」の意味を進行エンジンの 1 か所で決める（返事が要る所で止めてよい）／P2 状態ブロック末尾の「入力を待たず…」2 行を 1 行に／P3 続きの回の「進めよ」を 1 ブロックに／P4 fix512 の返事の決まりを「その人らしく応じる・複数人への問いには自分の分だけ」に／P10 役割の「一人称視点の」を外す。HEROVOICE1 が探す文は変えない。見つからない部分はその 1 手だけ何もしない。
- 検証口：`window.__v292DfixPRUNE3`。判断待ち（GPT #127-UP・QUALITY_LEDGER 2454・2455）。

#### HDRNL1 — 最終 sys の見出しの改行抜けを直す（11-15・GitHub `e5d5d30`・`v292DfixHDRNL1-sys-header-newline.js`）
- 既定 ON・kill `v292DfixHDRNL1Off='1'`（送信バイト同一）。送信直前に「平常化させない。【反応と身体（統合・最優先）】」の 1 か所（fix405 の行の直後に fix417 の見出しが貼り付いた形）にだけ改行を 1 つ入れる。文字は変えない。見つからない・2 か所以上なら何もしない。検証口 `window.__v292DfixHDRNL1`。

#### CONTRACT1 — 今回の場面の契約（会話の順番と確定事実の小さな控え）を user に渡す（11-15・GitHub `9e585fb`・`v292DfixCONTRACT1-scene-contract.js`・版 `contract1-20261115-a`）
- 状態：**実験・既定 OFF**（`v292DfixCONTRACT1On='1'` の端末だけ）。kill `v292DfixCONTRACT1Off='1'` が On より強い。保存しない・sys は増やさない。index.html の先頭近く。
- r2（11-16・版 `20261116-contract1r2`・kill `v292DfixCONTRACT1R2Off='1'` で r1 に戻る）：同じ人が続けて話す間の頭の呼びかけを相手が 1 人のときだけ引き継ぐ／疑問詞で終わる問いを問いとして数える／最後の 1 枚だけ話者が未確定ならその前の確定した台詞を出す。SMOKE13 の再生で増えた行の誤り 0（本物の AI では未確認）。Owner の PC だけ On（GPT #127-UR）。
- 中身（確実に言えるときだけ。何も言えない回は欄ごと出さない）：user の JSON の whereNow（無ければ nowScene）の直後に `sceneContract { rule, items }`（最大 6 行・320 字）。①直前のやり取り（<say> タグか主人公の入力が由来の最後の 1〜2 台詞・各 30 字まで）②まだ返事が出ていない相手（呼びかけで相手が決まる問い・頼みだけ）③明示の拒否／承諾（決まった言い方だけ・最新 1 行）④設定で確定した関係・出自（desc の関係・出自の語を含む文・2 行まで。「実は・隠し・秘密・正体」等の印がある文は使わない）。直前の回は recentScenes の最後の本文と S.turns の本文が一致したときだけ使う。
- 検証口：`window.__v292DfixCONTRACT1`（last() は各行の根拠を 30 字まで）。判断待ち（GPT #127-UP・QUALITY_LEDGER 2454・2455）。

### 2.2 NPC・キャラ状態

#### fix77 — 状態の記憶（state memory）
- 状態：本番稼働 `i93`・sha `d53f65aa`・?cb=`20261019-bundle31-a`。
- 役割：AI に本文末で `<state who="名前" からだ="…" こころ="…" 本能="…"/>` を出させ、解析して端末に保存し（localStorage `v292Dfix77States`。fix246 で物語ごとのキーに振り分け）、表示からは必ず剥がす。次のターンで状態を sys に戻す（engineMode=1 では fix192 の stateBlock が担当）。
- データ：`window.__v292Dfix77Store`。fix190（傷の正本）・fix961（保留）と関わる。
- 依存・関係：fix192、fix305、fix333、fix414、fix853（切り詰め名の防止）、fix970（取り込み脱落の記録・既定 OFF）、E64（捨てた応答の取り込みを残さない）。
- 既知の問題：store の値は退場後も残り、fix192 と fix333 がそれを使う（§2.1 fix192、§2.2 fix333。NPRES が ON のアカウントでは使う側で抑制）。✎ 編集（EDIT01）は store を直さない。
- スイッチ：`v292Dfix532Off`・`v292Dfix901Off`・`v292Dfix938Off`・`v292Dfix961Off`（後から足された分岐。fix77 全体を止めるキーはファイル内に見当たらない＝未確認）。

#### fix305 — キャラ状態のトリガー注入（登場中の人だけ）※読み込み停止（2026-11-15・CLEANUP3）
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
- F333a（laneF333・2026-11-11・GitHub `125c261`・fix850 `44794344`・既定 ON・kill `v292DfixF333aOff='1'`＝従来と同じ）：【身体状態・正史(絶対に覆らない)】の人違い（物が吊られている文・他人を見ている文・否定・一般語の「負傷している」で、関係ない人に「拘束されている／宙に吊られ不安定」「負傷している」が出る。PRUNE1 の本番 A/B で実測）を、fix333 を変えず、fix333 が読む fix850 の写しの側で直した。主語がその人（か体の部位）でない語・否定・比喩・過去を写しから外し、今回の本文にその人の解放（床に落ちた・解放された・縄がほどけた 等）があればそれより前の拘束・宙吊りを外す。部位も原因も無い 傷 は写しで空にする（STATE2 と同じ判定）。見出しは変えていない（fix459・fix851・fix852 が目印にしている）。fix333（保護ファイル `7a4f567a`）は 1 バイトも変えていない。
- F333b（laneFIX3・GitHub `e70f7d2`・fix850 `91e0af75`・?cb=`20261111-f333b`・既定 ON・kill `v292DfixF333bOff='1'`＝F333a のまま。`v292DfixF333aOff`・`v292Dfix850Off`・`v292DrrOff` でも止まる）：F333a の後も残った 3 つの型を、同じく fix850 の写しの側だけで直した。①本人の宙吊りの行が消える（「Yの…ながら」の Y を他人の状態の印にしていた・本人が手を離す／放しかけを解放とみなしていた）②解放の回に助ける側へ拘束が付く（「吊り上げる腕」「締め上げる手」を加える側の体として本人に付けていた・主語が本人の能動の押さえつけ）③手首などのけがが別の人に付く（主語の無い文を直前の人物へ引き継いでいた）。どれも「持ち主が言えないなら行を出さない」側に倒した。診断 `window.__v292DfixF333b.stat()`（回数だけ。本文は持たない）。
  - 本物の AI（実機）での確認：3 回の実行で、身体状態の持ち主の取り違えは 0/3（変更前は 2/2）。
  - 残る注意：語の並びだけで判定しているので、想定していない言い回しでは取りこぼし（行が出ない）を増やしうる。保存の からだ に吊られている語が無い回は、今も行が出ない（fix333 の語の範囲の問題。保護ファイルなので触っていない）。写しを読む fix414・fix851・fix852 にも同じ外し方が効く（fix192 の状態ブロックは実 store を読むので変わらない）。

#### fix414 — 身体・心理の制約エンジン（重傷・解離・凍結のコスト）
- 状態：本番稼働 `i221`・sha `a91c216b`・?cb=`20261111-flow2`（**FLOW2 で FRZ1 を入れた版**。GitHub `daeb3a9`・本番の読み戻し一致〔出荷済み〕。前は `371f8ce8`・?cb=`20261107-bundle93-f`〔93-f の npcq1 C2〕。その前は `fdad99f5`）。既定 ON（fix428 で ON 化）。止める：`v292Dfix414Off='1'`。
- npcq1 C2（93-f・Owner だけの CANARY。有効の条件は §2.1 fix192 の C2 と同じ）：重傷・強い恐怖のときも「動きは小さく遅い」「短い発話のみ」などの【制約】を作る（従来は傷の部位が分からないと何も出なかった）。Owner 以外は 93-e と同じ出力。kill `v292Dfix414WidenOff='1'`（拡張だけを止める）。試験（Local・偽の AI）：ユニット 35/0、10 ターン × 6 通りで owner は【制約】10/10・ほかの 5 通りは 0/10、MIDICON 87/0（Chromium・WebKit）、2 タップ 30/0。**本物のモデルが行動を変えるかは未測定**。語彙で判定するため、過去の傷や比喩の「出血」で反応し得る（owner だけ）。【制約】は予算が厳しいと落ち得る（H2 は未対応）。
- FRZ1（laneFLOW2・2026-11-11・出荷済み〔GitHub `daeb3a9`・本番の読み戻し一致〕・既定 ON・kill `v292DfixFRZ1Off='1'`＝従来と同じ。`v292Dfix414Off='1'` は従来どおり fix414 全体を止める）：脚の「走行不可・移動は支え必要」は、脚の近くにけがの語（骨折・捻挫・ひねった・腫れ・脱臼・撃たれ 等）があるか、傷の欄に脚の傷があるときだけ（捻挫・ひねった・腫れは「動かない」が無くても走行不可、「軽く・少し」なら「移動が鈍い」）。けがの無い「動かない／立てない」は、すくみ・硬直・縫い付く・腰が抜け 等があれば「即応・機転は出ない」（既存 rank6）、無ければ何も付けない。部位の直前が別の人物の「Xの」（例「サキの足首」）ならその部位は数えない（腕・脚。laneFLOW1 A T6 の人違いの型を Local で再現して直した。本番の A T6 の本文は残っておらず、どちらの経路〔ユイ自身の <state> か fix850 の本文の切り出し〕だったかは未確認）。腕の「使用不可」の判定（恐怖で手が動かない）は変えていない。
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

#### STATEQ1 — <state> の取り込みの入口の直し（PH1・SREP1・POSE1。11-12・GitHub `5b8a837`・fix77・fix405・fix192・features.js・fix851）
- 状態：本番で読む部品の中（新しいファイルなし）。どれも既定 ON（Off の鍵だけ）。保存の形（fix77／fix190 の store）は変えない。
- PH1（kill `v292DfixPH1Off='1'`）：値が型の文字（#NAME#・{主人公}・書式の説明文の写し・who="名前" 等）なら保存しない・状態ブロックに載せない。
- SREP1（kill `v292DfixSREP1Off='1'`）：<state> の書式の崩れのうち意味を推測せずに戻せるもの（全角引用符・コロン区切り・引用符つきのキー 等）だけ戻す。戻せない項目はその回は更新しない。
- POSE1（kill `v292DfixPOSE1Off='1'`・fix851）：【身体状態・正史】の姿勢の根拠を、直前のターンに書かれた からだ と直前の本文の本人が主語の文だけにする。POSE1b（kill `v292DfixPOSE1bOff='1'`）：「倒れた椅子」の形を姿勢にしない・膝をつくを「膝をついている」と書く。
- 注意：fix77・fix851 の冒頭コメントは「Local 候補・未出荷」のまま（HEAD では読み込まれている）。

#### STATE3 — 体の制約の除外は体に制約があるときだけ（11-15・GitHub `9a74d7d`・fix192・fix414）
- 既定 ON・kill `v292DfixSTATE3Off='1'`（送信バイト同一）。1a（fix192）：「（ただし〇〇は除く）」は体の制約（rank<6）がある人だけ、文言は原因を断定しない「身体に制約があり、可能な動作に制限がある」。1b（fix414）：姿勢・表情の「固まる」だけでは恐怖の硬直にしない。1c（fix414 の widen・Owner だけ）：抑えた・軽い恐怖の言い方と、2 ターン以上前の こころ・からだ からは恐怖の制約を作らない。

#### FIX850A / F850Ord — fix850 の 2 つの直し（11-13・11-15）
- FIX850A（GitHub `9a74d7d`・kill `v292Dfix850AOff='1'`・既定 ON）：腕・手の負傷でない動作（組む・伸ばす・握る 等）の節では、その部位を【制約】の材料にしない。同じ節にけがの語があれば従来どおり。
- F850Ord（GitHub `8f80b0a`・kill `v292DfixF850OrdOff='1'`・既定 ON）：読み込みの順の競合を直す。fix192・fix74・fix75 の印が最上位に見えるまで包むのを待つ（最大 約 8 秒。超えたら従来の条件で包む）。

#### STATE4 / ST4B — 状態の値の受け入れの検査（11-16・GitHub `019686c`・`3ec9d68`・fix77・fix192）
- STATE4（既定 ON・kill `v292DfixSTATE4Off='1'`）：<state> の値が 80 字を超える・コード片（`.trim(`・`=>`・`undefined` 等）・タグの記号や属性の書き方（`<` `>`・`からだ=` 等）を含むときは、その項目を保存も更新もしない（前の値が残る）。fix192 の状態ブロックも同じ判定で、既に保存された値を載せない（保存値はそのまま）。SREP1 を止めた旧経路（`v292DfixSREP1Off='1'`）には掛からない。
- ST4B（既定 ON・kill `v292DfixSTATE4BOff='1'`）：値の前後のスラッシュと、末尾の「（この場にいない）」「（〜と一緒にいない）」「（別の場所にいる）」の括弧書きを外して受け入れる（捨てない）。

#### FEAR1 / FEAR2 / ARM2 / CHEAD1 — 怖さ・姿勢から作る【制約】の直し（11-16・GitHub `fbbff01`・`3ec9d68`・`3c57fc3`・fix414）
- FEAR1（既定 ON・kill `v292DfixFEAR1Off='1'`）：A＝Owner だけの widen の恐怖の判定は、恐怖の語だけでは「とっさの判断」の制約を作らず、機能の喪失（動けない・立てない・声が出ない・頭が真っ白・足がすくむ・腰が抜ける 等）が恐怖・動揺の文脈で書かれたときだけ作る。C＝制約の文言の内部の言い方「即応・機転は出ない(型B/C)」を「とっさの判断や機転が利きにくい」にする（全員）。
- FEAR2（r1 `3ec9d68` は既定 OFF で出荷 → r2 `3c57fc3` で**全員既定 ON**・kill `v292DfixFEAR2Off='1'`。既定はコードの `FEAR2_ON` の 1 行）：「硬直」「固まる」「〜まま動けない」だけ（姿勢・一瞬の反応）では恐怖の制約を作らない（widen・規則 F の からだ）。r2（kill `v292DfixFEAR2R2Off='1'`＝r1 と同じ）：1 つの文に 固まる・すくむ 等＋動けない・体が言うことをきかない がそろい、恐怖・動揺の文脈があるときは明確な行動不能として残す（「〜たまま」の姿勢の句や「一瞬・一拍」だけなら残さない）。
- ARM2（既定 ON・kill `v292DfixARM2Off='1'`）：規則 A で、部位の使用不可の根拠が「動かない」だけで、その人の からだ に負傷の語が無く傷の欄も空のときは、部位の使用不可を作らない（FIX850A が外せなかった「拳を胸元まで上げたまま動かなくなった」の型）。
- CHEAD1（既定 ON・kill `v292DfixCHEAD1Off='1'`）：【制約】の人物の制約がすべて怖さ由来（rank 6）のときは、見出しを「負傷者の行動には…」ではなく怖さ用の文（「恐怖・動揺による能力の低下を行動に反映して描く…」）にする。
- EYE1（11-16・GitHub `91982fd`・既定 ON・kill `v292DfixEYE1Off='1'`）：規則 D（視覚）の「目」は、語の頭か「の・が・は・も・で・、・両・片・右・左・涙」の後のときだけ数える（「木目がぼやけて」で無傷の人に視覚の制約を付けない）。
- LEG1（r1 `91982fd`・r2 `09b9b2b`・既定 ON・kill `v292DfixLEG1Off='1'`）：脚の部位に「脛・腿」を足す。「切った・切り傷」等は、その人の からだ・傷 に重さの手がかり（深い・出血が止まらない・体重をかけられない・引きずる・庇う 等）があり、部位のまわりに浅い傷の言い方（浅い・かすり・少し 等）が無いときだけ「移動が鈍い」にする（r2・GPT #127-UJ）。裂傷・深い傷・捻挫などは従来どおり。

### 2.3 話者・会話ログ・編集

#### fix66 — 会話ログの描画フック修復（＋未登録キャラのアバター文体）
- 状態：本番稼働 `i84`・sha `48d98f7f`・?cb=`20261110-beat1`（BEAT1 で会話カードの添え書きの規則を変えた。GitHub `e9606a8`・2026-11-10 出荷・本番の読み戻し一致。前は `9dda0a16`・?cb=`20261025-bundle55-sfl-a`）。
- BEAT1（会話カードの添え書き＝fix91 の補足描写）：添え書きは「人物の気配がある文」だけにする。引用と同じ行の続きはそのまま。行が変わったら直後の 1 段落だけを見て（文の途中の改行は続ける）、話者の名前・主人公なら「あなた」・彼/彼女・声や手などの身体の語・話者と同じ呼び名（「男は」など）がある文だけを採る。2 段落先・次のターンへは行かない。次の台詞の話者名だけの行（`X「…」` の X）は採らない。後ろで採れないときの「前の文」も同じ検査を通ったときだけ、前のターンへは戻らない。SP1-A/A2 はそのまま。表示だけ（保存・次ターンの文脈には入らない）。kill `v292DfixBEAT1Off`（＝従来。`v292DfixSP1Off` とは別）。Local 試験：node 43/43、実セーブの写し 334 枚で kill は 854cb71 と全一致・BEAT1 で同じ 270／付かない 34／変わる 27／新しく 3、ブラウザ Chromium ON・kill・WebKit ON。戻し：854cb71 の fix66 `9dda0a16`・index `4e7d32d3`。
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
- 状態：本番稼働 `i85`・sha `95f16635`・?cb=`20261110-edit01carry`（E1 で更新。71-a では `5a41e946`・?cb=`20261031-bundle71-ednedg-a`）。既定 ON。kill `v292DfixEdit01Off='1'`。
- 役割：✎ で本文を保存したとき、本文から消えた台詞のカードを外し、言い回しを直した行は話者を残して台詞だけ更新する。**71-a（69-edg）**：本文が変わっていなければ（改行コードの違いだけでも）整理をしない＝カードが消えない。この部分だけ止める `v292DfixEDGOff='1'`。
- **E1（11-10）**：台詞を同じ場所で別の文に書き換えたとき（編集前後を行ごとに比べ、消えたカードと新しい引用が 1 対 1）、元のカードの話者・meta・_sid を引き継いで台詞だけ差し替える。plan.narrative / _structuredNarrative の `<say who>` も同じく引き継ぐ。数が合わない・括弧不整合・oldNarr なしは従来どおり。kill `v292DfixEDIT01CarryOff='1'`（これだけ旧挙動）。
- 既知の問題：本文を**書き換えた**とき、本文にそのままの形で無い台詞のカードが外れることがある（案 B・未着手）。store（fix77）と `plan._v254who` は直さない。
- 既知の問題（E1 後）：同じ場所で**別人の台詞**に書き換えると元の話者のまま残る（✕ で消せる）。E2（引き継げなかった「」にカードを作る）は未着手。

#### EDLOG — 本文の手編集の記録（92-a・既定 OFF）※読み込み停止（2026-11-15・CLEANUP3）
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

#### SPKW1 / SPKW1b / SPKW2 — 裸の「」の話者の窓推測の直し（11-14〜11-15・index.html の genConvLog 付近・fix303・fix469）
- 状態：**既定 OFF**（`v292DfixSPKW1On='1'` の端末だけ）。**Owner のアカウント（OWNERON1）では鍵なしで ON**。kill `v292DfixSPKW1Off='1'` が常に優先。SPKW2 も同じ鍵。
- SPKW1（GitHub `802ef66`）：W＝推測に使う写しの中だけで登録名の呼び名（短い名）を登録名に読み替える／V＝聞かれた側の「X の声・言葉」を話者の証拠にしない／P＝発話動詞を語の形で見る。fix303 はモデルが <say who> を明示したカードを書き換えない。fix469 は「X は答えなかった」のような否定された発話を証拠にしない。SPKW1b（`650cff9`）：呼び名の表が空でも確認の口 `window.__v292DfixSPKW1` を置く。
- SPKW2（GitHub `11493dc`）：未登録の人物の裸の台詞を近くの登録名や主人公に倒さない（SPKW2-U・index.html）。fix469 は名前の直後の節に発話動詞があるときだけ前の行の「言った」を結び付ける（SPKW2-S2）。

#### QUOTE1 — 発声の行為の無い引用をカードにしない（11-16・GitHub `fbbff01`・index.html の genConvLog）
- 状態：SPKW1 と同じ範囲で効く（`v292DfixSPKW1On='1'` の端末か、OWNERON1 で Owner のアカウント＝**Owner 限定**）。kill `v292DfixQUOTE1Off='1'`（従来）。
- 中身：行の途中の裸の「」の後ろが「という一言／言葉」「という文字／貼り紙」「と書かれ／記され」のとき、同じ文に発声の行為（口にする・言う・叫ぶ・呟く・告げる・読み上げる・声 等）が無ければ台詞にしない（カードを作らない）。発声の行為があれば台詞として残し、話者はその文で名前が主語のときだけ確定し、無ければ「???」（窓の推測で決めない）。

#### KANA1 / FF1 — 出口のロックが台詞・行を消しすぎない（index.html の parsePlan）
- FF1（11-12・GitHub `63bfe48`）：FF1a（kill `v292DfixFF1aOff='1'`）主人公ロックが入力の実現ごと段落を消さない／FF1b（kill `v292DfixFF1bOff='1'`）登録キャラの <say> 1 行だけの短い漢字・数字の台詞（「……煙」）を言語フィルタで捨てない。どちらも既定 ON。
- KANA1（11-15・GitHub `11493dc`・既定 ON・kill `v292DfixKANA1Off='1'`）：ダッシュ（——）で終わる短いかなの無い台詞（「朔、足——」）も FF1b の保護に当てる。

#### SPK2 / HB1 — 会話ログの話者の影（記録だけ）（11-13・GitHub `b385f25`・`v292DfixSPK2-speaker-shadow.js`）
- 状態：本番の index.html が読む。影は既定で動く（kill `v292DfixSPK2Off='1'`）。適用は `v292DfixSPK2Apply='1'` のときだけ（**既定 OFF**）。影のときは S・ターン・カード・保存に触らない。記録はメモリ（200 件）と localStorage `v292DfixSPK2Ring`（最新 30 件）。
- 規則は引用の直後の 1 文だけを見る（P-Q1・P-Q2・FF2c R1/R1b/R2・HV-C1）。HB1：裸の「」が確かな根拠なく主人公のカードになっているとき '???' を提案（別の NPC へは付け替えない）。モデルが who を書いたカードは「食い違い」として記録だけ。検証口 `window.__v292DfixSPK2`。

### 2.4 記憶

#### fix135 — 長期記憶（あらすじ・自動ワールド情報・重要イベント）
- 状態：本番稼働 `i64`。役割：数ターンごとに 1 回の AI 呼び出しで、あらすじ（約 300 字）・登場人物や場所の DB（fix136）・重要イベント（fix137）を作り、端末に保存（fix246 で物語ごとのキー）。`window.__longmem`。fix299 で永続化の欠落を根治した記録あり。

#### MEMTALLY・MEMTRIAL — 試用の日別集計と Owner 限定の条件（2026-11-21・Local・GPT #127-WF (a)(3)）
- 集計: 腕 A が働くとき（kill `v292DfixMEMTallyOff='1'`）、端末の鍵 `v292DfixMEMTally` に日別（端末の日付）で数だけ足す（覚え書きを渡した回数・見送りの理由コード別・MEM4 の信用喪失・印の無効化・通知の不採用の理由別）。本文・物語 id（hash も）・アカウント id は入れない。出来事のその場で +1・14 日より古い日は書くときに消す・書けなければ握りつぶす。読む口 `__v292DfixMEM2.tally()`。同期の除外（PAF 3 か所）に足した。物語の鍵ではない（KEY1 の family に無い）・復元（fix721）は既定で拒否のまま・完全リセット（/^v292Dfix/）で消える。
- 試用の間だけの条件（kill ではない）: 腕 A・MEM3b・MEM3・MEM4 は、端末の鍵に加えて、この page の /auth/me の答え（fix893 serverMe）が Owner（entitlement owner・status active＝fix905 と同じ判定）のときだけ働く。答えが無い・失敗・Owner 以外は働かない（理由は `__v292DfixMEMTrial.stats()`）。一般向けに ON にするときは MEM2 の `TRIAL_OWNER_ONLY` を false にする（1 か所）。

#### MEM4 — 長期記憶の所属証明（案 A・2026-11-17・Local・未出荷・GPT #127-VV 3）
- `v292DfixMEM4On='1'`・kill `v292DfixMEM4Off='1'`・既定 OFF・MEM2 腕 A が ON のときだけ。MEM2 が見届けた作り直し（このページの fix135 が保存の直後に知らせた完了〔`__v292DfixMEM4Done`・r2〕と、接尾辞・ターン・中身の hash・場所が一致したもの。r3/r4: 知らせの時点で S の物語と知らせ先の slot の本体のターン数・最初と最後のターンが一致し〔違えば NOTIFY_OTHER_STORY〕、4 つの鍵が知らせの結果のとおりに保存されている〔違えば NOTIFY_PARTIAL_SAVE〕ものだけ。知らせの時点のアカウントも控える）にだけ、別の鍵 `v292DfixMEM4_slot_<id>` へ印（アカウント ID〔サーバーで確かめた値〕・物語 id・端末 id〔`v292DfixMEM4Dev`〕・端末の版の通し番号〔`v292DfixMEM4Seq`・r2〕・作ったターン・4 つの鍵の中身の hash・鎖）を書く。知らせの無い書き込み（復元・別のタブ・切り替え途中）は信用しない（UNSEEN_WRITER）。snapshot などで古い記憶と古い印が一緒に戻っても通し番号が合わない（SEQ_MISMATCH）。r5: 信用していない間に印が今の記憶と合わないと分かったら、印と通し番号の行を消す（最後に認証された版を戻しても SEQ_UNKNOWN）。読み込み時に記憶があるときは、印がすべて一致したときだけ腕 A が渡す（再読み込みの後も渡る）。印なし・壊れ・アカウント不明／違い・端末違い・版や中身のずれ（移行・復元・更新途中）は渡さない（理由は `stats().m4`）。fix135 は保存の後に完了の知らせを 1 行足しただけ（保存の流れは同じ）・fix246 は変えない。新しい鍵は KEY1 の FAMILIES（side）・STORE1b の FAMILY_CLASS（c）・同期の除外（PAF 3 か所）に足した。復元（fix721）は既定で拒否のまま。

#### MEM3 — 長期記憶の作り直しで事実が落ちる問題（2026-11-17・Local 試作・未出荷・GPT 裁定待ち）
- MEM3（`v292DfixMEM3On='1'`・kill `v292DfixMEM3Off='1'`・既定 OFF）：fix135 の作り直しの指示のうち、summary の欄の説明・events の欄の説明・Rules の 1 文だけを書き換える（「確定：」「未定：」の 2 部・確定事実は変更が本文に出るまで残す・未定は未定のまま・古い値は新しい値に書き換え・主人公の気持ちや態度を決めない・summary は 500 字まで）。worldinfo の指示は変えない。OFF は送信バイト同一。`__v292DfixMEM3.stats()`。
- r3・r4（2026-11-17・AB3 の A3 4 本を受けて）：MEM3 の指示で「確定：」を変わりにくい事実だけの欄にし、筋は「経過：」、瞬間の状態（時計の時刻・残り時間・立ち位置・迷い・やりかけ）はどの欄の対象でもない形にした（書式の説明・禁止文の行は足さない）。出来事は起きたターンの値のままで、変更は新しい行・更新はあらすじだけ。r5：本文で確定していない主人公の心情は確定として記録しない（推測が要るなら未定）・同じ事柄を確定と未定の両方に書かない（迷えば未定）。MEM3b ON のとき、覚え書きの rule に「出来事は起きた順。同じ事柄は番号の大きい（後の）行が今の値」を足す。r3 の語の規則で文を外す案（MEM3c）は、レビューで誤って外す 10／22 のため入れていない。
- r6・r7（GPT #127-VV 2 と r6 のレビュー）：作り直しの入力に、この物語の設定の要点（scene.lore 200 字・主人公と NPC の説明 1 人 80 字・合計 500 字まで・読むだけ）を足す。秘密を渡さない守り：Vault で隠した物語・物語 id が分からないときは渡さない／lore と人物の説明は LORE1 の splitGm で GM の節を外す（LORE1 が無い・GM の印が残るときは渡さない）／「実は…」の文・おまかせの「隠された理」の文を外す。r8：秘密の印（裏設定・秘密・真相・本当は・正体・隠して・実は・ネタバレ）を含む文も外し、「設定の中身を書き写さない」を全部の欄に掛ける。r9：渡すのは lore の公開の部分だけ（人物の説明は渡さない）。r10：渡すのは LORE1 が本文生成の AI へ lore を送っている（mode()='on'）ときだけ（影・OFF・無い・判定できないときは渡さない）。照合の正規化で句読点・括弧・引用符も除く。出力に本文に無い lore の 6 字の並びが出たら、worldinfo の説明の文と summary の「確定」の文だけを落とす（events・経過・未定は落とさず数える。1 回で 3 以上落としたら警告を数える）。照合の失敗はその回を保存せず、2 回続いたらその物語はそのページの間 設定を渡さない。本文が設定と食い違う点は確定に入れず、本文側の記述だけを未定に置く（設定の中身は書き写さない）。あいまいな発言は未定。summary の説明は整理して短くした。MEM3b の覚え書きは、確定を削らず、経過と未定の中で詰める（未定に最低 120 字）。`__v292DfixMEM3.stats()` に settingsChars・lastAdded・lastSettings・lastSettingsWhy。
- MEM3b（`v292DfixMEM3bOn='1'`・kill `v292DfixMEM3bOff='1'`・既定 OFF・MEM2 腕 A が ON のときだけ）：MEM2 の覚え書きを「あらすじ → 人物の表（読むだけ・6 行まで）→ 出来事」の順に組む（r2：出来事を最低 200 字ぶん先に確保し、あらすじは「確定：」の部を優先して詰める。内訳は `__v292DfixMEM2.last().a.parts`）。保存は変えない。

#### MEM2 — 長期記憶の配線（2026-11-17・未出荷・独立レビュー待ち・GPT #127-VR 1）
- 背景：fix135 の長期記憶は features.js の build の包みが sys の末尾に足すが、fix192（新エンジン）が `r.sys = buildSys(...)` で作り直すので生成に届いていない（mem1/DIAG.md）。全文が渡るのは fix58 の recentScenes（直近 2 ターン）だけ。
- 腕 A（`v292DfixMEM2aOn='1'`・kill `v292DfixMEM2aOff='1'`・既定 OFF）：この物語の長期記憶（あらすじ・重要な出来事）を、fix58 userExt の user JSON の `memoryNotes`（earlierFacts の直後）へ「参考の覚え書き」として最大 800 字（新しい出来事を優先）。sys には足さない。タグ・属性らしい文字列は除く。document の権限キー（chr6_slot_<id>）の接尾辞つきキーだけを読み、fix246 が動いていない・fix783 kill・storyId の食い違い・場所の食い違い・リセット後の残り のときは足さない。
- 腕 C（`v292DfixMEM2cOn='1'`・kill `v292DfixMEM2cOff='1'`・既定 OFF）：recentScenes を 2 → 4 ターン。
- r2：腕 A は、このページで記憶が空の状態から fix135 によって作られたと MEM2 がメモリだけで確かめた記憶だけを渡す（fix246 が共通鍵 chr6 から移した記憶・前の回の記憶は、このページでは見送る＝NOT_SESSION_BUILT）。fix697 の storyId が読めないときは見送る（ID_UNKNOWN）。日本語の内部の印（【内部】【システム】【指示】・（AIへの指示：…）・[[…]]・LEAK1 の内部ラベル）を除く。r3：括弧の除去は、中身が印の語だけ、または印の語の直後に：/: が続くときだけ（「（メモを取りながら）」「【注目】」は残す）。
- 計測：`__v292DfixMEM2.stats()`（腕ごとの適用回数・字数・見送り理由）・`.last()`。どちらも OFF のとき送信バイト同一。部品は `v292DfixMEM2-longmem-wire.js`（fix135 の直後に読む）。

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
| GEN1 | index（fix228 の直後） | 既定 OFF。__gen_ の合計（キー名＋値の字数）が 400,000（ソフト上限）を超え、かつ保護される分だけでは超えないときだけ、生きた行・開いていない（この画面・active_slot・10 分以内・Web Lock）・同期の印 CLEAN・f911／f697p／rescue／dl2conflict／fix750／fix587 の印なし・Vault／パスコードでない物語の __gen_ を、最後に開いたのが古い順に、1 回の実行で 1 本だけ最新 1 世代へ減らす（キーは消さない）。世代の指紋が別の物語・読めない（所属不明）、削除済みの物語、既定の chr6 は対象外。GPT #127-UR の条件。r4（独立レビュー）：旧 id（a・b・c・default・chr6）と形の違う id は対象外・前回の続きから回し、確かめられなかった物語は印・本体・世代が変わるまで聞かない・自動の run は 24 時間に 1 回。r3（GPT #127-UT）：所属は鍵の id の完全一致＋アカウント確定（iso2 の持ち主の記録が一致）だけで認め、記録が無ければ残す。同期は同期の印 CLEAN・lastConfirmed（rev と fingerprint）・端末の内容の V2 hash の一致に加え、既存の getStoryV2Once で rev と serverHash の一致まで確かめる（1 回 3 本まで・数える）。本体の写しが無い・読めない・世代より短いときは世代を全部残す。残すのは最新の有効な 1 世代。`dryRun()` は書き込み 0（Promise・数と理由コードだけ・getstory の本数も返す）。GPT #127-UN | `v292DfixGEN1On` `v292DfixGEN1Off` |
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
| fixHOLD2 | index・home | **全物語停止（fix827 の通知）の救済**：journal の対象が開いている物語・同一アカウント・非 Vault・両側 0 ターンと確かめられたときだけ「この作りかけの物語を削除してやり直す」（ホームで公式の削除〔DL2〕→墓標の確認→JR1 の退避）。**昇格中の外見保存の待機**（STARTICON・setProfile） | `v292DfixHOLD2Off`・`v292DfixHOLD2bOff` |
| fix781 | `i17` | 未同期のローカル進行を server canonical で上書きしない（データ消失の根治） | `v292Dfix781Off` ほか |
| fix758 | `i333` | 「クラウドに保存できていません」等のバナー（表示だけ・5 秒ごとに fix697 を読む） | `v292Dfix758Off` |
| fix912 | `i40` | 開いたままの物語で別端末が進めたとき、PUT せず idle で 1 回 reload して収束 | `v292Dfix912Off` |
| fix945 | `i299` | 同じ物語を 2 タブで開いたとき、古いタブが新しい編集を巻き戻すのを防ぐ | `v292Dfix945Off`。93-a の本番 QA（11-03）で「この物語は別のタブ（または画面）で更新されました」の帯が 1 度出て、そのターンは保存されなかった。**原因は未確認**（MIDICON・EDLOG・ICF80 が物語の鍵に書く経路は静的にも動的にも見つからず、93-b の試験では再現しなかった。台帳 2238・2240）。再び出たら、読み直す前に `window.__v292Dfix945.state()`（`stale.why`・`detail`）・保存の応答・ターン数・MIDICON の状態を取る（GPT #127-QS）。**SAVEGUARD1（GPT #127-RW ②・fix945 v2.4・`ed07ab98`・?cb=`20261110-sg1`・GitHub `0df86c9`・fix600 `cfdc3593`）**：別のタブが同じ物語を開いただけで（起動時の設定整理 fixProviderCfg の本文書き直し、または別タブの保存確認）このタブが「古い」になり、旧版は知らせずに生成を続け、保存されないターンが再読み込みで消えていた（Local 実測 8 回中 7 回）。①「古い」と分かった時点で帯を出す（kill `v292Dfix945EarlyOff`）②G.submit を包み、古いタブでは生成を始めない・入力欄を消さない（kill `v292Dfix945GateOff`。index.html は変えない）③止めた保存のメモリ上のターンを `v292Dfix945_rescue_<id>` に退避（**既定 OFF**・ON は `v292Dfix945RescueOn='1'`・止める `v292Dfix945RescueOff`。Vault 非表示・削除・アカウント切替の掃除の一覧に入るまで OFF のまま）。**RESCUE1（GPT #127-RY ④-2・fix945 v2.5 + 新ファイル `v292DfixRESCUE1-rescue-view.js`・GitHub `9903b71`・RESCUE1 `4c1f7eb0`・fix945 v2.5 `2d037fdb`・fix402 `e31b9924`・fix399 `61b1fd5a`・?cb=`20261110-rescue1`）**：③の退避に「掃除・確認・入力欄へ戻す」を付けた。退避を書くのは RESCUE1 の store() だけ（RESCUE1 が無い・止まっている＝書かない）。退避の中身は入力の種類・入力文・本文だけ（plan・会話カード・診断は持たない）＋アカウントの印 `acct`（/auth/me の accountId の 16 桁ハッシュ。生の ID は残さない。アカウントが分からない時は書かない）。上限：1 物語 1 件（上書き）・端末全体 3 件・合計 450,000 字・1 件 200,000 字（超えたら古いターンから落とす・1 ターンで超えるなら書かない）・20 ターン・14 日。掃除（index と home。起動時・/auth/me の答え・アカウントの変化・Vault の答え・15 秒ごと）：Vault で非表示（CopyGate の hidden）→消す／削除（chr6_slots_meta の deleted:true＝DL2 の墓標、または本体も meta の行も無い）→消す／別アカウントの印・印の無い旧形式→消す／ログアウト（この画面の /auth/me が 401・logout()・別タブのログアウト）→全部消す／期限・壊れ・上限超え→古い順に消す。判定できない間（答え待ち・通信失敗）は消さないし見せない。画面（index だけ）：開いている物語に、今のアカウントの退避があり、Vault で見えてよく、このタブが「古い」でないときだけ、入力欄の上に帯「保存されなかったターンの控えがあります（n ターン）」→「見る」で読むだけの一覧・「コピー」・ターンごとの「入力欄に戻す」・「この控えを捨てる」（2 回押し）・「あとで」。**物語へは書き戻さない**（S.turns・本体・marker・クラウドに書かない）。「入力欄に戻す」は押した瞬間に退避を読み直し、アカウント・Vault・「古い」でないことを確かめ直し、入力欄が空のときだけ入力文とモードを戻す（送信はプレイヤー。最新の物語に対して正式な G.submit → S.save → CAS で作り直す）。「控えのターンを末尾にそのまま足す」は入れていない（案のみ）。fix945 v2.5 の変更：退避するターンの始まりを「ディスクのターン数」から「メモリとディスクで最初に食い違うターン」に直した（旧版は本物の競合＝別タブが同じ番号のターンを先に保存、で 1 ターンも退避していなかった。Local 実測）。古いタブで生成を止めたとき（gate）と、帯の「再読み込み」を押したときも、入力欄の文を退避する。クラウドへ運ばない：fix402 / fix399 / home の collectLS と home の G2 関門で `v292Dfix945_rescue_` を対象外にした（旧版は物語 ID を含む key として legacy package に入り得た）。**既定 OFF のまま**（fix945 の定数 `RESCUE_DEFAULT_ON=false`。ON は端末 `v292Dfix945RescueOn='1'`。止める `v292Dfix945RescueOff='1'`＝書かない／`v292DfixRESCUE1Off='1'`＝帯・掃除・書く口が無い＝SAVEGUARD1 と同じ）。検証口 `window.__v292DfixRESCUE1.status()` / `.list()`（本文は返さない）。Local QA（nonet2・偽 AI・Worker v46.40）：本物の 2 タブ競合（新しい物語・古い物語）で 17/0、掃除（Vault・削除・アカウント切替・ログアウト・他アカウント・上限・期限）19/0、kill 2 種で SAVEGUARD1 と同じ、ページのエラー 0。Owner PC で本物の別タブ競合の退避を実機確認済み。未確認：ログアウト・アカウント切替・Vault 非表示の実機確認、全員の既定 ON、WebKit / iPhone。 fix600 は window.S を読むため包めない（index の S は const）。同じ条件の保存止めは fix635 が正式 API で行う（Local 実測で止まる・クラウド送信 0）。SAVEGUARD1 で、fix635 が包めているときは「S.save を包めませんでした」の警告を出さない（偽の警報。state().deferredTo635）。未確認：WebKit / iPhone、本番の実機。**STALE1（GPT #127-RY・GitHub `60ed6a0`・index.html `b6fa31eb`〔最終は `9a8ecde8`〕の fixProviderCfg・kill `v292DfixSTALE1Off`）**：誤って「古い」になる根本を特定（Local 実測）。設定の保存（UI.saveSettings）が、openrouter の物語でも Anthropic 用の欄の既定 model（`claude-haiku-4-5-20251001`）を本文 cfg.model へ入れる → 別タブの起動時の fixProviderCfg がそれを消して本文を書き戻す（cfg.model: claude-haiku… → 無し）→ fix781 の共有 marker の世代が進む（g3→4、確認済み版 lastConfirmed.serverRev は変わらない・サーバーの版も進まない）→ 元のタブの fix945 が STALE。STALE1 は「openrouter で Anthropic 形の model を消すだけ」の本文書込をしない（openrouter の送信は cfg.orModel だけを使う。メモリ上の正規化 fix899 はそのまま。key / provider の取り違えの修正は従来どおり書く）。検証口 `window.__v292DfixSTALE1.state()`（skipped＝見送った回数）。確認済み版を進める処理は足していない（#127-RY）。STALE1 でも未確認：WebKit / iPhone、本番の実機。fixGenderAndNames / purgeBadDialogues など他の起動時の正規化が、直す必要のある物語で別タブの起動時に 1 回書く経路（試験の物語では書込 0）。UI.saveSettings が openrouter でも Anthropic 用の model を本文へ入れる元の動き自体は変えていない（STALE1 の後は無害。直すなら別レーン） **RESCUEON（GPT #127-SA ①・fix945 v2.6・GitHub `72df0ea`・fix945 `d5a83d5f`・?cb=`20261111-rescueon`・Owner PC の実機 PASS＝台帳 2319／2323）**：上に書いた「既定 OFF」は v2.5 までの話。v2.6 から止めた保存のターンと入力欄の文の退避（RESCUE1 の控え）が**全アカウントで既定 ON**（定数 `RESCUE_DEFAULT_ON=true`。RESCUE1 の部品が無い・止まっているときは書かないのは同じ）。止める：端末 `v292Dfix945RescueOff='1'`（書かない）・`v292DfixRESCUE1Off='1'`（帯・掃除・書く口が無い）。index.html は fix945 の ?cb= を 1 つ変えただけ。未確認：ログアウト・アカウント切替・Vault 非表示の実機、iPhone。 |
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

#### SAVE1 — REG1・LSF1（クラウド保存が止まらない・画面を離れるときの保存。11-14・GitHub `972330d`）
- REG1（av2-data・fix912・fix758・既定 ON・kill `v292DfixREG1Off='1'`＝従来の 1 回だけの書き込み）：Asset v2 の登録（putcanonical）が 1 回失敗しただけで、その物語のクラウド保存が止まり続ける件。着地していないと分かれば同じ登録 ID でもう一度だけ書く／証明できなければ最新のサーバー本文の上で作り直す。区切りを使い切ったら「この端末には保存済み・クラウドは未保存」と「もう一度試す」を出す。
- LSF1（fix697・既定 ON・kill `v292DfixLSF1Off='1'`）：visibilitychange（hidden）と pagehide で、12 秒の保存予約があれば既存の commit の経路で今すぐ始める（新しい送信経路・sendBeacon は使わない）。
- 同じ束の SD1・ZT1 は §2.6。

#### GC1 / GC1b — 保存中に押した「続きを書く」を 1 件だけ預かる（fix912。GC1 は 11-12 `63bfe48`・GC1b は 11-13 `b385f25`）
- 既定 ON・kill `v292DfixGC1Off='1'`（従来どおり。`v292DfixGC1On` は読まない）。保存中の「続きを書く」を 1 件だけ預かり、保存が CLEAN になってから送る（二度押しは吸収・別の操作で取り消し）。GC1b：CLEAN を 2 回続けて確かめてから始め、始められなかったときは「続けられませんでした。もう一度お試しください。」を出す（無言にしない）。REG1 で止まった物語は預からない。

#### KEY1 / SOL1 — キーの持ち主を完全一致で決める・物語を開いている印（11-12・GitHub `e4d982e`・`v292DfixKEY1-story-key.js`・`v292DfixSOL1-story-open-lock.js`）
- KEY1（index と home が読む・既定 ON・kill `v292DfixKEY1Off='1'`＝各呼び出し側が従来の部分一致の式）：localStorage のキーがどの物語のものかを、既知の family の区切りで囲まれた id の完全一致で決める（fix562・fix564・fix579・fix587・fix642・E64 が使う）。書き込み 0・通信 0。
- SOL1（index が読む・既定 ON・kill `v292DfixSOL1Off='1'`）：物語画面を開いている間、Web Lock `chronicle:story-open:<id>`（shared）を持つ。STORE1b はこれを見て開いている物語に触らない。書き込み 0・通信 0。

### 2.6 削除・墓標（危険領域）

#### DL2 — サーバーの版を基準にした物語の削除（S-2）
- 状態：本番稼働 `i154`（`data-dl2="index"`）・`h32`（`data-dl2="home"`）・sha `22e0432c`（?cb=`20261111-unprot`。UNPROT から。前は `cade2ef5`・`20261111-delall2`）。kill `v292DfixDL2Off`。DELALL（2026-11-11・Owner の要望）から、知人（beta／paid）も自分の物語を削除できる（判定は fix933）。「止まっている削除」の帯と一覧は、今のアカウントの listshadow にあり、iso2 が他のアカウントの印を付けていない物語の計画だけを出す（端末に残った他のアカウントの計画は出さない）。確認シートは「削除する物語：「名前」」と「削除した物語は、ご自身では元に戻せません。」を送る直前に出す。
- 役割：**削除の入口はホームだけ**。確認シート（画面内。confirm/alert は使わない）を開く前に `/api/auth/me` の accountId と listshadow を読み、server の rev / hash を基準に `deletestory2` を送る。ゲーム画面とギャラリーの削除の入口はホームへ誘導するだけ。
- サーバーが拒否するもの：保護している物語、Vault で隠した物語、この端末にしかない物語。サーバーに墓標を書くソフト削除で、**元に戻す手段は無い**。
- 関連：DP3（端末の一覧から外す。`v292DfixDP3On`。HOLD 中）、DP4。
- UNPROT（Owner の決定 2026-11-11・GitHub `83a8859`・Worker `v46.44b-unprot-fc` `1c585c24`）：削除できない保護の物語を `smv6r10s7u9` の 1 件だけにした（それまでは 3 件）。画面側の `PROTECT`（表示用）と Worker の `CHR_DEL2_DEFAULT_PROTECT` を同じ 1 件にそろえた。最終の関所は Worker（env では外せない）。そのほかの拒否の条件（Vault で隠した物語・この端末にしかない物語）は変えていない。サーバーに墓標を書くソフト削除で、元に戻す手段が無いのは従来どおり。

#### fix933 — 削除の入口を出してよいアカウントの判定
- 状態：本番稼働 `i153`・`h27`・sha `399508fd`・?cb=`20261111-delall`（GitHub `8b688f2`）。owner に加えて、Worker の `/auth/me` が `features.storyDelete2: true` と答えたアカウント（Worker `v46.43-delall-fc` で beta・paid）に削除を許す。判定はこの画面の最新の `/auth/me` の答えだけ（保存済みの印・答え待ち・旧 Worker では開かない＝fail-closed）。閉じているアカウントには従来どおり削除ボタンを出さず案内文を出す。kill：端末 `v292Dfix933Off`（全部止める）・`v292DfixDELALLOff='1'`（その端末では owner だけ）・Worker env `CHR_DELETE2_ALL_OFF=1`（知人は 403・`/auth/me` の `storyDelete2` が false）。
- DELALL の Worker（`v46.43-delall-fc`・ソース `15d46408`・v46.42 `28a36bf0` の上）：deletestory2 の知人への開放・`/auth/me` の `features.storyDelete2`・削除 1 回ごとに `admin_audit` へ 1 行（action `story-delete2`：accountId・story_id・結果コード・rev・時刻だけ。物語の本文は入れない。kill env `CHR_DELETE2_AUDIT_OFF=1`）。env `CHR_DELETE2_OFF=1` は従来どおり全員を止める。旧 env `CHR_DELETE2_OWNER_ONLY` は v46.43 では読まない。戻し先：Worker `28a36bf0`、Pages は `72df0ea` の同名のファイル。本番の読み戻し・実機は未確認。

#### fix587 / fix579 / fix602 / fix660 / fix577 / fix710 / fix642 / JR1 — 旧来の削除の安全装置群
- fix587（`i149` `h26`）：StoryLifecycleService。削除の正規の手順（再読込 → exact key と hash → 控え → 墓標 → …）。cc2 を必要時に動的読込。
- fix579（`i148` `h18`）：墓標のスキーマとマージ規則（`chr6_slots_meta` の `deleted:true`）。
- fix602（`i150` `h28`）：墓標が立ったスロットへの書き込みを影監視（拒否しない・記録だけ）。
- fix660（`v292Dfix660-delete-gateway.js` `i34` `h12`、`v292Dfix660-backup-gc.js` `i53` `h17`）：物理削除の唯一の実行者と、何を消すかを決める BackupGC。
- fix577（`i151`）：削除の入口を 1 つに寄せる。fix710（`h31`）：ホームで保留中の削除を起動時に 1 回再開。fix642（`h29`）：削除の read-back（操作専用）。
- JR1（`i332` `h34`）：サーバーで削除済みの物語を指したまま残った fix750 の journal を退避し、新しい物語が作れない・全物語が止まる状態を解く。

#### SD1 / FREE2（DL2）— 端末のターンが全部クラウドにあるときだけ削除・削除の時点の証明（11-14〜11-15・`v292DfixDL2-server-delete.js`）
- SD1（GitHub `972330d`・既定 ON・kill `v292DfixSD1Off='1'`。`v292DfixSD1On` は読まない）：削除のシートで、端末の本文のターン数がサーバーの一覧より多い行は選べなくする。送る直前に getstory で rev・serverHash と端末のターンを確かめる。読むだけ（新しい書き込み・自動の保存・自動の再送なし）。
- FREE2（`650cff9`）：公式の削除が成立した直後、この端末の全体（fix697.projectionV2）の SHA-256 がサーバーの墓標の hash と一致したときだけ、証明 `v292DfixFREE2_proofs[id]` を残す（題名・本文は入れない）。FREE2c（`2e6e2c9`）で**既定 ON**（kill `v292DfixFREE2Off='1'`。`v292DfixFREE2On` は読まない）。

#### STORE1b — HOME「この端末の空き容量を増やす」（11-12 r2・GitHub `a46c2f1`、以後 PURGE1c・STUCK1・ZT1・FREE2c・FREE2d。`v292DfixSTORE1b-device-free.js`）
- 状態：本番の home.html が読む（DL2 の直後）。入口は既定で出る（kill `v292DfixSTORE1Off='1'`＝入口を出さない）。HOME を開いただけでは消さない。Owner が選んだ物語だけ 1 件ずつ消す。まとめての実行は既定 OFF（`v292DfixSTORE1Multi='1'`・最大 10 件）。数えるだけの dry-run は `v292DfixSTORE1Dry='1'`。
- 消してよい条件（全部）：サーバーで削除が確定（deleted===true）・同じ実行の /api/auth/me 前後で同じアカウント・Vault に関わらない・開いていない（SOL1 の Web Lock・lastOpenedAt 10 分）・未送信なし・本文の内容がサーバーと 1 文字ずつ一致。消すキーは KEY1 の完全一致だけ。排他 Web Lock の中で確かめ直してから消す。記録 `v292DfixSTORE1Log` は件数と理由コードだけ。
- PURGE1c（`5b8a837`）：PURGE1（控えまで含めた完全削除）は**既定 OFF のまま**（`v292DfixPURGE1On='1'`・kill `v292DfixPURGE1Off`・Vault の名前だけの削除 `v292DfixPURGE1VaultOn` はこのレーンでは使わない）。段階 1 の QA 条件（未送信の物語は消さない・最後に墓標の題名を '' にする）を足した。P0-B（fix562・fix569・**既定 ON**・kill `v292DfixP0BOff='1'`）：保護判定を名前と凍結した proof だけで決める（ほかの物語の値を読まない）。
- STUCK1（`e37f802`・**既定 OFF**・`v292DfixSTUCK1On='1'`・kill `v292DfixSTUCK1Off='1'`）：削除の時点で印が DIRTY だった写しを、墓標の hash の一致で証明できたときだけ通す。ZT1（`972330d`・**既定 OFF**・`v292DfixZT1On='1'`・kill `v292DfixZT1Off='1'`）：0 ターンのまま削除した物語を、hash の一致を確かめて通す。
- FREE2c（`2e6e2c9`・既定 ON・kill `v292DfixFREE2Off='1'`）：シート・dry-run（`free2DryRun`）・explain・実行が同じ判定 judgeOne を通る。公式の削除で立てた墓標は印が CLEAN でも hash の一致を求める。FREE2d（`72ab286`・kill `v292DfixFREE2dOff='1'`）：サーバーの行が memoryV1 を持つときは端末の値も hash に入れる・本文を持たない墓標を覚えて getstory を繰り返さない・getstory は最大 4 本まで同時。
- DISCARD1（11-16・GitHub `68dec8f`・**手動専用**・UI なし・自動では呼ばれない・kill `v292DfixDISCARD1Off='1'`（fix562 も断る）／`v292DfixSTORE1Off='1'`）：Owner の承認（2026-11-15・GPT #127-UB/UD）による「サーバーで削除済みだが、サーバーの内容と同じと確かめられなかった端末の写し」を捨てる経路。`__v292DfixSTORE1b.discard1DryRun()`（読むだけ）／`.discard1Run({ack:…})`（コードに固定の ack の文字列が一致しないと何もしない）。その場の getstory で墓標（deleted===true）を確かめ直し、Vault・別アカウント・活動中・未同期・旧 id・保護 id は対象外。消すキーは FREE2 の解放と同じ（snapshot・控え・未送信の写しと meta の墓標は残す）。fix562・fix569 は intent `device-discard` を、同じ実行で登録した証明（exact key・値・ack）のときだけ通す。FREE2 の通常の判定は変えない。手順書（RUNBOOK）は作業環境の `outputs/discard1/RUNBOOK.md`（リポジトリには入れていない）。
- 診断：`window.__v292DfixSTORE1b.status()`／`.dryRun()`（消さない）。
#### DISCARD2 / AUTOCLEAN1 — 削除済みの物語のスナップショットを捨てる（11-15〜11-16・GitHub `ad76fd4`・`a0e0323`・STORE1b・fix562・fix569）
- DISCARD2（手動専用・UI なし・自動経路なし。kill `v292DfixDISCARD2Off='1'`〔fix562 も断る〕・`v292DfixSTORE1Off='1'`）：削除済みの物語のスナップショット（`chr6_snap_`／`chr6_snapd_`）だけを捨てる。持ち主の id は KEY1 の完全一致。manifest が読めない・id が合わない・ほかの物語の manifest が指している組は unknown-owner として消さない。本体が残る物語（live）・DISCARD1 の端末側の条件（Vault・墓標の行がちょうど 1・別アカウント・最近開いた・印が CLEAN でない・送信中 等）・story-open の Lock があれば止める。実行は物語ごとに Lock の中で getstory（deleted===true）を取り直し、実体 → manifest の順に fix562（intent `snapshot-discard`）→ fix569 tryDeleteExact で 1 本ずつ。meta の墓標・`chr6_bk_`・`__gen_`・本体・サイドストアには触らない。記録 `v292DfixDISCARD2Log`。FREE2・DISCARD1 は変えない。
- AUTOCLEAN1（**既定 OFF**・端末の鍵 `v292DfixAUTOCLEAN1On='1'` の端末だけ〔アカウント単位ではない〕・kill `v292DfixAUTOCLEAN1Off='1'` と DISCARD2 の kill が優先。全員 ON はコードの `AC_DEFAULT_ON` の 1 行）：HOME だけで、削除から 7 日たった物語のスナップショットを DISCARD2 と同じ経路で自動で消す。GEN1 r3 (c)（GPT #127-UT 1(c)）から、本体の写しが無い物語の `__gen_` も同じ実行で捨てる（鍵の id の完全一致・iso2 の持ち主の記録が一致・世代に別の物語の指紋なし・Vault／パスコードでない・サーバーの墓標と 7 日。fix562 の DISCARD2 の許可は AUTOCLEAN1 の proof（acGen）のときだけ。手動の DISCARD2 は変わらない。r4：専用の On 鍵 `v292DfixGEN1cOn='1'`（既定 OFF。AUTOCLEAN1 も On の端末だけ）・kill `v292DfixGEN1cOff='1'` が優先。消した世代の数と字数は記録 `v292DfixAUTOCLEAN1Log`（gens・genChars）と `autoclean()` に、見込みは `autoclean({ dryRun:true })` の gen に出る）。本体の写しがある物語の `__gen_` は、もともと段 1（FREE2）で一緒に消える。年齢はサーバーの時計（/api/auth/me の Date）だけで決める。1 日 1 回・1 回の getstory は 6 本まで。記録 `v292DfixAUTOCLEAN1Log`（件数と時刻だけ）。診断 `autoclean()`／`autoclean({ dryRun:true })`（消さない）。AUTOCLEAN1 r4：記録の各回に、断った理由の名前と数（`why`。段 1 の FREE2 の理由は `f2:`・段 1 のサーバーの答えは `s1:`・段 2 は `s2:`・本体も控えも無い物語は `nothing-held`）・調べた件数（`seen`）・getstory の本数（`q`）・7 日以上の候補の数（`aged`）・残り（`more`）を足す（内訳は直近 10 回分まで・鍵名・id・本文は入れない）。`autoclean({ dryRun:true })` は、サーバーに聞かずに分かる内訳（`breakdown`）と次の 1 回の見込みを返す。進みの見直しは端末の鍵 `v292DfixAUTOCLEAN1Pace`（既定 OFF。`a`＝0 件で終わって残りがある回は、30 分以上あけて次の HOME で続きから・進みの無いまま候補を 1 周したら止める／`b`＝消せて残りがある回のあと、同じ HOME で 1 回だけ続ける／`1`＝両方。どちらも 24 時間の getstory は 18 本まで。鍵が無ければ今までどおり 1 日 1 回・6 本）。AUTOCLEAN1 r6（GPT #127-UV 2・r5 の日数の鍵を置き換え）：自動の実行（HOME）とふつうの手動の run／force は常に 7 日。端末の鍵 `v292DfixAUTOCLEAN1Days` はどこにも効かない（残っていれば dry-run と `autoclean()` の `daysKey` に `ignored`）。手動の dry-run だけ、その 1 回の引数で日数を変えて候補を調べられる（`autoclean({ dryRun:true, days:1 })`・0 以上 30 以下・小数可・不正は 7 日で `daysArg` が invalid）。7 日以外で実際に消すのは、その 1 回の呼び出しに `qaDays` と `ack:'QA-DAYS-OWNER-ACK'` を両方渡した QA 操作だけ（`autoclean({ run:true, force:true, qaDays:1, ack:'QA-DAYS-OWNER-ACK' })`。片方だけ・形の違う値は何もしない：`qa-ack-mismatch`／`qa-days-missing`／`qa-days-invalid`）。記録はその回だけ `qa`・`days`。qaDays も force も、Vault・未同期・照合・生きている物語・旧 id・サーバーの墓標と時計の確認を迂回しない（変わるのは日数と、force の 24 時間の間隔だけ）。1 回 3 件・24 時間の getstory 18 本は同じ。0 日は 1 ミリ秒として扱う。画面の文言は常に 7 日。VCLEAN1（Owner 2026-11-16 12:30・GPT #127-UX 1 条件付き GO・Owner PC 限定・**既定 OFF**・端末の鍵 `v292DfixVCLEAN1On='1'`・kill `v292DfixVCLEAN1Off='1'`・AUTOCLEAN1 の On も要る）：Vault で隠したまま削除した物語の端末の写しを、HOME の Vault（v2）を解錠しているときだけ、削除から 7 日（常に 7 日・qaDays は効かない）で消す。本番の Worker（v4649）では Vault v1 の解錠は休止中（VAULT_V1_DORMANT）なので v2 の解錠だけを見る。解錠中に vault2status の hiddenIds を 1 回読み（解錠中は fix889 の一覧から外れるため）、既存の listShadowBasisOnce（本文なし）を 1 回呼び、削除済み・updatedAt とサーバーの今で 7 日・端末の全体の hash＝serverHash（FREE2 の dirtyProof・memoryV1 の有無の 2 通り）を確かめる。通った id だけ隠し一覧の判定を外し、ほかの関門（未同期・送信中・開いている・パスコード・旧 id）は全部そのまま。その物語の getstory は呼ばない（本文を取り寄せない）。本体の写しが無い隠した物語は残す。解錠していない・鍵が無い → Vault の口は呼ばない（通信 0）。記録（`vc`）・dry-run（`vclean`）は件数・字数・理由の名前（`vc:*`）だけ。VAULTGUARD1（GPT #127-UZ 2・**既定 ON**・kill `v292DfixVAULTGUARD1Off='1'`）：Vault（v2）を解錠している間も、v2 で隠している物語を AUTOCLEAN1／FREE2／DISCARD1／DISCARD2／GEN1c の通常の getstory 照合から外す（理由は f2:vault／s2:vault）。判定の根拠は、入口ごとに読む vault2status の hiddenIds（v2 の隠し状態そのもの・fix889 の画面表示用の一覧とは独立。v1 を v2 とみなさない）。解錠中なのに隠した id が分からないときは、その回は全部止める（`vault2-ids-unknown`・getstory 0）。最後の守りとして getstory の直前に、使い回さずに毎回 vault2status を読み直す（r2）。入口の判定で使い回すのは 15 秒以内で、しかも vault2-ui の status() の unlocked と hiddenCount が覚えた時と同じときだけ（r2）。ok:true でも unlocked が真偽値でない応答は分からない扱い（r2）。施錠中・Vault v2 が無い端末は従来どおり。VCLEAN1 の本文なしの照合だけはこれまでどおり通る。隠した id はメモリだけで、`status().vaultGuard` には数だけ。

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
- 状態：本番稼働（81-admg-a・admg1。80-int-a の admf2 から更新）。`v292DfixADMF1-account-flags.js`・80-int-a の番号で `i9`（fix893 の直後。home.html では読まない）・sha `8e51e63e`・?cb=`20261110-bundle93-l`（93-l で鍵 `lore1`・`agency1` を追加。版 `admg1-20261101-bundle81+starticon2+idsplit2+kn1+lore1+agency1`。`agency1` は鍵だけ＝gate('agency1') が読める。使う本体は別レーン。許可キーは 13 個〔Worker v46.40〕。fix893 の flagsOf の上限 16 まで残り 3。93-j〜93-k は `697272e3`・?cb=`20261109-bundle93-j`〔93-j で鍵 kn1 を追加〕。93-i は `b35e6324`）（93-i で `mxreg1`・`starticon1`・`idsplit2` を足した。版 `admg1-20261101-bundle81+starticon2+idsplit2`。93-a〜93-h は `93d1ac47`・?cb=`20261103-bundle93-a`〔93-a で `midicon1` を足した〕。81-admg-a〜92-a は `5077be9b`・?cb=`20261101-bundle81-admg-a`）。kill `v292DfixADMF1Off`（ADMF1 を使う機能は OFF になる）。Worker 側の停止は env `CHR_ACCT_FLAGS_OFF=1`。
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

#### SEC0 / SEC1 / ADM3b — 合言葉の認証の退役・画像の配信を厳しく・管理 API は伏字のみ（Worker `v46.43b-sec0-fc` → `v46.44-sec1-fc` → `v46.44b-unprot-fc` → `v46.44b-unprot-ifx11-fc`・管理者画面 ADM3b）
- SEC0（Worker `v46.43b-sec0-fc`・ソース `457468ed`）：記帳用の予約名 `master` を合言葉として通さない（401）。kill：Worker env `CHR_PASS_RESERVED_OFF='1'`。
- SEC1（Worker `v46.44-sec1-fc`・ソース `f345181e`。もとは `457468ed`。新しい env を足しただけなので、戻しは Worker のソースを貼り戻す）：
  - 画像の配信 `/img`：返すのは png／jpeg／webp（先頭バイトが申告と一致）と、fix634 の外見文の束（キーが `v292meta1_*`・application/json・中身が JSON object）だけ。それ以外は 415。保存済み URL への 302 もやめて 415。すべての `/img` 応答に `X-Content-Type-Options: nosniff` と `Content-Security-Policy: default-src 'none'; sandbox`。画像の保存 `putimg` も同じ判定で 415 `bad-image-type`（大きさの上限・同一内容 noop・mid・CAS は不変）。旧 put／`GET /img` の pkg.idb 展開（2 か所）も、配信できない中身は書かない。kill：env `CHR_IMG_STRICT_OFF='1'`（ヘッダも含め旧挙動）。
  - 合言葉（`x-chronicle-pass`）での認証を退役（`ACCESS_CODE` も `code:` の行も 401）。復帰：env `CHR_PASS_AUTH_ON='1'`。
  - 旧ヘッダ session（`x-chronicle-session`）と旧 Google ヘッダ（`x-google-id`）を退役。復帰：env `CHR_LEGACY_AUTH_ON='1'`。
  - 費用が出る経路（本文生成／`/image`／`/inspect`／`/avatar-run`／`/avatar-inspect`／`/imgsafe-dryrun`）は cookie の `acct:` だけ。匿名の経路は不変。復帰：env `CHR_SPEND_LEGACY_ON='1'`。
  - 管理 API：`masked:true` の無い要求は 400 `MASKED_REQUIRED`（管理者画面 `8101b836` は常に `masked:true`）。復帰：env `CHR_ADM_UNMASKED_ON='1'`。
  - 本文生成：`max_tokens` も `max_completion_tokens` も無いときは上限（既定 6000）を入れる。復帰：env `CHR_TOKCLAMP_MISSING_OFF='1'`。
  - 生成系 POST の本文に上限（1 MiB、`/inspect` だけ 4 MiB）。超えたら 413 `too-large`。`/save` と `/admin` は対象外。復帰：env `CHR_GEN_BODY_CAP_OFF='1'`。
  - ルート JSON：workerBuild `v46.44-sec1-fc`。`imgStrict`・`passAuth`・`legacyAuth`・`spendAcctOnly`・`admMaskedOnly`・`tokClampMissing`・`genBodyCap` を追加（`passReserved` は SEC0 のまま 1 つ）。
- `v46.44b-unprot-fc`（ソース `1c585c24`）：UNPROT（削除の保護は 1 件だけ。§2.6 の DL2）。`v46.44b-unprot-ifx11-fc`（ソース `9878917f`）：ICONQ1 の Worker 側（§2.9）。
- ADM3b（管理者画面。もとは `8101b836`。Owner の承認 3 点：①6 区画の並び ②「全部 ON」系は上の箱「すべての機能を全員に ON」と各行のボタンだけ ③合言葉の画面を全部撤去）：合言葉の行の表・発行フォーム・名前の絞り込み欄・関連コードと、一括 ON のボタン（「全機能を一括 ON（全体）」「試験中の機能も含めて全部 ON（全体）」・機能ごとの「まとめて ON／OFF」・アカウントごとの「利用可能な機能をまとめて ON」。合計 32 ボタンと表示モード 2 種）を撤去した。上の箱（bulkAllAsk／bulkAllRun）は変えていない。list は従来どおり呼ぶ（設定と許可メールのため）。Worker は変更なし。戻し先：`8101b836`。手元の `admin/index.html` は `7fa89716`。本番に置かれた版の読み戻しは、この資料では未確認。

#### LIM1 — アカウントごとの上限の設定（11-13・GitHub `2361a19`・Worker `v46.45-lim1-fc`・fix893・ADMF1・STARTICON）
- 管理者画面の「上限の設定」の値（Worker `/auth/me` の accountLimits）を端末が読む（fix893 の写し・in-memory・書き込み 0）。ADMF1 の `limit(key, dflt)`。STARTICON の 1 日の物語数（`starticon_day_stories`）と 1 物語の枚数がアカウントの値になる（-1＝無制限）。行なし・旧 Worker・別アカウント・kill `v292DfixLIM1Off='1'` のときは今までの定数（5 物語・4 枚）。

#### ACCT1 — Owner のアカウントの試し ON（長期記憶の試し 4 つ・SCENE1 b）（11-22・LOCAL・`v292DfixACCT1-owner-account-trial.js`）
- 対象：項目 mem（MEM2 腕 A・MEM3b・MEM3・MEM4）と項目 scene1b（SCENE1 の b だけ。a・c は端末の鍵のまま）。互いに連動しない。各部品の on() が鍵の OR として聞く（覚えない・読むだけ・書き込み 0）。
- Owner の判定は OWNERON1 の owner()（fix893 serverMe の entitlement owner・active・flagsSnap と同じアカウント・ログインの印・匿名でない）。未取得・失敗・別アカウント・OWNERON1 が無い → OFF。MEMTRIAL（Owner 以外を止める）はそのまま。
- 優先順：各部品の Off 鍵 ＞ `v292DfixACCT1Off` ＞ 項目の Off（`v292DfixACCT1MemOff`・`v292DfixACCT1Scene1bOff`）＞ Owner 判定（r3 から scene1b も鍵なし）。`v292DfixOWNERON1Off` でも OFF。診断 `window.__v292DfixACCT1.status()`。
- r2：fix135 MEM3 の設定の要点（lore の公開部分）を渡すかの Vault 判定を、凍結した fix889 だけから VAULTGATE2 の hidden()（v2 と v1 の両方・未取得／失敗は隠した側）へ。VAULTGATE2 が無い・kill → 渡さない。ACCT1 と関係なく効く。

#### OWNERON1 — Owner の端末だけ指定の機能を既定 ON（11-15・GitHub `2b3271e`・`v292DfixOWNERON1-owner-defaults.js`）
- 対象：PLACE1・SPKW1。各機能の on() が呼ぶたびに聞く（覚えない・読むだけ・書き込み 0）。Owner の判定は fix893 の serverMe() が entitlement 'owner' かつ active・accountId が 32 桁・flagsSnap と同じアカウント・ログインの印と同じ・匿名経路でない、が全部そろうときだけ（欠けたら OFF）。
- 優先順：各機能の Off 鍵 ＞ 全体 kill `v292DfixOWNERON1Off='1'` ＞ 各機能の On 鍵 ＞ Owner 判定。Owner 以外・未ログインは部品が無いのと同じ。診断 `window.__v292DfixOWNERON1.status()`。

#### fix328 — Google ログイン（GIS）
- 状態：本番稼働 `i167`。Google Identity Services を読み込んで ID トークンを得る（pages.dev では、その後の認証は fix893 の cookie 方式）。

#### fix886 / fix890 — 匿名のお試し（public anon）
- 状態：本番稼働 `i347` `i348`。Worker が匿名の経路を使えると名乗るときだけ動く。Owner の方針は「匿名お試しは無しでよい」。 **2026-11-11 の CLEANUP2（C2a・GitHub `05da4aa`）で、この 2 本の `index.html` からの読み込みを停止した**（ファイルは残る）。同時に index.html の inline `id=v292Dfix890-early` と、入口の案内文の「無料お試しには 1 日の利用上限があります。」の 1 文も外した。Worker の匿名の経路を閉じるかどうかは、この資料では未確認。

#### bav2-beta — 招待者（beta）を最初から Asset v2 で始める
- 状態：本番稼働 `i9` `h6`。`/auth/me` の `features.assetV2Beta` が true の端末で Asset v2 の端末フラグを ON にする（自分で ON にした分だけ戻す）。

### 2.9 アイコン・画像

#### av2-data / av2-portrait / av2-migrate-ui / LD1 / fg3 — Asset v2（新しいアイコンの仕組み）
- av2-data（`i23` `h20`。89-b では `i25` `h20`・sha `589b18e7`・?cb=`20261111-spbase2`（SPBASE2〔GPT #127-SA・GitHub `29fad6b`〕は下に書いた。SPBASE1〔GPT #127-RW ①〕：外見の確定などの補助の書き込み〔sidePortCommit：setProfile／addBinding／deleteCharacter〕が自分の書き込みでサーバーの版を 1 つ進めたとき、受理＝読み戻しが一致・端末の保存とメモリへの反映が成功・確認済みの版とハッシュが書く前の版と同じ・間に別の書き手がいない・DIVERGED／BOOTSTRAP_HOLD でない・送信中の保存が無い、のすべてを満たす場合に限り、fix781 の「最後に確認した版」を進める〔ID 登録の F-FZ1(2) と同じ規則〕。これが無いと、その後の編集の保存で自分の書き込みを「別の端末の変更」と取り違え、「クラウドと差分があります」の 2 択が出ていた。SPBASE2（GPT #127-SA）：schema2 への切り替え（switchToSchema2）にも同じ 5 条件・同じ規則を入れた（読み戻しが一致して端末を S2 にした直後、flush の前）。これが無いと、切替の直後に編集やターンを進めた／切替の flush が後回しになったときに、自分の切替を「別の端末の変更」と取り違えて 2 択が出て、ターンがクラウドへ届かなかった（Local で再現）。切替の通信中に本人が保存した場合は条件を満たさず、今も 2 択で止まる。kill `v292DfixSPBASE2Off='1'`。SPBASE1 の kill `v292DfixSPBASE1Off='1'`。SPBASE1 の時は `68243311`・?cb=`20261110-spbase1`。前は `bc08ce7b`・?cb=`20261108-bundle93-i`）。それ以前の説明（93-i で STARTICON の外見の由来：`setProfile` は `origin` に `starticon_auto` だけを受け付け〔ほかの値は `BAD_ORIGIN`〕、そのとき profile に `origin` と `basis`〔`desc`＝説明文の句そのまま／`ai`＝文章 AI の案〕を入れる。自動の保存は、CAS の中でサーバーにもう外見があれば書かない〔`APPEARANCE_EXISTS`〕。`suggestAppearance` の `current.origin` で読める。ボタンからの保存は origin なし＝自動の外見を置き換える。90-b〜93-h は `a0c5774a`・?cb=`20261103-bundle90-b`。90-b で、422 `APPEARANCE_UNSAFE_POLICY` の答えの `imgsafeWhy` のうち `real_person`・`explicit` だけを結果に渡す）。89-b〜90-a は `d208ae87`、86〜87 は `c1931013`。89-b で 422 `APPEARANCE_UNSAFE_POLICY` も「絵を作っていない（呼び出し 0）」として返す）：データ層。キャラごとの ID と絵の結び付け（bindings）をサーバーが正として持つ。保存の 4 か所の境界（fix697・fix743・fix705）で押し引きする。
- av2-portrait（`i340`。86 では `i345`）：表示層。`portrait.list` / `asset.get`、asset_id ごとの IndexedDB キャッシュ、保留・拒否・競合の理由表示、明示の削除 UI。sha `0cc62adf`・?cb=`20261103-bundle93-a`（93-a で、MIDICON の画像専用の控え `ch_mx` の絵を出す表示を足した：未登録の話者で呼び名か言い換えが控えと同じなら控えの絵＋小さな「自動」・控えが登録キャラに引き継がれてそのキャラに絵があればそちらを優先・登録キャラにまだ絵が無いあいだは控えの絵を出したまま。データは MIDICON が渡すだけで、`img` の `src` を書くのはこの部品の `applyImg`／`sweep` だけ。90-b〜92-a は `12c563bf`・?cb=`20261103-bundle90-b`。90-b で `APPEARANCE_UNSAFE_POLICY` の文を `imgsafeWhy` で分ける：`real_person`・`explicit`・理由なしは中立の文。89-b〜90-a は `00a31caf`。89-b で更新：`APPEARANCE_UNSAFE_POLICY` の理由の文と外見の欄の道具。86〜87 は `15a51215`。86 で更新：Worker が 422 `APPEARANCE_UNSAFE_MINOR` を返したときの理由の文と、分類の 2 語（種類だけ）の添え方。外見の欄の道具は開いたままにする）。前は sha `fdd77f2a`・?cb=`20261101-bundle83-flow-c`。82b で FLW1（キャラ一覧の「最初の絵を作る」「この外見で確定」「削除」の確認をカードの中に出す。文面と OK のあとの処理は同じ。DOM が使えないときだけ従来の confirm。kill `v292DfixFLW1Off`）、83 で FLW2 の呼び出し口（外見の確定のあとの読み直しの前に FLW2 を呼ぶ）。
- av2-migrate-ui（`i345`）：Owner 向けの移行 UI（準備 → 今の絵を候補として確保 → 採用 → …）。入口は UI1 で「⚙ 設定 → ⚙ システム → 詳細設定」へ。サーバー側の許可リストが最終の権限。
- LD1（`i341`）：今の画風（preset）で採用された絵を出す（表示だけ）。sha `a7a98a65`・?cb=`20261101-bundle81-admg-a`（81-admg-a で更新）。kill `v292DfixD1Off`（常に先）。81-admg-a から ON は ADMF1 の `gate('ld1', 端末の opt-in v292DfixLD1On)`（公開範囲 CANARY＝Owner のアカウントだけ。Owner で行が無いときは端末の opt-in）。答えが後から届いて ON になったら `whenOn` で 1 回だけ起動。記録時点で Owner のアカウントが ON かは未確認。
- LC1（`i343` 外見の案・`i344` 作業欄）：「👥 キャラ」の最上段の作業欄（1 人ずつ「絵を作る／絵を変える」・「まとめて絵を作る」）。作業欄 `v292DfixLC1-workbench.js` の sha `aea27e80`・?cb=`20261103-bundle90-b`（90-b で `APPEARANCE_UNSAFE_POLICY` の文を `imgsafeWhy` で分ける。90-a は `75c596c0`（下書きの知らせ）。89-b は `8def3834`（`APPEARANCE_UNSAFE_POLICY` の理由の文・やり直しなし・「外見を直す」）、86〜87 は `db457b4c`）・外見の案 `v292DfixLC1-appearance-proposal.js` の sha `5556f614`・?cb=`20261102-bundle90-a`（版 `LC1prop-r4f-90a`。89-b は `fb4e689f`（88-e）、87 は `4dbacfc2`、86 は `48be7f2a`、84 以前は `a012e615`）（86 の番号で外見の案 `i348`・作業欄 `i349`）。kill `v292DfixLC1Off`（常に先）。81-admg-a から ON は ADMF1 の `gate('lc1', 端末の opt-in v292DfixLC1On)`。**公開範囲は 86 から CANARY＝Owner のアカウントだけ ON にできる**（Worker `v46.27` で HOLD から変更・GPT #127-PQ）。Owner の実機 QA（5 人）は PASS（GPT #127-PU）。一般公開は HOLD。外見の案の作り方：①86 の LC1OX：水着・細身・華奢・太もも・胸元のリボン・普段着や衣装などの普通の言葉を下書きに残す。②87 の LC1OX-2：年少者かどうかは描かれる本人の文（外見・設定）だけで決め、世界観の文は見ない。AI が足す句の年少者向けの検査は体の強調だけ（腰までの髪・腰の剣・脚の長い などは通す）。③89-b の LC1OX-3（88-e）：種族・役割の語は「顔の特徴」の枠を埋めない／体格の枠（任意。AI を呼ぶ理由にはしない）／服は重ね着・小物なら 2 句・特徴も 2 句まで／種族・役割らしい見た目の案（説明と食い違う印は足さない。「人間と見分けがつかない」などと書かれた人物には、AI が足す牙・赤い瞳・尖った耳・角・尻尾・獣の耳・翼を落とす）／表に無い種族の見た目を 1 句まで／1 文だけの短い設定（末尾の「。」を除く）は名詞句と同じに残す（性的な語を含むときを除く）／算用数字の「30代」も年代／「大人の女性・大人の男性」を年代の語に／性別と食い違う AI の年代の語は落とす（男装・女装・中性的・ボーイッシュなどの人物は除く）／色の例を指示文から外した（赤い瞳の偏り）。AI が足す誘う響きの語（むっちり・艶めかし・色っぽ・妖艶 など）は年少者のときだけ落とし、成人の普通の色気は残す。ユーザーが自分で書いた言葉と確定した外見は変えない。④90-a（表示だけ）：外見の案が `droppedVisual`（見た目らしいのに下書きに入れなかった句。性的な語で外した句を含む）を返し、空でなければ作業欄に「元の設定の一部を画像用の外見に反映していません。内容を確認してください。」と出す（語は出さない・確認の手順なし）。性格・経歴だけを外したときは今までどおり「性格・経歴などの説明は含めていません。」。同じ句から外した性格の断片も dropped に数える。
- fg3（`i346`）：Asset v2 の物語の画風を 3 択（デフォルト／クール／ダーク）にする。正本は canonical の `body.cfg.artPreset`。
- ICONUX2（`v292DfixICONUX2-twotap.js`・86 の番号で `i350`・sha `673bf47a`・?cb=`20261102-bundle90-a`（90-a で近道の下書きにも `droppedVisual` を渡すだけ。86〜89-b は `58254d0c`・?cb=`20261102-bundle86-lc1ox-d`）。前は 83 の番号で `i349`・sha `984a534d`・?cb=`20261101-bundle82-iconux-b`。版 `ICONUX2-r3d-lc1ox`）：キャラ一覧のカードで、絵を 2 タップで作る（「🎨 絵を作る」→ 下書き →「この外見で作る」／「🎨 絵を変える」→ 候補を選ぶ。confirm なし）。働くのは LC1 が ON のときだけ（毎回 `__v292DfixLC1.on()` を読む）。**LC1 が CANARY（86 から）なので、動くのは Owner のアカウントで `lc1` が ON のときだけ**。外見の案の近道は年代の語だけを足し、LC1 と同じ語の表の検査に当たれば近道を使わず LC1 の案に任せる。結果が分からない失敗の間は主ボタンを止める。kill `v292DfixICONUXOff`。
- SETAV1（`v292DfixSETAV1-settings-avatar.js`・83 の番号で `i350`・sha `d2146d0e`・?cb=`20261101-bundle82-iconux-b`）：⚙ 設定の「キャラ」で、Asset v2（schema2）の物語の主人公・NPC の欄に `<img>` が無いときだけ `<img alt="名前">` を 1 つ入れる。絵を入れるのは従来どおり av2-portrait の applyImg と LD1。表示だけ（通信・保存・localStorage への書き込み 0）。schema2 でない物語では何もしない。kill `v292DfixSETAV1Off`。
- FLW2（`v292DfixFLW2-reload-notice.js`・86 の番号で `i360`・sha `82323dfa`・?cb=`20261102-bundle86-lc1ox-d`。前は 83 の番号で `i359`・sha `0bb9f347`。版 `FLW2-r2-is3`）：外見の欄から確定して読み直す直前に、画面全体へ「外見を保存しました。表示をそろえるため読み直しています」を出す。結果は sessionStorage の 1 key（`v292DfixFLW2`）に状態のコードだけを持ち越し（物語 ID・キャラ ID・結果の種類・理由コード・時刻。本文・外見の文・名前は入れない）、同じ物語・120 秒以内・読み直しのときだけ 1 回読んで消し、カードに結果を出す。読み直しそのものは残す。86 から、理由が `APPEARANCE_UNSAFE_MINOR` のときだけ分類の 2 語（種類のコードだけ。決まった語以外は捨てる）も持ち越し、読み直しのあとの文に「当たった語の種類」を添える。kill `v292DfixFLW2Off`。
- ICF（`v292DfixICF-icon-fail-log.js`・83 の番号で `i357`・sha `e41d22e6`・?cb=`20261103-bundle93-a`（93-a で、MIDICON の `portrait.mx_ensure` の記録を足した：失敗は `p:'mx'`・`o:'mx_ensure'`・`x`=`mxk_<class>`・コードと HTTP と時間だけ／成功は回数だけ／端末だけで決まった見送りは回数 `mxNote`。ハンドル・外見・id は残さない。版は `ICF-a1-mx3c`。83〜92-a は `c393f1a8`・?cb=`20261101-bundle83-flow-c`）：アイコンの失敗の入口・段階・理由コード・HTTP status などを、この端末の localStorage `v292DfixICF_log` にだけ記録する（失敗は最大 100 件・全体 20,000 文字。成功は回数と時間だけ）。文章・名前・物語 ID・画像・URL・鍵は入れない・どこへも送らない。要求・応答・画像・保存は変えない（見るだけ）。読む口 `window.__chrIconFail`。kill `v292DfixICFOff`。
- ※読み込み停止（2026-11-15・CLEANUP3） ICF80（`v292DfixICF80-record.js`・`index.html` の ICF の直後・sha `592a85ca`・?cb=`20261103-bundle92-a`。92-a・既定 OFF。ON は `v292DfixICF80On='1'`、kill `v292DfixICF80Off='1'`）：アイコンを作らなかった理由（通信しないで見送ったものを含む）を、既存の ICF の記録 `v292DfixICF_log` へ 1 行足す口 `window.__icfRecord(category, meta)`。分類は `IMGSAFE_REFUSED`・`CAP_REACHED`・`PROVIDER_FAILED`・`PUBLIC_MODE_OFF`・`NOT_YET_ELIGIBLE`＋`OTHER`（ほかの文字列は理由コードとして `classify()` で分類）。`meta` は決まった形だけ受け取る（理由コード・キャラ id の短いハッシュ・HTTP 番号・上限の名前・requestId・時間・呼んだ部品）。文章・名前・物語 ID・画像・URL・鍵は残さない。通信しない・DOM に触らない・誰も包まない。読む口 `__icfRecord.summary()`（ICF の行も含めて分類ごとに数える）・`.status()`・`.enabled()`。呼ぶ側は MIDICON（93-a から本番。端末だけで決まった見送りを `NOT_YET_ELIGIBLE`／`CAP_REACHED` で記録する。Worker が答えた `mx_ensure` の結果は ICF 自身のラッパが記録する。MIDICON は ICF80 が無くても動く）。本番の Owner の PC で試験の 1 行を書けることを確かめた（`NOT_YET_ELIGIBLE`・台帳 2236。GPT #127-QO の「mx3-c の前に ICF80 の本番の記録を確かめる」）。
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

#### ICONX1 — 汎用の呼び名の自動アイコン（A）と人外モード（B）（GPT #127-RY。GitHub `9e1e17b`・Worker `v46.41-read1iconx1-fc`・管理者画面 `8709e450`）
- A（MIDICON-GA）：汎用の呼び名（女・男・影・鬼・霊など 24 語）の人物の自動アイコン。midicon1 の延長で、名簿に 1 人・重要度 高（怪異なら中も）・見た目の印 2 つ以上（髪以外を含む）・印と一緒に 3 ターン以上・最新ターン、で 1 枚。「もう一人の〜」・髪の色違い・登録キャラと見分けられない → 作らない（Worker も本文で確認）。名簿に同じ語が 2 人なら絵を出さない。部品 `v292DfixMIDICON-auto-icon.js`（+iconx1・本番 sha `4c7927e0`）・Worker（mxEnsure の GA・mx_list の ga）。鍵 `mxgen1`（READY・行なし OFF）／env `CHR_MX_GEN_OFF=1`／端末 `v292DfixMIDICONgenOff=1`。
- B（NH1）：人外モード。外見の下書きを「【人外/混合（種別）】種類：…／顔：…／腕：…」にし（辞書だけ・AI なし）、Worker が nh1 ON のときだけ人外用の注文文（部位を先頭・部位が入る構図・かわいい寄りの語を外す・ホラーの物語だけ冷たい光）。人間の注文文はバイト一致。imgsafe は元の日本語の全文で分類（緩めない）。部品：新 `v292DfixNH1-nonhuman.js`（`1d9523bc`・index.html の LC1 の直前）・`v292DfixLC1-appearance-proposal.js`（nhPropose・`f66ac4fa`）・`v292DfixICONUX2-twotap.js`（近道の前に nhPropose・`cc6313fa`）・MIDICON・Worker（nhPrepare・promptFor・gen_json nh・profile_match null・物語の雰囲気 nhTone）。鍵 `nh1`（READY・行なし OFF）／env `CHR_NH1_OFF=1`／端末 `v292DfixNH1Off=1`。
- B2（NH1b・GitHub `589d720`・NH1 `2ed6cb68`・Worker `v46.41-read1iconx1nh1b-fc`〔Cloudflare の版 `c56410d3`〕）：人外モードの絵の構図を丸アイコン向けにする。全身指定をやめ、部位ごとに構図を変える：下半身（蛇）→とぐろの上に上半身・浮遊→下から見上げて膝から上・全身型（ゾンビ・骸骨・人形）→膝から上の 3/4・腕/触手→腰から上で腕は左右に広げ枠内・顔まわりだけ→胸から上。背景は単純・顔は大きく中央。画風の文・主語・部位の英語・imgsafe は ICONX1-B（NH1）のまま。人間の注文文はバイト一致。保存形式は変えない。鍵は nh1 に相乗り。kill：Worker env `CHR_NH1B_OFF=1`（NH1 の注文文とバイト一致）・端末 `v292DfixNH1bOff='1'`（以後の下書きの末尾に「／構図：従来」＝その 1 人だけ従来の構図）。Worker のルートの JSON に `nh1b:'nh1b'`（CHR_NH1B_OFF / CHR_NH1_OFF 中は 0）・gen_json に `nh_comp`（b / old）。部品は `v292DfixNH1-nonhuman.js` 1 本（kill の運び方だけ）と index.html の NH1 の ?cb 1 か所（`20261111-nh1b-a`）。本番でゾンビと大蛇を生成し、丸アイコンで識別できた。未確認：「女」と従来との同条件の比較。
- ADMF1（`ace83c48`）：KEYS に mxgen1・nh1 を足した（計 16 の鍵）。Worker のルートの JSON に nh1:'nh1'・mxGen:'ga1'（kill 中は 0）。Worker は read1 を含む。
- index.html の最終 sha は `9a8ecde8`（STALE1 と合流）。未確認：本物の画像での確認は未実施。

#### ICONQ1（部品名・kill のキーは「ICONFIX1（11-11）」）— キャラの絵の下書きの 3 つの直し（GitHub `8311948`・Worker `v46.44b-unprot-ifx11-fc`）
- 名前：この資料では ICONQ1。ただし kill のキー名と env 名は ICONFIX1 で始まる（端末 `v292DfixICONFIX1aOff`・`bOff`・`cOff`、Worker env `CHR_ICONFIX1B_OFF`・`CHR_ICONFIX1C_OFF`）。11-01 の Worker の ICONFIX1（`CHR_ICONFIX1_OFF`。Together の 400 の修復）とは別件で、別の文字列。
- a 外見の下書き（`v292DfixLC1-appearance-proposal.js` `05b810a0`・?cb=`20261111-iconfix1`・端末 kill `v292DfixICONFIX1aOff='1'`＝従来と同じ）：文章 AI が足す句は、説明文（と本人の外見）の語で裏づけられるものだけ残す（AI への指示文の規則 10 も「書かれていない見た目を推測で作らない」に差し替え）。役割の語（住職・刑事・消防士…）と目立つ特徴（義手・欠損・日焼け・化粧・白濁…）・大人の年代を下書きに残す。性別は説明文の最初の文の主語と「男」「女」の単独語から読み、続柄の語で打ち消さない（配役の性別があればそれが優先）。
- b 人外の部位の取り方（`v292DfixNH1-nonhuman.js` `96ac383f`・Worker の同じ core・端末 kill `v292DfixICONFIX1bOff='1'`・Worker env `CHR_ICONFIX1B_OFF='1'`）：色を部位につけたまま（黒い翼 など）・「くちばし」・虎の毛皮＝服・蛇以外の尻尾＝体の部位（とぐろの構図にしない）・種類に鬼／狐（妖怪。狐の獣人は今までどおり獣人）／烏天狗・部位にくちばし・甲羅・頭の皿・水かき・一本角・金棒。仕事の鬼・鬼教官・鬼のような・狐の面 などは人外にしない。
- c 構図（Worker だけ・env `CHR_ICONFIX1C_OFF='1'`。端末の `v292DfixICONFIX1cOff` は表示だけ）：骸骨・人形の構図を NH1b の「膝から上」から「腰から上・顔を大きく」の句へ。
- 人間の注文文（Worker の ER1／ER1x の指示文）・imgsafe は変えていない。ルート JSON に `iconfix11`（`b`／`c`／`bc`／0）、gen_json に `nh_fx`。index.html は NH1 と LC1 の外見の案の ?cb を `20261111-iconfix1` にしただけ。
- 実画像（本番・2026-11-12）：画像 10 枚を作り、断られた画像は 0 枚。確認時の本番のルート JSON は workerBuild `v46.44b-unprot-ifx11-fc`・iconfix11 `bc`。AI が足した句を捨てる部分（a の①）は、この確認では試していない（下書きは端末の自動の下書きをそのまま使った）。
- 残り：Worker の ER1x の指示文は職業を捨てるので、下書きに残した役割の語は今の絵の注文には出ない見込み（コードの文面どおり。変更案は承認待ち）。

#### ICONFIX2 / ICONFIX3 — 外見の下書き・案の直し（11-14・GitHub `2317dbe`・`19fe4f4`・LC1 の外見の案・NH1・STARTICON・LC1 作業欄）
- ICONFIX2 a（kill `v292DfixICONFIX2aOff='1'`・NH1 と同じ鍵）：人外・混合の下書きで体の作り・材質・持ち物の句を捨てない・種類の札を付ける。b（kill `v292DfixICONFIX2bOff='1'`）：説明文から変えてはいけない事実（性別・種類・材質・持ち物・役割・体格）を取り出し、AI の案に渡して検査する（性別の無い人物に性別を足さない・落ちた事実を戻す）。c（STARTICON・kill `v292DfixICONFIX2cOff='1'`）：結果不明のときもキャラごとに結果を確かめる（120 秒後に 1 回）。t（kill `v292DfixICONFIX2tOff='1'`）：段ごとの時間を status().timing に出す（数字だけ）。
- ICONFIX3（kill `v292DfixICONFIX3Off='1'`＝今までとバイト一致）：括弧の中の注記を外見に使わない・見た目は人間のアンドロイド等と隠している正体は描かない・材料の足りない人物は髪・服・瞳を足す（足せなければ決まった語）・物や正体の曖昧な存在は人外の札・安全の理由以外で自動の見送りにしない・AI が足したことを正直に知らせる。安全検査（imgsafe 等）は変えない。
- APPX1（11-15・GitHub `fac7b6e`・既定 ON・kill `v292DfixAPPX1Off='1'`＝今までとバイト一致）：外見の下書き（visualPart・AI の案の受け取り）で、口調・呼び方・名前・性格の語（語尾・一人称・口癖・ため口・「と呼ぶ」・名前は・という名・ぶっきらぼう 等）の句を見た目に数えない（「尻尾」「尾」「燕尾服」は残る）。改行を文の区切りにし、「口調：」の行を別の文にする。AI の句に名前・説明文の口調の句にしか無い語が入れば捨てる。ICONUX2 の近道も改行を残したまま渡す。人外の下書き（NH1）は変えていない。

#### MXREGFIX1 — 途中の自動アイコンが登録の性別と本人の外見の語だけを使う（11-14・GitHub `2e37066`・MIDICON）
- 既定 ON・kill `v292DfixMXREGFIX1Off='1'`（今までとバイト一致）。登録の性別があれば本文の語で変えない／見た目の語はその人物の名前に掛かるものだけ拾う／名前に掛かる年配の語があれば「老人」を足す。診断 `dryRunReg`（読むだけ）。

#### ADMALL2・READYALL — 管理者画面の「すべての機能を全員に ON」と、試験中の 3 機能の READY 化（2026-11-11。Worker `v46.42-readyall-fc`・ソース `28a36bf0`・管理者画面 `8101b836`・戻し先 `b6e6d211`）
- ADMALL（管理者画面）：機能スイッチ欄に、範囲が READY で全体が ON でない行（noBulk の試験中の行も含む）を 1 行ずつ全体 ON にする入口を足した（行ごとの全体 ON と同じ `feat-global-set`・今の全体の値を expect に付ける）。範囲が READY でない行は対象外（理由を出す）。確認はページ内（confirm 不使用）。結果は行ごとに 成功／変化なし／失敗で、1 行が失敗しても続ける。
- ADMALL2（管理者画面 `8101b836`）：ページの一番上に「すべての機能を全員に ON」の箱（既存の bulkAllAsk／bulkAllRun を呼ぶ。結果も箱の中）。既存の「試験中の機能も含めて全部 ON（全体）」は残す。READY 以外は対象外。
- READYALL（Worker `v46.42-readyall-fc`）：`npres1`・`lc1`・`kn1` の範囲を CANARY → READY にした（行なし・全体の値なし＝OFF のまま）。他の鍵の範囲と `/auth/me` は変えない。kill：Worker env `CHR_SCOPE_READY_ALL_OFF=1`（3 つとも元の CANARY）。デプロイの順は Worker → 管理者画面（Worker が古いと 3 つは対象外として扱われる）。
- 注意：`lc1`（キャラの絵）は画像の費用が出る（知人は custimg の経路：pro 固定・予算・1 日の上限）。ON にしたあとは各機能の行で全体 OFF で止められる。本番：Owner が 11-11 02:05 に「すべての機能を全員に ON」を実行し、知人アカウントの /auth/me で 16 鍵すべて 1 を確認（台帳 2326）。以後の値は管理者画面で確認する。QA：Worker 26/26・管理者画面 19/19（Local）。

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
- fix873 SEEDNPC1c（`2b7add30`・版 `seednpc1-c-20261110`・GitHub `854cb71`・home `8a0da98a`〔fix873 の ?cb=`20261110-seednpc1c` だけ。version・index は不変〕。2026-11-10 出荷・本番の読み戻し一致）：「の・な」なしで直接つながる複合語（ヤンキー女子高生・不良少年・老漁師・新人刑事・クール系男子）も説明と判定し、name を空・desc に全文 → fix823 が AI で名前を付ける（本番 93-k で Owner が「ヤンキー女子高生」と書くと名前のまま登録された件）。人を表す語の前が全部「修飾語の表」（44 語）か「〜系」のときだけ。長さ・形では判断しない（「ミナ少女」は名前のまま）。1 文字の語（男・女・人・娘・猫）の前は 2 文字以上、先輩・後輩・先生・師匠の前は 2 文字以上の修飾語だけ、姫・王・王子・殿下・兄さん などの前は複合語にしない。93-k の判定が「名前」のときだけ働く。kill `v292DfixSEEDNPC1cOff`（= 93-k）。Local 試験 node 199/0・ブラウザ c1after 12/0・c1kill 9/0（両ブラウザ）・93-k の b1after 44/0・b1kill 9/0。戻し：93-k の 2 本（fix873 `486d4b7c`・home `eb166fb1`）。
- fix873 SEEDWORLD1（`f372bda5`・版 `seedworld1-a-20261110`・GitHub `05e5c04`・home `74b9efb3`〔fix873 の ?cb だけ〕・GPT #127-RQ ③ 段 1）：物語の種の「どんな世界ですか？」を複数行（見本の文つき）にし、「もっと細かく決める（任意）」（最初は閉じている）に 舞台→scene.loc・雰囲気→scene.tone・始まりの場面→startCondition・世界のきまり→startRules（300 code point。超えたら「つづける」の前に止める＝AI 0 回）を足した。書いた欄は fix823 の filled／fix436 の protected_ に乗り AI は上書きしない・空の欄は今までどおり AI が埋める・AI 呼び出しは増えない・保存の形（fix820）は変えない。確認カードに「世界のきまり」の行と、ユーザーが書いた行への「あなたが書いた」の印（表示だけ）。kill `v292DfixSEEDWORLD1Off`（= 93-m と同じ画面・同じ下書き）。
- fix873 SEEDNPC1d（`90e4744b`・?cb=`20261110-seednpc1d`・GitHub `3b4a6fe`・home 最終 `246d1945`）：「いっしょに出る人」で、動詞の連体形で終わる関係節（昔からこの港町に住んでいる女子高生・転校してきたばかりの少年）も「説明」として扱い、名前は AI が付ける。1b/1c が名前と判定したときだけ働く（説明→名前の向きには変えない）。敬称・肩書き・姫王類の前は対象外（未解決：敬称・肩書きの前の関係節）。kill `v292DfixSEEDNPC1dOff`（`cOff`・`bOff`・`SEEDNPC1Off` も 1d を止める）。診断 `__v292DfixSEEDNPC1.status().d`。Local 試験 node 379/0・Chromium d1after 12/0・d1kill 9/0・w1after 20/0。
- fix823・fix873 SEEDWORLD2（fix823 `3ce45b81`・fix873 `01bb05c8`・home `c408bcd6`・?cb=`20261110-seedworld2`・GitHub `cfebd99`）：物語の種 段 2「AI で世界観を広げる」（**チェックは既定 OFF**）。fix823 は呼ぶ側が明示したときだけ loreAppend（1 回限りの armLoreAppend 合図 / opts.loreAppend）、fix873 にチェックと確認カードの編集枠。scene.lore = 原文 + "\n（AI が補った設定）\n" + つづき。AI 呼び出しは増えない・max_tokens 1800・fix825 / fix436 は 0 変更。kill `v292DfixSEEDWORLD2Off`。診断 `__v292DfixSEEDWORLD2`。Local 実測：node 63/0＋45/0、ブラウザ Chromium / WebKit 各 w2 7 セル全 PASS、回帰 PASS。未確認：本物の AI での出力長・BAD_JSON 率・つづきの質、iPhone 実機、GPT レビュー。
- fix823・fix873 SEEDHERO1（fix823 `798eb8bb`・fix873 `16b525f7`・home のうち fix823／fix873 の ?cb=`20261111-seedhero1`・GitHub `0475772`）：種から作るとき、主人公の説明を書いていれば、**既存の 1 回の AI 呼び出し**の JSON に heroAdd（性格・外見・立場）と heroVoice（口調 1 行）を足し、`cast.hero.desc` = 利用者の文＋足した文＋「口調：…」にする（口調の行は、利用者の説明に口調の手がかりが無いときだけ）。決意・目的・これからの行動の文は外す。出力予算に収まる分だけ・収まらなければ足さない。**口調は専用の欄ではなく説明の中の 1 行**（シナリオの保存の形に voice の欄が無く、増やすと保存契約・Worker に触るため）。確認画面に別枠「Chronicle が足した主人公の説明」（編集・「この補足を使わない」）。AI 呼び出しは増えない。既定 ON。kill 端末 `v292DfixSEEDHERO1Off='1'`。診断 `__v292DfixSEEDHERO1`。
- fix873 SEEDNPC1e（同じ `0475772`）：「おてんば女子高生」のように、ひらがなの修飾語＋人を表す語だけの呼び名の NPC に、AI が姓＋名を付け、元の呼び名は説明の末尾へ「（呼び名：…）」で残す。AI の名前が空・呼び名と同じ／含む・役割の語で終わる・記号や数字・2〜12 字の外・他の NPC と重複のときは、今までどおり（名前＝呼び名）。確認画面に枠「名前を付けた人」（名前を直せる・「呼び名のままにする」）。既定 ON。kill 端末 `v292DfixSEEDNPC1eOff='1'`（`v292DfixSEEDNPC1Off`・`1bOff`・`1cOff`・`1dOff` も 1e を止める）。診断 `__v292DfixSEEDNPC1e`。Local：node 155/0、Chromium／WebKit（幅 390）の各ケース PASS。未確認：本物の AI での口調・性格の質・出力長・BAD_JSON 率、iPhone 実機、本番の読み戻し。
- fix820 SCID1（`8e213bcf`・?cb=`20261111-scid1`・home.html・GitHub `5c0ba2c`・版 `scid1-a-20261111`）：シナリオの id を、時刻ベースで 5 回とも取れなかったとき（旧形式の短い Story ID「b」などが端末に残っていると、時刻の文字に「b」が入る約 17 時間のあいだ、毎回 `ID_ALLOCATION_EXHAUSTED` になっていた）だけ、乱数の id（`sc-` ＋英数字 8 ＋ `-` ＋英数字 2）で最大 40 回ためす。使用済み判定・鍵の不変条件・Story ID の部分文字列の判定は 1 つも緩めない。kill 端末 `v292DfixSCID1Off='1'`（従来どおり 5 回で失敗）。診断 `__v292DfixSCID1.status()`。未確認：本番・実機。
- fix820 SCID2（`edc59752`・?cb=`20261111-scid2`・home.html・GitHub `e70f7d2`。fix820 の VERSION 文字列は変えていない。SCID2 の版は `window.__v292DfixSCID2.version`）：旧形式の物語 ID「c」（や「a」）の本体（`chr6_slot_c` など）がある端末で、シナリオの原本の保存が `ID_ALLOCATION_EXHAUSTED` で必ず失敗していた件。原因：シナリオのキーは必ず `chr6_scenario_sc-` で始まり、この定数部に c や a が入っているため、本体のある物語 ID のキー全体への部分一致の関門（`storyIdSubstringHits`・`storyIdGateForKey`）がどの候補にも当たって捨てていた（SCID1 の乱数でも直らなかった）。直し：①部分一致を見る範囲を `chr6_scenario_sc-` より後ろ（キーの可変部）だけにする（定数部だけで当たる ID は既存のシナリオキー全部に既に当たっているので、新しいキーを足しても危険は増えない。可変部の当たりは今までどおり拒否）②SCID1 の乱数 id の文字から、1 文字の本体のある物語 ID の文字（a・b・c など）を外す（残りが 10 文字未満なら外さない）。kill 端末 `v292DfixSCID2Off='1'`（今日と同じ動き）。診断 `__v292DfixSCID2.status()`。端末上（実機）でのシナリオの保存は成功した。 未確認・提案のみ：キーを物語に結びつける他の部品（fix562・fix564・fix579・fix587・E64 など）には裸の部分一致が残っており、旧形式の物語（a／b／c／default）の削除で、シナリオの原本や別の物語の付属データを巻き込む恐れがある（実装していない・実行して確かめていない。境界つき一致〔fix821 の `f821KeyBelongs`〕へ揃える案は保護・削除経路のため裁定が要る）。運用の目安：端末に本体のある旧形式の物語は削除しない。
- index.html NS1/NS2（11-10・index.html の sha `b25a36e5`・GitHub `094a236`）：fix276（タグ 0 のターンの裸の「」の拾い直し）に NS1＝引用の直後が「と〜殴り書きされ／書き殴られ／刻まれ／貼られ／記され…」など書かれた文字の形で、同じ節に発話動詞が無いときだけ台詞にしない（kill `v292DfixNS1Off='1'`）。NS2＝話者推測の 4 点（①後置の「と、Xが…叫んだ」があれば前の文の主語を使わない ②「用務員の男」が「男」1字で捨てられるのを全体で見る ③手がかりは直前の 1 文・発話の形だけ ④人の呼び名でなければ話者にせず保留＝既存の保留〔候補なし→attribQuotes218→無ければカードなし〕）。**NS2 は既定 OFF の opt-in**（kill `v292DfixNS2Off='1'`）。fix276 本体の kill は `v292NoTagJudgeOff` のまま。
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
- fix990（`i10`）：Asset v2 必須のアカウントで旧画像の op が 409 を返し続ける空回りを、10 分止める。11-15 の IMGSTOP1（GPT #127-UF ③）から、4096 字を超える本文（絵を積む putimg）も、先頭の JSON の op の値が旧画像 op と完全に一致するときだけ同じく止める（判定できない本文・ほかの op は従来どおり送る）。r3：iso2 が先頭に足す `chrOwnerAcct` の鍵 1 つの後ろの op も同じく完全一致で見る（本番の口座では putimg がこの形で届き、r2 では素通しだった）。止める：`v292DfixIMGSTOP1Off`（長い本文は従来どおり素通し）。
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
| UI2 | `index.html` と `home.html` の最後（`</body>` の直前）・sha `b6c0953c`・?cb=`20261111-ui2b`・GitHub `2f04062` | 読みやすさの小修正（CSS を 1 枚入れるだけ・ロジックなし・保存／同期／生成には触れない）：入力欄の例文を小さく・2 行を許す（入力文字は 16px のまま）／背の低い画面で「その他」を開いたとき説明文を畳む／✎ 編集ほか小さい文字を少し大きく／削除シートの実行・やめるを下に固定／PC の詳細ボタンの折り返し・シナリオ行のはみ出し。**ホームの主ボタンを 1 つにする規則は Owner 判断で外した**（入っていない） | `v292DfixUI2Off` |
| XSS1 | `index.html`（`UI.esc` ほか）・`features.js`・`home.html` の中。新しいファイルは無い・GitHub `b1e2a5d` | 名前・性格などを画面の HTML に入れる箇所で、" ' < > & を文字のまま表示するよう変換を足した：`UI.esc` が " と ' も変換／主人公・NPC のアイコン欄／入力種別の札／features.js の話者訂正（fix29）とアイコン生成中の表示（fix121f）／home.html のターン数 2 か所。普通の名前の見た目・AI への送信・保存は変わらない。fix310（ギャラリー）のターン数の分は、fix310 の読み込みを止めたので入っていない（§2.12） | なし（表示の変換だけ） |
| UI3 | `v292DfixUI3-polish.js`（index・GitHub `f2b6d56`・?cb=`20261112-ui3a`） | 見た目の小さな手直し：iPhone 幅の小さなボタン・チェック欄を大きく・「物語を紡いでいます…」の重なり・削除の帯の余白。表示だけの言い換え（「続きを自然に進めてください。」→「◈ 続きを書く」・「最終: T6」→「最終: 6ターン目」・「続きから始める」→「続きから遊ぶ」 等。保存・送る文は変えない） | `v292DfixUI3Off` |
| LAT1 | `v292DfixLAT1-press-feedback.js`（index・`f2b6d56`） | 送信・続きを書く・やり直すを押した瞬間に上の一行へ「送信の準備をしています…」。表示中の二度押しは止める。入力なしの案内が出たら「送信できませんでした。もう一度押してください。」。送信・保存・通信は 0 | `v292DfixLAT1Off` |
| UI4 | index.html・home.html・DL2・fix873 ほか（`63bfe48`） | a 設定の決定ボタンを 1 ターン以上では「✔ 保存して物語に戻る」／b 削除のシートの重複した 2 枚目の注意を外す／c シナリオの保存に失敗したとき見出しを「保存できませんでした」にし ▶ を出さない／d HOME のカードは 1 回目のクリックで開く（「ⓘ 詳細」は選ぶだけ） | `v292DfixUI4aOff`・`UI4bOff`・`UI4cOff`・`UI4dOff` |
| ERRNOTE1 | `v292DfixERRNOTE1-send-error-note.js`（index・`4f0f2b1`。RETRY2 で ?cb=`retry2-a`） | 送信がサーバーに断られたとき（HTTP 4xx/5xx）、理由を入力欄のすぐ上に出したままにする（✕ か次の送信まで）。402 は「AI の利用残高が足りない」、503 LEDGER_UNHEALTHY はサーバーの短い日本語の文。60 秒で消える赤い知らせの二重表示は外す。送り直さない・送信の中身に触らない | `v292DfixERRNOTE1Off` |
| HOLDNOTE1 | `v292DfixHOLDNOTE1-hold-note.js`（index・ERRNOTE1 の直前。fix697・av2-data から呼ぶ） | クラウドへの保存が画面に何も出ないまま止まったとき（fix697 の canonHold のうち fix924 の差分バナーが出ないもの＝CAS 以外の 409 など／av2 の登録の衝突 HOLD）、入力欄の上に「クラウドへの保存が停止しています。現在の画面では自動で再開できません。端末への保存を確認したうえで、ページを開き直してください。」を 1 ページ 1 回（✕ まで）。表示だけ（送り直し・再読込・保存・通信なし）。GPT #127-UF ②。av2 BLOCKED・404・drift・deleted は対象外 | `v292DfixHOLDNOTE1Off` |
| HOLDNOTE2 | `v292DfixHOLDNOTE2-hold-kinds.js`（index・HOLDNOTE1 の直前。fix697・av2-data から呼ぶ） | HOLDNOTE1 の対象外で、そのページの保存がその後止まる 4 つの状態に、状態ごとの知らせを 1 回ずつ（✕ まで）：getstory 404（見つからない・今は開けない）／サーバーの行が shadow のまま（状態の食い違い）／削除済み／av2 BLOCKED と同じ入力のあいだ。文面は断定を避ける。表示だけ（送り直し・再読込・保存・通信なし）。GPT #127-UF | `v292DfixHOLDNOTE2Off` |
| STORYSIZE1 | `v292DfixSTORYSIZE1-story-size.js`（index・HOLDNOTE1 の直前。fix697 の putstory／putcanonical の送信の口から呼ぶ） | 1 物語の保存の大きさを送信の直前に測る（文字数と UTF-8 バイト数。小さい物語はバイト数を数えない）。割合＝max(バイト/1,990,000, 文字/1,000,000)（Worker の 100 万字の上限と D1 の 200 万バイトの上限）。70% で入力欄の上に知らせ 1 回、90% で「送信」「続きを書く」を生成の前に止めて知らせる（入力欄の文は消さない・「やり直す」は止めない）。上限を確実に超える本文と、Worker が大きさで断った（413 STORY_TOO_LARGE／500 SQLITE_TOOBIG）物語は送らず、Worker の 413 と同じ形の応答をその場で返す（再送しない）。本文を削らない・何も消さない。GPT #127-UN | `v292DfixSTORYSIZE1Off` |

### 2.11 シナリオ・ホーム

- fix819（`h38`）：原本（シナリオ）から独立した物語を作る。fix820（原本の保存）・fix872（原本のクラウド同期）・fix823（種の変換）・fix829（種の文の補強）。
- fix825（`h45`）：ホームの原本 UI と「この物語を始める」。fix873（`h47`）：シナリオ作成。fix870（`h46`。93-e の OPEN1 で sha `f4381e0a`・?cb=`20261107-open1`：「▶ 続きから遊ぶ」`#contBtn` と `latestStory`・`storyCount` は fix889 の `mayShowRow` が許す行だけで数える。1 件も無ければ隠す。`onChange` と `chr:account-me` で再適用）：ホームの入口。fix885（`h48`）：ホームのデータ欄の折りたたみ。B37-home-menu（`h33`）。
- NEWACCT1（93-g・`home.html` の inline の中。ファイルは無い）：新しいアカウントの「空っぽ」の状態のホームの表示を直す。①Pages 版（fix893 の cookie）では端末にログインの情報が無いのが正常なので、「ログインしていないため同期できません」を出さず中立の文（確認しています／まだ招待されていません）にする。`/auth/me` が答えてログインの状態になったら同期を 1 回だけやり直して古い表示を消す。②クラウドに保存が 1 件も無いアカウントは `op:'get'` が 200 `{ok:true, data:null, rev:0}` を返すので、空のときだけ「☁ 最新です」で終える（何も書かない。500・通信断・時間切れは従来どおり「同期できませんでした」）。③起動直後の物語の一覧の問い合わせが 1 回届かないと、聞き直さずにオフラインの扱いのままだったのを、ログイン中なら 5 秒後・15 秒後と、ログインの状態が確定したときに読み取りだけ聞き直す（fix889 が `cache`／`blind` のとき listshadow を聞き直す。最大 4 回）。④空の一覧の案内を実際のボタンの名前（「✎ シナリオを作る」。`#scBtn` の表示名を読む）にする。kill `v292DfixNEWACCT1Off='1'`（従来どおり）。試験（Local・両ブラウザ）：fresh 13/13・early 5/5（リグの印を消すコピーで。元のリグでは 4/1）・noinvite 4/4・fail 11/11、offline は Chromium 3/2・WebKit 4/1。**③の「5・15 秒の聞き直し」が効くことはリグで未検証**（このリグでは 93-f のままでも最初の失敗を再現できない。本番で何が 1 回目を失敗させたかも未再現）。
- GENDER1（93-h・新ファイル `v292DfixGENDER1-autogender.js`・sha `3291ae11`・?cb=`20261108-bundle93-h`。`index.html` は fix335 の直前、`home.html` は fix436 の直前に読む）：おまかせ・AI でキャラを作るとき、性別を自動で決める（Owner「性別が未設定になるのは良くない」）。全員に効く。利用者に操作は増えない（ダイアログ・ボタン 0）。決め方の順：①利用者が選んだ性別（ラジオ・シナリオの gender）は触らない ②説明の文にはっきりした語（少女・女性・少年・男性・「性別: 女」など。「母」「娘」など他人の性別を指しうる語は使わない。男女の語が混ざれば決めない）③AI が返した性別の欄（fix436・fix823 のプロンプトに 1 項目足しただけ・追加の通信 0。性別だけが空欄のときは AI を呼ばない）④種バンクのおまかせ（AI なし）では fix335 が自分で選んだ名前の性別 ⑤どれでも決められない（人外・曖昧）→ 未設定のまま。変えたファイル：fix335 `fc96f630`・fix436 `3a5d6160`・fix823 `d1837ab4`（どれも ?cb=`20261108-bundle93-h`。前は `d70eb54d`・`ff50b6f7`・`e86d3a62`）。kill `v292DfixGENDER1Off='1'`（呼び出し側は従来どおり）。観測口 `window.__v292DfixGENDER1`。試験（Local・nonet2・偽 AI）：node 単体 66/0、ブラウザ home・modal・kill × 2 ブラウザ＝82/0。GENDER1 で性別が入ったキャラに対する IDSPLIT2 の動きは専用には試していない（未確認）。本物の AI での確認は未実施。
- HOMERETRY1（93-h・`home.html` の inline の中。ファイルは無い）：93-g の出荷直後、Worker の冷えた起動で `/save` が 503 `D1_INIT_TIMEOUT` を返したあと、ホームの「☁ 同期できませんでした」が Worker が直っても戻らなかった件の対策。一時的と分かる失敗（HTTP 503 で `retryable:true`、または `D1_INIT_TIMEOUT`／`ACCOUNT_STORE_TIMEOUT`、または通信そのものの失敗）のときだけ、`pull()` とクラウドの物語の行（f757）を、1 ページで最大 3 回（2・6・15 秒後）聞き直す。online になったら待たずに聞き直す（回数に数える）。500・403・401・409・`ok:false` の 200 は従来どおり聞き直さない。関門（判定・墓標・fix826 など）は通常どおり通す。聞き直す予定がある間だけ「☁ 同期できませんでした（少し待って自動でもう一度試します）」と出し、表示をほかの処理が書き換えていたら何もしない。kill `v292DfixHOMERETRY1Off='1'`（93-g と同じ）。試験（Local・nonet2）：7 場面 ×（after・kill）× Chromium・WebKit＝28 回で 152/0。online のときの即時の聞き直しは未確認。全部失敗すると最大約 1 分「…自動でもう一度試します」が出る。本番の確認：出荷後の Owner のホームの読み直しで Worker への要求 13 本がすべて 200・「同期できませんでした」なし（聞き直しが実際に走った場面は未観測）。
- GHOST1（`v292DfixGHOST1-legacy-slot-ghost.js`・sha `cf49f461`・?cb=`20261111-ghost1`・GitHub `98cf4bc`・`home.html` だけ〔fix889 の直後〕・既定 ON・kill `v292DfixGHOST1Off='1'`）：ホームに残っていた「スロット A／B／C」（features.js の旧 fix30 が `chr6_slots_meta` が空のときに自動で作った行）の空の行が、削除シートで「クラウドでこの物語を確認できないため、ここでは削除できません」と断られていた件。次の条件を**すべて**満たす行だけを `chr6_slots_meta` から外す（読み込み時 1 回・冪等）：id が `a`／`b`／`c`・行の形が自動作成のまま・墓標でない・この端末に本文が無い・クラウドの痕跡が無い・Vault に関わらない・スナップショットや控えや削除の計画が無い・どのタブでも開かれていない・サーバーの一覧（読むだけ）を 1 回読めてその id が無い。`default` と新しい形式の id には触れない。外したら `v292DfixGHOST1Log` に id だけを残し、一覧を描き直す。DL2 の「サーバーの一覧に無い物語は削除できない」断りは変えていない。診断 `window.__v292DfixGHOST1.status()`。
- GUIDE1（11-14・GitHub `6b22963`・fix873 の中。新しいファイルなし・既定 ON・kill `v292DfixGUIDE1Off='1'`）：物語の種の世界観の欄の下に、常に見える書き方の案内（「思いついたことを自由に書いて大丈夫です。…」）を出す。表示だけ。

### 2.12 読み込みを止めた部品（CLEANUP1・CLEANUP2・CLEANUP3）と削除したファイル（DELETE141）

- 2026-11-11 に、`index.html` から `<script>` の行を外して読み込みを止めた部品が 32 本ある（CLEANUP1 が 9 本・CLEANUP2 が 23 本）。**ファイルは GitHub にそのまま残っている**（削除していない）。いずれも、既定 OFF・計測だけ・影だけ・Asset v2 の物語では自分で止まる・届かない・他の部品が名前を読まない、のどれかに当たる部品で、ログイン済みの Asset v2 の遊びの挙動は変わらない（コミットの記載）。付録 A では該当の行を「読み込み停止」と書いて残し、付録 C の「読む部品」からは外した。
- CLEANUP2 の C2a では、同時に index.html の inline `id=v292Dfix890-early` と、入口の案内文の「無料お試しには 1 日の利用上限があります。」の 1 文も外した。
- 戻し方：index.html に同じ `<script>` の行を戻す。

| ファイル | 最後の sha | 束 | 停止の理由（要約） |
|---|---|---|---|
| `v292Dfix420-stylelora.js` | `510ea41b` | CLEANUP1 C1（`4dcd38c`） | 既定 OFF（`v292Dfix420OnV2='1'` の時だけ）。Together の serverless では LoRA が使えない（400）と実測済み |
| `v292Dfix470-style-tail.js` | `87bb7a62` | CLEANUP1 C1（`4dcd38c`） | 既定 OFF。画風は fix475・fix484 に置き換わった |
| `v292Dfix471-style-c.js` | `b0b1bd27` | CLEANUP1 C1（`4dcd38c`） | 既定 OFF。画風の最終決定は fix484。fix475 は「fix471 が ON なら止める」を読むだけ |
| `v292Dfix474-candidate.js` | `d68cac44` | CLEANUP1 C1（`4dcd38c`） | 既定 OFF（`v292Dfix474OnV1='1'` の時だけ）。他の部品は名前を読まない |
| `v292Dfix481-provider-switch.js` | `f9ed6537` | CLEANUP1 C1（`4dcd38c`） | 既定 OFF（`v292Dfix481OnV1='1'` の時だけ） |
| `v292Dfix499-freeget-style-canon.js` | `d63bcfc4` | CLEANUP1 C1（`4dcd38c`） | 届かない：対象の無料 GET は NDI1 が必ず止める（422 DIRECT_IMAGE_BLOCKED） |
| `v292Dfix501-legacy-appearance-probe.js` | `bd3bb1ca` | CLEANUP1 C1（`4dcd38c`） | 計測だけ・既定 OFF。調査は fix497 で終わった |
| `v292Dfix515-icon-persist-probe.js` | `dd96cd56` | CLEANUP1 C1（`4dcd38c`） | 計測だけ・既定 OFF。調査は fix516b／517 で完了 |
| `v292Dfix845-selfnaming-shadow-observer.js` | `a6298d05` | CLEANUP1 C1（`4dcd38c`） | 観測だけ・既定 OFF（QA の slot ごとのキーだけ） |
| `v292Dfix310-gallery.js` | `85178fee` | CLEANUP2 C2a（`05da4aa`） | ギャラリー（隠れたセーブ管理の見た目替え）。入口のボタンは fix527 が非表示。名前を読む部品なし |
| `v292Dfix315-see.js` | `4864a7ee` | CLEANUP2 C2a（`05da4aa`） | 「👁 見る」。既定 OFF（91-b から許可しても絵を作らない） |
| `v292Dfix316-gallery-search.js` | `8010df68` | CLEANUP2 C2a（`05da4aa`） | ギャラリーの検索・並べ替え。fix310 にだけ付く |
| `v292Dfix460-slotgrid.js` | `7b19dfd7` | CLEANUP2 C2a（`05da4aa`） | ギャラリーのカードの高さの CSS だけ。fix310 が無いと対象が無い |
| `v292Dfix886-public-anon-client.js` | `0d4b103e` | CLEANUP2 C2a（`05da4aa`） | 匿名のお試しの通信側。ログイン済み・合言葉ありでは動かない |
| `v292Dfix890-anon-gate-yield.js` | `f832fbfc` | CLEANUP2 C2a（`05da4aa`） | 匿名のお試しのとき、ログインの板を隠す。読むのは index.html の早出し inline だけ（同時に外した） |
| `v292Dfix950-card-delivery-probe.js` | `7a74b853` | CLEANUP2 C2b（`05da4aa`） | 影：設定カード／記憶が送信に残ったかを数えるだけ |
| `v292DfixGQ4-summary-request.js` | `d98338e2` | CLEANUP2 C2b（`05da4aa`） | 指示文の実験・既定 OFF（`v292DfixGQ4On='1'` かつ GQStories） |
| `v292DfixCTX-context-restore.js` | `80e1aec4` | CLEANUP2 C2b（`05da4aa`） | 指示文の実験・既定 OFF（`v292DfixCTXOn='1'` かつ GQStories） |
| `v292Dfix361-phaseb-preview.js` | `0ad7e105` | CLEANUP2 C2b（`05da4aa`） | 指示文の実験・既定 OFF |
| `v292Dfix500-sys-dedup.js` | `3d792742` | CLEANUP2 C2b（`05da4aa`） | 指示文の実験・既定 OFF。PRUNE1 が同じ整理を出荷済み |
| `v292Dfix483-beat-director.js` | `2be886d6` | CLEANUP2 C2b（`05da4aa`） | 指示文の実験・既定 OFF。同名の fix483-genbudget-sync は残している（付録 A の #235） |
| `v292Dfix468-gen-timing.js` | `37f638a7` | CLEANUP2 C2b（`05da4aa`） | 計測：生成の所要時間を端末のログに残すだけ |
| `v292Dfix637-cast-bootstrap-probe.js` | `4094ba14` | CLEANUP2 C2b（`05da4aa`） | 影：主人公／NPC の未登録を知らせる記録だけ |
| `v292Dfix740-cap-telemetry.js` | `a328e139` | CLEANUP2 C2b（`05da4aa`） | 計測：Planner.build の sys を読むだけ |
| `v292Dfix237-avatar-carrier-guard.js` | `94dbe30c` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：運搬 URL の整合。Asset v2 の物語では自分で止まる |
| `v292Dfix359-gender-avatar.js` | `64ef641c` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：旧 pollinations の依頼の書き換え。Asset v2 は対象外 |
| `v292Dfix478-imggen-retry.js` | `a51c89af` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：旧 /image の POST の再試行だけ |
| `v292Dfix491-imggen-freefallback.js` | `b0cf90ad` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：旧 /image の時間切れ→無料 GET（NDI1 が必ず止める） |
| `v292Dfix476-pipeline.js` | `05f41bdf` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：/image の 3 候補→検品。fix475（既定 OFF）が arm した時だけ |
| `v292Dfix437-regen-instant.js` | `cadb419f` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：旧 ↻ の押した瞬間の表示。Asset v2 では自分で止まる |
| `v292Dfix461-appearance-en.js` | `775fcc85` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：外見の英訳。Asset v2 の物語では自分で止まる |
| `v292Dfix517-local-authoritative-avatar.js` | `85ef4054` | CLEANUP2 C2c（`05da4aa`） | 旧アイコン：旧ローカル画像の表示優先。Asset v2 では自分で止まる |

- **CLEANUP3（2026-11-15・GitHub `7d927e5`）**：`index.html` から次の 12 本の `<script>` の行を外して読み込みを止めた（home.html はもともと読まない）。**ファイルは GitHub に残っている**。同時に、コメントアウトされていた 6 本の行（fix52・fix64・fix70b・fix73・fix86・fix89。付録 B）も外した。戻し方は CLEANUP1・CLEANUP2 と同じ（同じ `<script>` の行を戻す）。
  - `v292Dfix69-literary-prose.js`・`v292Dfix76-human-foundation.js`・`v292Dfix79-momentum-anchor.js`・`v292Dfix82-injury-reaction-root.js`・`v292Dfix85-reaction-spectrum.js`・`v292Dfix305-trigger-states.js`・`v292Dfix805-speaker-abstain.js`・`v292Dfix806-npc-consistency-observer.js`・`v292Dfix816-posture-transition-observer.js`・`v292Dfix970-state-intake-shadow.js`・`v292DfixEDLOG-narr-edit-log.js`・`v292DfixICF80-record.js`（付録 A の各行に「読み込み停止（2026-11-15・CLEANUP3）」と書いた）。
- **DELETE141（2026-11-15・GitHub `7d927e5`）**：どこからも参照されていないファイル 141 個（約 6.79 MB）を GitHub から削除した。内訳はファイル名から数えて、試験用のスクリプト・HTML（`test_*`・`test.html` など）が 90 個ほど・`worker/` の旧 Worker のソースと試験が 27 個・旧 Worker の写し（`chronicle-proxy-v24`〜`v38`・`worker_v40_candidate.js`）・書き出しの道具（`gold_export_*`・`dev156_*`）など。この資料の手書き項目・付録 A に行のあるファイルは含まれていない（名前で照合した）。戻し方は `7d927e5` の 1 つ前から取り出す。

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
| EDLOG | 本文の手動編集の記録（`_narrEdits`） | — | **92-a で本番**（※読み込み停止（2026-11-15・CLEANUP3））（既定 OFF・Owner の QA 物語 1 本だけ・Owner の PC だけ ON。§2.3 EDLOG） | 本番 |
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
- **読み込み停止の行**（2026-11-11 の CLEANUP1・CLEANUP2）：「読込」の欄が「読み込み停止」の 32 本は、`index.html` からの `<script>` の行を外した部品です（ファイルは GitHub に残っている。番号と §2 の参照を動かさないため、この表に行を残した。一覧は §2.12）。sha・?cb=・スイッチの欄は停止前の値のままです。同じ出荷で PRUNE1・PRUNE2 が index.html の 5・6 番目に入り（下の #391・#392）、停止した部品の分も合わせて、今の `index.html` の読込順は表の `i` 番号から動いています（振り直していない）。

| # | 番号 | ファイル | 読込（index順/home順） | sha256先頭 | ?cb= | 分野（推定） | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 1 | vault2-sendgate | `v292Dvault2-sendgate.js` | i1 h1 | `d430be8b` | 20261021-laneE-a | Vault・非表示 | `v292Dvault2GateOff` |
| 2 | vault2-copygate | `v292Dvault2-copygate.js` | i2 h2 | `2ac107be` | 20261011-ab8 | Vault・非表示 | `v292Dfix893Off` `v292Dvault2AB8Off` `v292Dvault2ABOff` `v292Dvault2CopyGateOff` |
| 3 | fix950 | `v292Dfix950-card-delivery-probe.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i3。ファイルは残る） | `7a74b853` | 20261014-f950r2 | 記憶 | `v292Dfix950Off` |
| 4 | fixCP1 | `v292DfixCP1-final-tap.js` | i4 | `22ac1bca` | 20261023-bundle43a-r5 | NPC・キャラ状態 | `v292DfixCP1Off` `v292DfixCP1On` |
| 5 | fixE64 | `v292DfixE64-save-tap.js` | i5 h3 | `104547ff` | 20261024-bundle45-e64-d | NPC・キャラ状態 | `v292DfixE64Off` `v292DfixE64On` |
| 6 | fix953 | `v292Dfix953-card-canary-gate.js` | i6 | `99598aed` | 20261015-bundle1-cardA-f957on | 記憶 | `v292Dfix953Off` `v292Dfix953On` |
| 7 | fix654 | `v292Dfix654-storage-trap.js` | i7 h4 | `9ee9821a` | v292Dfix731 | 保存・同期 | `v292Dfix654Off` |
| 8 | fix893 | `v292Dfix893-account-cookie-shim.js` | i8 h5 | `c6440593` | 20261111-delall | 認証・アカウント | `v292Dfix893Off` `v292Dfix897Off` |
| 9 | bav2-beta | `v292Dbav2-beta.js` | i9 h6 | `de95b737` | 20261019-bundle33-b | 認証・アカウント | `v292Dav2On` `v292Dbav2Off` |
| 10 | fix990 | `v292Dfix990-legacy-img-breaker.js` | i10 | `b7485bd9` | 20261115-imgstop1r3 | アイコン・画像 | `v292Dfix990Off` `v292DfixIMGSTOP1Off` |
| 11 | fixS1 | `v292DfixS1-entry-notice.js` | i11 h7 | `980196d5` | 20261019-bundle31-a | 認証・アカウント | `v292DfixS1Off` |
| 12 | fix946 | `v292Dfix946-img-isolation.js` | i12 | `54d22bd5` | 20261014-iso1c | アイコン・画像 | `v292Dfix946M3Off` `v292Dfix946Off` |
| 13 | iso2-owner-send-guard | `v292Diso2-owner-send-guard.js` | i13 h8 | `621fc588` | 20261014-iso2b | Vault・非表示 | `v292Dfix946M3Off` `v292Dfix946Off` `v292Diso2Off` |
| 14 | p8d-image-egress-guard | `v292Dp8d-image-egress-guard.js` | i14 | `15e91a71` | 20261009-p8d2 | アイコン・画像 | `v292Dp8dOff` |
| 15 | fix905 | `v292Dfix905-me-owner-gate.js` | i15 | `701becfa` | 20260929-ac17 | 認証・アカウント | `v292Dfix905Off` `v292Dfix905cOff` `v292Dfix917Off` `v292DmeOff` |
| 16 | smrc1-model-registry | `v292Dsmrc1-model-registry.js` | i16 h9 | `01132fae` | 20261122-allonb | モデル・API | `v292DfixBF1Off` `v292DfixBF1On` `v292DfixCmfOff` |
| 17 | fix781 | `v292Dfix781-unsynced-guard.js` | i17 | `8c861398` | 20261019-bundle31-a | 保存・同期 | `v292Dfix729tOff` `v292Dfix781Off` `v292Dfix781bOff` `v292Dfix781cOff` |
| 18 | fix745 | `v292Dfix745-gws-lock.js` | i18 | `4e422c58` | 20260830-fix756 | 保存・同期 | `v292Dfix743Off` `v292Dfix745Off` `v292Dfix750Off` `v292Dfix750On` |
| 19 | fix746 | `v292Dfix746-slot-isolation-authority.js` | i19 | `2cbe79e5` | 20260829-fix748 | 保存・同期 | `v292Dfix746Off` |
| 20 | fix748 | `v292Dfix748-class-d-admission.js` | i20 | `c9ba87aa` | 20260829-fix748 | 保存・同期 |  |
| 21 | fix698 | `v292Dfix698-mutation-bus.js` | i21 h10 | `406075da` | 20260908-fix837 | 保存・同期 | `v292Dfix698Off` `v292Dfix698On` `v292Dfix837Off` |
| 22 | fix889 | `v292Dfix889-secret-vault.js` | i22 h42 | `4221f41d` | 20261108-bundle93-g | Vault・非表示 | `v292Dfix889Off` `v292Dfix902Off` `v292DfixBOOTOFF1Off` |
| 23 | av2-data | `v292Dav2-data.js` | i23 h20（86 では i25 h20） | `8273f501` | 20261115-holdnote1 | アイコン・画像 | `v292Dav2Off` `v292Dav2On` `v292DbndOff` `v292DknwOff` `v292DfixSPBASE1Off` `v292DfixSPBASE2Off` |
| 24 | fix859 | `v292Dfix859-story-session.js` | i24 h21 | `5bb41ddd` | 20260916-sp2 | Vault・非表示 | `v292Dfix859Off` |
| 25 | fix705 | `v292Dfix705-canonical-read-gate.js` | i25 | `337ec0b1` | 20261019-bundle33-b | 認証・アカウント | `v292Dfix705Off` `v292Dfix705bdOff` `v292Dfix781Off` `v292Dfix837Off` |
| 26 | fix900 | `v292Dfix900-hydrate-ui-gate.js` | i26 | `48c9765f` | 20260928-ac8 | 保存・同期 | `v292Dfix900Off` |
| 27 | fix892 | `v292Dfix892-held-input-guard.js` | i27 | `95996398` | 20261011-s1b | 保存・同期 | `v292Dfix892Off` `v292DfixS1BOff` |
| 28 | fix569 | `v292Dfix569-gc-shadow.js` | i28 h11 | `7d55ffd2` | 20261116-discard1 | 削除・墓標 | `v292Dfix569Off` `v292Dfix574DenyOff` |
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
| 39 | fix697 | `v292Dfix697-shadow-story-commit.js` | i39 h22 | `0779d8c2` | 20261115-storysize1（home は 20261115-holdnote1 のまま） | 保存・同期 | `v292Dfix697Off` `v292Dfix697pOff` `v292Dfix697q2Off` `v292Dfix697qOff` |
| 40 | fix912 | `v292Dfix912-s2-insession.js` | i40 | `fa9862e1` | 20261022-bundle41-a | 保存・同期 | `v292Dfix911Off` `v292Dfix912Off` `v292Dfix913Off` `v292DfixGC1Off` |
| 41 | fix729 | `v292Dfix729-title-sync.js` | i41 h24 | `95ce2b1d` | 20261010-rs1 | 保存・同期 | `v292Dfix729Off` `v292Dfix729tOff` `v292Dfix842Off` |
| 42 | fix843 | `v292Dfix843-capability-notice.js` | i42 h25 | `d9c8ef62` | 20260909-fix843 | 認証・アカウント | `v292Dfix843Off` |
| 43 | fix846 | `v292Dfix846-access-gate-notice.js` | i43 | `6c2d01ae` | 20260926-sp24 | 認証・アカウント | `v292Dfix846Off` |
| 44 | fix700 | `v292Dfix700-nonauthoritative-mirror.js` | i44 | `cef9e3ac` | 20260916-sp2 | 保存・同期 | `v292Dfix700Off` `v292Dfix700On` `v292Dfix837Off` |
| 45 | fix702 | `v292Dfix702-authority-cutover.js` | i45 | `44e19d8c` | 20261019-bundle31-a | 保存・同期 | `v292Dfix702MaskOff` `v292Dfix702Off` `v292Dfix702On` `v292Dfix837Off` |
| 46 | fix860 | `v292Dfix860-story-unlock-ui.js` | i46 h23 | `6de33b75` | 20260916-sp2 | Vault・非表示 | `v292Dfix860Off` |
| 47 | fix573 | `v292Dfix573-hero-guard.js` | i47 | `c90d8be8` | 20261009-f573b | NPC・キャラ状態 | `v292Dfix573Off` `v292Dfix573bOff` |
| 48 | fix553 | `v292Dfix553-punct-probe.js` | i48 | `1d54eb16` | 20260913-q119b5 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292DQ119PhaseBOn` `v292Dfix553Off` |
| 49 | fix562 | `v292Dfix562-backup-inventory.js` | i49 h13 | `4bc77edc` | 20261122-allonb | 保存・同期 | `v292Dfix562Off` |
| 50 | fix564 | `v292Dfix564-snapshot.js` | i50 h14 | `134543bc` | v292Dfix567 | 保存・同期 | `v292Dfix564Off` |
| 51 | fix726 | `v292Dfix726-export-secret-guard.js` | i51 h15 backup | `fecc81d7` | 20261019-bundle31-a | 保存・同期 | `v292Dfix726Off` |
| 52 | fix721 | `v292Dfix721-safe-restore.js` | i52 h16 | `62e39f67` | 20260829-fix748 | 保存・同期 | `v292Dfix721Off` |
| 53 | fix660 | `v292Dfix660-backup-gc.js` | i53 h17 | `ea2ac157` | v292Dfix680 | 削除・墓標 | `v292Dfix660Off` |
| 54 | fix555 | `v292Dfix555-punct-repair.js` | i54 | `b3aa85c8` | v292Dfix560 | 文章品質・プロンプト | `v292Dfix555Off` |
| 55 | fix499 | `v292Dfix499-freeget-style-canon.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i55。ファイルは残る） | `d63bcfc4` | v292Dfix499 | 認証・アカウント | `v292Dfix499Off` |
| 56 | fix484 | `v292Dfix484-style-canon.js` | i56 | `726c2038` | 20261019-bundle31-a | 認証・アカウント | `v292Dfix484Off` `v292Dfix980Off` |
| 57 | fix247 | `v292Dfix247-proxy.js` | i57 h43 | `06dd6d0f` | 20260909-fix841 | 認証・アカウント | `v292Dfix837Off` `v292Dfix841Off` |
| 58 | fix247b | `v292Dfix247b-proxy-admin.js` | i58 | `3bdbfbac` | v292Dfix247b | 認証・アカウント | `v292Dfix247bOff` |
| 59 | fix600 | `v292Dfix600-new-story-guard.js` | i59 | `cfdc3593` | 20261110-sg1 | 保存・同期 | `v292Dfix600Off` |
| 60 | fix527 | `v292Dfix527-story-url.js` | i60 | `8c62d316` | 20261107-open1 | 保存・同期 | `v292Dfix527NoopHomeSaveOff` `v292Dfix527Off` `v292Dfix588Off` `v292DfixSN1aOff` |
| 61 | fix659 | `v292Dfix659-fork-choice.js` | i61 | `d6e39622` | v292Dfix680 | 保存・同期 | `v292Dfix659Off` |
| 62 | features | `features.js` | i62 | `6d812ce8` | 20261111-xss1 | 本体（ゲーム中核） | `v292Dfix190Off` `v292Dfix205gOff` `v292Dfix748SaveRefuseOff` `v292Dfix834Off` `v292DfixSAVEUIOff` `v292DfixCLICHE2Off` `v292DfixDEDUPQ1Off` `v292DfixSTATE2Off` |
| 63 | fixP0 | `v292DfixP0-scenario-blocker.js` | i63 | `7c6d79f0` | v292Dfix680 | シナリオ・ホーム |  |
| 64 | fix135 | `v292Dfix135-longmem.js` | i64 | `7f77b62e` | 20261122-acct1r2 | 記憶 | `v292Dfix894Off` `v292DfixMEM3On` `v292DfixMEM3Off` |
| 64a | MEM2 | `v292DfixMEM2-longmem-wire.js` | fix135 の直後 | `d19f9cd0` | 20261122-allonmem | 記憶 | `v292DfixMEM2aOn` `v292DfixMEM2aOff` `v292DfixMEM2cOn` `v292DfixMEM2cOff` `v292DfixMEM3bOn` `v292DfixMEM3bOff` `v292DfixMEM4On` `v292DfixMEM4Off` `v292DfixMEMTallyOff` |
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
| 76 | fix58 | `v292Dfix58-prompt-rebuild.js` | i76 | `8febd4cb` | 20261117-mem2r3 | 文章品質・プロンプト | `v292DfixFACTS1Off` `v292DfixFACTS2Off` `v292DfixNOW1Off` `v292DfixMEM2aOn` `v292DfixMEM2cOn` |
| 77 | fix60 | `v292Dfix60-display-pipeline.js` | i77 | `fc5144f4` | v292Dfix60 | アイコン・画像 |  |
| 78 | fix59 | `v292Dfix59-hybrid-extractor.js` | i78 | `12c56db5` | v292Dfix59 | NPC・キャラ状態 |  |
| 79 | fix61 | `v292Dfix61-alpha-strip-protect.js` | i79 | `7cbb4781` | 20260829-fix748 | 文章品質・プロンプト |  |
| 80 | fix63 | `v292Dfix63-avatar-style.js` | i80 | `5c769ad7` | 20261122-flick1 | アイコン・画像 | `v292Dfix979Off` |
| 81 | fix65 | `v292Dfix65-dialogue-rescue.js` | i81 | `a616558a` | v292Dfix65b | 話者・会話ログ |  |
| 82 | fix74 | `v292Dfix74-ext-dedup-and-say.js` | i82 | `a7131790` | 20260912-q119s4 | 話者・会話ログ | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` |
| 83 | fixSFL1 | `v292DfixSFL1-speaker-correct.js` | i83 | `3d1b805d` | 20261122-acct1r3 | 話者・会話ログ | `v292Dfix781Off` `v292DfixCP1Off` `v292DfixSFL1Off` `v292DfixSFL1On` `v292DfixSAVEUIOff` |
| 84 | fix66 | `v292Dfix66-renderhook-repair.js` | i84 | `48d98f7f` | 20261110-beat1 | 話者・会話ログ | `v292Dfix455Off` `v292Dfix457Off` `v292Dfix783Off` `v292Dfix808Off` `v292DfixBEAT1Off` |
| 85 | fixEDIT01 | `v292DfixEDIT01-edit-reconcile.js` | i85 | `d3b19793` | 20261111-saveui | 話者・会話ログ | `v292DfixEDGOff` `v292DfixEdit01Off` `v292DfixEDIT01CarryOff` `v292DfixSAVEUIOff` |
| 86 | fixSFLTap | `v292DfixSFLTap-card-correct.js` | i86 | `197a15c6` | 20261031-bundle65-sfltap-b | 話者・会話ログ | `v292Dfix457Off` `v292DfixSFLTapOff` |
| 87 | fix68 | `v292Dfix68-cliche-sentence-aware.js` | i87 | `1ed2f6d0` | 20261111-flow3 | 文章品質・プロンプト | `v292DfixCLICHE2Off` `v292DfixDEDUPQ1Off` |
| 88 | fix69 | `v292Dfix69-literary-prose.js` | i88 ※読み込み停止（2026-11-15・CLEANUP3） | `35c17050` | v292Dfix69 | 文章品質・プロンプト |  |
| 89 | fix71 | `v292Dfix71-anti-recap.js` | i89 | `556ca607` | 20261111-flow3 | 文章品質・プロンプト | `v292Dfix71DlgOff` `v292Dfix71DlgOn` `v292DfixCL1gOff` `v292DfixDEDUPQ1Off` |
| 90 | fix72 | `v292Dfix72-within-turn-dedup.js` | i90 | `c322d729` | 20261111-flow3 | 文章品質・プロンプト | `v292DfixCL1hOff` `v292DfixDEDUPQ1Off` |
| 91 | fix75 | `v292Dfix75-history-dedup.js` | i91 | `4ae2143f` | v292Dfix75 | 文章品質・プロンプト |  |
| 92 | fix76 | `v292Dfix76-human-foundation.js` | i92 ※読み込み停止（2026-11-15・CLEANUP3） | `e60a34f5` | v292Dfix76b | NPC・キャラ状態 |  |
| 93 | fix77 | `v292Dfix77-state-memory.js` | i93 | `d53f65aa` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix532Off` `v292Dfix901Off` `v292Dfix938Off` `v292Dfix961Off` |
| 94 | fix78 | `v292Dfix78-tag-case-normalize.js` | i94 | `bd33ee86` | 20260912-q119s4 | 話者・会話ログ | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` |
| 95 | fix79 | `v292Dfix79-momentum-anchor.js` | i95 ※読み込み停止（2026-11-15・CLEANUP3） | `78d3c840` | v292Dfix79 | NPC・キャラ状態 |  |
| 96 | fixBF1 | `v292DfixBF1-reasoning-fallback.js` | i96 | `9b3096f9` | 20261122-allonb | モデル・API | `v292DfixBF1Off` `v292DfixBF1On` |
| 97 | fix80 | `v292Dfix80-gen-gate-retry.js` | i97 | `6b90a1f2` | 20260929-ac23 | モデル・API | `v292Dfix504Off` `v292Dfix923Off` |
| 98 | fix82 | `v292Dfix82-injury-reaction-root.js` | i98 ※読み込み停止（2026-11-15・CLEANUP3） | `cf4e514f` | v292Dfix82 | NPC・キャラ状態 |  |
| 99 | fix83 | `v292Dfix83-name-truncation-repair.js` | i99 | `109f7ff6` | v292Dfix83 | NPC・キャラ状態 |  |
| 100 | fix84 | `v292Dfix84-sampling.js` | i100 | `1e09b21d` | v292Dfix482 | 文章品質・プロンプト |  |
| 101 | fix85 | `v292Dfix85-reaction-spectrum.js` | i101 ※読み込み停止（2026-11-15・CLEANUP3） | `0f0ee85b` | v292Dfix85 | NPC・キャラ状態 |  |
| 102 | fix81 | `v292Dfix81-strip-incomplete-tags.js` | i102 | `f58f2480` | v292Dfix81 | 文章品質・プロンプト |  |
| 103 | fix90 | `v292Dfix90-extension-dedup.js` | i103 | `4434f189` | v292Dfix90 | 文章品質・プロンプト |  |
| 104 | fix796 | `v292Dfix796-memory-retrieve.js` | i104 | `c7b43471` | 20261021-bundle38-b | 記憶 | `v292Dfix796BackfillOff` `v292Dfix796DedupeOff` `v292Dfix796F1On` `v292Dfix796HonOn` |
| 105 | fix192 | `v292Dfix192-newengine.js` | i105 | `db8a28e2` | 20261122-scene1 | 文章品質・プロンプト（生成の中心） | `v292Dfix425Off` `v292Dfix796HonOn` `v292Dfix812Off` `v292Dfix813Off` `v292DfixAGENCY1Off` `v292DfixAGENCY1StoryOff` `v292DfixSTATEAGE1Off` `v292DfixNOW1Off` `v292DfixSTATE2Off` |
| 106 | fix197 | `v292Dfix197-avatar-key.js` | i106 | `ef0ec3e6` | 20261019-bundle31-a | アイコン・画像 | `v292DavProvOff` `v292Dfix403Off` `v292Dfix403cOff` `v292Dfix411Off` |
| 107 | fix221 | `v292Dfix221-recent-dialogues-authoritative.js` | i107 | `9def1578` | v292Dfix221 | 話者・会話ログ |  |
| 108 | fix226 | `v292Dfix226-engine-unify.js` | i108 | `d966519b` | v292Dfix226 | 文章品質・プロンプト |  |
| 109 | fix228 | `v292Dfix228-slot-generations.js` | i109 | `392213e5` | 20260901-fix783 | 保存・同期 | `v292Dfix651SlotBackupGuardOff` `v292Dfix783Off` |
| 110 | fix237 | `v292Dfix237-avatar-carrier-guard.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i110。ファイルは残る） | `94dbe30c` | 20261002-ac36 | アイコン・画像 |  |
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
| 132 | fix305 | `v292Dfix305-trigger-states.js` | i132 ※読み込み停止（2026-11-15・CLEANUP3） | `1e1d23c9` | v292Dfix305 | NPC・キャラ状態 | `v292Dfix305Off` |
| 133 | fix306 | `v292Dfix306-npc-liveliness.js` | i133 | `6fe4b6cf` | 20261122-scene1 | NPC・キャラ状態 | `v292Dfix306Off` |
| 134 | fix764 | `v292Dfix764-name-variant-fold.js` | i134 | `78be3ba8` | v292Dfix764 | NPC・キャラ状態 | `v292Dfix764Off` |
| 135 | fix830 | `v292Dfix830-entity-match-resolver.js` | i135 | `34dd81e4` | 20260907-fix832 | NPC・キャラ状態 | `v292Dfix764Off` `v292Dfix830Off` |
| 136 | fix766 | `v292Dfix766-canonical-appearance.js` | i136 | `960c7d11` | 20261019-bundle31-a | 認証・アカウント | `v292Dfix766Off` `v292Dfix766On` `v292Dfix776Off` `v292Dfix778Off` |
| 137 | fix983 | `v292Dfix983-appearance-dict.js` | i137 | `e63a1b85` | 20261019-bundle31-a | アイコン・画像 |  |
| 138 | fix767 | `v292Dfix767-icon-recipe-adapter.js` | i138 | `05be1ba0` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix769Off` `v292Dfix770Off` `v292Dfix773Off` `v292Dfix774Off` |
| 139 | fixRC | `v292DfixRC-regen-candidate.js` | i139 | `ee717776` | 20261019-bundle31-a | アイコン・画像 | `v292DfixRCOff` |
| 140 | fix307 | `v292Dfix307-npc-roster.js` | i140 | `574b4448` | 20261103-bundle93-c | NPC・キャラ状態 | `v292Dfix307Off` `v292Dfix307fOff` |
| 141 | fixSC1 | `v292DfixSC1-sidecar-eligibility.js` | i141 | `b1b3b546` | 20261009-bh1 | （未分類） | `v292DfixSC1Off` `v292DfixSC1On` |
| 142 | fixGQ4 | `v292DfixGQ4-summary-request.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i142。ファイルは残る） | `d98338e2` | 20261010-gq1 | 記憶 | `v292DfixGQ4Off` `v292DfixGQ4On` |
| 143 | fixCTX | `v292DfixCTX-context-restore.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i143。ファイルは残る） | `80e1aec4` | 20261010-gq1 | 記憶 | `v292DfixCTXOff` `v292DfixCTXOn` |
| 144 | fixRC1 | `v292DfixRC1-recall-inputs.js` | i144 | `fdeb53e9` | 20261107-ready1 | 記憶 | `v292DfixRC1Off` `v292DfixRC1On` |
| 145 | fixCP1 | `v292DfixCP1-scene-presence.js` | i145 | `5ef63c79` | 20261025-bundle47-cp1r-c | NPC・キャラ状態 | `v292DfixCP1Off` `v292DfixCP1On` |
| 146 | fix308 | `v292Dfix308-creepy-toggle.js` | i146 | `c198ae9f` | v292Dfix308 | 文章品質・プロンプト | `v292Dfix308Disable` |
| 147 | fix309 | `v292Dfix309-progression.js` | i147 | `22fc586e` | 20261122-scene1 | NPC・キャラ状態 | `v292Dfix309Off` |
| 148 | fix579 | `v292Dfix579-tombstone-schema.js` | i148 h18 | `fcdbf7df` | v292Dfix588 | 削除・墓標 |  |
| 149 | fix587 | `v292Dfix587-story-lifecycle.js` | i149 h26 | `34b53284` | 20261020-bundle35-b | 削除・墓標 | `v292Dfix587Off` `v292Dfix708Off` `v292DfixDP1Off` |
| 150 | fix602 | `v292Dfix602-tombstone-write-shadow.js` | i150 h28 | `625d0bf2` | v292Dfix602 | 削除・墓標 | `v292Dfix602ShadowOff` |
| 151 | fix577 | `v292Dfix577-delete-entry-guard.js` | i151 | `08fdce73` | v292Dfix577 | 削除・墓標 | `v292Dfix577Off` |
| 152 | fix310 | `v292Dfix310-gallery.js` | 読み込み停止（CLEANUP2 C2a・GitHub `05da4aa`。元の読込 i152。ファイルは残る） | `85178fee` | 20261009-p8b2 | アイコン・画像 | `v292DcoverExtOn` `v292Dfix310Off` |
| 153 | fix933 | `v292Dfix933-beta-delete-off.js` | i153 h27 | `399508fd` | 20261111-delall | 削除・墓標 | `v292Dfix933Off` `v292DfixDELALLOff` |
| 154 | fixDL2 | `v292DfixDL2-server-delete.js` | i154 h32 | `9f7943ed` | 20261116-vdel1 | 削除・墓標 | `v292DfixDL2Off` `v292DfixDP3On` `v292DfixDP4Off` `v292DfixVDEL1Off` |
| 155 | fix313 | `v292Dfix313-story-cards.js` | i155 | `1a5ff334` | 20261019-bundle31-a | 記憶 | `v292Dfix313Off` `v292Dfix951Off` `v292Dfix954Off` `v292Dfix954On` |
| 156 | fix314 | `v292Dfix314-memory.js` | i156 | `977ccdf0` | 20260829-fix748 | 記憶 | `v292Dfix314Off` |
| 157 | fix315 | `v292Dfix315-see.js` | 読み込み停止（CLEANUP2 C2a・GitHub `05da4aa`。元の読込 i157（86 では i160）。ファイルは残る） | `4864a7ee` | 20261103-bundle91-b | アイコン・画像 | `v292Dfix315On`（91-b から効かない）`v292DfixIMGSAFEOff` |
| 158 | fix316 | `v292Dfix316-gallery-search.js` | 読み込み停止（CLEANUP2 C2a・GitHub `05da4aa`。元の読込 i158。ファイルは残る） | `8010df68` | v292Dfix316 | アイコン・画像 | `v292Dfix316Off` |
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
| 171 | fix333 | `v292Dfix333-actor-reality.js` | i171 | `d3c12880` | 20261122-scene1 | NPC・キャラ状態 | `v292Dfix333HeroLabelOff` `v292Dfix333Off` `v292Dfix333SelOnceOff` `v292Dfix927Off` |
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
| 182 | fix359 | `v292Dfix359-gender-avatar.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i182。ファイルは残る） | `64ef641c` | v292Dfix359 | アイコン・画像 | `v292Dfix359Off` |
| 183 | fix360 | `v292Dfix360-seed-ux.js` | i183 | `a0355998` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix360Off` |
| 184 | fix361 | `v292Dfix361-phaseb-preview.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i184。ファイルは残る） | `0ad7e105` | v292Dfix361 | シナリオ・ホーム |  |
| 185 | fix363 | `v292Dfix363-player-seed.js` | i185 | `648c3a3e` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix363Off` |
| 186 | fix364 | `v292Dfix364-reset-help.js` | i186 | `593e0057` | v292Dfix365 | UI・画面 | `v292Dfix364Off` |
| 187 | fix366 | `v292Dfix366-cast-gender.js` | i187 | `438e5a4d` | 20261101-bundle83-flow-c | NPC・キャラ状態 | `v292Dfix366Off` |
| 188 | fix370 | `v292Dfix370-model-guard.js` | i188 | `210a5e98` | 20260913-dsmrc1 | UI・画面 | `v292Dfix370Off` |
| 189 | fix371 | `v292Dfix371-reset-dialog-text.js` | i189 | `5720d35d` | v292Dfix371 | 文章品質・プロンプト | `v292Dfix371Off` |
| 190 | fix372 | `v292Dfix372-gender-radio-guard.js` | i190 | `867ce977` | v292Dfix372 | NPC・キャラ状態 | `v292Dfix372Off` |
| 191 | fix374 | `v292Dfix374-default-style-guard.js` | i191 | `635abe5a` | 20260901-fix783 | UI・画面 | `v292Dfix374Off` `v292Dfix783Off` |
| 192 | fix376 | `v292Dfix376-speaker-guard.js` | i192 | `c282fa65` | 20260902-fix800 | 話者・会話ログ | `v292Dfix376Off` `v292Dfix469Off` |
| 193 | fix377 | `v292Dfix377-voice-anchor.js` | i193 | `a03e15ea` | 20261122-voiceex1 | 話者・会話ログ | `v292Dfix377COff` `v292Dfix377Off` `v292DfixGQ1aOff` `v292DfixGQ1bOff` `v292DfixVOICEEX1Off`（VOICEEX1・11-22＝口調の見本を「いちばん古い台詞」から「状態の申告を除いた、直近 2 ターンより前でいちばん新しい台詞」へ。古い台詞の写しによる矛盾への直し・実 AI は未確認） |
| 194 | fix378 | `v292Dfix378-species-judge.js` | i194 | `c0e2fa1f` | v292Dfix378 | NPC・キャラ状態 | `v292Dfix378Off` |
| 195 | fix379 | `v292Dfix379-wrap-keeper.js` | i195 | `a1a9b68e` | 20261122-scene1 | 文章品質・プロンプト | `v292Dfix363Off` `v292Dfix366Off` `v292Dfix376Off` `v292Dfix377Off` |
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
| 221 | fix414 | `v292Dfix414-constraint-engine.js` | i221 | `b48bd473` | 20261116-leg1r2 | NPC・キャラ状態 | `v292Dfix414Off` `v292Dfix414WidenOff` `v292DfixFRZ1Off` `v292DfixEYE1Off` `v292DfixLEG1Off` |
| 222 | fix77X | `v292Dfix77X-clear.js` | i222 | `71551453` | 20261019-bundle31-a | NPC・キャラ状態 |  |
| 223 | fix415 | `v292Dfix415-opening-mask.js` | i223 | `93e0d740` | v292Dfix415b | 文章品質・プロンプト | `v292Dfix415Off` |
| 224 | fix416 | `v292Dfix416-pain-style.js` | i224 | `7e4a98de` | v292Dfix428 | NPC・キャラ状態 | `v292Dfix416Off` `v292Dfix425Off` |
| 225 | fix417 | `v292Dfix417-reaction-unified.js` | i225 | `84166817` | v292Dfix426 | NPC・キャラ状態 | `v292Dfix379V4Off` `v292Dfix417Off` `v292Dfix425Off` |
| 226 | fix418 | `v292Dfix418-genkeep.js` | i226 | `a9c5e3a0` | v292Dfix418 | 文章品質・プロンプト | `v292Dfix418Off` |
| 227 | fix420 | `v292Dfix420-stylelora.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i227。ファイルは残る） | `510ea41b` | v292Dfix420v2 | アイコン・画像 | `v292Dfix420Off` |
| 228 | fix474 | `v292Dfix474-candidate.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i228。ファイルは残る） | `d68cac44` | 20261002-ac36 | アイコン・画像 |  |
| 229 | fix475 | `v292Dfix475-recipe-v3.js` | i229 | `f4cf5808` | v292Dfix486 | アイコン・画像 | `v292Dfix471Off` `v292Dfix471On` `v292Dfix475Off` |
| 230 | fix477 | `v292Dfix477-autocomplete-off.js` | i230 | `6ec39ad3` | v292Dfix477 | UI・画面 | `v292Dfix477Off` |
| 231 | fix478 | `v292Dfix478-imggen-retry.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i231。ファイルは残る） | `a51c89af` | v292Dfix478b | アイコン・画像 | `v292Dfix478Off` |
| 232 | fix491 | `v292Dfix491-imggen-freefallback.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i232。ファイルは残る） | `b0cf90ad` | v292Dfix491v4 | アイコン・画像 | `v292Dfix491Off` |
| 233 | fix476 | `v292Dfix476-pipeline.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i233。ファイルは残る） | `05f41bdf` | v292Dfix779 | アイコン・画像 | `v292Dfix476Off` `v292Dfix779Off` |
| 234 | fix481 | `v292Dfix481-provider-switch.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i234。ファイルは残る） | `f9ed6537` | v292Dfix481 | アイコン・画像 | `v292Dfix481Off` |
| 235 | fix483 | `v292Dfix483-genbudget-sync.js` | i235 | `29ccca69` | v292Dfix495 | 保存・同期 | `v292Dfix483Off` `v292Dfix483gbOff` |
| 236 | fix427 | `v292Dfix427-output-sanitize.js` | i236 | `f57387e8` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix427Off` `v292Dfix427TailOff` `v292Dfix975Off` |
| 237 | fix430 | `v292Dfix430-carrier-block.js` | i237 | `d74e943a` | v292Dfix430 | アイコン・画像 | `v292Dfix430Off` |
| 238 | fix436 | `v292Dfix436-seed-expand.js` | i238 h36 | `3a5d6160` | 20261108-bundle93-h | シナリオ・ホーム | `v292Dfix436Off` `v292Dfix855Off` `v292DfixB37cOff` |
| 239 | fix437 | `v292Dfix437-regen-instant.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i239。ファイルは残る） | `cadb419f` | 20261002-ac36 | アイコン・画像 | `v292Dfix437Off` |
| 240 | fix438 | `v292Dfix438-inline-dialogue.js` | i240 | `7e44532e` | 20261019-bundle31-a | 話者・会話ログ | `v292Dfix438Off` `v292Dfix959Off` |
| 241 | fix439 | `v292Dfix439-readability.js` | i241 | `cec796ef` | v292Dfix457 | 文章品質・プロンプト | `v292Dfix439Off` |
| 242 | fix440 | `v292Dfix440-block-rescue.js` | i242 | `7c10214d` | 20261021-bundle38-b | 文章品質・プロンプト | `v292Dfix440Off` `v292DfixB38Off` |
| 243 | fix500 | `v292Dfix500-sys-dedup.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i243。ファイルは残る） | `3d792742` | v292Dfix500 | 文章品質・プロンプト | `v292Dfix500Off` |
| 244 | fix509 | `v292Dfix509-sys-consolidate.js` | i244 | `f0685e61` | v292Dfix509 | 文章品質・プロンプト | `v292Dfix509Off` |
| 245 | fix510 | `v292Dfix510-sys-p1-style.js` | i245 | `0f8e8762` | v292Dfix513 | 文章品質・プロンプト | `v292Dfix510Off` |
| 246 | fix512 | `v292Dfix512-say-attribution.js` | i246 | `010a7a8f` | v292Dfix512 | 話者・会話ログ | `v292Dfix512Off` |
| 247 | fix514 | `v292Dfix514-say-fullname.js` | i247 | `8f0cf53d` | v292Dfix514 | 話者・会話ログ | `v292Dfix514Off` |
| 248 | fix441 | `v292Dfix441-sys-at-send.js` | i248 | `868917f9` | v292Dfix514 | 文章品質・プロンプト | `v292Dfix441Off` |
| 249 | fix442 | `v292Dfix442-folklore.js` | i249 | `d7940bcd` | v292Dfix442 | 文章品質・プロンプト | `v292Dfix442Off` |
| 250 | fix443 | `v292Dfix443-drama-rescue.js` | i250 | `710f47dd` | 20261111-flow3 | 文章品質・プロンプト | `v292Dfix443Off` `v292DfixCONT1Off` |
| 251 | fix483 | `v292Dfix483-beat-director.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i251。ファイルは残る） | `2be886d6` | v292Dfix483 | 文章品質・プロンプト | `v292Dfix483Off` |
| 252 | fix444 | `v292Dfix444-world-law.js` | i252 | `39d1eeb9` | 20261014-iso2b-c953r3 | NPC・キャラ状態 | `v292Dfix444Off` `v292Dfix444gOff` `v292Dfix451Off` |
| 253 | fix445 | `v292Dfix445-handle-lock.js` | i253 | `33dd9bff` | 20261122-scene1 | 保存・同期 | `v292Dfix445LabelOff` `v292Dfix445Off` `v292Dfix445SpkOff` `v292Dfix445WiOff` |
| 254 | fix446 | `v292Dfix446-fill-robust.js` | i254 | `ab8f1d41` | v292Dfix446 | 文章品質・プロンプト | `v292Dfix446Off` |
| 255 | fix447 | `v292Dfix447-json-force.js` | i255 | `38463b2c` | v292Dfix447 | 文章品質・プロンプト | `v292Dfix447Off` |
| 256 | fix448 | `v292Dfix448-genloading.js` | i256 | `f5fc2bfb` | v292Dfix448 | UI・画面 | `v292Dfix448Off` |
| 257 | fix453 | `v292Dfix453-src-coalesce.js` | i257 | `b82f3cb8` | v292Dfix453 | 文章品質・プロンプト | `v292Dfix453Off` |
| 258 | fix454 | `v292Dfix454-dash.js` | i258 | `868cca04` | v292Dfix457 | 文章品質・プロンプト | `v292Dfix454Off` |
| 259 | fix458 | `v292Dfix458-dash-post.js` | i259 | `5f9a8424` | 20260901-fix784 | 文章品質・プロンプト | `v292Dfix458Off` `v292Dfix625Off` `v292Dfix760Off` `v292Dfix762Off` |
| 260 | fix459 | `v292Dfix459-sys-v2.js` | i260 | `d8324ea7` | 20261122-scene1 | 文章品質・プロンプト | `v292Dfix459AOff` `v292Dfix459BOff` `v292Dfix459COff` `v292Dfix459DOff` `v292DfixRW1Off` `v292DfixBEAT2aOn` `v292DfixBEAT2bOn`（実験・既定 OFF） |
| 261 | fix460 | `v292Dfix460-slotgrid.js` | 読み込み停止（CLEANUP2 C2a・GitHub `05da4aa`。元の読込 i261。ファイルは残る） | `7b19dfd7` | v292Dfix460 | 保存・同期 | `v292Dfix460Off` |
| 262 | fix461 | `v292Dfix461-appearance-en.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i262。ファイルは残る） | `775fcc85` | 20261002-ac36 | アイコン・画像 | `v292Dfix461Off` `v292Dfix461V21Off` `v292Dfix461V21On` |
| 263 | fix462 | `v292Dfix462-bare-speaker.js` | i263 | `e2c7f062` | 20260829-fix748 | 話者・会話ログ | `v292Dfix462Off` `v292Dfix469Off` |
| 264 | fix463 | `v292Dfix463-human-guard.js` | i264 | `02f85257` | v292Dfix463 | NPC・キャラ状態 | `v292Dfix463Off` |
| 265 | fix464 | `v292Dfix464-say-promote.js` | i265 | `518f21b3` | v292Dfix465 | 話者・会話ログ | `v292Dfix464Off` |
| 266 | fix465 | `v292Dfix465-role-who.js` | i266 | `3d89bcc9` | 20261115-rw1 | 話者・会話ログ | `v292Dfix465Off` `v292DfixRW1Off` |
| 267 | fix466 | `v292Dfix466-dup-say.js` | i267 | `bbe05320` | v292Dfix466 | 話者・会話ログ | `v292Dfix466Off` |
| 268 | fix467 | `v292Dfix467-readability-rules.js` | i268 | `cf5dcbb3` | v292Dfix468 | 文章品質・プロンプト | `v292Dfix467Off` |
| 269 | fix468 | `v292Dfix468-gen-timing.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i269。ファイルは残る） | `37f638a7` | v292Dfix468 | UI・画面 | `v292Dfix468Off` |
| 270 | fix469 | `v292Dfix469-speaker-score.js` | i270 | `1dc25074` | 20261108-bundle93-h | 話者・会話ログ | `v292Dfix469DropOn` `v292Dfix469Off` `v292Dfix469TagGuardOff` `v292Dfix469ToneFlipOff` |
| 271 | fix680 | `v292Dfix680-bare-speaker-provenance.js` | i271 | `653cc57c` | 20260829-fix748 | 話者・会話ログ | `v292Dfix680Off` `v292Dfix680On` |
| 272 | fix681 | `v292Dfix681-player-say-claim.js` | i272 | `a9683dc8` | 20260829-fix748 | 話者・会話ログ | `v292Dfix681Off` |
| 273 | fix606 | `v292Dfix606-speaker-provenance.js` | i273 | `77950540` | v292Dfix630 | 話者・会話ログ | `v292Dfix606Off` |
| 274 | fix611 | `v292Dfix611-speaker-gate.js` | i274 | `6795a98e` | v292Dfix630 | 話者・会話ログ | `v292Dfix611SpeakerGateOff` `v292Dfix619ReconcilerOff` |
| 275 | fix957 | `v292Dfix957-speaker-cataphora.js` | i275 | `ad2d8bff` | 20261022-bundle41-a | 話者・会話ログ | `v292Dfix957Off` `v292Dfix957On` `v292Dfix974Off` `v292DfixSP1BOff` |
| 276 | fix620 | `v292Dfix620-speaker-apply.js` | i276 | `3d4a774e` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix620ApplyOff` `v292Dfix783Off` |
| 277 | fix616 | `v292Dfix616-say-provenance-persist.js` | i277 | `4bf42e71` | 20260829-fix748 | 話者・会話ログ | `v292Dfix616Off` |
| 278 | fix805 | `v292Dfix805-speaker-abstain.js` | i278 ※読み込み停止（2026-11-15・CLEANUP3） | `1a3edab6` | 20260905-fix805v2 | 話者・会話ログ | `v292Dfix616Off` `v292Dfix805EphOff` `v292Dfix805Off` `v292Dfix805On` |
| 279 | fix806 | `v292Dfix806-npc-consistency-observer.js` | i279 ※読み込み停止（2026-11-15・CLEANUP3） | `3e1b7a0d` | 20260928-ac13 | NPC・キャラ状態 | `v292Dfix806Off` `v292Dfix806On` `v292DmeOff` |
| 280 | fix816 | `v292Dfix816-posture-transition-observer.js` | i280 ※読み込み停止（2026-11-15・CLEANUP3） | `36244da0` | 20260906-fix816b | NPC・キャラ状態 | `v292Dfix816Off` `v292Dfix816On` |
| 281 | fix624 | `v292Dfix624-degeneration-probe.js` | i281 | `7913f9ff` | v292Dfix630 | 文章品質・プロンプト | `v292Dfix624Off` |
| 282 | fix470 | `v292Dfix470-style-tail.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i282。ファイルは残る） | `87bb7a62` | v292Dfix470e | アイコン・画像 | `v292Dfix338Off` `v292Dfix470Off` `v292Dfix470On` `v292Dfix470WasOn` |
| 283 | fix471 | `v292Dfix471-style-c.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i283。ファイルは残る） | `b0b1bd27` | v292Dfix472 | アイコン・画像 | `v292Dfix338Off` `v292Dfix470Off` `v292Dfix470On` `v292Dfix471Off` |
| 284 | fix472 | `v292Dfix472-icon-protect.js` | i284 | `5e8bb3c5` | v292Dfix472 | アイコン・画像 | `v292Dfix472Off` |
| 285 | fix487 | `v292Dfix487-unknown-guard.js` | i285 | `495ae289` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix487IconOff` |
| 286 | fix488 | `v292Dfix488-nonhuman-detail.js` | i286 | `8960f249` | v292Dfix488b | アイコン・画像 | `v292Dfix488Off` |
| 287 | fix456 | `v292Dfix456-name-space.js` | i287 | `084cb79e` | v292Dfix456 | 話者・会話ログ | `v292Dfix456Off` |
| 288 | fix482 | `v292Dfix482-output-quality.js` | i288 | `895da7e1` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix482Off` `v292Dfix482RetryOff` `v292Dfix482RetryOn` `v292Dfix482mOff` |
| 289 | fix489 | `v292Dfix489-convlog-gate.js` | i289 | `2263d032` | 20260901-fix784 | 話者・会話ログ | `v292Dfix489DropOn` `v292Dfix489Off` `v292Dfix783Off` |
| 290 | fix490 | `v292Dfix490-slot-write-guard.js` | i290 | `874dce71` | v292Dfix565 | 保存・同期 | `v292Dfix490Off` `v292Dfix576Off` |
| 291 | fix492 | `v292Dfix492-genfail-toast.js` | i291（86 では i295） | `535d64b4` | 20261122-nocost1 | UI・画面 | `v292Dfix492Off` |
| 292 | fix501 | `v292Dfix501-legacy-appearance-probe.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i292。ファイルは残る） | `bd3bb1ca` | v292Dfix501 | アイコン・画像 | `v292Dfix501Off` |
| 293 | fix515 | `v292Dfix515-icon-persist-probe.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i293。ファイルは残る） | `dd96cd56` | v292Dfix515 | アイコン・画像 | `v292Dfix515Off` `v292Dfix515On` |
| 294 | fix516 | `v292Dfix516-regen-local-display.js` | i294 | `115a78e1` | 20261002-ac36 | アイコン・画像 | `v292Dfix516Off` |
| 295 | fix517 | `v292Dfix517-local-authoritative-avatar.js` | 読み込み停止（CLEANUP2 C2c・GitHub `05da4aa`。元の読込 i295。ファイルは残る） | `85ef4054` | 20261002-ac36 | アイコン・画像 | `v292Dfix517Off` |
| 296 | fix519 | `v292Dfix519-icon-p2p.js` | i296 | `2f70451c` | 20260908-fix837 | アイコン・画像 | `v292Dfix519Off` `v292Dfix837Off` |
| 297 | fix523 | `v292Dfix523-icon-sync-versioned.js` | i297 | `1c4cea0e` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix523Off` `v292Dfix837Off` `v292Dfix960Off` |
| 298 | fix525 | `v292Dfix525-slot-ownership.js` | i298 | `8543fc23` | v292Dfix525 | 保存・同期 | `v292Dfix525Off` |
| 299 | fix945 | `v292Dfix945-xtab-stale-guard.js` | i299 | `d5a83d5f` | 20261111-rescueon | 保存・同期 | `v292Dfix945EvtOff` `v292Dfix945Off` `v292Dfix945EarlyOff` `v292Dfix945GateOff` `v292Dfix945RescueOff` `v292Dfix945RescueOn` `v292DfixRESCUE1Off` |
| 299b | fixRESCUE1 | `v292DfixRESCUE1-rescue-view.js` | index：fix945 の直前／home：LE4 の直後 | `4c1f7eb0` | 20261110-rescue1 | 保存・同期 | `v292DfixRESCUE1Off` |
| 300 | fix526 | `v292Dfix526-story-naming.js` | i300 | `d283a91f` | 20260829-fix748 | 保存・同期 | `v292Dfix526Off` |
| 301 | fix631 | `v292Dfix631-avatar-inventory.js` | i301 | `39c65cca` | fix631 | アイコン・画像 | `v292Dfix631Off` |
| 302 | fix632 | `v292Dfix632-img-content-dirty.js` | i302 | `08ed559c` | fix638 | アイコン・画像 | `v292Dfix632Off` |
| 303 | fix633 | `v292Dfix633-icon-sweep-full.js` | i303 | `3c2bdc64` | 20260908-fix837 | アイコン・画像 | `v292Dfix633Live` `v292Dfix633Off` `v292Dfix633Shadow` `v292Dfix655Off` |
| 304 | fix634 | `v292Dfix634-aiappearance-sync.js` | i304 | `be628cfb` | 20261005-c1 | アイコン・画像 | `v292Dfix634Off` `v292Dfix837Off` |
| 305 | fix635 | `v292Dfix635-new-story-guard-rearm.js` | i305 | `63b759c4` | 20261111-saveui | 保存・同期 | `v292Dfix600Off` `v292Dfix635Off` `v292DfixSAVEUIOff` |
| 305b | fixSAVEUI | `v292DfixSAVEUI-save-truth.js` | index：fix635 の直後 | `7bc70aa6` | 20261111-saveui | 保存・同期 | `v292DfixSAVEUIOff` `v292DfixSAVEUIGateOff` `v292DfixSAVEUIAdoptOff` |
| 306 | fix636 | `v292Dfix636-npc-presence-evidence.js` | i306 | `b5994d3d` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix636Off` |
| 307 | fix637 | `v292Dfix637-cast-bootstrap-probe.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i307。ファイルは残る） | `4094ba14` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix637Apply` `v292Dfix637Off` |
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
| 324 | fix740 | `v292Dfix740-cap-telemetry.js` | 読み込み停止（CLEANUP2 C2b・GitHub `05da4aa`。元の読込 i324。ファイルは残る） | `a328e139` | v292Dfix740 | NPC・キャラ状態 | `v292Dfix740Off` |
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
| 335 | fix845 | `v292Dfix845-selfnaming-shadow-observer.js` | 読み込み停止（CLEANUP1 C1・GitHub `4dcd38c`。元の読込 i335。ファイルは残る） | `a6298d05` | 20260913-f845ss1 | 保存・同期 | `v292Dfix783Off` `v292Dfix845Off` |
| 336 | fix850 | `v292Dfix850-turn-local-physical.js` | i336 | `91e0af75` | 20261111-f333b | NPC・キャラ状態 | `v292Dfix850Off` `v292Dfix850On` `v292Dfix929Off` `v292Dfix930Off` `v292DfixF333aOff` `v292DfixF333bOff` |
| 337 | fix851 | `v292Dfix851-posture-directive.js` | i337 | `22543ee2` | 20261001-ac33 | NPC・キャラ状態 | `v292Dfix851Off` `v292Dfix851On` `v292Dfix936Off` `v292DrrOff` |
| 338 | fix852 | `v292Dfix852-mental-capability.js` | i338 | `dbd6fffe` | 20261001-ac33 | NPC・キャラ状態 | `v292Dfix852Off` `v292Dfix852On` `v292Dfix936Off` `v292DrrOff` |
| 339 | fix853 | `v292Dfix853-truncated-name-guard.js` | i339 | `14e1e6de` | 20261025-bundle58-npcp1-b | NPC・キャラ状態 | `v292Dfix853Off` `v292Dfix853pOff` `v292DfixA4Off` |
| 340 | av2-portrait | `v292Dav2-portrait.js` | i340（86 では i345） | `b6f6b310` | 20261122-flick1 | アイコン・画像 | `v292Dav2pOff` `v292Dfix993Off` `v292DfixB37aOff` `v292DfixFG1cOff` `v292Dav2pRenameOff` |
| 341 | fixLD1 | `v292DfixLD1-preset-portrait.js` | i341 | `10dcebf5` | 20261121-restyle1on | アイコン・画像 | `v292DfixD1Off` `v292DfixLD1On` `v292DfixRESTYLE1Off` |
| 342 | fixB37 | `v292DfixB37-onboard.js` | i342 | `b794bcf2` | 20261122-nocost1 | シナリオ・ホーム | `v292DfixB37bOff` `v292DfixB37gOff` |
| 343 | fixLC1 | `v292DfixLC1-appearance-proposal.js` | i343（86 では i348） | `30261b87` | 20261115-rw1 | アイコン・画像 | `v292DfixLC1Off` `v292DfixICONFIX1aOff` `v292DfixAPPX1Off` |
| 344 | fixLC1 | `v292DfixLC1-workbench.js` | i344（86 では i349） | `f4564ac3` | 20261110-bundle93-k | アイコン・画像 | `v292DfixLC1Off` `v292DfixLC1On` `v292DfixLC1PtrRefreshOff` |
| 345 | av2-migrate-ui | `v292Dav2-migrate-ui.js` | i345 | `f8df095d` | 20261122-nocost1 | アイコン・画像 | `v292Dav2Off` `v292Dav2On` `v292Dav2mOff` |
| 346 | fg3-artpreset | `v292Dfg3-artpreset.js` | i346 | `5c575d27` | 20261021-bundle37-a | アイコン・画像 | `v292Dfg3Off` `v292DfixB37fOff` |
| 347 | fix886 | `v292Dfix886-public-anon-client.js` | 読み込み停止（CLEANUP2 C2a・GitHub `05da4aa`。元の読込 i347。ファイルは残る） | `0d4b103e` | 20260921-sp16r | 認証・アカウント | `v292Dfix837Off` `v292Dfix841Off` `v292Dfix886Off` `v292Dfix886TurnOff` |
| 348 | fix890 | `v292Dfix890-anon-gate-yield.js` | 読み込み停止（CLEANUP2 C2a・GitHub `05da4aa`。元の読込 i348。ファイルは残る） | `f832fbfc` | 20260920-sp14j | 認証・アカウント |  |
| 349 | fix970 | `v292Dfix970-state-intake-shadow.js` | i349 ※読み込み停止（2026-11-15・CLEANUP3） | `66ae0ba2` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix970Off` `v292Dfix970On` |
| 350 | fixUI1 | `v292DfixUI1-subtract.js` | i350 | `f1abc3e3` | 20261025-bundle54-ui1-a | UI・画面 | `v292DfixUI1AuxOff` `v292DfixUI1DlgOff` `v292DfixUI1LabelOff` `v292DfixUI1MigOff` |
| 351 | fix642 | `v292Dfix642-delete-readback.js` | h29 | `e6a4102d` | 20260927-ac1 | 削除・墓標 | `v292Dfix642Off` |
| 352 | fix710 | `v292Dfix710-home-delete-autoresume.js` | h31 | `38dc93b4` | 20261020-bundle34-a | 削除・墓標 | `v292Dfix708Off` `v292Dfix710Off` |
| 353 | fixB37 | `v292DfixB37-home-menu.js` | h33 | `0bfa028b` | 20261021-bundle37-a | シナリオ・ホーム | `v292DfixB37dOff` |
| 354 | fix819 | `v292Dfix819-story-instantiator.js` | h38 | `b48b4522` | 20261019-bundle31-a | シナリオ・ホーム | `v292Dfix819Off` `v292Dfix871Off` |
| 355 | fix820 | `v292Dfix820-scenario-original-store.js` | h39 | `edc59752` | 20261111-scid2 | シナリオ・ホーム | `v292Dfix820Off` `v292Dfix868Off` `v292Dfix871Off` `v292Dfix872AutoOff` `v292DfixSCID1Off` `v292DfixSCID2Off` |
| 356 | fix872 | `v292Dfix872-scenario-cloud-sync.js` | h40 | `d59abecd` | 20261020-bundle35-b | 保存・同期 | `v292Dfix837Off` `v292Dfix872AutoOff` `v292Dfix872Off` `v292Dfix872On` |
| 357 | fix823 | `v292Dfix823-scenario-seed-adapter.js` | h41 | `798eb8bb` | 20261111-seedhero1 | シナリオ・ホーム | `v292Dfix823Off` `v292DfixSEEDWORLD2Off` `v292DfixSEEDHERO1Off` `v292DfixSEEDNPC1eOff` |
| 358 | fix829 | `v292Dfix829-seed-text-enrichment.js` | h44 | `6336e81b` | 20260907-fix829r | 文章品質・プロンプト | `v292Dfix829Off` |
| 359 | fix825 | `v292Dfix825-scenario-ui.js` | h45 | `ec3c0b71` | 20261020-bundle35-b | シナリオ・ホーム | `v292Dfix825Off` `v292Dfix872Off` `v292Dfix872On` `v292Dfix966Off` |
| 360 | fix870 | `v292Dfix870-home-entry.js` | h46 | `f4381e0a` | 20261107-open1 | シナリオ・ホーム | `v292Dfix870Off` |
| 361 | fix873 | `v292Dfix873-scenario-creator.js` | h47 | `16b525f7` | 20261111-seedhero1 | シナリオ・ホーム | `v292Dfix873Off`・`v292DfixSEEDNPC1Off`・`v292DfixSEEDNPC1bOff`・`v292DfixSEEDNPC1cOff`・`v292DfixSEEDNPC1dOff`・`v292DfixSEEDWORLD1Off`・`v292DfixSEEDWORLD2Off`・`v292DfixSEEDHERO1Off`・`v292DfixSEEDNPC1eOff` |
| 362 | fix885 | `v292Dfix885-home-data-fold.js` | h48 | `f1447152` | 20260919-sp14 | シナリオ・ホーム | `v292Dfix885Off` |
| 363 | vault2-ui | `v292Dvault2-ui.js` | h49 | `1a3eba03` | 20261021-bundle37-a | Vault・非表示 | `v292Dfix964Off` `v292DfixB37dOff` `v292Dvault2MsOff` `v292Dvault2UiOff` |

**80-int-a で足した部品**（読込は **80-int-a の index 順**。どれも index.html だけで、home.html では読まない。81-admg-a・82b・83 でも位置は同じ）

| # | 番号 | ファイル | 読込（80-int-a の index順） | sha256先頭 | ?cb= | 分野 | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 364 | fixADMF1 | `v292DfixADMF1-account-flags.js` | i9（fix893 の直後） | `9620d2ec` | 20261122-acct1r3 | 認証・アカウント | `v292Dfix893Off` `v292DfixADMF1Off` `v292DfixNPRESOn` `v292DfixSFL1Off` |
| 365 | fixUX72 | `v292DfixUX72-adjust-icon.js` | i72（IS1 の直後） | `c4dcaa07` | 20261031-bundle72-ux-a | UI・画面 | `v292DfixUX72Off` |
| 366 | fixJMP | `v292DfixJMP-jump-latest.js` | i168（fix326 の直後） | `b726e645` | 20261031-bundle76-jmp-a | UI・画面 | `v292DfixJMPOff` |
| 367 | fixNPRES | `v292DfixNPRES-presence-gate.js` | i343（fix853 の直後） | `73ff6c1c` | 20261122-scene1 | NPC・キャラ状態 | `v292DfixNPRESOff` `v292DfixNPRESOn` `v292DfixNPRESd1Off` `v292DfixNPRESd2Off` |

**82b・83 で足した部品**（読込は **83-flow-c の index 順**。どれも index.html だけで、home.html では読まない）

| # | 番号 | ファイル | 読込（83 の index順） | sha256先頭 | ?cb= | 分野 | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 368 | fixICONUX2 | `v292DfixICONUX2-twotap.js` | i350（86 の番号。LC1-workbench の直後。83 では i349） | `e6faea74` | 20261115-rw1 | アイコン・画像 | `v292DfixICONUXOff` `v292DfixLC1On` |
| 369 | fixSETAV1 | `v292DfixSETAV1-settings-avatar.js` | i350（ICONUX2 の直後） | `d2146d0e` | 20261101-bundle82-iconux-b | アイコン・画像 | `v292DfixSETAV1Off` |
| 370 | fixICF | `v292DfixICF-icon-fail-log.js` | i357（UI1 の直後・83） | `e41d22e6` | 20261103-bundle93-a | アイコン・画像 | `v292DfixICFOff` `v292DfixB37aOff` |
| 371 | fixFLW3 | `v292DfixFLW3-opening-mode.js` | i358（82b では i357＝最後） | `f2e896a4` | 20261101-bundle82-iconux-b | UI・画面 | `v292DfixFLW3Off` |
| 372 | fixFLW2 | `v292DfixFLW2-reload-notice.js` | i360（86 の番号。83 では i359） | `82323dfa` | 20261102-bundle86-lc1ox-d | アイコン・画像 | `v292DfixFLW2Off` |
| 373 | fixFLW4 | `v292DfixFLW4-cast-age.js` | i360 | `e2b2877a` | 20261101-bundle83-flow-c | 文章品質・プロンプト | `v292DfixFLW4Off` |
| 374 | fixFLW5 | `v292DfixFLW5-home-noop-save.js` | i361（最後） | `c3679050` | 20261101-bundle83-flow-c | 保存・同期 | `v292DfixFLW5Off` `v292Dfix527NoopHomeSaveOff` `v292DfixOrgOff` |
| 375 | fixIMGSAFE | `v292DfixIMGSAFE-core.js` | i16（86 の番号。home では読まない） | `fb23cf9e` | 20261102-bundle89-r1920-b | アイコン・画像 | `v292DfixIMGSAFEOff` |
| 376 | fixNDI1 | `v292DfixNDI1-no-direct-image.js` | i1 h1（91-b の番号。両方で最初） | `54dadff9` | 20261103-bundle91-b | アイコン・画像 | （kill なし） |
| 377 | fixEDLOG | `v292DfixEDLOG-narr-edit-log.js` | SFLTap の直後（92-a。home では読まない） ※読み込み停止（2026-11-15・CLEANUP3） | `4cb1ed47` | 20261103-bundle92-a | 話者・会話ログ | `v292DfixEDLogOn`（既定 OFF）`v292DfixEDLogOff` |
| 378 | fixICF80 | `v292DfixICF80-record.js` | ICF の直後（92-a。home では読まない） ※読み込み停止（2026-11-15・CLEANUP3） | `592a85ca` | 20261103-bundle92-a | アイコン・画像 | `v292DfixICF80On`（既定 OFF）`v292DfixICF80Off` |
| 379 | fixMIDICON | `v292DfixMIDICON-auto-icon.js` | SETAV1 の直後（93-a。home では読まない） | `882fd0ad` | 20261122-vaultgate2r2 | アイコン・画像 | `v292DfixMIDICONOff` `v292DfixMIDICONrosOff` `v292DfixMIDICONregOff` `v292DfixVICON1Off`（Vault・MXVAULT1） |
| 380 | fixISO1 | `v292DfixISO1-local-only-foreign-hide.js` | index：fix893 の直後／home：iso2 の後・fix889 の前（93-d） | `0f1ff245` | 20261107-iso1e | Vault・ユーザー分離 | `v292DfixISO1Off` |
| 381 | fixSETUI1 | `v292DfixSETUI1-settings-layout.js` | index の最後（FLW5 の後・93-g。home では読まない） | `3892c38f` | 20261108-bundle93-g | UI・画面 | `v292DfixSETUI1Off` |
| 382 | fixIDSPLIT2 | `v292DfixIDSPLIT2-selfname-merge.js` | index：fix620 の直後（93-h。home では読まない） | `3f75a2f2` | 20261108-bundle93-i | 話者・会話ログ | `v292DfixIDSPLIT2Off` |
| 383 | fixGENDER1 | `v292DfixGENDER1-autogender.js` | index：fix335 の直前／home：fix436 の直前（93-h） | `3291ae11` | 20261108-bundle93-h | シナリオ・ホーム | `v292DfixGENDER1Off` |
| 384 | fixSTARTICON | `v292DfixSTARTICON-start-icons.js` | index：MIDICON の直後（93-i。home では読まない） | `7a53b146` | 20261122-vaultgate2r2 | アイコン・画像 | `v292DfixSTARTICONOff` `v292DfixSTARTICONNoAI` `v292DfixSTARTICONRetryOff` `v292DfixSTARTICONListOff` `v292DfixVICON1Off` |
| 385 | fixKN1 | `v292DfixKN1-knowledge-canary.js` | index の最後（SETUI1 の後・93-j。home では読まない） | `63f439a1` | 20261109-bundle93-j | 文章品質・プロンプト | `v292DfixKN1Off` |
| 386 | fixLORE1 | `v292DfixLORE1-world-lore.js` | index の最後（KN1 の後・93-l。home では読まない） | `34c9217d` | 20261110-bundle93-l | 文章品質・プロンプト | `v292DfixLORE1Off`（ON は鍵 `lore1` か `v292DfixLORE1On`。既定は影モード） |
| 387 | fixAGENCY1 | `v292DfixAGENCY1-player-intent.js` | index：fix192 の直後（93-m。home では読まない） | `0079579c` | 20261110-agency1c | 文章品質・プロンプト | `v292DfixAGENCY1Off`・`v292DfixAGENCY1StoryOff`・`v292DfixAGENCY1StoryMode`（ON は鍵 `agency1` か `v292DfixAGENCY1On`。既定は影） |
| 388 | fixNH1 | `v292DfixNH1-nonhuman.js` | index：LC1 の直前（ICONX1。home では読まない） | `96ac383f` | 20261111-iconfix1（ICONQ1。前は NH1b・GitHub `589d720`／ICONX1・`9e1e17b`） | アイコン・画像 | `v292DfixNH1Off` `v292DfixNH1bOff`（ON は鍵 `nh1`。行なし OFF） `v292DfixICONFIX1bOff` `v292DfixICONFIX1cOff`（c は表示だけ） |
| 389 | fixREAD1 | `v292DfixREAD1-scene-consistency.js` | index（READ1・GitHub `93bcfd0`） | `a8dc06b1` | 20261110-read1a | 文章品質・プロンプト | `v292DfixREAD1Off`・`v292DfixREAD1On`（ON は鍵 `read1` か `v292DfixREAD1On`。既定は影） |
| 390 | fixUI2 | `v292DfixUI2-readability.js` | index・home の最後（`</body>` の直前。UI2・GitHub `2f04062`） | `b6c0953c` | 20261111-ui2b | UI・画面 | `v292DfixUI2Off` |
| 391 | fixPRUNE1 | `v292DfixPRUNE1-sys-prune.js` | index：CP1-final-tap の次（PRUNE2 の直後。home では読まない。PRUNE1・GitHub `a085c42`） | `789ab398` | 20261122-scene1 | 文章品質・プロンプト | `v292DfixPRUNE1Off`（kill。既定 ON） |
| 392 | fixPRUNE2 | `v292DfixPRUNE2-sys-prune2.js` | index：CP1-final-tap の直後・PRUNE1 の直前（home では読まない。PRUNE2・GitHub `b1e2a5d`） | `254f46dd` | 20261111-prune2 | 文章品質・プロンプト | `v292DfixPRUNE2Off` `v292DfixPRUNE2aOff` `v292DfixPRUNE2bOff` `v292DfixPRUNE2cOff`（kill。既定 ON は P2c だけ）`v292DfixPRUNE2aOn` `v292DfixPRUNE2bOn`（P2a・P2b を端末で ON） |
| 393 | fixGHOST1 | `v292DfixGHOST1-legacy-slot-ghost.js` | home：fix889 の直後（index では読まない。GHOST1・GitHub `98cf4bc`） | `cf49f461` | 20261111-ghost1 | シナリオ・ホーム | `v292DfixGHOST1Off`（kill。既定 ON） |
| 394 | fixKEY1 | `v292DfixKEY1-story-key.js` | index・home（KEY1・GitHub `e4d982e`） | `499b6c97` | 20261112-key1 | 保存・同期 | `v292DfixKEY1Off`（kill。既定 ON） |
| 395 | fixSOL1 | `v292DfixSOL1-story-open-lock.js` | index（KEY1 の直前。SOL1・`e4d982e`） | `4617f25e` | 20261112-store1b | 保存・同期 | `v292DfixSOL1Off`（kill。既定 ON） |
| 396 | fixSTORE1b | `v292DfixSTORE1b-device-free.js` | home：DL2 の直後（index では読まない。STORE1b・`a46c2f1`〜`72ab286`） | `963f7b82` | 20261122-allonb | 削除・墓標 | `v292DfixSTORE1Off` `v292DfixFREE2Off` `v292DfixSTUCK1On` `v292DfixZT1On` `v292DfixZT1DirtyOn`（既定 OFF） `v292DfixEXTRA1Off` `v292DfixDISCARD1Off` `v292DfixDISCARD2Off` `v292DfixAUTOCLEAN1On`（既定 OFF） `v292DfixAUTOCLEAN1Pace`（既定 OFF） `v292DfixAUTOCLEAN1Days`（r6 から効かない） `v292DfixVCLEAN1On`（既定 OFF） |
| 397 | fixACTOR1 | `v292DfixACTOR1-input-actor.js` | index：HEROVOICE1 の直後（ACTOR1・`5b8a837`） | `1bb474f0` | 20261114-hv1 | 文章品質・プロンプト | `v292DfixACTOR1Off` `v292DfixACTOR1aOff` `v292DfixACTOR1bOn`（既定 OFF） |
| 398 | fixLAT1 | `v292DfixLAT1-press-feedback.js` | index（LAT1・`f2b6d56`） | `43ec809d` | 20261112-lat1 | UI・画面 | `v292DfixLAT1Off` |
| 399 | fixUI3 | `v292DfixUI3-polish.js` | index（UI3・`f2b6d56`） | `17bf53cc` | 20261112-ui3a | UI・画面 | `v292DfixUI3Off` |
| 400 | fixSPK2 | `v292DfixSPK2-speaker-shadow.js` | index（SPK2・HB1・`b385f25`） | `228004e0` | 20261112-spk2hb1 | 話者・会話ログ | `v292DfixSPK2Off` `v292DfixSPK2Apply`（既定 OFF） |
| 401 | fixSEVDRV | `v292DfixSEVDRV-state-judge.js` | index（SEVERE1・DRIVE1・EX192・`ea768d0`） | `a51b8231` | 20261113-sev3 | NPC・キャラ状態 | `v292DfixSEVERE1On` `v292DfixDRIVE1On` `v292DfixEX192On`（どれも既定 OFF） |
| 402 | fixCAST1 | `v292DfixCAST1-opening-cast.js` | index（CAST1・`ea768d0`） | `e66d817b` | 20261113-cast1 | 文章品質・プロンプト | `v292DfixCAST1On`（既定 OFF） `v292DfixCAST1Off` |
| 403 | fixCALL1 | `v292DfixCALL1-confirmed-speech.js` | index（CALL1・SPK3・`ea768d0`） | `2afcbfc1` | 20261113-cast1 | 文章品質・プロンプト | `v292DfixCALL1On` `v292DfixSPK3On`（既定 OFF） |
| 404 | fixLEAK1 | `v292DfixLEAK1-nonstory-lines.js` | index（LEAK1・`d24bbd5`〜`3ec9d68`） | `2f503c00` | 20261117-leak3r3 | 文章品質・プロンプト | `v292DfixLEAK1Off` `v292DfixLEAK1ApplyOff` `v292DfixLEAK1JkvOff` `v292DfixLEAK1OptOff`（適用は既定 ON） |
| 417 | fixLEAK3 | `v292DfixLEAK3-internal-lines.js` | index：LEAK1 の直後（LEAK3） | `e6691dd7` | 20261117-leak3r3 | 文章品質・プロンプト | `v292DfixLEAK3On`（既定 OFF） `v292DfixLEAK3Off` |
| 418 | fixHOLD2 | `v292DfixHOLD2-mat-hold-rescue.js` | index：fix827 の直後・home：DL2 の直後（HOLD2） | `f162e415` | 20261121-hold2 | 保存・同期 | `v292DfixHOLD2Off` `v292DfixHOLD2bOff` |
| 405 | fixNUM1 | `v292DfixNUM1-input-ledger.js` | index（NUM1・`d24bbd5`・`7338a53`） | `62478e1a` | 20261113-num2 | 文章品質・プロンプト | `v292DfixNUM1On`（既定 OFF） `v292DfixNUM1Off` |
| 406 | fixERRNOTE1 | `v292DfixERRNOTE1-send-error-note.js` | index（ERRNOTE1・`4f0f2b1`・`248cc36`） | `bc96a1c8` | retry2-a | UI・画面 | `v292DfixERRNOTE1Off` |
| 407 | fixHEROVOICE1 | `v292DfixHEROVOICE1-hero-voice.js` | index：ACTOR1 の直前（HEROVOICE1・`747a505`・`85b3be2`） | `e6a8736f` | 20261114-hv1b | 文章品質・プロンプト | `v292DfixHEROVOICE1Off` `v292DfixHEROVOICE1Force` |
| 408 | fixOWNERON1 | `v292DfixOWNERON1-owner-defaults.js` | index（OWNERON1・`2b3271e`） | `691cfe89` | 20261122-allonb-mem | 認証・アカウント | `v292DfixOWNERON1Off` |
| 409 | fixPLACE1 | `v292DfixPLACE1-where-now.js` | index（PLACE1・`f35a302`〜`3c57fc3`） | `8a30e3cd` | 20261122-scene1 | 文章品質・プロンプト | `v292DfixPLACE1On`（既定 OFF・Owner は OWNERON1 で ON） `v292DfixPLACE1Off` `v292DfixPLACE1R5Off` `v292DfixPLACE1R6Off` `v292DfixPLACE1R7Off` `v292DfixPLACE1R8Off` |
| 410 | fixRETRY2 | `v292DfixRETRY2-send-policy.js` | index：fix80 の直前（RETRY2・`248cc36`） | `5343838b` | retry2-a | 生成の中心 | `v292DfixRETRY2Off` `v292DfixRETRY2CmfOn` `v292DfixRETRY2IdOn` |
| 411 | fixHOLDNOTE1 | `v292DfixHOLDNOTE1-hold-note.js` | index：ERRNOTE1 の直前（HOLDNOTE1） | `095d6225` | 20261115-holdnote1 | UI・画面 | `v292DfixHOLDNOTE1Off` |
| 412 | fixSTORYSIZE1 | `v292DfixSTORYSIZE1-story-size.js` | index：HOLDNOTE1 の直前（STORYSIZE1） | `73784d56` | 20261115-storysize1 | 保存・同期 | `v292DfixSTORYSIZE1Off` |
| 413 | fixHOLDNOTE2 | `v292DfixHOLDNOTE2-hold-kinds.js` | index：HOLDNOTE1 の直前（HOLDNOTE2） | `f0af0083` | 20261116-holdnote2 | UI・画面 | `v292DfixHOLDNOTE2Off` |
| 413 | fixPRUNE3 | `v292DfixPRUNE3-sys-prune3.js` | index の先頭近く（HEROVOICE1 の後。PRUNE3・`e5d5d30`） | `ee3d8b9e` | 20261115-prune3 | 文章品質・プロンプト | `v292DfixPRUNE3On`（実験・既定 OFF） `v292DfixPRUNE3Off` `v292DfixPRUNE3Parts` |
| 414 | fixHDRNL1 | `v292DfixHDRNL1-sys-header-newline.js` | index の先頭近く（PRUNE3 の直前。HDRNL1・`e5d5d30`） | `ecbc38cc` | 20261115-hdrnl1 | 文章品質・プロンプト | `v292DfixHDRNL1Off`（kill。既定 ON） |
| 415 | fixCONTRACT1 | `v292DfixCONTRACT1-scene-contract.js` | index の先頭近く（HEROVOICE1 の直後。CONTRACT1・`9e585fb`） | `336de67d` | 20261122-acct1r3 | 文章品質・プロンプト | `v292DfixCONTRACT1On`（実験・既定 OFF） `v292DfixCONTRACT1Off` |
| 416 | fixGEN1 | `v292DfixGEN1-gen-budget.js` | index：fix228 の直後（GEN1） | `9769f4f2` | 20261116-gen1r4 | 保存・同期 | `v292DfixGEN1On`（既定 OFF） `v292DfixGEN1Off` |
| 419 | fixRESTYLE1 | `v292DfixRESTYLE1-preset-redo.js` | index：fg3 の直後（RESTYLE1・既定 ON（restyle1on）） | `552d4981` | 20261122-nocost1 | アイコン・画像 | `v292DfixRESTYLE1Off` |
| 420 | fixVAULTGATE2 | `v292DfixVAULTGATE2-vault-open.js` | index：fix889 の直後（VAULTGATE2・既定 ON・r2: 部品が無いと呼ぶ側が止める／読み直しの後退） | `3c1b3a56` | 20261122-vaultgate2r2 | Vault・非表示 | `v292DfixVAULTGATE2Off` |
| 421 | fixSCENE1 | `v292DfixSCENE1-cast-presence-input.js` | index：fix192 の直後（SCENE1・GPT #127-WN 優先2・既定 OFF。11-11 の laneSCENE1〔NOW1 等〕とは別） | `57b9f16c` | 20261122-scene1r8 | 生成の中心・プロンプト | `v292DfixSCENE1On`（a・c は既定 OFF・r7 から b は全員の既定 ON） `v292DfixSCENE1Off` `v292DfixSCENE1aOff` `v292DfixSCENE1bOff` `v292DfixSCENE1cOff` |
| 422 | fixMEM4R | `v292DfixMEM4R-rebuild.js` | index：長期記憶の部品の後（MEM4R・11-22） | `8df0898d` | 20261122-mem4r-exp1 | 長期記憶 | 既定 ON（長期記憶が ON の人だけ働く） kill `v292DfixMEM4ROff`。印の無い古い記憶・空の記憶を、その物語の保存済みの本文から 12 ターン刻みで作り直す（1 物語・1 端末につき 1 回）。Vault は VAULTGATE2 の認可があるときだけ。出荷 11-22・実機は未確認 |
| 423 | fixEXP1 | `v292DfixEXP1-experience.js` | index：長期記憶の部品の後（EXP1 の E1・11-22・GPT #127-WR 裁定 5） | `823c6236` | 20261122-memfix1 | 長期記憶 | 既定 ON（長期記憶が ON の人だけ働く） kill `v292DfixEXP1Off`。要約の AI への指示の人物欄に「経験・習得」を 1 項目足し、4 段階（教わった／初めてできた／身についた／できなかった）で覚え書きに残す。型の検査で本文に無い習得を捨てる。1 人 3 件まで。出荷 11-22・実 AI と実機は未確認。r6（11-22）＝文字の一致をやめ、登場・言い切り・主語の条件で検査（実物の応答の再生で作り話 0） |
| 424 | fixMEMFIX1 | `v292DfixMEMFIX1-longmem-robust.js` | index：長期記憶の部品の後（MEMFIX1・11-22） | `933e4d8e` | 20261122-memfix1 | 長期記憶 | 既定 ON（長期記憶が ON の人だけ働く） kill `v292DfixMEMFIX1Off`。要約の応答が途中で切れて壊れたとき、読めた分を回収して先へ進む（2 回失敗で max_tokens を上げて 1 回・次は範囲を半分・5 回目で飛ばす）。summary の長さを形で指示し 800 字の内側で切る。実 AI の壊れた応答 4 回の再生で確認・実機は未確認 |
| 425 | fixSPKCHK1 | `v292DfixSPKCHK1-speaker-check.js` | index：fix620 の後（SPKCHK1・11-22・GPT #127-WR 裁定 2 の範囲） | `079637f9` | 20261123-read1 | 話者・会話ログ | **全員 既定 ON（11-23・90321bd）**・kill `v292DfixSPKCHK1Off`（`v292DfixSPKCHK1On` はもう不要）。AI の明示の名札が登録人物で、同じターンの本文に「話し手はその人ではない」強い根拠があるときだけ、名札を本文の呼び名へ替える（表示と話者の欄だけ・本文は不変）。実 AI の記録の再生で誤り 10 枚中 7 枚を直し・誤って替えた 0 枚（1,407 枚）。実 AI の比較 10 本（11-22）: 替えた札 1 枚（正しい）・誤って替えた 0 枚・ON でも直しきれない札は残る |
| 426 | fixREAD1abc | `v292DfixREAD1abc-readability.js` | index：PRUNE3 の前（READ1a/b/c・11-23・90321bd。fix192 の 4 か所・fix58 の 1 か所に呼び出し） | `376ef7ab` | 20261123-read1 | 文章品質・プロンプト | 3 つとも既定 OFF・鍵は別々（ON `v292DfixREAD1aOn`／`bOn`／`cOn`・kill `v292DfixREAD1aOff`／`bOff`／`cOff`）。a＝目的・未解決に古さの印、直近 2 ターンに同じ問いを出していたら渡さない／b＝送信の直前に sys の「場面転換しない」系の文言を置き換える／c＝「いまの場面」の 1 行（sceneNow）を出す。11-10 の READ1（場面の一貫性・行 389）とは別物。Local 試験のみ・実 AI の比較はこれから |
| 427 | NAMING1（新しいファイルなし） | `v292Dfix277-…`（ptDiag の前にブロック）・`v292Dfix620-speaker-apply.js`（SPKCHK1 の行の直後に 1 行） | —（11-23・90321bd） | — | 20261123-read1 | 話者・会話ログ | 既定 OFF（ON `v292DfixNAMING1On`・kill `v292DfixNAMING1Off`）。新しい人物が自分の台詞で名乗ったときだけ、それまでの呼び名と名前を 1 人に結ぶ（同じターンと直前のターンまで・登録済みの人物には結ばない）。実 AI の比較（11-23・各 3 本）: 1 人 1 行 OFF 0/3・ON 2/3、ただし ON の 1 本で登録人物へ誤結合（AI が新しい人物に登録名を名乗らせた）。**r2（20261123-nameown1）**: 名乗った名前が登録人物の完全名・姓・名・別名と重なるときは結ばない。本物の判定での意地悪な例 37/37・誤結合の実記録の再生で吸収が止まる。r2 の実 AI 比較（11-23・16 本）: 誤結合 0・登録名と重なる名乗り 6/6 で結ばず・人の名乗りは 6/6 で 1 人 1 行（人外の名前「白」などは結ばれないことがある）。**20261123-memspk1 から全員 既定 ON**（kill `v292DfixNAMING1Off`） |
| 428 | NAMEOWN1（新しいファイルなし） | `v292Dfix459-sys-v2.js`（【話者】の 1 文） | —（11-23） | — | 20261123-nameown1 | 文章品質・プロンプト | 既定 OFF（ON `v292DfixNAMEOWN1On`・kill `v292DfixNAMEOWN1Off`）。「名前の無い存在は呼び名のまま・新しい呼び名を作らない」を「名乗るまでこの呼び名で呼ぶ。名前を聞かれたら、登録キャラとは別のその人自身の名前を名乗らせてよい」に替える（+25 字・禁止文は増やさない）。狙い = AI が新しい人物に登録人物の名前を名乗らせるのを減らす。実 AI の比較（11-23・16 本）: 登録名を名乗った本数 OFF 3/8・ON 3/8 で減らず（全部、未登場の登録人物と設定が重なる型）。退行は無し。＝OFF のまま |
| 429 | fixMEMSPK1 | `v292DfixMEMSPK1-memory-speaker.js`（fix135 の 2 か所に呼び出し） | index（11-23） | — | 20261123-memspk1 | 長期記憶 | 既定 OFF（ON `v292DfixMEMSPK1On`・区別の 1 句は別の鍵 `v292DfixMEMSPK1FactOn`・kill `v292DfixMEMSPK1Off` は両方を止める）。要約 AI へ渡す本文の台詞に、確かめられた話し手だけ名前を付ける（登録人物・SPKCHK1 の本人側の根拠・地の文に名前）。実記録 211 ターンで +0.9%。送信の経路と Vault の関門は今の要約と同じ。実 AI の比較（11-23・3 腕 × 3 本・15 ターン）: 発言者の入れ替わり・食い違う台詞の取り込みは 3 腕とも 0（この台本では差が出ず）。誤った札の話し手の固定 OFF 1・話し手 0。経験の種類の取り違え OFF 3 本・話し手 1 本。区別の 1 句は申告の地の事実化を減らす傾向（5 → 2）だが正しい経験が消えた本が 1。**20261123-unseen1 から話し手だけ 既定 ON**（長期記憶が ON の人）・区別の 1 句（`v292DfixMEMSPK1FactOn`）は OFF のまま |
| 430 | fixPLACE2 | `v292DfixPLACE2-hero-move.js`（PLACE1 の 3 か所・SCENE1 の読むだけの口） | index（11-23） | — | 20261123-memspk1 | 物語進行・場面 | 既定 OFF（ON `v292DfixPLACE2On`・kill `v292DfixPLACE2Off`）。主人公の移動を STORY の入力とそのターンの本文からも拾う／「一緒に・連れて＋移動」は主人公を含むなら同行（退出にしない）・分からないときは変えない。実記録の再生で遅れていた 2 ターンが本文と合う・過去の 84 本 480 ターンで差 0。実 AI の比較（11-23・18 本）: 同行の型で記録と本文の食い違い OFF 7 → ON 0・誤って人を「いない」にしたターン OFF 6 → ON 0・誤って場所を動かした 0。出ていく人の型には効かない（STORY 入力の退出を拾えない 6/6・DO「〜まで行く」で記録が先に進む、は別の抜け）。**20261123-unseen1 から全員 既定 ON**（kill `v292DfixPLACE2Off`） |
| 431 | fixUNSEEN1 | `v292DfixUNSEEN1-unseen-cast.js`（SCENE1 の appearance の引数 1 か所・fix379・fix377・fix459 に呼び出し） | index（11-23） | — | 20261123-unseen1 | 文章品質・プロンプト | 既定 OFF（ON `v292DfixUNSEEN1On`・kill `v292DfixUNSEEN1Off`・【話者】だけ外す `v292DfixUNSEEN1SpkOff`）。まだ本文に出ていない登録人物を、sys の【キャラ属性】【口調】【話者】で場にいる人と分けて渡す（見出し 1 つ・未登場の人の口調の例文は渡さない・+6〜39 字）。入力で登場させた回はその回に戻る。狙い = AI が設定の近い新しい人物を未登場の登録人物として書くのを減らす。限界: 姓だけの一致でも既出の扱いになる。実 AI の比較（11-23・3 腕 × 4 本）: 登録名を名乗った本数 OFF 3/3・UNSEEN1 1/3・UNSEEN1＋NAMEOWN1 3/3、札の枚数はほぼ同じ、来客が登録人物に置き換わる例は減らず＝効果ははっきりしない・**OFF のまま** |
| 432 | EXIT2（新しいファイルなし） | `v292DfixSCENE1-cast-presence-input.js`・`v292DfixPLACE1-where-now.js`・`v292DfixREAD1abc-readability.js` | —（11-23） | — | 20261123-exit2 | 物語進行・場面 | 3 つとも既定 OFF。(1a) `v292DfixSCENE1bR9On`（kill `…R9Off`）: 理由の節「〜を思い出し、」を回想と読まず、その後ろの退出を拾う。(1b) `v292DfixPLACE1ExitR9On`（kill `…ExitR9Off`）: STORY の「P へ下りていく・上がっていく」を退出に、戻り（顔を出す・中へ入った・隣に並んだ）を拾う。(2) `v292DfixPLACE1PendOn`（kill `…PendOff`）: 入力の次の回から、本文が途中と書いているときだけ「〜へ向かう途中」。実記録 15 本の流し直しで、いる・いないの食い違い 9/34 → 2/34、場所が本文より先 6/36 → 0/36。実 AI の比較（11-23・10 本）: 出ていく入力の回に「いない」と拾えた OFF 0/3・ON 3/3、出ていった人が戻る前に本文で居た・喋ったターン OFF 7・ON 0、戻る回に 3/3 で「いる」へ、退行 0。(2) は発動する回が無く未確認。**20261123-exit2on から (1a)(1b) を全員 既定 ON**・(2) は OFF のまま |
| 433 | fixVAULTUNI1 | `v292DfixVAULTUNI1-vault-unify.js`（LORE1・AGENCY1・KN1・DL2・GHOST1・HOLD2・STORE1b・GEN1 の判定の入口に 1 行ずつ・home.html に VAULTGATE2 を追加） | index・home（11-23・GPT #127-WR 裁定 3） | — | 20261123-vaultuni1 | Vault・安全 | **既定 OFF へ戻した（20261123-vaultuni1off・実機スモークで、隠していない自分の物語が空き容量シートに出ず 0 件・削除の判定の大半が保留になった＝退行。誤って消した事実は無い）**。ON は `v292DfixVAULTUNI1On`。以下は出荷時（8041dd2・既定 ON）の説明: kill `v292DfixVAULTUNI1Off`（8 か所とも前の判定に戻る・HOME で VAULTGATE2 を読まない）。Vault の判定が v1 だけだった 8 か所を VAULTGATE2 の共通判定へ。外部送信 3 か所は「隠していない」か「解錠中で本人」のときだけ（施錠・UNKNOWN・別アカウントは止める）。削除 5 か所は UNKNOWN の間は保留し、判定後に各部品の入口から確かめ直す。前の確かめ（v1・VDEL1・VAULTGUARD1）は全部残す。rig 16/16・独立レビュー「出荷してよい」（前に止まっていた削除が通る組み合わせなし）。既知の残り: DL2 は待ちの後にアカウントを読み直さない／STORE1b の保留後のやり直しは 24 時間の間隔で実際には走らない（安全側）／Vault 利用者は読み込み直後 CopyGate の返事まで LORE1・KN1 が飛ぶ／v1 で解錠した隠した物語は ISO1 が null のとき LORE1・KN1 が送る（v1 の解錠は QA 端末だけ）。実機は未確認 |
| 434 | VAULTUNI1 r2（新しいファイルなし） | `v292DfixVAULTUNI1-vault-unify.js`・`v292DfixDL2-server-delete.js`・`v292DfixSTORE1b-device-free.js` | index・home（11-23） | — | 20261123-free3 | Vault・安全 | 既定 OFF のまま（ON `v292DfixVAULTUNI1On`・kill `v292DfixVAULTUNI1Off`）。退行の原因 = VAULTGATE2 は vault2status の答えが 15 秒より新しいときだけ「隠していない」と答え、空き容量シートは約 600 本を待たずに 1 回で判定していた。直し: 判定の前に新しい答えを最大 8 秒待つ（ready）／DL2 は待ちの後にアカウントを読み直す／STORE1b の保留後のやり直しを 1 回だけ走らせる。rig（施錠中・削除済み 600 本・隠した 27 本・消せる 5 本）で r1 は 0 行・r2 と OFF は 5 行。実機（11-23・Owner PC・施錠中）: 空き容量シートの件数は OFF と同じ（4 件）・delHold 0・一覧の削除（「確認しています…」→ 約 1〜2 秒）と端末の削除が通る・HOME 放置 4 分の通信は OFF と同じ（52 回／分・ON は最初の 1 分に +1）。**20261123-vaultuni1on から全員 既定 ON**（kill `v292DfixVAULTUNI1Off`）。残り: LORE1・KN1 を ON にする前の ISO1 null の経路・読み込み直後の待ち |
| 435 | FREE3（新しいファイルなし） | `v292DfixSTORE1b-device-free.js`（空き容量シートの中） | home（11-23・GPT #127-WZ ①） | — | 20261123-free3 | 保存・削除 | 既定 OFF（ON `v292DfixFREE3On`・kill `v292DfixFREE3Off`・`v292DfixDISCARD1Off`／`v292DfixSTORE1Off` でも入らない）。公式の削除シートで一覧から消した物語のうち、未送信の印（DIRTY_LOCAL・fix697 の控え）が残って空き容量シートに出ない端末のデータを、別の欄「削除済みの端末データ・未送信の変更あり」に出し、利用者が承知して押したときだけ破棄する。同期の証明ではない（FREE2 の証明には書かない）。消す直前にアカウント・墓標の版・端末の印・別タブを確かめ直す。隠した物語・判定できない物語は出さない。自動の片づけには入れない。rig 20/20。r2（c7190c2）= 新しく作った物語から先に調べる（上限 20 本で新しい削除が隠れた）。実機（11-23・Owner PC）: 試験物語 7 本が欄に出て公式の手順で削除・キャンセルで鍵の数不変・消えたのは選んだ物語の分だけ・失敗 0・隠した物語は欄に 0・通常の「消せる物語」不変。スナップショットの鍵は残す作り。別アカウント・UNKNOWN の拒否は rig のみ。**20261123-free3on から全員 既定 ON**（kill `v292DfixFREE3Off`） |
| 436 | PROMOGENDER1（新しいファイルなし） | `v292Dfix379-wrap-keeper.js`（genderBlock） | —（11-23） | — | 20261123-promog1 | 文章品質・プロンプト | 既定 OFF（ON `v292DfixPROMOGENDER1On`・kill `v292DfixPROMOGENDER1Off`）。物語の途中で「NPC に昇格」した人物は gender が空のため、sys の【キャラ属性】に入らなかった（実 AI の記録: 登録後 5 ターン 0 回）。説明文にはっきりした語があるときだけ GENDER1 の inferFromText で性別を読み、【キャラ属性】の行にだけ足す（state は書かない）。狙い = 途中で登録した人物が AI に届かず、先にいる登録人物に役や名前が寄るのを減らす。実 AI（11-23・OFF／ON 各 4 本）: ON は登録の次の送信から 24/24 ターンで「名前=女性」が入る・OFF は 0・ほかの人物の項目は不変・state の gender は空のまま。する側・される側の逆転は 48 回中 1 回（ON・差は読めない）。**20261123-promog1on から全員 既定 ON**（kill `v292DfixPROMOGENDER1Off`）。【口調】に入るのが 3〜5 ターン遅れる件は別件で残る |
| 437 | NEWGATE1（新しいファイルなし） | `home.html`（newStory の入口） | home（11-23・GPT #127-WR 裁定 4・#127-WZ の順番 2） | — | 20261123-newgate1 | 保存・同期 | 既定 OFF（ON `v292DfixNEWGATE1On`・kill `v292DfixNEWGATE1Off`）。新しい物語を作る前に、CopyGate の effective が 'unknown'（Vault の状態を確かめられていない）なら読み直しを頼み、答えが届いてから作る。最大 8 秒で届かなければ作らず（一覧に足さない）「保存の準備を確認できませんでした…」を出し、もう一度押せる。関門の規則は変えない。狙い = 作成時の持ち主の印が断られ、作った物語が「開けません」になる経路（Local 3/3・古い短い id がある端末）を手前で止める。控えの復旧（裁定 4 の後半）は未着手。実機で確かめてから ON |
| 438 | PROMOVOICE1（新しいファイルなし） | `v292Dfix377-voice-anchor.js`（buildBlock） | —（11-23） | — | 20261123-promovoice1 | 文章品質・プロンプト | 既定 OFF（ON `v292DfixPROMOVOICE1On`・kill `v292DfixPROMOVOICE1Off`）。途中で「NPC に昇格」した人物は voice も gender も空で【口調】の行が出ず、昇格の前にあった未登録キャラの推定の行も登録した途端に消えていた（実 AI: 【口調】に入るまで 3〜5 ターン・入らない本もある）。昇格の前に貯めた推定（一人称が 2 回以上・または性別）か、説明文のはっきりした性別があるときだけ、既存と同じ書き方の 1 行を足す（state は書かない）。実 AI（11-23）: OFF は行なし・ON は登録の次の送信から行が出る（性別の書き方では「私」と「あたし」の揺れは止まらない）。**20261124-exp1pend から全員 既定 ON**（kill `v292DfixPROMOVOICE1Off`） |
| 439 | NAME1CH（新しいファイルなし） | `v292DfixSCENE1-cast-presence-input.js`（exitForms・戻りの形・入力の台詞の畳み）・`v292DfixEXP1-experience.js`（forms）・`v292DfixSPKCHK1-speaker-check.js`（formsOf） | —（11-23） | — | 20261123-name1ch | 物語進行・場面／長期記憶／話者 | 既定 OFF（ON `v292DfixNAME1CHOn`・kill `v292DfixNAME1CHOff`）。「姓 名」で名が 1 字の登録人物（裏京の 霧島 冴・渡瀬 紬・瀬名 律）は、名前の部分を 2 字以上に限っていたため、「冴は…去っていく」の退出・戻り、経験の主語、名札の照合で本人と読めなかった（実 AI 25 ターン: bExits 0・EXP1 kept 0/5・正しい名札 冴 を 女性 に替えた 1 枚）。空白で分けた 1 字の部分を、他の人物の名前に含まれない・直前が漢字でない・直後が助詞や敬称、のときだけ名前として読む。入力の中の台詞（「…。…」と告げ、去っていく）は台詞ごと畳んで主語を失わないようにする。実 AI（11-23・OFF／ON 各 2 本・10 ターン）: 入力の退出を拾えた 0/2 → 2/2・「この場にいない」の行が T4〜T5 に出る・SPKCHK1 の付け替え 0・誤った不在や「目の冴えた」の誤検出 0。残り: 主人公が移動すると不在の人を「戻った」と数える（前からの決まり）。**20261124-exp1pend から全員 既定 ON**（kill `v292DfixNAME1CHOff`） |
| 440 | EXP1 r8（新しいファイルなし） | `v292DfixEXP1-experience.js`（取り込みの入口） | —（11-24） | — | 20261124-exp1pend | 長期記憶 | 既定 OFF（ON `v292DfixEXP1PendOn`・kill `v292DfixEXP1PendOff`）。要約の応答を取り込む時点で Vault の答えが 15 秒より古いだけ（V2_PENDING・V2_CG_STALE・V2_INCOMPLETE）の回は、受けた経験を捨てていた（rej OFF_AT_MERGE・実 AI 2 本で 7 回）。頼んだ回に限り、この 3 つの理由のときは取り込む（外への送信は増えない）。隠した物語・施錠中・kill は今までどおり捨てる。実機（11-23・3 本）: 取り込みは答えが新しいうちに済み、r8 の枝は一度も通らず（OFF_AT_MERGE 0・PEND_KEPT_LIVE 0）。代わりに頼む側の穴を実測（依頼を組む時点で V2_PENDING → 経験を頼まずに要約だけ送る）。**r9（20261124-origin1on）**: 同じ鍵で頼む側も、答えが古いだけのときは働く（rej PEND_ASK_LIVE で数える）。なお NAME1CH ON の後、EXP1 の採用は 0 → 2〜4 件／本になった。実機（11-23・r9・3 本）: 依頼を組む時点で答えが古かった回が 1 回あり、経験の項目を付けて送り 1 件採用（PEND_ASK_LIVE）・OFF_AT_MERGE 0・誤った人物への保存 0。**20261124-exp1pendon から既定 ON**（長期記憶が ON の人・kill `v292DfixEXP1PendOff`）。残り: taught の項目が 24 字の上限（LONG）で落ち「誰に教わったか」が残らない／本文が入力と逆の役で書かれた回に入力の側を採用した 1 件／覚えていても AI の答えが従わない |
| 441 | ORIGIN1（新しいファイルなし） | `v292DfixSTORE1b-device-free.js`（ex1Cat） | home（11-24） | — | 20261124-exp1pend | 保存・削除 | 既定 OFF（ON `v292DfixORIGIN1On`・kill `v292DfixORIGIN1Off`）。筋書きから始めた物語の body.origin {scenarioId, scenarioRev} が「知らない欄」（proof-extra・top:unknown）と数えられ、削除済みでも端末の本体が空き容量に出なかった（実機 3 本）。この 2 つの欄だけ・文字か数だけの origin は通す。ほかの確かめ（hash の一致・cfg・cast.av2）は変えない。実機（11-23）: 鍵 ON で残っていた 3 本が通常の欄に出て（explain eligible true）公式の手順で削除・消えた鍵は 3 本の分だけ・ほかの 4 行は不変。**20261124-origin1on から全員 既定 ON**（kill `v292DfixORIGIN1Off`） |
| 442 | HMOVE1（新しいファイルなし） | `v292DfixSCENE1-cast-presence-input.js`（exited の heroMoved の枝） | —（11-24） | — | 20261124-hmove1 | 物語進行・場面 | 既定 OFF（ON `v292DfixHMOVE1On`・kill `v292DfixHMOVE1Off`）。主人公が移動しただけでは、出ていった人の退出を解かない（今までは解いて「戻った」と数え、次の回の前面の行にその人が入った・実 AI 4 本）。戻すのは今までの根拠（入力・台詞・本文の戻り・主人公と一緒・その場で動く）と 6 ターンの期限だけ。数える所 = status の bMovedKept（確かめた回数で増える）。実 AI（11-23・OFF／ON 各 2 本・9 ターン）: 主人公の移動の後、出ていった人が前面の行に入ったターン OFF 6/6・ON 0/6／「この場にいない」の行は ON で戻るまで続く／入力で戻った回は認識（bBackWhy input）／一緒に移動した人を不在にした 0／物語の停滞・エラー 0。GPT #127-XF ③ 修正 GO（同じ行き先でも同席は未確定）。**20261124-namews1 から全員 既定 ON**（kill `v292DfixHMOVE1Off`） |
| 443 | NAMEWS1（新しいファイルなし） | `v292Dfix277-quasi-pack.js`（aliasFix）・`v292Dfix145-charlist.js`（自動抽出の行の除外 2 か所） | —（11-24・Owner 報告） | — | 20261124-namews1 | 話者・会話ログ | 既定 OFF（ON `v292DfixNAMEWS1On`・kill `v292DfixNAMEWS1Off`）。登録名と、空白（半角・全角）・中黒・見えない文字の有無だけが違う名前を、登録名に読み替える（一致する登録名がちょうど 1 つのときだけ）。狙い = 途中で登録した人物が、会話ログでアイコンなしになり、キャラ一覧で登録済みと自動抽出の 2 行に分かれる（Owner 報告「桜田ほのか」）。原因（実機で再現・11-23）: 登録名とまったく同じ名前で登録しても、その後 AI の名札や要約の worldinfo が「姓 名」（空白あり・筋書きの登場人物の書き方）に寄り、登録名（空白なし）と 1 字（U+0020）違う名前が生まれる → キャラ一覧の wiByName の道で自動抽出の行が増える。鍵 ON で 1 行・空白ありの名札は登録名に読み替わる・冴などほかの名前は読み替えない。**20261124-namews1on から全員 既定 ON**（kill `v292DfixNAMEWS1Off`）。r2（鍵 `v292DfixNAMEWS1StOn`・既定 OFF）= 人物の状態の行も登録名へまとめる（前面の行に同じ人が 2 回並ぶ件）。残り: 登録の前の回のカードは揃わない／正式呼称の一覧に両方の形が残る |
| 444 | fixSPKQ1 | `v292DfixSPKQ1-speaker-unknown.js`（`v292Dfix620-speaker-apply.js` に呼び出し 1 行・`v292DfixSPKCHK1-…` に部品の読み出し口 `_h`） | index：SPKCHK1 の直後（11-24・GPT #127-XH） | `9e6e1fcd` | 20261124-spkq1 | 話者・会話ログ | 既定 OFF（ON `v292DfixSPKQ1On`・kill `v292DfixSPKQ1Off`）。AI が札を付けなかった台詞（bare-inferred / harvest）のうち、本文と矛盾する札だけを直す: C1 台詞の中で札の人を呼んでいる → ???／C2 別の人の名乗り → ???／C3 同じ文の主語が別の人（「Y は「…」と聞いた」）→ 登録人物なら Y へ・未登録なら ???／C4 直後が「X は頷いただけ」で前に X が居ない → ???／効果音（「カチッ」という音）・口に出していない「」（「…」とは口に出さず）→ カードから外す。本文は変えない・AI の札／主人公の入力／人手の訂正は触らない。測定（保存済みの実 AI 出力 684 枚）: 「根拠が無ければ ???」の案は 258 枚（38%）が ??? になり、読んだ範囲でその約 9 割が正しい札だった → 不採用。矛盾だけに絞った r1 は 9 枚を直し、読んで 9 枚とも正しい直し（誤り 0）。実機（11-24・実 AI 10 ターン）: meta は毎回あり・1 枚を ??? に直して正しい・10 秒後も再読み込み後も戻らない・errors 0（この回は AI がほぼ全部に札を付け、対象のカードは 3 枚だけ）。**20261124-spkq1on から全員 既定 ON**（kill `v292DfixSPKQ1Off`）。カードを外す道（効果音・口に出していない「」）だけは実機で試せていないので別の鍵 `v292DfixSPKQ1DropOn`・既定 OFF。r2（20261124-spkq1c3・GPT #127-XI (b)）: C3 は「と聞いた」が問いの台詞のときだけ・受け身（と言われた）と聴取（という声・が聞こえた）は数えない。r3（20261124-spkq1r3）: 今日の実 AI の取り違え 3 件から 2 つの形を追加 = C3b 同じ段落で直前の文の主語が Y・直後が主語なしの「とだけ答えて…」→ Y へ／C5 台詞が相手への促し（やってみて・どうぞ・〜してください）で直後に X がその動作を始める → ???。保存済みの実 AI 出力 1,055 枚（235 ターン）への当て直し: 新しく変わるのは狙った 2 枚だけ・誤った直し 0・失う直し 0。残り: 矛盾の形に当たらない誤り（例: 問いかけの後に黙っている相手の札・店員の声かけに主人公の札）は残る |
| 445 | EXP1 r10（新しいファイルなし） | `v292DfixEXP1-experience.js` | —（11-24・GPT #127-XF） | — | 20261124-spkq1on | 長期記憶 | 既定 OFF（ON `v292DfixEXP1r10On`・kill `v292DfixEXP1r10Off`）。(1) taught の句だけ 40 字まで（誰から・何を、が 24 字に入らず LONG で落ちていた）(2) 入力の行ではその人がやったのに地の文では別の登録人物がやっている件は覚えない（A2_ACTOR_CONFLICT）(3) 覚え書きの節を起きた順の 1 行 1 件「T3｜紬：律から…を教わった（習得は不明）」に（節の上限 200 字）。実 AI 比較（11-24・OFF 2 本／ON 2 本）: ON でも残った経験は 0 件・「誰に教わったの」の正答は OFF 1/2・ON 0/2 → r10 だけでは効かない（原因は次の行） |
| 446 | EXP1 r11（新しいファイルなし） | `v292DfixEXP1-experience.js`（forms・setCanon） | —（11-24・実機の診断） | — | 20261124-exp1r11 | 長期記憶 | 既定 OFF（ON `v292DfixEXP1NameOn`・kill `v292DfixEXP1NameOff`）。根本原因: 要約 AI は人物の項目名を空白なし（「渡瀬紬」）で返すが、登録名は「渡瀬 紬」。空白なしの 3 字の名前からは「瀬紬」しか作れず、本文の「紬は…」に当たらないので、その人の経験が NOT_SUBJECT・NOT_TAUGHT・NOT_IN_TEXT で全部落ちていた（実機 4 本の診断で全件が空白なしの名前）。直し: 登録名と空白・中黒を除いて同じ項目名は、登録名の形（名字・名前）でも本文を探す（一致する登録名がちょうど 1 つのときだけ）。実機の診断に残った要約 AI の返事と同じ本文での当て直し: 鍵なし 残り 0 件（実機と同じ）→ 鍵 ON で 2〜3 件（紬の taught・first、冴の first。読んで全部正しい）・r10 も ON で 25 字の taught も残る。実 AI 2 本（11-24・r10 + r11 の鍵 ON）: 要約 AI がこの回は空白ありで返したので r11 の枝は通らず（nameCanon 0・害なし）。名前が合った回は経験が 3 件・4 件残った（OFF の基準は 2 件・0 件）＝名前の形が原因という見立てと合う。24 字を超える taught 2 件が 40 字の枠で残った。誤り 1 件（冴の first「炊くのを手伝った」）は r10・r11 と別の道（A2）。**20261124-exp1r11on から r10・r11 とも全員 既定 ON**（kill `v292DfixEXP1r10Off`・`v292DfixEXP1NameOff`）。残り: 覚え書きに「律から教わった」が入っていても、本編の AI が「誰に教わったの」に別の答え（前職で覚えた）を作る回がある（2 本で 正答 0.5／誤り 1）＝次の原因調べ |
| 447 | EXP1 r12（新しいファイルなし） | `v292DfixEXP1-experience.js`（addTo） | —（11-24・実機 題材_1） | — | 20261124-exp1r12 | 長期記憶 | 既定 OFF（ON `v292DfixEXP1TaughtKeepOn`・kill `v292DfixEXP1TaughtKeepOff`）。taught（律から…を教わった）と first／learned（一人でできた）が同じ漢字の重なりで同じ件と見なされ、段階の高い方が taught を上書きして「誰から教わったか」が消えていた（実機: 判定 KEPT なのに worldinfo に残らず、送信の経験の節に入らなかった）。taught と first／learned は別の事実として両方残す・満杯でも taught を押し出さない。実 AI 4 本で消えた件 0 → **20261124-r13on から全員 既定 ON**（kill `v292DfixEXP1TaughtKeepOff`） |
| 448 | EXP1 r13（新しいファイルなし） | `v292DfixEXP1-experience.js`（fgLine）・`v292Dfix333-actor-reality.js`（呼び出し 1 行） | sys：【この一手で前面に出す人物】の直後（11-24・GPT #127-XJ 条件付き GO） | — | 20261124-exp1r13 | 長期記憶・sys | 既定 OFF（ON `v292DfixEXP1FgOn`・kill `v292DfixEXP1FgOff`）。前面に出す人物に経験の記録があるとき「【物語内で確認された経験】渡瀬 紬＝T2 律から…を教わった（習得未確認）／T3 …（初めて成功）。」を 1 行（1 人 2 件・全体 160 字・禁止文なし）。門は EXP1 と同じ。背景: 実 AI 2 本で、送信に「律から教わった」が 3 か所あっても紬は設定の前職へ話を寄せた（正答 1/4）。既存の覚え書きの節はそのまま（追加方式）。実 AI 2 対 2（11-24）: 「誰に教わった／前から触った／今できそう／別人物」の正答 OFF 3/8 → ON 7/8（うち「誰に」「前から」は 0/4 → 4/4）・経験の作り話 OFF 5 → ON 1・蒸し返し OFF 1・ON 2（比喩の形）・行は 69〜119 字 → **20261124-r13on から全員 既定 ON**（kill `v292DfixEXP1FgOff`・GPT #127-XK (d)）。残り: TAUGHT_TO で回った句に教えた人の名前が付かない（次の作り直しで直る）／本数は 2 対 2 |
| 451 | EXP1 r14（新しいファイルなし） | `v292DfixEXP1-experience.js`（merge の TAUGHT_TO） | —（11-24・実機 2 本） | — | 20261124-exp1r14 | 長期記憶 | 既定 OFF（ON `v292DfixEXP1TaughtFromOn`・kill `v292DfixEXP1TaughtFromOff`）。教えた側に付いた taught を教わった側へ回すとき、句に教えた人の名前を入れる（「フィルムの入れ方」→「律からフィルムの入れ方を教わった」・40 字を超えるなら入れない）。実機の確認の前 |
| 452 | VICON1 全員 ON（新しいファイルなし） | `v292DfixSTARTICON-start-icons.js`（VICON1_DEFAULT_ON = true） | —（11-24 深夜・GPT #127-XD ①／XH のやり直し） | — | 20261124-vicon1on | Vault・アイコン | 隠した物語でも、Vault が解錠中でその物語が開かれているときは自動アイコンを作る（登録済みの人物 = STARTICON／途中の未登録の人物 = MIDICON の MXVAULT1。どちらもこの 1 つの既定値に従う）。kill `v292DfixVICON1Off`。前提: Worker の env `CHR_MX_VAULT_ON=1`（GET /api/ の mxVaultV1 = 1）。実機（Owner PC・合成の物語 2 本）: 登録済み 2 人に 1 枚ずつ（外見の文は送らない）／未登録の船大工に mx_ensure 200 で 1 枚（外見の欄は見た目の語だけ・目印なし・作り直しなし・重複なし）／施錠の後は portrait.list・mx_list・asset.get が 404・生成の要求 0・物語のページは自分でホームへ移る。未確認: 昇格（PROMOICON1）・iPhone からの隠す／施錠（B2）・施錠後の物語の画面の見え方 |
| 453 | RD0（新しいファイルなし） | `v292Dfix325-state-rederive.js`（取消／やり直しの包み） | —（11-25・実機 4 本目の発見） | — | 20261125-rd0 | 保存・状態 | 取消／やり直しが何もせず戻ったとき（ターン 0）と、新しい物語の保存の準備中は、状態の再導出（persist）をしない。準備より先に通常の同期がサーバーへ行を作るのを防ぐ。11-25 実機 PASS（retry / undo とも preparing で見送り・保存待ちにならず・canonical）→ **既定 ON**（20261125-rd0on。止め `v292DfixRD0Off`）。観測口 `__v292Dfix325rd0()` |
| 454 | PREPHOLD2（新しいファイルなし） | `v292Dbav2-beta.js` | —（11-25・実機 GATE_QA2 の発見） | — | 20261125-prephold2 | 保存・送信 | ホームから開き直した「まだ昇格していない物語」で fix756 が走っている間（running／CopyGate 待ち）も、覆いと送信の止めを掛ける。PREPARE_HOLD で終わったら失敗の案内。準備の待ちが 15 秒を超えたら覆いに「ホームへ戻る」。**既定 OFF**（`v292DfixPREPHOLD2On`='1'）。観測口 `__v292Dbav2.p2()`。r2（20261125-prephold2r2）: 完了から読み込み直しまでの間も止めたまま（20 秒で外す）・止めている間は送信ボタンを「保存準備中…」に 。**11-25 実機 PASS → 既定 ON（20261125-prephold2on。止め `v292DfixPREPHOLD2Off`）。同じ版で PREPHOLD1 の処理側の関門も既定 ON（止め `v292DfixPREPHOLD1GateOff`。GPT #127-XO の 3 条件を実機で確認）** |
| 455 | BOOTERR1（index.html の先頭のインライン） | `index.html` | 最初の script の前 | — | 20261125-prephold2r2 | 診断 | 読み込み時の例外・script の読み込み失敗を、タブの sessionStorage `v292DbootErr` に最大 20 件控える（ファイル名・行・メッセージ先頭 120 字）。既定 ON・止め `v292DfixBOOTERR1Off`。読む口 `__v292DbootErr()`。11-25 の「新しい物語で fix750／fix756 が動き出さず時間切れ」（1/7・原因未特定）の次回の証拠用 |
| 456 | EXP1 r15（新しいファイルなし） | `v292DfixEXP1-experience.js` | —（11-25・実 AI 1 本 試験_R14_1125 の発見） | — | 20261125-exp1r15 | 記憶 | (a) 教えた側（主人公でない登録人物）の「…に…を教えた」を教わった側へ回す（回せなければ残さない）＋教えた人の名前を句に入れる（r14 と同じ）(b) 同じ件の判定を、頭の「登録名＋から／に／と／の」と末尾の「教わった／教えた」を外した中身で行う（別の題材が 1 件に潰れない）(c) 逆向きの教えも教わった側の経験になる。11-25 実 AI 1 本で確認 → **既定 ON**（20261125-exp1r15on。止め `v292DfixEXP1TeachRouteOff`）。r14 の鍵（`v292DfixEXP1TaughtFromOn`）は不要になった（r15 が同じ名前入れを行う） |
| 457 | TAGX2・DRAFT1・r15b・BOOTERR1 の絞り（新しいファイルなし） | `v292DfixLEAK1-nonstory-lines.js`・`v292Dbav2-beta.js`・`v292DfixEXP1-experience.js`・`index.html` | —（11-25・GPT #127-XP） | — | 20261125-tagx2 | 本文・送信・記憶・診断 | TAGX2: 山括弧の外れた react／state の行の判定で、who= の登録名の空白（「渡瀬 紬」）と欄名「fromだ=」を扱う（既定 ON・止め `v292DfixLEAK1Tagx2Off`）。DRAFT1: 準備の止めの間にページを離れるとき入力欄の文をタブに控え、同じ物語で戻す（**既定 OFF**・`v292DfixDRAFT1On`。隠した物語では控えない）。r15b: 頭の登録名が別の人なら同じ中身でも別の件。BOOTERR1: メッセージは ASCII だけ・20 字以上の英数の並びは伏せる |
| 458 | PREPHOLD3・DRAFT1 r2（新しいファイルなし） | `v292Dbav2-beta.js` | —（11-25・実機の時系列計測） | — | 20261125-prephold3 | 送信 | PREPHOLD3: fix756 が分類待ち（waiting）の間、覆いなしで送信だけ止める（読み込みから 12 秒まで）。未昇格の物語を開き直した直後に約 350ms 押せた隙間を塞ぐ。**既定 OFF**（`v292DfixPREPHOLD3On`）。DRAFT1 r2（既定 OFF のまま）: 戻すとき Vault の答えが出るまで待つ（読み込み直後 1〜9 秒は hidden() が true のため、r1 は読んで消して戻さなかった） 。**PREPHOLD3 は 11-25 実機のうえ既定 ON（20261125-prephold3on。止め `v292DfixPREPHOLD3Off`）**。DRAFT1 r3（既定 OFF のまま）: 止めの有無に関係なくページを離れるときに控える 。**DRAFT1 は 11-25 実機（r3）のうえ既定 ON（20261125-draft1on。止め `v292DfixDRAFT1Off`）** |
| 459 | REDO1（新しいファイルなし） | `v292DfixLEAK1-nonstory-lines.js` | —（11-25・GPT #127-XP e） | — | 20261125-redo1 | 本文 | 本文の途中の「（誤出力回避：本文のみ）」のような、出力についての括弧だけの行と、その後ろ（同じ場面の書き直し）を落とす。印の語は 誤出力／再出力／出力し直／出力をやり直／本文のみ だけ。印より前に 150 字以上あるときだけ。実測は 1 件（試験_R15 T3）。**20261125-redo1s: GPT #127-XQ の HOLD を受けて既定は数えるだけ（影）に戻した。落とすのは `v292DfixLEAK1RedoOn`='1' のときだけ**（既定 ON で本番に出ていたのは 11-25 18:06〜18:35 ごろ） |
| 460 | SPKQ1 r4 IN1（新しいファイルなし） | `v292DfixSPKQ1-speaker-unknown.js` | —（11-25・評価用の実 AI 試験_R14 T10） | — | 20261125-spkq1r4 | 話者 | プレイヤーが入力で言わせた台詞（『…』「…」の中、SAY なら入力の全体・6 字以上）と同じ文のカードは主人公の台詞にする。AI の札が呼びかけた相手になっていても替える。「紬が『…』と言う」のように他の人に言わせる入力は対象外。既定 ON・止め `v292DfixSPKQ1InOff`。r4b（20261125-spkq1r4b）: r4 は「紬が蓮に『…』と言う」で紬の台詞を主人公に替えた（実 AI で発見・約 20 分 本番に出ていた）。引用の前が「（主人公＋が／は）＋（相手＋に／へ）」か空のときだけ対象に絞った。r4c（20261125-redo1s・GPT #127-XQ）: 替えるのは 1 ターンに 1 枚だけ・主人公のカードがもうその台詞を持っていれば替えない（復唱）・本文が別の登録人物を話し手と明記していれば替えない |
| 461 | STARTPICK1（新しいファイルなし） | `v292Dfix825-scenario-ui.js`・`v292DfixSTARTICON-start-icons.js`・`v292DfixB37-onboard.js` | —（11-25・Owner の希望） | — | 20261125-startpick1 | アイコン | シナリオから物語を始める直前に、絵を作る人を選ぶ欄（全員／なし／1 人ずつ）。選んだ人だけ STARTICON が作る（選びがある物語では 主人公 1＋NPC 3 の上限を使わない。アカウントの上限の行・Worker の守りはそのまま）。選んだ物語ではキャラ一覧を自動で開かない。11-25 実機（2 人 → 2 枚・約 131 秒／なし → 0 枚／全員 5 人 → 5 枚・約 232 秒）→ **既定 ON**（20261125-startpick1on。止め `v292DfixSTARTPICK1Off`）。欄を出すのはアカウントの鍵 starticon1 が ON のときだけ（fix893 の flagsSnap を読む）。費用の文言は出さない（トークンの行は場所だけ）。スマホ幅の見た目は未確認。r2（20261125-startpick1r2・GPT #127-XR）: 初めての端末は「主人公＋NPC の先頭 3 人」にチェック（今までの自動と同じ枚数）、以後は前回の選び方（全員／なし／主な人）。r3（20261125-startpick1r3）: アカウントの答え（/auth/me）がまだ届いていないだけのときは最長 3 秒待ってから欄の判定をする（Owner の iPhone で欄が出ずに始まった件への備え・原因は未確定）。同じ版で、上流の 402 の案内文を「一時的に使えません」に変更（GPT #127-XT・残高切れと断定しない。自動停止と 10 分の待ちは変えない） |
| 462 | SENTFIX1（新しいファイルなし） | `v292DfixSTARTICON-start-icons.js` | —（11-25・実機 試験_PICK2） | — | 20261125-sentfix1 | アイコン | 絵を作っている途中でページを読み込み直す／離れると、そのとき応答待ちだった 1 人が 'SENT' のまま残り絵が付かない。残った 'SENT' を IN_FLIGHT と同じ扱い（125 秒待つ → サーバーに絵があれば何も送らない → 無ければ 1 回だけ送り直す）にする。**既定 OFF**（`v292DfixSTARTICONSentRetryOn`='1'）。GPT #127-XS 条件付き GO。r2（20261125-sentfix1r2）: 実機で待ちが 125 秒でなく約 88 秒だった（93-j の 40 秒の上限が掛かっていた）→ 残った SENT には上限を使わない。r3（20261125-sentfix1r3）: 待ちの途中でもう 1 回読み込み直すと B_TRIES（読み込み 2 回まで）で止まった → 鍵 ON のとき読み込みの上限を「2＋対象の人数（最大 12）」に（1 人あたりの要求は最大 2 回のまま）。**11-25 実機のうえ既定 ON（20261125-sentfix1on。止め `v292DfixSTARTICONSentRetryOff`）**。送り直しの後に残りの人まで作り切る所は、提供元の残高切れで未確認 |
| 449 | NEWGATE2（新しいファイルなし） | `v292Dfix756-new-story-schema2.js`（bootPoll） | —（11-24・実機の詰まり 1 本） | — | 20261124-newgate2 | 保存・Vault | 全員 ON（11-24 夕・kill `v292DfixNEWGATE2Off`）。新しい物語の最初の準備（run）は控えを最初に書く。その瞬間に CopyGate の答えが 'unknown' だと控えが断られ（SecurityError）SNAPSHOT_CREATE_FAILED → PREPARE_HOLD。run はタブごとに 1 回きりなので、物語がクラウドへ確定せず削除もできなくなる。ON: 'unknown' の間は run を始めずに待ち続ける（r2・GPT #127-XK: 15 秒で諦めて run する仕様は不採用。run の「タブごと 1 回」を使わない・15 秒を超えたら「保存の準備を確認しています…」を表示・届いたら run）。実機 r1（9 本）: 待ちは 1 回働き 1.5 秒で run → CLEAN。実機 r2（試験用の口で unknown を延ばす）: 5 秒 → 4.5 秒待って run・CLEAN／25 秒 → 15 秒で表示・25 秒で消えて run・CLEAN／通常 2 本・鍵なし 1 本 CLEAN。待ちの間、run の実行の印は 0。600 秒（回復しない）→ run は始まらず表示が続く。その間に 1 ターン打つと通常の保存は届いた（CLEAN・rev 1）が「物語の準備ができませんでした（CLIENT_TIMEOUT）」が出て、開き直しても run は走らない（SERVER_ROW_PRESENT ＝ schema2 の準備を経ない物語として残る・本文は残る）。**20261124-newgate2on から全員 既定 ON**（kill `v292DfixNEWGATE2Off`）。未確認: 既に PREPARE_HOLD で詰まった物語の立て直し・待機中のアカウント切替。関門の規則・保存の手順は変えない。OFF でも unknown のまま run した回数だけ数える（`__v292Dfix756.ng2()`）。GPT の裁定の前・実機の確認の前 |
| 450 | PREPHOLD1（新しいファイルなし） | `v292Dbav2-beta.js`（fail・wrapG・sendState） | —（11-24・実機 試験用の物語） | — | 20261124-prephold1 | 保存 | 全員 ON（11-24 夜・kill `v292DfixPREPHOLD1Off`）。新しい物語の準備（schema2 への昇格）が失敗・時間切れ（60 秒）になった後、送信の門と送信ボタンが解除されていた（意図は「止めたまま」）。そのまま 1 ターン送ると通常の保存で shadow の行ができ、開き直した後は fix756 = SERVER_ROW_PRESENT・fix756r = NOT_FIX750_ORIGIN で昇格せず、BOOTSTRAP_CONTENT_DIVERGENCE で以後の保存が止まる（実機で再現・T2 が DIRTY_LOCAL のまま）。ON: 失敗の後も送信を止めたままにし、案内を「保存の準備がまだ終わっていません…送信を止めています。ホームへ戻って、もう一度開いてください」に。実機 r1（F1）: ボタンは止まったが、入力欄の Enter で送信が通った（G.submit が後から差し替えられ、wrapG の門を通らない）→ r2（20261124-prephold1r2）: capture の段で Enter と送信まわりのクリックを止める（fix892 と同じ作法・準備中と失敗後）。実機 r2: 準備中（32 秒）と失敗後（82 秒）の Enter で送信 0 回（ターン 0・生成の要求 0）・ホームへ戻って開き直すと run → canonical schema2・CLEAN・通常の新しい物語は覆いが消えて Enter が止められない・鍵なしは従来どおり。**20261124-prephold1on から全員 既定 ON**（kill `v292DfixPREPHOLD1Off`・GPT #127-XM・案内文は GPT の推奨文）。r3（20261124-prephold1g・GPT #127-XN (a)）: 処理側の関門を追加 = index.html の G.submit・cont・retry の入口で `__v292Dbav2.sendHeld()` を見て、準備中・失敗後は処理を始めない（retry は巻き戻しの前で止める）。capture の段の止めは二重の守りとして残す。Local: 門の関数の検査 PASS・index.html の該当スクリプトの構文検査 PASS。処理側の関門だけ既定 OFF（鍵 `v292DfixPREPHOLD1GateOn`・kill `v292DfixPREPHOLD1GateOff`）→ 実機確認 → ON。未確認: 60 秒の時間切れ直後に古い準備が完了した場合／準備が終わる直前の短い案内 |
| 422 | fixACCT1 | `v292DfixACCT1-owner-account-trial.js` | index：OWNERON1 の直後（ACCT1・GPT #127-WN 優先3・#127-WP） | `a5569f25` | 20261122-allonb-mem | 認証・アカウント | `v292DfixACCT1Off` `v292DfixACCT1MemOff` `v292DfixACCT1Scene1bOff` |

## 付録B　ファイルはあるが読み込まれていないもの（＝本番で動いていない）

| ファイル | 状態 | sha256先頭 | メモ |
|---|---|---|---|
| `v292Dfix52-readability.js` | index.html でコメントアウト → 2026-11-15 の CLEANUP3 でコメントの行も外した（4408 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix62-avatar-fix.js` | index.html でコメントアウト（4419 行目付近） | `d6c08a38` | 廃止扱い。ファイルは残っている |
| `v292Dfix64-conversation-log-restore.js` | index.html でコメントアウト → 2026-11-15 の CLEANUP3 でコメントの行も外した（4423 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix70b-order-convsays.js` | index.html でコメントアウト → 2026-11-15 の CLEANUP3 でコメントの行も外した（4439 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix73-card-dedup.js` | index.html でコメントアウト → 2026-11-15 の CLEANUP3 でコメントの行も外した（4439 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix86-avatar-eager-blob.js` | index.html でコメントアウト → 2026-11-15 の CLEANUP3 でコメントの行も外した（4453 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix89-convlog-cleanup.js` | index.html でコメントアウト → 2026-11-15 の CLEANUP3 でコメントの行も外した（4455 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `worker_r4_prod.js` | どこからも読まれない（コメントの中で行番号として言及されるだけ） | `b6f9b3ab` | 旧 Worker のソースの写し。**本番では配信されていない**（2026-11-01 の本番確認で、無いパスと同じ index の応答だった）。手元の配信物の写しにだけ入っている。GPT #127-QO：次の Pages の束で消す。92-a で消そうとしたが、環境の権限で GitHub の削除が拒否された（台帳 2236）。**93-c のコミット `9ef9cd0` の追跡ファイルには無い**（クローンで確認。いつ・どの出荷で消えたかは台帳の 2232〜2250 の抜粋では未確認） |

- **読み込みを止めた 32 本**（CLEANUP1・CLEANUP2。2026-11-11）：ファイルは GitHub に残っているが、`index.html` が読み込まない＝本番で動いていない。付録 A に「読み込み停止」と書いた行のまま残してあり、一覧と理由は §2.12。
- このほか：`scripts.txt`（345 行の古い読込一覧。**現行の読込順ではない**）は本番で実際に配信されている（GitHub のルートにもある）。削除予定（近日、単独のコミットで消す）。`_PROVENANCE.txt` は手元の写しにだけあり、本番では配信されていない。どちらも HTML・JS・Worker から参照されていない。
- 手元の配信物の写し（`pages_full.zip`）は、2026-10-15 に本番をブラウザで取得して組み直した木（prod5、348 本）を土台にしている。上の HTML の写し 6 本・旧 Worker の写し・`_PROVENANCE.txt` はその時から入っている。出荷では変わったファイルだけを GitHub に上げるので、これらは GitHub にも本番にも無い。

### inline script（ファイルではなく HTML の中に直接書かれた部品）

- index.html：10 個（81-admg-a の行番号。80-int-a と同じ行。字数は 332 行目と 1010 行目が変わった。83-flow-c でも行・字数は同じ）。[48行目・11748字] [332行目・1233字] [554行目・id=v292DfixEDN-btn・881字] [567行目・id=v292Dfix890-early・3002字] [754行目・13800字] [1010行目・305字（おまかせのボタンを ADMF1 の `oma1` で出す）] [1034行目・153999字] [3414行目・id=v100-patch・35064字] [4165行目・9509字] [4520行目・38字]
  - 2026-11-11 の CLEANUP2（C2a）で `id=v292Dfix890-early` の inline（匿名のお試しのとき、ログインの板を先に隠す）を外した。今の `index.html` の inline は 9 個（上の行番号・字数は 81-admg-a のもので、抽出し直していない）。home.html は 3 個のまま。
- home.html：3 個。[251行目・1196字] [277行目・749字] [420行目・162047字]
  - index.html の主なもの：1034 行目（約 15 万字）＝ゲーム本体の中核（S・UI・G・保存）、3414 行目 `v100-patch`、554 行目 `v292DfixEDN-btn`（✎ の位置）、567 行目 `v292Dfix890-early`。
## 付録C　スイッチ（localStorage キー）→ それを読む部品（機械抽出）

- 本番で読み込まれる部品と index.html の中に現れる `v292…Off` / `v292…On` の文字列を全部拾ったもの（729 件：Off 657・On 72。93-a で `v292DfixMIDICONOff`、93-d で `v292DfixISO1Off`、93-f で `v292Dfix414WidenOff`・`v292Dfix192LicOff`、93-g で `v292DfixBOOTOFF1Off`・`v292DfixSETUI1Off`・`v292DfixNEWACCT1Off`、93-h で `v292DfixHOMERETRY1Off`・`v292DfixMIDICONrosOff`・`v292DfixIDSPLIT2Off`・`v292DfixGENDER1Off`、93-i で `v292DfixMIDICONregOff`・`v292DfixSTARTICONOff`、11-10 夜に `v292DfixAGENCY1StoryOff`・`v292DfixAGENCY1StoryMode`・`v292DfixSEEDWORLD1Off`・`v292DfixSEEDNPC1dOff`・`v292DfixSPBASE1Off` を手で足した（11-11 に（FLOW3 で `v292DfixFACTS1Off`・`v292DfixCONT1Off`・`v292DfixCLICHE2Off`・`v292DfixDEDUPQ1Off` の 4 件も足した）`v292DfixSTATEAGE1Off`・`v292DfixFRZ1Off`（FLOW2）・`v292DfixRESCUE1Off`・`v292DfixNH1bOff`・`v292DfixSPBASE2Off`、続けて `v292DfixDELALLOff`・`v292DfixSAVEUIOff`・`v292DfixSAVEUIGateOff`・`v292DfixSAVEUIAdoptOff`・`v292DfixSEEDHERO1Off`・`v292DfixSEEDNPC1eOff`・`v292DfixSCID1Off` を足した）。86 で `v292DfixIMGSAFEOff`・`v292Dfix315On` の 2 件を手で足した。71-a で拾った 697 件に、80-int-a の新しい 9 件を手で足した）。 11-11 夜〜11-12 に、`v292DfixPRUNE1Off`・`v292DfixPRUNE2Off`（と `aOff`・`aOn`・`bOff`・`bOn`・`cOff`）・`v292DfixUI2Off`・`v292DfixNOW1Off`・`v292DfixFACTS2Off`・`v292DfixSTATE2Off`・`v292DfixF333aOff`・`v292DfixF333bOff`・`v292DfixGHOST1Off`・`v292DfixSCID2Off`・`v292DfixICONFIX1aOff`・`bOff`・`cOff` の 18 件を手で足し、CLEANUP1・CLEANUP2 で読み込みを止めた 32 本だけが読んでいたキーの行を外した（外した部品は、残る行の「読む部品」から消した）。上の件数は抽出し直していない。
- 拾っただけなので、**そのキーが実際にどう効くか（全体停止か一部か、既定 ON/OFF のどちらを切り替えるか）は部品のコードで確かめてください**。名前が `Off` で終わらない停止キー（例 `v292SlotGenOff`・`v292EngineUnifyOff`・`v292GoogleLoginOff`）や値で切り替えるキー（例 `v292Dfix333`=`observe`）は一部しか拾えていません。
- 「読む部品」は id（`fix77` など。fix 以外はファイル名）。index.html は inline の中を含む。

- `v292AgendaOff` — fix192
- `v292AiInstrOff` — fix297
- `v292AliasOff` — fix277, fix830, index.html
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
- `v292Dfix313Off` — fix313
- `v292Dfix314Off` — fix314
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
- `v292Dfix338Off` — fix338
- `v292Dfix346Off` — fix346
- `v292Dfix351dOff` — fix351
- `v292Dfix351Off` — fix351
- `v292Dfix352Off` — fix352
- `v292Dfix353Off` — fix353
- `v292Dfix354Off` — fix354
- `v292Dfix355Off` — fix355
- `v292Dfix356EagerOff` — fix356
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
- `v292Dfix424Off` — fix197
- `v292Dfix425Off` — fix192, fix416, fix417
- `v292Dfix427Off` — fix427
- `v292Dfix427TailOff` — fix427
- `v292Dfix429Off` — fix338
- `v292Dfix430Off` — fix430
- `v292Dfix436Off` — fix436
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
- `v292Dfix461Off` — fix338
- `v292Dfix462Off` — fix462
- `v292Dfix463Off` — fix463
- `v292Dfix464Off` — fix464
- `v292Dfix465Off` — fix465
- `v292Dfix466Off` — fix466
- `v292Dfix467Off` — fix467
- `v292Dfix469DropOn` — fix469
- `v292Dfix469Off` — fix376, fix462, fix469
- `v292Dfix469TagGuardOff` — fix469
- `v292Dfix469ToneFlipOff` — fix469
- `v292Dfix471Off` — fix475
- `v292Dfix471On` — fix475
- `v292Dfix472Off` — fix472
- `v292Dfix475Off` — fix475
- `v292Dfix477Off` — fix477
- `v292Dfix480Off` — fix197
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
- `v292Dfix492Off` — fix492
- `v292Dfix493Off` — fix197
- `v292Dfix504Off` — fix80
- `v292Dfix509Off` — fix509
- `v292Dfix510Off` — fix510
- `v292Dfix512Off` — fix512
- `v292Dfix514Off` — fix514
- `v292Dfix516Off` — fix516
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
- `v292Dfix779Off` — fix766
- `v292Dfix781bOff` — fix697, fix781
- `v292Dfix781cOff` — fix697, fix781
- `v292Dfix781Off` — fix705, fix781, fixSFL1
- `v292Dfix783Off` — fix228, fix246, fix277, fix297, fix298, fix317, fix318, fix374, fix382, fix384, fix395, fix409, fix445, fix458, fix469, fix489, fix54, fix620, fix640, fix66, fix766, index.html
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
- `v292Dfix837Off` — fix247, fix328, fix336, fix399, fix400, fix402, fix519, fix523, fix633, fix634, fix658, fix697, fix698, fix700, fix702, fix705, fix872
- `v292Dfix838Off` — fix697, fix705
- `v292Dfix840Off` — fix705
- `v292Dfix841Off` — fix247, fix336, fix705
- `v292Dfix842Off` — fix697, fix729
- `v292Dfix843Off` — fix843
- `v292Dfix844Off` — fix844
- `v292Dfix844On` — fix844
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
- `v292DfixAGENCY1Off` — fixAGENCY1, fix192（93-m から。SAY/DO の 1 文を止める・記録もしない）
- `v292DfixAGENCY1On` — fixAGENCY1（93-m から。端末だけ足す・試験用。管理者画面の `agency1` が ON なら不要）
- `v292DfixAGENCY1StoryMode` — fixAGENCY1（AGENCY1b から。'B' のとき STORY の文が版 B〔短いひと言〕。既定 A）
- `v292DfixAGENCY1StoryOff` — fixAGENCY1, fix192（AGENCY1b から。STORY・続き・オートの腕だけ止める）
- `v292DfixF333aOff` — fix850（F333a。【身体状態・正史】の写しから、人違い・物違いの語を外さない＝従来どおり）
- `v292DfixF333bOff` — fix850（F333b。振り分けと外し方を F333a のままにする）
- `v292DfixFACTS2Off` — fix58（FACTS2。earlierFacts を FACTS1 の作り方に戻す）
- `v292DfixFRZ1Off` — fix414（FRZ1・FLOW2 から。けが無しの「動かない」も脚の走行不可にする従来の判定に戻す。人違いの防止も止まる）
- `v292DfixGHOST1Off` — fixGHOST1（GHOST1。ホームの一覧から旧スロットの空行を外さない・サーバーも読まない）
- `v292DfixICONFIX1aOff` — fixLC1（ICONQ1 の a。外見の下書き・性別・文章 AI への依頼文を従来どおりに。11-01 の Worker の ICONFIX1 とは別件）
- `v292DfixICONFIX1bOff` — fixNH1（ICONQ1 の b。人外の下書きを従来どおりに）
- `v292DfixICONFIX1cOff` — fixNH1（ICONQ1 の c。Worker だけの構図なので、端末では状態の表示が変わるだけ）
- `v292DfixNOW1Off` — fix58, fix192（NOW1。nowScene と現在地の名札を足さない＝送信バイト同一）
- `v292DfixPRUNE1Off` — fixPRUNE1（PRUNE1。最終 sys を整理しない＝送信バイト同一）
- `v292DfixPRUNE2aOff` — fixPRUNE2（P2a を当てない）
- `v292DfixPRUNE2aOn` — fixPRUNE2（P2a 話者・書式を端末で ON。既定は OFF）
- `v292DfixPRUNE2bOff` — fixPRUNE2（P2b を当てない）
- `v292DfixPRUNE2bOn` — fixPRUNE2（P2b 見本と種を端末で ON。既定は OFF）
- `v292DfixPRUNE2cOff` — fixPRUNE2（P2c user 側を当てない。P2c だけ既定 ON）
- `v292DfixPRUNE2Off` — fixPRUNE2（PRUNE2。P2a・P2b・P2c の全部を当てない＝送信バイト同一）
- `v292DfixSCID2Off` — fix820（SCID2。部分一致を見る範囲を従来どおりキー全体にし、乱数 id の文字も除かない）
- `v292DfixSEEDNPC1Off` — fix873（SEEDNPC1。手で追記：「いっしょに出る人」の 1 行を人ごとに分ける処理だけ止め、93-i と同じ動きに戻す）
- `v292DfixACTOR1Off` — fixACTOR1（11-12。ACTOR1 を全部止める＝送信バイト同一）
- `v292DfixACTOR1aOff` — fixACTOR1（(a) 入力の主体の行だけ止める）
- `v292DfixACTOR1aStoryOn` — fixACTOR1（(a) の STORY の腕を端末で ON。既定 OFF）
- `v292DfixACTOR1bOn` / `v292DfixACTOR1bOff` — fixACTOR1（(b) 台詞の無い回の 1 行。既定 OFF）
- `v292DfixCARD80Off` — index.html, fix58（CARD80。会話カードを従来の 80 字に）
- `v292DfixCAST1On` / `v292DfixCAST1Off` / `v292DfixCAST1CountOff` — fixCAST1（既定 OFF）
- `v292DfixCALL1On` / `v292DfixCALL1Off` / `v292DfixSPK3On` / `v292DfixSPK3Off` — fixCALL1（既定 OFF）
- `v292DfixDRIVE1On` / `v292DfixDRIVE1Off` / `v292DfixEX192On` / `v292DfixEX192Off` / `v292DfixSEVERE1On` / `v292DfixSEVERE1Off` — fixSEVDRV（既定 OFF）
- `v292DfixERRNOTE1Off` — fixERRNOTE1（送信失敗の知らせを従来の 60 秒で消える方だけに）
- `v292DfixHOLDNOTE1Off` — fixHOLDNOTE1（保存停止の知らせを出さない＝従来どおり画面に何も出ない）
- `v292DfixHOLDNOTE2Off` — fixHOLDNOTE2（状態ごとの保存停止の知らせを出さない＝従来どおり）
- `v292DfixSTORYSIZE1Off` — fixSTORYSIZE1（物語の大きさを測らない・止めない・知らせない＝従来どおり）
- `v292DfixGEN1On` / `v292DfixGEN1Off` — fixGEN1（On で __gen_ の予算を有効にする。Off は dryRun も含めて何もしない）
- `v292DfixGEN1cOn` / `v292DfixGEN1cOff` — fixSTORE1b, fix562（GEN1 (c)。On は既定 OFF で、AUTOCLEAN1 も On のときだけ削除済みの物語の `__gen_` を捨てる。Off が優先）
- `v292DfixF850OrdOff` — fix850（F850Ord。読み込みの順の待ちをしない）
- `v292Dfix850AOff` — fix850（FIX850A。腕・手の負傷でない動作も従来どおり制約の材料にする）
- `v292DfixFANOUT1Off` — features, fix80（FANOUT1。土台の同時送信・上限なしの出し直し）
- `v292DfixFF1aOff` / `v292DfixFF1bOff` — index.html（FF1。parsePlan の保護を外す）
- `v292DfixFREE2Off` / `v292DfixFREE2dOff` — fixDL2, fixSTORE1b（FREE2c から既定 ON。`v292DfixFREE2On` は読まない）
- `v292DfixGC1Off` — fix912（GC1・GC1b。保存中の「続きを書く」を預からない）
- `v292DfixGUIDE1Off` — fix873（GUIDE1。世界観の欄の案内を出さない）
- `v292DfixHEROVOICE1Off` / `v292DfixHEROVOICE1Force` — fixHEROVOICE1（Off は常に C・欄も出さない。Force は試験用の上書き）
- `v292DfixICONFIX2aOff` / `v292DfixICONFIX2bOff` — fixLC1, fixNH1, fixSTARTICON（ICONFIX2 a・b）
- `v292DfixICONFIX2cOff` / `v292DfixICONFIX2tOff` — fixSTARTICON（ICONFIX2 c・t）
- `v292DfixICONFIX3Off` — fixLC1, fixSTARTICON（ICONFIX3。今までとバイト一致）
- `v292DfixKANA1Off` — index.html（KANA1）
- `v292DfixKEY1Off` — fixKEY1（各呼び出し側が従来の部分一致）
- `v292DfixLAT1Off` — fixLAT1
- `v292DfixLEAK1Off` / `v292DfixLEAK1ApplyOff` / `v292DfixLEAK1JkvOff` / `v292DfixLEAK1OptOff` — fixLEAK1（適用は 11-14 から既定 ON）
- `v292DfixLIM1Off` — fixADMF1, fixSTARTICON（LIM1。上限を部品の定数に戻す）
- `v292DfixLSF1Off` — fix697（LSF1）
- `v292DfixMXREGFIX1Off` — fixMIDICON（MXREGFIX1）
- `v292DfixNUM1On` / `v292DfixNUM1Off` — fixNUM1（既定 OFF）
- `v292DfixACCT1Off` / `v292DfixACCT1MemOff` / `v292DfixACCT1Scene1bOff` — fixACCT1、fixMEM2、fix135、fixSCENE1（Owner のアカウントの試し ON。Off が常に勝つ。r3 で出荷前の鍵 `v292DfixACCT1Scene1bOn` は読まなくなった）
- `v292DfixOWNERON1Off` — fixOWNERON1（Owner の既定 ON を全部やめる）
- `v292DfixP0BOff` — fix569, fix562（P0-B。既定 ON）
- `v292DfixPH1Off` / `v292DfixSREP1Off` — fix77, fix192, fix405, features（STATEQ1）
- `v292DfixPLACE1On` / `v292DfixPLACE1Off` / `v292DfixPLACE1NarrOff` / `v292DfixPLACE1Absent` / `v292DfixPLACE1R5Off` / `v292DfixPLACE1R6Off` / `v292DfixPLACE1R7Off` / `v292DfixPLACE1R8Off` — fixPLACE1, fix192（R7Off は fix192 の状態欄も。既定 OFF・Owner は OWNERON1 で ON。`v292DfixPLACE1Absent` は試験用・'A' は不採用で撤去候補）
- `v292DfixPOSE1Off` / `v292DfixPOSE1bOff` — fix851（STATEQ1 の POSE1）
- `v292DfixPURGE1On` / `v292DfixPURGE1Off` / `v292DfixPURGE1VaultOn` — fixSTORE1b, fix562（PURGE1。既定 OFF）
- `v292DfixREG1Off` — av2, fix912（REG1）
- `v292DfixRETRY1Off` — fix80（RETRY1）
- `v292DfixRETRY2Off` / `v292DfixRETRY2CmfOn` / `v292DfixRETRY2IdOn` — fixRETRY2（RETRY2 は既定 ON。Cmf・Id は既定 OFF）
- `v292DfixSD1Off` — fixDL2（SD1。`v292DfixSD1On` は読まない）
- `v292DfixSOL1Off` — fixSOL1
- `v292DfixSPK2Off` / `v292DfixSPK2Apply` — fixSPK2（適用は既定 OFF）
- `v292DfixSPKW1On` / `v292DfixSPKW1Off` — index.html, fix303, fix469, fixOWNERON1（SPKW1・SPKW2。既定 OFF・Owner は ON）
- `v292DfixSTATE3Off` — fix192, fix414（STATE3）
- `v292DfixSTATE4Off` / `v292DfixSTATE4BOff` — fix77, fix192（STATE4・ST4B）
- `v292DfixFEAR1Off` / `v292DfixFEAR2Off` / `v292DfixFEAR2On` / `v292DfixFEAR2R2Off` / `v292DfixARM2Off` / `v292DfixCHEAD1Off` — fix414（FEAR2 は r2 から既定 ON。FEAR2On は既定を OFF に戻したときだけ意味がある）
- `v292DfixQUOTE1Off` — index.html（QUOTE1。SPKW1 と同じ範囲で効く）
- `v292DfixBEAT2aOn` / `v292DfixBEAT2bOn` / `v292DfixBEAT2Off` — fix459（BEAT2。実験・既定 OFF）
- `v292DfixPRUNE3On` / `v292DfixPRUNE3Off` / `v292DfixPRUNE3Parts` — fixPRUNE3（実験・既定 OFF）
- `v292DfixHDRNL1Off` — fixHDRNL1（既定 ON）
- `v292DfixCONTRACT1On` / `v292DfixCONTRACT1Off` — fixCONTRACT1（実験・既定 OFF）
- `v292DfixDISCARD2Off` — fixSTORE1b, fix562（DISCARD2。手動専用）
- `v292DfixAUTOCLEAN1On` / `v292DfixAUTOCLEAN1Off` — fixSTORE1b（AUTOCLEAN1。既定 OFF・端末の鍵）
- `v292DfixHEROACT1On` / `v292DfixHEROACT1Off` / `v292DfixHEROACT1Log` — fixHEROACT1（既定 OFF・数えるだけ。入力に無い主人公の発話・行動を short／decision／unclear に分けて件数とターン番号だけ記録。本文を書き換えず sys にも何も足さない。GPT #127-VB 2）
- `v292DfixLIM1bOff` — fixSTARTICON（LIM1b・既定 ON の kill。昇格の絵も物語単位の同じ枠で数える。既存の絵の再利用は数えない。GPT #127-VB 4b）
- `v292DfixBILL1cOff` — fixSTARTICON, fixMIDICON, av2-data（BILL1c・既定 ON の kill。Worker v46.51 の PROVIDER_AUTH_FAILED／PROVIDER_BALANCE_EXHAUSTED を受けたら自動の絵の要求を 10 分止める〔メモリだけ・読み直しで解ける・手動の生成は止めない〕。BILL1c2＝知らせは「閉じる」まで残る帯を 1 回だけ・文言は端末が持ち残高不足と断定しない。GPT #127-VB 3・#127-VF 2）
- `v292DfixMXSHORT1On` / `v292DfixMXSHORT1Off` — （撤去・コードは読まない。MXSHORT1 は実験 CLOSED・端末側を撤去（GPT #127-VJ 1）。Worker 側の short_tail／CHR_MXSHORT1_ON は別便）
- `v292DfixLEAK1TagxOff` — fixLEAK1（TAGX1・既定 ON の kill。行頭が react／state＋who=＋別の欄名= の内部書式の行だけを本文から除く。GPT #127-VB 2(3)）
- `v292DfixLEAK3On` / `v292DfixLEAK3Off` — fixLEAK3（On で sys 見出しの復唱・内部 JSON の断片の行を取り除く。既定は数えるだけ。Off は数えることも止める）
- `v292DfixALIAS1On` / `v292DfixALIAS1Off` / `v292DfixALIAS1_v1` — （撤去・コードは読まない。ALIAS1 は実験 CLOSED・撤去（GPT #127-VJ 1）。端末に残る `v292DfixALIAS1_v1` の記録は読む部品が無い孤児の鍵。消す処理は入れていない）
- `v292DfixPACE1aOn` / `v292DfixPACE1bOn` / `v292DfixPACE1Off` — （撤去・コードは読まない。PACE1a/b は不採用・撤去（GPT #127-VB 1））
- `v292DfixTMPICON1On` / `v292DfixTMPICON1Off` — av2-portrait（TMPICON1・既定 OFF。絵が無い未登録の話者に、費用 0 の仮アイコン〔顔の無い胸像・呼び名から決まる色・頭の 1 字・「仮」の印〕を表示だけで付ける。生成・Worker への要求・保存なし。外見や性別を設定へ書かない。正式な絵ができたら自動で置き換わる。GPT #127-VH 2）
- `v292DfixITEM2On` / `v292DfixITEM2Off` / `v292DfixITEM2_v1` — （撤去・コードは読まない。ITEM2 は不採用・CLOSED・撤去（GPT #127-VP 2）。端末に残る `v292DfixITEM2_v1` の記録は読む部品が無い孤児の鍵。消す処理は入れていない）
- `v292DfixVDEL1Off` — fixDL2（VDEL1・既定 ON の修正の kill。GPT #127-VB 6 の先に塞げる部分: 一般の削除シートは、Vault v2 を解錠中でも v2 で隠した物語を SD1 の getstory より前で断る〔vault2status の hiddenIds をシートを開くときと送る直前に読む・分からなければ断る〕。'1' で従来の動き）
- `v292DfixVAULTGUARD1Off` — fixSTORE1b（VAULTGUARD1。既定 ON の修正の kill。'1' で、Vault v2 解錠中の隠した物語を通常の getstory 照合から外す守りを止める。VGUARD2〔GPT #127-VN 2〕: kill の端末でも、Vault v2 なしと確かめられなければ〔施錠中・解錠中・状態不明〕FREE2・AUTOCLEAN1・DISCARD1/2・GEN1c・STUCK1・PURGE1 の照合を `vaultguard-off-vault2` で休み、getstory もしない）
- `v292DfixMXALIAS1On` / `v292DfixMXALIAS1Off` — fixMIDICON, fix145（AUTOICON1 r2・MXALIAS1。既定 OFF・Owner PC 限定。総称名（例「老人」）と記述名を、出たターンが重なるときだけ同じ控えの絵で表示する。保存はしない。Off が優先）
- `v292DfixPROMOICON1On` / `v292DfixPROMOICON1Off` — fixSTARTICON, fixMIDICON（AUTOICON1 r2・PROMOICON1。既定 OFF・Owner PC 限定。NPC に昇格したとき、既存の控えの絵があれば写し、無ければ作る。控えの有無が不明なら作らない。推測の外見は確定設定に登録しない。アカウントの LIM1 より緩くならない。Off が優先）
- `v292DfixVCLEAN1On` / `v292DfixVCLEAN1Off` — fixSTORE1b（VCLEAN1。既定 OFF・Owner PC 限定。AUTOCLEAN1 の On と、HOME の Vault（v2）の解錠が要る。Off が優先）
- `v292DfixAUTOCLEAN1Days` — fixSTORE1b（r6 からどこにも効かない。日数を変えるのは dry-run の引数 `days` と、QA 操作の `qaDays`＋`ack` だけ。残っていても無害）
- `v292DfixAUTOCLEAN1Pace` — fixSTORE1b（AUTOCLEAN1 r4 の進みの見直し。既定 OFF。`a`／`b`／`1`。24 時間の getstory は 18 本まで。AUTOCLEAN1 の On と kill が先）
- `v292DfixEYE1Off` / `v292DfixLEG1Off` — fix414（EYE1・LEG1 r2。既定 ON）
- `v292DfixRW1Off` — fix459, fix465（RW1。既定 ON）
- `v292DfixAPPX1Off` — fixLC1, fixICONUX2（APPX1。既定 ON）
- `v292DfixHIDE2On` / `v292DfixHIDE2Off` — （撤去・コードは読まない。HIDE1・HIDE2 は不採用・撤去（2026-11-15・GPT #127-UL）。対策案としての HIDE1/HIDE2 を閉じただけで、秘密の先漏れの問題自体は未解決（実プレイで再現したら原因側から））
- `v292DfixDISCARD1Off` — fixSTORE1b, fix562（DISCARD1。手動専用）
- `v292DfixSTORE1Off` / `v292DfixSTORE1Multi` / `v292DfixSTORE1Dry` — fixSTORE1b
- `v292DfixSTUCK1On` / `v292DfixSTUCK1Off` / `v292DfixZT1On` / `v292DfixZT1Off` — fixSTORE1b（STUCK1・ZT1。既定 OFF。ZT1b〔GPT #127-VJ 3〕: ZT1 の証明は、hash に入らない本体の部分〔HY_CFG_ALLOW 外の cfg・本体の未知の鍵・cast.av2〕が空・既定値・コードが強制する値だけのときに限る。そうでなければ `zero-turn-extra` で残す）
- `v292DfixEXTRA1Off` — fixSTORE1b（EXTRA1・ZT1b r2。既定 ON の修正の kill。FREE2 の証明・STUCK1・FREE2c の墓標の hash で「一致」と判定した物語も、hash に入らない本体の部分〔HY_CFG_ALLOW 外の cfg・本体の未知の鍵・cast.av2〕が空・既定値・コードが強制する値でなければ `proof-extra` で残す。r3〔GPT #127-VL 1・案 ii〕: 0 ターンでない経路では、削除済みの物語だけの本文に関わらない設定〔provider・model・orModel・artStyle・aiAvatar・debug・showInner・simpleMode・_spiceT・キーは生きている物語が同じ値を持つ写しのときだけ〕を型と範囲を確かめて許す。r4: 写しを探す相手から Vault で隠した物語を VAULTGUARD1 の kill に関係なく外し〔vault2status の hiddenIds と fix889 の一覧〕、集合が分からなければ写しと認めない。読む相手は 1 回 20 本まで。r5〔SMOKE28〕: cast.av2 は、鍵 6 つ・sid・モード・bindings〔名前 → ch_ id〕・known / retired〔ch_ id ごと〕の形で、hash に入る cast の行と同じ写しのときだけ許す〔push が hash に入れる部分はそのまま〕。r6〔SMOKE29〕: 写しは cast の行の部分集合なら許す〔cast の行にだけある voice などの後から付いた欄は可・写しにだけある鍵や値の違いは残す〕。再登場の名前は push と同じ正規化で照合する。ZT1 は既定値だけ。'1' で従来の動き。ZT1 の証明は印が CLEAN でも class c と印を残す〔ZT1 OFF では無関係〕）
- `v292DfixZT1On`（ZT1c〔GPT #127-VP 1〕）— fixSTORE1b: ZT1 の hash 対象外の検査は、EXTRA1 r6 と同じ許可リスト〔型・置き場所・値の形・コードが入れる '__proxy__' など・BYOK は写しのときだけ・cast.av2 は部分集合の規則〕。外れは `zero-turn-extra`〔free2DryRun の zeroTurnExtra.byKey に理由の種類〕。ZT1d〔SMOKE33〕: 0 ターンの墓標で印が DIRTY の物語は、STUCK1・FREE2 の証明から来ても `v292DfixZT1DirtyOn` が無ければ `zero-turn-dirty` で外す。ZT1 は既定 OFF のまま
- `v292DfixZT1DirtyOn` — fixSTORE1b（ZT1b。既定 OFF。'1' のときだけ、印が DIRTY_INTENT / DIRTY_LOCAL の 0 ターンの物語を ZT1 の証明へ回す。無ければ今までどおり 'unsynced'）
- `v292DfixUI3Off` — fixUI3
- `v292DfixUI4aOff` / `v292DfixUI4bOff` / `v292DfixUI4cOff` / `v292DfixUI4dOff` — index.html, home.html, fixDL2, fix873 ほか（UI4）
- `v292Dfix880Off` — fix880, index.html
- `v292Dfix881Off` — fix881, index.html
- `v292Dfix884Off` — fix884, index.html
- `v292Dfix885Off` — fix885
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
- `v292DfixDELALLOff` — fix933（DELALL。その端末では削除を owner だけに戻す。Worker 側は env `CHR_DELETE2_ALL_OFF=1`）
- `v292Dfix934Off` — fix850
- `v292Dfix936Off` — fix851, fix852
- `v292Dfix938Off` — features, fix77
- `v292Dfix945EvtOff` — fix945
- `v292Dfix945Off` — fix945
- `v292Dfix945EarlyOff` — fix945
- `v292Dfix945GateOff` — fix945
- `v292Dfix945RescueOff` — fix945（退避を書かない。v2.6 から退避は既定 ON）
- `v292Dfix945RescueOn` — fix945（v2.5 までは退避を ON にする端末キー。v2.6〔RESCUEON〕から既定 ON なので、無くても ON）
- `v292DfixRESCUE1Off` — fixRESCUE1（RESCUE1。帯・掃除・書く口が無い＝SAVEGUARD1 と同じ）
- `v292Dfix946M3Off` — fix946, iso2
- `v292Dfix946Off` — fix946, iso2
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
- `v292DfixIMGSTOP1Off` — fix990（IMGSTOP1。4096 字を超える本文は従来どおり判定せず送る）
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
- `v292DfixBEAT1Off` — fix66（BEAT1。会話カードの添え書きを従来の拾い方に戻す）
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
- `v292DfixCLICHE2Off` — fix68, features（CLICHE2・FLOW3 から。13 種の言い回しを含む文を消す従来の処理に戻す）
- `v292DfixCONT1Off` — fix443（CONT1・FLOW3 から。「続きを書く」の 2 つの文を従来の文に戻す。送信バイト同一）
- `v292DfixCmfOff` — smrc1
- `v292DfixCP1Off` — fixCP1, fixSFL1
- `v292DfixCP1On` — fixCP1
- `v292DfixD1Off` — fixLD1
- `v292DfixDEDUPQ1Off` — fix68, features, fix71, fix72（DEDUPQ1・FLOW3 から。重複削除で台詞の中の文も消す従来の判定に戻す）
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
- `v292DfixEDIT01CarryOff` — fixEDIT01（E1。同じ場所で書き換えた台詞の話者引き継ぎだけ止める）
- `v292DfixEDLogOff` — fixEDLOG（92-a から。止める）
- `v292DfixEDLogOn` — fixEDLOG（92-a から。既定 OFF。`1` で ON）
- `v292DfixEDNBtnOff` — index.html
- `v292DfixFACTS1Off` — fix58（FACTS1・FLOW3 から。earlierFacts を足さない。送信バイト同一）
- `v292DfixFG1cOff` — av2
- `v292DfixGC1Off` — fix912
- `v292DfixGENDER1Off` — fixGENDER1, fix436, fix823（93-h から。性別の自動決定を止め、従来どおりにする。fix335 は GENDER1 の `on()` を通して同じく止まる）
- `v292DfixGC1On` — fix912
- `v292DfixGQ1aOff` — fix377
- `v292DfixGQ1bOff` — fix377
- `v292DfixGQ1bOn` — fix377
- `v292DfixGQ2Off` — fix192
- `v292DfixGQ3Off` — fix797
- `v292DfixHK1Off` — fix697
- `v292DfixHOMERETRY1Off` — home.html（93-h から。inline の HOMERETRY1。ホームの同期の自動の聞き直しを止め、93-g と同じにする）
- `v292DfixICF80Off` — fixICF80（92-a から。止める）
- `v292DfixICF80On` — fixICF80（92-a から。既定 OFF。`1` で ON）
- `v292DfixIDSPLIT2Off` — fixIDSPLIT2, fix469（93-h から。IDSPLIT2 と fix469 の B の分岐の両方を止める。93-i から ON は管理者画面の `idsplit2`＝ADMF1 の行で、localStorage のキーではない）
- `v292DfixIMGSAFEOff` — IMGSAFE-core（86 から。画面側の安全確認の部品だけを止める。Worker 側は env `CHR_IMGSAFE_OFF=1`）
- `v292DfixIS1Off` — fixIS1
- `v292DfixJMPOff` — fixJMP
- `v292DfixJR1Off` — fixJR1
- `v292DfixHOLD2Off` / `v292DfixHOLD2bOff` — fixHOLD2（1a: fix827 の通知の「この作りかけの物語を削除してやり直す」／1b: 昇格中の外見の自動保存・setProfile・STARTICON の自動再読込の待機）
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
- `v292DfixLORE1LawDedup` — fixLORE1（93-l から。A/B 用）
- `v292DfixLORE1Off` — fixLORE1（93-l から。世界観メモのブロックを止める〔次の build から・再読み込み不要〕。ON は管理者画面の `lore1`＝ADMF1 の行）
- `v292DfixLORE1On` — fixLORE1（93-l から。端末だけ足す・試験用）
- `v292DfixM3Off` — fix750
- `v292DfixMIDICONOff` — fixMIDICON（93-a から。止める。表示も作成も止める。`midicon1` の ON は管理者画面＝ADMF1 の行で、localStorage のキーではない）
- `v292DfixMIDICONgenOff` — fixMIDICON（ICONX1-A。汎用の呼び名の自動アイコンだけ止める）
- `v292DfixMIDICONregOff` — fixMIDICON, fix697（93-i から。W-MXREG〔登録 NPC の最初の自動アイコン〕だけを止める。`mxreg1` の ON は管理者画面＝ADMF1 の行で、localStorage のキーではない）
- `v292DfixMIDICONrosOff` — fixMIDICON（93-h から。OLDMX1 の「名簿が変わったら 1 回だけ判定し直す」だけを止める）
- `v292DfixISO1Off` — fixISO1（93-d から。端末ごとの kill。隠す関門と判定を止める。`localStorage v292DfixISO1Off='1'`）
- `v292DfixNEWACCT1Off` — home.html（93-g から。inline の NEWACCT1。新しいアカウントのホームの同期の表示を従来どおりに戻す）
- `v292DfixNH1Off` — fixNH1（NH1 人外モード。端末の kill）
- `v292DfixNH1bOff` — fixNH1（NH1b。以後の下書きの末尾に「／構図：従来」＝その 1 人だけ従来の構図）
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
- `v292DfixREAD1Off` — fixREAD1（READ1 の kill。On・管理者画面の行より優先）
- `v292DfixREAD1On` — fixREAD1（READ1 を端末で ON にする。既定は影）
- `v292DfixS1AOff` — fix697, fix705
- `v292DfixS1BOff` — fix892
- `v292DfixS1Off` — fixS1
- `v292DfixS4bUiOff` — fix825
- `v292DfixSC1Off` — fixSC1
- `v292DfixSC1On` — fixSC1
- `v292DfixSTATE2Off` — fix192, features（STATE2。一般語の傷・未解決の古さの印・fix190 の取り込みを従来どおり）
- `v292DfixSTATEAGE1Off` — fix192（STATEAGE1・FLOW2 から。【各キャラの現在の状態】の古い項目に「N ターン前の様子」を付けない＝従来どおりの組み立て。送信バイト同一）
- `v292DfixScDateOff` — fix820, fix825
- `v292DfixSETUI1Off` — fixSETUI1（93-g から。⚙ 設定の配置を従来のフッターのままにする）
- `v292DfixSFL1Off` — fixADMF1, fixSFL1
- `v292DfixSFL1On` — fixADMF1, fixSFL1（81-admg-a から、効くのは Owner のアカウントで行が無いときだけ。招待者などは `?sfl=1` でも ON にならない）
- `v292DfixSFLTapOff` — fixSFLTap
- `v292DfixSAVEUIAdoptOff` — fixSAVEUI（「ローカルを退避してクラウド版を開く」の前の控え・退避の作り直しだけ外す）
- `v292DfixSAVEUIGateOff` — fixSAVEUI（差分の帯が未選択の間／fix635 が止めている間に生成を止める関門だけ外す）
- `v292DfixSAVEUIOff` — fixSAVEUI, fix635, features(Ctrl+S), fixEDIT01, fixSFL1, index(設定の保存・編集の保存)（全部を前の版と同じ動きに戻す。fix635 の戻り値も undefined に戻る）
- `v292DfixSCID1Off` — fix820（SCID1。乱数 id の予備を使わず、従来どおり時刻ベースの 5 回で失敗にする）
- `v292DfixSN1aOff` — fix527, fix697
- `v292DfixSN1bOff` — fix697
- `v292DfixSP1BOff` — fix957, index.html
- `v292DfixSP1BOn` — fix957, index.html
- `v292DfixSP1Off` — fix66, fix957, index.html
- `v292DfixSTALE1Off` — index.html（STALE1。fixProviderCfg が openrouter の本文から Anthropic 形の model を消して書き戻す従来の動きに戻す。戻すと、別タブで同じ物語を開くだけで元のタブが「古い」になる再現も戻る）
- `v292DfixSTARTICONOff` — fixSTARTICON（93-i から。物語を始めたときの自動アイコンを止める〔何もしない〕。ON は管理者画面の `starticon1`＝ADMF1 の行。`v292DfixSTARTICONNoAI='1'` は文章 AI の案だけを使わない）
- `v292DfixSTARTICONRetryOff` — fixSTARTICON（93-j から。200 `IN_FLIGHT` のあとの 1 回だけの再試行をしない＝93-i と同じ）
- `v292DfixSEEDNPC1bOff` — fix873（93-k から。説明だけの人の名前を空にする処理だけ止める＝93-j と同じ）
- `v292DfixSEEDNPC1cOff` — fix873（SEEDNPC1c から。複合語の判定だけ止める＝93-k と同じ）
- `v292DfixSEEDNPC1dOff` — fix873（SEEDNPC1d から。動詞連体形の関係節を説明扱いにする判定だけ止める＝SEEDWORLD1 と同じ）
- `v292DfixSEEDNPC1eOff` — fix873（SEEDNPC1e。ひらがな修飾＋役割の語だけの呼び名への AI の名付けを止める＝SEEDNPC1d と同じ）
- `v292DfixSEEDHERO1Off` — fix823, fix873（SEEDHERO1。主人公の説明への AI の補足と口調の行を止める＝SEEDHERO1 の前と同じ）
- `v292DfixSEEDWORLD1Off` — fix873（SEEDWORLD1。種の画面の複数行・細かく決める欄・確認カードの追加行と印を止める＝93-m と同じ）
- `v292DfixSEEDWORLD2Off` — fix823, fix873（SEEDWORLD2。「AI で世界観を広げる」のチェックと loreAppend を止める。チェックは既定 OFF）
- `v292DfixSPBASE1Off` — av2-data（SPBASE1。補助の書き込みのあとで fix781 の「最後に確認した版」を進める処理だけ止める＝SPBASE1 の前と同じ）
- `v292DfixSPBASE2Off` — av2-data（SPBASE2。schema2 への切り替えのあとで fix781 の「最後に確認した版」を進める処理だけ止める＝SPBASE2 の前と同じ）
- `v292DfixSTARTICONListOff` — fixSTARTICON（93-k から。キャラ一覧を開いたままの再読み込み・開き直し・待ちの表示・LC1 の読み直しを止める＝93-j と同じ）
- `v292DfixLC1PtrRefreshOff` — fixLC1（93-k から。refreshPtr を何もしない）
- `v292Dav2pRenameOff` — av2-portrait（93-k から。名前を変えたキャラの絵を今の名前で出す表示を止める＝93-j と同じ）
- `v292DfixUI1AuxOff` — fixUI1
- `v292DfixUI1DlgOff` — fixUI1
- `v292DfixUI1LabelOff` — fixUI1
- `v292DfixUI1MigOff` — fixUI1
- `v292DfixUI1Off` — fixUI1
- `v292DfixUI2Off` — fixUI2（UI2。読みやすさの CSS を入れない）
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
- `v292NoTagJudgeOff` — index.html（fix276 本体）
- `v292DfixNS1Off` — index.html（NS1。fix276 の書かれた文字の形の判定だけ止める）
- `v292DfixNS2Off` — index.html（NS2。話者推測の 4 点だけ止める）
- `v292ProxyOff` — fix247, fix336
- `v292PsychMergeOff` — fix244
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
