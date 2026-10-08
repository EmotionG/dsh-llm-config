/**
 * Request serialization for the four supported wire formats.
 *
 * Each builder returns the POST body for one exact provider/model pair. They
 * differ in more than naming: tool-call replay is `tool_calls` + `role:'tool'`
 * for OpenAI, `tool_use`/`tool_result` parts for Anthropic, and
 * `functionCall`/`functionResponse` for Gemini; the system prompt is a leading
 * message, a top-level `system`, or `systemInstruction`.
 *
 * Image input: image blocks carry an attachment REFERENCE; the caller resolves
 * each one through the durable attachment service (`readImageRequest`) into a
 * `RequestImageAttachment` and hands the map to {@link serializeRequest}. A
 * request carrying images WITHOUT that map is refused — a half-serializer that
 * silently drops the image would tell the user it was seen.
 *
 * @module dsh-llm-config/serialize
 */
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment';
import type { ConfigModel, ConfigProvider, ModelEffort } from './config.ts';
/**
 * Prepared request images for one serialization, keyed by attachment id. Built
 * by the adapter from the durable attachment service; one map serves one
 * request body.
 */
export interface RequestImages {
    readonly versions: ReadonlyMap<AttachmentKey, RequestImageAttachment>;
    /** Model-facing handle text for one image, beside its wire part. */
    handle(ref: ImageAttachmentRef, version: RequestImageAttachment): string;
}
/** Build the standard {@link RequestImages} view over prepared versions. */
export declare function requestImages(versions: ReadonlyMap<AttachmentKey, RequestImageAttachment>): RequestImages;
/** Key an image occurrence resolves its prepared version by. */
export type AttachmentKey = string;
/**
 * Collect every LIVE image reference in request order, deduplicated by id.
 *
 * Two facts of the 0.2 message model are load-bearing here:
 *
 * - An image the framework marked `offloaded` is not sent as an image at all:
 *   it is projected to placeholder text before serialization, so resolving a
 *   request version for it would be wasted work (and preparing none for it is
 *   what keeps the placeholder path from tripping the "not prepared" guard).
 * - Tool results are first-class `tool` ROLE messages, so their content is
 *   walked like any other message's. The 0.1.x nesting (`tool-result` blocks
 *   inside a user message) no longer exists.
 */
export declare function collectImageRefs(messages: readonly {
    readonly content: readonly ContentBlock[];
}[]): Map<AttachmentKey, ImageAttachmentRef>;
/** Concatenate the text blocks of one message. */
export declare function textOf(content: readonly ContentBlock[] | string): string;
/**
 * Write one reasoning-effort value onto the request at the model's declared
 * location. `field` assigns a scalar at a dotted path; `thinking` writes the
 * nested toggle object Kimi K2.x expects.
 */
export declare function applyEffort(target: Record<string, unknown>, effort: ModelEffort | undefined, override: string | undefined): void;
/** Serialize one request for the provider's (or model's) protocol. */
export declare function serializeRequest(options: GenerateOptions, model: ConfigModel | undefined, provider: ConfigProvider, images?: RequestImages): Record<string, unknown>;
/** The request URL for one exact provider/model pair. */
export declare function requestUrl(provider: ConfigProvider, model: string, apiKey: string, streaming: boolean): string;
/** Auth headers for one provider, honouring its scheme and prefix. */
export declare function authHeaders(provider: ConfigProvider, apiKey: string): Record<string, string>;
//# sourceMappingURL=serialize.d.ts.map