/**
 * Rung ORDERING at this relay: is `max` really the top rung, or does the relay
 * treat an unknown rung as "off"/lowest? Runs each rung several times on one
 * long-reasoning task and prints per-rung reasoning volume.
 *
 * Usage: node scripts/probe-ordering.mjs [model] [repeats]
 */
const KEY = process.env.PROBE_KEY
if (!KEY) {
  console.error('set PROBE_KEY first (never paste the key into a committed file)')
  process.exit(2)
}
const BASE = 'https://api.zzzxin.xin/v1'

const QUESTION = 'A 4-digit lock (digits 0-9, repeats allowed). Clues: 682 one digit right and '
  + 'well placed; 614 one digit right but wrong place; 206 two digits right but both wrong place; '
  + '738 nothing right; 380 one digit right but wrong place. Derive the code by eliminating every '
  + 'candidate systematically and state it.'

const model = process.argv[2] ?? 'glm-5.3'
const repeats = Number(process.argv[3] ?? 4)

async function once(effort) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: QUESTION }],
          max_tokens: 4000,
          stream: true,
          ...(effort === undefined ? {} : { reasoning_effort: effort }),
        }),
      })
      if (!response.ok) return { chars: null, status: response.status }
      const raw = await response.text()
      let chars = 0
      let usage
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        let event
        try { event = JSON.parse(line.slice(6)) } catch { continue }
        if (event.usage !== undefined) usage = event.usage
        const delta = event?.choices?.[0]?.delta ?? {}
        if (typeof delta.reasoning_content === 'string') chars += delta.reasoning_content.length
      }
      return { chars, out: usage?.completion_tokens ?? null }
    } catch (error) {
      if (attempt === 3) return { chars: null, status: String(error?.code ?? error?.message ?? error) }
    }
  }
  return { chars: null, status: 'exhausted' }
}

for (const effort of [undefined, 'low', 'medium', 'high', 'max', 'xhigh']) {
  const rows = []
  for (let i = 0; i < repeats; i += 1) rows.push(await once(effort))
  const good = rows.filter(r => typeof r.chars === 'number')
  const chars = good.map(r => r.chars)
  const mean = chars.length === 0 ? '-' : Math.round(chars.reduce((a, b) => a + b, 0) / chars.length)
  const median = chars.length === 0 ? '-' : [...chars].sort((a, b) => a - b)[Math.floor(chars.length / 2)]
  console.log(`${String(effort ?? '(none)').padEnd(7)} chars=${chars.join(',')} mean=${mean} median=${median}`)
  const errs = rows.filter(r => r.chars === null)
  if (errs.length > 0) console.log(`        errors: ${errs.map(e => e.status).join(',')}`)
}
