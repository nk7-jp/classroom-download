# File Download for Google Classroom

Google Classroom の配布資料（PDF・Word など）をワンクリックで保存できるChrome拡張。Chromeウェブストアで一般公開している。

- ストア：https://chromewebstore.google.com/detail/file-download-for-google/gfgojammcmfoeklgfkjcchhhfjildnae
- ストアのID：`gfgojammcmfoeklgfkjcchhhfjildnae`

## フォルダ構成

```
extension/
  manifest.json   … 拡張全体の設定。バージョンはここ
  background.js   … ダウンロード処理（downloads 権限）
  content.js/css  … Classroom のページに保存ボタンを出す
  viewer.js       … Drive のビューアで開いたファイル用
  icons/
```

## 更新のしかた

1. `extension/` の中のファイルを直す
2. `extension/manifest.json` の `version` を上げる（例：1.2.0 → 1.2.1）
3. main に push する

version が上がっていれば GitHub Actions（`.github/workflows/release.yml`）が zip を作ってリリースに付け、Chrome ウェブストアにアップロードして審査に出す（Secrets が設定してあるときだけ）。version を上げずに push した場合は、コードが保存されるだけ。

### ストア提出に使う Secrets

| 名前 | 中身 |
|---|---|
| `CWS_CLIENT_ID` | Google Cloud の OAuth クライアントID |
| `CWS_CLIENT_SECRET` | 同じクライアントのシークレット |
| `CWS_REFRESH_TOKEN` | `https://www.googleapis.com/auth/chromewebstore` で取ったリフレッシュトークン |
| `CWS_PUBLISHER_ID` | デベロッパーダッシュボードの「アカウント」に出るパブリッシャーID |

NK7 Tools と同じ値を使える。

## 手元で試すとき

chrome://extensions →「デベロッパー モード」をオン →「パッケージ化されていない拡張機能を読み込む」で `extension/` フォルダを選ぶ。ストア版はOFFにしておく。

## ライセンス

[MIT License](LICENSE)
