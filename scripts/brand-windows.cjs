/**
 * afterPack: brand only the main EXE while Windows signing stays disabled.
 *
 * signAndEditExecutable=false also skips electron-builder's resource editor.
 * Use its already-locked JS resource library, without fetching winCodeSign or
 * requiring Developer Mode. Do not touch bundled third-party executables.
 */
const { readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')
const { Data, NtExecutable, NtExecutableResource, Resource } = require('resedit')

module.exports = async function brandWindows(context) {
  if (context.electronPlatformName !== 'win32') return
  const { appInfo, projectDir } = context.packager
  const executablePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`)
  // Signed inputs deliberately fail: resource editing cannot preserve a signature.
  const executable = NtExecutable.from(await readFile(executablePath))
  const resource = NtExecutableResource.from(executable)
  const groups = Resource.IconGroupEntry.fromEntries(resource.entries)
  const versions = Resource.VersionInfo.fromEntries(resource.entries)
  if (groups.length !== 1 || versions.length !== 1) {
    throw new Error(`Unexpected Electron icon/version resource layout: ${executablePath}`)
  }
  const icon = Data.IconFile.from(await readFile(path.join(projectDir, 'build', 'icon.ico')))
  Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries, groups[0].id, groups[0].lang, icon.icons.map(item => item.data),
  )

  const version = versions[0]
  const languages = version.getAllLanguagesForStringValues()
  if (languages.length === 0) throw new Error('Missing Windows version-info language')
  for (const language of languages) {
    version.setFileVersion(appInfo.buildVersion, language.lang)
    version.setProductVersion(appInfo.version, language.lang)
    version.setStringValues(language, {
      FileDescription: appInfo.productName,
      ProductName: appInfo.productName,
      InternalName: appInfo.productFilename,
      OriginalFilename: `${appInfo.productFilename}.exe`,
      CompanyName: appInfo.companyName || 'DSH Desktop contributors',
      LegalCopyright: appInfo.copyright,
    })
  }
  version.outputToResourceEntries(resource.entries)
  // All other resources, including ELECTRONASAR integrity and the Windows
  // execution manifest, remain in the resource table unchanged.
  resource.outputResource(executable)
  await writeFile(executablePath, Buffer.from(executable.generate()))
  console.log(`[windows-branding] ${appInfo.productName} ${appInfo.version}: EXE icon and metadata updated`)
}
