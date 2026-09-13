/**
 * Register a `ConfigAdapter` per configured provider route on `ctx.llm`.
 *
 * Connection facts are resolved per request through a live registry, so a
 * changed endpoint, catalog or key reaches the very next request without a
 * restart, while an in-flight stream keeps the facts it started with. The
 * adapter set is kept in sync with the configured routes.
 *
 * This is a NORMAL plugin, not a dynamic sandbox package: `undici` issues the
 * requests, which the dynamic sandbox denies.
 *
 * @module dsh-llm-config
 */
import z from '@deepseek-ai/schemastery';
import { fetch as undiciFetch } from 'undici';
import { ConfigAdapter, fetchCatalogCandidates, PKG } from "./adapter.js";
import { credentialRefFor, DEFAULT_EXCLUDE, resolveConfig, } from "./config.js";
import { authHeaders } from "./serialize.js";
export { PKG };
/** The settings namespace this plugin owns. */
export const NS = 'llm-config';
/**
 * The Connection RPC channel the browser reaches this plugin's host half on.
 *
 * Distinct from {@link NS}: the settings namespace is the dotted settings-and-
 * copy namespace, while this is an absolute path on the shared Connection
 * transport. The client half must name the SAME value — a mismatch makes the
 * browser POST to an unregistered channel and the web server answers 405.
 */
export const RPC_CHANNEL = '/llm-config';
/**
 * The stored section shape.
 *
 * `providers` is a DICT keyed by provider id, not an array: a configurable
 * provider directory entry names ONE provider profile by `settingsPath`, and a
 * path into an array cannot address a single row. The Models page reads each
 * profile's `apiKeyEnv` through that path.
 */
