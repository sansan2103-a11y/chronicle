# アーキテクチャ

最終確認: 2026-07-11 / 基準: 92f962c・20260711-fix415

## 主要ファイルと責務

| ファイル | 責務 | 状態 |
|---|---|---|
| index.html | HTML/UI、状態S、Api.call、Planner、UI、G.submit、起動処理 | Confirmed |
| features.js | 入力、プロンプト、NPC、状態、解析、表示等の統合拡張 | Confirmed・active |
| v292Dfix*.js | 後方互換パッチ、ガード、機能追加。存在だけで有効とはしない | Confirmed |
| worker/chronicle-proxy-v16_atomic.js | Cloudflare Workerソース。本文、画像、保存、管理API | Confirmed・デプロイ状態はUnresolved |
| seed_bank_v1/ | おまかせ生成用の素材・契約 | Confirmed |
| version.txt | BUILT値の補助記録 | Confirmed |

## 実行入口とscriptの扱い

index.htmlが実装の実読込順を決めます。後から読み込まれたパッチが同じ関数を包む場合、通常は後段ラッパーが外側になります。ただし各パッチの再武装、keeper、タイマー、フック配列によって単純な「後勝ち」にならない場合があります。

20260711-fix415ではscript参照は全138件です。

- **Confirmed**: HTMLコメントを除いた実行対象は131件。参照先の欠落は0件。
- **Confirmed**: コメント内参照は7件。そのうち6件はリポジトリに存在しないが実行対象ではないため現在の404要因ではない。
- **Confirmed**: ルートJSは258本。実行対象131本を除く127本は「未読込候補」。一括して退役済みとは断定しない。

### 実読込順

