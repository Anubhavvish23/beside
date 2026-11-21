let panel_ports = new Set();

async function read_editor_tab() {
  const stored = await chrome.storage.session.get(['editor_tab_id']);
  return stored.editor_tab_id ?? null;
}

async function send_to_tab(tab_id, payload) {
  if (!tab_id) return null;
  try {
    return await chrome.tabs.sendMessage(tab_id, payload);
  } catch {
    return null;
  }
}

async function send_to_panel(payload) {
  try {
    await chrome.runtime.sendMessage({ to_panel: true, payload });
    return true;
  } catch {
    return false;
  }
}

async function use_editor_tab(tab) {
  if (!tab?.id) return;
  const previous = await read_editor_tab();
  if (previous === tab.id) {
    await send_to_tab(tab.id, { type: 'activate' });
    return;
  }
  const reply = await send_to_tab(tab.id, { type: 'activate' });
  if (!reply?.ok) return;
  if (previous) await send_to_tab(previous, { type: 'deactivate' });
  await chrome.storage.session.set({ editor_tab_id: tab.id });
  await send_to_panel({ type: 'editor_changed' });
}

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  use_editor_tab(tab);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'stuck') return;
  if (tab?.windowId && panel_ports.size === 0) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
  if (tab) await use_editor_tab(tab);
  await send_to_panel({ type: 'stuck' });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (panel_ports.size === 0) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    await use_editor_tab(tab);
  } catch {}
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  panel_ports.add(port);
  port.onDisconnect.addListener(async () => {
    panel_ports.delete(port);
    if (panel_ports.size > 0) return;
    await send_to_tab(await read_editor_tab(), { type: 'deactivate' });
  });
});

chrome.runtime.onMessage.addListener((message, sender, send_response) => {
  if (message?.to_panel) return false;
  (async () => {
    if (message.to === 'editor') {
      send_response(await send_to_tab(await read_editor_tab(), message.payload));
      return;
    }
    if (message.to === 'embed') {
      if (sender.tab?.id) await chrome.storage.session.set({ editor_tab_id: sender.tab.id });
      const delivered = await send_to_panel(message.payload);
      send_response(delivered ? { ok: true } : { ok: false, error: 'no_panel' });
      return;
    }
    send_response(null);
  })();
  return true;
});
