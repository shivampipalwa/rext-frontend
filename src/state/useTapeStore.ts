// Capped ring of recent trades, newest first. Written to by
// lib/ws/marketSocket.ts as `trade` messages arrive.
//
// Ordering is guaranteed by construction, not by sorting: `push` only ever
// prepends, and marketSocket stamps `ts` on arrival, so trades[i].ts is always
// >= trades[i + 1].ts.
//
// `id` exists because `seq` CANNOT be used to identify a trade. Per API.md it
// is incremented once per state-changing *command*, so one market order that
// sweeps several price levels emits several trade messages that all carry the
// same seq — marketSocket's stale check is deliberately `<` rather than `<=`
// for exactly this reason. Keying the rendered list on seq therefore produced
// duplicate React keys, and React reused the wrong nodes for them: the tape
// showed its timestamps out of order even though this array never was.

import { create } from 'zustand'
import { TAPE_CAP } from '../config'
import type { Trade } from '../lib/types'

/** A trade plus a client-side identity that is unique per received message. */
export interface TapeTrade extends Trade {
  id: number
}

export interface TapeState {
  trades: TapeTrade[]
  push: (trade: Trade) => void
  clear: () => void
}

/** Monotonic and process-local: it only has to be unique among the at most
 * TAPE_CAP rows alive at once, and it never resets, so a row's identity is
 * stable for as long as it is on screen. */
let nextTapeId = 0

export const useTapeStore = create<TapeState>((set) => ({
  trades: [],
  push: (trade) =>
    set((state) => ({ trades: [{ ...trade, id: nextTapeId++ }, ...state.trades].slice(0, TAPE_CAP) })),
  clear: () => set({ trades: [] }),
}))
