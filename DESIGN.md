# Frontend Design

A trading client for the matching engine described in [API.md](API.md).

Reference point is Binance spot trading — the familiar three-column layout, dark
canvas, green/red semantics. Not a clone. This backend is a different animal in
three ways that the design has to answer honestly rather than paper over.

---

## What the API forces

Every one of these is a design constraint, not a bug to hide.

**Money is integers.** `u64`, no scale, no decimals anywhere. There is no
`73.55` — the last price is `73`. The reference screenshot's decimal-heavy
density does not apply. Numeric columns get narrower, thousands separators do
more work, and the order-entry inputs must reject a typed `.` outright.

The single exception is **average fill price** (`total_cost / filled_qty`), which
is derived, not stored. It's the only place a decimal appears, and it's labelled
as derived.

**One market exists.** The API accepts `USD` and `SOL` only, so `SOL-USD` is the
entire universe, and there's no endpoint that lists tradeable pairs anyway. A
market-list sidebar would render one row. That column becomes the **trade tape +
wallet** instead. The pair is a constant in config; the admin screen is the only
place a pair is ever named by hand.

**Two feeds, two dialects.** REST returns strings on `/balances` and `/orders`,
numbers on `/orders` POST and `/book`. Status is `partially_filled` over REST and
`PartiallyFilled` over the private socket. The public feed tags with a `type`
field, the private feed with a single-key wrapper. All of this is normalized at
exactly one layer — the `lib/` boundary — and no component ever sees a raw
response shape.

**Three things simply don't exist**, and the UI states so plainly rather than
faking them:

| Missing | What we do |
|---|---|
| 24h ticker stats | Derive from `GET /candles?interval=1h&limit=24` — high = max, low = min, volume = sum, change = last close vs. first open. Labelled "24h" and honest about being computed from candles. |
| Historical trade list | The tape starts empty on load and fills from the socket. Empty state says so: *"Trades appear here as they happen."* No fake seeding. |
| Pair discovery | `SOL-USD` hardcoded. Admin screen lists/delists it. |

---

## Visual system

Dark, dense, quiet. The colour budget is spent almost entirely on bid/ask
semantics — everything structural is greyscale so the green and red carry real
signal instead of competing with a decorated chrome.

### Palette

Not Binance's. Binance is neutral-grey canvas plus gold; this is a cooler,
blue-cast slate with an indigo accent, so green/red never fight the brand colour.

```
--canvas      #0A0D12   page background
--panel       #10141B   card surfaces
--panel-2     #161B24   inputs, raised rows, hover
--hairline    #212836   1px rules, card borders
--hairline-2  #2C3546   stronger dividers

--ink         #E8ECF3   primary text and numerals
--ink-2       #93A0B4   labels, column headers, secondary
--ink-3       #5C6879   disabled, non-essential only (fails AA at body size)

--bid         #22C58B   buy, up, bid side
--ask         #F1616F   sell, down, ask side
--bid-wash    rgb(34 197 139 / .10)   depth bars, row flash
--ask-wash    rgb(241 97 111 / .10)

--accent      #7C6CFF   focus rings, links, active tab, logo
--warn        #E8A33D   degraded socket, stale data
```

`--accent` is used for borders, focus rings, and 14px+ medium text only — it sits
around 4.6:1 on canvas, fine for UI and large text, not for small body copy.
`--ink-3` never carries information a user needs.

Green-up / red-down is a convention with real usability value in this domain, so
it stays. The hues are shifted — teal-leaning green, coral-leaning red — so the
screen doesn't read as a Binance screenshot.

### Type

**Archivo** for interface text, **Geist Mono** for every numeral. Both self-hosted
via `@fontsource` — no external font requests.

The mono face is the dominant texture here, because nearly every glyph on the
trade screen is a digit. Geist Mono is chosen for genuine tabular figures: prices
in a column must align on the decimal-less digit grid, and rows must not reflow
when a `9` becomes a `10`.

| Role | Face | Size / weight | Notes |
|---|---|---|---|
| Last price | Geist Mono | 22 / 500 | Tints bid or ask on tick |
| Numeric, tables | Geist Mono | 11.5 / 400 | `font-variant-numeric: tabular-nums` |
| Numeric, forms & stats | Geist Mono | 13 / 400 | |
| Panel label | Archivo | 11 / 600, `0.08em`, uppercase | `--ink-2` |
| UI body, buttons | Archivo | 13 / 500 | |
| Page heading (auth, wallet, admin) | Archivo | 24 / 600, `-0.01em` | |

