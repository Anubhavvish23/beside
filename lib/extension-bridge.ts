export type EditorSnapshot = {
  ok: boolean;
  kind?: string;
  code?: string;
  cursor_line?: number;
  language?: string;
  title?: string;
  host?: string;
  error?: string;
};

export type ExtensionPush =
  | { type: 'stuck' }
  | { type: 'editor_changed' }
  | { type: 'ghost_result'; accepted: boolean };

function in_panel() {
  return typeof window !== 'undefined' && window.parent !== window;
}

function bridge_target(): Window {
  return in_panel() ? window.parent : window;
}

export function has_extension() {
  if (typeof document === 'undefined') return false;
  return in_panel() || document.documentElement.dataset.besideExtension === '1';
}

export function ask_extension<T = unknown>(payload: Record<string, unknown>, timeout_ms = 2500): Promise<T | null> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const target = bridge_target();
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, timeout_ms);
    function handler(event: MessageEvent) {
      if (event.source !== target || event.data?.source !== 'beside-ext' || event.data?.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve((event.data.result ?? null) as T | null);
    }
    window.addEventListener('message', handler);
    target.postMessage({ source: 'beside-page', id, payload }, '*');
  });
}

export function on_extension_push(handler: (push: ExtensionPush) => void) {
  const target = bridge_target();
  function listener(event: MessageEvent) {
    if (event.source !== target || event.data?.source !== 'beside-ext' || !event.data?.push) return;
    handler(event.data.push as ExtensionPush);
  }
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

const language_names: Record<string, string> = {
  python: 'Python',
  python3: 'Python',
  javascript: 'JavaScript',
  typescript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
  'c++': 'C++',
  c: 'C',
};

export function language_from(raw: string | undefined) {
  if (!raw) return null;
  const key = raw.toLowerCase().split('/').pop()?.replace('ace/mode/', '') ?? '';
  return language_names[key] ?? null;
}
