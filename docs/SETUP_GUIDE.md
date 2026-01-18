# BaseSnapshot セットアップガイド

このガイドでは、BaseSnapshot WebAppを自社のLarkテナントで利用するための設定手順を説明します。

## 前提条件

- Lark/Feishu の管理者権限（またはアプリ作成権限）
- GitHubアカウント
- Vercelアカウント（無料プランで可）

## アーキテクチャ概要

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   ユーザー      │────▶│  Vercel          │────▶│  Lark API       │
│   ブラウザ      │◀────│  (WebApp)        │◀────│  (Bitable)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  Lark OAuth2     │
                        │  認証サーバー    │
                        └──────────────────┘
```

**重要**: 各テナントは自分のLarkアプリを作成し、自分のVercelインスタンスをデプロイする必要があります。

---

## Step 1: Lark Open Platform でアプリを作成

### 1.1 Lark Open Platform にアクセス

1. [Lark Open Platform](https://open.larksuite.com/) にアクセス
2. 管理者アカウントでログイン
3. 「Developer Console」をクリック

### 1.2 新規アプリの作成

1. 「Create Custom App」をクリック
2. 以下の情報を入力:
   - **App Name**: `BaseSnapshot`（任意の名前）
   - **App Description**: `Lark Base のスナップショットを作成するツール`
   - **App Icon**: 任意のアイコンをアップロード

3. 「Create」をクリック

### 1.3 アプリ認証情報の取得

作成後、以下の情報をメモしておきます（後でVercelに設定）:

| 項目 | 説明 |
|------|------|
| **App ID** | `cli_xxxxxxxxxxxxxxxx` 形式 |
| **App Secret** | 「Show」をクリックして表示 |

> ⚠️ **注意**: App Secret は絶対に公開しないでください。

---

## Step 2: アプリ権限の設定

### 2.1 Permissions & Scopes

1. 左メニューから「Permissions & Scopes」を選択
2. 以下のスコープを追加:

| スコープ | 説明 | 必須 |
|----------|------|------|
| `bitable:app` | Bitable（Base）への読み書きアクセス | ✅ |
| `wiki:wiki:readonly` | Wiki経由のBase URLを解決するため | ✅ |

3. 「Batch switch to open」をクリックして有効化

### 2.2 スコープ追加の手順

1. 「API Permissions」タブをクリック
2. 検索ボックスに `bitable` と入力
3. `bitable:app` を見つけて「Add」をクリック
4. 同様に `wiki:wiki:readonly` を追加
5. 画面上部の「Save」をクリック

---

## Step 3: OAuth2 設定

### 3.1 Security Settings

1. 左メニューから「Security Settings」を選択
2. 「OAuth 2.0」セクションを見つける

### 3.2 Redirect URI の設定

以下のリダイレクトURIを追加:

```
https://YOUR-APP-NAME.vercel.app/api/auth/callback
```

> 💡 `YOUR-APP-NAME` は後でVercelにデプロイする際に決まります。
> 最初は仮の値を入れておき、Vercelデプロイ後に正確なURLで更新してください。

**追加手順**:
1. 「Add Redirect URL」をクリック
2. URLを入力
3. 「Save」をクリック

---

## Step 4: アプリの公開設定

### 4.1 App Release（自社内アプリとして公開）

1. 左メニューから「App Release」を選択
2. 「Version Management」をクリック
3. 「Create Version」をクリック
4. バージョン情報を入力（例: `1.0.0`）
5. 「Submit for Review」をクリック

### 4.2 Availability（公開範囲の設定）

1. 「Availability」タブをクリック
2. 「Available to」で以下を選択:
   - **All employees**: 全社員が利用可能
   - **Specific departments/users**: 特定部署/ユーザーのみ

3. 「Save」をクリック

> 📝 **自社内アプリ（Internal App）** として公開する場合、Larkの審査は不要です。

---

## Step 5: GitHubリポジトリのFork

### 5.1 リポジトリをFork

1. [BaseSnapshot リポジトリ](https://github.com/PLark-droid/Basesnapshot) にアクセス
2. 右上の「Fork」ボタンをクリック
3. 自分のGitHubアカウントにFork

### 5.2 （オプション）カスタマイズ

必要に応じてコードをカスタマイズできます:
- ブランディング（ロゴ、色など）
- 追加機能

---

## Step 6: Vercelへのデプロイ

### 6.1 Vercelにサインイン

1. [Vercel](https://vercel.com/) にアクセス
2. GitHubアカウントでサインイン

### 6.2 新規プロジェクトの作成

1. 「Add New...」→「Project」をクリック
2. 「Import Git Repository」でForkしたリポジトリを選択
3. 「Import」をクリック

### 6.3 環境変数の設定

「Environment Variables」セクションで以下を設定:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `LARK_APP_ID` | `cli_xxxxxxxxxxxxxxxx` | Step 1.3で取得したApp ID |
| `LARK_APP_SECRET` | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Step 1.3で取得したApp Secret |
| `OAUTH_REDIRECT_URI` | `https://YOUR-APP.vercel.app/api/auth/callback` | Step 3.2と同じURL |
| `CLIENT_URL` | `https://YOUR-APP.vercel.app` | デプロイ先のURL |

