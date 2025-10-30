# micro:bit BLE双方向通信プロジェクト

micro:bit v2とPCをBluetooth（BLE）で接続し、センサーデータの取得と双方向通信を実現するプロジェクトです。

https://itsuki-jp.github.io/microbit-BLE/

<img width="1406" height="1118" alt="image" src="https://github.com/user-attachments/assets/dd2b4f3f-e837-4169-8a6d-d7e6c0e6b5b7" />


## 🎯 機能

### センサーデータ取得
- 🌡️ **温度センサー** - リアルタイム温度測定
- 📐 **加速度計** - X/Y/Z軸の加速度データ
- 🔘 **ボタン** - A/Bボタンの押下状態検知
- 🧭 **磁力計** - 磁場測定とコンパス方位角

### 双方向通信
- 💬 **UART通信** - PCとmicro:bit間でテキストメッセージを送受信
- 💡 **LED制御** - PCからmicro:bitのLEDに文字を表示

## 📋 必要なもの

### ハードウェア
- micro:bit v2（v1でも動作しますが、一部機能が制限される場合があります）
- PC（Windows/Mac/Linux）
- USBケーブル（micro:bitへのプログラム転送用）

### ソフトウェア
- **Webブラウザ**: Chrome、Edge、Opera（Web Bluetooth API対応）
  - ⚠️ Safari、Firefoxは現在Web Bluetooth APIに未対応
  - ローカルHTMLファイルで動作します（サーバー不要）
- **MakeCode**: micro:bitのプログラミング用
  - https://makecode.microbit.org/

## 🚀 セットアップ

### 1. micro:bit側のプログラム

諸々がめんどくさかったら、https://makecode.microbit.org/_XhAcrhiEKA25 編集 -> ダウンロード でmirco:bit に送信して使える


1. makecodeの「プロジェクトの設定」にて `No Pairing Required: Anyone can connect via Bluetooth.` を選択
2. 拡張機能から `bluetooth` を検索、選択、追加
<img width="761" height="237" alt="image" src="https://github.com/user-attachments/assets/34074de9-0639-4136-a5ac-943daea6c36d" />

3.  
MakeCodeで以下のプログラムを作成


<img width="886" height="1185" alt="image" src="https://github.com/user-attachments/assets/36a27964-726a-4ddd-a626-6341d73911fd" />


#### 最初だけ
```
最初だけ
  └ Bluetooth UARTサービス
  └ Bluetooth 加速度計サービス
  └ Bluetooth ボタンサービス
  └ Bluetooth 入出力端子サービス
  └ Bluetooth LEDサービス
  └ Bluetooth 温度計サービス
  └ Bluetooth 磁力計サービス
```

#### ボタンイベント
```
ボタンAが押されたとき
  └ Bluetooth UART 文字列を書き出す "Button A"

ボタンBが押されたとき
  └ Bluetooth UART 文字列を書き出す "Button B"
```

#### PCからのメッセージ受信
```
Bluetooth データを受信したとき 区切り文字
  └ もし Bluetooth UART つぎのいずれかの文字の手前まで読み取る = "1" なら
      アイコンを表示 ❤️
    でなければ
      アイコンを表示 ✓
```

#### 接続状態の表示
```
Bluetooth 接続されたとき
  └ アイコンを表示 ✓

Bluetooth 接続が切断されたとき
  └ アイコンを表示 ✗
```

**プログラムをmicro:bitに転送してください。**

### 2. PC側のセットアップ

1. HTMLファイルをPCに保存
2. 保存したHTMLファイルをChrome/Edgeで開く
   - ファイルをダブルクリック、または
   - ブラウザのアドレスバーにファイルパスを入力

#### オプション: Webサーバーを使う場合
開発時にHTTPサーバーを使いたい場合：
- VSCode: Live Server拡張機能
- Python: `python -m http.server 8000`

## 💻 使い方

### 接続

