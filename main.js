/**
 * DSH Desktop — a native window around a DeepSeek Harness instance the app
 * runs itself.
 *
 * The harness is a Node program, and Electron already ships a Node runtime, so
 * the backend is spawned as `process.execPath` with `ELECTRON_RUN_AS_NODE=1`:
 * the packaged app needs no Node, pnpm, or toolchain on the target machine.
 * The staged runtime under `resources/runtime` includes native Node-API
 * addons. Their ABI is stable, but their memory APIs must also support Electron.
 *
 * Port selection asks the OS for a free one rather than pinning 3080, so the
 * app never collides with a harness the user is already running from a
 * terminal, or with a second window of itself.
 */

const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('child_process')
const { createServer } = require('net')
const http = require('http')
const path = require('path')
const fs = require('fs')

/** Milliseconds to wait for the harness to answer before giving up. */
const STARTUP_TIMEOUT_MS = 120_000

/** Resolved once at startup; every window and the shutdown path read it. */
let serverUrl = null
let harness = null
let harnessExitInfo = null
let mainWindow = null
/** Set once the app is quitting, so an expected child exit is not reported as a crash. */
let quitting = false

/**
 * Locate the staged runtime: `resources/runtime` in a packaged app, or the
 * repo-local `runtime/` directory during development.
 * @returns absolute path to the runtime root.
 */
function runtimeRoot() {
  const packaged = path.join(process.resourcesPath ?? '', 'runtime')
  if (app.isPackaged) return packaged
  return path.join(__dirname, 'runtime')
}

/** Absolute path to the harness CLI entry inside the staged runtime. */
function harnessEntry() {
  return path.join(runtimeRoot(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

/**
 * The harness home this app owns, under the platform's app-data directory.
 *
 * Deliberately NOT the default `~/.dsh` a terminal `dsh` install uses. A
 * profile there records the plugin bundles that install has, and the harness
 * fails its whole plugin tree when one cannot be resolved — so sharing a home
 * with a CLI install makes this app refuse to start as soon as the user adds a
 * plugin it does not bundle. Its own home also means uninstalling the app
 * leaves a terminal install untouched, and vice versa.
 * @returns absolute path to this app's DSH_HOME.
 */
function harnessHome() {
  return path.join(app.getPath('userData'), 'dsh-home')
}

/**
 * Ask the OS for a free loopback port.
 * @returns a port number nothing is listening on at the moment of the call.
 */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen({ host: '127.0.0.1', port: 0 }, () => {
      const { port } = probe.address()
      probe.close(() => { resolvePort(port) })
    })
  })
}

/**
 * Whether the harness answers an HTTP request at `url`.
 * @param url - origin to probe.
 * @returns true once the server responds at all.
 */
function answers(url) {
  return new Promise((resolveAnswer) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolveAnswer(true)
    })
    req.on('error', () => { resolveAnswer(false) })
    req.setTimeout(1_500, () => {
      req.destroy()
      resolveAnswer(false)
    })
  })
}

/**
 * Poll until the harness answers, the child dies, or the timeout elapses.
 * @param url - origin to probe.
 */
async function waitForHarness(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  for (;;) {
    if (harnessExitInfo !== null) {
      throw new Error(`the harness exited during startup (code ${String(harnessExitInfo.code)})\n\n${harnessExitInfo.tail}`)
    }
    if (await answers(url)) return
    if (Date.now() > deadline) throw new Error(`the harness did not answer within ${String(STARTUP_TIMEOUT_MS / 1000)}s`)
    await new Promise((r) => { setTimeout(r, 400) })
  }
}

/**
 * Spawn the harness web server on `port`, using Electron's own Node runtime.
 * @param port - loopback port to serve on.
 */
function startHarness(port) {
  const entry = harnessEntry()
  if (!fs.existsSync(entry)) {
    throw new Error(`the bundled harness runtime is missing (expected ${entry})`)
  }
  harness = spawn(
    process.execPath,
    [
      // The CLI always mounts cordis-plugin-hmr after boot, because that is
      // what live-watches the user's `cordis.patch.yml` — it is a shipped
      // feature, not a dev-only one, so no profile patch can disable it. The
      // plugin refuses to construct without exposed loader internals.
      '--expose-internals',
      entry, 'web', '--no-open', '--port', String(port), '--host', '127.0.0.1',
    ],
    {
      cwd: runtimeRoot(),
      windowsHide: true,
      env: {
        ...process.env,
        // Run the Electron binary as a plain Node process.
        ELECTRON_RUN_AS_NODE: '1',
        // Electron sets these for its own renderer plumbing; a Node child must
        // not inherit them or the harness misreads its own argv.
        ELECTRON_NO_ATTACH_CONSOLE: '1',
        DSH_HOME: harnessHome(),
      },
    },
  )

  // Keep a bounded tail so a startup failure can be shown to the user instead
  // of vanishing into a detached process.
  const tail = []
  const remember = (chunk) => {
    tail.push(chunk.toString())
    if (tail.length > 40) tail.shift()
  }
  harness.stdout.on('data', remember)
  harness.stderr.on('data', remember)
  harness.on('exit', (code) => {
    harnessExitInfo = { code, tail: tail.join('') }
    harness = null
    if (!quitting) {
      dialog.showErrorBox(
        'DSH Desktop',
        `The harness stopped unexpectedly (code ${String(code)}).\n\n${tail.join('')}`,
      )
      app.quit()
    }
  })
}

/** Create the single application window over the running harness. */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'DSH Desktop',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#0b0d10',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Anything outside the local harness opens in the user's real browser: the
  // window is the harness UI, not a general-purpose browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (serverUrl === null || !url.startsWith(serverUrl)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (serverUrl !== null && !url.startsWith(serverUrl)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  await mainWindow.loadURL(serverUrl)
}

/** Stop the harness child, if one is still running. */
function stopHarness() {
  quitting = true
  if (harness !== null) {
    harness.kill()
    harness = null
  }
}

// Windows taskbar grouping and the correct icon for an unpinned window.
if (process.platform === 'win32') app.setAppUserModelId('com.dsh.desktop')

// One window is the whole app: a second launch focuses the first instead of
// starting a second harness against the same DSH_HOME.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    try {
      const port = await freePort()
      serverUrl = `http://127.0.0.1:${String(port)}`
      startHarness(port)
      await waitForHarness(serverUrl)
      await createWindow()
    } catch (error) {
      dialog.showErrorBox(
        'DSH Desktop',
        `Could not start the harness.\n\n${error instanceof Error ? error.message : String(error)}`,
      )
      stopHarness()
      app.quit()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverUrl !== null) void createWindow()
    })
  })

  app.on('window-all-closed', () => {
    stopHarness()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', stopHarness)
}
