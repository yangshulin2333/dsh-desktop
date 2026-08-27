# DSH Desktop

A desktop client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), packaged as a
self-contained Windows app: no Node.js, no pnpm, no terminal.

> **Unofficial.** This is a community project. It is not built, endorsed, or
> supported by DeepSeek. The DeepSeek Harness name and logo belong to DeepSeek;
> this app ships its own icon and does not use DeepSeek brand assets.

## What it adds

Beyond wrapping the harness in a window, this build carries two small patches
to the harness UI:

| Feature | Where |
| --- | --- |
| Estimated spend in CNY for the current session | the stats row under the composer, e.g. `约 ¥0.02` |
| DeepSeek account balance | Settings → Models → DeepSeek, under the API key field |

Both are described in [docs/patches.md](docs/patches.md), including how the
cost estimate is calculated and why it is an estimate.

## Install

Download a release and run it:

- `DSH-Desktop-Setup-<version>-x64.exe` — installer (per-user, no admin rights,
  lets you choose the install directory)
- `DSH-Desktop-Portable-<version>-x64.exe` — single portable executable

On first launch the app asks for a DeepSeek API key
([console.deepseek.com](https://platform.deepseek.com/api_keys)).

### Where your data lives

The app keeps its own harness home at:

```
%APPDATA%\DSH Desktop\dsh-home
```

That is deliberately **not** the `~/.dsh` a terminal `dsh` install uses. Sharing
one home means a plugin added on either side breaks the other's startup, since
the harness fails its whole plugin tree when one entry cannot be resolved.
Sessions and API keys are therefore separate from a CLI install; uninstalling
one leaves the other untouched.

## Build from source

Requirements: Node.js `^22.19.0 || >=24.0.0`, pnpm, Git, and a built checkout
of the patched harness. Exact source pins, recovery commands, tested tool
versions and verification limits are in [the build guide](docs/reproducible-build.md).

```bash
git clone <this repo>
cd dsh-desktop
npm ci
```

Stage the harness runtime the app ships:

```bash
# desktop runtime with the compiled feature and compatibility patches
node scripts/build-runtime.mjs --harness /path/to/deepseek-harness

# explicit opt-in for an unpatched upstream runtime (not a desktop release)
node scripts/build-runtime.mjs --upstream-only --output .repro/upstream-runtime
```

`--harness` expects a checkout where `pnpm run build` has already run, and
copies the built `lib/` of the patched packages over the registry copies.
The registry dependency graph is frozen by [runtime-lock/](runtime-lock/package.json).
Omitting the source is an error unless `--upstream-only` is explicit. Outputs
must be absent or empty; existing runtimes are never automatically deleted.

Then run or package:

```bash
npm start        # run from source
npm test         # build-input checks, headless picker and keyless backend startup
npm run dist     # installer + portable exe into dist/
```

For the 0.1.2 taskbar fix, use an isolated output and check the actual EXE:

```bash
npm run dist -- --config.directories.output=dist/0.1.2
npm run test:artifact
```

`test:artifact` defaults to `dist/<package-version>/win-unpacked/DSH Desktop.exe`;
`DSH_TEST_EXECUTABLE` can select a different artifact. It checks the embedded
name, every icon frame and ASAR integrity without opening a window.

When upgrading from 0.1.1, manually unpin the old **Electron** entry, fully
exit the old app, open the new version and pin it again. The old shortcut
still points to the old EXE; it is not migrated automatically. See the
[0.1.2 taskbar validation record](docs/validation-0.1.2.md).

## How it works

The harness is a Node program and Electron already bundles a Node runtime, so
the backend runs as `process.execPath` with `ELECTRON_RUN_AS_NODE=1` — the
packaged app does not require a separately installed Node.js or pnpm. The staged
runtime includes Node-API addons such as koffi and node-pty. ABI compatibility
alone is not enough: the directory-picker patch avoids external ArrayBuffers
that Electron's memory cage does not support.

The client and backend run locally; DeepSeek inference and account balance
still require an API key and network access. This is not an offline model.

Run `npm run test:picker` after staging a patched runtime. This headless test
uses the real Electron worker, Koffi string decoding and IPC, with modal COM
calls replaced by a checked test double. It does not open a directory dialog;
actual selection and cancellation remain user acceptance steps.

The app asks the OS for a free port instead of pinning one, so it never
collides with a harness you are already running from a terminal.

### Notes for anyone hacking on this

- **Electron 42+ is required.** The harness needs Node `^22.19.0 || >=24`;
  Electron 33 bundles Node 20 and fails on `node:zlib`'s `createZstdDecompress`.
- **The backend is spawned with `--expose-internals`.** The CLI always mounts
  `cordis-plugin-hmr` after boot — that is what live-watches your
  `cordis.patch.yml` — and the plugin refuses to construct without it. No
  profile patch can turn it off.
- **`pnpm deploy` does not work** for staging the runtime. Many harness packages
  declare runtime dependencies only under `peerDependencies` +
  `devDependencies`, which resolve inside the workspace but are not part of a
  deployable closure; a deployed tree boots to
  `Cannot find package '@deepseek-ai/cordis-plugin-group'`. The published
  packages carry real `dependencies`, which is why the runtime is staged from
  the registry.
- **`pnpm deploy` with a Windows absolute path also mirrors empty directories
  into the source tree** (`vendor/<target-name>/…`). A stray directory under a
  workspace glob with no `package.json` makes tsdown resolve the *root* package
  name and fail with a misleading `[@deepseek-ai/dsh-root] Cannot find entry`.

### Why `win.signAndEditExecutable` is `false`

Builds here are unsigned — there is no certificate — and electron-builder's
final log line confirms it skips signing the installer anyway
(`no signing info identified, signing is skipped`). But it signs **every
`.exe` it finds inside the package** before reaching that point:
`shouldSignFile` hard-codes `.exe`, with no option to exclude one, and the
staged runtime carries third-party binaries (`node-pty`'s `OpenConsole.exe`,
ripgrep's `rg.exe`). Reaching for signtool makes it download its `winCodeSign`
bundle, whose archive contains macOS symlinks that a normal Windows account has
no privilege to extract:

```
ERROR: Cannot create symbolic link : ...winCodeSign\<id>\darwin\10.12\lib\libcrypto.dylib
```

So packaging dies on a signing step whose own conclusion is "nothing to sign".
`signAndEditExecutable: false` skips that step and the build completes.

Things that do **not** work, in case you try them:

- Pre-extracting the cached archive without symlinks (`7za x -snl-`) —
  app-builder extracts to a fresh randomly-named directory every run.
- Serving a repacked, symlink-free archive through
  `ELECTRON_BUILDER_BINARIES_MIRROR` — app-builder verifies its sha512.
- `CSC_IDENTITY_AUTO_DISCOVERY=false`, a no-op `sign` hook, or `SIGNTOOL_PATH`
  — none of them stop the bundle fetch.

In 0.1.1 this also left the EXE's embedded icon and version information as
**Electron**. This affects taskbar pinning and the right-click application
entry, not just Explorer; setting `BrowserWindow.icon` alone does not fix it.

Since 0.1.2, [scripts/brand-windows.cjs](scripts/brand-windows.cjs) runs in
`afterPack` and separately writes the terminal icon and DSH Desktop version
information into the main EXE. It uses the same `resedit@1.7.2` already locked
by electron-builder, now declared directly as a build dependency. It preserves
the ASAR integrity resource, manifest and executable code, and does not edit
third-party binaries. No signing bundle or Developer Mode is needed for this
step. Signed input is rejected instead of silently invalidating its signature.

The packaged window also sets matching taskbar relaunch details. Portable
builds use `PORTABLE_EXECUTABLE_FILE`, not the temporary extracted executable
that the portable launcher removes on exit. Actual pin/unpin and relaunch
behavior remains a user acceptance check, separate from background tests.

## License

[MIT](LICENSE). DeepSeek Harness is fetched from the public npm registry at
build time. The source recovery patch is retained under its
[upstream MIT license](patches/LICENSE.deepseek-harness).
