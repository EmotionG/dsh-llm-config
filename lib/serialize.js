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
import { requestImageHandleText } from '@deepseek-ai/dsh-llm';
/** Prefix for adapter-raised diagnostics. */
const PKG = 'llm-config';
/** Build the standard {@link RequestImages} view over prepared versions. */
export function requestImages(versions) {
    return {
        versions,
        handle: (ref, version) => requestImageHandleText(ref, version),
    };
}
/** Collect every image reference in request order, deduplicated by id. */
export function collectImageRefs(messages) {
    const refs = new Map();
    const walk = (blocks) => {
        for (const block of blocks) {
            if (block.type === 'image')
                refs.set(block.attachment.attachmentId, block.attachment);
            else if (block.type === 'tool-result')
                walk(block.content);
        }
    };
    for (const message of messages) {
        if (typeof message.content !== 'string')
            walk(message.content);
    }
    return refs;
}
/** Concatenate the text blocks of one message. */
export function textOf(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content
        .filter((b) => b.type === 'text')
        .map(b => b.text)
        .join('');
}
function parseArgs(v) {
    if (typeof v === 'object' && v !== null)
        return v;
    if (typeof v !== 'string')
        return {};
    try {
        const parsed = JSON.parse(v === '' ? '{}' : v);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
}
/**
 * Write one reasoning-effort value onto the request at the model's declared
 * location. `field` assigns a scalar at a dotted path; `thinking` writes the
 * nested toggle object Kimi K2.x expects.
 */
export function applyEffort(target, effort, override) {
    if (effort === undefined)
        return;
    const value = override !== undefined && override.length > 0 ? override : effort.default;
    if (value === undefined || value.length === 0)
        return;
    const path = effort.field.split('.');
    let node = target;
    for (let i = 0; i < path.length - 1; i += 1) {
        const key = path[i];
        if (typeof node[key] !== 'object' || node[key] === null)
            node[key] = {};
        node = node[key];
    }
    node[path[path.length - 1]] = effort.mode === 'thinking' ? { type: value } : value;
}
function resolveMaxTokens(options, model, provider) {
    return options.maxTokens ?? model?.maxTokens ?? provider.maxTokens;
}
function resolveTemperature(options, model) {
    return options.temperature ?? model?.temperature;
}
function resolveStop(options, model) {
    if (options.stop !== undefined && options.stop.length > 0)
        return options.stop;
    if (model?.stop !== undefined && model.stop.length > 0)
        return model.stop;
    return undefined;
}
/** Canonical base64 of raw bytes, in Node or browser alike. */
function base64(bytes) {
    let text = '';
    for (const b of bytes)
        text += String.fromCharCode(b);
    // Node 18+ and every modern browser expose btoa on the global.
    return btoa(text);
}
/**
 * Resolve one image block into `[handle-text part, wire image part]`.
 *
 * The handle text is model-visible beside the image (it names the attachment
 * and its request dimensions, the same convention the shipped adapters use);
 * the wire part comes from the protocol-specific builder. A missing prepared
 * version — the caller did not resolve this reference — is an error, because
 * silently omitting an image the user attached is exactly the defect the
 * old explicit rejection existed to prevent.
 */
function imagePartsFor(block, images, buildPart) {
    if (images === undefined) {
        throw new Error(`${PKG}: image input was not prepared for this request; `
            + `the model declares image support but the request carried no resolved attachment`);
    }
    const version = images.versions.get(block.attachment.attachmentId);
    if (version === undefined) {
        throw new Error(`${PKG}: request image ${block.attachment.attachmentId} was not prepared`);
    }
    return [
        { type: 'text', text: images.handle(block.attachment, version) },
        buildPart(version),
    ];
}
/**
 * Build the content parts of one user message: text first, then each image as
 * handle + wire part. Returns `undefined` when the message carries no image,
 * so the caller keeps the compact string form.
 */
function userContentParts(blocks, images, buildPart) {
    if (!blocks.some(b => b.type === 'image'))
        return undefined;
    const parts = [];
    for (const block of blocks) {
        if (block.type === 'text' && block.text.length > 0)
            parts.push({ type: 'text', text: block.text });
        else if (block.type === 'image')
            parts.push(...imagePartsFor(block, images, buildPart));
    }
    return parts.length === 0 ? undefined : parts;
}
/**
 * Tool-result content as one OpenAI/Anthropic-compatible value: text plus any
 * nested image parts. Nested images inside tool results are inlined the same
 * way user images are.
 */
function toolResultContent(blocks, images) {
    if (!blocks.some(b => b.type === 'image'))
        return textOf(blocks);
    const parts = [];
    for (const block of blocks) {
        if (block.type === 'text' && block.text.length > 0)
            parts.push({ type: 'text', text: block.text });
        else if (block.type === 'image')
            parts.push(...imagePartsFor(block, images, openAiImagePart));
    }
    return parts;
}
/** Tool-result text for protocols whose tool results stay textual (Gemini). */
function toolResultText(blocks, images) {
    if (!blocks.some(b => b.type === 'image'))
        return textOf(blocks);
    // Gemini functionResponse carries text; an image inside a tool result is
    // represented by its handle text only (the same projection the framework's
    // text-only path applies).
    const parts = toolResultContent(blocks, images);
    return parts.filter(p => p.type === 'text').map(p => String(p.text)).join('');
}
/** One inline OpenAI-style image part from a prepared request version. */
function openAiImagePart(version) {
    return {
        type: 'image_url',
        image_url: { url: `data:${version.mediaType};base64,${base64(version.data)}` },
    };
}
/** OpenAI Chat Completions request body. */
function buildOpenAiChat(options, model, provider, images) {
    const messages = [];
    if (options.system !== undefined && options.system.length > 0) {
        messages.push({ role: 'system', content: options.system });
    }
    for (const message of options.messages) {
        const blocks = message.content;
        if (message.role === 'assistant') {
            const text = textOf(blocks);
            const calls = blocks.filter(b => b.type === 'tool-call');
            if (calls.length === 0) {
                messages.push({ role: 'assistant', content: text });
                continue;
            }
            messages.push({
                role: 'assistant',
                content: text,
                tool_calls: calls.map(c => ({
                    id: c.id,
                    type: 'function',
                    function: {
                        name: c.name,
                        arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}),
                    },
                })),
            });
            continue;
        }
        const results = blocks.filter(b => b.type === 'tool-result');
        if (results.length > 0) {
            for (const r of results) {
                messages.push({ role: 'tool', tool_call_id: r.toolCallId, content: toolResultContent(r.content, images) });
            }
            continue;
        }
        const parts = userContentParts(blocks, images, openAiImagePart);
        messages.push(parts === undefined
            ? { role: 'user', content: textOf(blocks) }
            : { role: 'user', content: parts });
    }
    const body = { model: options.model, messages, stream: true };
    if (options.tools !== undefined && options.tools.length > 0) {
        body.tools = options.tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
    }
    applyEffort(body, model?.effort, options.reasoningEffort);
    const maxTokens = resolveMaxTokens(options, model, provider);
    if (maxTokens !== undefined)
        body.max_tokens = maxTokens;
    const temperature = resolveTemperature(options, model);
    if (temperature !== undefined)
        body.temperature = temperature;
    if (model?.topP !== undefined)
        body.top_p = model.topP;
    const stop = resolveStop(options, model);
    if (stop !== undefined)
        body.stop = stop;
    if (model?.extraBody !== undefined)
        Object.assign(body, model.extraBody);
    return body;
}
/** One inline Anthropic image part from a prepared request version. */
function anthropicImagePart(version) {
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: version.mediaType,
            data: base64(version.data),
        },
    };
}
/** Anthropic Messages request body. */
function buildAnthropic(options, model, provider, images) {
    const messages = [];
    for (const message of options.messages) {
        const blocks = message.content;
        const parts = [];
        if (message.role === 'assistant') {
            const text = textOf(blocks);
            if (text.length > 0)
                parts.push({ type: 'text', text });
            for (const c of blocks.filter(b => b.type === 'tool-call')) {
                parts.push({ type: 'tool_use', id: c.id, name: c.name, input: parseArgs(c.arguments) });
            }
        }
        else {
            const text = textOf(blocks);
            if (text.length > 0)
                parts.push({ type: 'text', text });
            for (const b of blocks) {
                if (b.type !== 'image')
                    continue;
                parts.push(...imagePartsFor(b, images, anthropicImagePart));
            }
            for (const r of blocks.filter(b => b.type === 'tool-result')) {
                parts.push({
                    type: 'tool_result',
                    tool_use_id: r.toolCallId,
                    content: toolResultContent(r.content, images),
                    ...(r.isError === true ? { is_error: true } : {}),
                });
            }
        }
        if (parts.length > 0)
            messages.push({ role: message.role, content: parts });
    }
    const body = {
        model: options.model,
        max_tokens: resolveMaxTokens(options, model, provider) ?? 4096,
        messages,
        stream: true,
    };
    if (options.system !== undefined && options.system.length > 0)
        body.system = options.system;
    if (options.tools !== undefined && options.tools.length > 0) {
        body.tools = options.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    }
    applyEffort(body, model?.effort, options.reasoningEffort);
    const temperature = resolveTemperature(options, model);
    if (temperature !== undefined)
        body.temperature = temperature;
    if (model?.topP !== undefined)
        body.top_p = model.topP;
    const stop = resolveStop(options, model);
    if (stop !== undefined)
        body.stop_sequences = stop;
    if (model?.extraBody !== undefined)
        Object.assign(body, model.extraBody);
    return body;
}
/** One inline Gemini image part from a prepared request version. */
function geminiImagePart(version) {
    return {
        inlineData: {
            mimeType: version.mediaType,
            data: base64(version.data),
        },
    };
}
/** Google Gemini generateContent request body. */
function buildGemini(options, model, provider, images) {
    const contents = [];
    for (const message of options.messages) {
        const blocks = message.content;
        const parts = [];
        if (message.role === 'assistant') {
            const text = textOf(blocks);
            if (text.length > 0)
                parts.push({ text });
            for (const c of blocks.filter(b => b.type === 'tool-call')) {
                parts.push({ functionCall: { name: c.name, args: parseArgs(c.arguments) } });
            }
        }
        else {
            const text = textOf(blocks);
            if (text.length > 0)
                parts.push({ text });
            for (const b of blocks) {
                if (b.type !== 'image')
                    continue;
                parts.push(...imagePartsFor(b, images, geminiImagePart));
            }
            for (const r of blocks.filter(b => b.type === 'tool-result')) {
                parts.push({ functionResponse: { name: 'tool', response: { result: toolResultText(r.content, images) } } });
            }
        }
        if (parts.length > 0)
            contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts });
    }
    const body = { contents };
    if (options.system !== undefined && options.system.length > 0) {
        body.systemInstruction = { parts: [{ text: options.system }] };
    }
    if (options.tools !== undefined && options.tools.length > 0) {
        body.tools = [{
                functionDeclarations: options.tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                })),
            }];
    }
    const generationConfig = {};
    const maxTokens = resolveMaxTokens(options, model, provider);
    if (maxTokens !== undefined)
        generationConfig.maxOutputTokens = maxTokens;
    const temperature = resolveTemperature(options, model);
    if (temperature !== undefined)
        generationConfig.temperature = temperature;
    if (model?.topP !== undefined)
        generationConfig.topP = model.topP;
    const stop = resolveStop(options, model);
    if (stop !== undefined)
        generationConfig.stopSequences = stop;
    if (Object.keys(generationConfig).length > 0)
        body.generationConfig = generationConfig;
    // Effort rides generationConfig for Gemini.
    applyEffort(generationConfig, model?.effort, options.reasoningEffort);
    if (model?.extraBody !== undefined)
        Object.assign(body, model.extraBody);
    return body;
}
/** Serialize one request for the provider's (or model's) protocol. */
export function serializeRequest(options, model, provider, images) {
    const protocol = model?.protocol ?? provider.protocol;
    if (protocol === 'anthropic-messages')
        return buildAnthropic(options, model, provider, images);
    if (protocol === 'google-gemini')
        return buildGemini(options, model, provider, images);
    return buildOpenAiChat(options, model, provider, images);
}
/** The request URL for one exact provider/model pair. */
export function requestUrl(provider, model, apiKey, streaming) {
    const base = provider.baseURL;
    if (provider.protocol === 'anthropic-messages')
        return `${base}/messages`;
    if (provider.protocol === 'google-gemini') {
        const verb = streaming ? ':streamGenerateContent' : ':generateContent';
        let url = `${base}/models/${encodeURIComponent(model)}${verb}`;
        if (provider.authScheme === 'query' && apiKey.length > 0) {
            url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
        }
        if (streaming)
            url += `${url.includes('?') ? '&' : '?'}alt=sse`;
        return url;
    }
    if (provider.protocol === 'openai-responses')
        return `${base}/responses`;
    return `${base}/chat/completions`;
}
/** Auth headers for one provider, honouring its scheme and prefix. */
export function authHeaders(provider, apiKey) {
    const headers = { 'content-type': 'application/json' };
    if (apiKey.length === 0 || provider.authScheme === 'none')
        return headers;
    if (provider.authScheme === 'x-api-key') {
        headers[provider.apiKeyHeader ?? 'x-api-key'] = `${provider.apiKeyPrefix ?? ''}${apiKey}`;
        return headers;
    }
    if (provider.authScheme === 'query') {
        if (provider.protocol === 'anthropic-messages') {
            headers['x-api-key'] = `${provider.apiKeyPrefix ?? ''}${apiKey}`;
        }
        if (provider.protocol === 'google-gemini')
            headers['x-goog-api-key'] = apiKey;
        return headers;
    }
    const name = provider.apiKeyHeader ?? 'authorization';
    headers[name] = provider.apiKeyPrefix !== undefined ? `${provider.apiKeyPrefix}${apiKey}` : `Bearer ${apiKey}`;
    return headers;
}
//# sourceMappingURL=serialize.js.map