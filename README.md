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

Requirements: Node.js 22.19+ or 24+, pnpm, and — only if you want the two
patches — a built checkout of the harness.

```bash
git clone <this repo>
cd dsh-desktop
npm install
```

Stage the harness runtime the app ships:

```bash
# plain upstream runtime, no patches
npm run build:runtime

# or, with the local patches compiled in
node scripts/build-runtime.mjs --harness /path/to/deepseek-harness
```

`--harness` expects a checkout where `pnpm run build` has already run, and
copies the built `lib/` of the patched packages over the registry copies.

Then run or package:

```bash
npm start        # run from source
npm run dist     # installer + portable exe into dist/
```

## How it works

The harness is a Node program and Electron already bundles a Node runtime, so
the backend runs as `process.execPath` with `ELECTRON_RUN_AS_NODE=1` — the
packaged app needs nothing installed on the target machine. The staged runtime
is a plain registry closure with **no native addons**, so nothing has to match
Electron's ABI.

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

Enabling **Windows Developer Mode** (Settings → System → For developers) grants
the symlink privilege and lets you drop this flag. The trade-off if you do:
`signAndEditExecutable: false` also skips `rcedit`, so the packaged
`DSH Desktop.exe` keeps Electron's default icon and version metadata — the
installer, Start Menu, and desktop shortcut icons all still come from
`build/icon.ico`, so this is only visible on the executable itself in Explorer.

## License

[MIT](LICENSE). DeepSeek Harness itself is MIT-licensed and is fetched from the
public npm registry at build time; this repository redistributes none of it.
