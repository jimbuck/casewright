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
  App?: { dataPath: string; argv: string[] };
  Shell?: { openExternal(uri: string): void };
  require?: NodeRequire;
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

/** The per-app data directory (NW.js `nw.App.dataPath`), for app-level state like recents. */
export function appDataPath(): string | null {
  return window.nw?.App?.dataPath ?? null;
}

/** Open a URL in the user's default browser (NW.js Shell), with a plain-browser fallback. */
export function openExternal(url: string): void {
  const shell = window.nw?.Shell;
  if (shell) shell.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

/** Runtime versions exposed by NW.js (Node-integrated renderer); empty in a plain browser. */
export function runtimeVersions(): { nw?: string; chromium?: string; node?: string } {
  const v = (globalThis as { process?: { versions?: Record<string, string> } }).process?.versions;
  return { nw: v?.nw, chromium: v?.chromium ?? v?.chrome, node: v?.node };
}

/**
 * Prompt the user to pick a directory via NW.js's `<input nwdirectory>`.
 * Resolves to the absolute path, or `null` if cancelled / not in NW.js.
 */
export function pickDirectory(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('nwdirectory', '');
    input.style.display = 'none';

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(value);
    };
    // `<input type=file>` fires no event on cancel — detect it via window refocus.
    const onFocus = () => setTimeout(() => finish(input.files?.length ? pathOf(input) : null), 350);

    input.onchange = () => finish(pathOf(input));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

function pathOf(input: HTMLInputElement): string | null {
  const file = input.files?.[0] as (File & { path?: string }) | undefined;
  return file?.path ?? (input.value || null);
}
