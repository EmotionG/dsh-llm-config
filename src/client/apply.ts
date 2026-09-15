/**
 * Browser half apply: register the copy dictionary and one Model Providers
 * settings page.
 *
 * Data access rides the typert Remote namespaces (`ctx.remote.settings` /
 * `.credentials` / `.llm`), so the page reads and writes the same settings
 * section the host adapter reads — no bespoke RPC channel to keep in step.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.slots merge into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.locale merge into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { ModelProvidersSection, type InjectedProps } from './ModelProvidersSection.tsx'
import { en, zh } from './locale.ts'

/**
 * Two DIFFERENT names, and they must not be conflated:
 *
 * - `SETTINGS_NS` is the settings namespace and the copy namespace the shell
 *   looks up. Settings namespaces are conventionally dotted, so this one is
 *   `settings.llm-config`.
 * - `RPC_CHANNEL` is the Connection RPC channel the host registered. It is an
 *   absolute HTTP-ish path, so it must match the host's channel exactly.
 *
 * Reusing one constant for both makes the browser POST to a channel nobody
 * registered, and the request falls through to the web server as a 405.
 */
const SETTINGS_NS = 'settings.llm-config'
const RPC_CHANNEL = '/llm-config'

/**
 * Section styles. The browser bundle is one JS file and the module loader
 * serves no plugin CSS, so the section injects its rules as a fiber-scoped
 * `<style>` element. Colors ride the shell's design tokens, which `ui-theme`
 * redefines for the dark theme, so one rule set renders in both.
 */
const SECTION_CSS = `
.llmcfg-root { display: flex; flex-direction: column; gap: 10px; margin: 0; min-width: 0; }
.llmcfg-root p { margin: 0; }
.llmcfg-root h1, .llmcfg-root h2, .llmcfg-root h3, .llmcfg-root h4 { margin: 0; }
.llmcfg-intro { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 17px; max-width: 52em; }
.llmcfg-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.llmcfg-spacer { flex: 1 1 auto; min-width: 8px; }
.llmcfg-button {
  box-sizing: border-box;
  padding: 5px 10px; border-radius: 6px; font: inherit; font-size: 12px; line-height: 16px;
  min-height: 28px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer;
}
.llmcfg-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.llmcfg-button:disabled { opacity: 0.4; cursor: default; }
.llmcfg-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.llmcfg-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.llmcfg-button--ghost { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.llmcfg-button--danger { color: var(--dsw-alias-state-error-primary); border-color: transparent; }
.llmcfg-card {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-0, var(--dsw-alias-bg-layer-1));
}
.llmcfg-card[data-off="true"] { opacity: 0.55; }
.llmcfg-cardhead {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.llmcfg-card:not(:has(.llmcfg-cardbody)) .llmcfg-cardhead { border-bottom: 0; }
.llmcfg-cardbody {
  padding: 8px; display: flex; flex-direction: column; gap: 8px;
  /* Nested rows (sections, model list) may contain wrapping bars and long
     unbreakable ids; clamp them so nothing widens the card from inside. */
  min-width: 0; max-width: 100%;
}
.llmcfg-sec {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 12px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0; max-width: 100%;
}
.llmcfg-sectitle {
  font-weight: 600; font-size: 11px; line-height: 14px;
  color: var(--dsw-alias-label-secondary); letter-spacing: 0.04em;
  text-transform: uppercase;
}
.llmcfg-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; min-width: 0; }
.llmcfg-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
/* Grow only inside a horizontal row. A Field as a column child of the card
   body would otherwise eat leftover HEIGHT (flex-basis 160/280px + grow),
   which is the empty band under the base-URL input. */
.llmcfg-row > .llmcfg-field { flex: 1 1 160px; min-width: 110px; max-width: 100%; }
.llmcfg-row > .llmcfg-field--grow { flex: 2 1 280px; }
.llmcfg-label { font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }
.llmcfg-hint { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-dimmed); }
.llmcfg-input, .llmcfg-select, .llmcfg-area {
  box-sizing: border-box; padding: 5px 8px; border-radius: 6px; width: 100%;
  min-height: 28px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-0, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
}
.llmcfg-input:focus, .llmcfg-select:focus, .llmcfg-area:focus {
  outline: none; border-color: var(--dsw-alias-brand-primary);
}
.llmcfg-area { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; min-height: 52px; resize: vertical; }
.llmcfg-name { font-weight: 600; font-size: 13px; }
.llmcfg-meta { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.llmcfg-tag {
  display: inline-flex; align-items: center;
  box-sizing: border-box; min-height: 26px;
  font-size: 11px; line-height: 16px; padding: 0 8px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-0, transparent);
  color: var(--dsw-alias-label-secondary); white-space: nowrap;
}
.llmcfg-tag[data-state="ok"] { color: var(--dsw-alias-state-success-primary); background: transparent; }
.llmcfg-tag[data-state="warn"] { color: var(--dsw-alias-state-warning-primary); background: transparent; }
.llmcfg-note { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.llmcfg-banner {
  font-size: 12px; line-height: 16px; padding: 6px 9px; border-radius: 6px;
}
.llmcfg-warn { color: var(--dsw-alias-state-warning-primary); }
.llmcfg-error { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; }
.llmcfg-ok { color: var(--dsw-alias-state-success-primary); }
.llmcfg-empty {
  text-align: center; padding: 28px 12px; display: flex; flex-direction: column;
  gap: 4px; align-items: center; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px;
}
.llmcfg-empty-title { font-weight: 600; color: var(--dsw-alias-label-secondary); }
.llmcfg-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none; }
.llmcfg-modelist { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.llmcfg-modelrow {
  display: flex; flex-direction: column; gap: 0;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 0;
  background: var(--dsw-alias-bg-layer-0, transparent);
  /* A model row must never push content past its card: the inner bar wraps
     instead of stretching the row wider than the section it lives in. */
  min-width: 0; max-width: 100%; overflow: hidden;
}
.llmcfg-modelrow[data-open="true"] { background: var(--dsw-alias-bg-layer-1); }
.llmcfg-modelbar {
  width: 100%; padding: 4px 6px; gap: 6px;
  align-items: center;
  /* Wrap, never overflow: two buttons and the summary sit beside a growing
     id input; at narrow widths the row folds instead of escaping the card. */
  flex-wrap: wrap;
}
.llmcfg-modelid { flex: 1 1 140px; min-width: 120px; max-width: none; height: 28px; }
.llmcfg-modelsum { flex: 1 1 120px; min-width: 0; }
.llmcfg-modelbody {
  display: flex; flex-direction: column; gap: 8px; padding: 8px 8px 10px; width: 100%;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0; max-width: 100%;
}
.llmcfg-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 28px; }
.llmcfg-chip {
  box-sizing: border-box; min-height: 28px;
  font-size: 11px; line-height: 16px; padding: 0 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
}
.llmcfg-chip[data-on="true"] {
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent; color: var(--dsw-alias-label-primary-foreground);
}
.llmcfg-scroll {
  max-height: 220px; overflow: auto; display: flex; flex-direction: column; gap: 1px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 3px;
}
.llmcfg-pick { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 4px; font-size: 12px; }
.llmcfg-pick:hover { background: var(--dsw-alias-interactive-bg-hover); }
.llmcfg-pick code { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-left: auto; }
.llmcfg-sub {
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: 6px; padding: 8px 9px;
  display: flex; flex-direction: column; gap: 6px;
  background: var(--dsw-alias-bg-layer-0, transparent);
}
.llmcfg-keybar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  min-height: 28px;
}
.llmcfg-keyinput { flex: 1 1 180px; min-width: 140px; }
.llmcfg-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.llmcfg-toolbar .llmcfg-button { padding: 5px 8px; min-height: 28px; }
.llmcfg-catalogrow {
  display: grid; grid-template-columns: minmax(90px, 160px) minmax(0, 1fr);
  align-items: center; gap: 8px;
}
.llmcfg-catalogid {
  font-size: 11px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.llmcfg-details {
  border-top: 1px dashed var(--dsw-alias-border-l2);
  padding-top: 6px;
}
.llmcfg-details > summary {
  cursor: pointer; list-style: none; font-size: 12px; color: var(--dsw-alias-label-secondary);
  padding: 2px 0;
}
.llmcfg-details > summary::-webkit-details-marker { display: none; }
.llmcfg-details[open] > summary { margin-bottom: 6px; }
.llmcfg-details[open] { display: flex; flex-direction: column; gap: 8px; }
`