> ⚠️ すべての環境変数を正しく設定してください。

### 6.4 デプロイ

1. 「Deploy」をクリック
2. ビルドが完了するまで待機（約1-2分）
3. デプロイ完了後、URLをメモ

---

## Step 7: Larkリダイレクトの更新

### 7.1 正確なURLで更新

Vercelデプロイ後、正確なURLがわかったら:

1. Lark Open Platform に戻る
2. 「Security Settings」→「OAuth 2.0」
3. Redirect URI を正確なURLに更新:
   ```
   https://your-actual-app-name.vercel.app/api/auth/callback
   ```
4. 「Save」をクリック

---

## Step 8: 動作確認

### 8.1 認証テスト

1. デプロイしたURLにアクセス
2. 「Larkでログイン」をクリック
3. Larkの認証画面が表示される
4. 認証を許可
5. アプリにリダイレクトされ、ログイン状態になる

### 8.2 スナップショットテスト

1. Lark BaseのURLを入力
2. 「プレビュー」をクリック
3. テーブル一覧が表示される
4. スナップショットを作成するテーブルを選択
5. 「スナップショット作成」をクリック

---

## トラブルシューティング

### 認証エラー: "Invalid state"

**原因**: OAuth state の検証に失敗

**解決策**:
1. ブラウザのCookieをクリア
2. 再度ログインを試行

### 認証エラー: "redirect_uri mismatch"

**原因**: Lark側のRedirect URIとVercel環境変数が一致していない

**解決策**:
1. Lark Open Platform のRedirect URI設定を確認
2. Vercelの `OAUTH_REDIRECT_URI` 環境変数を確認
3. 両者が完全に一致していることを確認（末尾のスラッシュにも注意）

### APIエラー: "No permission"

**原因**: 必要なスコープが有効になっていない

**解決策**:
1. Lark Open Platform で「Permissions & Scopes」を確認
2. `bitable:app` と `wiki:wiki:readonly` が有効か確認
3. アプリを再公開

### スナップショットエラー: "Base not found"

**原因**: 指定したBaseにアクセス権がない

**解決策**:
1. ログインユーザーがそのBaseにアクセス権を持っているか確認
2. Baseの共有設定を確認

---

## セキュリティに関する注意事項

1. **App Secretの管理**
   - 絶対にコードにハードコードしない
   - 環境変数でのみ管理
   - 定期的にローテーション

2. **アクセス権限**
   - 必要最小限の権限のみ付与
   - 定期的に権限を見直し

3. **ログ監視**
   - Vercelのログを定期的に確認
   - 不審なアクセスがないかチェック

---

## よくある質問

### Q: 他のテナントのBaseにアクセスできますか？

**A**: いいえ。Larkのセキュリティ仕様により、アプリは作成されたテナント内のBaseにのみアクセスできます。他テナントのBaseにアクセスするには、そのテナントで別のアプリを作成する必要があります。

### Q: 無料で使えますか？

**A**: はい。Lark Open Platform、GitHub、Vercelはすべて無料プランで利用できます。

### Q: カスタムドメインを使えますか？

**A**: はい。Vercelでカスタムドメインを設定できます。その場合、Lark側のRedirect URIも更新してください。

### Q: 複数人で同時に使えますか？

**A**: はい。各ユーザーは自分のLarkアカウントで認証し、自分がアクセス権を持つBaseのスナップショットを作成できます。

---

## サポート

問題が発生した場合は、[GitHub Issues](https://github.com/PLark-droid/Basesnapshot/issues) で報告してください。
