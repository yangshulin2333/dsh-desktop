/** Exercise the pinned builder's real resource copier without launching an app. */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, readFile, writeFile, rm, readdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { getFileMatchers, copyFiles } = require('app-builder-lib/out/fileMatcher')
const { build } = require('../package.json')

test('extraResources copies the backend and native/nested dependencies without source or dev files', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'dsh-packaging-test-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const project = path.join(fixture, 'project')
  const resources = path.join(fixture, 'resources')
  const shipped = [
    'runtime/package.json',
    'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'runtime/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs',
    'runtime/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node',
    'runtime/node_modules/node-pty/prebuilds/win32-x64/conpty.dll',
    'runtime/node_modules/node-pty/prebuilds/win32-x64/OpenConsole.exe',
    'runtime/node_modules/example/node_modules/nested/index.js',
  ]
  const excluded = [
    'do-not-ship.txt',
    'node_modules/dev-only/index.js',
    'runtime/node_modules/example/index.js.map',
    'runtime/node_modules/example/source.ts',
    'runtime/node_modules/example/README.md',
    'runtime/node_modules/example/test/example.js',
    'runtime/node_modules/example/tests/example.js',
    'runtime/node_modules/.bin/example.cmd',
  ]
  for (const file of [...shipped, ...excluded]) {
    const absolute = path.join(project, file)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, `fixture:${file}`)
  }
  const matchers = getFileMatchers(build, 'extraResources', resources, {
    macroExpander: value => value,
    customBuildOptions: build.win,
    globalOutDir: path.join(project, 'dist'),
    defaultSrc: project,
  })
  await copyFiles(matchers, undefined, false)
  for (const file of shipped) {
    assert.equal(await readFile(path.join(resources, file), 'utf8'), `fixture:${file}`)
  }
  async function listFiles(relative = '') {
    const entries = await readdir(path.join(resources, relative), { withFileTypes: true })
    const files = await Promise.all(entries.map(entry => {
      const name = path.posix.join(relative, entry.name)
      return entry.isDirectory() ? listFiles(name) : [name]
    }))
    return files.flat().sort()
  }
  assert.deepEqual(await listFiles(), shipped.sort())
})
