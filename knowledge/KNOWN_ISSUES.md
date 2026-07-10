# 既知の問題

最終確認: 2026-07-11 / 基準: 92f962c・20260711-fix415

## 未解決

### KI-01 公開Workerの稼働バージョンを確認できていない

- **症状**: リポジトリにはWorker v16ソースがあるが、公開URLが返す版、bindings、secrets、D1/KV構成を本作業では確認できていない。
- **再現条件**: リポジトリだけからデプロイ状態を判断しようとする。
- **関連ファイル**: worker/chronicle-proxy-v16_atomic.js、v292Dfix247-proxy.js、v292Dfix402-invisible-sync.js。
- **関連fix**: Worker v14〜v16、cc2123f。
- **回避策**: ソース最新版と公開稼働版を分けて記録し、安全な認証済み環境でGET /と/save契約を確認する。
- **状態**: Unresolved。

### KI-02 新旧エンジンの既定状態に説明とコードの差がある

- **症状**: v292Dfix226-engine-unify.jsは旧sys拡張が現行で破棄されると説明する一方、v292Dfix192-newengine.jsはengineMode=0/1を切替え、設定がなければ従来側になるコードを持つ。
- **再現条件**: 新規または既存セーブでengineModeの保存値が異なる場合。
- **関連ファイル**: v292Dfix192-newengine.js、v292Dfix226-engine-unify.js。
- **関連fix**: fix192、226。
- **回避策**: 変更前にS.cfg.engineModeとlocalStorage v292EngineModeを記録し、両モードでテストする。
- **状態**: Unresolved。

### KI-03 _extensionsの有効範囲がengineModeと登録経路に依存する

- **症状**: 従来エンジンではsysへ反映されるが、新エンジンのsys全置換で内側の結果が失われ得る。_userExtensions、_parseExtensions、keeperは別経路。
- **再現条件**: _extensionsだけへ重要ルールを追加し、engineMode=1で生成する。
- **関連ファイル**: index.html、features.js、v292Dfix192-newengine.js、v292Dfix226-engine-unify.js、v292Dfix379-wrap-keeper.js。
- **関連fix**: 192、226、379、405、409、414。
- **回避策**: 実送信sysを検査し、必要ならkeeperまたは適切な別フックを使う。
- **状態**: Unresolved（範囲）／経路自体はConfirmed。

### KI-04 一人称／三人称の正式適用範囲が未確定

- **症状**: 新エンジンは一人称視点を明記するが、プロジェクト全体を単一視点へ固定する正本がない。
- **再現条件**: engineMode切替、主人公代名詞を含む本文、会話ログ抽出。
- **関連ファイル**: v292Dfix192-newengine.js、v292Dfix388-first-person-speaker.js、features.js。
- **関連fix**: 192、388。
- **回避策**: 「常に三人称」と断定せず、両エンジンで本文と話者ログを確認する。
- **状態**: Unresolved。

### KI-05 主人公の自発行動・発話・内面の許容範囲が競合する

- **症状**: 新エンジンは主人公だけの場面で独白・心の声を許す。別のactive promptには主人公の新セリフや行動を勝手に作らない規則と、自発的に動かす推進規則が併存する。
- **再現条件**: 空入力、続き入力、主人公だけの場面、強い推進モード。
- **関連ファイル**: v292Dfix192-newengine.js、features.js。
- **関連fix**: 192、138等。
- **回避策**: 入力と矛盾する決定的発話・選択を禁止する暫定境界でテストする。
- **状態**: Unresolved。

### KI-06 R18・残酷表現・成人描写の正式な上限方針がない

- **症状**: 表現自由度を尊重する記述や強い描写例はあるが、「無制限」を裏付ける正式文書はなく、モデル／API制約も変動する。
- **再現条件**: 強い成人・残酷表現を要求し、プロバイダやモデルを切り替える。
- **関連ファイル**: features.js、v292Dfix192-newengine.js、モデル選択・proxy関連ファイル。
- **関連fix**: 複数。単一の正式fixは未確認。
- **回避策**: 実装方針と外部プロバイダ制約を分け、「制限なし」と保証しない。
- **状態**: Unresolved／外部依存。

### KI-07 未読込JS 127本の分類が未完了

- **症状**: ルートJS 258本に対しactiveは131本。残りは履歴保存、置換済み、未使用、将来用の可能性が混在する。
- **再現条件**: ファイル名やfix番号だけで現役／退役を判断する。
- **関連ファイル**: index.html、ルートの*.js。
- **関連fix**: 全般。
- **回避策**: 「未読込候補」と呼び、Git履歴と置換先を個別確認する。
- **状態**: Unresolved。

## 修正済みだが再発注意

### KI-08 同期レースと古い保存による上書き

- **症状**: push中の新規保存をclean扱いする、別端末データを黙って適用する、同時pushでmainを失う可能性が過去にあった。
- **再現条件**: 複数端末、同時保存、低速回線、pagehide、reload。
- **関連ファイル**: v292Dfix402-invisible-sync.js、worker/chronicle-proxy-v16_atomic.js。
- **関連fix**: 402c〜402e、Worker v14〜v16。
- **回避策**: mutationSeq、世代、Abort timeout、rev/baseRev、fork、D1原子操作を維持する。
- **状態**: 修正済み記録。実公開v16未確認のためE2E再検証が必要。

