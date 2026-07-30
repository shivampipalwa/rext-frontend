// Capped ring of recent trades, newest first. Written to by
// lib/ws/marketSocket.ts as `trade` messages arrive.

import { create } from 'zustand'
import { TAPE_CAP } from '../config'
import type { Trade } from '../lib/types'

export interface TapeState {
  trades: Trade[]
  push: (trade: Trade) => void
  clear: () => void
}

export const useTapeStore = create<TapeState>((set) => ({
  trades: [],
  push: (trade) => set((state) => ({ trades: [trade, ...state.trades].slice(0, TAPE_CAP) })),
  clear: () => set({ trades: [] }),
}))
