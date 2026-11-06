/**
 * Reasoning-effort regressions. Two defects are locked down here, both of which
 * showed up as "my thinking strength is ignored":
 *
 * 1. A model row that declared only ONE half of the effort fact. The advertised
 *    vocabulary (`reasoningEfforts`, what the framework validates against) and
 *    the transport (`effort`, what actually writes the field) must be derived
 *    from each other, so what the UI offers is what the request carries.
 * 2. On the Gemini wire, `applyEffort` wrote into `generationConfig` AFTER the
 *    emptiness check that attaches it, so a model whose only generation setting
 *    was the thinking budget dropped the whole object and the effort vanished
 *    with no error.
 */
import { resolveConfig, } from '../lib/config.js'
import { serializeRequest } from '../lib/serialize.js'
import { ConfigAdapter } from '../lib/adapter.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const baseProvider = {
  id: 'p',
  protocol: 'openai-chat',
  baseURL: 'http://127.0.0.1:1/v1',
}

function resolveOne(model) {
  return resolveConfig({ providers: { p: { ...baseProvider, models: [model] } } }).providers[0]
}

console.log('one declaration is enough to advertise AND transport effort')

{
  const provider = resolveOne({
    id: 'adv-only',
    inputModalities: ['text'],
    reasoningEfforts: ['low', 'high', 'max'],
    defaultReasoningEffort: 'max',
  })
  const model = provider.models[0]
  check('effort transport is derived from the advertised vocabulary',
    model.effort?.mode === 'field' && model.effort.field === 'reasoning_effort',
    JSON.stringify(model.effort ?? null))
  check('derived transport carries the same values',
    JSON.stringify(model.effort.values) === JSON.stringify(['low', 'high', 'max']),
    JSON.stringify(model.effort.values))
  const body = serializeRequest(
    { provider: 'p', model: 'adv-only', reasoningEffort: 'max', messages: [] },
    model,
    provider,
  )
  check('the wire carries the effort', body.reasoning_effort === 'max', JSON.stringify(body))
}

{
  const provider = resolveOne({
    id: 'transport-only',
    inputModalities: ['text'],
    effort: { mode: 'field', field: 'reasoning_effort', values: ['low', 'high'], default: 'high' },
  })
  const model = provider.models[0]
  check('advertised vocabulary is derived from the transport',
    JSON.stringify(model.reasoningEfforts) === JSON.stringify(['low', 'high']),
    JSON.stringify(model.reasoningEfforts))
  check('the default is derived too', model.defaultReasoningEffort === 'high', model.defaultReasoningEffort)
}

console.log('\nthe two halves must not disagree')
{
  let rejected
  try {
    resolveOne({
      id: 'mismatch',
      inputModalities: ['text'],
      reasoningEfforts: ['low', 'max'],
      effort: { mode: 'field', field: 'reasoning_effort', values: ['low', 'high'] },
    })
  } catch (error) {
    rejected = error
  }
  check('an offered value the transport cannot send is refused at load',
    rejected !== undefined && /cannot send/.test(rejected.message),
    rejected?.message ?? 'config accepted')
}

console.log('\nan undeclared value is refused before any I/O')
{
  const provider = resolveOne({
    id: 'strict',
    inputModalities: ['text'],
    effort: { mode: 'field', field: 'reasoning_effort', values: ['low', 'high'], default: 'high' },
  })
  const adapter = new ConfigAdapter({ get: () => provider, resolveApiKey: async () => 'k' }, 'p')
  const originalFetch = globalThis.fetch
  let reached = false
  globalThis.fetch = async () => { reached = true; throw new Error('probe-stop') }
  let failure
  try {
    for await (const _ of adapter.stream({
      provider: 'p',
      model: 'strict',
      reasoningEffort: 'max',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    })) { /* drain */ }
  } catch (error) {
    failure = error
  } finally {
    globalThis.fetch = originalFetch
  }
  check('the adapter rejects it', /does not accept reasoning effort/.test(failure?.message ?? ''),
    failure?.message ?? 'no error')
  check('no request was issued', reached === false)
}

console.log('\nGemini attaches the effort even when nothing else is configured')
{
  const provider = resolveConfig({
    providers: {
      g: {
        id: 'g',
        protocol: 'google-gemini',
        baseURL: 'http://127.0.0.1:1/v1',
        models: [{
          id: 'gm',
          inputModalities: ['text'],
          effort: {
            mode: 'field',
            field: 'thinkingConfig.thinkingBudget',
            values: ['1024'],
            default: '1024',
          },
        }],
      },
    },
  }).providers[0]
  const body = serializeRequest({ provider: 'g', model: 'gm', messages: [] }, provider.models[0], provider)
  check('generationConfig exists', body.generationConfig !== undefined, JSON.stringify(body))
  check('the thinking budget is on it',
    body.generationConfig?.thinkingConfig?.thinkingBudget === '1024',
    JSON.stringify(body.generationConfig ?? null))
}

console.log(`\n${failures === 0 ? 'ALL EFFORT CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
