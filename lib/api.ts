import { RealtimeEventHandler } from './event_handler';
import { RealtimeUtils } from './utils';

interface RealtimeAPISettings {
  url?: string;
  apiKey?: string;
  dangerouslyAllowAPIKeyInBrowser?: boolean;
  debug?: boolean;
}

interface ConnectSettings {
  model?: string;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

declare const globalThis: {
  document?: any;
  WebSocket?: typeof WebSocket;
};

export class RealtimeAPI extends RealtimeEventHandler {
  private defaultUrl: string;
  private url: string;
  private apiKey: string | null;
  private debug: boolean;
  private ws: WebSocket | null;

  /**
   * Create a new RealtimeAPI instance
   */
  constructor({ url, apiKey, dangerouslyAllowAPIKeyInBrowser, debug }: RealtimeAPISettings = {}) {
    super();
    this.defaultUrl = 'wss://api.openai.com/v1/realtime';
    this.url = url || this.defaultUrl;
    this.apiKey = apiKey || null;
    this.debug = !!debug;
    this.ws = null;

    if (globalThis.document && this.apiKey) {
      if (!dangerouslyAllowAPIKeyInBrowser) {
        throw new Error(
          'Can not provide API key in the browser without "dangerouslyAllowAPIKeyInBrowser" set to true'
        );
      }
    }
  }

  /**
   * Tells us whether or not the WebSocket is connected
   */
  isConnected(): boolean {
    return !!this.ws;
  }

  /**
   * Writes WebSocket logs to console
   */
  log(...args: any[]): true {
    const date = new Date().toISOString();
    const logs = [`[Websocket/${date}]`].concat(args).map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg, null, 2);
      } else {
        return arg;
      }
    });
    if (this.debug) {
      console.log(...logs);
    }
    return true;
  }

  /**
   * Connects to Realtime API Websocket Server
   */
  async connect({ model }: ConnectSettings = { model: 'gpt-4o-realtime-preview-2024-12-17' }): Promise<true> {
    if (!this.apiKey && this.url === this.defaultUrl) {
      console.warn(`No apiKey provided for connection to "${this.url}"`);
    }
    if (this.isConnected()) {
      throw new Error('Already connected');
    }

    if (globalThis.WebSocket) {
      /**
       * Web browser
       */
      if (globalThis.document && this.apiKey) {
        console.warn(
          'Warning: Connecting using API key in the browser, this is not recommended'
        );
      }
      const WebSocket = globalThis.WebSocket;
      const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [
        'realtime',
        `openai-insecure-api-key.${this.apiKey}`,
        'openai-beta.realtime-v1',
      ]);

      ws.addEventListener('message', (event: MessageEvent) => {
        const message = JSON.parse(event.data) as WebSocketMessage;
        this.receive(message.type, message);
      });

      return new Promise((resolve, reject) => {
        const connectionErrorHandler = () => {
          this.disconnect(ws);
          reject(new Error(`Could not connect to "${this.url}"`));
        };

        ws.addEventListener('error', connectionErrorHandler);
        ws.addEventListener('open', () => {
          this.log(`Connected to "${this.url}"`);
          ws.removeEventListener('error', connectionErrorHandler);
          ws.addEventListener('error', () => {
            this.disconnect(ws);
            this.log(`Error, disconnected from "${this.url}"`);
            this.dispatch('close', { error: true });
          });
          ws.addEventListener('close', () => {
            this.disconnect(ws);
            this.log(`Disconnected from "${this.url}"`);
            this.dispatch('close', { error: false });
          });
          this.ws = ws;
          resolve(true);
        });
      });
    } else {
      /**
       * Node.js
       */
      const moduleName = 'ws';
      const wsModule = await import(/* webpackIgnore: true */ moduleName);
      const WebSocket = wsModule.default;
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        [],
        {
          finishRequest: (request: any) => {
            // Auth
            request.setHeader('Authorization', `Bearer ${this.apiKey}`);
            request.setHeader('OpenAI-Beta', 'realtime=v1');
            request.end();
          },
        }
      );

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.receive(message.type, message);
      });

      return new Promise((resolve, reject) => {
        const connectionErrorHandler = () => {
          this.disconnect(ws);
          reject(new Error(`Could not connect to "${this.url}"`));
        };

        ws.on('error', connectionErrorHandler);
        ws.on('open', () => {
          this.log(`Connected to "${this.url}"`);
          ws.removeListener('error', connectionErrorHandler);
          ws.on('error', () => {
            this.disconnect(ws);
            this.log(`Error, disconnected from "${this.url}"`);
            this.dispatch('close', { error: true });
          });
          ws.on('close', () => {
            this.disconnect(ws);
            this.log(`Disconnected from "${this.url}"`);
            this.dispatch('close', { error: false });
          });
          this.ws = ws;
          resolve(true);
        });
      });
    }
  }

  /**
   * Disconnects from Realtime API server
   */
  disconnect(ws?: WebSocket): true {
    if (!ws || this.ws === ws) {
      this.ws && this.ws.close();
      this.ws = null;
      return true;
    }
    return true;
  }

  /**
   * Receives an event from WebSocket and dispatches as "server.{eventName}" and "server.*" events
   */
  receive(eventName: string, event: WebSocketMessage): true {
    this.log('received:', eventName, event);
    this.dispatch(`server.${eventName}`, event);
    this.dispatch('server.*', event);
    return true;
  }

  /**
   * Sends an event to WebSocket and dispatches as "client.{eventName}" and "client.*" events
   */
  send(eventName: string, data: Record<string, any> = {}): true {
    if (!this.isConnected()) {
      throw new Error('RealtimeAPI is not connected');
    }

    if (typeof data !== 'object') {
      throw new Error('data must be an object');
    }

    const event = {
      event_id: RealtimeUtils.generateId('evt_'),
      type: eventName,
      ...data,
    };

    this.dispatch(`client.${eventName}`, event);
    this.dispatch('client.*', event);
    this.log('sent:', eventName, event);
    this.ws!.send(JSON.stringify(event));
    return true;
  }
}