`tabular-nums` is set globally on the mono class. Non-negotiable — proportional
digits make a live order book jitter.

### Form

- **Radius** — 8px panels, 6px inputs and buttons, 4px chips. No pills.
- **Rules over shadows.** Panels are separated by 1px `--hairline`, not elevation.
  Depth is reserved for the two things that actually float: dropdowns and toasts.
- **Density** — 22px rows in the book and tape, 34px in the orders table, 44px
  primary buttons. The book and tape are meant to be scanned, not clicked.
- **Grid** — 4px base. Panel padding 12px, gutters 8px.

### Motion

Deliberately sparse. In a live UI, motion is noise unless it encodes a change.

- Order-book row background flashes `--bid-wash` / `--ask-wash` for 240ms when its
  qty changes. This is the one animation that carries information.
- Last price tints toward bid or ask for 300ms on tick, then returns to `--ink`.
- New tape rows fade in over 120ms.
- Nothing else animates. No page transitions, no skeleton shimmer, no hover lifts.

`prefers-reduced-motion: reduce` drops every flash and fade. Values still update
instantly — the data is never withheld, only the animation.

---

## Screens

### Trade — `/`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⬢ EXCHANGE   SOL-USD   73 ▲   24h +4  ·  H 78  L 69  ·  Vol 12,480 SOL       │
│                                       ● live  seq 41,208    Wallet  acct 3 ▾ │
├────────────────────┬──────────────────────────────┬──────────────────────────┤
│ ORDER BOOK         │ CHART            1s 15m 1h 4h│ TRADES                   │
│ Price  Size  Total │ ▁▂▃▅▇▅▃▂▃▅▇▆▄▃▂▄▆▇      1d 1w│ Price  Size      Time    │
│  78 ▏   120    9k  │                              │  73     12    10:47:14   │
│  76 ▎   340   25k  │                              │  73      4    10:47:09   │
│  74 ▍   512   37k  │                              │  72      8    10:46:58   │
│ ──── 73 ▲ ── 1 ─── │                              │  74      2    10:46:51   │
│  72 ▊   480   34k  │                              │                          │
│  70 ▉   610   42k  ├──────────────────────────────┤                          │
│  69 █   905   62k  │ Limit  Market      Buy  Sell │                          │
│                    │ Price  ┌────────────┐ USD    ├──────────────────────────┤
│                    │ Size   ┌────────────┐ SOL    │ WALLET                   │
│                    │ Total          730 USD       │ USD  9,400  ·  730 held  │
│                    │ ░░░░░░░░░░░░░░░░░ 8% of avail│ SOL      6  ·    0 held  │
│                    │ [        Buy SOL          ]  │                          │
├────────────────────┴──────────────────────────────┴──────────────────────────┤
│ Open orders (2)   Order history                                              │
│ #14  Limit  Bid   73 × 10    filled 4/10   ────────  10:44:02     [ Cancel ] │
│ #11  Limit  Ask   76 ×  5    open   0/5              10:41:55     [ Cancel ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Reading the layout left to right: the book is where you look, the chart is where
you look back, the tape is where you watch. Order entry sits directly under the
chart so price and size can be read off it, and the orders table spans full width
underneath because it's a record, not a live surface.

**Order book.** Asks descending above, bids descending below, spread row between
showing mid price and absolute spread. Depth bars are a background fill sized by
cumulative total, right-aligned on asks, left-aligned on bids. Clicking any row
loads that price into the order form. `Total` is the running cumulative in quote
currency.

**Chart.** TradingView `lightweight-charts`, candles plus a volume histogram.
Intervals `1s · 15m · 1h · 4h · 1d · 1w`. Two API quirks handled in the data
layer, not the component: empty buckets are back-filled client-side as flat
candles at the previous close (the API omits them entirely), and `1w` buckets
start Thursday because bucketing is `floor(t/interval)` rather than calendar
aware — the `1w` chip carries a tooltip saying so rather than silently lying.
Live trades from the socket extend the newest candle in place.

**Order entry.** Limit/Market × Buy/Sell. Market hides the price input and sends
`price: 0`. The reserve preview is the piece worth building carefully — this
backend has a real available/reserved ledger split, and showing *"reserves 730 of
your 9,400 USD"* with a proportional bar is both accurate and something a generic
exchange skin wouldn't have. Inputs are integer-only: a typed `.` is rejected at
the keystroke.

