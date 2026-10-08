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
import { LlmAdapter, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type ResolvedRetryPolicy, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { type AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { ConfigProvider } from './config.ts';
export declare const PKG = "llm-config";
/** The live view the adapter reads through; rebuilt whenever config changes. */
export interface ProviderRegistry {
    get(providerId: string): ConfigProvider | undefined;
    resolveApiKey(provider: ConfigProvider): Promise<string>;
    /**
     * The durable attachment service, when mounted. Image input is served only
     * through it: an image block carries a reference, and the bytes live in the
     * store. Returns `undefined` when the deployment offers no store, in which
     * case an image-carrying request is refused with `UNSUPPORTED_CONTENT`.
     */
    resolveAttachments(): AttachmentStore | undefined;
}
/** One adapter serving one provider route. */
export declare class ConfigAdapter extends LlmAdapter {
    #private;
    constructor(registry: ProviderRegistry, providerId: string);
    providerInfo(provider: string): LlmProviderInfo;
    /**
     * The provider-owned retry policy, captured when the route registers.
     *
     * `undefined` falls back to the framework's normal defaults (maxRetries 5),
     * which is exactly what an unconfigured route should do — so a configured
     * `retry` is returned verbatim-resolved, and an absent one is left alone.
     */
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** The public model metadata catalog this plugin enriches from. */
export declare const MODELS_DEV_API_URL = "https://models.dev/api.json";
/** Facts one catalog entry can contribute to a model row. */
export interface CatalogFacts {
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    inputModalities?: string[];
    reasoningEfforts?: string[];
    defaultReasoningEffort?: string;
}
/**
 * Download the models.dev catalog and match model ids against it.
 *
 * Host-side on purpose: the browser only names the ids, so no cross-origin
 * download happens from the page.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id the matching facts, or an empty object when nothing matched.
 */
/** One provider's publication of a model, with the facts that provider states. */
export interface CatalogCandidate {
    /** Catalog provider id, e.g. `moonshotai-cn`. */
    provider: string;
    /** Human-readable provider name from the catalog, when it states one. */
    providerName?: string;
    facts: CatalogFacts;
}
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
export declare function fetchCatalogCandidates(modelIds: readonly string[], signal?: AbortSignal): Promise<Record<string, CatalogCandidate[]>>;
/**
 * Collapse {@link fetchCatalogCandidates} to one candidate per id — the first,
 * which is catalog order. Used by callers that want a plain lookup rather than
 * the full choice set.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id the first matching facts, or an empty object when none did.
 */
export declare function fetchCatalogFacts(modelIds: readonly string[], signal?: AbortSignal): Promise<Record<string, CatalogFacts>>;
//# sourceMappingURL=adapter.d.ts.map