import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const runtime=resolve(process.env.DSH_TEST_RUNTIME || 'runtime')
const {resolveDirectoryPickerBackend}=await import(pathToFileURL(join(runtime,'node_modules/@deepseek-ai/dsh-host-directory-picker-auto/lib/index.js')))
test('Windows desktop selects browse while ordinary CLI keeps native',()=>{
 const facts={bindHost:'127.0.0.1',platform:'win32',env:{DSH_DESKTOP:'1'},linuxChooser:false}
 assert.equal(resolveDirectoryPickerBackend(facts),'browse')
 assert.equal(resolveDirectoryPickerBackend({...facts,env:{}}),'native')
})
const {default:Browse}=await import(pathToFileURL(join(runtime,'node_modules/@deepseek-ai/dsh-host-directory-picker-browse/lib/index.js')))
test('real browse lists Chinese paths and reports missing folders',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dsh-browse-'))
 mkdirSync(join(root,'中文 文件夹'))
 const picker={config:{maxEntries:1000}}
 const result=await Browse.prototype.list.call(picker,root)
 assert.ok(result.entries.some(x=>x.name==='中文 文件夹'))
 const nested=await Browse.prototype.list.call(picker,join(root,'中文 文件夹'))
 assert.equal(nested.path,join(root,'中文 文件夹'))
 await assert.rejects(Browse.prototype.list.call(picker,join(root,'missing')),e=>e.code==='directory-unreadable')
})