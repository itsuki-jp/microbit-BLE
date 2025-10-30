/**
 * micro:bit BLE UI Adapter
 * MicrobitBLEライブラリとHTMLを接続するアダプター
 */

class MicrobitUIAdapter {
  constructor(microbit, config = {}) {
    this.microbit = microbit;
    this.config = {
      statusElementId: config.statusElementId || 'status',
      messagesElementId: config.messagesElementId || 'messages',
      ...config
    };
    
    this._setupEventListeners();
  }
  
  _setupEventListeners() {
    // 接続イベント
    this.microbit.on('connection', (data) => {
      if (data.status === 'connected') {
        this.updateStatus(`接続しました: ${data.deviceName}`, true);
        this.updateButtonStates(true);
      } else if (data.status === 'requesting') {
        this.updateStatus('接続中...', false);
      }
    });
    
    // 切断イベント
    this.microbit.on('disconnection', () => {
      this.updateStatus('デバイスが切断されました', false);
      this.updateButtonStates(false);
      this.resetSensorCards();
      this.addMessage('接続が切断されました', 'system');
    });
    
    // サービス起動イベント
    this.microbit.on('service:started', (data) => {
      this.updateServiceCard(data.service, 'active', '動作中 ✓');
      
      if (data.service === 'uart') {
        this.addMessage('UART通信が有効になりました', 'received');
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = false;
      }
    });
    
    // サービス失敗イベント
    this.microbit.on('service:failed', (data) => {
      this.updateServiceCard(data.service, 'error', '利用不可');
      console.log(`✗ ${data.service}:`, data.error.message);
    });
    
    // UART受信
    this.microbit.on('uart:received', (data) => {
      this.addMessage(data.text, 'received');
    });
    
    // 温度変化
    this.microbit.on('temperature:changed', (data) => {
      this.updateElementText('temperature', `${data.temperature}℃`);
    });
    
    // 加速度計変化
    this.microbit.on('accelerometer:changed', (data) => {
      this.updateElementText('accel-x', data.x);
      this.updateElementText('accel-y', data.y);
      this.updateElementText('accel-z', data.z);
    });
    
    // ボタンA変化
    this.microbit.on('button:a:changed', (data) => {
      const element = document.getElementById('button-a');
      if (element) {
        element.textContent = data.pressed ? '押されている' : '離されている';
        element.style.color = data.pressed ? '#ff0000' : '#333';
      }
    });
    
    // ボタンB変化
    this.microbit.on('button:b:changed', (data) => {
      const element = document.getElementById('button-b');
      if (element) {
        element.textContent = data.pressed ? '押されている' : '離されている';
        element.style.color = data.pressed ? '#ff0000' : '#333';
      }
    });
    
    // 磁力計データ変化
    this.microbit.on('magnetometer:changed', (data) => {
      this.updateElementText('mag-x', data.x);
      this.updateElementText('mag-y', data.y);
      this.updateElementText('mag-z', data.z);
    });
    
    // 方位角変化
    this.microbit.on('magnetometer:bearing:changed', (data) => {
      this.updateElementText('bearing', `${data.bearing}°`);
    });
    
    // エラーイベント
    this.microbit.on('error', (data) => {
      console.error('Error:', data);
      this.updateStatus(`エラー: ${data.error.message}`, false);
    });
  }
  
  // ステータス更新
  updateStatus(message, connected) {
    const element = document.getElementById(this.config.statusElementId);
    if (element) {
      element.textContent = message;
      element.className = `status ${connected ? 'connected' : 'disconnected'}`;
    }
  }
  
  // ボタン状態更新
  updateButtonStates(connected) {
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    if (connectBtn) connectBtn.disabled = connected;
    if (disconnectBtn) disconnectBtn.disabled = !connected;
  }
  
  // メッセージ追加
  addMessage(text, type) {
    const container = document.getElementById(this.config.messagesElementId);
    if (!container) return;
    
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
  }
  
  // テキスト要素更新
  updateElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
    }
  }
  
  // サービスカード更新
  updateServiceCard(serviceName, state, statusText) {
    const cardIdMap = {
      'uart': 'uart-card',
      'temperature': 'temp-card',
      'accelerometer': 'accel-card',
      'buttons': 'button-card',
      'magnetometer': 'mag-card',
      'led': 'led-card'
    };
    
    const cardId = cardIdMap[serviceName];
    if (!cardId) return;
    
    const card = document.getElementById(cardId);
    if (!card) return;
    
    // 状態クラスを追加
    if (state === 'active') {
      card.classList.add('active');
      card.classList.remove('error');
    } else if (state === 'error') {
      card.classList.add('error');
      card.classList.remove('active');
    }
    
    // ステータステキスト更新
    let statusEl = card.querySelector('.service-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'service-status';
      card.appendChild(statusEl);
    }
    statusEl.textContent = `ステータス: ${statusText}`;
  }
  
  // センサーカードリセット
  resetSensorCards() {
    document.querySelectorAll('.sensor-card').forEach(card => {
      card.classList.remove('active', 'error');
      const statusEl = card.querySelector('.service-status');
      if (statusEl) {
        statusEl.remove();
      }
    });
  }
}

// グローバルインスタンス（後方互換性用）
let microbitInstance = null;
let uiAdapterInstance = null;

// 初期化関数
const initializeMicrobitUI = () => {
  microbitInstance = new MicrobitBLE({
    autoStartServices: true,
    serviceDelay: 300
  });
  
  uiAdapterInstance = new MicrobitUIAdapter(microbitInstance);
  
  return { microbit: microbitInstance, adapter: uiAdapterInstance };
};

// 既存のHTMLから呼び出される関数（後方互換性）
const connectToMicrobit = async () => {
  if (!microbitInstance) {
    initializeMicrobitUI();
  }
  
  try {
    await microbitInstance.connect();
  } catch (error) {
    console.error('Connection failed:', error);
  }
};

const disconnect = () => {
  if (microbitInstance) {
    microbitInstance.disconnect();
  }
};

const sendMessage = async () => {
  if (!microbitInstance) return;
  
  const input = document.getElementById('messageInput');
  if (!input) return;
  
  const text = input.value;
  
  if (!text) {
    alert('メッセージを入力してください');
    return;
  }
  
  try {
    await microbitInstance.sendUART(text);
    if (uiAdapterInstance) {
      uiAdapterInstance.addMessage(text, 'sent');
    }
    input.value = '';
  } catch (error) {
    alert('送信に失敗しました: ' + error.message);
  }
};

const sendTextToLED = async () => {
  if (!microbitInstance) return;
  
  const input = document.getElementById('ledText');
  if (!input) return;
  
  const text = input.value;
  
  if (!text) {
    alert('表示する文字を入力してください');
    return;
  }
  
  try {
    await microbitInstance.sendTextToLED(text);
    input.value = '';
    
    if (uiAdapterInstance) {
      uiAdapterInstance.updateServiceCard('led', 'active', '送信完了 ✓');
    }
    
    console.log('LEDに送信:', text);
  } catch (error) {
    alert('LED送信に失敗しました: ' + error.message);
  }
};

// Enter押下で送信
document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
  
  const ledText = document.getElementById('ledText');
  if (ledText) {
    ledText.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendTextToLED();
      }
    });
  }
});

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MicrobitUIAdapter, initializeMicrobitUI };
} else if (typeof window !== 'undefined') {
  window.MicrobitUIAdapter = MicrobitUIAdapter;
  window.initializeMicrobitUI = initializeMicrobitUI;
}
