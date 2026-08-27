const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { NtExecutable, NtExecutableResource, Resource } = require('resedit')
const brandWindows = require('../scripts/brand-windows.cjs')
const pkg = require('../package.json')

const hash = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex')
const unchangedResources = entries => entries.filter(entry => ![3, 14, 16].includes(entry.type))
  .map(entry => [entry.type, entry.id, entry.lang, entry.codepage, hash(entry.bin)])
  .sort((left, right) => JSON.stringify(left.slice(0, 3)).localeCompare(JSON.stringify(right.slice(0, 3))))
const codeSections = executable => executable.getAllSections().filter(section => section.info.name !== '.rsrc')
  .map(section => [section.info.name, hash(section.data ?? new ArrayBuffer(0))])

test('afterPack edits only main EXE branding and preserves code, manifest, integrity and helper binaries', async t => {
  const appOutDir = await mkdtemp(path.join(tmpdir(), 'dsh-branding-test-'))
  t.after(() => rm(appOutDir, { recursive: true, force: true }))
  const executablePath = path.join(appOutDir, 'DSH Desktop.exe')
  const original = NtExecutable.from(await readFile(require('electron')))
  const originalResources = NtExecutableResource.from(original)
  originalResources.entries.push({
    type: 'INTEGRITY', id: 'ELECTRONASAR', lang: 1033, codepage: 1200,
    bin: Buffer.from('[{"file":"resources\\\\app.asar","alg":"SHA256","value":"test-marker"}]'),
  })
  originalResources.outputResource(original)
  await writeFile(executablePath, Buffer.from(original.generate()))
  const helperPath = path.join(appOutDir, 'OpenConsole.exe')
  await writeFile(helperPath, 'untouched third-party binary')

  await brandWindows({
    electronPlatformName: 'win32', appOutDir,
    packager: {
      projectDir: path.resolve(__dirname, '..'),
      appInfo: {
        productFilename: 'DSH Desktop', productName: pkg.productName,
        buildVersion: pkg.version, version: pkg.version, copyright: pkg.build.copyright,
      },
    },
  })

  const updated = NtExecutable.from(await readFile(executablePath))
  const { entries } = NtExecutableResource.from(updated)
  assert.deepEqual(codeSections(updated), codeSections(original))
  assert.deepEqual(unchangedResources(entries), unchangedResources(originalResources.entries))
  assert.equal(await readFile(helperPath, 'utf8'), 'untouched third-party binary')
  const version = Resource.VersionInfo.fromEntries(entries)[0]
  const values = version.getStringValues({ lang: 1033, codepage: 1200 })
  assert.equal(values.FileDescription, pkg.productName)
  assert.equal(values.ProductName, pkg.productName)
  assert.equal(values.ProductVersion, `${pkg.version}.0`)
  assert.equal(Resource.IconGroupEntry.fromEntries(entries)[0].icons.length, 7)
})

test('afterPack does nothing for non-Windows packages', async () => {
  await brandWindows({ electronPlatformName: 'linux' })
})
