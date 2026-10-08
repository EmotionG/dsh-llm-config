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
 * Three DIFFERENT names, and they must not be conflated:
 *
 * - `COPY_NS` is the copy (locale) namespace the shell looks up through the
 *   slot's `locale` option. Copy namespaces are conventionally dotted, so this
 *   one is `settings.llm-config`.
 * - `RPC_CHANNEL` is the Connection RPC channel the host registered. It is an
 *   absolute HTTP-ish path, so it must match the host's channel exactly.
 * - The SETTINGS namespace is not named here at all: under the 0.2 settings
 *   model it is the plugin's PROFILE ENTRY ID (`llm-config`, pinned by this
 *   package's `cordis.patch.yml`), and it is the string the Models page passes
 *   to `remote.settings.mutate` / `remote.llm.discoverModels`. It is declared
 *   next to those calls in `ModelProvidersSection.tsx`.
 *
 * Reusing one constant across these makes the browser POST to a channel nobody
 * registered, and the request falls through to the web server as a 405.
 */
const COPY_NS = 'settings.llm-config'
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
  min-height: 30px;
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
/* Fields align at the TOP, not the bottom: a flex-end row makes labels sit at
   different heights whenever one field wraps or carries a hint, which is the
   jagged label row in the retry/auth rows. */
.llmcfg-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; min-width: 0; }
.llmcfg-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* Grow only inside a horizontal row. A Field as a column child of the card
   body would otherwise eat leftover HEIGHT (flex-basis 160/280px + grow),
   which is the empty band under the base-URL input. */
.llmcfg-row > .llmcfg-field { flex: 1 1 160px; min-width: 110px; max-width: 100%; }
.llmcfg-row > .llmcfg-field--grow { flex: 2 1 280px; }
/* A field that must NOT stretch: the retry-mode select was a full-width bar,
   twice the height of its neighbours and spanning the card. */
.llmcfg-row > .llmcfg-field--fixed { flex: 0 0 200px; min-width: 0; }
.llmcfg-field--fixed .llmcfg-select { width: 200px; max-width: 100%; }
.llmcfg-label { font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }
.llmcfg-hint { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-dimmed); }
.llmcfg-input, .llmcfg-select, .llmcfg-area {
  box-sizing: border-box; padding: 5px 10px; border-radius: 6px; width: 100%;
  min-height: 30px;
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
  min-width: 0; max-width: 100%; overflow-wrap: anywhere;
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
  /* Never wrap: the remove/params buttons must stay on the same line. A long
     summary shrinks (and ellipsizes) to make room instead of pushing the
     buttons onto a second row, which is what made rows look broken. */
  flex-wrap: nowrap;
}
.llmcfg-modelid { flex: 0 1 240px; min-width: 96px; width: 240px; height: 30px; }
/* The summary is flex-basis 0: it only takes leftover space and ALWAYS yields
   to the id input and the buttons, ellipsizing instead of overflowing. */
.llmcfg-modelsum { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.llmcfg-modelbody {
  display: flex; flex-direction: column; gap: 8px; padding: 8px 8px 10px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0; max-width: 100%;
}
/* Chips align with the other inputs in the row: the 28px minimum is 2px
   shorter than the controls around it, which tilted the modality label. */
.llmcfg-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 30px; }
.llmcfg-chip {
  box-sizing: border-box; min-height: 30px;
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
  min-width: 0; max-width: 100%;
}
.llmcfg-keybar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  min-height: 28px;
}
.llmcfg-keyinput { flex: 1 1 180px; min-width: 140px; max-width: 100%; }
.llmcfg-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.llmcfg-toolbar .llmcfg-button { padding: 5px 8px; min-height: 30px; }
/* Buttons in a model bar keep their label on one line and never shrink away. */
.llmcfg-modelbar .llmcfg-button { flex: 0 0 auto; white-space: nowrap; }
/* The spacer yields before the summary does, so the summary keeps room. */
.llmcfg-modelbar .llmcfg-spacer { flex: 0 1 8px; }
.llmcfg-catalogrow {
  display: grid; grid-template-columns: minmax(100px, 180px) minmax(0, 1fr);
  align-items: center; gap: 8px;
}
.llmcfg-catalogid {
  font-size: 11px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.llmcfg-details {
  border-top: 1px dashed var(--dsw-alias-border-l2);
  padding-top: 6px;
  min-width: 0;
}
.llmcfg-details > summary {
  cursor: pointer; list-style: none; font-size: 12px; color: var(--dsw-alias-label-secondary);
  padding: 4px 0; user-select: none;
}
.llmcfg-details { margin-top: 2px; }
.llmcfg-details > summary::-webkit-details-marker { display: none; }
.llmcfg-details[open] > summary { margin-bottom: 6px; }
.llmcfg-details[open] { display: flex; flex-direction: column; gap: 8px; }
/* The catalog chooser's select rides a grid track of 0..1fr, so it never
   widens its column; the details block and its rows stay clamped too. */
.llmcfg-details .llmcfg-select { max-width: 100%; }
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
  ctx.effect(() => ctx.locale.register(COPY_NS, { zh, en }), 'llm-config: copy dictionaries')

  // Fiber-scoped styles: removed with the plugin, so a reload swaps them cleanly.
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const element = document.createElement('style')
      element.textContent = SECTION_CSS
      document.head.append(element)
      return () => { element.remove() }
    }, 'llm-config: section styles')
  }

  const t = ctx.locale.bind(COPY_NS)
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
    locale: COPY_NS,
    inject: injected,
  }, ModelProvidersSection))
}
