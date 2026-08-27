# The two harness patches

`scripts/build-runtime.mjs --harness <path>` overlays the built `lib/` of three
harness packages over their registry copies. This is what those changes do, and
what they deliberately do not do.

The patches live in a DeepSeek Harness checkout, not in this repository. Each
is small on purpose: the smaller the diff, the easier it is to rebase onto a
new harness release.

| Package | Change |
| --- | --- |
| `dsh-llm-deepseek` | serves `GET /deepseek/balance` |
| `dsh-client-ui-conversation` | appends an estimated-cost group to the stats row |
| `dsh-client-ui-settings-models` | renders the balance under the API-key field |

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