The submit button states what happens: **Buy SOL** / **Sell SOL**, never "Submit."
It disables on insufficient available balance with the reason inline, so the user
learns before the round trip rather than from a `400`.

**Trades tape.** Price tinted by `taker_side` — `Ask` means a seller crossed into
a bid, so the row is red. Newest first, capped at 200 rows in memory.

**Orders table.** Two tabs off one dataset. `GET /orders` returns the account's
entire history with no pagination or filtering, so the split is client-side:
open = `open` + `partially_filled`. History is capped at the most recent 500 rows
rendered, with a note when more exist. Cancel is inline, optimistic, and reverts
with a toast on failure.

**Header.** Pair, last price, and the derived 24h row. On the right, the socket
status and current `seq`. That pairing is small but load-bearing: `seq` is the
engine's transaction counter, and a gap in it means we missed events and must
re-snapshot. Surfacing it makes the one failure mode that would otherwise be
invisible into something a user can see. Green dot live, amber reconnecting, red
disconnected.

### Auth — `/login`, `/signup`

Single centred card, no marketing. Email, password, submit. Signup returns a
token directly, so a successful signup lands straight on the trade screen — no
"now log in" detour.

Errors are specific: `401` → *"Email or password is incorrect."* `409` on signup
→ *"That email is already registered."* `422` → field-level.

Tokens last 24h with no refresh endpoint. Any `401` on any call clears the token
and routes to `/login` with *"Your session expired. Sign in again."* The trade
screen stays public and read-only when signed out — book, chart, and tape all
work; order entry is replaced with a sign-in prompt.

### Wallet — `/wallet`

```
┌──────────────────────────────────────────────────────┐
│ Wallet                                               │
│                                                      │
│ USD    Available  9,400    Held  730    Total 10,130 │
│ SOL    Available      6    Held    0    Total     6  │
│                                                      │
│ ├ Deposit ───────────┤  ├ Withdraw ─────────────────┤│
│ │ Amount  [       ]  │  │ Amount  [       ]         ││
│ │ USD ▾               │  │ USD ▾                     ││
│ │ [   Deposit    ]   │  │ [   Withdraw   ]          ││
│ └────────────────────┘  └───────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

Held (`reserved`) is the user's money locked against open orders — the copy says
*"Held against open orders"* rather than the API's `reserved`, and links to open
orders. A currency the account has never touched is absent from the response, not
zero; the UI renders both `USD` and `SOL` always, defaulting missing to `0`.

Deposit is a dev affordance and is labelled one: *"Test deposit — a production
exchange credits from an observed chain or bank event."* Withdraw draws only from
available and says so when it fails.

### Admin — `/admin`

List and delist trading pairs. Gated on the server's `ADMIN_ACCOUNT_ID`, which
the client cannot know, so the page doesn't guess: it renders, and a `403` shows
*"This account isn't the exchange admin."* No hidden nav item, no probing.

This screen matters more than its size suggests — on a fresh database nothing is
tradeable and every order returns `InvalidPair`, so this is the bootstrap. The
empty state says exactly that.

Delisting blocks new orders while leaving resting orders in the book and
cancellable; the confirm dialog states this rather than warning vaguely.

### Responsive

The three-column grid holds to 1280px. Below that:

- **1024–1280** — tape and wallet collapse into a tabbed right column.
- **768–1024** — two columns: chart + order entry left, book/tape tabbed right.
  Orders table stays full width below.
- **< 768** — single column with a bottom tab bar: Chart · Book · Trade · Orders.
  Order entry becomes a sheet. This is a real trading screen on a phone, not a
  scaled-down desktop.

---

## Data layer

Everything ugly about the API lives here and stops here.

```
src/lib/
  api.ts           typed REST client, error mapping, idempotency injection
  idempotency.ts   monotonic counter, localStorage, keyed per account
  normalize.ts     string→number parsing, status casing, side/type unions
  format.ts        integer display, thousands separators, relative time
  auth.ts          token storage, JWT payload decode (display only)
  ws/
    marketSocket.ts  public feed, buffer→snapshot→reconcile, seq-gap detection
    ordersSocket.ts  private feed, first-frame token handshake, reauth
