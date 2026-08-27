# Harness source snapshot

`deepseek-harness.patch` preserves the two UI features and the Windows picker
repair, including their new source files, tests and repair note. It applies to:

```text
Repository: https://github.com/deepseek-ai/deepseek-harness.git
Base commit: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
Registry runtime: @deepseek-ai/dsh@0.1.1-rc.2
```

In a clean checkout of that exact commit:

```powershell
git apply --check D:/AI/dsh-desktop/patches/deepseek-harness.patch
git apply D:/AI/dsh-desktop/patches/deepseek-harness.patch
pnpm install --frozen-lockfile
$env:NODE_OPTIONS = '--max-old-space-size=12288'
pnpm run build
```

Then stage it from the desktop repository:

```powershell
node scripts/build-runtime.mjs --harness D:/path/to/clean-checkout
npm run test:picker
npm run dist
```

The changes are committed locally on harness branch `desktop/0.1.1`:

- `bdefe56f45`: CNY spend and DeepSeek balance features.
- `4952bebc28`: Electron-compatible folder-picker repair.

[harness-source.json](harness-source.json) records the full commit ids, source
tree and patch hash. Applying this patch to the pinned base reproduces that
exact Git tree. The commits are not published to a remote fork; do not try to
check them out from the official upstream repository.

A clean local clone has passed frozen dependency installation and the full
harness build. The registry runtime dependencies are also frozen in
[runtime-lock/](../runtime-lock/package.json). See the
[build guide](../docs/reproducible-build.md) for tested scope and fresh-output
commands. This is not a claim of bit-for-bit identical release binaries.
Do not apply the patch over already patched files.

The upstream code is MIT-licensed; see `LICENSE.deepseek-harness`.
