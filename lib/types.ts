// Audio and Voice Types
export type AudioFormatType = 'pcm16' | 'g711_ulaw' | 'g711_alaw';
export type VoiceType = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';

// Audio Transcription Types
export interface AudioTranscriptionType {
  model: 'whisper-1';
}

export interface TurnDetectionServerVadType {
  type: 'server_vad';
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
}

// Tool Types
export interface ToolDefinitionType {
  type?: 'function';
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export type ToolChoiceType = 'auto' | 'none' | 'required' | { type: 'function'; name: string };

// Session Types
export interface SessionResourceType {
  model?: string;
  modalities?: string[];
  instructions?: string;
  voice?: VoiceType;
  input_audio_format?: AudioFormatType;
  output_audio_format?: AudioFormatType;
  input_audio_transcription?: AudioTranscriptionType | null;
  turn_detection?: TurnDetectionServerVadType | null;
  tools?: ToolDefinitionType[];
  tool_choice?: ToolChoiceType;
  temperature?: number;
  max_response_output_tokens?: number;
}

// Item Types
export type ItemStatusType = 'in_progress' | 'completed' | 'incomplete';

export interface InputTextContentType {
  type: 'input_text';
  text: string;
}

export interface InputAudioContentType {
  type: 'input_audio';
  audio?: string; // base64-encoded audio data
  transcript?: string | null;
}

export interface TextContentType {
  type: 'text';
  text: string;
}

export interface AudioContentType {
  type: 'audio';
  audio?: string; // base64-encoded audio data
  transcript?: string | null;
}

export interface BaseItem {
  type: string;
  status?: ItemStatusType;
}

export interface SystemItemType extends BaseItem {
  previous_item_id?: string | null;
  type: 'message';
  role: 'system';
  content: InputTextContentType[];
}

export interface UserItemType extends BaseItem {
  previous_item_id?: string | null;
  type: 'message';
  role: 'user';
  content: (InputTextContentType | InputAudioContentType)[];
}

export interface AssistantItemType extends BaseItem {
  previous_item_id?: string | null;
  type: 'message';
  role: 'assistant';
  content: (TextContentType | AudioContentType)[];
}

export interface FunctionCallItemType extends BaseItem {
  previous_item_id?: string | null;
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

export interface FunctionCallOutputItemType extends BaseItem {
  previous_item_id?: string | null;
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface FormattedToolType {
  type: 'function';
  name: string;
  call_id: string;
  arguments: string;
}

export interface FormattedPropertyType {
  audio?: Int16Array;
  text?: string;
  transcript?: string;
  tool?: FormattedToolType;
  output?: string;
  file?: any;
}

export interface FormattedItemType {
  id: string;
  object: string;
  role?: 'user' | 'assistant' | 'system';
  formatted: FormattedPropertyType;
}

export type BaseItemType = (SystemItemType | UserItemType | AssistantItemType | FunctionCallItemType | FunctionCallOutputItemType);

export type ItemType = BaseItemType & FormattedItemType;

// Event Types
export interface ServerEvent {
  type: string;
  [key: string]: any;
}

export interface RealtimeEvent extends Record<string, any> {
  type: string;
  item?: ItemType;
  delta?: any;
}

// Response Types
export interface IncompleteResponseStatusType {
  type: 'incomplete';
  reason: 'interruption' | 'max_output_tokens' | 'content_filter';
}

export interface FailedResponseStatusType {
  type: 'failed';
  error: { code: string; message: string } | null;
}

export interface UsageType {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
}

export interface ResponseResourceType {
  status: 'in_progress' | 'completed' | 'incomplete' | 'cancelled' | 'failed';
  status_details: IncompleteResponseStatusType | FailedResponseStatusType | null;
  output: ItemType[];
  usage: UsageType | null;
}

// Client Types
export interface RealtimeClientSettings {
  url?: string;
  apiKey?: string;
  dangerouslyAllowAPIKeyInBrowser?: boolean;
  debug?: boolean;
}

export interface DefaultSessionConfig {
  modalities: string[];
  instructions: string;
  voice: VoiceType;
  input_audio_format: AudioFormatType;
  output_audio_format: AudioFormatType;
  input_audio_transcription: AudioTranscriptionType | null;
  turn_detection: TurnDetectionServerVadType | null;
  tools: ToolDefinitionType[];
  tool_choice: ToolChoiceType;
  temperature: number;
  max_response_output_tokens: number;
}

export interface DefaultServerVadConfig {
  type: 'server_vad';
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
}

export interface ToolConfig {
  definition: ToolDefinitionType;
  handler: (args: any) => Promise<any>;
}
