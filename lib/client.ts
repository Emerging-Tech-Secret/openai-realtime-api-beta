import { RealtimeEventHandler, EventHandlerCallback } from './event_handler.js';
import { RealtimeAPI } from './api.js';
import { RealtimeConversation } from './conversation.js';
import { RealtimeUtils } from './utils.js';
import {
  AudioTranscriptionType,
  DefaultServerVadConfig,
  DefaultSessionConfig,
  FormattedToolType,
  InputAudioContentType,
  InputTextContentType,
  ItemType,
  BaseItemType,
  RealtimeClientSettings,
  SessionResourceType,
  ToolConfig,
  ToolDefinitionType,
  AssistantItemType,
  ServerEvent,
  RealtimeEvent,
} from './types';

/**
 * RealtimeClient Class
 * @class
 */
export class RealtimeClient extends RealtimeEventHandler {
  private defaultSessionConfig: DefaultSessionConfig;
  private sessionConfig: Partial<DefaultSessionConfig>;
  private transcriptionModels: AudioTranscriptionType[];
  private defaultServerVadConfig: DefaultServerVadConfig;
  private realtime: RealtimeAPI;
  private conversation: RealtimeConversation;
  private sessionCreated: boolean;
  private tools: Record<string, ToolConfig>;
  private inputAudioBuffer: Int16Array;

  /**
   * Create a new RealtimeClient instance
   * @param {RealtimeClientSettings} [settings]
   */
  constructor({ url, apiKey, dangerouslyAllowAPIKeyInBrowser, debug }: RealtimeClientSettings = {}) {
    super();
    this.sessionCreated = false;
    this.tools = {};
    this.inputAudioBuffer = new Int16Array();
    this.defaultSessionConfig = {
      modalities: ['text', 'audio'],
      instructions: '',
      voice: 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: null,
      turn_detection: null,
      tools: [],
      tool_choice: 'auto',
      temperature: 0.8,
      max_response_output_tokens: 4096,
    };
    this.sessionConfig = {};
    this.transcriptionModels = [
      {
        model: 'whisper-1',
      },
    ];
    this.defaultServerVadConfig = {
      type: 'server_vad',
      threshold: 0.5, // 0.0 to 1.0,
      prefix_padding_ms: 300, // How much audio to include in the audio stream before the speech starts.
      silence_duration_ms: 200, // How long to wait to mark the speech as stopped.
    };
    this.realtime = new RealtimeAPI({
      url,
      apiKey,
      dangerouslyAllowAPIKeyInBrowser,
      debug,
    });
    this.conversation = new RealtimeConversation();
    this._resetConfig();
    this._addAPIEventHandlers();
  }

  /**
   * Resets sessionConfig and conversationConfig to default
   * @private
   * @returns {true}
   */
  private _resetConfig(): true {
    this.sessionCreated = false;
    this.tools = {};
    this.sessionConfig = JSON.parse(JSON.stringify(this.defaultSessionConfig));
    this.inputAudioBuffer = new Int16Array(0);
    return true;
  }

