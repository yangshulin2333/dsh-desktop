/** Exercise main.js with Electron replaced; never create a real window. */
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const pkg = require('../package.json')

async function createMockWindow({ platform = 'win32', isPackaged = true, portablePath } = {}) {
  const seen = { events: [] }
  class BrowserWindow {
    constructor(options) {
      seen.options = options
      this.webContents = { setWindowOpenHandler() {}, on() {} }
    }
    setAppDetails(details) {
      seen.details = JSON.parse(JSON.stringify(details))
      seen.events.push('details')
    }
    once() {}
    async loadURL() { seen.events.push('load') }
  }
  const electron = {
    app: {
      isPackaged,
      setAppUserModelId(id) { seen.appId = id },
      requestSingleInstanceLock() { return true },
      whenReady() { return { then() {} } },
      on() {},
    },
    BrowserWindow,
    dialog: {},
    shell: {},
  }
  const root = path.resolve(__dirname, '..')
  const execPath = 'D:\\应用 文件夹\\win-unpacked\\DSH Desktop.exe'
  const createWindow = vm.runInNewContext(`${readFileSync(path.join(root, 'main.js'), 'utf8')}\ncreateWindow`, {
    require(id) {
      if (id === 'electron') return electron
      if (['child_process', 'net', 'http'].includes(id)) return {} // startup is forbidden here
      return require(id)
    },
    __dirname: root,
    process: { platform, execPath, env: portablePath ? { PORTABLE_EXECUTABLE_FILE: portablePath } : {} },
  })
  await createWindow()
  return { ...seen, execPath }
}

test('packaged taskbar identity uses the branded exe and matching app ID before loading', async () => {
  const seen = await createMockWindow()
  assert.equal(seen.appId, pkg.build.appId)
  assert.equal(seen.options.show, false)
  assert.deepEqual(seen.details, {
    appId: pkg.build.appId,
    appIconPath: seen.execPath,
    appIconIndex: 0,
    relaunchCommand: `"${seen.execPath}"`,
    relaunchDisplayName: pkg.productName,
  })
  assert.deepEqual(seen.events, ['details', 'load'])
})

test('portable taskbar relaunch and icon refer to the permanent launcher, not its temporary exe', async () => {
  const portablePath = 'D:\\便携 程序\\DSH-Desktop-Portable-0.1.2-x64.exe'
  const seen = await createMockWindow({ portablePath })
  assert.equal(seen.details?.relaunchCommand, `"${portablePath}"`)
  assert.equal(seen.details?.appIconPath, portablePath)
  assert.equal(seen.details?.relaunchDisplayName, pkg.productName)
})

test('source development and non-Windows runs do not override packaged taskbar relaunch details', async () => {
  for (const options of [{ isPackaged: false }, { platform: 'linux' }]) {
    const seen = await createMockWindow(options)
    assert.equal(seen.details, undefined)
  }
})
