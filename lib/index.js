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
 * The stored section shape, and this plugin's composition Config schema.
 *
 * Under the 0.2 settings model a plugin no longer installs a namespace of its
 * own: the Loader entry IS the namespace, keyed by the entry id, and the entry
 * schema exported as `Config` is what the settings service projects into a form
 * and validates writes against. `providers` is declared `.volatile()` so a
 * settings edit commits a fresh snapshot into this running plugin instead of
 * restarting it — the value is read through `config.providers.get()` and
 * `loader/volatile-update` announces each commit.
 *
 * `providers` is a DICT keyed by provider id, not an array: a configurable
 * provider directory entry names ONE provider profile by `settingsPath`, and a
 * path into an array cannot address a single row. The Models page reads each
 * profile's `apiKeyEnv` through that path.
 */
export const Config = z.object({
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
        // Retry policy: a number (maxRetries shorthand) or the framework's
        // RetryPolicyConfig object. Full validation runs in resolveConfig through
        // the framework's own resolveRetryPolicy.
        retry: z.union([z.number(), z.any()]),
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
    })).default({}).volatile(),
});
/** The empty section a composition entry starts from. */
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
     * The live configuration section.
     *
     * `config.providers` is a volatile reference the Loader commits into on every
     * settings edit, so the section is re-read from it rather than captured. The
     * wrapper object is memoized by the snapshot's identity, which is what keeps
     * {@link resolve}'s identity comparison meaningful: an unchanged snapshot
     * reuses the resolved providers, a committed one rebuilds them.
     */
    let cachedProviders;
    let cachedSection = { providers: EMPTY.providers };
    const readSource = () => {
        const providers = config.providers.get();
        if (providers !== cachedProviders) {
            cachedProviders = providers;
            cachedSection = { providers };
        }
        return cachedSection;
    };
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
        resolveAttachments() {
            // Image input rides the durable attachment service when the deployment
            // mounts one; `ctx.get` keeps it optional exactly like credentials.
            return ctx.get('attachments');
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
    /**
     * Adapter routes, kept in sync with the configured provider set.
     *
     * The RETRY POLICY is captured at registration time (the framework resolves
     * `providerRetryPolicy` once per route registration), so a route whose
     * policy changed must be re-registered for the new value to take effect.
     * `routeFacts` is the JSON signature of the policy per route; a change
     * disposes and re-registers exactly that route.
     */
    const routes = new Map();
    const routePolicies = new Map();
    const sync = () => {
        const live = resolve().filter(p => p.enabled);
        const nextPolicies = new Map(live.map(p => [p.id, JSON.stringify(p.retry ?? null)]));
        for (const [id, dispose] of Array.from(routes)) {
            if (!nextPolicies.has(id) || routePolicies.get(id) !== nextPolicies.get(id)) {
                dispose();
                routes.delete(id);
                routePolicies.delete(id);
            }
        }
        for (const [id, policy] of Array.from(nextPolicies)) {
            if (routes.has(id))
                continue;
            routes.set(id, ctx.llm.registerAdapter([id], new ConfigAdapter(registry, id)));
            routePolicies.set(id, policy);
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
    // REGISTRATION PATH (re-verified against @deepseek-ai/dsh-client-connection
    // 0.2.0-rc.2): the public `rpc.handle(channel, handler)` is still unusable
    // here. Its `rpc` getter takes `owner = this.ctx` — the connection service's
    // OWN context, which never declared `webServer` — and `register` then runs
    // `owner.effect(() => owner.webServer.register(route))`, so the registration
    // throws `cannot get property "webServer" without inject`. Cordis service
    // tracing does not rebind `this.ctx` to the reading context, so reading the
    // service from a `webServer`-injected scope does not help. The throw escapes
    // synchronously, which is why the public path is ATTEMPTED first (so a host
    // line that fixes this starts using it automatically) and the private
    // `register(owner, channel, handler)` — the very method `handle` delegates
    // to, wrapped in `owner.effect` itself — is the fallback that actually
    // mounts the channel, with our own inject-scope context as the owner.
    //
    // Both services are injected so registration waits for each to exist and
    // re-runs if either reloads.
    ctx.inject(['connection', 'webServer'], scoped => {
        const connection = scoped.get('connection');
        if (connection === undefined)
            return;
        const handler = async (endpoint, payload, signal) => {
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
                // Every provider's publication, so the page can offer a choice: one
                // model id is commonly published with conflicting facts.
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
        };
        const registrar = connection;
        try {
            if (typeof registrar.rpc?.handle === 'function') {
                registrar.rpc.handle(RPC_CHANNEL, handler);
                return;
            }
        }
        catch {
            // Falls through to the private registration below.
        }
        try {
            if (typeof registrar.register === 'function') {
                registrar.register(scoped, RPC_CHANNEL, handler);
                return;
            }
            throw new Error('the connection service exposes neither rpc.handle nor register');
        }
        catch (error) {
            // A failure here must be LOUD: a silently unmounted channel surfaces to
            // the user only as the SPA fallback's unexplained 405.
            ctx.logger?.error?.(`${PKG}: could not register RPC channel ${RPC_CHANNEL}`);
            ctx.logger?.error?.(error instanceof Error ? error.message : String(error));
        }
    });
    // This plugin owns a hand-written Models page, which is registered on the
    // client half into the settings shell's `settings.section` slot. Under the
    // 0.2 settings model the entry's own schema would otherwise ALSO produce an
    // auto-generated page, so the automatic policy is switched off for this
    // instance. `configure` takes the FIBER the policy belongs to; passing the
    // plugin's own `ctx.fiber` (not the injected child's) is what binds the
    // policy to the entry whose schema this is.
    ctx.inject(['settings'], scoped => {
        scoped.effect(() => scoped.settings.configure({ auto: false }, ctx.fiber), 'llm-config: hand-written settings page');
    });
    // A settings edit commits a fresh `providers` snapshot into the volatile
    // reference without restarting this plugin; the Loader then announces the
    // change on the owning fiber. Re-deriving routes and the directory here is
    // what makes an edit reach the very next request.
    ctx.on('loader/volatile-update', () => {
        refresh();
    });
    sync();
}
export { ConfigAdapter, credentialRefFor, resolveConfig };
//# sourceMappingURL=index.js.map