  /**
   * Sets up event handlers for a fully-functional application control flow
   * @private
   * @returns {true}
   */
  private _addAPIEventHandlers(): true {
    // Event Logging handlers
    this.realtime.on('client.*', (event: RealtimeEvent) => {
      const realtimeEvent = {
        time: new Date().toISOString(),
        source: 'client',
        event: event,
      };
      this.dispatch('realtime.event', realtimeEvent);
    });
    this.realtime.on('server.*', (event: RealtimeEvent) => {
      const realtimeEvent = {
        time: new Date().toISOString(),
        source: 'server',
        event: event,
      };
      this.dispatch('realtime.event', realtimeEvent);
    });

    // Handles session created event, can optionally wait for it
    this.realtime.on(
      'server.session.created',
      () => (this.sessionCreated = true),
    );

    // Setup for application control flow
    const handler = (event: ServerEvent, ...args: any[]): { item: ItemType | null; delta: any } => {
      const result = this.conversation.processEvent(event, ...args);
      return { 
        item: result.item as ItemType | null,
        delta: result.delta 
      };
    };

    const handlerWithDispatch = (event: ServerEvent, ...args: any[]): { item: ItemType | null; delta: any } => {
      const { item, delta } = handler(event, ...args);
      if (item) {
        this.dispatch('conversation.updated', { item, delta });
      }
      return { item, delta };
    };

    const callTool = async (tool: FormattedToolType): Promise<void> => {
      try {
        const jsonArguments = JSON.parse(tool.arguments);
        const toolConfig = this.tools[tool.name];
        if (!toolConfig) {
          throw new Error(`Tool "${tool.name}" has not been added`);
        }
        const result = await toolConfig.handler(jsonArguments);
        this.realtime.send('conversation.item.create', {
          item: {
            type: 'function_call_output',
            call_id: tool.call_id,
            output: JSON.stringify(result),
          },
        });
      } catch (e) {
        this.realtime.send('conversation.item.create', {
          item: {
            type: 'function_call_output',
            call_id: tool.call_id,
            output: JSON.stringify({ error: (e as Error).message }),
          },
        });
      }
      this.createResponse();
    };

    // Handlers to update internal conversation state
    this.realtime.on('server.response.created', (event: ServerEvent) => handler(event));
    this.realtime.on('server.response.output_item.added', (event: ServerEvent) => handler(event));
    this.realtime.on('server.response.content_part.added', (event: ServerEvent) => handler(event));
    this.realtime.on('server.input_audio_buffer.speech_started', (event: ServerEvent) => {
      const result = handler(event);
      this.dispatch('conversation.interrupted', result);
    });
    this.realtime.on('server.input_audio_buffer.speech_stopped', (event: ServerEvent) =>
      handler(event, this.inputAudioBuffer),
    );

    // Handlers to update application state
    this.realtime.on('server.conversation.item.created', (event: ServerEvent) => {
      const { item } = handlerWithDispatch(event);
      if (item) {
        this.dispatch('conversation.item.appended', { item });
        if (item.status === 'completed') {
          this.dispatch('conversation.item.completed', { item });
        }
      }
    });
    this.realtime.on('server.conversation.item.truncated', handlerWithDispatch);
    this.realtime.on('server.conversation.item.deleted', handlerWithDispatch);
    this.realtime.on(
      'server.conversation.item.input_audio_transcription.completed',
      handlerWithDispatch,
    );
    this.realtime.on(
      'server.response.audio_transcript.delta',
      handlerWithDispatch,
    );
    this.realtime.on('server.response.audio.delta', handlerWithDispatch);
    this.realtime.on('server.response.text.delta', handlerWithDispatch);
    this.realtime.on(
      'server.response.function_call_arguments.delta',
      handlerWithDispatch,
    );
    this.realtime.on('server.response.output_item.done', async (event: ServerEvent) => {
      const { item } = handlerWithDispatch(event);
      // Skip if item is null (happens with concurrent agents)
      if (!item) return;
      
      if (item.status === 'completed') {
        this.dispatch('conversation.item.completed', { item });
      }
      if (item.formatted.tool) {
        callTool(item.formatted.tool);
      }
    });

    return true;
  }

  /**
   * Tells us whether the realtime socket is connected and the session has started
   * @returns {boolean}
   */
  public isConnected(): boolean {
    return this.realtime.isConnected();
  }

  /**
   * Resets the client instance entirely: disconnects and clears active config
   * @returns {true}
   */
  public reset(): true {
    this.disconnect();
    this.clearEventHandlers();
    this.realtime.clearEventHandlers();
    this._resetConfig();
    this._addAPIEventHandlers();
    return true;
  }

  /**
   * Connects to the Realtime WebSocket API
   * Updates session config and conversation config
   * @returns {Promise<true>}
   */
  public async connect(): Promise<true> {
    if (this.isConnected()) {
      throw new Error(`Already connected, use .disconnect() first`);
    }
    await this.realtime.connect();
    this.updateSession();
    return true;
  }