```

### Normalization

One `normalize.ts` converts every response into a single internal shape before it
reaches state. `order_id` becomes a number, all quantities become numbers, and
status collapses to one lowercase union:

```ts
type OrderStatus = 'open' | 'partially_filled' | 'filled' | 'cancelled'
```

REST's `partially_filled` and the socket's `PartiallyFilled` both land here. No
component ever branches on casing.

Amounts stay `number` rather than `bigint` — `u64` exceeds `Number.MAX_SAFE_INTEGER`
in principle, but every realistic balance is far below 2^53 and `bigint` would
poison every arithmetic and formatting path. Parsing is defensive
(`Number(x) || 0`) since some fields arrive as strings and some as numbers.

### Idempotency

Every write endpoint requires a unique `X-Client-Order-Id`. A monotonic counter
in `localStorage`, keyed by account id from the JWT `sub` claim, seeded from
`Date.now()` so a cleared browser doesn't collide with the server's recent-1000
window.

The client owns the retry contract:

| Response | Action |
|---|---|
| `504` | Retry **the same id**, twice, backing off 400ms → 1200ms. This is the entire reason the header exists. |
| `409` | The command already landed. Don't re-send. Refetch `GET /orders` and reconcile — the server won't tell us the original response. |
| `400` with body | Engine rejected. Surface the reason. |
| `400` empty | Client bug — bad id or malformed pair. Log loudly, generic toast. |

Reject reasons map to real copy, not raw enum values:

- `InsufficientFunds` → *"Not enough available USD. You have 9,400, this order needs 10,000."*
- `InvalidPair` → *"SOL-USD isn't listed for trading yet."*
- `InvalidAmount` → *"Price × size is too large."*

### Order book — snapshot and delta

The reconciliation order from API.md is load-bearing and easy to get backwards:

1. Open `ws/market/SOL-USD`. Buffer every message. Render nothing.
2. `GET /book/SOL-USD?depth=50` → levels plus `sequence`.
3. Drop buffered messages with `seq <= sequence`.
4. Apply the rest in order, then go live.

Snapshotting first leaves an undetectable gap. `book_delta.qty` is the level's new
absolute total — **set it, never add**; `qty: 0` removes the level.

`seq` increments once per command and multiple messages can share one, so it's a
transaction boundary, not a message id. A gap means events were missed: the socket
drops to `reconnecting`, tears down, and re-runs the sequence above. The header
dot goes amber for the duration.

Reconnect backoff is 500ms → 8s, capped, with jitter.

### Private feed

Auth is a first-message handshake because browsers can't set headers on a
WebSocket: open, immediately send `{"token": "<jwt>"}`, and expect a close within
5s if it's wrong. Close frames carry no code or reason, so a bad token and a
timeout are indistinguishable — **any close before the first message is treated as
auth failure**, which clears the token and routes to login.

Messages are externally tagged, read via `Object.keys(msg)[0]`. `OrderUpdated`
carries `filled_qty` as a cumulative total — set it, don't accumulate.

`GET /orders` seeds the list; the socket drives it after. There's no sequence
number on this feed, so reconciliation is best-effort: on reconnect we refetch the
full list rather than trusting the merge.

### Source of truth

The `POST /orders` response is authoritative for the order just placed — REST
reads come off a Postgres projection that lags the engine by milliseconds. So:
apply the POST response optimistically and immediately, let the socket drive
everything after, and never let a stale `GET /balances` overwrite a fresh local
value. Balances refetch on socket order events with a 300ms debounce.

---

## State

React Query for REST (`balances`, `orders`, `candles`, `book` snapshot), Zustand
for the two live stores the sockets write into (`book`, `tape`). Auth in a small
context reading from `localStorage`.

The split exists because the sockets push at a rate React Query's cache isn't
built for — the book can change several times a second, and running it through a
query cache means invalidation churn. Zustand stores take the socket writes
directly and components subscribe to narrow slices, so a single level update
re-renders one row.

```
state/
  useAuth.ts       token, account id, login/logout/signup
  useBookStore.ts  zustand — levels, seq, connection status
  useTapeStore.ts  zustand — capped ring of recent trades
  useOrders.ts     react-query + socket merge
  useBalances.ts   react-query, debounced invalidation
  useCandles.ts    react-query + gap-fill + live tail extension
