/** Minimal typings for the global bv.js installs. */

export interface BvGlobal {
  [key: string]: unknown;
}

declare global {
  interface Window {
    /** Set by bv.js once the Bazaarvoice library has initialised. */
    BV?: BvGlobal;
    /**
     * Hook bv.js invokes when the library is ready, for attaching listeners to
     * Bazaarvoice submission events. Nothing defines it today — Bazaarvoice
     * documents no such event for Product Picker — but it is declared here so
     * that adding one later is a typed change rather than a cast.
     */
    bvCallback?: (BV: BvGlobal) => void;
  }
}

export {};
