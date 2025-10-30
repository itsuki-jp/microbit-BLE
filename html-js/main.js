let microbitInstance = null;
let uiAdapter = null;

const initializeApp = () => {
  microbitInstance = new MicrobitBLE({
    autoStartServices: true,
    serviceDelay: 300
  });
  
  uiAdapter = new MicrobitUIAdapter(microbitInstance);
  
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    messageInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        sendMessage();
      }
    });
  }
  
  const ledInput = document.getElementById('ledText');
  if (ledInput) {
    ledInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        sendTextToLED();
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', initializeApp);

const connectToMicrobit = async () => {
  if (!microbitInstance) {
    return;
  }
  
  try {
    uiAdapter.updateStatus('接続中...', false);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    
    await microbitInstance.connect();
    
  } catch (error) {
    console.error('接続エラー:', error);
    uiAdapter.updateStatus(`接続に失敗しました: ${error.message}`, false);
    uiAdapter.updateButtonStates(false);
    
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
      connectBtn.disabled = false;
    }
  }
};

const disconnect = () => {
  if (!microbitInstance) {
    return;
  }
  microbitInstance.disconnect();
};

const sendMessage = async () => {
  if (!microbitInstance || !uiAdapter) {
    return;
  }
  
  const input = document.getElementById('messageInput');
  if (!input) {
    return;
  }
  
  const text = input.value;
  if (!text) {
    alert('メッセージを入力してください');
    return;
  }
  
  if (!microbitInstance.isServiceStarted('uart')) {
    alert('UARTサービスが利用できません');
    return;
  }
  
  try {
    await microbitInstance.sendUART(text);
    uiAdapter.addMessage(text, 'sent');
    input.value = '';
  } catch (error) {
    console.error('送信エラー:', error);
    alert('送信に失敗しました: ' + error.message);
  }
};

const sendTextToLED = async () => {
  if (!microbitInstance || !uiAdapter) {
    return;
  }
  
  if (!microbitInstance.isConnected()) {
    alert('micro:bitに接続してください');
    return;
  }
  
  const input = document.getElementById('ledText');
  if (!input) {
    return;
  }
  
  const text = input.value;
  if (!text) {
    alert('表示する文字を入力してください');
    return;
  }
  
  try {
    await microbitInstance.sendTextToLED(text);
    uiAdapter.updateServiceCard('led', 'active', '送信完了 ✓');
    input.value = '';
  } catch (error) {
    console.error('LED送信エラー:', error);
    uiAdapter.updateServiceCard('led', 'error', '送信失敗');
    alert('LED送信に失敗しました: ' + error.message);
  }
};
