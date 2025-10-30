# micro:bit BLE Logger

`microbit_logger.py` は BBC micro:bit と Bluetooth Low Energy (BLE) で接続し、ボタン・加速度・温度などの通知をターミナルへ表示するツールです。接続後は指定した秒数 (既定 10 秒) だけ通知を受け取り、自動で切断して終了します。

## セットアップ

1. **Python 仮想環境の作成 (任意)**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **micro:bit の準備**
   - MakeCode などで Bluetooth 拡張を追加し、必要なサービスを開始するブロックを `on start` 等で呼び出してください。例: `bluetooth.startButtonService()`, `bluetooth.startAccelerometerService()`, `bluetooth.startTemperatureService()`, 必要なら `bluetooth.startEventService()`。
   - ボタン入力やセンサー値が変化すると通知が飛ぶようになります。イベントサービスを使う場合は、`bluetooth.raiseEvent()` などでイベントを発火するコードを書いてください。
   - PC と micro:bit をペアリングしておきます。

## 実行例

```powershell
python microbit_logger.py --name "BBC micro:bit" --duration 10 -v
```

実行結果例 (1 秒ごとに最新値をまとめて出力):
```
[1735601234.000]
  button_a: state=1 (pressed)
  accelerometer: x=-16mg y=8mg z=1024mg
```

- `--address` を指定すると BLE アドレスで直接接続します。指定しない場合は `--name` (既定値 `BBC micro:bit`) で部分一致するデバイスをスキャンします。
- `--duration` を変更すると受信を続ける秒数を指定できます。
- `--characteristic` (`-c`) を複数回指定すると、監視する特定の characteristic だけに絞れます。初期値は `uart_tx`, `event`, `button_a`, `button_b`, `accelerometer`, `temperature`, `magnetometer`, `magnetometer_bearing`。
- `-v` を付けるとログが増え、接続状況などを確認できます。さらに `-vv` にするとデバッグログが出力されます。

## トラブルシュート

- **Event characteristic not found と表示される**  
  -> `--characteristic event` を監視対象にしている場合に発生します。micro:bit のプログラムで Bluetooth Event Service を有効化し、`bluetooth.raiseEvent()` などでイベントを送信しているか確認してください。不要であれば `-c event` を外してください。

- **接続できない**  
  -> PC 側でペアリング済みか確認し、`--scan-timeout` を延長するか、`--address` で直接指定してみてください。

- **イベントが来ない**  
  -> micro:bit 側のコードが対応するサービスを開始し、通知が発生する操作をしているか確認します (例: `bluetooth.startUartService()` を呼び出して UART 文字列を送る、`bluetooth.startMagnetometerService()` で磁力を有効化して振る)。

## 注意事項

- このツールは micro:bit が BLE Event Service を提供していることを前提としています。
- Windows で実行する場合、初回接続時にペアリングが必要になることがあります。
