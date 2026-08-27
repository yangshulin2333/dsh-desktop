/**
 * Stage a locked registry runtime and overlay the four compiled desktop patches.
 * See docs/reproducible-build.md for source recovery and fresh-output builds.
 * pnpm deploy cannot supply this harness's complete runtime dependency closure.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { createRuntimePlan } from './runtime-plan.mjs'

/** Run fixed package-manager arguments; user paths are passed only as cwd. */
function runPnpm(args, cwd, capture = false) {
  const result = spawnSync('pnpm', args, {
    cwd, windowsHide: true, shell: process.platform === 'win32',
    stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`build-runtime: pnpm ${args.join(' ')} exited with ${String(result.status ?? result.signal)}`)
  }
  return result.stdout?.trim()
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Read Git provenance without staging files or requiring a Git checkout. */
function sourceInfo(harnessRoot) {
  if (harnessRoot === null) return null
  const read = args => spawnSync('git', ['-C', harnessRoot, ...args], { encoding: 'utf8', windowsHide: true })
  const head = read(['rev-parse', 'HEAD'])
  const status = read(['status', '--porcelain'])
  return {
    commit: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length !== 0 : null,
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      harness: { type: 'string' }, output: { type: 'string' },
      'upstream-only': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })
  const plan = createRuntimePlan({
    harness: values.harness ?? process.env.DSH_HARNESS,
    output: values.output, upstreamOnly: values['upstream-only'],
  })
  const { runtimeDir } = plan
  console.log(`build-runtime: staging @deepseek-ai/dsh@${plan.version} into ${runtimeDir}`)
  mkdirSync(runtimeDir, { recursive: true })
  for (const [name, path] of Object.entries(plan.lockFiles)) cpSync(path, join(runtimeDir, name))
  const actualPnpm = runPnpm(['--version'], runtimeDir, true)
  if (`pnpm@${actualPnpm}` !== plan.packageManager) {
    throw new Error(`build-runtime: expected ${plan.packageManager}, got pnpm@${actualPnpm}`)
  }
  runPnpm(plan.installArgs, runtimeDir)

  // Node-API compatibility does not imply Electron memory-cage compatibility.
  // Native binary presence and the headless picker test cover separate risks.
  for (const relative of [
    'node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node',
    'node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll',
    'node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe',
  ]) {
    if (!existsSync(join(runtimeDir, relative))) {
      throw new Error(`build-runtime: missing native binary ${relative}`)
    }
  }
  const overlays = []
  for (const { name, from, to, entries } of plan.overlays) {
    if (!existsSync(dirname(to))) throw new Error(`build-runtime: pinned registry closure is missing ${name}`)
    // Only replace a freshly installed package's lib, never an existing runtime.
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true })
    overlays.push({ name, entries: Object.fromEntries(entries.map(entry => [entry, sha256(join(to, entry))])) })
    console.log(`  overlaid ${name}`)
  }
  const lockSha256 = sha256(plan.lockFiles['pnpm-lock.yaml'])
  if (sha256(join(runtimeDir, 'pnpm-lock.yaml')) !== lockSha256) {
    throw new Error('build-runtime: installation changed the checked-in lockfile')
  }
  writeFileSync(join(runtimeDir, 'build-info.json'), `${JSON.stringify({
    schemaVersion: 1, harnessVersion: plan.version, nodeVersion: process.version,
    packageManager: plan.packageManager, runtimeLockSha256: lockSha256,
    source: sourceInfo(plan.harnessRoot), overlays,
  }, null, 2)}\n`)
  console.log(plan.harnessRoot === null
    ? 'build-runtime: done (explicit upstream-only build; no desktop patches)'
    : 'build-runtime: done (four desktop overlays, provenance in build-info.json)')
}

main()
