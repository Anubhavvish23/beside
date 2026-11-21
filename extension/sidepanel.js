const embed_url = 'https://in-class-pi.vercel.app/embed';
const board = document.getElementById('board');
const mic_box = document.getElementById('mic');

board.src = embed_url;

chrome.runtime.connect({ name: 'panel' });

window.addEventListener('message', async (event) => {
  if (event.source !== board.contentWindow || event.data?.source !== 'beside-page') return;
  const { id, payload } = event.data;
  let result = null;
  try {
    result = await chrome.runtime.sendMessage({ to: 'editor', payload });
  } catch {}
  board.contentWindow.postMessage({ source: 'beside-ext', id, result }, '*');
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.to_panel) {
    board.contentWindow?.postMessage({ source: 'beside-ext', push: message.payload }, '*');
  }
});

async function watch_mic() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    const update = () => {
      const granted = status.state === 'granted';
      mic_box.classList.toggle('show', !granted);
      if (granted && board.dataset.needs_reload === '1') {
        board.dataset.needs_reload = '';
        board.src = embed_url;
      }
      if (!granted) board.dataset.needs_reload = '1';
    };
    status.onchange = update;
    update();
  } catch {}
}

document.getElementById('allow').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
});

watch_mic();
