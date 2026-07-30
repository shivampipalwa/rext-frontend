// Decouples the order book from the order form. Clicking a book row loads that
// price (and optionally the cumulative size) into the form without either
// component knowing the other exists — they sit in different columns and, at
// some breakpoints, in different tabs, so prop-drilling between them isn't
// available.
//
// `prefillNonce` exists because selecting the SAME price twice is a real user
// action that must still move focus and re-fill the form. Comparing prices
// alone would swallow the second click.

import { create } from 'zustand'

export interface OrderFormPrefill {
  price: number | null
  size: number | null
  prefillNonce: number
  /** Called by the order book when a row is clicked. */
  setPrefill: (price: number, size?: number) => void
  clearPrefill: () => void
}

export const useOrderFormStore = create<OrderFormPrefill>((set) => ({
  price: null,
  size: null,
  prefillNonce: 0,

  setPrefill: (price, size) =>
    set((state) => ({ price, size: size ?? null, prefillNonce: state.prefillNonce + 1 })),

  clearPrefill: () => set({ price: null, size: null }),
}))
