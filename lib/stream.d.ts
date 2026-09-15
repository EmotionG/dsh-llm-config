/**
 * SSE decoding and per-protocol stream translation.
 *
 * One decoder serves every protocol because all four frame their stream as
 * `data:` lines; the translators differ because the event vocabularies do.
 * A translator is stateful, so one instance serves exactly one response.
 *
 * @module dsh-llm-config/stream
 */
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ProtocolId } from './config.ts';
/** Decode an SSE byte stream into payload strings. */
export declare function sseEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string>;
/** One translator: feed payloads in, get chunks out, then call `finish`. */
export interface Translator {
    push(payload: string): {
        chunks: StreamChunk[];
        done: boolean;
    };
    finish(): StreamChunk[];
    /** Whether any tool call was seen; a tool-carrying turn is never empty. */
    hasToolCalls(): boolean;
}
/** Build the translator for one protocol. */
export declare function createTranslator(protocol: ProtocolId): Translator;
/** Narrow a chunk to a content block, for adapters that assemble locally. */
export type { ContentBlock };
//# sourceMappingURL=stream.d.ts.map