/** Headless artifact regression: real worker, Electron, Koffi decoding and IPC. */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { test } = require('node:test')

const root = path.resolve(__dirname, '..')
const runtime = path.resolve(process.env.DSH_TEST_RUNTIME ?? path.join(root, 'runtime'))
const executable = process.env.DSH_TEST_EXECUTABLE ?? path.join(root, 'node_modules/electron/dist/electron.exe')
const worker = path.join(runtime, 'node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs')
const fixture = path.join(__dirname, 'fixtures/picker-native.cjs')

function runWorker(pickedPath) {
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
    const bootstrap = 'const f=require(process.env.DSH_TEST_FIXTURE); f.ready.then(()=>require(process.env.DSH_TEST_WORKER)).catch(e=>{console.error(e);process.exitCode=1})'
    const child = spawn(executable, ['-e', bootstrap], {
      cwd: runtime,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DIALOG_TITLE: 'Headless picker regression',
        DSH_TEST_RUNTIME: runtime,
        DSH_TEST_FIXTURE: fixture,
        DSH_TEST_WORKER: worker,
        DSH_TEST_PICKED_PATH: pickedPath ?? '',
        DSH_TEST_CANCEL: pickedPath === null ? '1' : '0',
      },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    const messages = []
    let stderr = ''
    const timeout = setTimeout(() => { child.kill() }, 15000)
    child.on('message', message => messages.push(message))
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000) })
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      resolve({ code, signal, messages, stderr })
    })
  })
}

for (const pickedPath of ['D:\\AI\\dsh-desktop', 'D:\\测试 中文\\Ā目录😀', null]) {
  test(`worker returns ${pickedPath ?? 'cancellation'} without a native window`, async () => {
    const result = await runWorker(pickedPath)
    assert.equal(result.code, 0, `worker crashed (${result.signal}): ${result.stderr}`)
    assert.deepEqual(result.messages, [
      { kind: 'showing', threadId: 31337 },
      { kind: 'done', path: pickedPath },
    ])
  })
}
