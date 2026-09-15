/**
 * Configuration types and the ONE resolution step from a raw settings section
 * to validated provider records.
 *
 * The shape of every field here is dictated by the LLM seam it feeds, so the
 * validation is deliberately strict: a stored value the adapter cannot serve
 * must be refused where it is written, not silently ignored at request time.
 *
 * @module dsh-llm-config/config
 */
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
export const PROTOCOLS = [
    { id: 'openai-chat', label: 'OpenAI Chat Completions' },
    { id: 'openai-responses', label: 'OpenAI Responses' },
    { id: 'anthropic-messages', label: 'Anthropic Messages' },
    { id: 'google-gemini', label: 'Google Gemini' },
];
export const DEFAULT_EXCLUDE = ['embed', 'rerank', 'ranker', 'whisper', 'tts', 'moderation'];
const EFFORT_MODES = ['none', 'field', 'thinking'];
const AUTH_SCHEMES = ['bearer', 'x-api-key', 'query', 'none'];
function isObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function nonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
function positiveInt(v) {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
}
function fail(message) {
    throw new Error(`llm-config: ${message}`);
}
/**
 * Derive the credential reference for a provider id.
 *
 * The credentials service accepts only `/^[A-Za-z_][A-Za-z0-9_]*$/`, while a
 * provider id may contain `.` and `-`, so every credential access goes through
 * this total, deterministic mapping.
 */
export function credentialRefFor(providerId) {
    const cleaned = providerId.replace(/[^A-Za-z0-9_]/g, '_');
    if (cleaned.length === 0)
        return '_';
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}
function normalizeBaseUrl(raw, where) {
    const base = String(raw).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base))
        fail(`${where} must be an absolute http(s) URL (got: ${String(raw)})`);
    return base;
}
/**
 * Read one raw `retry` value into the framework's config shape, tolerating the
 * plain-number shorthand `retry: 3` (meaning `maxRetries: 3`).
 *
 * Full validation is delegated to the framework's `resolveRetryPolicy`, which
 * runs inside {@link resolveProvider} so an invalid policy is refused at the
 * same place every other unusable field is.
 */
