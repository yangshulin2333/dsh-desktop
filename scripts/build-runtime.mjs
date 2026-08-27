/**
 * Stage the self-contained DSH runtime that ships inside the app.
 *
 * Why this shape, rather than `pnpm deploy` from a harness checkout: many
 * harness packages declare their runtime dependencies only under
 * `peerDependencies` + `devDependencies`, which resolve inside the workspace
 * but are not part of any dependency closure pnpm can deploy — a deployed tree
 * boots to `Cannot find package '@deepseek-ai/cordis-plugin-group'`. The
 * published packages on the registry carry real `dependencies`, so the
 * registry closure is the one that stands alone.
 *
 * Steps:
 *   1. install `@deepseek-ai/dsh` at the pinned version into `runtime/`
 *      (`--node-linker=hoisted`, so package directories are addressable at
 *      `node_modules/@deepseek-ai/<name>` rather than behind pnpm's hashed
 *      store layout — step 2 needs stable paths)
 *   2. overlay the built `lib/` of every locally modified package over its
 *      registry copy
 *
 * Run with `--harness <path>` (or set DSH_HARNESS) to point at the harness
 * checkout whose `lib/` output supplies step 2; omit it to stage the plain
 * registry runtime with no local patches.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Registry version the app is built against. */
const DSH_VERSION = '0.1.1-rc.2'

/**
 * Dependencies whose install scripts must run, despite pnpm 10 blocking build
 * scripts by default.
 *
 * These fetch or place native binaries the harness needs at runtime. Skipping
 * them yields a runtime that boots and chats but fails the moment a feature
 * reaches for one — the native folder picker dies with "win32 folder dialog
 * worker exited before reporting a result" when koffi has no binary.
 *
 * Both are Node-API addons, so one binary works under plain Node and under
 * Electron's Node alike; there is no per-ABI rebuild step here.
 */
const BUILT_DEPENDENCIES = {
  // FFI into user32/comdlg32 for the native "choose a folder" dialog.
  koffi: true,
  // ConPTY on Windows; its postinstall places conpty.dll and OpenConsole.exe.
  'node-pty': true,
  // Places the spawn helper the harness shells out through.
  '@deepseek-ai/dsh-subprocess-local': true,
  // Denied on purpose: these are optional provider SDKs the DeepSeek route
  // never calls, and their hooks only fetch extra artifacts. Listed rather
  // than omitted because pnpm treats an undeclared build script as an error.
  '@google/genai': false,
  protobufjs: false,
}

/**
 * Locally modified harness packages, as `<npm package name>` →
 * `<path inside the harness checkout>`. Each contributes its built `lib/`
 * over the registry copy of the same version.
 */
const PATCHED_PACKAGES = {
  'dsh-llm-deepseek': 'packages/llm/llm-deepseek',
  'dsh-client-ui-conversation': 'packages/client/ui-conversation',
  'dsh-client-ui-settings-models': 'packages/client/ui-settings-models',
}

/**
 * Run a command, inheriting stdio, and fail loud on a non-zero exit.
 * @param command - executable to run.
 * @param args - arguments.
 * @param cwd - working directory.
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`build-runtime: ${command} ${args.join(' ')} exited with ${String(result.status ?? result.signal)}`)
  }
}

function main() {
  const { values } = parseArgs({
    options: { harness: { type: 'string' } },
    allowPositionals: false,
  })
  const harness = values.harness ?? process.env.DSH_HARNESS
  const runtimeDir = join(root, 'runtime')

  console.log(`build-runtime: staging @deepseek-ai/dsh@${DSH_VERSION} into ${runtimeDir}`)
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(
    join(runtimeDir, 'package.json'),
    `${JSON.stringify({
      name: 'dsh-desktop-runtime',
      private: true,
      version: '0.0.0',
      dependencies: { '@deepseek-ai/dsh': DSH_VERSION },
    }, null, 2)}\n`,
  )
  // pnpm 10+ refuses to run any dependency's install script unless the package
  // is named here, and reads the decision from pnpm-workspace.yaml rather than
  // package.json. Every package with a hook must appear — an undeclared one is
  // a hard install error — so the denials are as explicit as the approvals.
  writeFileSync(
    join(runtimeDir, 'pnpm-workspace.yaml'),
    `allowBuilds:\n${Object.entries(BUILT_DEPENDENCIES)
      .map(([name, allowed]) => `  '${name}': ${String(allowed)}\n`)
      .join('')}`,
  )

  run('pnpm', [
    'install',
    '--node-linker=hoisted',
    '--config.confirmModulesPurge=false',
  ], runtimeDir)

  // koffi ships its addon as a platform-specific optional dependency, not in
  // its own `build/`. Without it the native folder picker dies at runtime with
  // "win32 folder dialog worker exited before reporting a result", so fail the
  // build here instead.
  const koffiBinary = join(
    runtimeDir, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node',
  )
  if (!existsSync(koffiBinary)) {
    throw new Error(`build-runtime: koffi's native addon is missing (expected ${koffiBinary})`)
  }

  if (harness === undefined) {
    console.log('build-runtime: no --harness given; staged the plain registry runtime')
    return
  }

  const harnessRoot = resolve(harness)
  console.log(`build-runtime: overlaying local builds from ${harnessRoot}`)
  for (const [name, relative] of Object.entries(PATCHED_PACKAGES)) {
    const from = join(harnessRoot, relative, 'lib')
    const to = join(runtimeDir, 'node_modules', '@deepseek-ai', name, 'lib')
    if (!existsSync(from)) {
      throw new Error(`build-runtime: ${name} has no built lib at ${from} — run the harness build first`)
    }
    if (!existsSync(dirname(to))) {
      throw new Error(`build-runtime: the registry closure has no ${name}; the pinned version may have moved it`)
    }
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true })
    console.log(`  overlaid ${name}`)
  }
  console.log('build-runtime: done')
}

main()
