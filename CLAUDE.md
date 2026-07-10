# Claude向けプロジェクト指示

Chronicleの共通仕様・状態・判断・問題・テスト・引き継ぎの正本は knowledge/ 配下です。このファイルへ詳細仕様を複製しないでください。

## 共通運用規則

1. 作業開始時に knowledge/INDEX.md を読む。
2. INDEXの案内に従い、タスクに必要な関連知識だけを追加で読む。
3. 実装前に knowledge/INVARIANTS.md を確認する。
4. コード・資料・knowledgeに矛盾を発見したら、勝手に解消・上書きせず、根拠とともに報告する。
5. 変更後は knowledge/TEST_MATRIX.md から関連テストを選び、実行結果を記録する。
6. ConfirmedとInferred／Unresolved／Proposedを混同しない。検証できた事実だけをknowledgeへ反映する。
7. 作業終了時に knowledge/HANDOFF.md を更新する。
8. 古い記録を削除せず、Deprecatedまたは置換済みとして履歴を残す。
9. 共通仕様の正本はknowledge配下とし、CLAUDE.mdやAGENTS.mdへ二重保存しない。
10. 明示的な許可なしにcommit、push、deployを行わない。
11. knowledge更新だけを理由に本番コードを変更しない。

## Claude固有

- Claudeのセッション引き継ぎでは、最初に knowledge/CURRENT_STATE.md と knowledge/HANDOFF.md を照合する。
- 長い外部レビューやローカル資料を参照しても、現在の正規コードより優先しない。
- 理由を確認できない設計判断は「理由未確認」と記録し、推測で補完しない。
