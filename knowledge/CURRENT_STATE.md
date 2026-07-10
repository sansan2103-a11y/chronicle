# 現在の実装状態

最終確認: 2026-07-11（Asia/Tokyo）

## 基準

| 項目 | 値 | 状態 | 根拠 |
|---|---|---|---|
| 正規リポジトリ | sansan2103-a11y/chronicle | Confirmed | origin URL |
| 基準ブランチ | v292-rebuild | Confirmed | 同期元ブランチ |
| 文書作業ブランチ | docs/shared-ai-knowledge-base | Confirmed | 現在の作業ブランチ |
| 基準コミット | 92f962c9bd3fef48d742beaf60e04f651feef2c3 | Confirmed | v292-rebuildとorigin/v292-rebuildの一致を確認 |
| BUILT | 20260711-fix415 | Confirmed | index.html、version.txt |
| Workerソース最新 | v16 | Confirmed | worker/chronicle-proxy-v16_atomic.js |
| 公開中Worker | 未確認 | Unresolved | デプロイ設定と公開環境の応答を本作業では検証できていない |

同期前HEADは 58e7c21d8e8bb75a49aef80b86d59049abf15f49（fix414）、同期後HEADは 92f962c9bd3fef48d742beaf60e04f651feef2c3（fix415）です。通常のPull originによるfast-forwardで4コミットを取り込みました。

## 現在の主要機能

- **Confirmed**: 単一ページの物語TRPG UI。入力種別、物語生成、構造化応答解析、ターン履歴、キャラクター状態、会話ログ、セーブ／ロードを index.html と積層パッチで実装。
- **Confirmed**: 従来エンジンと新エンジンを切替可能。新エンジンは v292Dfix192-newengine.js が Planner.build を包み、engineMode=1でsystem promptを再構築する。
- **Confirmed**: localStorageによるスロット別状態、IndexedDBによる画像、JSONエクスポート／インポート、Worker経由クラウド同期を実装。
- **Confirmed**: OpenRouter本文生成、Together優先の画像生成、Fireworks／Pollinationsフォールバックのソースがある。実際の可用性は外部サービスとデプロイ設定に依存する。
- **Confirmed**: NPC自律、入力帰属、反復防止、身体状態と不可能行動の裁定、状態記憶、ロスター／話者補正、オートモードをactive scriptで補強している。

## fix402〜415

| fix | 実装状態 | 既定・要点 | 根拠 |
|---|---|---|---|
| 402/402b | 実装・読込済み | 不可視双方向同期。402bで既定ONへ移行 | v292Dfix402-invisible-sync.js、6f61ad6 |
| 402c | 実装・読込済み | 全スロット収集、削除伝播の安全化、full判定 | 同ファイル、236e841以前の統合履歴 |
| 402d | 実装・読込済み | mutationSeqで同期中の新規保存を誤clean化しない | 同ファイル、236e841 |
| 402e | 実装・読込済み | apply世代化、保存タイムアウト、スロット別local-ahead等を追加 | 同ファイル、c0a8eb0 |
| 403/403c | 実装済み | 画像再生成・seed経路を補強。activeな関連処理はfix197等へ統合 | v292Dfix197-avatar-key.js、6507590、c0a8eb0 |
| 405 | 実装・読込済み | 状態の毎ターン注入と一覧反映をkeeper経由で補う | v292Dfix405-state-freshness.js |
| 406 | 実装・読込済み | 最大20ターンのオート進行、途中停止、スロット固定、手動送信ガード | v292Dfix406-automode.js、0aba5dc、c0a8eb0 |
| 407 | 実装・読込済み | セーブ読込時のconfirm待ちによる凍結を回避 | v292Dfix407-load-noconfirm.js、9001db3 |
| 408 | 統合済み | ロスター候補・名寄せ強化。独立scriptではなく関連activeファイルへ反映 | v292Dfix307-npc-roster.js、9001db3 |
| 409/409b | 実装・読込済み | 省略呼称の統合、バックアップ・安全ゲート・inFlight延期 | v292Dfix409-handle-merge.js、236e841、c0a8eb0 |
| 410 | 統合済み | キャラ一覧アイコン等のガード。独立scriptではなく関連activeファイルへ反映 | v292Dfix145-charlist.js、48d2eab、abad4f6 |
| 411 | 402へ統合・読込済み | putimg pending、single-flight、hash、世代照合、再送停止条件 | v292Dfix402-invisible-sync.js、6af3ff1、c0a8eb0 |
| 412 | 197へ統合・読込済み | 再生成時に現在設定・世界観・ローカル優先を使用 | v292Dfix197-avatar-key.js、6af3ff1、abad4f6 |
| 413 | 実装済み | キャラ一覧の最終ターン表示off-by-one修正。関連ファイルへ統合 | v292Dfix145-charlist.js、d178b4d |
| 414 | 実装・読込済み | 身体・心理制約をkeeperへ注入。ただし既定OFF、v292Dfix414On=1で先行有効化 | v292Dfix414-constraint-engine.js、abad4f6、613deff |
| 415 | 実装・読込済み | 開幕メタ指示を表示上だけ「◈ 物語の幕開け」に置換。保存、送信、S.turnsは変更しない。既定ON、v292Dfix415Off=1で停止 | v292Dfix415-opening-mask.js、613deff、92f962c |