### KI-09 putimg取りこぼし・画像巻戻り

- **症状**: 画像生成後の送信失敗、二重送信、古い画像優先、IDB欠落が過去に発生した。
- **再現条件**: iOS、低速回線、再生成直後、複数端末。
- **関連ファイル**: v292Dfix197-avatar-key.js、v292Dfix400-img-url.js、v292Dfix402-invisible-sync.js、Worker v16。
- **関連fix**: 400、402、403c、411、412、Worker v15/v16。
- **回避策**: pending/dead台帳、single-flight、hash・世代照合、ローカル優先を維持する。
- **状態**: 修正済み記録、再発注意。

### KI-10 セーブ読込confirmによる見かけ上の凍結

- **症状**: 自動操作や背面状態でnative confirmが応答待ちとなり、画面が凍結したように見える。
- **再現条件**: セーブ管理からロードし、confirmを操作できない状況。
- **関連ファイル**: v292Dfix407-load-noconfirm.js。
- **関連fix**: 407。
- **回避策**: ロードクリック同tickだけconfirmを自動承認する限定ガードを維持する。
- **状態**: 修正済み、削除系confirmへ影響しないことを回帰確認する。

### KI-11 状態storeの鮮度低下

- **症状**: _extensions注入が新エンジンで失われ、状態更新・一覧表示が古くなる問題があった。
- **再現条件**: 新エンジン、長期ターン、状態変化。
- **関連ファイル**: v292Dfix77-state-memory.js、v292Dfix405-state-freshness.js、v292Dfix379-wrap-keeper.js。
- **関連fix**: 405。
- **回避策**: keeper注入と_parseExtensions捕捉を維持する。
- **状態**: 修正済み記録、再発注意。

### KI-12 呼称分裂・誤統合・ロスター汚染

- **症状**: 省略名が別人物化、回想人物の登録、話者名の誤帰属が過去にあった。
- **再現条件**: 姓名と省略呼称、回想、代名詞、一人称話者。
- **関連ファイル**: v292Dfix307-npc-roster.js、v292Dfix409-handle-merge.js、v292Dfix388-first-person-speaker.js、v292Dfix390-speaker-fullname.js。
- **関連fix**: 388、390、408、409b。
- **回避策**: safety gate、バックアップ、dryRun、話者補正を維持する。
- **状態**: 修正済み記録、再発注意。

## 仕様か不具合か未確定

### KI-13 fix414が既定OFF

- **症状**: 制約エンジンは読み込まれるが、通常は空文字を返してsysへ制約を追加しない。
- **再現条件**: v292Dfix414Onが未設定。
- **関連ファイル**: v292Dfix414-constraint-engine.js。
- **関連fix**: 414。
- **回避策**: preview／statusで確認してからopt-inする。
- **状態**: 暫定設計。欠陥とは断定しない。

### KI-14 fix415のDOM走査コスト

- **症状**: 初回全走査、MutationObserver、2秒ポーリングを使う。現在の目的には限定されるが、長期ターンでの実測負荷は本作業では未確認。
- **再現条件**: 大量のターンDOM、頻繁なrenderAll。
- **関連ファイル**: v292Dfix415-opening-mask.js。
- **関連fix**: 415。
- **回避策**: 対象先頭判定、leaf限定、冪等属性を維持し、性能計測なしに範囲を広げない。
- **状態**: Inferred risk／未測定。

## テスト不足

### KI-15 外部実績141/141・180/180を正規リポジトリで再現できない

- **症状**: 外部引き継ぎに合格記録はあるが、同じテストを実行するハーネス、fixture、コマンドが追跡されていない。
- **再現条件**: 新しい環境で結果を再現しようとする。
- **関連ファイル**: 正規リポジトリ外の引き継ぎ／レビュー文書。
- **関連fix**: fix414で141/141、fix415/Worker v16で180/180との外部記録。
- **回避策**: 外部実績と再実行可能テストを分離し、合格を現在結果として流用しない。
- **状態**: Unresolved／テスト不足。

### KI-16 tracked test HTMLが本格的回帰テストではない

- **症状**: test.htmlはtest、test2.htmlはhello、test_small.htmlは単純なHTMLのみ。
- **再現条件**: ファイル名だけでテストスイートと判断する。
- **関連ファイル**: test.html、test2.html、test_small.html。
- **関連fix**: なし。
- **回避策**: TEST_MATRIXのブラウザ検証口と手動シナリオを使う。
- **状態**: Confirmed。

## 外部API・モデル依存

### KI-17 API失敗、タイムアウト、レート制限、モデル出力差

- **症状**: OpenRouter、Together、Fireworks、Pollinations、Cloudflareの障害・429・仕様変更、モデル別JSON崩れや表現差。
- **再現条件**: 外部サービス障害、key/binding不備、モデル切替、長文応答。
- **関連ファイル**: v292Dfix247-proxy.js、v292Dfix256-model-select.js、v292Dfix370-model-guard.js、Worker v16、解析patch。
- **関連fix**: 80、247、256、336、354、370、Worker各版等。
- **回避策**: retryable契約、タイムアウト、モデル切替、構造化応答修復、エラー表示を維持する。
- **状態**: 外部依存。常時解消とはみなさない。
