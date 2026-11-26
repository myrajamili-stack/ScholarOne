import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryRead } from '../src/utils/retryRead.ts'

globalThis.window = globalThis

test('transient reads retry twice with backoff and recover', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  const pending = retryRead(async () => { if (++calls < 3) throw { response: { status: 503 } }; return 'delivered' })
  await Promise.resolve(); context.mock.timers.tick(1000)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); context.mock.timers.tick(2000)
  assert.equal(await pending, 'delivered'); assert.equal(calls, 3)
})

test('authentication and validation failures do not retry', async () => {
  for (const status of [400,401,403,404]) {
    let calls=0
    await assert.rejects(retryRead(async () => { calls++; throw { response: { status } } }))
    assert.equal(calls,1)
  }
})

test('aborting pending retry prevents another request', async () => {
  const controller=new AbortController(); let calls=0
  const pending=retryRead(async () => { calls++; throw new Error('Offline') },controller.signal)
  await Promise.resolve(); controller.abort()
  await assert.rejects(pending); assert.equal(calls,1)
})

test('persistent failure stops after three attempts', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let calls=0
  const pending=retryRead(async () => { calls++; throw new Error('Offline') })
  const rejected=assert.rejects(pending,/Offline/)
  await Promise.resolve(); context.mock.timers.tick(1000)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); context.mock.timers.tick(2000)
  await rejected; assert.equal(calls,3)
})