function readRetryConfig(raw) {
    if (raw === undefined || raw === null)
        return undefined;
    // Numeric shorthand: `retry: 3` is `maxRetries: 3` in normal mode.
    if (typeof raw === 'number') {
        if (!Number.isSafeInteger(raw) || raw < 0)
            fail('retry must be a non-negative integer when given as a number');
        return { mode: 'normal', maxRetries: raw };
    }
    if (!isObject(raw))
        fail('retry must be an object or a non-negative integer');
    const mode = nonEmptyString(raw.mode) ? raw.mode.trim() : 'normal';
    if (mode !== 'normal' && mode !== 'always')
        fail('retry.mode must be "normal" or "always"');
    const record = { mode };
    if (raw.maxRetries !== undefined && raw.maxRetries !== null)
        record.maxRetries = raw.maxRetries;
    if (raw.retryableCodes !== undefined && raw.retryableCodes !== null)
        record.retryableCodes = raw.retryableCodes;
    if (raw.backoff !== undefined && raw.backoff !== null)
        record.backoff = raw.backoff;
    return record;
}
function resolveEffort(modelId, raw) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!isObject(raw))
        fail(`model "${modelId}" effort must be an object`);
    const mode = (nonEmptyString(raw.mode) ? raw.mode.trim() : 'none');
    if (!EFFORT_MODES.includes(mode))
        fail(`model "${modelId}" effort.mode must be one of ${EFFORT_MODES.join(', ')}`);
    if (mode === 'none')
        return undefined;
    const field = nonEmptyString(raw.field) ? raw.field.trim() : undefined;
    if (field === undefined)
        fail(`model "${modelId}" effort.field is required when effort.mode is "${mode}"`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(field)) {
        fail(`model "${modelId}" effort.field "${field}" is not a valid field path`);
    }
    const values = Array.isArray(raw.values)
        ? raw.values.filter((v) => typeof v === 'string' && v.trim().length > 0).map(v => v.trim())
        : [];
    if (Array.isArray(raw.values) && values.length !== raw.values.length) {
        fail(`model "${modelId}" effort.values entries must be non-empty strings`);
    }
    if (values.length === 0)
        fail(`model "${modelId}" effort.values must list at least one accepted value`);
    const seen = new Set();
    for (const v of values) {
        if (seen.has(v))
            fail(`model "${modelId}" lists effort value "${v}" twice`);
        seen.add(v);
    }
    let dflt;
    if (nonEmptyString(raw.default)) {
        dflt = raw.default.trim();
        if (!values.includes(dflt)) {
            fail(`model "${modelId}" effort.default "${dflt}" is not among its values (${values.join(', ')})`);
        }
    }
    return dflt === undefined ? { mode, field, values } : { mode, field, values, default: dflt };
}
/** A blank model id is DROPPED, not rejected: the form always renders a row. */
function resolveModel(providerId, raw, protocol) {
    if (!isObject(raw))
        fail(`provider "${providerId}" has a non-object model entry`);
    if (!nonEmptyString(raw.id))
        return undefined;
    const id = raw.id.trim();
    const protocolId = (nonEmptyString(raw.protocol) ? raw.protocol.trim() : protocol);
    if (!PROTOCOLS.some(p => p.id === protocolId)) {
        fail(`model "${id}" names unknown protocol "${protocolId}"`);
    }
    for (const [key, value] of [
        ['contextWindow', raw.contextWindow],
        ['maxTokens', raw.maxTokens],
        ['streamIdleTimeoutMs', raw.streamIdleTimeoutMs],
    ]) {
        if (value !== undefined && value !== null && !positiveInt(value)) {
            fail(`model "${id}" ${key} must be a positive integer`);
        }
    }
    for (const [key, value, lo, hi] of [
        ['temperature', raw.temperature, 0, 2],
        ['topP', raw.topP, 0, 1],
    ]) {
        if (value !== undefined && value !== null) {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < lo || value > hi) {
                fail(`model "${id}" ${key} must be a number in [${lo}, ${hi}]`);
            }
        }
    }
    if (raw.stop !== undefined && raw.stop !== null) {
        if (!Array.isArray(raw.stop) || raw.stop.some(s => typeof s !== 'string')) {
            fail(`model "${id}" stop must be an array of strings`);
        }
    }
    for (const key of ['extraBody', 'extraHeaders']) {
        if (raw[key] !== undefined && raw[key] !== null && !isObject(raw[key])) {
            fail(`model "${id}" ${key} must be an object`);
        }
    }
    const model = {
        id,
        protocol: protocolId,
        inputModalities: Array.isArray(raw.inputModalities) && raw.inputModalities.length > 0
            ? raw.inputModalities.filter((m) => m === 'text' || m === 'image')
            : ['text'],
    };
    if (nonEmptyString(raw.name))
        model.name = raw.name.trim();
    if (nonEmptyString(raw.description))
        model.description = raw.description.trim();
    if (positiveInt(raw.contextWindow))
        model.contextWindow = raw.contextWindow;
    if (positiveInt(raw.maxTokens))
        model.maxTokens = raw.maxTokens;
    if (typeof raw.temperature === 'number')
        model.temperature = raw.temperature;
    if (typeof raw.topP === 'number')
        model.topP = raw.topP;
    if (positiveInt(raw.streamIdleTimeoutMs))
        model.streamIdleTimeoutMs = raw.streamIdleTimeoutMs;
    if (Array.isArray(raw.reasoningEfforts) && raw.reasoningEfforts.length > 0) {
        model.reasoningEfforts = raw.reasoningEfforts.filter((s) => typeof s === 'string');
    }
    if (nonEmptyString(raw.defaultReasoningEffort))
        model.defaultReasoningEffort = raw.defaultReasoningEffort.trim();
    if (Array.isArray(raw.stop) && raw.stop.length > 0)
        model.stop = raw.stop;
    const effort = resolveEffort(id, raw.effort);
    if (effort !== undefined)
        model.effort = effort;
    if (isObject(raw.extraBody))
        model.extraBody = raw.extraBody;
    if (isObject(raw.extraHeaders))
        model.extraHeaders = raw.extraHeaders;
    return model;
}
function resolveProvider(raw, index) {
    if (!isObject(raw))
        fail(`provider #${index} is not an object`);
    if (!nonEmptyString(raw.id))
        fail(`provider #${index} has an empty id`);
    const id = raw.id.trim();
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
        fail(`provider id "${id}" may only contain letters, digits, dot, underscore and hyphen`);
    }
    const protocol = (nonEmptyString(raw.protocol) ? raw.protocol.trim() : 'openai-chat');
    if (!PROTOCOLS.some(p => p.id === protocol))
        fail(`provider "${id}" names unknown protocol "${protocol}"`);
    if (!nonEmptyString(raw.baseURL))
        fail(`provider "${id}" needs a baseURL`);
    const baseURL = normalizeBaseUrl(raw.baseURL, `provider "${id}" baseURL`);
    const seen = new Set();
    const models = [];
    for (const m of Array.isArray(raw.models) ? raw.models : []) {
        const entry = resolveModel(id, m, protocol);
        if (entry === undefined)
            continue;
        if (seen.has(entry.id))
            fail(`provider "${id}" declares model "${entry.id}" twice`);
        seen.add(entry.id);
        models.push(entry);
    }
    const apiKeyEnv = nonEmptyString(raw.apiKeyEnv) ? raw.apiKeyEnv.trim() : undefined;
    if (apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
        fail(`provider "${id}" apiKeyEnv is not a valid environment variable name`);
    }
    let authScheme = nonEmptyString(raw.authScheme) ? raw.authScheme.trim() : undefined;
    if (authScheme !== undefined && !AUTH_SCHEMES.includes(authScheme)) {
        fail(`provider "${id}" authScheme must be bearer, x-api-key, query or none`);
    }
    if (authScheme === undefined) {
        if (protocol === 'anthropic-messages')
            authScheme = 'x-api-key';
        else if (protocol === 'google-gemini')
            authScheme = 'query';
        else
            authScheme = 'bearer';
    }
    const streamIdleTimeoutMs = raw.streamIdleTimeoutMs === undefined || raw.streamIdleTimeoutMs === null
        ? 300_000
        : raw.streamIdleTimeoutMs;
    if (typeof streamIdleTimeoutMs !== 'number' || !Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0) {
        fail(`provider "${id}" streamIdleTimeoutMs must be a positive number`);
    }
    const defaultContextWindow = raw.defaultContextWindow === undefined || raw.defaultContextWindow === null
        ? 128_000
        : raw.defaultContextWindow;
    if (!positiveInt(defaultContextWindow))
        fail(`provider "${id}" defaultContextWindow must be a positive integer`);
    let modelExcludePatterns;
    if (raw.modelExcludePatterns === undefined || raw.modelExcludePatterns === null) {
        modelExcludePatterns = [...DEFAULT_EXCLUDE];
    }
    else {
        if (!Array.isArray(raw.modelExcludePatterns))
            fail(`provider "${id}" modelExcludePatterns must be an array`);
        modelExcludePatterns = raw.modelExcludePatterns.filter((s) => typeof s === 'string' && s.length > 0);
        if (modelExcludePatterns.length !== raw.modelExcludePatterns.length) {
            fail(`provider "${id}" modelExcludePatterns entries must be non-empty strings`);
        }
    }
    if (raw.extraHeaders !== undefined && raw.extraHeaders !== null && !isObject(raw.extraHeaders)) {
        fail(`provider "${id}" extraHeaders must be an object`);
    }
    const provider = {
        id,
        displayName: nonEmptyString(raw.displayName) ? raw.displayName.trim() : id,
        enabled: raw.enabled !== false,
        protocol,
        baseURL,
        authScheme,
        credentialRef: credentialRefFor(id),
        modelExcludePatterns,
        defaultContextWindow,
        streamIdleTimeoutMs,
        models,
    };
    // Validate the retry policy through the framework's own resolver: its error
    // messages already name the field and constraint, and staying on that path
    // keeps defaults in lockstep with dsh-llm's own provider plugins.
    const retry = readRetryConfig(raw.retry);
    if (retry !== undefined) {
        resolveRetryPolicy(retry, `llm-config: provider "${id}" retry`);
        provider.retry = retry;
    }
    if (apiKeyEnv !== undefined)
        provider.apiKeyEnv = apiKeyEnv;
    if (nonEmptyString(raw.apiKeyHeader))
        provider.apiKeyHeader = raw.apiKeyHeader.trim();
    if (typeof raw.apiKeyPrefix === 'string')
        provider.apiKeyPrefix = raw.apiKeyPrefix;
    if (positiveInt(raw.maxTokens))
        provider.maxTokens = raw.maxTokens;
    if (isObject(raw.extraHeaders))
        provider.extraHeaders = raw.extraHeaders;
    return provider;
}
/**
 * Resolve a raw section into validated provider records.
 *
 * Accepts BOTH stored shapes for `providers`: the object map this plugin writes
 * (so a directory entry can address one profile by path), and a plain array
 * from an earlier version.
 */
export function resolveConfig(raw) {
    if (raw === undefined || raw === null)
        return { providers: [] };
    if (!isObject(raw))
        fail('the settings section must be an object');
    const p = raw.providers;
    const list = Array.isArray(p) ? p : (isObject(p) ? Object.values(p) : []);
    const seen = new Set();
    const seenRefs = new Set();
    const providers = list.map((entry, i) => {
        const resolved = resolveProvider(entry, i);
        if (seen.has(resolved.id))
            fail(`provider id "${resolved.id}" is declared twice`);
        seen.add(resolved.id);
        if (seenRefs.has(resolved.credentialRef)) {
            fail(`provider id "${resolved.id}" collides with another provider on credential reference `
                + `"${resolved.credentialRef}"; rename one of them`);
        }
        seenRefs.add(resolved.credentialRef);
        return resolved;
    });
    return { providers };
}
//# sourceMappingURL=config.js.map