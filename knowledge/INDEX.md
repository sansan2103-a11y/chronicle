# Chronicle プロジェクト知識基盤

このディレクトリは、Claude・GPT/Codex・別セッション間で共有するプロジェクト知識の正本です。

## 読み方

- 作業再開時: [CURRENT_STATE.md](CURRENT_STATE.md) と [HANDOFF.md](HANDOFF.md)
- バグ修正前: [INVARIANTS.md](INVARIANTS.md)、[KNOWN_ISSUES.md](KNOWN_ISSUES.md)、[TEST_MATRIX.md](TEST_MATRIX.md)
- 設計変更前: [ARCHITECTURE.md](ARCHITECTURE.md)、[DECISIONS.md](DECISIONS.md)、[INVARIANTS.md](INVARIANTS.md)
- 物語生成ルール変更前: [INVARIANTS.md](INVARIANTS.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[TEST_MATRIX.md](TEST_MATRIX.md)
- セーブ・同期・Worker変更前: [ARCHITECTURE.md](ARCHITECTURE.md)、[DECISIONS.md](DECISIONS.md)、[KNOWN_ISSUES.md](KNOWN_ISSUES.md)、[TEST_MATRIX.md](TEST_MATRIX.md)

## ファイル案内

| ファイル | 役割 |
|---|---|
| [CURRENT_STATE.md](CURRENT_STATE.md) | 現在のfix、実装状態、モデル/API、優先課題 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 実行経路、script順、状態・プロンプト・API・保存・UI |
| [INVARIANTS.md](INVARIANTS.md) | 壊してはいけない確認済み仕様と未確定境界 |
| [DECISIONS.md](DECISIONS.md) | 重要な設計判断と採否履歴 |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | 未解決、再発注意、仕様未確定、テスト不足、外部依存 |
| [TEST_MATRIX.md](TEST_MATRIX.md) | 回帰テスト、実行方法、再現可能性、外部実績の区別 |
| [HANDOFF.md](HANDOFF.md) | 直近作業と次の担当への引き継ぎ |

## 情報状態

- **Confirmed**: 現在のコード、Git履歴、または再実行できる検証で確認済み。
- **Inferred**: 複数の証拠から妥当に推定できるが、直接確認は未完了。
- **Unresolved**: 情報不足、実行環境未確認、または資料間に矛盾がある。
- **Deprecated**: 過去には有効だったが、現在は置換・廃止済み。
- **Proposed**: 未採用の案。

状態を書いていない記述を自動的にConfirmedと解釈しないでください。各項目の根拠を確認してください。

## 正本の優先順位

1. 現在の正規リポジトリにある実行コード
2. 現在の index.html から実際に読み込まれるコード
3. 最新の再実行可能な実機テスト
4. 最新のレビュー・引き継ぎ資料
5. Git履歴
6. 古い仕様書・アーカイブ
7. 過去のknowledgeファイル

コードが存在するだけでは有効と断定せず、index.html、設定、呼び出し経路、既定ON/OFFを確認します。矛盾は勝手に解消せずUnresolvedとして記録します。

## 更新規則

1. 検証できた事実だけをConfirmedへ反映する。
2. 変更前に関連する不変条件を読む。
3. コード変更後は TEST_MATRIX.md から関連テストを選ぶ。
4. 古い記録は削除せずDeprecatedまたは置換済みとして残す。
5. 作業終了時に HANDOFF.md を更新する。
6. knowledge更新だけを理由に本番コードを変更しない。

## 現在の基準

- ブランチ基点: v292-rebuild
- 基準コミット: 92f962c9bd3fef48d742beaf60e04f651feef2c3
- BUILT: 20260711-fix415
- 確認日: 2026-07-11（Asia/Tokyo）

基準は更新時点の値です。作業開始時に CURRENT_STATE.md とGitのHEADを照合してください。
