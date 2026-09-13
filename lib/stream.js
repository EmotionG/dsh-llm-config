/**
 * SSE decoding and per-protocol stream translation.
 *
 * One decoder serves every protocol because all four frame their stream as
 * `data:` lines; the translators differ because the event vocabularies do.
 * A translator is stateful, so one instance serves exactly one response.
 *
 * @module dsh-llm-config/stream
 */
import { ToolCallId } from '@deepseek-ai/dsh-llm';
/** Decode an SSE byte stream into payload strings. */
export async function* sseEvents(body, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            if (signal?.aborted === true)
                return;
            const step = await reader.read();
            if (step.done)
                break;
            buffer += decoder.decode(step.value, { stream: true });
            let index = buffer.indexOf('\n');
            while (index !== -1) {
                const line = buffer.slice(0, index).replace(/\r$/, '');
                buffer = buffer.slice(index + 1);
                if (line.startsWith('data:'))
                    yield line.slice(5).trim();
                else if (line.startsWith('{') || line.startsWith('['))
                    yield line.trim();
                index = buffer.indexOf('\n');
            }
        }
        const tail = buffer.trim();
        if (tail.startsWith('data:'))
            yield tail.slice(5).trim();
        else if (tail.startsWith('{') || tail.startsWith('['))
            yield tail;
    }
    finally {
        try {
            reader.releaseLock();
        }
        catch {
            /* the reader already settled */
        }
    }
}
function toUsage(usage) {
    if (usage === null)
        return undefined;
    const prompt = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const details = usage.prompt_tokens_details;
    const cached = typeof details === 'object' && details !== null
        && typeof details.cached_tokens === 'number'
        ? details.cached_tokens
        : 0;
    const completion = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
    const completionDetails = usage.completion_tokens_details;
    const reasoning = typeof completionDetails === 'object' && completionDetails !== null
        && typeof completionDetails.reasoning_tokens === 'number'
        ? completionDetails.reasoning_tokens
        : 0;
    const total = typeof usage.total_tokens === 'number' ? usage.total_tokens : prompt + completion;
    const out = {
        // Counts are DISJOINT: subtract the cache hits out of the prompt total.
        inputTokens: Math.max(0, prompt - cached),
        outputTokens: completion,
        totalTokens: total,
    };
    if (cached > 0)
        out.cacheReadTokens = cached;
    if (reasoning > 0)
        out.reasoningTokens = reasoning;
    return out;
}
function openAiTranslator() {
    const calls = new Map();
    let usage = null;
    let finished = null;
    let opened = false;
    return {
        push(payload) {
            const chunks = [];
            if (payload === '[DONE]')
                return { chunks, done: true };
            let event;
            try {
                event = JSON.parse(payload);
            }
            catch {
                return { chunks, done: false };
            }
            const choice = (Array.isArray(event.choices) ? event.choices[0] : undefined);
            if (choice === undefined) {
                if (typeof event.usage === 'object' && event.usage !== null) {
                    usage = event.usage;
                }
                return { chunks, done: false };
            }
            const delta = (typeof choice.delta === 'object' && choice.delta !== null ? choice.delta : {});
            const reasoning = typeof delta.reasoning_content === 'string'
                ? delta.reasoning_content
                : (typeof delta.reasoning === 'string' ? delta.reasoning : '');
            if (reasoning.length > 0)
                chunks.push({ type: 'reasoning-delta', index: 0, text: reasoning });
            if (typeof delta.content === 'string' && delta.content.length > 0) {
                if (!opened) {
                    chunks.push({ type: 'block-start', index: 0, blockType: 'text' });
                    opened = true;
                }
                chunks.push({ type: 'text-delta', index: 0, text: delta.content });
            }
            const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
            for (const raw of toolCalls) {
                const call = raw;
                const at = typeof call.index === 'number' ? call.index : 0;
                if (typeof call.id === 'string' && call.id.length > 0) {
                    calls.set(at, { id: call.id, name: typeof call.name === 'string' ? call.name : '', args: '' });
                }
                const slot = calls.get(at);
                if (slot === undefined)
                    continue;
                const fn = (typeof call.function === 'object' && call.function !== null ? call.function : {});
                if (typeof fn.name === 'string' && fn.name.length > 0)
                    slot.name = fn.name;
                const argsDelta = typeof fn.arguments === 'string' ? fn.arguments : '';
                if (argsDelta.length > 0)
                    slot.args += argsDelta;
                if ((typeof call.id === 'string' && call.id.length > 0) || argsDelta.length > 0) {
                    chunks.push({
                        type: 'tool-call-delta',
                        index: at,
                        id: ToolCallId(slot.id),
                        name: slot.name,
                        argumentsDelta: argsDelta,
                    });
                }
            }
            if (typeof event.usage === 'object' && event.usage !== null)
                usage = event.usage;
            if (typeof choice.finish_reason === 'string')
                finished = choice.finish_reason;
            return { chunks, done: false };
        },
        finish() {
            const chunks = [];
            for (const [at, slot] of calls) {
                chunks.push({
                    type: 'block-end',
                    index: at,
                    block: { type: 'tool-call', id: ToolCallId(slot.id), name: slot.name, arguments: slot.args },
                });
            }
            const parsed = toUsage(usage);
            if (parsed !== undefined)
                chunks.push({ type: 'usage', usage: parsed });
            const reason = calls.size > 0 || finished === 'tool_calls' || finished === 'function_call'
                ? finishReason('tool-calls')
                : finished === 'length'
                    ? finishReason('max-tokens')
                    : finishReason('stop');
            chunks.push({ type: 'finish', reason });
            return chunks;
        },
    };
}
/** The only three finish reasons an adapter may emit on its own. */
function finishReason(kind) {
    return { kind };
}
function anthropicTranslator() {
    const calls = new Map();
    let usage = null;
    let stopReason = null;
    return {
        push(payload) {
            const chunks = [];
            let event;
            try {
                event = JSON.parse(payload);
            }
            catch {
                return { chunks, done: false };
            }
            const type = event.type;
            if (type === 'message_start') {
                const message = event.message;
                if (message !== undefined && typeof message.usage === 'object' && message.usage !== null) {
                    usage = message.usage;
                }
            }
            else if (type === 'content_block_start') {
                const block = (typeof event.content_block === 'object' && event.content_block !== null
                    ? event.content_block
                    : {});
                const at = typeof event.index === 'number' ? event.index : 0;
                if (block.type === 'tool_use') {
                    calls.set(at, {
                        id: typeof block.id === 'string' ? block.id : '',
                        name: typeof block.name === 'string' ? block.name : '',
                        args: '',
                    });
                    chunks.push({ type: 'block-start', index: at, blockType: 'tool-call' });
                }
                else if (block.type === 'text') {
                    chunks.push({ type: 'block-start', index: at, blockType: 'text' });
                }
                else if (block.type === 'thinking') {
                    chunks.push({ type: 'block-start', index: at, blockType: 'reasoning' });
                }
            }
            else if (type === 'content_block_delta') {
                const delta = (typeof event.delta === 'object' && event.delta !== null ? event.delta : {});
                const at = typeof event.index === 'number' ? event.index : 0;
                if (delta.type === 'text_delta' && typeof delta.text === 'string') {
                    chunks.push({ type: 'text-delta', index: at, text: delta.text });
                }
                else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                    chunks.push({ type: 'reasoning-delta', index: at, text: delta.thinking });
                }
                else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
                    const slot = calls.get(at);
                    if (slot !== undefined) {
                        slot.args += delta.partial_json;
                        chunks.push({
                            type: 'tool-call-delta',
                            index: at,
                            id: ToolCallId(slot.id),
                            name: slot.name,
                            argumentsDelta: delta.partial_json,
                        });
                    }
                }
            }
            else if (type === 'message_delta') {
                if (typeof event.usage === 'object' && event.usage !== null) {
                    usage = { ...(usage ?? {}), ...event.usage };
                }
                const delta = event.delta;
                if (delta !== undefined && typeof delta.stop_reason === 'string')
                    stopReason = delta.stop_reason;
            }
            return { chunks, done: false };
        },
        finish() {
            const chunks = [];
            for (const [at, slot] of calls) {
                chunks.push({
                    type: 'block-end',
                    index: at,
                    block: { type: 'tool-call', id: ToolCallId(slot.id), name: slot.name, arguments: slot.args },
                });
            }
            if (usage !== null) {
                const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
                const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
                const cacheWrite = typeof usage.cache_creation_input_tokens === 'number'
                    ? usage.cache_creation_input_tokens
                    : 0;
                const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
                const parsed = {
                    inputTokens: Math.max(0, input),
                    outputTokens: output,
                    totalTokens: input + output,
                };
                if (cacheRead > 0)
                    parsed.cacheReadTokens = cacheRead;
                if (cacheWrite > 0)
                    parsed.cacheWriteTokens = cacheWrite;
                chunks.push({ type: 'usage', usage: parsed });
            }
            chunks.push({
                type: 'finish',
                reason: stopReason === 'tool_use' || calls.size > 0
                    ? finishReason('tool-calls')
                    : stopReason === 'max_tokens'
                        ? finishReason('max-tokens')
                        : finishReason('stop'),
            });
            return chunks;
        },
    };
}
function geminiTranslator() {
    const calls = new Map();
    let usage = null;
    let geminiFinish = null;
    let opened = false;
    return {
        push(payload) {
            const chunks = [];
            let event;
            try {
                event = JSON.parse(payload);
            }
            catch {
                return { chunks, done: false };
            }
            const candidate = (Array.isArray(event.candidates) ? event.candidates[0] : undefined);
            if (candidate !== undefined) {
                const content = (typeof candidate.content === 'object' && candidate.content !== null
                    ? candidate.content
                    : {});
                const parts = Array.isArray(content.parts) ? content.parts : [];
                for (const raw of parts) {
                    const part = raw;
                    if (typeof part.text === 'string' && part.text.length > 0) {
                        if (!opened) {
                            chunks.push({ type: 'block-start', index: 0, blockType: 'text' });
                            opened = true;
                        }
                        chunks.push({ type: 'text-delta', index: 0, text: part.text });
                    }
                    if (typeof part.functionCall === 'object' && part.functionCall !== null) {
                        const fn = part.functionCall;
                        const at = calls.size;
                        const name = typeof fn.name === 'string' ? fn.name : '';
                        const id = `call_${at}_${name === '' ? 'tool' : name}`;
                        const args = JSON.stringify(fn.args ?? {});
                        calls.set(at, { id, name, args });
                        chunks.push({ type: 'block-start', index: at, blockType: 'tool-call' });
                        chunks.push({
                            type: 'tool-call-delta',
                            index: at,
                            id: ToolCallId(id),
                            name,
                            argumentsDelta: args,
                        });
                    }
                }
                if (typeof candidate.finishReason === 'string')
                    geminiFinish = candidate.finishReason;
            }
            if (typeof event.usageMetadata === 'object' && event.usageMetadata !== null) {
                usage = event.usageMetadata;
            }
            return { chunks, done: false };
        },
        finish() {
            const chunks = [];
            for (const [at, slot] of calls) {
                chunks.push({
                    type: 'block-end',
                    index: at,
                    block: { type: 'tool-call', id: ToolCallId(slot.id), name: slot.name, arguments: slot.args },
                });
            }
            if (usage !== null) {
                const prompt = typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : 0;
                const cached = typeof usage.cachedContentTokenCount === 'number' ? usage.cachedContentTokenCount : 0;
                const output = (typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0)
                    + (typeof usage.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : 0);
                const parsed = {
                    inputTokens: prompt,
                    outputTokens: output,
                    totalTokens: typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : prompt + output,
                };
                if (cached > 0)
                    parsed.cacheReadTokens = cached;
                if (typeof usage.thoughtsTokenCount === 'number' && usage.thoughtsTokenCount > 0) {
                    parsed.reasoningTokens = usage.thoughtsTokenCount;
                }
                chunks.push({ type: 'usage', usage: parsed });
            }
            chunks.push({
                type: 'finish',
                reason: geminiFinish === 'MAX_TOKENS'
                    ? finishReason('max-tokens')
                    : calls.size > 0
                        ? finishReason('tool-calls')
                        : finishReason('stop'),
            });
            return chunks;
        },
    };
}
/** Build the translator for one protocol. */
export function createTranslator(protocol) {
    if (protocol === 'anthropic-messages')
        return anthropicTranslator();
    if (protocol === 'google-gemini')
        return geminiTranslator();
    return openAiTranslator();
}
//# sourceMappingURL=stream.js.map