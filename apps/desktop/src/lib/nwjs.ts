/**
 * Thin, typed access to the NW.js window APIs, with graceful fallbacks so the
 * app still runs in a plain browser (dev preview, tests) where `nw` is absent.
 */
export interface NwWindow {
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  restore(): void;
  close(force?: boolean): void;
  reload(): void;
  showDevTools?(): void;
  on(event: string, listener: () => void): void;
  removeAllListeners(event: string): void;
}

interface NwGlobal {
  Window: { get(): NwWindow };
}

declare global {
  interface Window {
    nw?: NwGlobal;
  }
}

/** True when running inside NW.js (vs a plain browser). */
export const isNwjs = (): boolean => typeof window !== 'undefined' && !!window.nw;

/** The current NW.js window, or null when not running under NW.js. */
export function nwWindow(): NwWindow | null {
  return window.nw?.Window.get() ?? null;
}
