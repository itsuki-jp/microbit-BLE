/**
 * micro:bit BLE 汎用ライブラリ
 * HTMLに依存しない、抽象的なBluetooth通信クラス
 */

const MICROBIT_UUIDS = {
  UART_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  UART_TX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  UART_RX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  
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

class MicrobitBLE {
  constructor(config = {}) {
    this.config = {
      deviceNamePrefix: config.deviceNamePrefix || 'BBC micro:bit',
      autoStartServices: config.autoStartServices ?? true,
      serviceDelay: config.serviceDelay ?? 300,
      ...config
    };
    
    this.device = null;
    this.server = null;
    this.services = new Map();
    this.characteristics = new Map();
    this.eventHandlers = new Map();
    
    this._initializeEventHandlers();
  }
  
  _initializeEventHandlers() {
    const defaultHandlers = {
      'connection': [],
      'disconnection': [],
      'uart:received': [],
      'temperature:changed': [],
      'accelerometer:changed': [],
      'button:a:changed': [],
      'button:b:changed': [],
      'magnetometer:changed': [],
      'magnetometer:bearing:changed': [],
      'service:started': [],
      'service:failed': [],
      'error': []
    };
    
    Object.keys(defaultHandlers).forEach(event => {
      this.eventHandlers.set(event, []);
    });
  }
  
  // イベントリスナー登録
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
    return this; // チェーン可能
  }
  
  // イベント発火
  _emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }
  
  // 接続
  async connect() {
    try {
      this._emit('connection', { status: 'requesting' });
      
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: this.config.deviceNamePrefix }],
        optionalServices: Object.values(MICROBIT_UUIDS)
      });
      
      this.device.addEventListener('gattserverdisconnected', () => this._handleDisconnection());
      
      this.server = await this.device.gatt.connect();
      
      if (!this.server.connected) {
        throw new Error('GATT connection failed');
      }
      
      this._emit('connection', { 
        status: 'connected', 
        deviceName: this.device.name 
      });
      
      if (this.config.autoStartServices) {
        await this._startAllServices();
      }
      
      return { success: true, device: this.device };
      
    } catch (error) {
      this._emit('error', { type: 'connection', error });
      throw error;
    }
  }
  
  // 切断
  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }
  
  // 切断ハンドラー
  _handleDisconnection() {
    this.services.clear();
    this.characteristics.clear();
    this._emit('disconnection', { deviceName: this.device?.name });
  }
  
  // 全サービス起動
  async _startAllServices() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    await sleep(500);
    
    const services = [
      { name: 'uart', method: () => this.startUART() },
      { name: 'temperature', method: () => this.startTemperature() },
      { name: 'accelerometer', method: () => this.startAccelerometer() },
      { name: 'buttons', method: () => this.startButtons() },
      { name: 'magnetometer', method: () => this.startMagnetometer(), optional: true }
    ];
    
    for (const { name, method, optional } of services) {
      try {
        await method();
        await sleep(this.config.serviceDelay);
      } catch (error) {
        if (!optional) {
          this._emit('service:failed', { service: name, error });
        }
      }
    }
  }
  
  // UART通信
  async startUART() {
    try {
      if (!this.server?.connected) {
        throw new Error('GATT not connected');
      }
      
      const service = await this.server.getPrimaryService(MICROBIT_UUIDS.UART_SERVICE);
      this.services.set('uart', service);
      
      // RX (送信用)
      const rxChar = await service.getCharacteristic(MICROBIT_UUIDS.UART_RX);
      this.characteristics.set('uart:rx', rxChar);
      
      // TX (受信用)
      const txChar = await service.getCharacteristic(MICROBIT_UUIDS.UART_TX);
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', (event) => {
        const text = new TextDecoder().decode(event.target.value);
        this._emit('uart:received', { text });
      });
      this.characteristics.set('uart:tx', txChar);
      
      this._emit('service:started', { service: 'uart' });
      
    } catch (error) {
      this._emit('service:failed', { service: 'uart', error });
      throw error;
    }
  }
  
  async sendUART(text) {
    const char = this.characteristics.get('uart:rx');
    if (!char) {
      throw new Error('UART service not started');
    }
    
    const encoder = new TextEncoder();
    await char.writeValue(encoder.encode(text + '\n'));
  }
  
  // 温度センサー
  async startTemperature() {
    try {
      if (!this.server?.connected) {
        throw new Error('GATT not connected');
      }
      
      const service = await this.server.getPrimaryService(MICROBIT_UUIDS.TEMPERATURE_SERVICE);
      this.services.set('temperature', service);
      
      const dataChar = await service.getCharacteristic(MICROBIT_UUIDS.TEMPERATURE_DATA);
      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', (event) => {
        const temperature = event.target.value.getInt8(0);
        this._emit('temperature:changed', { temperature });
      });
      this.characteristics.set('temperature:data', dataChar);
      
      this._emit('service:started', { service: 'temperature' });
      
    } catch (error) {
      this._emit('service:failed', { service: 'temperature', error });
      throw error;
    }
  }
  
  // 加速度計
  async startAccelerometer() {
    try {
      if (!this.server?.connected) {
        throw new Error('GATT not connected');
      }
      
      const service = await this.server.getPrimaryService(MICROBIT_UUIDS.ACCELEROMETER_SERVICE);
      this.services.set('accelerometer', service);
      
      const dataChar = await service.getCharacteristic(MICROBIT_UUIDS.ACCELEROMETER_DATA);
      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', (event) => {
        const x = event.target.value.getInt16(0, true);
        const y = event.target.value.getInt16(2, true);
        const z = event.target.value.getInt16(4, true);
        this._emit('accelerometer:changed', { x, y, z });
      });
      this.characteristics.set('accelerometer:data', dataChar);
      
      this._emit('service:started', { service: 'accelerometer' });
      
    } catch (error) {
      this._emit('service:failed', { service: 'accelerometer', error });
      throw error;
    }
  }
  
  // ボタン
  async startButtons() {
    try {
      if (!this.server?.connected) {
        throw new Error('GATT not connected');
      }
      
      const service = await this.server.getPrimaryService(MICROBIT_UUIDS.BUTTON_SERVICE);
      this.services.set('buttons', service);
      
      // ボタンA
      const buttonA = await service.getCharacteristic(MICROBIT_UUIDS.BUTTON_A);
      await buttonA.startNotifications();
      buttonA.addEventListener('characteristicvaluechanged', (event) => {
        const pressed = event.target.value.getUint8(0) === 1;
        this._emit('button:a:changed', { pressed });
      });
      this.characteristics.set('button:a', buttonA);
      
      // ボタンB
      const buttonB = await service.getCharacteristic(MICROBIT_UUIDS.BUTTON_B);
      await buttonB.startNotifications();
      buttonB.addEventListener('characteristicvaluechanged', (event) => {
        const pressed = event.target.value.getUint8(0) === 1;
        this._emit('button:b:changed', { pressed });
      });
      this.characteristics.set('button:b', buttonB);
      
      this._emit('service:started', { service: 'buttons' });
      
    } catch (error) {
      this._emit('service:failed', { service: 'buttons', error });
      throw error;
    }
  }
  
  // 磁力計
  async startMagnetometer() {
    try {
      if (!this.server?.connected) {
        throw new Error('GATT not connected');
      }
      
      const service = await this.server.getPrimaryService(MICROBIT_UUIDS.MAGNETOMETER_SERVICE);
      this.services.set('magnetometer', service);
      
      let hasData = false;
      
      // データ
      try {
        const dataChar = await service.getCharacteristic(MICROBIT_UUIDS.MAGNETOMETER_DATA);
        await dataChar.startNotifications();
        dataChar.addEventListener('characteristicvaluechanged', (event) => {
          const x = event.target.value.getInt16(0, true);
          const y = event.target.value.getInt16(2, true);
          const z = event.target.value.getInt16(4, true);
          this._emit('magnetometer:changed', { x, y, z });
        });
        this.characteristics.set('magnetometer:data', dataChar);
        hasData = true;
      } catch (dataError) {
        console.log('Magnetometer data characteristic not available');
      }
      
      // 方位角
      try {
        const bearingChar = await service.getCharacteristic(MICROBIT_UUIDS.MAGNETOMETER_BEARING);
        await bearingChar.startNotifications();
        bearingChar.addEventListener('characteristicvaluechanged', (event) => {
          const bearing = event.target.value.getUint16(0, true);
          this._emit('magnetometer:bearing:changed', { bearing });
        });
        this.characteristics.set('magnetometer:bearing', bearingChar);
        hasData = true;
      } catch (bearingError) {
        console.log('Magnetometer bearing characteristic not available');
      }
      
      if (hasData) {
        this._emit('service:started', { service: 'magnetometer' });
      } else {
        throw new Error('No magnetometer data available');
      }
      
    } catch (error) {
      this._emit('service:failed', { service: 'magnetometer', error });
      throw error;
    }
  }
  
  // LED制御
  async sendTextToLED(text) {
    try {
      if (!this.server?.connected) {
        throw new Error('GATT not connected');
      }
      
      let service = this.services.get('led');
      if (!service) {
        service = await this.server.getPrimaryService(MICROBIT_UUIDS.LED_SERVICE);
        this.services.set('led', service);
      }
      
      const textChar = await service.getCharacteristic(MICROBIT_UUIDS.LED_TEXT);
      const encoder = new TextEncoder();
      await textChar.writeValue(encoder.encode(text));
      
      return { success: true };
      
    } catch (error) {
      this._emit('error', { type: 'led', error });
      throw error;
    }
  }
  
  // 接続状態チェック
  isConnected() {
    return this.device?.gatt?.connected ?? false;
  }
  
  // サービス起動状態チェック
  isServiceStarted(serviceName) {
    return this.services.has(serviceName);
  }
  
  // デバイス情報取得
  getDeviceInfo() {
    return {
      name: this.device?.name,
      id: this.device?.id,
      connected: this.isConnected(),
      services: Array.from(this.services.keys())
    };
  }
}

// エクスポート（モジュール形式とグローバル両対応）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MicrobitBLE, MICROBIT_UUIDS };
} else if (typeof window !== 'undefined') {
  window.MicrobitBLE = MicrobitBLE;
  window.MICROBIT_UUIDS = MICROBIT_UUIDS;
}
