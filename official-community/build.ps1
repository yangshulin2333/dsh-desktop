param([string]$BuildDirectory = (Join-Path $PSScriptRoot 'build'))
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $BuildDirectory) { throw 'BuildDirectory must be a new directory.' }
$upstream = 'fb2c4b9e698e30edb738bca4cf0618587db7d203'
& git clone --depth 1 --branch dsh-v0.1.5-rc.2 https://github.com/deepseek-ai/deepseek-harness.git $BuildDirectory
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
Push-Location -LiteralPath $BuildDirectory
try {
  $actual = (& git rev-parse HEAD).Trim()
  if ($actual -ne $upstream) { throw "Unexpected upstream commit: $actual" }
  & git apply --check (Join-Path $PSScriptRoot 'upstream.patch')
  if ($LASTEXITCODE -ne 0) { throw 'Patch check failed' }
  & git apply (Join-Path $PSScriptRoot 'upstream.patch')
  if ($LASTEXITCODE -ne 0) { throw 'Patch failed' }
  & npm exec --yes --package=pnpm@11.7.0 -- pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Dependency preparation failed' }
  & npm exec --yes --package=pnpm@11.7.0 -- pnpm --dir apps/desktop run prepare:package
  if ($LASTEXITCODE -ne 0) { throw 'Offline seed preparation failed' }
  & npm exec --yes --package=pnpm@11.7.0 -- pnpm --dir apps/desktop exec electron-builder --config electron-builder.community.mjs --win --x64 --publish never
  if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
  Write-Output (Join-Path $BuildDirectory 'apps/desktop/.desktop-build/targets/win-x64/artifacts/DSH-Desktop-Community-0.1.5-rc.2-Setup-x64.exe')
} finally { Pop-Location }
