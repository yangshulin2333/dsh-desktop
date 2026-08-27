/** Validate staging inputs before creating an output or installing packages. */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Built packages overlaid onto the pinned registry runtime. */
export const PATCHED_PACKAGES = {
  'dsh-llm-deepseek': { path: 'packages/llm/llm-deepseek', entries: ['index.js'] },
  'dsh-client-ui-conversation': { path: 'packages/client/ui-conversation', entries: ['client.js'] },
  'dsh-client-ui-settings-models': { path: 'packages/client/ui-settings-models', entries: ['client.js'] },
  'dsh-host-directory-picker-native': {
    path: 'packages/host/directory-picker-native', entries: ['index.js', 'worker.cjs'],
  },
}

/**
 * Resolve the locked install and compiled overlays without modifying files.
 * Existing nonempty outputs are refused, including the default runtime folder.
 * @param options - harness checkout, fresh output, or explicit upstream-only mode.
 * @returns validated paths and exact package-manager arguments.
 */
export function createRuntimePlan({ harness, output, upstreamOnly = false } = {}) {
  if (harness === undefined && !upstreamOnly) {
    throw new Error('build-runtime: provide --harness for the desktop patches, or explicitly choose --upstream-only')
  }
  if (harness !== undefined && upstreamOnly) {
    throw new Error('build-runtime: cannot combine --harness with --upstream-only')
  }
  const runtimeDir = resolve(output ?? join(root, 'runtime'))
  const outputStat = lstatSync(runtimeDir, { throwIfNoEntry: false })
  if (outputStat !== undefined) {
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
      throw new Error(`build-runtime: output must be a real directory: ${runtimeDir}`)
    }
    if (readdirSync(runtimeDir).length !== 0) {
      throw new Error(`build-runtime: output is not empty: ${runtimeDir}; choose an unused --output path`)
    }
  }
  const lockFiles = Object.fromEntries(
    ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'].map(name => {
      const path = join(root, 'runtime-lock', name)
      if (!existsSync(path)) throw new Error(`build-runtime: missing checked-in input ${path}`)
      return [name, path]
    }),
  )
  const manifest = JSON.parse(readFileSync(lockFiles['package.json'], 'utf8'))
  const version = manifest.dependencies['@deepseek-ai/dsh']
  const harnessRoot = harness === undefined ? null : resolve(harness)
  const overlays = harnessRoot === null ? [] : Object.entries(PATCHED_PACKAGES).map(([name, spec]) => {
    const packageRoot = join(harnessRoot, spec.path)
    const manifestPath = join(packageRoot, 'package.json')
    if (!existsSync(manifestPath)) throw new Error(`build-runtime: missing source package ${manifestPath}`)
    const sourceManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (sourceManifest.name !== `@deepseek-ai/${name}` || sourceManifest.version !== version) {
      throw new Error(`build-runtime: ${name} name/version must match @deepseek-ai/${name}@${version}`)
    }
    const from = join(packageRoot, 'lib')
    for (const entry of spec.entries) {
      if (!existsSync(join(from, entry))) {
        throw new Error(`build-runtime: missing ${join(from, entry)}; run the harness build first`)
      }
    }
    return { name, from, to: join(runtimeDir, 'node_modules', '@deepseek-ai', name, 'lib'), entries: spec.entries }
  })
  return {
    runtimeDir, harnessRoot, version, packageManager: manifest.packageManager, lockFiles, overlays,
    installArgs: ['install', '--frozen-lockfile', '--node-linker=hoisted', '--config.confirmModulesPurge=false'],
  }
}