```

---

## Interface copy

Every string an interface shows is design material. The rules:

- Buttons name what happens. **Buy SOL**, **Cancel order**, **Deposit** — never
  "Submit," "OK," or "Confirm."
- A name doesn't change mid-flow. The button that says **Cancel order** produces a
  toast that says **Order cancelled**.
- Errors explain what happened and what to do, in the interface's voice, without
  apologising. *"Not enough available USD"* and the numbers, never *"Sorry, an
  error occurred."*
- Empty states invite the next action. Not *"No orders"* but *"No open orders.
  Place one from the order form."*
- User-facing vocabulary, not schema vocabulary: **Held**, not `reserved`. **Buy /
  Sell**, not `Bid / Ask`, everywhere except the order book column headers where
  Bids/Asks is the domain term users expect.

---

## Accessibility

- Every interactive element has a visible focus ring: 2px `--accent`, 2px offset.
- Colour is never the only signal. Buy/sell rows carry `▲`/`▼` and explicit
  labels; the socket status dot carries text.
- The order book is a `role="table"` with proper headers, not a div grid. Live
  regions are `aria-live="off"` — a book updating several times a second would
  flood a screen reader. The tape is `aria-live="polite"` and announces only
  trades, which is the useful signal.
- Full keyboard path through order entry: tab to price, size, side, submit.
- Contrast: all text meets AA at its rendered size. `--ink-3` is decorative or
  disabled only.
- `prefers-reduced-motion` removes all flashes and fades.

---

## Stack

| | |
|---|---|
| Build | Vite + React 19 + TypeScript |
| Styling | Tailwind v4, CSS-first `@theme` tokens in `styles/theme.css` |
| Charts | `lightweight-charts` — the API's candle shape fits nearly as-is |
| Server state | TanStack Query v5 |
| Client state | Zustand (live socket stores only) |
| Routing | React Router |
| Forms | Controlled inputs, hand-rolled validation — three small forms don't need a library |
| Fonts | `@fontsource-variable/archivo`, `@fontsource/geist-mono`, self-hosted |

Config is a single `src/config.ts`: base URL, ws URL, `PAIR = 'SOL-USD'`, book
depth, tape cap.

```
src/
  main.tsx  App.tsx  config.ts
  routes/       trade · login · signup · wallet · admin
  components/
    layout/     Header · Panel · StatusDot · Toasts
    book/       OrderBook · BookRow · SpreadRow · DepthBar
    chart/      PriceChart · IntervalTabs
    trade/      OrderForm · SideToggle · ReservePreview · IntegerInput
    tape/       TradeTape · TapeRow
    orders/     OrdersTable · OrderRow · CancelButton
    wallet/     BalanceTable · DepositForm · WithdrawForm
  lib/          api · ws · normalize · format · idempotency · auth
  state/
  styles/theme.css
```

---

## Build order

1. **Foundation** — Vite scaffold, theme tokens, fonts, `Panel`/`Header` shell,
   `api.ts` with error mapping and idempotency, `normalize.ts`, `format.ts`.
2. **Public trade screen** — book with full snapshot/delta reconciliation, tape,
   chart with gap-filling, derived 24h stats. Works signed out. This is the
   riskiest part; it goes first.
3. **Auth + account** — login, signup, token lifecycle, `401` handling, private
   socket handshake, orders table with live merge.
4. **Trading** — order entry, reserve preview, integer inputs, cancel, the full
   `504`/`409` retry path, reject-reason copy.
5. **Wallet + admin** — balances, deposit, withdraw, pair listing.
6. **Pass** — responsive breakpoints, keyboard and focus audit, reduced motion,
   empty and error states, copy review.

Phases 1–2 give a working public market view; 3–4 make it a usable exchange.

---

## Amendments

Changes made after the first build pass, from reviewing the running app. Where
these contradict the sections above, these win.

**A control system, not per-screen buttons.** The build ended up with three
unrelated primary buttons — solid indigo (sign in), accent-outlined (deposit,
withdraw), and a 10%-wash green (buy) — and the two outlined ones read as
disabled. `styles/theme.css` now defines three roles: `.btn-primary` (the one
committing action on a screen), `.btn-quiet` (secondary and inline actions),
and `.btn-buy` / `.btn-sell` (order submit only). Sizing stays in the markup.

**`--accent-strong: #5b4be8`.** White on `--accent` is 3.9:1 — fine for a 2px
focus ring, not for a button label. Filled buttons use the darker sibling at
5.8:1. `--accent` keeps its original scope: focus rings, links, active tabs,
logo.

**Buy/Sell fills are solid.** `--bid` and `--ask` at full strength with
`--canvas` as the label colour (8.5:1 and 6.1:1). The order submit is the
moment money moves and should be the heaviest element in the panel.

**One viewport, one ceiling.** Panels no longer carry hand-picked `h-[Npx]`
values per tier. The trade screen sizes itself to `100vh - header` with a
per-tier `min-h`, and the three columns divide it — chart, book and tape take
`flex-1`, order entry and wallet are content-sized. The columns end level by
construction rather than by coincidence, and the chart grows with the display.