1. v292Dfix246-store-slot-isolation.js
2. v292Dfix247-proxy.js
3. v292Dfix247b-proxy-admin.js
4. features.js
5. v292Dfix135-longmem.js
6. v292Dfix138-continue.js
7. v292Dfix145-charlist.js
8. v292Dfix53-readability-v2.js
9. v292Dfix54-gender-pronoun.js
10. v292Dfix55-gm-mode.js
11. v292Dfix56-conversation-log-fix.js
12. v292Dfix57-script-style-dialogue.js
13. v292Dfix58-prompt-rebuild.js
14. v292Dfix60-display-pipeline.js
15. v292Dfix59-hybrid-extractor.js
16. v292Dfix61-alpha-strip-protect.js
17. v292Dfix63-avatar-style.js
18. v292Dfix65-dialogue-rescue.js
19. v292Dfix74-ext-dedup-and-say.js
20. v292Dfix66-renderhook-repair.js
21. v292Dfix68-cliche-sentence-aware.js
22. v292Dfix69-literary-prose.js
23. v292Dfix71-anti-recap.js
24. v292Dfix72-within-turn-dedup.js
25. v292Dfix75-history-dedup.js
26. v292Dfix76-human-foundation.js
27. v292Dfix77-state-memory.js
28. v292Dfix78-tag-case-normalize.js
29. v292Dfix79-momentum-anchor.js
30. v292Dfix80-gen-gate-retry.js
31. v292Dfix82-injury-reaction-root.js
32. v292Dfix83-name-truncation-repair.js
33. v292Dfix84-sampling.js
34. v292Dfix85-reaction-spectrum.js
35. v292Dfix81-strip-incomplete-tags.js
36. v292Dfix90-extension-dedup.js
37. v292Dfix192-newengine.js
38. v292Dfix197-avatar-key.js
39. v292Dfix221-recent-dialogues-authoritative.js
40. v292Dfix226-engine-unify.js
41. v292Dfix228-slot-generations.js
42. v292Dfix237-avatar-carrier-guard.js
43. v292Dfix239-noncast-avatar-race.js
44. v292Dfix243-topbar-collapse.js
45. v292Dfix244-psych-merge.js
46. v292Dfix256-model-select.js
47. v292Dfix270-topbar-ui.js
48. v292Dfix274-build-flag-guard.js
49. v292Dfix275-settings-tabs.js
50. v292Dfix277-quasi-pack.js
51. v292Dfix288-tooltips.js
52. v292Dfix290-mobile.js
53. v292Dfix291-saveexport.js
54. v292Dfix292-health.js
55. v292Dfix295-convlog-stability.js
56. v292Dfix297-ai-instructions.js
57. v292Dfix300-readability.js
58. v292Dfix301-longmem-stale-guard.js
59. v292Dfix302-undo-state-rollback.js
60. v292Dfix303-speaker-backref.js
61. v292Dfix304-emotion.js
62. v292Dfix305-trigger-states.js
63. v292Dfix306-npc-liveliness.js
64. v292Dfix307-npc-roster.js
65. v292Dfix308-creepy-toggle.js
66. v292Dfix309-progression.js
67. v292Dfix310-gallery.js
68. v292Dfix313-story-cards.js
69. v292Dfix314-memory.js
70. v292Dfix315-see.js
71. v292Dfix316-gallery-search.js
72. v292Dfix317-slot-leak.js
73. v292Dfix318-perslot-len-creepy.js
74. v292Dfix322-state-line-strip.js
75. v292Dfix323-boundary-guards.js
76. v292Dfix324-show-dont-tell.js
77. v292Dfix325-state-rederive.js
78. v292Dfix326-story-scroll.js
79. v292Dfix327-turn-counter.js
80. v292Dfix328-google-login.js
81. v292Dfix298-roster.js
82. v292Dfix330-somatic-guard.js
83. v292Dfix332-uifold.js
84. v292Dfix333-actor-reality.js
85. v292Dfix334-entryhub.js
86. v292Dfix335-omakase.js
87. v292Dfix351-settings-draft.js
88. v292Dfix352-hero-placeholder.js
89. v292Dfix353-omakase-fill-rest.js
90. v292Dfix354-default-model.js
91. v292Dfix355-selector-cleanup.js
92. v292Dfix359-gender-avatar.js
93. v292Dfix360-seed-ux.js
94. v292Dfix361-phaseb-preview.js
95. v292Dfix363-player-seed.js
96. v292Dfix364-reset-help.js
97. v292Dfix366-cast-gender.js
98. v292Dfix370-model-guard.js
99. v292Dfix371-reset-dialog-text.js
100. v292Dfix372-gender-radio-guard.js
101. v292Dfix374-default-style-guard.js
102. v292Dfix376-speaker-guard.js
103. v292Dfix377-voice-anchor.js
104. v292Dfix378-species-judge.js
105. v292Dfix379-wrap-keeper.js
106. v292Dfix381-reaction.js
107. v292Dfix382-auto-dial.js
108. v292Dfix383-vocative-fix.js
109. v292Dfix384-auto-restore.js
110. v292Dfix385-voice-correction.js
111. v292Dfix386-relation-gauge.js
112. v292Dfix387-confession.js
113. v292Dfix388-first-person-speaker.js
114. v292Dfix389-npc-relations.js
115. v292Dfix390-speaker-fullname.js
116. v292Dfix393-restyle-unify.js
117. v292Dfix395-default-darkanime.js
118. v292Dfix398-scream-attribution.js
119. v292Dfix399-cloudsync.js
120. v292Dfix400-img-url.js
121. v292Dfix336-proxy-sentinel-fix.js
122. v292Dfix338-artstyle.js
123. v292Dfix346-idb-avatars.js
124. v292Dfix356-avatar-eager.js
125. v292Dfix402-invisible-sync.js
126. v292Dfix405-state-freshness.js
127. v292Dfix406-automode.js
128. v292Dfix407-load-noconfirm.js
129. v292Dfix409-handle-merge.js
130. v292Dfix414-constraint-engine.js
131. v292Dfix415-opening-mask.js

クエリ文字列のcb値はキャッシュ更新用であり、ファイル名と分けて扱います。順序の根拠は現在のindex.htmlです。

### コメント内参照

v292Dfix52-readability.js、v292Dfix62-avatar-fix.js、v292Dfix64-conversation-log-restore.js、v292Dfix73-card-dedup.js、v292Dfix70b-order-convsays.js、v292Dfix86-avatar-eager-blob.js、v292Dfix89-convlog-cleanup.js。v292Dfix62-avatar-fix.jsだけはローカルに存在し、他6件は存在しません。すべてHTMLコメント内です。

