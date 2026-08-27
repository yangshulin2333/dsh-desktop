/**
 * Historical no-op hook, retained for reference but NOT configured.
 * It did not prevent electron-builder 25.1.8 from fetching winCodeSign and
 * failing on symlink extraction. Do not enable it as an icon/signing fix.
 *
 * The active unsigned strategy is win.signAndEditExecutable=false together
 * with the separate afterPack resource editor in brand-windows.cjs.
 * See README.md for the failed approaches and current verification steps.
 * @returns nothing; the executable is left unsigned.
 */
exports.default = async function sign() {
  // Intentionally empty.
}
