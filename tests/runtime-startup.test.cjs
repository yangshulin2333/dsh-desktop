/** Boot the real packaged backend with an empty, keyless home and no UI. */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { mkdtempSync, rmSync } = require('node:fs')
const { createServer } = require('node:net')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { test } = require('node:test')

test('the real Electron Node backend serves the web app without credentials or a window', { timeout: 45000 }, async (t) => {
  const root = path.resolve(__dirname, '..')
  const runtime = path.resolve(process.env.DSH_TEST_RUNTIME ?? path.join(root, 'runtime'))
  const executable = process.env.DSH_TEST_EXECUTABLE ?? path.join(root, 'node_modules/electron/dist/electron.exe')
  const isolatedHome = mkdtempSync(path.join(tmpdir(), 'dsh-startup-test-'))
  const portServer = createServer()
  portServer.listen(0, '127.0.0.1')
  await once(portServer, 'listening')
  const { port } = portServer.address()
  await new Promise((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()))
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^DSH_|^DEEPSEEK_/i.test(key)))
  const child = spawn(executable, [
    '--expose-internals', path.join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
    'web', '--no-open', '--port', String(port), '--host', '127.0.0.1',
  ], {
    cwd: isolatedHome,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: isolatedHome },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let spawnError
  let closed = false
  const completion = new Promise(resolve => child.once('close', (code, signal) => {
    closed = true
    resolve({ code, signal })
  }))
  child.on('error', error => { spawnError = error })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { output = (output + chunk).slice(-8000) })
  }
  t.after(async () => {
    if (!closed) child.kill()
    const result = await Promise.race([completion, delay(5000, null, { ref: false })])
    if (result === null) throw new Error(`Owned test backend did not stop (pid ${child.pid})`)
    rmSync(isolatedHome, { recursive: true, force: true })
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (closed) throw new Error(`Backend exited before readiness: ${output}`)
    let response
    try {
      response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
    } catch {
      // Connection refusal is expected until the newly spawned server listens.
      await delay(200)
      continue
    }
    assert.equal(response.status, 200, output)
    assert.match(response.headers.get('content-type'), /text\/html/)
    assert.match(await response.text(), /<html|<!doctype html/i)
    return
  }
  assert.fail(`Backend did not become ready: ${output}`)
})