「統合済み」はfix番号の独立ファイルが存在するという意味ではありません。index.htmlから読み込まれるファイルとGit履歴の両方を根拠にしています。

## WorkerとAPI

- **Confirmed**: v16ソースは /、/save、/img、/image、/admin を扱う。本文生成はOpenRouter、画像生成はTogether→Fireworks→Pollinationsの経路を持つ。
- **Confirmed**: v16はmain保存の競合処理、forceputのD1 batch、putimgの原子更新、/saveエラー契約をv15から強化する。
- **Confirmed**: 必要バインディングとして LEDGER（KV）と DB（D1）がソースに記載される。imagesテーブルはソース内で準備される。
- **Confirmed**: クライアント既定URLは https://novel-proxy.sansan2103.workers.dev 。v292Dfix247-proxy.js、v292Dfix399-cloudsync.js、v292Dfix402-invisible-sync.jsから参照される。
- **Unresolved**: 公開URLが現在v16を実行しているか、実際のbindings/secretsがソース記載どおりかは未確認。

## モデル

- **Confirmed**: v292Dfix354-default-model.jsが既定モデル選択を補正し、UIはモデル切替を持つ。
- **Confirmed**: OpenRouter互換の本文API経路とWorkerプロキシ経路がある。
- **Unresolved**: 利用可能な具体的モデル一覧、運用上の推奨、レート制限、成人表現許容範囲はプロバイダ側状態に依存する。

## 実装済み／部分実装／未確認

- **実装済み**: fix402〜415の上表にあるactive経路、セーブ／ロード、クラウド同期、モデル切替、オートモード、fix414プレビュー、fix415表示ガード。
- **部分実装または条件付き**: fix414はコード実装済みだが既定OFF。_extensionsはエンジンモードによりsysへの反映範囲が異なる。
- **未確認**: 公開Workerの版、実デプロイbindings、外部資料にある141/141・180/180テストの再現、全未読込JSの用途分類。

## 現在の優先課題

1. 公開WorkerのGET /応答と/save契約を安全な検証環境で確認し、v16稼働を確定する。
2. 新規／既存セーブごとのengineMode既定状態を実機で確認する。
3. 一人称／三人称、主人公の自発発話・内面・行動の正式適用範囲を決定する。
4. fix414を既定ONへ移行するか、プレビュー運用を続けるかを実機テスト後に判断する。
5. 未読込JS 127本を「履歴保存」「置換済み」「条件読込候補」「要確認」に分類する。
6. リポジトリ内で再実行できる回帰テスト基盤を整備する。これは本知識基盤作業の範囲外。
