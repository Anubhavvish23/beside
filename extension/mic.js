const title = document.getElementById('title');
const body = document.getElementById('body');

navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((track) => track.stop());
    title.textContent = 'Microphone allowed';
    body.textContent = 'You can go back to your editor. This tab closes on its own.';
    setTimeout(() => window.close(), 1200);
  })
  .catch(() => {
    title.textContent = 'Microphone blocked';
    body.textContent = 'Click the camera icon in the address bar, allow the microphone, then reload this tab.';
  });
