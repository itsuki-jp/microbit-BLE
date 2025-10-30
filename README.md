# microbit-BLE プロジェクト全体概要

このリポジトリは micro:bit と Bluetooth Low Energy (BLE) で連携するためのサンプルを 2 つのアプローチでまとめています。

- `html-js/` … Web Bluetooth API を使い、ブラウザから micro:bit と接続してメッセージ送受信やセンサー値の表示を行うシングルページアプリ。`index.html` をブラウザで直接開くだけで動作します。
- `webhook-python/` … micro:bit の各種 Characteristic を購読する Python 製 BLE ロガー。ターミナル表示に加えて Webhook への JSON POST も行えます。

どちらも micro:bit 側で必要な Bluetooth サービスを有効化しておく前提です。MakeCode であれば「Bluetooth」拡張を追加し、`on start` ブロック内で必要なサービス開始ブロック（`bluetooth.startButtonService()` など）を呼び出してください。

---

## ディレクトリ構成

```
html-js/          Web Bluetooth 対応のブラウザアプリ
  ├─ index.html
  ├─ main.js
  ├─ microbit-ble-lib.js
  ├─ microbit-ui-adapter.js
  ├─ style.css
  └─ README.md      … アプリの詳細な使い方

webhook-python/   Python 製 BLE ロガー
  ├─ microbit_logger.py
  ├─ requirements.txt
  └─ README.md      … コマンドのセットアップと利用手順
```

---

## 前提条件

- micro:bit が PC とペアリング済みで、Bluetooth として利用できること。
- Windows / macOS / Linux いずれの環境でも動作しますが、ブラウザは Web Bluetooth をサポートする Chrome 系を推奨します。
- Python ツールを使う場合は Python 3.10 以上、`pip` が利用できること。

---

## html-js（ブラウザアプリ）の使い方

1. `html-js/index.html` を対応ブラウザ（Chrome / Edge などの Web Bluetooth 対応ブラウザ）で開きます。ファイルパスを直接開いて問題ありません。

2. 「接続」ボタンを押して micro:bit を選択します。

3. 接続後は以下のような操作ができます。
   - UART 経由でメッセージ送受信（`Send` ボタン、LED へのテキスト表示など）
   - ボタン、加速度、温度、磁力などのセンサーのリアルタイム表示
   - 必要に応じたイベント表示（microbit-ble-lib.js に実装済み）

詳細な UI 操作やカスタマイズ方法は `html-js/README.md` を参照してください。

---

## webhook-python（Python ロガー）の使い方

1. 仮想環境を作成して依存をインストールします（任意）。
   ```powershell
   cd webhook-python
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. micro:bit 側で必要な Bluetooth サービスを開始しておきます。UART の文字列送信やイベント発火もこの段階でコード化してください。

3. ロガーを起動します。
   ```powershell
   python microbit_logger.py --duration 10 -v
   ```

   1 秒ごとに最新の通知がまとめて表示されます。Webhook へ転送する場合は以下のように指定します。
   ```powershell
   python microbit_logger.py `
     --webhook-url https://webhook.site/xxxx `
     --webhook-mode batch `
     -wc temperature -wc uart_tx
   ```

詳しいオプションは `webhook-python/README.md` に整理してあります。

---

## よくあるトラブル

- **Characteristic の購読に失敗する**  
  micro:bit 側で対応する Bluetooth サービスを開始していない可能性があります。MakeCode では `bluetooth.start〇〇Service()` ブロックを確認してください。

- **ブラウザから接続できない**  
  Web Bluetooth は HTTPS（または localhost）でないと動作しません。ローカルサーバ経由で配信してください。

- **Webhook が失敗する**  
  ネットワーク環境、URL、認証情報などを確認してください。Python ロガーでは `-vv` で詳細なエラーログを確認できます。

---

## ライセンス

このリポジトリ内のサンプルは学習・検証用途で自由に利用・改変して構いません。プロダクション利用時は各自の責任で十分な動作確認と安全対策を行ってください。
- **ブラウザから接続できない**  
  利用中のブラウザが Web Bluetooth に対応しているか確認してください（Chrome / Edge 推奨）。また、ローカルファイルを開けない場合は `http://localhost` などで配信すると解消することがあります。
