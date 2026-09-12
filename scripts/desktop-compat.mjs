import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
/** Patch only a freshly staged runtime. The browser interaction avoids native COM on Windows. */
export function applyDesktopCompat(runtime) {
  const target = join(runtime, 'node_modules/@deepseek-ai/dsh-host-directory-picker-auto/lib/index.js')
  const source = readFileSync(target, 'utf8')
  const marker = 'function resolveDirectoryPickerBackend(facts) {'
  const branch = '\n\tif (facts.platform === "win32" && facts.env.DSH_DESKTOP === "1") return "browse";'
  if (source.includes(branch)) return
  if (source.split(marker).length !== 2) throw new Error('Unsupported directory picker runtime: patch site changed')
  writeFileSync(target, source.replace(marker, marker + branch))
}