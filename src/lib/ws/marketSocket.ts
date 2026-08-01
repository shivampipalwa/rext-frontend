// Public market feed — snapshot + delta reconciliation.
//
// THE ORDER IS LOAD-BEARING (see API.md "Snapshot + delta reconciliation"):
//   1. Open the socket. Buffer every message. Render nothing.
//   2. GET /book/:pair -> levels + `sequence`.
//   3. Discard buffered messages with seq <= sequence (already in the snapshot).
//   4. Apply the rest, in order, then go live.
// Snapshotting first (instead of subscribing first) leaves an undetectable
// gap: anything that happens between the two calls is lost with no signal.
//
// `seq` increments once per state-changing command; several messages can
// share one seq (a transaction boundary, not a per-message id). A gap in seq
// means events were missed -> tear the connection down and re-run the whole
// sequence above.

import { BOOK_DEPTH, WS_BASE } from '../../config'
import { useBookStore } from '../../state/useBookStore'
import { useTapeStore } from '../../state/useTapeStore'
import { getBook } from '../api'
import type { Side, Trade } from '../types'

interface RawBookDelta {
  type: 'book_delta'
  seq: number
  side: Side
  price: number
  qty: number
}

interface RawTrade {
  type: 'trade'
  seq: number
  price: number
  qty: number
  taker_side: Side
}

type RawMarketMessage = RawBookDelta | RawTrade

const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 8000

type Phase = 'idle' | 'buffering' | 'live'

class MarketSocketController {
  private ws: WebSocket | null = null
  private pair: string | null = null
  private buffer: RawMarketMessage[] = []
  private phase: Phase = 'idle'
  private lastSeq = -1
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closedByClient = false

  connect(pair: string): void {
    this.closedByClient = false
    this.pair = pair
    this.reconnectAttempt = 0
    useBookStore.getState().reset()
    this.open()
  }

  disconnect(): void {
    this.closedByClient = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.phase = 'idle'
    this.ws?.close()
    this.ws = null
    useBookStore.getState().setConn('closed')
  }

  private open(): void {
    if (!this.pair || this.closedByClient) return

    this.phase = 'buffering'
    this.buffer = []
    this.lastSeq = -1
    useBookStore.getState().setConn(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    const ws = new WebSocket(`${WS_BASE}/ws/market/${encodeURIComponent(this.pair)}`)
    this.ws = ws

    // Every handler bails out if `ws` is no longer `this.ws` — a stale event
    // from a socket this controller has since superseded. This singleton is
    // connected from App.tsx's top-level effect, and React 19 StrictMode
    // double-invokes effects in dev (mount -> cleanup -> mount, synchronously
    // calling connect() -> disconnect() -> connect()); the first socket's
    // close event still arrives asynchronously after that, and without this
    // guard it would run scheduleReconnect() / mutate `phase` for a
    // connection the second (real, live) socket has already replaced.
    ws.onmessage = (event) => {
      if (ws !== this.ws) return
      const msg = JSON.parse(event.data as string) as RawMarketMessage
      if (this.phase === 'buffering') {
        this.buffer.push(msg)
      } else if (this.phase === 'live') {
        this.handleLive(msg)
      }
      // phase === 'idle': torn down, waiting for the close event -> ignore.
    }

    ws.onopen = () => {
      if (ws !== this.ws) return
      void this.snapshotAndReconcile(ws)
    }

    ws.onclose = () => {
      if (ws !== this.ws) return
      if (this.closedByClient) return
      this.scheduleReconnect()
    }
  }

  /** `ws` is the socket that triggered this call (its own `onopen`). Checked
   * again after the `await` — by the time the fetch resolves, `this.ws` may
   * already point at a newer connection (a fast reconnect during the gap),
   * in which case this stale run must not touch the store on its behalf. */
  private async snapshotAndReconcile(ws: WebSocket): Promise<void> {
    if (!this.pair) return
    try {
      const snapshot = await getBook(this.pair, BOOK_DEPTH)
      if (ws !== this.ws) return // superseded while the fetch was in flight
      const rest = this.buffer.filter((m) => m.seq > snapshot.sequence)
      this.buffer = []

      useBookStore.getState().applySnapshot(snapshot)
      this.lastSeq = snapshot.sequence
      this.phase = 'live'

      for (const msg of rest) {
        if (this.phase !== 'live') break // a gap mid-replay tore this down already
        this.handleLive(msg)
      }

      if (this.phase === 'live') {
        this.reconnectAttempt = 0
        useBookStore.getState().setConn('live')
      }
    } catch {
      if (ws !== this.ws) return // superseded — not this run's connection to tear down
      // Snapshot fetch failed (e.g. offline) — tear down and let onclose
      // (or a manual retry below) drive the reconnect loop.
      this.teardownForReconnect()
    }
  }

  private handleLive(msg: RawMarketMessage): void {
    if (msg.seq < this.lastSeq) return // stale — already applied

    // NO GAP DETECTION HERE, deliberately. API.md says "a gap in seq means you
    // missed events", but that is not true of this feed, and acting on it
    // causes a reconnect loop under completely normal use.
    //
    // `seq` is EventBatch.seq, incremented once per state-changing *command*
    // (engine.rs). The public feed forwards only BookDelta and Trade events
    // for the subscribed pair — api/ws.rs drops everything else via
    // `_ => continue`. So a command that changes state without touching this
    // pair's book consumes a seq and publishes nothing here. A deposit emits
    // only BalanceChanged; a trade on another pair is filtered by pair. Both
    // leave a hole in the seq numbers this socket observes, with nothing
    // missed. Tearing down on that would re-snapshot the book on every
    // deposit made from the wallet screen.
    //
    // Real message loss is signalled differently: when a subscriber falls
    // behind the broadcast buffer, the server closes the socket rather than
    // skipping (api/ws.rs `Err(_) => break`). `onclose` already re-runs the
    // full buffer -> snapshot -> reconcile sequence, so that path is covered.
    this.lastSeq = msg.seq

    if (msg.type === 'book_delta') {
      // qty is the level's new ABSOLUTE TOTAL — set it, never add. The store
      // treats qty: 0 as "remove this level".
      useBookStore.getState().applyDelta(msg.side, msg.price, msg.qty, msg.seq)
    } else {
      const trade: Trade = { seq: msg.seq, price: msg.price, qty: msg.qty, takerSide: msg.taker_side, ts: Date.now() }
      useTapeStore.getState().push(trade)
    }
  }

  private teardownForReconnect(): void {
    this.phase = 'idle'
    useBookStore.getState().setConn('reconnecting')
    this.ws?.close()
  }

  private scheduleReconnect(): void {
    useBookStore.getState().setConn('reconnecting')
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.reconnectAttempt)
    const jitter = Math.random() * base * 0.3
    const delay = Math.min(RECONNECT_MAX_MS, base + jitter)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }
}

/** Singleton controller — one connection per pair, per DESIGN.md. Call
 * `marketSocket.connect(PAIR)` once (e.g. in the trade route) and
 * `marketSocket.disconnect()` on teardown. */
export const marketSocket = new MarketSocketController()
