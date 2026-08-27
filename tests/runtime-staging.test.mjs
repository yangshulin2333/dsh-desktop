import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { createRuntimePlan, PATCHED_PACKAGES } from '../scripts/runtime-plan.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-staging-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const harness = join(root, 'harness')
  for (const [name, spec] of Object.entries(PATCHED_PACKAGES)) {
    const packageRoot = join(harness, spec.path)
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      name: `@deepseek-ai/${name}`, version: '0.1.1-rc.2',
    }))
    for (const entry of spec.entries) writeFileSync(join(packageRoot, 'lib', entry), '// built fixture\n')
  }
  return { root, harness, output: join(root, 'runtime') }
}

test('a patched build requires its source unless upstream-only is explicit', (t) => {
  const f = fixture(t)
  assert.throws(() => createRuntimePlan({ output: f.output }), /--harness.*--upstream-only/)
  assert.throws(() => createRuntimePlan({ ...f, upstreamOnly: true }), /cannot combine/)
  assert.equal(createRuntimePlan({ output: f.output, upstreamOnly: true }).overlays.length, 0)
})

test('runtime dependencies and package manager are pinned by checked-in inputs', (t) => {
  const plan = createRuntimePlan(fixture(t))
  assert.equal(plan.version, '0.1.1-rc.2')
  assert.equal(plan.packageManager, 'pnpm@11.0.8')
  assert.ok(plan.installArgs.includes('--frozen-lockfile'))
  assert.ok(plan.installArgs.includes('--node-linker=hoisted'))
  assert.match(readFileSync(plan.lockFiles['pnpm-lock.yaml'], 'utf8'), /specifier: 0\.1\.1-rc\.2/)
  assert.equal(plan.overlays.length, 4)
})

test('preflight refuses an occupied output and preserves its files', (t) => {
  const f = fixture(t)
  mkdirSync(f.output)
  const existing = join(f.output, 'keep.txt')
  writeFileSync(existing, 'user data')
  assert.throws(() => createRuntimePlan(f), /output.*not empty/)
  assert.equal(readFileSync(existing, 'utf8'), 'user data')
})

test('preflight rejects missing builds and mismatched package versions', (t) => {
  const f = fixture(t)
  const picker = join(f.harness, PATCHED_PACKAGES['dsh-host-directory-picker-native'].path)
  rmSync(join(picker, 'lib', 'worker.cjs'))
  assert.throws(() => createRuntimePlan(f), /worker\.cjs.*build/)
  writeFileSync(join(picker, 'lib', 'worker.cjs'), '// restored\n')
  writeFileSync(join(picker, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-host-directory-picker-native', version: '9.9.9',
  }))
  assert.throws(() => createRuntimePlan(f), /version.*0\.1\.1-rc\.2/)
})

test('preflight refuses a file or a harness parent as the output', (t) => {
  const f = fixture(t)
  writeFileSync(f.output, 'keep')
  assert.throws(() => createRuntimePlan(f), /output.*directory/)
  assert.throws(() => createRuntimePlan({ ...f, output: dirname(f.harness) }), /output.*not empty/)
})
