/** Replace only the modal COM interaction; string decoding uses real Koffi. */
const koffiPath = require.resolve('koffi', { paths: [process.env.DSH_TEST_RUNTIME] })
const koffi = require(koffiPath).default
const realDecode = koffi.decode
const pathBytes = Buffer.alloc(32768)
pathBytes.write(`${process.env.DSH_TEST_PICKED_PATH}\0`, 'utf16le')
const namePointer = koffi.address(pathBytes)
const dialog = { kind: 'dialog' }
const item = { kind: 'item' }
const outPointers = new Map()

// Mutate the shared API object: the worker imports Koffi's ESM wrapper, which
// shares this object but does not read this CommonJS wrapper's cache entry.
Object.assign(koffi, {
  load: () => ({
    func: (_convention, name) => {
      switch (name) {
        case 'CoInitializeEx': return () => 0
        case 'CoUninitialize': return () => {}
        case 'CoCreateInstance': return (_clsid, _outer, _context, _iid, out) => {
          outPointers.set(out, dialog)
          return 0
        }
        case 'CoTaskMemFree': return () => {}
        case 'GetCurrentThreadId': return () => 31337
        case 'SetThreadDpiAwarenessContext': return () => 1n
        default: throw new Error(`Unexpected native function: ${name}`)
      }
    },
  }),
  proto: declaration => declaration,
  decode: (value, typeOrOffset, typeOrLength) => {
    if (typeof typeOrOffset === 'number') {
      return { owner: value.owner, slot: typeOrOffset / koffi.sizeof('void *') }
    }
    if (typeOrOffset === 'void *') return outPointers.get(value) ?? { owner: value }
    return realDecode(value, typeOrOffset, typeOrLength)
  },
  call: (method, _proto, _self, ...args) => {
    if (method.owner === dialog) {
      switch (method.slot) {
        case 2: case 9: case 17: return 0
        case 3: return process.env.DSH_TEST_CANCEL === '1' ? (0x800704c7 | 0) : 0
        case 20: args[0][0] = item; return 0
        default: throw new Error(`Unexpected dialog slot: ${method.slot}`)
      }
    }
    if (method.owner === item) {
      if (method.slot === 2) return 0
      if (method.slot === 5) { args[1][0] = namePointer; return 0 }
    }
    throw new Error('Unexpected COM call')
  },
})

// Abort before loading the worker unless the ESM import sees the mock too.
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const esmEntry = pathToFileURL(path.join(path.dirname(koffiPath), 'index.js')).href
module.exports.ready = import(esmEntry).then(({ default: esm }) => {
  if (esm.load !== koffi.load || esm.load('kernel32.dll').func('', 'GetCurrentThreadId')() !== 31337) {
    throw new Error('Native window isolation failed; refusing to load dialog worker')
  }
})
