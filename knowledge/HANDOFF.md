# AI間引き継ぎ

## 現在の作業目標

Chronicleの正規Gitリポジトリへ、Claude・GPT/Codex・別セッションで共有するMarkdown知識基盤を導入し、20260711-fix415を正本として再検証する。

## 完了した作業

- GitHub Desktopの通常Pull originでv292-rebuildを58e7c21から92f962cへfast-forwardした。
- 同期後、HEADとorigin/v292-rebuildの一致、BUILT=20260711-fix415、未コミット変更なし、Worker v16ソース存在を確認した。
- 最新v292-rebuildからdocs/shared-ai-knowledge-baseを新規作成した。未公開ローカルブランチでありpushしていない。
- index.htmlのscript参照を再集計した。全138、active 131、active欠落0、コメント内7、コメント内欠落6。
- ルートJS 258本中、active 131本と未読込候補127本を分離した。
- fix402e〜415、Worker v16、新旧エンジン、_extensions各経路、keeper、物語不変条件、テスト検証口を確認した。
- 前回の外部knowledgeと最新引き継ぎを二次資料として参照し、古いfix400d・script欠落記録等を正規コード基準で修正した。
- knowledge 8ファイル、CLAUDE.md、AGENTS.mdを文書だけで作成した。

## 変更ファイル

- knowledge/INDEX.md
- knowledge/CURRENT_STATE.md
- knowledge/ARCHITECTURE.md
- knowledge/INVARIANTS.md
- knowledge/DECISIONS.md
- knowledge/KNOWN_ISSUES.md
- knowledge/TEST_MATRIX.md
- knowledge/HANDOFF.md
- CLAUDE.md
- AGENTS.md

HTML、JavaScript、JSON、Worker、API設定、モデル設定、セーブ形式、デプロイ設定、依存関係は手作業で変更していない。

## 実行したテスト

- Gitブランチ、HEAD、origin追跡ref、statusの確認。
- index.htmlとversion.txtのBUILT一致確認。
- Worker v16ソースの存在確認。
- index.htmlのscript参照・コメント除外・実在ファイル照合。
- Git履歴のfix402〜415、Worker v14〜v16確認。
- 公開検証API名と関連ファイルの静的確認。
- Markdown相対リンクと記載パスの存在確認。
- CLAUDE.md／AGENTS.mdの運用規則比較。
- 文書以外の差分がないことの確認。

ゲームを起動する実機物語テスト、外部API呼出し、公開Worker health、クラウド同期E2Eは本作業では実行していない。

## テスト結果

- 同期: 成功。fast-forward、merge commitなし、rebaseなし。
- 基準: 92f962c9bd3fef48d742beaf60e04f651feef2c3 / 20260711-fix415。
- script: active 131件、active欠落0件。
- Worker: v16ソース確認。公開稼働版は未確認。
- 文書検証: コミット前の最終検証で確定する。
- 外部141/141・180/180: 外部実績としてのみ記録。正規リポジトリ内で再現不可。

## 未解決事項

1. 公開Workerがv16を実行しているか。
2. 新規／既存セーブにおけるengineModeの実際の既定状態。
3. _extensionsのエンジン・保存状態別の実効範囲。
4. 一人称／三人称の正式適用範囲。
5. 主人公の自発発話・内面・行動の正式境界。
6. R18・残酷表現・成人描写の正式上限と外部モデル制約。
7. 未読込JS 127本の個別分類。
8. 141/141・180/180を再現するharness／fixtureの所在。
9. fix414を既定ONへ移すかどうか。

## 次に行う作業

1. knowledge/INDEX.mdからタスクに必要な文書を選ぶ。
2. 安全な認証済み環境で公開Worker GET /と/save契約を確認する。
3. 新旧engineModeでTEST_MATRIXのPOV、主人公自発性、_extensions、身体制約テストを実行する。
4. 外部テストharnessが存在する場合は正規リポジトリへ移す前に内容・権利・再現性を確認する。
5. 未読込JSをGit履歴とindex置換経路から段階的に分類する。

## 注意すべき不変条件

- プレイヤー入力を正しい主体へ帰属し、無視しない。
- 前ターンを再演せず、状態を引き継いで前へ進める。
- NPCは自律するが、不自然な強制登場・強制発話をさせない。
- 重傷・鎮痛・解離・凍結を万能化しない。
- 不可能命令を無条件成功させず、試行・代償・成立余地は残す。
- 視点と主人公自発性は未確定境界を勝手に固定しない。
- セーブ互換、スロット分離、競合時fork／バックアップを守る。
- Workerソース版と公開稼働版を混同しない。

## 最終更新日時

2026-07-11 07:48 JST

## 更新したAIまたは担当

OpenAI Codex（GPT-5系）
