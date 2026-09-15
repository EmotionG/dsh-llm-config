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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { ConfigAdapter, PKG } from './adapter.ts';
import { credentialRefFor, resolveConfig } from './config.ts';
export { PKG };
/** The settings namespace this plugin owns. */
export declare const NS = "llm-config";
/**
 * The Connection RPC channel the browser reaches this plugin's host half on.
 *
 * Distinct from {@link NS}: the settings namespace is the dotted settings-and-
 * copy namespace, while this is an absolute path on the shared Connection
 * transport. The client half must name the SAME value — a mismatch makes the
 * browser POST to an unregistered channel and the web server answers 405.
 */
export declare const RPC_CHANNEL = "/llm-config";
/**
 * The stored section shape.
 *
 * `providers` is a DICT keyed by provider id, not an array: a configurable
 * provider directory entry names ONE provider profile by `settingsPath`, and a
 * path into an array cannot address a single row. The Models page reads each
 * profile's `apiKeyEnv` through that path.
 */
export declare const ConfigSchema: z<Schemastery.ObjectS<{
    providers: z<import("@deepseek-ai/cosmokit").Dict<{
        id?: string | null | undefined;
        displayName?: string | null | undefined;
        enabled?: boolean | null | undefined;
        protocol?: string | null | undefined;
        baseURL?: string | null | undefined;
        authScheme?: string | null | undefined;
        apiKeyEnv?: string | null | undefined;
        apiKeyHeader?: string | null | undefined;
        apiKeyPrefix?: string | null | undefined;
        organization?: string | null | undefined;
        project?: string | null | undefined;
        maxTokens?: number | null | undefined;
        modelExcludePatterns?: string[] | null | undefined;
        defaultContextWindow?: number | null | undefined;
        streamIdleTimeoutMs?: number | null | undefined;
        retry?: number | null | undefined;
        extraHeaders?: any;
        models?: ({
            id?: string | null | undefined;
            name?: string | null | undefined;
            description?: string | null | undefined;
            protocol?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            temperature?: number | null | undefined;
            topP?: number | null | undefined;
            streamIdleTimeoutMs?: number | null | undefined;
            reasoningEfforts?: string[] | null | undefined;
            defaultReasoningEffort?: string | null | undefined;
            inputModalities?: string[] | null | undefined;
            stop?: string[] | null | undefined;
            effort?: ({
                mode?: string | null | undefined;
                field?: string | null | undefined;
                values?: string[] | null | undefined;
                default?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            extraBody?: any;
            extraHeaders?: any;
        } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<{
        id: z<string, string>;
        displayName: z<string, string>;
        enabled: z<boolean, boolean>;
        protocol: z<string, string>;
        baseURL: z<string, string>;
        authScheme: z<string, string>;
        apiKeyEnv: z<string, string>;
        apiKeyHeader: z<string, string>;
        apiKeyPrefix: z<string, string>;
        organization: z<string, string>;
        project: z<string, string>;
        maxTokens: z<number, number>;
        modelExcludePatterns: z<string[], string[]>;
        defaultContextWindow: z<number, number>;
        streamIdleTimeoutMs: z<number, number>;
        retry: z<number, number>;
        extraHeaders: z<any, any>;
        models: z<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            description?: string | null | undefined;
            protocol?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            temperature?: number | null | undefined;
            topP?: number | null | undefined;
            streamIdleTimeoutMs?: number | null | undefined;
            reasoningEfforts?: string[] | null | undefined;
            defaultReasoningEffort?: string | null | undefined;
            inputModalities?: string[] | null | undefined;
            stop?: string[] | null | undefined;
            effort?: ({
                mode?: string | null | undefined;
                field?: string | null | undefined;
                values?: string[] | null | undefined;
                default?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            extraBody?: any;
            extraHeaders?: any;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
            id: z<string, string>;
            name: z<string, string>;
            description: z<string, string>;
            protocol: z<string, string>;
            contextWindow: z<number, number>;
            maxTokens: z<number, number>;
            temperature: z<number, number>;
            topP: z<number, number>;
            streamIdleTimeoutMs: z<number, number>;
            reasoningEfforts: z<string[], string[]>;
            defaultReasoningEffort: z<string, string>;
            inputModalities: z<string[], string[]>;
            stop: z<string[], string[]>;
            effort: z<Schemastery.ObjectS<{
                mode: z<string, string>;
                field: z<string, string>;
                values: z<string[], string[]>;
                default: z<string, string>;
            }>, Schemastery.ObjectT<{
                mode: z<string, string>;
                field: z<string, string>;
                values: z<string[], string[]>;
                default: z<string, string>;
            }>>;
            extraBody: z<any, any>;
            extraHeaders: z<any, any>;
        }>[]>;
    }>, string>>;
}>, Schemastery.ObjectT<{
    providers: z<import("@deepseek-ai/cosmokit").Dict<{
        id?: string | null | undefined;
        displayName?: string | null | undefined;
        enabled?: boolean | null | undefined;
        protocol?: string | null | undefined;
        baseURL?: string | null | undefined;
        authScheme?: string | null | undefined;
        apiKeyEnv?: string | null | undefined;
        apiKeyHeader?: string | null | undefined;
        apiKeyPrefix?: string | null | undefined;
        organization?: string | null | undefined;
        project?: string | null | undefined;
        maxTokens?: number | null | undefined;
        modelExcludePatterns?: string[] | null | undefined;
        defaultContextWindow?: number | null | undefined;
        streamIdleTimeoutMs?: number | null | undefined;
        retry?: number | null | undefined;
        extraHeaders?: any;
        models?: ({
            id?: string | null | undefined;
            name?: string | null | undefined;
            description?: string | null | undefined;
            protocol?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            temperature?: number | null | undefined;
            topP?: number | null | undefined;
            streamIdleTimeoutMs?: number | null | undefined;
            reasoningEfforts?: string[] | null | undefined;
            defaultReasoningEffort?: string | null | undefined;
            inputModalities?: string[] | null | undefined;
            stop?: string[] | null | undefined;
            effort?: ({
                mode?: string | null | undefined;
                field?: string | null | undefined;
                values?: string[] | null | undefined;
                default?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            extraBody?: any;
            extraHeaders?: any;
        } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<{
        id: z<string, string>;
        displayName: z<string, string>;
        enabled: z<boolean, boolean>;
        protocol: z<string, string>;
        baseURL: z<string, string>;
        authScheme: z<string, string>;
        apiKeyEnv: z<string, string>;
        apiKeyHeader: z<string, string>;
        apiKeyPrefix: z<string, string>;
        organization: z<string, string>;
        project: z<string, string>;
        maxTokens: z<number, number>;
        modelExcludePatterns: z<string[], string[]>;
        defaultContextWindow: z<number, number>;
        streamIdleTimeoutMs: z<number, number>;
        retry: z<number, number>;
        extraHeaders: z<any, any>;
        models: z<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            description?: string | null | undefined;
            protocol?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            temperature?: number | null | undefined;
            topP?: number | null | undefined;
            streamIdleTimeoutMs?: number | null | undefined;
            reasoningEfforts?: string[] | null | undefined;
            defaultReasoningEffort?: string | null | undefined;
            inputModalities?: string[] | null | undefined;
            stop?: string[] | null | undefined;
            effort?: ({
                mode?: string | null | undefined;
                field?: string | null | undefined;
                values?: string[] | null | undefined;
                default?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            extraBody?: any;
            extraHeaders?: any;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
            id: z<string, string>;
            name: z<string, string>;
            description: z<string, string>;
            protocol: z<string, string>;
            contextWindow: z<number, number>;
            maxTokens: z<number, number>;
            temperature: z<number, number>;
            topP: z<number, number>;
            streamIdleTimeoutMs: z<number, number>;
            reasoningEfforts: z<string[], string[]>;
            defaultReasoningEffort: z<string, string>;
            inputModalities: z<string[], string[]>;
            stop: z<string[], string[]>;
            effort: z<Schemastery.ObjectS<{
                mode: z<string, string>;
                field: z<string, string>;
                values: z<string[], string[]>;
                default: z<string, string>;
            }>, Schemastery.ObjectT<{
                mode: z<string, string>;
                field: z<string, string>;
                values: z<string[], string[]>;
                default: z<string, string>;
            }>>;
            extraBody: z<any, any>;
            extraHeaders: z<any, any>;
        }>[]>;
    }>, string>>;
}>>;
/** The empty section the composition entry starts from. */
export declare const EMPTY: {
    providers: {};
};
/** The stored section type, inferred from the schema. */
type StoredSection = ReturnType<typeof ConfigSchema>;
/**
 * Required services. `llm` is a HARD dependency: the plugin registers adapter
 * routes on it during apply, so cordis must activate this plugin only once the
 * LLM service exists — and `ctx.llm` is readable only because it is declared
 * here. `credentials`/`settings`/`launchEnvironment` are read through
 * `ctx.get` because each is optional.
 */
export declare const inject: string[];
export declare function apply(ctx: Context, config: StoredSection): void;
export { ConfigAdapter, credentialRefFor, resolveConfig };
export type { Config, ConfigProvider } from './config.ts';
//# sourceMappingURL=index.d.ts.map