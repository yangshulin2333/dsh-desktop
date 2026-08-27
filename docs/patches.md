# Harness features and compatibility patches

`scripts/build-runtime.mjs --harness <path>` overlays the built `lib/` of four
harness packages over their registry copies. This is what those changes do, and
what they deliberately do not do.

The editable sources live in the DeepSeek Harness checkout on local branch
`desktop/0.1.1`. This repository also keeps a
[recovery patch and source pins](../patches/README.md). The
[build guide](reproducible-build.md) explains dependency locking and verification.

| Package | Change |
| --- | --- |
| `dsh-llm-deepseek` | serves `GET /deepseek/balance` |
| `dsh-client-ui-conversation` | appends an estimated-cost group to the stats row |
| `dsh-client-ui-settings-models` | renders the balance under the API-key field |
| `dsh-host-directory-picker-native` | copies UTF-16 paths safely under Electron and keeps IPC open until the result flushes |

## 1. Session spend in CNY

The stats row under the composer gains a final group:

```
2 轮 · 2 步 | LLM 5.6s | 首 token 平均 2.3s · 95 tok/s | 缓存命中 68% | 输入 35.4K tok · 输出 99 tok | 约 ¥0.02
```

### How it is calculated

The harness already keeps a durable per-session `tokenUsage` projection with
four disjoint buckets: uncached input, cache reads, cache writes, and output.
The patch prices those buckets separately against the model the session is
currently using, which matters a lot — a cache-hit input token costs about
1/31 of an uncached one, so a flat "total tokens × one rate" figure would be
wildly wrong for a long session.

Rates come from DeepSeek's published off-peak prices, converted at a fixed
approximate USD→CNY rate. Both live in one file in the harness checkout
(`packages/client/ui-conversation/src/client/chat/pricing.ts`), so a price
change is a one-file edit.

### Why it says 约 ("about")

Three honest reasons:

1. **The rate is fixed.** DeepSeek publishes USD prices only; the CNY figure
   is a conversion at a constant, not a live rate.
2. **Peak pricing is not modeled.** DeepSeek charges 2× during peak hours
   (UTC Mon–Fri 01:00–04:00 and 06:00–10:00). The usage projection carries no
   per-request timestamp, so there is nothing to key the multiplier off.
3. **It is a session total, not a per-message figure.** The underlying
   projection is cumulative for the whole session. A true per-message cost
   would need the model id threaded onto each assistant node, which is a much
   larger change to the harness's conversation model.

Treat it as a running estimate, not an invoice.

## 2. Account balance in Settings

Settings → Models → DeepSeek shows the account balance under the API key:

```
账户余额： CNY 19.26
```

### Why an HTTP route rather than an RPC method

The harness has a typed RPC layer (Typert) that generates client stubs and zod
validators from `@Remote`-decorated service methods. The balance readout does
not use it. Adding a Typert service to `dsh-llm-deepseek` required a TypeScript
project reference to the protocol package, which triggered TypeScript's
project-reference source redirect: the referenced package's sources were pulled
into the adapter's own compilation, emitting `.js`/`.d.ts` next to sources and
breaking the build in ways that took a while to attribute correctly.

A plain route on `ctx.webServer` (the same seam plugins like ModLens use) needs
no code generation, no zod in the browser bundle, and no new build edges. The
whole payload is four decimal strings.

The result: `dsh-llm-deepseek` gains one new file and 14 lines in `index.ts`;
its `package.json` and `tsconfig.json` are untouched.

### Security shape

The API key never reaches the browser. The route resolves it host-side through
the same two closures the chat adapter uses — never a second, independently
drifting resolution path — calls DeepSeek's `/user/balance`, validates the
response, and returns only the parsed amounts. Failures answer with a JSON
`{ error }` body the page renders as "unavailable" with the reason, since a
missing key or an upstream refusal is an ordinary state of this readout rather
than a server fault.

The route registers through a scoped `ctx.inject(['webServer'], …)` rather than
a direct read at plugin-apply time: the web server activates after the LLM
adapters, so a direct read always misses it. Profiles with no web server
(headless, TUI) simply never register it.

## 3. Windows directory-picker compatibility

The 0.1.0 worker can display the dialog but crashes with exit code 134 when
`readUtf16` calls `koffi.view`. Electron forbids external ArrayBuffers; this is
independent of whether the native DLLs were bundled successfully. The fix uses
`koffi.decode(address, 'char16', -1)` to copy the NUL-terminated UTF-16 string.
It also avoids treating a zero low byte as the end of a nonzero UTF-16 character.

The worker disconnects IPC only after a terminal `done` or `error` message has
flushed, never after the earlier `showing` notice. Unexpected exits include the
exit code and signal. Native COM strings are freed even when decoding fails.

`npm run test:picker` covers ordinary paths, Unicode paths and cancellation
under the actual Electron executable without opening a window. The modal COM
interaction is mocked; user-driven selection is still required for acceptance.

Electron remains the desktop host. Changing to Tauri would still require
bundling and supervising the DSH backend; it would not remove that work.
If broader native-plugin incompatibilities appear, a separately bundled Node.js
backend can be evaluated without replacing the Electron UI.
