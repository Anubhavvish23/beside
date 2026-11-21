(() => {
  if (window.__beside_bridge) return;
  window.__beside_bridge = true;

  let host = null;
  let shadow = null;
  let pending_ghost = null;

  function ask_main(type, data) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ ok: false, error: 'no_answer' });
      }, 1500);
      function handler(event) {
        if (event.source !== window || !event.data || event.data.beside_reply !== id) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.result);
      }
      window.addEventListener('message', handler);
      window.postMessage({ beside_req: id, type, data }, '*');
    });
  }

  const styles = `
    :host { all: initial; }
    .wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .pill { display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 999px; background: #101114; color: #f3f3f3; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 10px 30px rgba(0,0,0,0.35); font-size: 13px; cursor: pointer; transition: transform .15s ease; }
    .pill:hover { transform: translateY(-1px); border-color: rgba(252,211,77,0.6); }
    .dot { width: 10px; height: 10px; border-radius: 999px; background: #00c2ff; box-shadow: 0 0 0 4px rgba(0,194,255,0.15); }
    .dot.speaking { background: #34d399; box-shadow: 0 0 0 6px rgba(52,211,153,0.2); }
    .dot.thinking { background: #fbbf24; box-shadow: 0 0 0 6px rgba(251,191,36,0.2); }
    .dot.off { background: #6b7280; box-shadow: none; }
    .muted { color: rgba(255,255,255,0.45); font-size: 11px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 0 4px; }
    .toast { max-width: 360px; padding: 12px 14px; border-radius: 14px; background: #101114; color: #f3f3f3; border: 1px solid rgba(56,189,248,0.35); box-shadow: 0 16px 40px rgba(0,0,0,0.4); font-size: 14px; line-height: 1.45; animation: rise .2s ease; }
    .toast.ghost { border-color: rgba(255,255,255,0.18); }
    .label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #7dd3fc; margin-bottom: 4px; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; background: rgba(255,255,255,0.06); padding: 8px 10px; border-radius: 8px; margin: 6px 0 10px; white-space: pre; overflow-x: auto; color: #e5e7eb; }
    .row { display: flex; gap: 8px; justify-content: flex-end; }
    button.act { all: unset; cursor: pointer; font-size: 12px; padding: 6px 12px; border-radius: 8px; background: #00c2ff; color: #000; font-weight: 600; }
    button.skip { all: unset; cursor: pointer; font-size: 12px; padding: 6px 10px; color: rgba(255,255,255,0.55); }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  `;

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'beside-extension-root';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${styles}</style><div class="wrap"><div class="toasts"></div><div class="pill" title="Tell Beside you're stuck"><span class="dot"></span><span>Stuck?</span><span class="muted">Ctrl+Shift+Y</span></div></div>`;
    shadow.querySelector('.pill').addEventListener('click', () => {
      chrome.runtime.sendMessage({ to: 'embed', payload: { type: 'stuck' } }).catch(() => {});
    });
    document.documentElement.appendChild(host);
  }

  function unmount() {
    if (host) host.remove();
    host = null;
    shadow = null;
  }

  function clear_toasts() {
    if (shadow) shadow.querySelector('.toasts').innerHTML = '';
  }

  function show_toast(build, ttl) {
    mount();
    const box = shadow.querySelector('.toasts');
    box.innerHTML = '';
    const toast = document.createElement('div');
    build(toast);
    box.appendChild(toast);
    if (ttl) setTimeout(() => toast.remove(), ttl);
  }

  function show_hint(text) {
    show_toast((toast) => {
      toast.className = 'toast';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = 'Beside';
      const body = document.createElement('div');
      body.textContent = text;
      toast.append(label, body);
    }, 15000);
  }

  function show_ghost(text, hint) {
    pending_ghost = text;
    show_toast((toast) => {
      toast.className = 'toast ghost';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = 'Next line';
      const body = document.createElement('div');
      body.textContent = hint || 'Here is the next line. Insert it, then keep going.';
      const code = document.createElement('div');
      code.className = 'code';
      code.textContent = text;
      const row = document.createElement('div');
      row.className = 'row';
      const skip = document.createElement('button');
      skip.className = 'skip';
      skip.textContent = 'Skip';
      skip.addEventListener('click', () => {
        pending_ghost = null;
        clear_toasts();
        chrome.runtime.sendMessage({ to: 'embed', payload: { type: 'ghost_result', accepted: false } }).catch(() => {});
      });
      const insert = document.createElement('button');
      insert.className = 'act';
      insert.textContent = 'Insert line';
      insert.addEventListener('click', () => insert_pending());
      row.append(skip, insert);
      toast.append(label, body, code, row);
    }, 0);
  }

  async function insert_pending() {
    if (!pending_ghost) return { ok: false };
    const result = await ask_main('insert', { text: pending_ghost });
    if (result && result.ok) {
      pending_ghost = null;
      clear_toasts();
      chrome.runtime.sendMessage({ to: 'embed', payload: { type: 'ghost_result', accepted: true } }).catch(() => {});
    } else {
      show_hint('Click inside your editor where the line should go, then press Insert again.');
    }
    return result;
  }

  function set_state(state) {
    if (!shadow) return;
    const dot = shadow.querySelector('.dot');
    dot.className = `dot ${state || ''}`;
  }

  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'Enter' && pending_ghost) {
      event.preventDefault();
      event.stopPropagation();
      insert_pending();
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, send_response) => {
    if (!message || !message.type) return false;
    if (message.type === 'activate') {
      mount();
      send_response({ ok: true });
      return false;
    }
    if (message.type === 'deactivate') {
      unmount();
      send_response({ ok: true });
      return false;
    }
    if (message.type === 'read_code') {
      ask_main('read').then((result) => {
        send_response({ ...result, title: document.title, host: location.hostname });
      });
      return true;
    }
    if (message.type === 'show_hint') {
      show_hint(message.text);
      send_response({ ok: true });
      return false;
    }
    if (message.type === 'show_ghost') {
      show_ghost(message.text, message.hint);
      send_response({ ok: true });
      return false;
    }
    if (message.type === 'insert_line') {
      pending_ghost = message.text;
      insert_pending().then(send_response);
      return true;
    }
    if (message.type === 'agent_state') {
      mount();
      set_state(message.state);
      send_response({ ok: true });
      return false;
    }
    return false;
  });
})();
