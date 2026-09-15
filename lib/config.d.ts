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
import { type RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
/** A reasoning-control vocabulary is a per-PROTOCOL property, not a global one. */
export type EffortMode = 'none' | 'field' | 'thinking';
/** Wire formats this plugin can speak. */
export type ProtocolId = 'openai-chat' | 'openai-responses' | 'anthropic-messages' | 'google-gemini';
/** How a request authenticates. */
export type AuthScheme = 'bearer' | 'x-api-key' | 'query' | 'none';
/**
 * Reasoning control for one model.
 *
 * The vocabulary is NOT derived from the wire protocol: Kimi K3 and Kimi K2.x
 * both speak OpenAI chat yet take entirely different control fields, so each
 * model declares its own field path and accepted values.
 */
export interface ModelEffort {
    /** `field` writes a scalar at `field`; `thinking` writes `{type: value}`. */
    mode: EffortMode;
    /** Dotted path, e.g. `reasoning_effort` or `output_config.effort`. */
    field: string;
    /** Values this model accepts. */
    values: string[];
    /** Preset rung; must be one of `values`. */
    default?: string;
}
/** One configured model row. */
export interface ConfigModel {
    id: string;
    name?: string;
    description?: string;
    /** Overrides the provider's protocol for this model. */
    protocol?: ProtocolId;
    contextWindow?: number;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    streamIdleTimeoutMs?: number;
    reasoningEfforts?: string[];
    defaultReasoningEffort?: string;
    inputModalities: ('text' | 'image')[];
    stop?: string[];
    effort?: ModelEffort;
    extraBody?: Record<string, unknown>;
    extraHeaders?: Record<string, unknown>;
}
/** One configured provider, fully validated. */
export interface ConfigProvider {
    id: string;
    displayName: string;
    enabled: boolean;
    protocol: ProtocolId;
    baseURL: string;
    authScheme: AuthScheme;
    /** Credential reference this provider's key is stored under. */
    credentialRef: string;
    apiKeyEnv?: string;
    apiKeyHeader?: string;
    apiKeyPrefix?: string;
    maxTokens?: number;
    modelExcludePatterns: string[];
    defaultContextWindow: number;
    streamIdleTimeoutMs: number;
    /**
     * Request-retry policy for this provider route, in the framework's
     * `RetryPolicyConfig` shape (`mode: normal|always`, `maxRetries`,
     * `retryableCodes`, `backoff`). Resolved through the framework's own
     * `resolveRetryPolicy` so defaults match `dsh-llm` exactly.
     */
    retry?: RetryPolicyConfig;
    models: ConfigModel[];
    extraHeaders?: Record<string, unknown>;
}
/** The whole resolved settings section. */
export interface Config {
    providers: ConfigProvider[];
}
export declare const PROTOCOLS: readonly {
    id: ProtocolId;
    label: string;
}[];
export declare const DEFAULT_EXCLUDE: string[];
/**
 * Derive the credential reference for a provider id.
 *
 * The credentials service accepts only `/^[A-Za-z_][A-Za-z0-9_]*$/`, while a
 * provider id may contain `.` and `-`, so every credential access goes through
 * this total, deterministic mapping.
 */
export declare function credentialRefFor(providerId: string): string;
/**
 * Resolve a raw section into validated provider records.
 *
 * Accepts BOTH stored shapes for `providers`: the object map this plugin writes
 * (so a directory entry can address one profile by path), and a plain array
 * from an earlier version.
 */
export declare function resolveConfig(raw: unknown): Config;
//# sourceMappingURL=config.d.ts.map