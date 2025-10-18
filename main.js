const UUIDS = {
  UART_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  UART_TX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // micro:bit → PC
  UART_RX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // PC → micro:bit
  
  TEMPERATURE_SERVICE: 'e95d6100-251d-470a-a062-fa1922dfa9a8',
  TEMPERATURE_DATA: 'e95d9250-251d-470a-a062-fa1922dfa9a8',
  TEMPERATURE_PERIOD: 'e95d1b25-251d-470a-a062-fa1922dfa9a8',
  
  ACCELEROMETER_SERVICE: 'e95d0753-251d-470a-a062-fa1922dfa9a8',
  ACCELEROMETER_DATA: 'e95dca4b-251d-470a-a062-fa1922dfa9a8',
  ACCELEROMETER_PERIOD: 'e95dfb24-251d-470a-a062-fa1922dfa9a8',
  
  BUTTON_SERVICE: 'e95d9882-251d-470a-a062-fa1922dfa9a8',
  BUTTON_A: 'e95dda90-251d-470a-a062-fa1922dfa9a8',
  BUTTON_B: 'e95dda91-251d-470a-a062-fa1922dfa9a8',
  
  MAGNETOMETER_SERVICE: 'e95df2d8-251d-470a-a062-fa1922dfa9a8',
  MAGNETOMETER_DATA: 'e95dfb11-251d-470a-a062-fa1922dfa9a8',
  MAGNETOMETER_PERIOD: 'e95d386c-251d-470a-a062-fa1922dfa9a8',
  MAGNETOMETER_BEARING: 'e95d9715-251d-470a-a062-fa1922dfa9a8',
  
  LED_SERVICE: 'e95dd91d-251d-470a-a062-fa1922dfa9a8',
  LED_TEXT: 'e95d93ee-251d-470a-a062-fa1922dfa9a8',
};

let targetDevice = null;
let gattServer = null;
let uartTxChar = null; // micro:bitから受信
let uartRxChar = null; // micro:bitへ送信

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectToMicrobit = async () => {
  try {
    updateStatus('接続中...', false);
    
    targetDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BBC micro:bit" }],
      optionalServices: Object.values(UUIDS)
    });
    
    console.log('デバイス:', targetDevice.name);
    targetDevice.addEventListener('gattserverdisconnected', onDisconnected);
    
    gattServer = await targetDevice.gatt.connect();
    console.log('GATT接続成功');
    
    if (!gattServer.connected) {
      throw new Error('接続に失敗しました');
    }
    
    updateStatus(`接続しました: ${targetDevice.name}`, true);
    document.getElementById('connectBtn').disabled = true;
    document.getElementById('disconnectBtn').disabled = false;
    
    await sleep(500);
    
    // UARTサービスを最初に起動
    await startUART();
    await sleep(300);
    
    await startTemperature();
    await sleep(300);
    
    await startAccelerometer();
    await sleep(300);
    
    await startButtons();
    await sleep(300);
    
    // 磁力計は問題が起きやすいので、失敗しても続行
    try {
      await startMagnetometer();
    } catch(error) {
      console.log('磁力計の起動をスキップしました');
      addMessage('磁力計は利用できません（他のセンサーは正常動作中）', 'system');
    }
    
  } catch(error) {
    console.error('接続エラー:', error);
    updateStatus('接続に失敗しました: ' + error.message, false);
    if (targetDevice?.gatt?.connected) {
      targetDevice.gatt.disconnect();
    }
  }
};

// UARTサービス（文字列送受信）
const startUART = async () => {
  const cardId = 'uart-card';
  try {
    updateServiceStatus(cardId, '起動中...');
    
    if (!gattServer?.connected) {
      throw new Error('GATT未接続');
    }
    
    const service = await gattServer.getPrimaryService(UUIDS.UART_SERVICE);
    
    // micro:bitから受信（TX Characteristic）
    uartTxChar = await service.getCharacteristic(UUIDS.UART_TX);
    await uartTxChar.startNotifications();
    uartTxChar.addEventListener('characteristicvaluechanged', onUARTReceived);
    
    // micro:bitへ送信用（RX Characteristic）
    uartRxChar = await service.getCharacteristic(UUIDS.UART_RX);
    
    updateServiceStatus(cardId, '動作中 ✓');
    document.getElementById(cardId).classList.add('active');
    document.getElementById('sendBtn').disabled = false;
    addMessage('UART通信が有効になりました', 'received');
    console.log('✓ UART起動');
    
  } catch(error) {
    console.log('✗ UART:', error.message);
    updateServiceStatus(cardId, '利用不可');
    document.getElementById(cardId).classList.add('error');
    addMessage('UART通信が利用できません', 'system');
  }
};

