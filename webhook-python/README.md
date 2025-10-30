# micro:bit BLE ロガー

`microbit_logger.py` は BBC micro:bit と Bluetooth Low Energy (BLE) で接続し、ボタン・加速度・温度・磁力・UART などの通知を 1 秒ごとにまとめて表示するツールです。Webhook URL を指定すれば、受信した値を JSON で POST することもできます。

## セットアップ

1. **Python 仮想環境の作成（任意）**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **micro:bit 側の準備**
   - MakeCode などで Bluetooth 拡張を追加し、`on start` で必要なサービスを開始してください。例:
     - ボタン: `bluetooth.startButtonService()`
     - 加速度: `bluetooth.startAccelerometerService()`
     - 温度: `bluetooth.startTemperatureService()`
     - 磁力: `bluetooth.startMagnetometerService()`
     - UART: `bluetooth.startUartService()`
     - イベント: `bluetooth.startEventService()`
   - UART で文字列を送る場合は `bluetooth.uartWriteString()`、イベントは `bluetooth.raiseEvent()` などを利用します。
   - PC と micro:bit をペアリングしておきます。

## 使い方

### 基本

```powershell
python microbit_logger.py --name "BBC micro:bit" --duration 10 -v
```

実行すると 10 秒間通知を購読し、下記のように 1 秒単位で最新値を表示します。

```
[1735601234.000]
  button_a: 状態コード=1（押された）
  accelerometer: x=-16mg y=8mg z=1024mg
  temperature: 24℃
```

### Webhook 連携

受信したデータを Webhook にまとめて送る場合:

```powershell
python microbit_logger.py `
  --webhook-url https://webhook.site/xxxx `
  --webhook-mode batch `
  -wc temperature -wc uart_tx
```

`--webhook-mode immediate` を指定すると、通知を受け取るたびに即時送信します。

## 主なオプション

- `--address` / `--name` … 接続先 micro:bit の指定。既定は `--name "BBC micro:bit"`。
- `--scan-timeout` … デバイス探索時間（秒）。
- `--duration` … 通知を購読する時間（秒）。
- `--characteristic` / `-c` … 監視したい characteristic を限定（複数指定可）。未指定時は主要な characteristic をすべて購読。
- `--webhook-url` … Webhook へ JSON POST する場合に指定。
- `--webhook-mode` … `batch`（1 秒ごとにまとめ送信、既定）または `immediate`（通知ごと）。
- `--webhook-characteristic` / `-wc` … Webhook に含める characteristic を限定。
- `-v` / `-vv` … ログの詳細度（INFO / DEBUG）。

## トラブルシュート

- **購読できない characteristic がある**  
  コマンド出力に `購読できなかった characteristic...` と表示される場合は、micro:bit 側で対応するサービスが開始されているか確認してください。

- **温度が表示されない**  
  `bluetooth.startTemperatureService()` を呼び出しているか確認し、MakeCode なら温度センサーを参照するブロックを置くと確実です。

- **UART が届かない**  
  `bluetooth.startUartService()` を呼び `bluetooth.uartWriteString()` などで送信してください。必要に応じて `-c uart_tx` を指定します。

- **Webhook が失敗する**  
  ネットワーク環境や URL を確認し、`-vv` で詳細ログを有効にするとエラー内容を追いやすくなります。
