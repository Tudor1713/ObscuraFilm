// The recording pill: elapsed time, and a click (or Ctrl+Shift+R) to stop. Lives in its own window.
const q = new URLSearchParams(location.search);
const t0 = Number(q.get('t0')) || Date.now();
const time = document.querySelector('.time');
const mmss = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const tick = () => { time.textContent = mmss((Date.now() - t0) / 1000); };
tick();
setInterval(tick, 250);

document.body.classList.toggle('dark', q.get('dark') === '1');
window.anhe.rec.onTheme(dark => document.body.classList.toggle('dark', dark));

document.getElementById('stop').addEventListener('click', () => window.anhe.rec.requestStop());
addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') window.anhe.rec.requestStop(); });
