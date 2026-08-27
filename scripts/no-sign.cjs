/**
 * A deliberate no-op Windows signing hook.
 *
 * This project ships unsigned builds — there is no code-signing certificate to
 * sign with. Declaring an explicit hook (rather than leaving signing
 * unconfigured) also avoids electron-builder fetching its `winCodeSign`
 * bundle, whose archive contains macOS symlinks that a normal Windows account
 * has no privilege to extract:
 *
 *   ERROR: Cannot create symbolic link : ...\darwin\10.12\lib\libcrypto.dylib
 *
 * Repacking that archive without the symlinks does not help — app-builder
 * verifies its sha512 — and the alternative fix is enabling Windows Developer
 * Mode on every build machine. A no-op hook keeps the build working for
 * contributors on a stock Windows install.
 *
 * If you do have a certificate, replace this hook (or drop it and configure
 * `win.signtoolOptions`) — and expect to need Developer Mode.
 * @returns nothing; the executable is left unsigned.
 */
exports.default = async function sign() {
  // Intentionally empty.
}