  /**
   * Waits for a session.created event to be executed before proceeding
   * @returns {Promise<true>}
   */
  public async waitForSessionCreated(): Promise<true> {
    if (this.sessionCreated) return true;
    await new Promise<void>((resolve) => {
      const handler = () => {
        this.realtime.off('server.session.created', handler);
        resolve();
      };
      this.realtime.on('server.session.created', handler);
    });
    return true;
  }

  /**
   * Disconnects from the Realtime API and clears the conversation history
   */
  public disconnect(): void {
    this.realtime.disconnect();
    this.conversation.clear();
  }

  /**
   * Gets the active turn detection mode
   * @returns {"server_vad"|null}
   */
  public getTurnDetectionType(): 'server_vad' | null {
    return this.sessionConfig.turn_detection?.type ?? null;
  }

  /**
   * Add a tool and handler
   * @param {ToolDefinitionType} definition
   * @param {function} handler
   * @returns {{definition: ToolDefinitionType, handler: function}}
   */
  public addTool(definition: ToolDefinitionType, handler: (args: any) => Promise<any>): ToolConfig {
    this.tools[definition.name] = { definition, handler };
    return { definition, handler };
  }

  /**
   * Removes a tool
   * @param {string} name
   * @returns {true}
   */
  public removeTool(name: string): true {
    delete this.tools[name];
    return true;
  }

  /**
   * Adds a concurrent agent
   * @param {string} prompt_instructions
   * @param {string} metadata_topic
   * @param {string} message_id
   * @returns {true}
   */
  public addConcurrentAgent(
    prompt_instructions: string,
    metadata_topic: string,
    message_id: string,
  ): true {
    this.realtime.send('conversation.concurrent_agent.add', {
      prompt_instructions,
      metadata_topic,
      message_id,
    });
    return true;
  }

  /**
   * Deletes an item
   * @param {string} id
   * @returns {true}
   */
  public deleteItem(id: string): true {
    this.realtime.send('conversation.item.delete', { id });
    return true;
  }

  /**
   * Updates session configuration
   * If the client is not yet connected, will save details and instantiate upon connection
   * @param {Partial<SessionResourceType>} [sessionConfig]
   */
  public updateSession({
    modalities,
    instructions,
    voice,
    input_audio_format,
    output_audio_format,
    input_audio_transcription,
    turn_detection,
    tools,
    tool_choice,
    temperature,
    max_response_output_tokens,
  }: Partial<SessionResourceType> = {}): void {
    // Update session config
    if (modalities !== undefined) this.sessionConfig.modalities = modalities;
    if (instructions !== undefined) this.sessionConfig.instructions = instructions;
    if (voice !== undefined) this.sessionConfig.voice = voice;
    if (input_audio_format !== undefined)
      this.sessionConfig.input_audio_format = input_audio_format;
    if (output_audio_format !== undefined)
      this.sessionConfig.output_audio_format = output_audio_format;
    if (input_audio_transcription !== undefined)
      this.sessionConfig.input_audio_transcription = input_audio_transcription;
    if (turn_detection !== undefined)
      this.sessionConfig.turn_detection = turn_detection;
    if (tools !== undefined) this.sessionConfig.tools = tools;
    if (tool_choice !== undefined) this.sessionConfig.tool_choice = tool_choice;
    if (temperature !== undefined) this.sessionConfig.temperature = temperature;
    if (max_response_output_tokens !== undefined)
      this.sessionConfig.max_response_output_tokens = max_response_output_tokens;

    // Send session config
    if (this.isConnected()) {
      this.realtime.send('session.update', {
        session: {
          ...this.sessionConfig,
          tools: Object.values(this.tools).map((tool) => tool.definition),
        },
      });
    }
  }

  /**
   * Sends user message content and generates a response
   * @param {Array<InputTextContentType|InputAudioContentType>} content
   * @returns {true}
   */
  public sendUserMessageContent(content: (InputTextContentType | InputAudioContentType)[] = []): true {
    this.realtime.send('conversation.item.create', {
      item: {
        type: 'message',
        role: 'user',
        content,
      },
    });
    return true;
  }

