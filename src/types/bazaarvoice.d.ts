/** Minimal typings for the globals bv.js installs and reads. */

/** Payload of the `mpsClose` event emitted when the consumer closes the form. */
export interface MpsCloseData {
  /** True when every product in the link was reviewed. */
  completed?: boolean;
  /** Number of products the consumer reviewed in this session. */
  productsSubmitted?: number;
  [key: string]: unknown;
}

export interface BvSwatSubmission {
  on(event: "mpsClose", handler: (data: MpsCloseData) => void): void;
  on(event: string, handler: (data: unknown) => void): void;
}

export interface BvGlobal {
  swat_submission?: BvSwatSubmission;
  [key: string]: unknown;
}

declare global {
  interface Window {
    /** Invoked by bv.js once the Bazaarvoice library is ready. */
    bvCallback?: (BV: BvGlobal) => void;
    BV?: BvGlobal;
  }

  interface WindowEventMap {
    /** Re-broadcast of Bazaarvoice's `mpsClose`, for local listeners. */
    "bootz:mpsClose": CustomEvent<MpsCloseData>;
  }
}

export {};
