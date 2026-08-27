/** Inspect a built artifact without starting Electron or touching the taskbar. */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const { NtExecutable, NtExecutableResource, Resource } = require('resedit')
const { getRawHeader } = require('@electron/asar')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')
const executablePath = process.env.DSH_TEST_EXECUTABLE ??
  path.join(root, 'dist', pkg.version, 'win-unpacked', 'DSH Desktop.exe')
const executable = NtExecutable.from(readFileSync(executablePath))
const { entries } = NtExecutableResource.from(executable)

test('packaged EXE identifies itself as DSH Desktop, not Electron', () => {
  const versions = Resource.VersionInfo.fromEntries(entries)
  assert.ok(versions.length > 0)
  for (const version of versions) {
    for (const language of version.getAllLanguagesForStringValues()) {
      const values = version.getStringValues(language)
      assert.equal(values.FileDescription, pkg.productName)
      assert.equal(values.ProductName, pkg.productName)
      assert.equal(values.InternalName, 'DSH Desktop')
      assert.equal(values.OriginalFilename, 'DSH Desktop.exe')
      assert.equal(values.FileVersion, `${pkg.version}.0`)
      assert.equal(values.ProductVersion, `${pkg.version}.0`)
    }
  }
})

test('every embedded icon frame matches build/icon.ico byte for byte', () => {
  // Read the ICO directory directly: the expected bytes do not pass through
  // the resource writer, so an incorrect conversion cannot pass unnoticed.
  const ico = readFileSync(path.join(root, 'build/icon.ico'))
  const expected = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const offset = 6 + 16 * index
    const size = ico.readUInt32LE(offset + 8)
    const start = ico.readUInt32LE(offset + 12)
    return { width: ico[offset], height: ico[offset + 1], data: ico.subarray(start, start + size) }
  })
  const groups = Resource.IconGroupEntry.fromEntries(entries)
  assert.ok(groups.length > 0)
  for (const group of groups) {
    assert.equal(group.icons.length, expected.length)
    group.icons.forEach((icon, index) => {
      assert.equal(icon.width, expected[index].width)
      assert.equal(icon.height, expected[index].height)
      const entry = entries.find(e => e.type === 3 && e.id === icon.iconID && e.lang === group.lang)
      assert.ok(entry, `missing icon ${icon.iconID}`)
      assert.deepEqual(Buffer.from(entry.bin), expected[index].data)
    })
  }
})

test('EXE ASAR integrity still matches the bundled application', () => {
  const integrity = entries.find(e => e.type === 'INTEGRITY' && e.id === 'ELECTRONASAR')
  assert.ok(integrity, 'missing Electron ASAR integrity resource')
  const records = JSON.parse(Buffer.from(integrity.bin).toString('utf8'))
  const record = records.find(item => item.file === 'resources\\app.asar')
  assert.ok(record, 'missing app.asar integrity record')
  assert.equal(record.alg, 'SHA256')
  const { headerString } = getRawHeader(path.join(path.dirname(executablePath), 'resources', 'app.asar'))
  assert.equal(record.value, createHash('sha256').update(headerString).digest('hex'))
})
