// Floating "Sathi" chat assistant – available on every page, aware of the latest diagnosis.
import { lang } from '../core/i18n.js';
import { chatContext, localAnswer, aiAnswer, hasAI, CHIPS } from '../core/assistant.js';
import { speak, stopSpeaking, canSpeak } from '../core/voice.js';
import { esc } from '../core/util.js';

const ic = (id) => `<svg class="icon"><use href="#${id}"/></svg>`;
const TITLE = { en: 'Sathi · farm assistant', hi: 'साथी · खेती सहायक', mr: 'साथी · शेती सहाय्यक' };
const PH = { en: 'Ask about dose, fertilizer, weather…', hi: 'मात्रा, खाद, मौसम के बारे में पूछें…', mr: 'मात्रा, खत, हवामानाबद्दल विचारा…' };
const LISTEN_LOCALE = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

let panel, msgs = [], speakOn = false, busy = false;

function fmt(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[*-] /gm, '• ').replace(/\n/g, '<br>');
}

function render() {
  const L = lang();
  const ctx = chatContext.get();
  panel.querySelector('.chat-title').textContent = TITLE[L] || TITLE.en;
  panel.querySelector('.chat-sub').innerHTML = `<span class="badge-dot" style="color:${hasAI() ? '#a6e35f' : '#ffd166'}"></span> ${hasAI() ? 'Expert AI' : 'Offline mode'}${ctx ? ' · ' + esc(ctx.disease.name) : ''}`;
  panel.querySelector('input').placeholder = PH[L] || PH.en;
  panel.querySelector('.chat-body').innerHTML = msgs.map(m => `<div class="msg ${m.role}">${fmt(m.text)}</div>`).join('') + (busy ? '<div class="msg bot typing"><i></i><i></i><i></i></div>' : '');
  panel.querySelector('.chips-row').innerHTML = (CHIPS[L] || CHIPS.en).map(c => `<button class="qchip">${esc(c)}</button>`).join('');
  panel.querySelectorAll('.qchip').forEach(b => b.onclick = () => ask(b.textContent));
  const body = panel.querySelector('.chat-body'); body.scrollTop = body.scrollHeight;
  panel.querySelector('#chatSpeak').classList.toggle('on', speakOn);
}

async function ask(q) {
  q = q.trim(); if (!q || busy) return;
  const L = lang();
  const ctx = chatContext.get();
  msgs.push({ role: 'user', text: q });
  // 1) Instant answer: common questions about the current diagnosis are answered from the
  //    app's own numbers in < 1 ms (exact doses, packs, dates — no waiting, works offline).
  const local = localAnswer(q, ctx, L);
  let text = null;
  if (ctx && local.intent !== 'unknown' && local.intent !== 'help') text = local.text;
  // 2) Open questions go to the AI, streamed word by word so the farmer sees text immediately.
  else if (hasAI()) {
    busy = true; render();
    const live = { role: 'bot', text: '' };
    try {
      text = await aiAnswer(msgs, ctx, L, (partial) => {
        if (!live.text) { busy = false; msgs.push(live); }
        live.text = partial; render();
      });
      if (msgs.includes(live)) msgs.splice(msgs.indexOf(live), 1);
    } catch { if (msgs.includes(live)) msgs.splice(msgs.indexOf(live), 1); text = null; }
  }
  if (!text) text = local.text;
  busy = false;
  msgs.push({ role: 'bot', text });
  render();
  if (speakOn) speak(text.replace(/[•*#]/g, ''), L);
}

export function openChat({ greet = false } = {}) {
  panel.classList.add('open');
  const ctx = chatContext.get();
  if (greet || !msgs.length) {
    const g = localAnswer('hello', ctx, lang()).text;
    if (!msgs.length || msgs[msgs.length - 1].text !== g) msgs.push({ role: 'bot', text: g });
  }
  render();
  setTimeout(() => panel.querySelector('input').focus(), 50);
}

export function closeChat() { panel?.classList.remove('open'); stopSpeaking(); }

export function mountChat() {
  if (panel) return;
  const fab = document.getElementById('chatBtn');
  panel = document.createElement('section');
  panel.className = 'chat-panel'; panel.setAttribute('aria-label', 'Farm assistant');
  panel.innerHTML = `
    <header class="chat-head">
      <div class="chat-avatar">🌿</div>
      <div style="flex:1;min-width:0"><div class="chat-title"></div><div class="chat-sub small"></div></div>
      ${canSpeak() ? `<button class="icon-btn" id="chatSpeak" title="Read answers aloud">${ic('i-mic')}</button>` : '<span id="chatSpeak"></span>'}
      <button class="icon-btn" id="chatClose" aria-label="Close">✕</button>
    </header>
    <div class="chat-body"></div>
    <div class="chips-row"></div>
    <form class="chat-input">
      <button type="button" class="icon-btn" id="chatMic" title="Speak">${ic('i-voice')}</button>
      <input type="text" autocomplete="off">
      <button class="icon-btn send" type="submit" aria-label="Send">${ic('i-arrow')}</button>
    </form>`;
  document.body.append(panel);
  if (fab) fab.onclick = () => { panel.classList.contains('open') ? closeChat() : openChat(); };
  panel.querySelector('#chatClose').onclick = () => { panel.classList.remove('open'); stopSpeaking(); };
  panel.querySelector('form').onsubmit = (e) => { e.preventDefault(); const i = panel.querySelector('input'); ask(i.value); i.value = ''; };
  const sp = panel.querySelector('#chatSpeak');
  if (sp.tagName === 'BUTTON') sp.onclick = () => { speakOn = !speakOn; if (!speakOn) stopSpeaking(); render(); };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = panel.querySelector('#chatMic');
  if (!SR) mic.style.display = 'none';
  else mic.onclick = () => {
    const rec = new SR(); rec.lang = LISTEN_LOCALE[lang()] || 'en-IN'; rec.interimResults = false;
    mic.classList.add('on');
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onend = () => mic.classList.remove('on');
    rec.onerror = () => mic.classList.remove('on');
    rec.start();
  };
  window.addEventListener('chatctx', () => { msgs = []; if (panel.classList.contains('open')) openChat({ greet: true }); });
  render();
}