1. **micro:bitの電源を入れる**
2. ブラウザで「**micro:bitに接続**」ボタンをクリック
3. ポップアップから「**BBC micro:bit [xxxxx]**」を選択
4. 「**ペア設定**」をクリック

### 機能の使用

#### メッセージ送信（UART通信）
- 左側のテキストボックスにメッセージを入力
- 「送信」ボタンまたはEnterキーで送信
- micro:bitがメッセージを受信して反応

#### LED制御
- 右側のLEDセクションに表示したい文字を入力
- 「送信」ボタンまたはEnterキーでmicro:bitのLEDに表示

#### センサーデータ
- 接続すると自動的にリアルタイムでデータが表示される
- 各センサーカードに現在の値が表示される

#### micro:bitからPC へ
- ボタンA/Bを押すと、PCのメッセージログに表示される
- micro:bitのプログラムで任意のメッセージを送信可能

## 🔧 トラブルシューティング

### 接続できない

**症状**: デバイス選択画面にmicro:bitが表示されない

**解決方法**:
1. micro:bitの電源が入っているか確認
2. Bluetoothがオンになっているか確認（PC側）
3. 他のデバイスとペアリングされていないか確認
4. micro:bitを再起動（電源を入れ直す）

### センサーが動作しない

**症状**: 特定のセンサーが「利用不可」と表示される

**解決方法**:
1. micro:bit側のプログラムで該当のBluetoothサービスが有効になっているか確認
2. ページをリロード（Ctrl+Shift+R / Cmd+Shift+R）
3. 接続し直す

### 磁力計が動作しない

**原因**: 多数のBluetoothサービスを同時使用するとメモリ不足になる場合があります

**解決方法**:
- 磁力計は他のセンサーより負荷が高いため、必要なければmicro:bit側で無効化
- または、他のサービスを減らして磁力計のみ使用

### HTTPSエラー

**症状**: Web Bluetooth APIが使えないというエラー

**解決方法**:
- Chrome/Edgeなど対応ブラウザを使用
- ローカルファイル（`file://`）で開く
- または `localhost` / `127.0.0.1` でアクセスする

## 📚 技術仕様

### 使用しているBluetooth Services

| サービス | UUID | 説明 |
|---------|------|------|
| UART Service | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | 文字列送受信 |
| Temperature Service | `e95d6100-251d-470a-a062-fa1922dfa9a8` | 温度測定 |
| Accelerometer Service | `e95d0753-251d-470a-a062-fa1922dfa9a8` | 加速度計 |
| Button Service | `e95d9882-251d-470a-a062-fa1922dfa9a8` | ボタン検知 |
| Magnetometer Service | `e95df2d8-251d-470a-a062-fa1922dfa9a8` | 磁力計 |
| LED Service | `e95dd91d-251d-470a-a062-fa1922dfa9a8` | LED制御 |

### データフォーマット

- **温度**: Int8 (符号付き8ビット整数) - 単位: ℃
- **加速度**: Int16 LE (リトルエンディアン16ビット) × 3軸
- **磁力**: Int16 LE × 3軸
- **ボタン**: UInt8 (0=離されている, 1=押されている)
- **UART**: UTF-8エンコードされた文字列

## 🎓 学習リソース

- [micro:bit 公式サイト](https://microbit.org/)
- [MakeCode for micro:bit](https://makecode.microbit.org/)
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [micro:bit Bluetooth Profile](https://lancaster-university.github.io/microbit-docs/ble/profile/)

## ⚙️ 開発環境

- micro:bit runtime v2
- Web Bluetooth API
- HTML5 / JavaScript (ES6+)
- Chrome/Edge 最新版

## 📝 ライセンス

このプロジェクトはMITライセンスの元で公開されています。

## 🤝 貢献

バグ報告や機能追加の提案は、Issueで受け付けています。

---

**作成日**: 2025年10月
**対応バージョン**: micro:bit v2