export const ConfigSchema = z.object({
    providers: z.dict(z.object({
        id: z.string().required(),
        displayName: z.string(),
        enabled: z.boolean(),
        protocol: z.string(),
        baseURL: z.string().required(),
        authScheme: z.string(),
        apiKeyEnv: z.string(),
        apiKeyHeader: z.string(),
        apiKeyPrefix: z.string(),
        organization: z.string(),
        project: z.string(),
        maxTokens: z.number(),
        modelExcludePatterns: z.array(z.string()),
        defaultContextWindow: z.number(),
        streamIdleTimeoutMs: z.number(),
        extraHeaders: z.any(),
        models: z.array(z.object({
            id: z.string().required(),
            name: z.string(),
            description: z.string(),
            protocol: z.string(),
            contextWindow: z.number(),
            maxTokens: z.number(),
            temperature: z.number(),
            topP: z.number(),
            streamIdleTimeoutMs: z.number(),
            reasoningEfforts: z.array(z.string()),
            defaultReasoningEffort: z.string(),
            inputModalities: z.array(z.string()),
            stop: z.array(z.string()),
            effort: z.object({
                mode: z.string(),
                field: z.string(),
                values: z.array(z.string()),
                default: z.string(),
            }),
            extraBody: z.any(),
            extraHeaders: z.any(),
        })),
    })),
});
/** The empty section the composition entry starts from. */
export const EMPTY = { providers: {} };
/** Extract provider rows from either stored shape (dict map, or legacy array). */
function providerRows(section) {
    if (typeof section !== 'object' || section === null)
        return [];
    const p = section.providers;
    if (Array.isArray(p))
        return p;
    if (typeof p === 'object' && p !== null)
        return Object.values(p);
    return [];
}
/** Resolve the section into validated providers, tolerating a bad snapshot. */
function resolveSafely(section, logger) {
    try {
        return resolveConfig(section).providers;
    }
    catch (error) {
        logger?.warn?.(`${PKG}: ignoring an invalid provider configuration: `
            + `${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}
/**
 * Required services. `llm` is a HARD dependency: the plugin registers adapter
 * routes on it during apply, so cordis must activate this plugin only once the
 * LLM service exists — and `ctx.llm` is readable only because it is declared
 * here. `credentials`/`settings`/`launchEnvironment` are read through
 * `ctx.get` because each is optional.
 */
export const inject = ['llm'];
export function apply(ctx, config) {
    /**
     * The active configuration source. Before the settings service attaches this
     * returns the composition entry; afterwards it returns the resolved section,
     * which `setSource` replaces. It is re-invoked on every resolve so a later
     * edit is always seen.
     */
    let readSource = () => config;
    let cachedRaw;
    let cached = [];
    /** The current provider set, re-read from the source and memoized by identity. */
    const resolve = () => {
        const snapshot = readSource();
        if (cachedRaw === snapshot)
            return cached;
        cachedRaw = snapshot;
        cached = resolveSafely(snapshot, ctx.logger);
        return cached;
    };
    const registry = {
        get(providerId) {
            return resolve().find(p => p.id === providerId);
        },
        async resolveApiKey(provider) {
            // The credentials service takes a BARE REFERENCE STRING.
            const credentials = ctx.get('credentials');
            if (credentials !== undefined) {
                const hit = await credentials.resolve(provider.credentialRef);
                if (hit !== undefined && hit.value.length > 0)
                    return hit.value;
            }
            if (provider.apiKeyEnv !== undefined) {
                const environment = ctx.get('launchEnvironment');
                if (environment !== undefined) {
                    const found = environment.get(provider.apiKeyEnv);
                    if (found !== undefined && found.value.length > 0)
                        return found.value;
                }
            }
            throw new Error(`${PKG}: no API key for provider "${provider.id}" `
                + `(credential reference "${provider.credentialRef}")`);
        },
    };
    /** Adapter routes, kept in sync with the configured provider set. */
    const routes = new Map();
    const sync = () => {
        const next = new Set(resolve().filter(p => p.enabled).map(p => p.id));
        for (const [id, dispose] of Array.from(routes)) {
            if (!next.has(id)) {
                dispose();
                routes.delete(id);
            }
        }
        for (const id of Array.from(next)) {
            if (routes.has(id))
                continue;
            routes.set(id, ctx.llm.registerAdapter([id], new ConfigAdapter(registry, id)));
        }
    };
    /**
     * The configurable-provider directory. Registration may NOT begin empty and
     * `replace` rejects an empty candidate, so the handle is acquired lazily on
     * the first non-empty set and withdrawn when the set empties.
     */
    const declared = () => resolve().map(p => ({
        provider: p.id,
        displayName: p.displayName,
        settingsNs: NS,
        settingsPath: ['providers', p.id],
        declared: true,
    }));
    let directoryHandle = null;
    let directoryIds = [];
    const syncDirectory = () => {
        const entries = declared();
        const ids = entries.map(e => e.provider);
        const unchanged = directoryIds.length === ids.length && directoryIds.every((id, i) => id === ids[i]);
        if (unchanged)
            return;
        if (directoryHandle === null) {
            if (ids.length === 0) {
                directoryIds = [];
                return;
            }
            directoryHandle = ctx.llm.registerConfigurableProviders(entries);
            directoryIds = ids;
            return;
        }
        if (ids.length === 0) {
            directoryHandle();
            directoryHandle = null;
            directoryIds = [];
            return;
        }
        directoryHandle.replace(entries);
        directoryIds = ids;
    };
    const refresh = () => {
        sync();
        syncDirectory();
    };
    ctx.llm.registerModelDiscovery(NS, async (request, signal) => {
        const providerId = typeof request.provider === 'string' ? request.provider : undefined;
        const provider = providerId !== undefined ? registry.get(providerId) : undefined;
        const rawBase = typeof request.baseURL === 'string' && request.baseURL.length > 0
            ? request.baseURL
            : provider?.baseURL;
        if (rawBase === undefined) {
            throw new Error(`${PKG}: model discovery needs a baseURL, or the id of a configured provider`);
        }
        const base = rawBase.replace(/\/+$/, '');
        let apiKey = request.apiKey;
        if (apiKey === undefined || apiKey.length === 0) {
            if (provider !== undefined) {
                apiKey = await registry.resolveApiKey(provider);
            }
            else if (providerId !== undefined) {
                const credentials = ctx.get('credentials');
                if (credentials !== undefined) {
                    const hit = await credentials.resolve(credentialRefFor(providerId));
                    if (hit !== undefined && hit.value.length > 0)
                        apiKey = hit.value;
                }
            }
        }
        if (apiKey === undefined || apiKey.length === 0) {
            throw new Error(`${PKG}: no API key for "${String(request.provider)}"; save one first`);
        }
        const protocol = (request.api ?? provider?.protocol ?? 'openai-chat');
        // A draft being interrogated has no stored profile, so authenticate the
        // probe with a synthetic owner carrying the protocol's default scheme.
        const owner = provider ?? {
            id: providerId ?? 'draft',
            displayName: providerId ?? 'draft',
            enabled: true,
            protocol,
            baseURL: base,
            authScheme: (protocol === 'google-gemini' ? 'query' : 'bearer'),
            credentialRef: credentialRefFor(providerId ?? 'draft'),
            modelExcludePatterns: [...DEFAULT_EXCLUDE],
            defaultContextWindow: 128_000,
            streamIdleTimeoutMs: 300_000,
            models: [],
        };
        let response;
        try {
            response = await undiciFetch(`${base}/models`, {
                method: 'GET',
                headers: { accept: 'application/json', ...authHeaders(owner, apiKey) },
                ...(signal !== undefined ? { signal } : {}),
            });
        }
        catch (error) {
            throw new Error(`${PKG}: model discovery against ${base} failed: `
                + `${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response.ok) {
            throw new Error(`${PKG}: model discovery returned HTTP ${response.status}`);
        }
        const payload = (await response.json());
        const record = (payload ?? {});
        const rows = Array.isArray(payload)
            ? payload
            : Array.isArray(record.data)
                ? record.data
                : Array.isArray(record.models) ? record.models : [];
        const excludes = (provider?.modelExcludePatterns ?? DEFAULT_EXCLUDE).map(p => p.toLowerCase());
        const out = [];
        for (const raw of rows) {
            const row = raw;
            const id = typeof row.id === 'string' && row.id.length > 0
                ? row.id
                : (typeof row.name === 'string' && row.name.length > 0 ? row.name : undefined);
            if (id === undefined)
                continue;
            if (excludes.some(pattern => id.toLowerCase().includes(pattern)))
                continue;
            const entry = {
                id,
                name: typeof row.displayName === 'string' ? row.displayName : id,
            };
            if (typeof row.context_length === 'number')
                entry.contextWindow = row.context_length;
            if (typeof row.inputTokenLimit === 'number')
                entry.contextWindow = row.inputTokenLimit;
            if (typeof row.max_tokens === 'number')
                entry.maxTokens = row.max_tokens;
            if (typeof row.outputTokenLimit === 'number')
                entry.maxTokens = row.outputTokenLimit;
            out.push(entry);
        }
        out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return out;
    });
    // Enrichment from the public models.dev catalog. Host-side so the browser
    // never makes a cross-origin download.
    //
    // The channel is registered through the connection service's OWN
    // `register(owner, channel, handler)`, NOT the `rpc.handle(channel, handler)`
    // the type advertises. On this host line `handle` is unusable: its `rpc`
    // getter captures the connection service's own context, which has no
    // `webServer` injected, so the registration throws
    // `cannot get property "webServer" without inject` — and the throw is
    // swallowed by the effect. The channel then silently never appears and the
    // browser meets the SPA fallback's 405. Passing our own inject-scope context
    // as the owner fixes it; `register` is the very method `handle` delegates to.
    //
    // Both services are injected so registration waits for each to exist and
    // re-runs if either reloads.
    ctx.inject(['connection', 'webServer'], scoped => {
        const connection = scoped.get('connection');
        if (connection === undefined)
            return;
        const registrar = connection;
        // Call `register` DIRECTLY: it already wraps its own work in
        // `owner.effect(...)` and returns that Disposable.
        try {
            registrar.register(scoped, RPC_CHANNEL, async (endpoint, payload, signal) => {
                if (endpoint !== 'catalog-facts') {
                    return {
                        ok: false,
                        error: { code: 'internal', message: `${PKG}: unknown endpoint "${endpoint}"`, details: {} },
                    };
                }
                const request = (payload ?? {});
                const modelIds = Array.isArray(request.modelIds)
                    ? request.modelIds.filter((id) => typeof id === 'string' && id.length > 0)
                    : [];
                if (modelIds.length === 0)
                    return { ok: true, value: {} };
                try {
                    // Every provider's publication, so the page can offer a choice:
                    // one model id is commonly published with conflicting facts.
                    const candidates = await fetchCatalogCandidates(modelIds, signal);
                    return { ok: true, value: candidates };
                }
                catch (error) {
                    // Failures answer as the error envelope, never a thrown value: a
                    // thrown handler maps to an opaque HTTP 500 that hides the cause.
                    return {
                        ok: false,
                        error: {
                            code: 'internal',
                            message: error instanceof Error ? error.message : String(error),
                            details: {},
                        },
                    };
                }
            });
        }
        catch (error) {
            // A failure here must be LOUD: a silently unmounted channel surfaces to
            // the user only as the SPA fallback's unexplained 405.
            ctx.logger?.error?.(`${PKG}: could not register RPC channel ${RPC_CHANNEL}`);
            ctx.logger?.error?.(error instanceof Error ? error.message : String(error));
        }
    });
    ctx.inject(['settings'], scoped => {
        // `owner` is THIS context, so unloading the plugin suppresses fallback work.
        scoped.settings.installSection(ctx, NS, ConfigSchema, config, {
            validate: (value) => {
                resolveConfig(value);
            },
            // `setSource` hands over a THUNK, not a snapshot: it must be re-read on
            // every change, or a later edit would keep resolving the install-time
            // value and no new provider would ever register.
            setSource: (source) => {
                readSource = source;
                refresh();
            },
            onChange: () => {
                refresh();
            },
        });
    });
    sync();
}
export { ConfigAdapter, credentialRefFor, resolveConfig };
//# sourceMappingURL=index.js.map