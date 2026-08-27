# Handover

Everything an agent picking this up needs: what exists, what works, what is
still open, and the traps that cost the most time the first time round.

Written 2026-08-27.

Updated by Codex on 2026-08-27: the user has confirmed workspace selection,
reselection and dialog cancellation in 0.1.1. The picker bug is accepted as
fixed for the unpacked app; installer and portable entrypoints remain
unverified. See [validation record](docs/validation-0.1.1.md).
Harness sources are committed locally and a clean-checkout build has passed;
see [source recovery and build verification](docs/reproducible-build.md).
Do not automate the user's desktop; they will perform the actual clicks.

---

## 1. What this project is

`dsh-desktop` packages [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`) as a self-contained Windows desktop app, plus two small features patched
into the harness UI.

Two directories are involved, and **only the first is this repository**:

| Path | What it is | In git? |
| --- | --- | --- |
| `D:\AI\dsh-desktop` | this repo — Electron shell, build scripts, docs | yes |
| `D:\AI\DeepSeek` | harness source, local branch `desktop/0.1.1` | yes, two local commits; not pushed — see §5 |

The desktop build installs the **npm registry** dependency graph frozen in
`runtime-lock/`, then overlays the built `lib/` of four patched packages from
the checkout passed to `--harness`. The source can be recovered without the
original `D:\AI\DeepSeek` directory using the patch in this repository.

---

## 2. Current state

### Working and verified

- **0.1.1 workspace picker user acceptance passed:** selection, workspace
  reselection and cancellation were confirmed by the user. Their screenshot
  shows the `DSH` workspace in the sidebar and composer.
  Both the app and backend processes were confirmed under
  `dist/0.1.1/win-unpacked/`, with package version 0.1.1. This closes the
  reported picker bug, not full release acceptance.
- **Both features**, tested live in the browser UI and through the packaged app:
  - session spend in CNY on the composer stats row (`约 ¥0.02`)
  - DeepSeek account balance in Settings → Models (`账户余额： CNY 14.67`,
    cross-checked against a direct call to `https://api.deepseek.com/user/balance`)
- **The packaged app boots**: window opens, harness serves, `/deepseek/balance`
  returns 200 from inside `dist/win-unpacked`.
- **Artifacts build**: `DSH-Desktop-Setup-0.1.0-x64.exe` and
  `DSH-Desktop-Portable-0.1.0-x64.exe`, ~129 MB each.

### Open / unverified

1. **Picker fix accepted; distribution entrypoints still unverified.** The
   workspace picker (`选择工作区`) previously failed with
   `directory picker failed: win32 folder dialog worker exited before reporting a result`.

   Status: **0.1.0 failure reproduced; 0.1.1 headless regression and user
   checks for selection, workspace reselection and cancellation passed.**

   The real worker exited with code 134 in `readUtf16` at `koffi.view`.
   Electron rejects external ArrayBuffers. The fix copies UTF-16 characters
   with `koffi.decode(address, 'char16', -1)` and keeps IPC open until the
   final result flushes. Exit diagnostics include the code and signal.

   The earlier conpty diagnosis did not establish the cause of this error.
   Missing native binaries are a separate packaging problem. A `showing`
   message or a visible dialog alone is not a passed selection test.

   **Release follow-up:** the accepted run used the unpacked executable;
   installer and portable entrypoints have not been user-verified. Do not
   reopen or click windows for them. Cancellation means dismissing the
   system folder dialog without adding a workspace, not clearing the
   currently selected workspace.

2. **The packaged `DSH Desktop.exe` carries Electron's default icon.** Installer,
   Start Menu and desktop shortcut icons are correct; only the executable's own
   embedded icon is not, because `signAndEditExecutable: false` also skips
   `rcedit`. See §4 for why that flag is set and how to remove it.

3. **Builds are unsigned.** SmartScreen will warn on first run. Removing that
   needs a real code-signing certificate.

4. **No remote backup yet:** desktop `master` starts at `5eb00e8` and has no
   remote. Harness changes are committed locally as `bdefe56f45` and
   `4952bebc28`, with recovery source pins in [patches/](patches/README.md).
   No fork has been created and nothing has been pushed.

5. **Dependency audit needs follow-up:** the existing electron-builder 25.1.8
   toolchain reports 12 npm audit findings (11 high, 1 critical). The staged
   runtime's production audit reports none in this run. This does not certify
   the client as secure; assess and upgrade the build toolchain separately.

---

## 3. How to build

```bash
cd D:\AI\dsh-desktop
npm ci

# stage the harness runtime (needs D:\AI\DeepSeek already built)
node scripts/build-runtime.mjs --harness D:/AI/DeepSeek

npx electron-builder --win        # -> dist/
npm start                         # or run from source
```

For the isolated 0.1.1 candidate, run `npm run test:picker` before
`npx electron-builder --win --config.directories.output=dist/0.1.1`.
Do not overwrite the accepted candidate. The staging script requires an absent
or empty output; choose a fresh checkout or `--output` path for rebuilds.
See the [PowerShell build guide](docs/reproducible-build.md) for the complete
locked-dependency recovery and verification procedure.

If you changed anything in `D:\AI\DeepSeek`, rebuild it **first**:

```bash
cd D:\AI\DeepSeek
NODE_OPTIONS=--max-old-space-size=12288 pnpm run build
```

The large heap is not optional — the default heap OOMs on this repo.

### Why the runtime is staged from the registry

`pnpm deploy` from the harness checkout does not produce a runnable tree. Many
harness packages declare runtime dependencies only under `peerDependencies` +
`devDependencies`; those resolve inside the workspace but are not part of any
deployable closure, so a deployed tree boots to
`Cannot find package '@deepseek-ai/cordis-plugin-group'`. This is true with both
`--prod` and `--prod=false`. The published packages carry real `dependencies`,
which is why `scripts/build-runtime.mjs` installs `@deepseek-ai/dsh` from npm
with `--frozen-lockfile` and then overlays the four patched packages.

`--node-linker=hoisted` matters: it puts packages at
`node_modules/@deepseek-ai/<name>` instead of pnpm's hashed store layout, which
is what makes the overlay addressable.

---

## 4. Traps (each of these cost real time)

**Use pnpm, never npm, for the runtime staging.** npm spent >2 minutes without
even creating `node_modules` for this 500-package tree; pnpm with the local
store does it in 7–12 s. The registry itself is fast (~2 MB/s measured) — npm's
metadata resolution is the bottleneck. A China mirror is *not* the answer; the
one tried returned errors for these paths.

**Electron 42+ is required.** The harness needs Node `^22.19.0 || >=24`.
Electron 33 bundles Node 20 and dies on
`node:zlib does not provide an export named 'createZstdDecompress'`.

**The app must own its `DSH_HOME`.** It uses
`%APPDATA%\DSH Desktop\dsh-home`, deliberately not the `~/.dsh` a terminal
install uses. Sharing one home means a plugin installed on either side breaks
the other's startup — the harness fails its *whole* plugin tree when one entry
cannot be resolved. This was hit for real: a `@liustack/modlens` in the CLI
profile made the app refuse to boot.

**The backend must be spawned with `--expose-internals`.** The CLI *always*
mounts `cordis-plugin-hmr` after boot — that is what live-watches the user's
`cordis.patch.yml`, a shipped feature, not a dev-only one — and the plugin
refuses to construct without exposed loader internals. No profile patch can
disable it; `dsh-web-app` already sets `disabled: true` and it is re-created
anyway.

**Install scripts must be allow-listed.** pnpm 10+ blocks dependency build
scripts, and this pnpm (11.0.8) reads the decision from `allowBuilds` in
`pnpm-workspace.yaml` — *not* `onlyBuiltDependencies`, and not from
`package.json`. Every package that has a hook must be listed explicitly, allowed
or denied; an undeclared one is a hard install error. `scripts/build-runtime.mjs`
copies `runtime-lock/pnpm-workspace.yaml`. Skipping the hooks yields a runtime that boots and chats but
breaks the moment a feature reaches for a native binary.

**koffi's addon is not in `koffi/build`.** It ships as the optional dependency
`@koromix/koffi-win32-x64`, at
`node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node`. The build script
asserts on that exact path.

**`win.signAndEditExecutable` is `false` on purpose.** electron-builder signs
every `.exe` inside the package — `shouldSignFile` hard-codes `.exe` with no
exclusion option — and the staged runtime carries `node-pty`'s `OpenConsole.exe`
and ripgrep's `rg.exe`. Reaching for signtool downloads the `winCodeSign`
bundle, whose archive contains macOS symlinks a normal Windows account cannot
extract:

```
ERROR: Cannot create symbolic link : ...winCodeSign\<id>\darwin\10.12\lib\libcrypto.dylib
```

So the build dies inside a signing step that would itself conclude
`no signing info identified, signing is skipped`. Things that do **not** work:
pre-extracting the cache without symlinks (app-builder uses a fresh random
directory each run), serving a repacked archive via
`ELECTRON_BUILDER_BINARIES_MIRROR` (sha512 is verified),
`CSC_IDENTITY_AUTO_DISCOVERY=false`, a no-op `sign` hook, or `SIGNTOOL_PATH`.
Enabling **Windows Developer Mode** grants the symlink privilege and lets the
flag be dropped, restoring the exe icon.

**`pnpm deploy` with a Windows absolute path mirrors empty directories into the
source tree.** It created `D:\AI\DeepSeek\vendor\DeepSeek-Desktop\`. A stray
directory under a workspace glob with no `package.json` makes tsdown resolve the
*root* package name and fail with a completely misleading
`[@deepseek-ai/dsh-root] Cannot find entry: ["lib/types/{index,invariant,startup}.js"]`.
This looked like a code error and was not. If that error appears, run:

```bash
cd D:\AI\DeepSeek
for d in packages/*/*/ vendor/*/; do [ -f "$d/package.json" ] || echo "STRAY: $d"; done
```

---

## 5. Harness source pins and recovery

`D:\AI\DeepSeek` has two commits on local branch `desktop/0.1.1` and a clean
worktree. The feature commit is `bdefe56f45`; the picker fix is `4952bebc28`.
There is no published fork. The two features and picker repair are also preserved in
[patches/deepseek-harness.patch](patches/deepseek-harness.patch), against base
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Application against that base
produces the exact committed source tree, checked using a separate Git index.
A clean local clone has passed frozen dependency installation and the complete
harness build. Full ids and hashes are in [harness-source.json](patches/harness-source.json).

Original feature files (all under `D:\AI\DeepSeek`; the snapshot also includes
the picker source, tests and repair documentation):

```
 M packages/client/ui-conversation/src/client/apply.ts
 M packages/client/ui-conversation/src/client/chat/StatsLine.tsx
 M packages/client/ui-conversation/src/client/locales.ts
 M packages/client/ui-settings-models/src/client/ModelsSection.module.css
 M packages/client/ui-settings-models/src/client/ProviderEditor.tsx
 M packages/client/ui-settings-models/src/client/locales.ts
 M packages/llm/llm-deepseek/src/index.ts
?? packages/client/ui-conversation/src/client/chat/pricing.ts
?? packages/llm/llm-deepseek/src/balance-route.ts
```

`docs/patches.md` explains what each does and why. Two design notes worth
keeping:

- The balance is a **plain HTTP route** (`GET /deepseek/balance`) on
  `ctx.webServer`, not a Typert `@Remote` service. The Typert route was tried
  and abandoned: adding a TypeScript project reference to the protocol package
  triggered TypeScript's project-reference source redirect, pulling the
  referenced package's sources into the adapter's own compilation, emitting
  `.js`/`.d.ts` next to sources and breaking the build. The HTTP route needs no
  codegen, no zod in the browser bundle, and no new build edges — the diff to
  `llm-deepseek` is one new file plus 14 lines.
- It registers through a scoped `ctx.inject(['webServer'], …)`. A direct
  `ctx.get('webServer')` at plugin-apply time always misses, because the web
  server activates after the LLM adapters. The same ordering trap applies to
  `ctx.modelDirectories` in `StatsLine`.

**External backup remains:** choose the GitHub owner and visibility before
creating a harness fork and desktop repository, then push the local commits.
Do not push the desktop branch to the official upstream remote. Local source
recovery and dependency locking work without a published fork, but are not an
off-machine backup. See [build verification](docs/reproducible-build.md).

---

## 6. Suggested backlog

1. Choose remote ownership/visibility and push the local commits (§5).
   Source commits and clean harness build verification are complete locally.
2. Verify installer and portable entrypoints before a full release (§2.1).
3. Decide on Developer Mode vs. the missing exe icon (§4).
4. Consider a CI workflow. Note it would need the harness fork, a large-heap
   build, and either Developer Mode on the runner or the current flag.
5. Version pinning: `runtime-lock/package.json` pins `0.1.1-rc.2`, with the
   transitive graph in `runtime-lock/pnpm-lock.yaml`. The harness is a fast-moving developer preview that states it
   will make breaking changes; the overlay assumes the registry copy has the
   same package layout as the local build. A version bump needs both a harness
   rebase and a re-test of the overlay.
