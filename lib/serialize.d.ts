/**
 * Request serialization for the four supported wire formats.
 *
 * Each builder returns the POST body for one exact provider/model pair. They
 * differ in more than naming: tool-call replay is `tool_calls` + `role:'tool'`
 * for OpenAI, `tool_use`/`tool_result` parts for Anthropic, and
 * `functionCall`/`functionResponse` for Gemini; the system prompt is a leading
 * message, a top-level `system`, or `systemInstruction`.
 *
 * @module dsh-llm-config/serialize
 */
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ConfigModel, ConfigProvider, ModelEffort } from './config.ts';
/**
 * Image blocks carry an attachment REFERENCE, not inline bytes: the provider
 * never receives the image natively. Rather than invent a half-serializer, an
 * adapter that cannot serve an image rejects the request explicitly — the same
 * posture the shipped NewAPI adapter takes.
 */
export declare function contentHasImage(blocks: readonly ContentBlock[]): boolean;
/** Concatenate the text blocks of one message. */
export declare function textOf(content: readonly ContentBlock[] | string): string;
/**
 * Write one reasoning-effort value onto the request at the model's declared
 * location. `field` assigns a scalar at a dotted path; `thinking` writes the
 * nested toggle object Kimi K2.x expects.
 */
export declare function applyEffort(target: Record<string, unknown>, effort: ModelEffort | undefined, override: string | undefined): void;
/** Serialize one request for the provider's (or model's) protocol. */
export declare function serializeRequest(options: GenerateOptions, model: ConfigModel | undefined, provider: ConfigProvider): Record<string, unknown>;
/** The request URL for one exact provider/model pair. */
export declare function requestUrl(provider: ConfigProvider, model: string, apiKey: string, streaming: boolean): string;
/** Auth headers for one provider, honouring its scheme and prefix. */
export declare function authHeaders(provider: ConfigProvider, apiKey: string): Record<string, string>;
//# sourceMappingURL=serialize.d.ts.map