/** Required services (cordis fiber inject). */
/**
 * Required services (cordis fiber inject). `connection` is declared so the
 * plugin's own RPC channel is available; the remotes carry settings,
 * credentials and model discovery.
 */
export const inject = [
  'slots', 'locale', 'connection',
  'remote', 'remote.settings', 'remote.credentials', 'remote.llm',
]

/**
 * Register the Model Providers settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'llm-config: copy dictionaries')

  // Fiber-scoped styles: removed with the plugin, so a reload swaps them cleanly.
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const element = document.createElement('style')
      element.textContent = SECTION_CSS
      document.head.append(element)
      return () => { element.remove() }
    }, 'llm-config: section styles')
  }

  const t = ctx.locale.bind(SETTINGS_NS)
  // The plugin's own host RPC channel, for the models.dev lookup (a browser
  // fetch to models.dev would be a cross-origin call).
  const connection = ctx.get('connection') as ConnectionHandle

  const injected = (): InjectedProps => ({
    t: (key, params) => t(key as never, params as never),
    api: {
      describeSettings: () => ctx.remote.settings.describe() as never,
      mutateSettings: (ns, ops, expectedRevision) =>
        ctx.remote.settings.mutate(ns, ops as never, expectedRevision) as never,
      describeCredentials: refs => ctx.remote.credentials.describe(refs as never) as never,
      setCredential: (ref, value) => ctx.remote.credentials.set(ref as never, value) as never,
      discoverModels: (settingsNs, request) =>
        ctx.remote.llm.discoverModels(settingsNs as never, request as never) as never,
      catalogFacts: modelIds =>
        connection.rpc.call(RPC_CHANNEL, 'catalog-facts', { modelIds }) as never,
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'llm-config',
    order: 60,
    label: () => t('nav'),
    locale: SETTINGS_NS,
    inject: injected,
  }, ModelProvidersSection))
}