  /**
   * Appends user audio to the existing audio buffer
   * @param {Int16Array|ArrayBuffer} arrayBuffer
   * @returns {true}
   */
  public appendInputAudio(arrayBuffer: Int16Array | ArrayBuffer): true {
    const int16Array =
      arrayBuffer instanceof Int16Array
        ? arrayBuffer
        : new Int16Array(arrayBuffer);
    const newBuffer = new Int16Array(
      this.inputAudioBuffer.length + int16Array.length,
    );
    newBuffer.set(this.inputAudioBuffer);
    newBuffer.set(int16Array, this.inputAudioBuffer.length);
    this.inputAudioBuffer = newBuffer;
    this.realtime.send('input_audio_buffer.append', {
      audio: int16Array,
    });
    return true;
  }

  /**
   * Forces a model response generation
   * @returns {true}
   */
  public createResponse(): true {
    this.realtime.send('response.create', {});
    return true;
  }

  /**
   * Cancels the ongoing server generation and truncates ongoing generation, if applicable
   * If no id provided, will simply call `cancel_generation` command
   * @param {string} id The id of the message to cancel
   * @param {number} [sampleCount] The number of samples to truncate past for the ongoing generation
   * @returns {{item: (AssistantItemType | null)}}
   */
  public cancelResponse(id?: string, sampleCount: number = 0): { item: AssistantItemType | null } {
    if (id) {
      this.realtime.send('conversation.item.truncate', {
        id,
        sample_count: sampleCount,
      });
    } else {
      this.realtime.send('response.cancel', {});
    }
    return { item: null };
  }

  /**
   * Utility for waiting for the next `conversation.item.appended` event to be triggered by the server
   * @returns {Promise<{item: ItemType}>}
   */
  public async waitForNextItem(): Promise<{ item: ItemType }> {
    return new Promise((resolve) => {
      const handler = ({ item }: { item: ItemType }) => {
        this.off('conversation.item.appended', handler);
        resolve({ item });
      };
      this.on('conversation.item.appended', handler);
    });
  }

  /**
   * Utility for waiting for the next `conversation.item.completed` event to be triggered by the server
   * @returns {Promise<{item: ItemType}>}
   */
  public async waitForNextCompletedItem(): Promise<{ item: ItemType }> {
    return new Promise((resolve) => {
      const handler = ({ item }: { item: ItemType }) => {
        this.off('conversation.item.completed', handler);
        resolve({ item });
      };
      this.on('conversation.item.completed', handler);
    });
  }

  /**
   * Event handler for item
   * @param {function} callback
   * @returns {void}
   */
  public onItem(callback: EventHandlerCallback<{ item: ItemType }>): void {
    this.on<{ item: ItemType }>('item', callback);
  }

  /**
   * Event handler for next item
   * @param {function} callback
   * @returns {void}
   */
  public onItemNext(callback: EventHandlerCallback<{ item: ItemType }>): void {
    this.onNext<{ item: ItemType }>('item', callback);
  }

  /**
   * Event handler for tool call
   * @param {function} callback
   * @returns {void}
   */
  public onToolCall(callback: EventHandlerCallback<{ item: ItemType }>): void {
    this.on<{ item: ItemType }>('tool_call', callback);
  }

  /**
   * Event handler for next tool call
   * @param {function} callback
   * @returns {void}
   */
  public onToolCallNext(callback: EventHandlerCallback<{ item: ItemType }>): void {
    this.onNext<{ item: ItemType }>('tool_call', callback);
  }

  private async handleItem(item: ItemType | null): Promise<void> {
    if (!item) return;
    
    if ('status' in item) {
      if (item.status === 'completed') {
        this.dispatch('conversation.item.completed', { item });
      }
      
      if (item.status === 'in_progress') {
        this.dispatch('conversation.item.in_progress', { item });
      }
    }
  }

  private async handleToolCall(maxResponseOutputTokens: number | undefined = undefined): Promise<void> {
    // Implementation here...
  }

  public onConversationItemCompleted(callback: EventHandlerCallback<{ item: ItemType }>): void {
    this.on('conversation.item.completed', callback);
  }

  public onConversationItemInProgress(callback: EventHandlerCallback<{ item: ItemType }>): void {
    this.on('conversation.item.in_progress', callback);
  }
}