// micro:bitから文字列を受信したとき
const onUARTReceived = (event) => {
  const decoder = new TextDecoder();
  const text = decoder.decode(event.target.value);
  console.log('受信:', text);
  addMessage(text, 'received');
};

// micro:bitへ文字列を送信
const sendMessage = async () => {
  try {
    const input = document.getElementById('messageInput');
    const text = input.value;
    
    if (!text) {
      alert('メッセージを入力してください');
      return;
    }
    
    if (!uartRxChar) {
      alert('UARTサービスが利用できません');
      return;
    }
    
    const encoder = new TextEncoder();
    await uartRxChar.writeValue(encoder.encode(text + '\n'));
    
    console.log('送信:', text);
    addMessage(text, 'sent');
    input.value = '';
    
  } catch(error) {
    console.error('送信エラー:', error);
    alert('送信に失敗しました: ' + error.message);
  }
};

// メッセージを表示
const addMessage = (text, type) => {
  const container = document.getElementById('messages');
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  
  const time = new Date().toLocaleTimeString('ja-JP');
  const typeLabels = {
    received: '📥 受信',
    sent: '📤 送信',
    system: 'ℹ️ システム'
  };
  const typeLabel = typeLabels[type] || 'ℹ️ システム';
  
  msg.innerHTML = `<strong>${typeLabel}:</strong> ${text} <span class="message-time">${time}</span>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
};

// 温度センサー（Period設定なし）
const startTemperature = async () => {
  const cardId = 'temp-card';
  try {
    updateServiceStatus(cardId, '起動中...');
    
    if (!gattServer?.connected) {
      throw new Error('GATT未接続');
    }
    
    const service = await gattServer.getPrimaryService(UUIDS.TEMPERATURE_SERVICE);
    
    const dataChar = await service.getCharacteristic(UUIDS.TEMPERATURE_DATA);
    await dataChar.startNotifications();
    dataChar.addEventListener('characteristicvaluechanged', (event) => {
      const temp = event.target.value.getInt8(0);
      document.getElementById('temperature').textContent = `${temp}℃`;
    });
    
    updateServiceStatus(cardId, '動作中 ✓');
    document.getElementById(cardId).classList.add('active');
    console.log('✓ 温度センサー起動');
    
  } catch(error) {
    console.log('✗ 温度センサー:', error.message);
    updateServiceStatus(cardId, '利用不可');
    document.getElementById(cardId).classList.add('error');
  }
};

// 加速度計（Period設定なし）
const startAccelerometer = async () => {
  const cardId = 'accel-card';
  try {
    updateServiceStatus(cardId, '起動中...');
    
    if (!gattServer?.connected) {
      throw new Error('GATT未接続');
    }
    
    const service = await gattServer.getPrimaryService(UUIDS.ACCELEROMETER_SERVICE);
    
    const dataChar = await service.getCharacteristic(UUIDS.ACCELEROMETER_DATA);
    await dataChar.startNotifications();
    dataChar.addEventListener('characteristicvaluechanged', (event) => {
      const x = event.target.value.getInt16(0, true);
      const y = event.target.value.getInt16(2, true);
      const z = event.target.value.getInt16(4, true);
      document.getElementById('accel-x').textContent = x;
      document.getElementById('accel-y').textContent = y;
      document.getElementById('accel-z').textContent = z;
    });
    
    updateServiceStatus(cardId, '動作中 ✓');
    document.getElementById(cardId).classList.add('active');
    console.log('✓ 加速度計起動');
    
  } catch(error) {
    console.log('✗ 加速度計:', error.message);
    updateServiceStatus(cardId, '利用不可');
    document.getElementById(cardId).classList.add('error');
  }
};

// ボタン
const startButtons = async () => {
  const cardId = 'button-card';
  try {
    updateServiceStatus(cardId, '起動中...');
    
    if (!gattServer?.connected) {
      throw new Error('GATT未接続');
    }
    
    const service = await gattServer.getPrimaryService(UUIDS.BUTTON_SERVICE);
    
    const buttonA = await service.getCharacteristic(UUIDS.BUTTON_A);
    await buttonA.startNotifications();
    buttonA.addEventListener('characteristicvaluechanged', (event) => {
      const state = event.target.value.getUint8(0);
      const element = document.getElementById('button-a');
      element.textContent = state === 1 ? '押されている' : '離されている';
      element.style.color = state === 1 ? '#ff0000' : '#333';
    });
    
    const buttonB = await service.getCharacteristic(UUIDS.BUTTON_B);
    await buttonB.startNotifications();
    buttonB.addEventListener('characteristicvaluechanged', (event) => {
      const state = event.target.value.getUint8(0);
      const element = document.getElementById('button-b');
      element.textContent = state === 1 ? '押されている' : '離されている';
      element.style.color = state === 1 ? '#ff0000' : '#333';
    });
    
    updateServiceStatus(cardId, '動作中 ✓');
    document.getElementById(cardId).classList.add('active');
    console.log('✓ ボタン監視起動');
    
  } catch(error) {
    console.log('✗ ボタン:', error.message);
    updateServiceStatus(cardId, '利用不可');
    document.getElementById(cardId).classList.add('error');
  }
};

// 磁力計（Period設定なし）
const startMagnetometer = async () => {
  const cardId = 'mag-card';
  try {
    updateServiceStatus(cardId, '起動中...');
    
    if (!gattServer?.connected) {
      throw new Error('GATT未接続');
    }
    
    const service = await gattServer.getPrimaryService(UUIDS.MAGNETOMETER_SERVICE);
    
    let hasData = false;
    
    // データ取得
    try {
      const dataChar = await service.getCharacteristic(UUIDS.MAGNETOMETER_DATA);
      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', (event) => {
        const x = event.target.value.getInt16(0, true);
        const y = event.target.value.getInt16(2, true);
        const z = event.target.value.getInt16(4, true);
        document.getElementById('mag-x').textContent = x;
        document.getElementById('mag-y').textContent = y;
        document.getElementById('mag-z').textContent = z;
      });
      console.log('✓ 磁力計データ取得開始');
      hasData = true;
    } catch(dataError) {
      console.log('✗ 磁力計データ取得失敗:', dataError.message);
    }
    
    // 方位角取得
    try {
      const bearingChar = await service.getCharacteristic(UUIDS.MAGNETOMETER_BEARING);
      await bearingChar.startNotifications();
      bearingChar.addEventListener('characteristicvaluechanged', (event) => {
        const bearing = event.target.value.getUint16(0, true);
        document.getElementById('bearing').textContent = `${bearing}°`;
      });
      console.log('✓ 方位角取得開始');
      hasData = true;
    } catch(bearingError) {
      console.log('✗ 方位角取得失敗:', bearingError.message);
    }
    
    if (hasData) {
      updateServiceStatus(cardId, '動作中 ✓');
      document.getElementById(cardId).classList.add('active');
      console.log('✓ 磁力計起動');
    } else {
      throw new Error('データ取得に失敗');
    }
    
  } catch(error) {
    console.log('✗ 磁力計:', error.message);
    updateServiceStatus(cardId, '利用不可');
    document.getElementById(cardId).classList.add('error');
    throw error;
  }
};

// LEDに文字を表示
const sendTextToLED = async () => {
  try {
    if (!gattServer?.connected) {
      alert('micro:bitに接続してください');
      return;
    }
    
    const input = document.getElementById('ledText');
    const text = input.value;
    if (!text) {
      alert('表示する文字を入力してください');
      return;
    }
    
    const service = await gattServer.getPrimaryService(UUIDS.LED_SERVICE);
    const textChar = await service.getCharacteristic(UUIDS.LED_TEXT);
    
    const encoder = new TextEncoder();
    await textChar.writeValue(encoder.encode(text));
    input.value = '';

    console.log('LEDに送信:', text);
    updateServiceStatus('led-card', '送信完了 ✓');
    document.getElementById('led-card').classList.add('active');
    
  } catch(error) {
    console.error('LED送信エラー:', error);
    alert('LED送信に失敗しました: ' + error.message);
  }
};

// Enter押下で送信
document.addEventListener('DOMContentLoaded', () => {
  // メッセージ送信用
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // LED送信用
  document.getElementById('ledText').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendTextToLED();
    }
  });
});

const onDisconnected = () => {
  console.log('デバイスが切断されました');
  updateStatus('デバイスが切断されました', false);
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('disconnectBtn').disabled = true;
  document.getElementById('sendBtn').disabled = true;
  
  uartTxChar = null;
  uartRxChar = null;
  
  document.querySelectorAll('.sensor-card').forEach(card => {
    card.classList.remove('active');
  });
  
  addMessage('接続が切断されました', 'system');
};

const updateServiceStatus = (cardId, status) => {
  const card = document.getElementById(cardId);
  if (!card) return;
  
  let statusEl = card.querySelector('.service-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'service-status';
    card.appendChild(statusEl);
  }
  statusEl.textContent = `ステータス: ${status}`;
};

const disconnect = () => {
  if (targetDevice?.gatt?.connected) {
    targetDevice.gatt.disconnect();
  }
};

const updateStatus = (message, connected) => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${connected ? 'connected' : 'disconnected'}`;
};
