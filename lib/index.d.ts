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
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    providers: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
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
    } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        id: z<string, string, "defined">;
        displayName: z<string, string, "plain">;
        enabled: z<boolean, boolean, "plain">;
        protocol: z<string, string, "plain">;
        baseURL: z<string, string, "defined">;
        authScheme: z<string, string, "plain">;
        apiKeyEnv: z<string, string, "plain">;
        apiKeyHeader: z<string, string, "plain">;
        apiKeyPrefix: z<string, string, "plain">;
        organization: z<string, string, "plain">;
        project: z<string, string, "plain">;
        maxTokens: z<number, number, "plain">;
        modelExcludePatterns: z<string[], string[], "plain">;
        defaultContextWindow: z<number, number, "plain">;
        streamIdleTimeoutMs: z<number, number, "plain">;
        retry: z<number, number, "plain">;
        extraHeaders: z<any, any, "plain">;
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
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: z<string, string, "defined">;
            name: z<string, string, "plain">;
            description: z<string, string, "plain">;
            protocol: z<string, string, "plain">;
            contextWindow: z<number, number, "plain">;
            maxTokens: z<number, number, "plain">;
            temperature: z<number, number, "plain">;
            topP: z<number, number, "plain">;
            streamIdleTimeoutMs: z<number, number, "plain">;
            reasoningEfforts: z<string[], string[], "plain">;
            defaultReasoningEffort: z<string, string, "plain">;
            inputModalities: z<string[], string[], "plain">;
            stop: z<string[], string[], "plain">;
            effort: z<Schemastery.ObjectS<NoInfer<{
                mode: z<string, string, "plain">;
                field: z<string, string, "plain">;
                values: z<string[], string[], "plain">;
                default: z<string, string, "plain">;
            }>>, Schemastery.ObjectT<NoInfer<{
                mode: z<string, string, "plain">;
                field: z<string, string, "plain">;
                values: z<string[], string[], "plain">;
                default: z<string, string, "plain">;
            }>>, "plain">;
            extraBody: z<any, any, "plain">;
            extraHeaders: z<any, any, "plain">;
        }>>[], "plain">;
    }>>, string>>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    providers: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
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
    } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        id: z<string, string, "defined">;
        displayName: z<string, string, "plain">;
        enabled: z<boolean, boolean, "plain">;
        protocol: z<string, string, "plain">;
        baseURL: z<string, string, "defined">;
        authScheme: z<string, string, "plain">;
        apiKeyEnv: z<string, string, "plain">;
        apiKeyHeader: z<string, string, "plain">;
        apiKeyPrefix: z<string, string, "plain">;
        organization: z<string, string, "plain">;
        project: z<string, string, "plain">;
        maxTokens: z<number, number, "plain">;
        modelExcludePatterns: z<string[], string[], "plain">;
        defaultContextWindow: z<number, number, "plain">;
        streamIdleTimeoutMs: z<number, number, "plain">;
        retry: z<number, number, "plain">;
        extraHeaders: z<any, any, "plain">;
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
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: z<string, string, "defined">;
            name: z<string, string, "plain">;
            description: z<string, string, "plain">;
            protocol: z<string, string, "plain">;
            contextWindow: z<number, number, "plain">;
            maxTokens: z<number, number, "plain">;
            temperature: z<number, number, "plain">;
            topP: z<number, number, "plain">;
            streamIdleTimeoutMs: z<number, number, "plain">;
            reasoningEfforts: z<string[], string[], "plain">;
            defaultReasoningEffort: z<string, string, "plain">;
            inputModalities: z<string[], string[], "plain">;
            stop: z<string[], string[], "plain">;
            effort: z<Schemastery.ObjectS<NoInfer<{
                mode: z<string, string, "plain">;
                field: z<string, string, "plain">;
                values: z<string[], string[], "plain">;
                default: z<string, string, "plain">;
            }>>, Schemastery.ObjectT<NoInfer<{
                mode: z<string, string, "plain">;
                field: z<string, string, "plain">;
                values: z<string[], string[], "plain">;
                default: z<string, string, "plain">;
            }>>, "plain">;
            extraBody: z<any, any, "plain">;
            extraHeaders: z<any, any, "plain">;
        }>>[], "plain">;
    }>>, string>>, "volatile-defined">;
}>>, "plain">;
/** The empty section a composition entry starts from. */
export declare const EMPTY: {
    providers: {};
};
/** The resolved entry config type, inferred from the schema. */
type StoredConfig = ReturnType<typeof Config>;
/**
 * Required services. `llm` is a HARD dependency: the plugin registers adapter
 * routes on it during apply, so cordis must activate this plugin only once the
 * LLM service exists — and `ctx.llm` is readable only because it is declared
 * here. `credentials`/`settings`/`launchEnvironment` are read through
 * `ctx.get` because each is optional.
 */
export declare const inject: string[];
export declare function apply(ctx: Context, config: StoredConfig): void;
export { ConfigAdapter, credentialRefFor, resolveConfig };
export type { Config as ResolvedConfig, ConfigProvider } from './config.ts';
//# sourceMappingURL=index.d.ts.map