## 入力から物語表示まで

1. UI入力を G.submit が受け、Sの現在状態と入力種別を参照する。
2. Planner.build がsystem/userメッセージを組み立てる。features.jsとactive patchが入力帰属、状態、NPC、連続性等を追加する。
3. v292Dfix247-proxy.jsが設定に応じて Api.call の送信先・認証をWorker経由へ切り替える。空設定ではBYOK直接経路を残す。
4. Api.call が本文生成APIを呼ぶ。Worker経由の場合、既定URLは novel-proxy.sansan2103.workers.dev。
5. Planner.parsePlan と _parseExtensions が構造化応答を解析・修復する。切断JSONやタグ、話者、状態を複数patchが補正する。
6. 解析結果をS.turns等へ反映し、S.saveで保存する。
7. UI.appendTurn、UI.renderNarr、UI.renderAllと _renderHooks が本文、入力カード、会話ログ、一覧を更新する。
8. fix415はこの最終表示層だけで開幕メタ入力のtextContentをマスクし、送信データや履歴は変更しない。

## 従来エンジンと新エンジン

- **Confirmed**: v292Dfix192-newengine.jsでは engineMode=0を従来、1を新βとして扱う。S.cfg.engineModeを優先し、localStorage v292EngineModeを保険にする。
- **Confirmed**: engineMode=1では、いったん内側のPlanner.buildを呼んだ後、生成したsysをbuildSys結果で置換する。このため内側で計算されたsys拡張が破棄され得る。
- **Confirmed**: engineMode=0では従来のPlanner.build結果を維持する。
- **Unresolved**: v292Dfix226-engine-unify.jsの「旧sys拡張は現行で破棄」という説明と、v292Dfix192の切替可能・従来既定コードには差がある。新規／既存セーブで実際にどちらが選ばれるか実機確認が必要。

## 拡張経路

- Planner._extensions: system文字列を拡張する。従来エンジンでは利用されるが、新エンジンでsys全置換される場合は結果が失われ得る。
- Planner._userExtensions: user文字列を変換する。入力優先・逐語反映等で使われ、新エンジンのsys置換とは別経路。
- Planner._parseExtensions: 応答解析後の修復・状態捕捉・重複除去等。新旧両エンジンの下流で利用される。
- keeper: v292Dfix379-wrap-keeper.jsの window.__f379reg にブロックを登録し、最終Planner.buildへ再注入する。fix405はprio 1、fix414はprio 2、fix409はprio 3の経路を持つ。

_extensionsを一括して死に経路と扱わないでください。拡張種別、engineMode、登録時期、保存設定を分けて確認します。

## 状態管理と保存

- S: cfg、cast、turns等の主要ランタイム状態。S.save／S.loadが永続化の中心。
- localStorage: chr6、chr6_slot_*、chr6_slots_meta、設定、fixフラグ、バックアップ。fix246が一部キーをスロット分離する。
- IndexedDB: chr6avデータベースのimgsストア等で画像を保持する。
- JSON移行: v292Dfix291-saveexport.jsがlocalStorage一式をエクスポート／インポートする。
- クラウド: fix399／402が/saveを使う。fix402はrev/baseRev、fork、dirty、世代、pending画像等を扱う。
- Worker v16: D1のsaves/images、KV LEDGER、認証名寄せ、競合時forkを扱う。公開環境のv16稼働はUnresolved。

## 重要な依存関係

- fix405、409、414はfix379 keeperの登録口に依存する。
- fix405と414はfix77状態storeに依存する。
- fix402はfix399の収集・適用経路、fix247のproxy設定、Workerの/save契約と連携する。
- fix400の画像URL表示はWorker /imgと名前空間に依存する。
- fix415はstartSceneの定型入力とUI表示DOMに依存するが、データ層には触れない。

## 推測と未確認

- 未読込127本の個別用途・廃止時期はUnresolved。
- Worker v16ソースと実デプロイは分離して扱う。
- 実行時に動的に追加されるscriptは現在の静的index解析では確認していない。該当する正式な生成／loader経路は未確認。
