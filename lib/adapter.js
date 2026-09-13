/**
 * `ConfigAdapter`: one adapter instance per configured provider route.
 *
 * The adapter is transport-only. Connection facts arrive through the registry
 * thunk and are re-read once per operation, so a configuration change reaches
 * the very next request without re-registering the route.
 *
 * This runs as a NORMAL plugin (not a dynamic sandbox package), which is the
 * whole point: `undici` is importable here, so the adapter can issue a real
 * POST with auth headers and consume a streaming body. The dynamic-plugin
 * sandbox denies `fetch` and offers only a GET-only `ctx.web.fetch`, which
 * cannot express an LLM call.
 *
 * @module dsh-llm-config/adapter
 */
import { fetch as undiciFetch } from 'undici';
import { attributionHeaders, LlmAdapter, } from '@deepseek-ai/dsh-llm';
import { authHeaders, requestUrl, serializeRequest } from "./serialize.js";
import { createTranslator, sseEvents } from "./stream.js";
export const PKG = 'llm-config';
/** Derive the highest declared effort when a model declares no default. */
const EFFORT_RUNG = {
    max: 7, xhigh: 6, high: 5, medium: 4, low: 3, minimal: 2, none: 1, default: 0,
};
function highestEffort(values) {
    let best;
    for (const v of values) {
        if (best === undefined || (EFFORT_RUNG[v] ?? -1) > (EFFORT_RUNG[best] ?? -1))
            best = v;
    }
    return best;
}
/** HTTP status and provider message to a stable error code. */
function httpErrorCode(status, detail) {
    const text = detail.toLowerCase();
    if (status === 401 || status === 403)
        return 'AUTH';
    if (/insufficient|quota|balance|credit/.test(text))
        return 'QUOTA_EXCEEDED';
    if (status === 429)
        return 'RATE_LIMIT';
    if (status === 400) {
        if (/context length|too long|maximum context|token limit/.test(text))
            return 'CONTEXT_WINDOW_EXCEEDED';
        return 'INVALID_REQUEST';
    }
    if (status >= 500)
        return 'SERVER';
    return `HTTP_${status}`;
}
function errorMessageOf(body, fallback) {
    if (typeof body !== 'object' || body === null)
        return fallback;
    const record = body;
    const error = record.error;
    if (typeof error === 'object' && error !== null && typeof error.message === 'string') {
        return String(error.message);
    }
    if (typeof record.message === 'string')
        return record.message;
    return fallback;
}
/** One adapter serving one provider route. */
export class ConfigAdapter extends LlmAdapter {
    #registry;
    #providerId;
    constructor(registry, providerId) {
        super();
        this.#registry = registry;
        this.#providerId = providerId;
    }
    #entry() {
        return this.#registry.get(this.#providerId);
    }
    providerInfo(provider) {
        const entry = this.#entry();
        return { id: provider, name: entry?.displayName ?? this.#providerId };
    }
    listModels(provider) {
        const entry = this.#entry();
        if (entry === undefined)
            return Promise.resolve([]);
        return Promise.resolve(entry.models.map(m => ({
            provider,
            id: m.id,
            name: m.name ?? m.id,
            ...(m.description !== undefined ? { description: m.description } : {}),
            inputModalities: m.inputModalities,
        })));
    }
    resolveModel(provider, model) {
        const entry = this.#entry();
        const configured = entry?.models.find(m => m.id === model);
        const contextWindow = configured?.contextWindow
            ?? entry?.defaultContextWindow
            ?? 128_000;
        const defaultMaxTokens = configured?.maxTokens ?? entry?.maxTokens;
        const info = {
            provider,
            id: model,
            name: configured?.name ?? model,
            ...(configured?.description !== undefined ? { description: configured.description } : {}),
            inputModalities: configured?.inputModalities ?? ['text'],
            context: { contextWindow },
        };
        if (defaultMaxTokens !== undefined)
            info.defaultMaxTokens = defaultMaxTokens;
        // Only a model that declared its own effort vocabulary advertises a
        // selector; a model with no declaration sends nothing and rejects nothing.
        const efforts = configured?.reasoningEfforts;
        if (efforts !== undefined && efforts.length > 0) {
            const dflt = configured?.defaultReasoningEffort ?? highestEffort(efforts);
            info.reasoning = {
                efforts: efforts.map(e => ({ id: e, name: e.charAt(0).toUpperCase() + e.slice(1) })),
                ...(dflt !== undefined ? { defaultEffort: dflt } : {}),
            };
        }
        return Promise.resolve(info);
    }
    async *stream(options) {
        const entry = this.#entry();
        if (entry === undefined) {
            throw new Error(`${PKG}: provider route "${this.#providerId}" is no longer configured`);
        }
        const model = entry.models.find(m => m.id === options.model);
        // Reject an explicit effort the configured model never declared, rather
        // than sending a value the endpoint is known to refuse.
        if (options.reasoningEffort !== undefined && model?.effort !== undefined) {
            if (!model.effort.values.includes(options.reasoningEffort)) {
                throw new Error(`${PKG}: model "${options.model}" does not accept reasoning effort `
                    + `"${options.reasoningEffort}" (declared: ${model.effort.values.join(', ')})`);
            }
        }
        const apiKey = await this.#registry.resolveApiKey(entry);
        const url = requestUrl(entry, options.model, apiKey, true);
        const body = serializeRequest(options, model, entry);
        const headers = {
            accept: 'text/event-stream',
            // The seam requires attribution on every provider HTTP request.
            ...attributionHeaders(),
            ...authHeaders(entry, apiKey),
            ...(entry.extraHeaders ?? {}),
            ...(model?.extraHeaders ?? {}),
        };
        let response;
        try {
            response = await undiciFetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                ...(options.signal !== undefined ? { signal: options.signal } : {}),
            });
        }
        catch (error) {
            if (options.signal?.aborted === true)
                throw error;
            throw new Error(`${PKG}: request to ${entry.baseURL} failed: `
                + `${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response.ok) {
            let parsed;
            try {
                parsed = await response.json();
            }
            catch {
                parsed = undefined;
            }
            const message = errorMessageOf(parsed, 'request rejected');
            throw new Error(`${PKG}: ${entry.displayName} (${entry.protocol}) returned HTTP `
                + `${response.status} [${httpErrorCode(response.status, message)}]: ${message}`);
        }
        if (response.body === null) {
            throw new Error(`${PKG}: ${entry.displayName} returned an empty response body`);
        }
        const protocol = model?.protocol ?? entry.protocol;
        const translator = createTranslator(protocol);
        for await (const payload of sseEvents(response.body, options.signal)) {
            const result = translator.push(payload);
            for (const chunk of result.chunks)
                yield chunk;
            if (result.done)
                break;
        }
        for (const chunk of translator.finish())
            yield chunk;
    }
}
/** The public model metadata catalog this plugin enriches from. */
export const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_DEV_TIMEOUT_MS = 30_000;
/**
 * Download the models.dev catalog and collect EVERY provider that publishes
 * each requested id.
 *
 * Host-side on purpose: the browser only names the ids, so no cross-origin
 * download happens from the page.
 *
 * Multiple providers commonly publish one model id with materially different
 * facts — `kimi-k3` appears under dozens of providers whose context windows,
 * output caps and reasoning vocabularies disagree. Returning all of them lets
 * the caller choose instead of silently adopting whichever came first.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id its candidates in catalog order; absent when nothing matched.
 */
export async function fetchCatalogCandidates(modelIds, signal) {
    const timeout = AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS);
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    const response = await undiciFetch(MODELS_DEV_API_URL, {
        headers: { accept: 'application/json', ...attributionHeaders() },
        signal: combined,
    });
    if (!response.ok) {
        throw new Error(`${PKG}: models.dev catalog fetch failed (HTTP ${response.status})`);
    }
    const catalog = (await response.json());
    const wanted = new Set(modelIds);
    const index = new Map();
    for (const [providerId, providerEntry] of Object.entries(catalog)) {
        if (typeof providerEntry !== 'object' || providerEntry === null)
            continue;
        const record = providerEntry;
        const models = record.models;
        if (typeof models !== 'object' || models === null)
            continue;
        const providerName = typeof record.name === 'string' && record.name.length > 0
            ? record.name
            : undefined;
        for (const [key, raw] of Object.entries(models)) {
            if (typeof raw !== 'object' || raw === null)
                continue;
            const model = raw;
            const id = typeof model.id === 'string' && model.id.length > 0 ? model.id : key;
            if (!wanted.has(id))
                continue;
            const facts = {};
            if (typeof model.name === 'string' && model.name.length > 0)
                facts.name = model.name;
            if (typeof model.limit?.context === 'number')
                facts.contextWindow = model.limit.context;
            if (typeof model.limit?.output === 'number')
                facts.maxTokens = model.limit.output;
            const input = model.modalities?.input;
            if (Array.isArray(input)) {
                const list = input.filter((m) => m === 'text' || m === 'image');
                if (list.length > 0)
                    facts.inputModalities = list;
            }
            // Only the effort-shaped reasoning option names the levels the model
            // actually accepts; other option types carry no rung list and must not
            // be guessed at.
            const options = model.reasoning_options;
            if (Array.isArray(options)) {
                const efforts = options
                    .filter(option => option?.type === 'effort')
                    .flatMap(option => (Array.isArray(option?.values) ? option.values : []))
                    .filter((v) => typeof v === 'string' && v.length > 0);
                if (efforts.length > 0) {
                    facts.reasoningEfforts = efforts;
                    // The highest declared rung is the working default when the model
                    // itself names no preset.
                    facts.defaultReasoningEffort = highestEffort(efforts) ?? efforts[efforts.length - 1];
                }
            }
            // A publication with no usable fact is not worth offering.
            if (Object.keys(facts).length === 0)
                continue;
            const list = index.get(id) ?? [];
            list.push({
                provider: providerId,
                ...(providerName === undefined ? {} : { providerName }),
                facts,
            });
            index.set(id, list);
        }
    }
    const out = {};
    for (const id of modelIds) {
        const hits = index.get(id);
        if (hits !== undefined && hits.length > 0)
            out[id] = hits;
    }
    return out;
}
/**
 * Collapse {@link fetchCatalogCandidates} to one candidate per id — the first,
 * which is catalog order. Used by callers that want a plain lookup rather than
 * the full choice set.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id the first matching facts, or an empty object when none did.
 */
export async function fetchCatalogFacts(modelIds, signal) {
    const candidates = await fetchCatalogCandidates(modelIds, signal);
    const out = {};
    for (const [id, list] of Object.entries(candidates)) {
        const first = list[0];
        if (first !== undefined)
            out[id] = first.facts;
    }
    return out;
}
//# sourceMappingURL=adapter.js.map