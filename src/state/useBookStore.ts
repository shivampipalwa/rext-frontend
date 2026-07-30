// Live order book. Written to imperatively by lib/ws/marketSocket.ts, read
// by components via narrow selectors (e.g. `useBookStore(s => s.bids.get(price))`)
// so a single level update only re-renders the row that changed.

import { create } from 'zustand'
import type { BookSnapshot, ConnState, Side } from '../lib/types'

export interface BookState {
  /** price -> qty. A Map, not an object, so numeric price keys don't get
   * stringified and lookups stay O(1). */
  bids: Map<number, number>
  asks: Map<number, number>
  seq: number
  conn: ConnState
  applySnapshot: (snapshot: BookSnapshot) => void
  /** qty is the level's new ABSOLUTE TOTAL — set, never add. qty: 0 removes
   * the level. `seq` is the transaction this delta belongs to. */
  applyDelta: (side: Side, price: number, qty: number, seq: number) => void
  setConn: (conn: ConnState) => void
  reset: () => void
}

export const useBookStore = create<BookState>((set) => ({
  bids: new Map(),
  asks: new Map(),
  seq: 0,
  conn: 'connecting',

  applySnapshot: (snapshot) =>
    set({
      bids: new Map(snapshot.bids.map((l) => [l.price, l.qty])),
      asks: new Map(snapshot.asks.map((l) => [l.price, l.qty])),
      seq: snapshot.sequence,
    }),

  applyDelta: (side, price, qty, seq) =>
    set((state) => {
      const key = side === 'Bid' ? 'bids' : 'asks'
      const nextLevels = new Map(state[key])
      if (qty === 0) nextLevels.delete(price)
      else nextLevels.set(price, qty)
      return { [key]: nextLevels, seq } as Pick<BookState, 'bids' | 'asks' | 'seq'>
    }),

  setConn: (conn) => set({ conn }),

  reset: () => set({ bids: new Map(), asks: new Map(), seq: 0, conn: 'connecting' }),
}))
