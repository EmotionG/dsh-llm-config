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
    /** Wire tool-call index → allocated stream block index. */
    const callAt = new Map();
    let usage = null;
    let finished = null;
    /**
     * Block indexes are ALLOCATED, one per distinct block: reasoning, text, and
     * every tool call each own an index. The harness assembler keys blocks by
     * index, so sharing index 0 between reasoning and text merges the visible
     * answer INTO the thinking block (everything lands in the Think
     * disclosure), and a tool call at wire index 0 overwrites that merged
     * block's content entirely.
     */
    let nextIndex = 0;
    let reasoningAt = null;
    let reasoningText = '';
    let textAt = null;
    let textText = '';
    let sawDone = false;
    return {
        hasToolCalls: () => calls.size > 0,
        completed: () => sawDone || finished !== null,
        push(payload) {
            const chunks = [];
            if (payload === '[DONE]') {
                sawDone = true;
                return { chunks, done: true };
            }
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
            if (reasoning.length > 0) {
                if (reasoningAt === null) {
                    reasoningAt = nextIndex;
                    nextIndex += 1;
                    chunks.push({ type: 'block-start', index: reasoningAt, blockType: 'reasoning' });
                }
                reasoningText += reasoning;
                chunks.push({ type: 'reasoning-delta', index: reasoningAt, text: reasoning });
            }
            if (typeof delta.content === 'string' && delta.content.length > 0) {
                if (textAt === null) {
                    textAt = nextIndex;
                    nextIndex += 1;
                    chunks.push({ type: 'block-start', index: textAt, blockType: 'text' });
                }
                textText += delta.content;
                chunks.push({ type: 'text-delta', index: textAt, text: delta.content });
            }
            const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
            for (const raw of toolCalls) {
                const call = raw;
                const wire = typeof call.index === 'number' ? call.index : 0;
                if (!calls.has(wire)) {
                    calls.set(wire, { id: '', name: '', args: '' });
                    const at = nextIndex;
                    nextIndex += 1;
                    callAt.set(wire, at);
                    chunks.push({ type: 'block-start', index: at, blockType: 'tool-call' });
                }
                const slot = calls.get(wire);
                const at = callAt.get(wire);
                if (slot === undefined || at === undefined)
                    continue;
                if (typeof call.id === 'string' && call.id.length > 0)
                    slot.id = call.id;
                const fn = (typeof call.function === 'object' && call.function !== null ? call.function : {});
                if (typeof fn.name === 'string' && fn.name.length > 0)
                    slot.name = fn.name;
                else if (typeof call.name === 'string' && call.name.length > 0)
                    slot.name = call.name;
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
            if (reasoningAt !== null) {
                chunks.push({ type: 'block-end', index: reasoningAt, block: { type: 'reasoning', text: reasoningText } });
            }
            if (textAt !== null) {
                chunks.push({ type: 'block-end', index: textAt, block: { type: 'text', text: textText } });
            }
            for (const [wire, slot] of calls) {
                const at = callAt.get(wire);
                if (at === undefined)
                    continue;
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
/**
 * An error finish reason carrying the code the framework's retry policy routes
 * on, so a provider-terminated turn is not mistaken for a clean completion.
 */
function failureReason(message, code) {
    return { kind: 'error', failure: { message, code } };
}
/**
 * Token accounting of one Responses payload.
 *
 * OpenAI folds cache hits and cache writes into `input_tokens`, so both are
 * subtracted out to keep the counts DISJOINT as the seam requires.
 */
function responsesUsage(usage) {
    if (usage === null)
        return undefined;
    const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
    const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
    const inputDetails = (typeof usage.input_tokens_details === 'object' && usage.input_tokens_details !== null
        ? usage.input_tokens_details
        : {});
    const cached = typeof inputDetails.cached_tokens === 'number' ? inputDetails.cached_tokens : 0;
    const cacheWrite = typeof inputDetails.cache_write_tokens === 'number' ? inputDetails.cache_write_tokens : 0;
    const outputDetails = (typeof usage.output_tokens_details === 'object' && usage.output_tokens_details !== null
        ? usage.output_tokens_details
        : {});
    const reasoning = typeof outputDetails.reasoning_tokens === 'number' ? outputDetails.reasoning_tokens : 0;
    const out = {
        inputTokens: Math.max(0, input - cached - cacheWrite),
        outputTokens: output,
        totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : input + output,
    };
    if (cached > 0)
        out.cacheReadTokens = cached;
    if (cacheWrite > 0)
        out.cacheWriteTokens = cacheWrite;
    if (reasoning > 0)
        out.reasoningTokens = reasoning;
    return out;
}
/** The `text` an assistant `message` item carries, refusal included. */
function responsesItemText(item) {
    const content = Array.isArray(item.content) ? item.content : [];
    return content.map(raw => {
        const part = raw;
        if (part.type === 'output_text' && typeof part.text === 'string')
            return part.text;
        if (part.type === 'refusal' && typeof part.refusal === 'string')
            return part.refusal;
        return '';
    }).join('');
}
/** The `text` a `reasoning` item carries, from its summary or its content. */
function responsesItemReasoning(item) {
    const join = (raw) => (Array.isArray(raw)
        ? raw.map(entry => {
            const part = entry;
            return typeof part.text === 'string' ? part.text : '';
        }).join('\n\n')
        : '');
    return join(item.summary) || join(item.content);
}
/**
 * OpenAI Responses streaming translator (`response.*` event family).
 *
 * Structural differences from the Chat Completions translator worth naming:
 *
 * - Deltas are addressed by `output_index`, not by an array position inside a
 *   `choices` entry, so every block is keyed by that index.
 * - The stream has NO `[DONE]` sentinel; completeness is decided by the
 *   terminal `response.completed` / `response.incomplete` / `response.failed`
 *   event. `[DONE]` is still accepted because some gateways append it.
 * - Reasoning arrives as `reasoning_summary_text.delta` (the summarized channel
 *   the API actually streams) or `reasoning_text.delta` (raw), and refusals
 *   arrive as `refusal.delta` — all three are surfaced rather than dropped.
 */
function openAiResponsesTranslator() {
    const slots = new Map();
    let nextIndex = 0;
    let usage = null;
    let status = null;
    let incompleteReason = null;
    let failure = null;
    let sawTerminal = false;
    /**
     * The slot for one wire output_index, created (and announced with a
     * `block-start`) on first sight. `seed` supplies the identity a
     * `function_call` item is known by before any argument delta arrives.
     */
    const open = (outputIndex, kind, chunks, seed) => {
        const existing = slots.get(outputIndex);
        if (existing !== undefined)
            return existing;
        const slot = {
            at: nextIndex,
            kind,
            text: '',
            id: seed?.id ?? '',
            name: seed?.name ?? '',
            args: seed?.args ?? '',
        };
        nextIndex += 1;
        slots.set(outputIndex, slot);
        chunks.push({ type: 'block-start', index: slot.at, blockType: kind });
        return slot;
    };
    /** The existing slot for one output_index of an expected kind, if any. */
    const slotAt = (outputIndex, kind) => {
        if (typeof outputIndex !== 'number')
            return undefined;
        const slot = slots.get(outputIndex);
        return slot?.kind === kind ? slot : undefined;
    };
    const settle = (response) => {
        sawTerminal = true;
        const record = (typeof response === 'object' && response !== null ? response : {});
        if (typeof record.usage === 'object' && record.usage !== null) {
            usage = record.usage;
        }
        if (typeof record.status === 'string')
            status = record.status;
        const details = record.incomplete_details;
        if (typeof details === 'object' && details !== null) {
            const reason = details.reason;
            if (typeof reason === 'string')
                incompleteReason = reason;
        }
    };
    return {
        hasToolCalls: () => [...slots.values()].some(slot => slot.kind === 'tool-call'),
        completed: () => sawTerminal,
        push(payload) {
            const chunks = [];
            if (payload === '[DONE]') {
                sawTerminal = true;
                return { chunks, done: true };
            }
            let event;
            try {
                event = JSON.parse(payload);
            }
            catch {
                return { chunks, done: false };
            }
            const type = event.type;
            const expected = type === 'response.output_text.delta'
                || type === 'response.refusal.delta'
                ? 'text'
                : type === 'response.reasoning_summary_text.delta'
                    || type === 'response.reasoning_summary_part.done'
                    || type === 'response.reasoning_text.delta'
                    ? 'reasoning'
                    : type === 'response.function_call_arguments.delta' ? 'tool-call' : undefined;
            if (type === 'response.output_item.added') {
                const item = (typeof event.item === 'object' && event.item !== null ? event.item : {});
                const at = event.output_index;
                if (typeof at !== 'number')
                    return { chunks, done: false };
                if (item.type === 'reasoning')
                    open(at, 'reasoning', chunks);
                else if (item.type === 'message')
                    open(at, 'text', chunks);
                else if (item.type === 'function_call') {
                    open(at, 'tool-call', chunks, {
                        id: typeof item.call_id === 'string' ? item.call_id : '',
                        name: typeof item.name === 'string' ? item.name : '',
                        args: typeof item.arguments === 'string' ? item.arguments : '',
                    });
                }
                return { chunks, done: false };
            }
            if (expected !== undefined) {
                const at = event.output_index;
                if (typeof at !== 'number')
                    return { chunks, done: false };
                // A delta is enough to know the block kind, so a gateway that omits
                // `response.output_item.added` still produces content instead of a
                // silently empty turn. An index already bound to a DIFFERENT kind is
                // left alone rather than corrupted.
                const slot = open(at, expected, chunks);
                if (slot.kind !== expected)
                    return { chunks, done: false };
                if (expected === 'reasoning' && type === 'response.reasoning_summary_part.done') {
                    // Summary parts are separate paragraphs; the blank line is the only
                    // separator the API leaves to the client.
                    slot.text += '\n\n';
                    chunks.push({ type: 'reasoning-delta', index: slot.at, text: '\n\n' });
                    return { chunks, done: false };
                }
                const delta = typeof event.delta === 'string' ? event.delta : '';
                if (delta.length === 0)
                    return { chunks, done: false };
                if (expected === 'text') {
                    slot.text += delta;
                    chunks.push({ type: 'text-delta', index: slot.at, text: delta });
                }
                else if (expected === 'reasoning') {
                    slot.text += delta;
                    chunks.push({ type: 'reasoning-delta', index: slot.at, text: delta });
                }
                else {
                    slot.args += delta;
                    chunks.push({
                        type: 'tool-call-delta',
                        index: slot.at,
                        id: ToolCallId(slot.id),
                        name: slot.name,
                        argumentsDelta: delta,
                    });
                }
                return { chunks, done: false };
            }
            if (type === 'response.function_call_arguments.done') {
                // The terminal event restates the COMPLETE argument string. Emit only
                // the part our accumulation has not seen, so the live view keeps
                // exactly one copy of the arguments; the authoritative string is
                // carried by the block-end emitted from `finish()`.
                const slot = slotAt(event.output_index, 'tool-call');
                const args = typeof event.arguments === 'string' ? event.arguments : '';
                if (slot !== undefined && args.startsWith(slot.args)) {
                    const rest = args.slice(slot.args.length);
                    slot.args = args;
                    if (rest.length > 0) {
                        chunks.push({
                            type: 'tool-call-delta',
                            index: slot.at,
                            id: ToolCallId(slot.id),
                            name: slot.name,
                            argumentsDelta: rest,
                        });
                    }
                }
                else if (slot !== undefined) {
                    slot.args = args;
                }
                return { chunks, done: false };
            }
            if (type === 'response.output_item.done') {
                const item = (typeof event.item === 'object' && event.item !== null ? event.item : {});
                const at = event.output_index;
                if (typeof at !== 'number')
                    return { chunks, done: false };
                // The done item is AUTHORITATIVE: it may arrive without any `added`
                // item, and its content is what the response actually contains.
                if (item.type === 'reasoning')
                    open(at, 'reasoning', chunks).text = responsesItemReasoning(item);
                else if (item.type === 'message')
                    open(at, 'text', chunks).text = responsesItemText(item);
                else if (item.type === 'function_call') {
                    const slot = open(at, 'tool-call', chunks, {
                        id: typeof item.call_id === 'string' ? item.call_id : '',
                        name: typeof item.name === 'string' ? item.name : '',
                        args: typeof item.arguments === 'string' ? item.arguments : '',
                    });
                    if (typeof item.call_id === 'string')
                        slot.id = item.call_id;
                    if (typeof item.name === 'string')
                        slot.name = item.name;
                    if (typeof item.arguments === 'string')
                        slot.args = item.arguments;
                }
                return { chunks, done: false };
            }
            if (type === 'response.completed' || type === 'response.incomplete') {
                settle(event.response);
                return { chunks, done: true };
            }
            if (type === 'response.failed') {
                sawTerminal = true;
                const response = (typeof event.response === 'object' && event.response !== null
                    ? event.response
                    : {});
                const error = (typeof response.error === 'object' && response.error !== null
                    ? response.error
                    : {});
                const code = typeof error.code === 'string' ? error.code : 'unknown';
                const message = typeof error.message === 'string' ? error.message : 'no provider detail';
                // A response that FAILS after the request was accepted is a generation
                // failure, which the default retry policy should replay.
                failure = { message: `responses: response failed (${code}): ${message}`, code: 'SERVER' };
                return { chunks, done: true };
            }
            if (type === 'error') {
                sawTerminal = true;
                const code = typeof event.code === 'string' ? event.code : 'unknown';
                const message = typeof event.message === 'string' ? event.message : 'no provider detail';
                failure = { message: `responses: stream error (${code}): ${message}`, code: 'SERVER' };
                return { chunks, done: true };
            }
            return { chunks, done: false };
        },
        finish() {
            const chunks = [];
            // Blocks are closed in ALLOCATION order so a multi-block turn replays in
            // the order the model produced it, regardless of wire interleaving.
            const ordered = [...slots.values()].sort((left, right) => left.at - right.at);
            for (const slot of ordered) {
                if (slot.kind === 'text')
                    chunks.push({ type: 'block-end', index: slot.at, block: { type: 'text', text: slot.text } });
                else if (slot.kind === 'reasoning') {
                    chunks.push({ type: 'block-end', index: slot.at, block: { type: 'reasoning', text: slot.text } });
                }
                else {
                    chunks.push({
                        type: 'block-end',
                        index: slot.at,
                        block: { type: 'tool-call', id: ToolCallId(slot.id), name: slot.name, arguments: slot.args },
                    });
                }
            }
            const parsed = responsesUsage(usage);
            if (parsed !== undefined)
                chunks.push({ type: 'usage', usage: parsed });
            const hasCalls = ordered.some(slot => slot.kind === 'tool-call');
            if (failure !== null) {
                chunks.push({ type: 'finish', reason: failureReason(failure.message, failure.code) });
            }
            else if (hasCalls) {
                chunks.push({ type: 'finish', reason: finishReason('tool-calls') });
            }
            else if (status === 'incomplete') {
                if (incompleteReason === 'max_output_tokens') {
                    chunks.push({ type: 'finish', reason: finishReason('max-tokens') });
                }
                else {
                    // Every other incomplete reason (content filter, an unstated one) is
                    // deterministic, so it must NOT be handed a retryable code.
                    chunks.push({
                        type: 'finish',
                        reason: failureReason(`responses: response incomplete: ${incompleteReason ?? 'no provider reason'}`, 'INVALID_REQUEST'),
                    });
                }
            }
            else if (status === 'failed' || status === 'cancelled') {
                chunks.push({
                    type: 'finish',
                    reason: failureReason(`responses: response ${status}`, 'SERVER'),
                });
            }
            else {
                chunks.push({ type: 'finish', reason: finishReason('stop') });
            }
            return chunks;
        },
    };
}
function anthropicTranslator() {
    const calls = new Map();
    let usage = null;
    let stopReason = null;
    let sawTerminal = false;
    return {
        hasToolCalls: () => calls.size > 0,
        completed: () => sawTerminal,
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
                sawTerminal = true;
            }
            else if (type === 'message_stop') {
                sawTerminal = true;
            }
            return { chunks, done: false };
        },
        finish() {
            const chunks = [];
            // Anthropic carries its own per-block indexes in every event, so blocks
            // close at their native index; the accumulated thinking/text is only
            // needed for blocks that never received an explicit terminal event.
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
    /**
     * Allocated block indexes, mirroring {@link openAiTranslator}: a thought
     * part and an answer part each own an index, and every functionCall block
     * is allocated beyond them — never reusing the text index.
     */
    let nextIndex = 0;
    let thoughtAt = null;
    let thoughtText = '';
    let textAt = null;
    let textText = '';
    return {
        hasToolCalls: () => calls.size > 0,
        completed: () => geminiFinish !== null,
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
                    // Gemini thought summaries carry thought: true.
                    const isThought = part.thought === true;
                    if (typeof part.text === 'string' && part.text.length > 0) {
                        if (isThought) {
                            if (thoughtAt === null) {
                                thoughtAt = nextIndex;
                                nextIndex += 1;
                                chunks.push({ type: 'block-start', index: thoughtAt, blockType: 'reasoning' });
                            }
                            thoughtText += part.text;
                            chunks.push({ type: 'reasoning-delta', index: thoughtAt, text: part.text });
                        }
                        else {
                            if (textAt === null) {
                                textAt = nextIndex;
                                nextIndex += 1;
                                chunks.push({ type: 'block-start', index: textAt, blockType: 'text' });
                            }
                            textText += part.text;
                            chunks.push({ type: 'text-delta', index: textAt, text: part.text });
                        }
                    }
                    if (typeof part.functionCall === 'object' && part.functionCall !== null) {
                        const fn = part.functionCall;
                        const at = nextIndex;
                        nextIndex += 1;
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
            if (thoughtAt !== null) {
                chunks.push({ type: 'block-end', index: thoughtAt, block: { type: 'reasoning', text: thoughtText } });
            }
            if (textAt !== null) {
                chunks.push({ type: 'block-end', index: textAt, block: { type: 'text', text: textText } });
            }
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
    if (protocol === 'openai-responses')
        return openAiResponsesTranslator();
    return openAiTranslator();
}
//# sourceMappingURL=stream.js.map