The orders panel is the one exception and keeps a fixed height. Sizing it to
its content (via `max-h`) avoids dead space under a short table, but it makes
every panel above it a function of how many orders you happen to have: with
the top row on `flex-1`, placing or cancelling an order resized the chart and
the book. Measured at 1680×1000, one row gave a 408px chart and fourteen rows
gave 272px. Reading surfaces must not move when an order fills, so the number
is fixed (248px desktop, 232px elsewhere — roughly three rows, scrolling
beyond) and the dead space under a short table is accepted.

**Buy/Sell leads the order form.** It was two ~40px chips in the corner of the
order-type row. It is now the first control, full width, above Limit/Market;
price and size sit side by side; the disabled submit states which field is
missing.

**Depth bars scale to a 12-level window.** Scaling to the deepest level on the
side let one far-out resting order set the scale for everyone, rendering the
levels actually being traded as 5%-wide slivers. Levels past the window
saturate at 100%.

**Synthesized candles are drawn in `--ink-3`.** The gap-fill flat candles were
painted in bid/ask green, claiming activity that never happened — at `1s` they
outnumber real candles enough to bury them.

**The chart frames the current burst, not the whole series.** `fitContent()`
frames every bucket including synthesized ones, which on `1s` meant ~1,500
buckets of which ~40 carried a trade — every real candle squeezed into a few
pixels at the right edge. Neither a fixed bucket count nor "the Nth most recent
trade" fixes it, because this market trades in bursts separated by long
silences (measured on the running engine: a 21-trade burst over 40 seconds,
then a 99-minute gap, then an older burst) and any fixed N reaches back across
a gap. The left edge is now the start of the current burst — walk back until
more than 30 consecutive empty buckets — bounded to 60–240 buckets.

**The Time column is conditional.** `GET /orders` returns no timestamp, so the
column is rendered only when at least one visible row can fill it. Status moved
out of the Filled cell into its own column.

**24h stats are wired.** `useMarketStats` existed and was correct but was
imported by nothing, so the header rendered dashes on a live market. The header
also falls back to the last candle close for the price when the tape is empty,
which it always is on load.

**The product is REXT, and `--brand` is Rust's own `#ce422b`.** The engine is
Rust, so the wordmark takes Rust's colour. It is used for identity only — the
header wordmark and the favicon — and never for a control.

The palette is otherwise unchanged, deliberately. `#ce422b` sits about 15° of
hue from `--ask` (`#f1616f`), so a rust-coloured button, link or focus ring
beside a price column would read as "sell". In a trading UI the interaction
colour has to be the one hue that can never be confused with bid or ask, and
indigo is; rust isn't. So the brand colour and the interaction colour are
different colours on purpose, kept apart by position: the wordmark sits in the
far corner of the header, never adjacent to a number. Repainting `--accent`
rust, or shifting `--ask` to clear rust's hue, would both trade real legibility
on the trading surfaces for brand consistency on the chrome — the wrong trade
for this product.

**`seq` is gone from the header.** It was justified as exposing the one
invisible failure mode, but `marketSocket` deliberately does not act on seq
gaps: the public feed skips sequence numbers under completely normal use (a
deposit, a trade on another pair), so a gap is not a signal a user can act on.
Real message loss arrives as a socket close, which the status dot reports.
A number nobody can act on is noise.

**The order book does not scroll.** It renders as much depth as the panel can
hold — measured with a ResizeObserver, sliced to the levels nearest the spread,
with each side taking half the box so the spread row holds the centre line.
Scrolling a surface that rewrites itself several times a second is a losing
proposition: the rows move under the pointer as you reach for them, and the
interesting part (the spread) is the part you have to scroll to find. Depth
bars now scale to the deepest level ON SCREEN, which also retires the fixed
12-level window.

**The wallet's "Held against open orders" note is page-only.** It still
explains the ledger split on `/wallet`, where there's room; the trade screen's
wallet panel is a four-number glance beside the order form, and two lines of
prose was most of it.

**Tape rows are keyed on a client-side `id`, never `seq`.** `seq` is a
transaction boundary, not a message id — one market order sweeping several
price levels emits several trade messages under a single seq (which is why
marketSocket's stale check is `<` and not `<=`). Keying the rendered list on it
produced duplicate React keys, and React responded by omitting rows and
reusing nodes out of order: the tape displayed its timestamps ascending even
though the store's array was, by construction, strictly newest-first.
`useTapeStore.push` now stamps a monotonic `id`.
