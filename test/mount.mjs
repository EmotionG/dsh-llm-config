/**
 * Mount the plugin on a REAL cordis app, exactly as the profile loader does,
 * and query the resulting LLM service. This exercises `inject`, registration
 * timing, and the settings section together — the combination that decides
 * whether DSH's model picker can see a configured model.
 */
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import * as plugin from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

/** The section a user has already saved. */
const SAVED = {
  providers: {
    zzzxin1: {
      id: 'zzzxin1', enabled: true, protocol: 'openai-chat',
      baseURL: 'https://zzzxin.xin/v1',
      models: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputModalities: ['text'] },
        { id: 'kimi-k3', name: 'Kimi K3', inputModalities: ['text'] },
      ],
    },
  },
}

console.log('the plugin surfaces the services it needs')
check('exports apply()', typeof plugin.apply === 'function')
check('exports inject', Array.isArray(plugin.inject), JSON.stringify(plugin.inject))
check('declares llm as required', plugin.inject.includes('llm'))

console.log('\nmounting on a real cordis app')
const app = new Context()
// LlmRuntime registers itself on the app it is constructed with.
const llm = new LlmRuntime(app)

let mounted = false
try {
  const fiber = app.plugin(plugin, SAVED)
  await fiber
  mounted = true
  check('the plugin mounted without throwing', true)
} catch (error) {
  check('the plugin mounted without throwing', false, error.message)
}

if (mounted) {
  const providers = llm.listProviders()
  check('the configured route reached the LLM registry',
    providers.some(p => p.id === 'zzzxin1'), JSON.stringify(providers.map(p => p.id)))

  try {
    const models = await llm.listModels('zzzxin1')
    check('its models are visible to a picker', models.length === 2, String(models.length))
    check('deepseek-v4-pro is visible', models.some(m => m.id === 'deepseek-v4-pro'),
      JSON.stringify(models.map(m => m.id)))
  } catch (error) {
    check('its models are visible to a picker', false, error.message)
  }
}

console.log(`\n${failures === 0 ? 'ALL MOUNT CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
