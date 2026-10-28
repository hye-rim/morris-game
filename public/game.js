'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 아홉 말 모리스: 화면·입력·소리·온라인. 규칙과 컴퓨터는 logic.js (LOGIC_MORRIS), 방·매칭은 server.js
(() => {
const L = LOGIC_MORRIS;
const $ = (id) => document.getElementById(id);
const T = { cpu: 700, over: 900, banner: 1100, mill: 1400 };        // 시간(ms). 시험용으로 줄일 수 있다
const SIDE_NAME = ['노랑', '분홍'];
const SVGNS = 'http://www.w3.org/2000/svg';
const RAD = [120, 80, 40];                                          // 바깥 · 가운데 · 안쪽 네모의 반 변 길이 (판 그림은 300x300, 중심 150)
const OFF = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const pt = (i) => { const r = RAD[(i / 8) | 0], o = OFF[i % 8]; return [150 + o[0] * r, 150 + o[1] * r]; };

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let wins = Number(store.get('morrisWins')) || 0;
const ONLINE_KEY = 'morrisOnline', SESSION_KEY = 'morrisSession';
const loadJson = (k) => { try { return JSON.parse(store.get(k)) || {}; } catch (_) { return {}; } };
function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; } }
function saveSession(s) { try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch (_) {} }
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const myName = () => store.get('morrisName') || '';

// ---------- 소리 ----------
let audio = null;
let muted = store.get('morrisMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  place: () => tone(330, 0.07, 'square', 0.07, -80),
  move: () => tone(260, 0.07, 'triangle', 0.08, 40),
  remove: () => seq([300, 200], 80, 'square', 0.07),
  mill: () => seq([523, 659, 784], 90, 'triangle', 0.09),
  sel: () => tone(700, 0.04, 'triangle', 0.07),
  bad: () => tone(150, 0.1, 'square', 0.05),
  found: () => seq([392, 523], 90, 'triangle', 0.08),
  win: () => seq([523, 659, 784, 1047], 110, 'triangle', 0.1),
  lose: () => seq([392, 330, 262, 196], 150, 'sawtooth', 0.06),
  draw: () => seq([440, 440], 130, 'triangle', 0.07),
};
function toggleMute() { muted = !muted; store.set('morrisMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let mode = 'easy';                  // 'easy' · 'normal' · 'hard' (컴퓨터) · 'online'
let phase = 'title';                // title · play · over
let st = null;                      // 컴퓨터 대전 판
let cpuYou = 0;                     // 컴퓨터 대전에서 내 자리 (0 노랑·먼저, 1 분홍). 다시 하면 서로 바뀐다
let room = null, netDown = false, waitingNet = false, turnEnd = 0, recorded = '', seenMove = 0;
let cpuTimer = 0, overTimer = 0, thinking = false, bannerTimer = 0, millTimer = 0;
let sel = -1;                       // 옮기려고 고른 내 말의 점 번호
let lastMark = null;                // 방금 둔 수 { from, to, at }
let millHL = null;                  // 방금 만든 밀의 세 점
const online = () => mode === 'online';

// 화면이 쓰는 모양으로: { v: { board, toPlace, turn, mustRemove, legal }, you, state, winner, reason, names }
function model() {
  if (online()) {
    if (!room) return null;
    return { v: { board: room.board, toPlace: room.toPlace, turn: room.turn, mustRemove: room.mustRemove, legal: room.legal || [] }, you: room.you, state: room.state, winner: room.winner, reason: room.reason,
      names: [0, 1].map((c) => (c === room.you ? '나' : ((room.players.find((p) => p.color === c) || {}).name || '상대'))) };
  }
  if (!st) return null;
  const mine = st.turn === cpuYou && !st.over;
  return { v: { board: st.board, toPlace: st.toPlace, turn: st.turn, mustRemove: st.mustRemove, legal: mine ? L.legalActions(st) : [] }, you: cpuYou, state: st.over ? 'over' : 'playing', winner: st.winner, reason: st.reason, names: cpuYou === 0 ? ['나', '컴퓨터'] : ['컴퓨터', '나'] };
}
const myTurn = (m) => !!m && m.state === 'playing' && m.v.turn === m.you && !netDown && !thinking;
const canAct = (m) => myTurn(m) && !waitingNet;
const countOn = (board, p) => board.filter((v) => v === p + 1).length;

// ---------- 판 그리기 ----------
const svg = $('bsvg');
const sv = (tag, attrs, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
function drawBoard() {
  svg.innerHTML = '';
  for (let q = 0; q < 3; q++) {
    const r = RAD[q];
    sv('rect', { x: 150 - r, y: 150 - r, width: r * 2, height: r * 2, class: 'ln' }, svg);
  }
  for (const k of [1, 3, 5, 7]) { const [x1, y1] = pt(k), [x2, y2] = pt(16 + k); sv('line', { x1, y1, x2, y2, class: 'ln' }, svg); }
  for (let i = 0; i < 24; i++) { const [cx, cy] = pt(i); sv('circle', { cx, cy, r: 3.6, class: 'dotp' }, svg); }
  sv('g', { id: 'layer' }, svg);
  const hits = sv('g', { id: 'hits' }, svg);
  for (let i = 0; i < 24; i++) { const [cx, cy] = pt(i); const c = sv('circle', { cx, cy, r: 17, class: 'hit', 'data-i': i }, hits); c.dataset.i = i; }
}

function render() {
  const m = model();
  if (!m) { renderHud(null); return; }
  const v = m.v, mine = canAct(m);
  // 입력 가능한 점 정리
  const legal = mine ? v.legal : [];
  const removeSet = new Set(legal.filter((a) => a.type === 'remove').map((a) => a.at));
  const placeSet = new Set(legal.filter((a) => a.type === 'place').map((a) => a.to));
  const fromSet = new Set(legal.filter((a) => a.type === 'move').map((a) => a.from));
  if (sel >= 0 && !fromSet.has(sel)) sel = -1;
  const toSet = new Set(legal.filter((a) => a.type === 'move' && a.from === sel).map((a) => a.to));
  const layer = $('layer');
  layer.innerHTML = '';
  if (millHL) { const pts = millHL.map(pt); sv('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: 'millhl', fill: 'none' }, layer); }
  if (lastMark) for (const k of ['from', 'to', 'at']) if (lastMark[k] >= 0 && lastMark[k] != null) { const [cx, cy] = pt(lastMark[k]); sv('circle', { cx, cy, r: 15, class: 'mark' }, layer); }
  v.board.forEach((val, i) => {
    if (!val) return;
    const [cx, cy] = pt(i);
    sv('circle', { cx, cy, r: 11.5, class: `pc s${val - 1}${i === sel ? ' sel' : ''}` }, layer);
  });
  toSet.forEach((i) => { const [cx, cy] = pt(i); sv('circle', { cx, cy, r: 6, class: 'tgt' }, layer); });
  removeSet.forEach((i) => { const [cx, cy] = pt(i); sv('circle', { cx, cy, r: 16, class: 'rm' }, layer); });
  document.querySelectorAll('#hits .hit').forEach((el) => {
    const i = Number(el.dataset.i);
    el.classList.toggle('can', removeSet.has(i) || placeSet.has(i) || fromSet.has(i) || toSet.has(i));
  });
  // 위·아래 이름표: 판 위 말 수와 단계
  const phaseText = (p) => (v.toPlace[p] > 0 ? `놓을 말 ${v.toPlace[p]}개` : (countOn(v.board, p) === 3 ? '날 수 있어요!' : '움직이는 중'));
  const side = (p) => `<span class="who s${p}">${esc(m.names[p])} (${SIDE_NAME[p]})${m.state === 'playing' && v.turn === p ? ' ▶' : ''}</span><span class="role">말 ${countOn(v.board, p) + v.toPlace[p]}개 · ${phaseText(p)}</span>`;
  $('capTop').innerHTML = side(1 - m.you);
  $('capBottom').innerHTML = side(m.you);
  renderHud(m);
}
function hint(m) {
  if (!m || m.state !== 'playing') return '';
  if (m.v.turn !== m.you) return '';
  if (m.v.mustRemove) return '밀! 뺏을 상대 말을 눌러요';
  if (m.v.toPlace[m.you] > 0) return '빈 점을 눌러 말을 놓아요';
  return sel >= 0 ? '옮길 곳(초록 점)을 눌러요' : '움직일 내 말을 눌러요';
}
function renderHud(m = model()) {
  $('wins').textContent = wins.toLocaleString('ko-KR');
  let text = '모리스';
  if (m && phase === 'play' && m.state === 'playing') {
    const sec = Math.max(0, Math.ceil((turnEnd - performance.now()) / 1000));
    if (online() && netDown) text = '연결 다시 붙이는 중…';
    else if (m.v.turn === m.you) text = `내 차례${online() ? ` · ${sec}초` : ''}`;
    else text = online() ? `${m.names[m.v.turn]} 차례 · ${sec}초` : '컴퓨터 차례…';
  }
  $('turn').textContent = text;
  $('resignBtn').style.display = online() && room && room.state === 'playing' ? '' : 'none';
}
function say(t) { $('msg').textContent = t; }
function banner(text, color) {
  const b = $('banner');
  b.textContent = text; b.style.color = color || '#fff'; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), T.banner);
}
// 받침에 따라 바뀌는 조사 (이/가)
const iga = (w) => (/[가-힣]$/.test(w) ? (((w.charCodeAt(w.length - 1) - 0xAC00) % 28 === 0) ? '가' : '이') : '이(가)');
function announce(ev) {
  const m = model();
  if (!m) return;
  const mine = ev.who === m.you;
  const nm = mine ? '내가' : (online() ? `${m.names[ev.who]}${iga(m.names[ev.who])}` : '컴퓨터가');
  let t;
  if (ev.type === 'place') { sfx.place(); t = `${nm} 말을 놓았어요`; }
  else if (ev.type === 'move') { sfx.move(); t = `${nm} 말을 옮겼어요`; }
  else { sfx.remove(); t = `${nm} 상대 말을 하나 뺏었어요`; }
  if (ev.mill) {
    sfx.mill(); banner('밀!', '#ffd23f');
    millHL = ev.mill; clearTimeout(millTimer); millTimer = setTimeout(() => { millHL = null; render(); }, T.mill);
    t += `\n세 점이 한 줄! ${mine ? '뺏을 상대 말을 골라요' : '상대 말을 하나 뺏어요'}`;
  }
  say(t);
}

// ---------- 창 ----------
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

// ---------- 입력 ----------
$('bsvg').addEventListener('pointerdown', (e) => {
  const el = e.target.closest ? e.target.closest('.hit') : null;
  if (!el) return;
  e.preventDefault();
  const m = model();
  if (!m || phase !== 'play') return;
  const i = Number(el.dataset.i);
  if (!canAct(m)) return;
  const v = m.v, legal = v.legal;
  if (v.mustRemove) {
    if (legal.some((a) => a.type === 'remove' && a.at === i)) { sel = -1; dispatch({ type: 'remove', at: i }); }
    else { sfx.bad(); say('빛나는 상대 말 중에서 골라요 (밀에 들어 있는 말은 뺏을 수 없어요)'); }
    return;
  }
  if (v.toPlace[m.you] > 0) {
    if (legal.some((a) => a.type === 'place' && a.to === i)) dispatch({ type: 'place', to: i });
    else { sfx.bad(); say('말이 없는 빈 점을 눌러요'); }
    return;
  }
  if (sel >= 0 && legal.some((a) => a.type === 'move' && a.from === sel && a.to === i)) { const from = sel; sel = -1; dispatch({ type: 'move', from, to: i }); return; }
  if (legal.some((a) => a.type === 'move' && a.from === i)) {
    if (i === sel) sel = -1; else { sel = i; sfx.sel(); tutorialSignal('select'); }
    render(); say(hint(m));
    return;
  }
  if (v.board[i] === m.you + 1) { sfx.bad(); say('이 말은 지금 움직일 수 없어요 (이웃한 빈 점이 없어요)'); }
  else if (sel >= 0) { sel = -1; render(); }
});
addEventListener('keydown', (e) => { if (e.code === 'KeyM') toggleMute(); if (e.code === 'Escape') { sel = -1; render(); } });

// 내 동작 하나를 낸다 (컴퓨터 판은 바로 적용, 온라인은 서버로)
function dispatch(a) {
  const m = model();
  if (!canAct(m)) return;
  if (online()) { waitingNet = true; net.send('act', { action: a }); render(); return; }
  const ev = L.apply(st, a);
  if (!ev) return;
  afterMove(ev, true);
}
function signalMine(ev) {
  tutorialSignal(ev.type === 'remove' ? 'remove' : ev.type === 'move' ? 'move' : 'place');
  if (ev.mill) tutorialSignal('mill');
}
function afterMove(ev, mine) {
  lastMark = { from: ev.from, to: ev.to, at: ev.at };
  announce(ev);
  if (mine) signalMine(ev);
  sel = -1;
  render();
  if (!online()) {
    if (st.over) { overTimer = setTimeout(showOver, T.over); return; }
    if (st.turn !== cpuYou) scheduleCpu();
    else { const h = hint(model()); if (h) say(`${$('msg').textContent}\n${h}`); }
  }
}

// ---------- 컴퓨터 대전 ----------
function startCpu(level, you = 0) {
  leaveOnline();
  clearTimeout(cpuTimer); clearTimeout(overTimer);
  mode = level; cpuYou = you; st = L.newGame(); phase = 'play'; thinking = false; turnEnd = 0; sel = -1; lastMark = null; millHL = null;
  hideOverlay(); drawBoard(); render();
  say(`내 말은 ${SIDE_NAME[you]}색이에요. 말을 아홉 개씩 번갈아 놓아요\n${you === 0 ? '내가 먼저 놓아요' : '컴퓨터가 먼저 놓아요'} · 세 점을 한 줄로 만들면 상대 말을 뺏어요`);
  if (you === 1) scheduleCpu();
}
function scheduleCpu() { thinking = true; render(); cpuTimer = setTimeout(cpuTurn, T.cpu); }
function cpuTurn() {
  if (phase !== 'play' || !st || online() || st.over || st.turn === cpuYou) { thinking = false; render(); return; }
  const a = L.aiPick(st, mode === 'hard' || mode === 'normal' ? mode : 'easy');
  const ev = a && L.apply(st, a);
  thinking = false;
  if (!ev) { render(); return; }
  afterMove(ev, false);
}
const reasonText = { pieces: '말이 두 개로 줄어서 졌어요', blocked: '움직일 수 없어서(갇혀서) 졌어요', repetition: '같은 판이 세 번 나와 비겼어요', limit: '오래 승부가 안 나서 비겼어요' };
function showOver() {
  phase = 'over';
  const youWon = st.winner === cpuYou, draw = st.winner === 2;
  if (youWon) { wins++; store.set('morrisWins', String(wins)); sfx.win(); } else if (draw) sfx.draw(); else sfx.lose();
  const why = draw ? reasonText[st.reason] : (youWon ? (st.reason === 'pieces' ? '상대 말이 두 개로 줄었어요' : '상대가 움직일 수 없어요') : reasonText[st.reason]);
  const mineLeft = L.total(st, cpuYou), theirs = L.total(st, 1 - cpuYou);
  const next = 1 - cpuYou;
  showOverlay(`
    <h2>${draw ? '비겼어요! 🤝' : youWon ? '이겼어요! 🎉' : '아쉬워요! 😵'}</h2>
    <p>${esc(why || '')}</p>
    <dl class="stats card2"><dt>내 말</dt><dd>${mineLeft}개 남음</dd><dt>컴퓨터 말</dt><dd>${theirs}개 남음</dd><dt>둔 수</dt><dd>${st.plies}</dd></dl>
    <p>컴퓨터 상대 승리 <b>${wins}</b>번</p>
    <div class="col"><button data-act="again">다시 하기<small>이번엔 ${next === 0 ? '내가 먼저' : '컴퓨터가 먼저'} 놓아요</small></button><button class="sub" data-act="view">판 보기</button><button class="sub" data-act="home">처음으로</button></div>`);
  render();
}
function showTitle() {
  leaveOnline();
  clearTimeout(cpuTimer); clearTimeout(overTimer);
  mode = 'easy'; phase = 'title'; st = L.newGame(); cpuYou = 0; thinking = false; sel = -1; lastMark = null; millHL = null;
  drawBoard(); say(''); render();
  const on = loadJson(ONLINE_KEY);
  showOverlay(`
    <h1>아홉 말 모리스</h1>
    <p>세 점을 <b>한 줄</b>로 만들어 상대 말을 뺏어요!</p>
    <div class="card2" style="font-size:13px">① 말 아홉 개를 번갈아 <b>놓아요</b><br>② 다 놓으면 선을 따라 <b>한 칸씩 움직여요</b><br>세 점이 한 줄(밀)이면 상대 말 하나를 <b>뺏어요</b><br>말이 <b>세 개</b>가 되면 아무 데로나 <b>날 수</b> 있고, 두 개가 되거나 갇히면 져요</div>
    <div class="col"><button data-act="cpu" data-lv="easy">🤖 컴퓨터랑 · 쉬움</button><button class="sub" data-act="cpu" data-lv="normal">🤖 컴퓨터랑 · 보통</button><button class="sub" data-act="cpu" data-lv="hard">🤖 컴퓨터랑 · 어려움</button><button class="sub" data-act="online">🌐 온라인 대전${on.w || on.l ? ` · ${on.w || 0}승 ${on.l || 0}패` : ''}</button></div>`);
}

// ---------- 온라인: 연결 ----------
const net = {
  ws: null, pulse: null, outbox: [], retry: 0,
  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${location.pathname}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.raw('hello', { name: myName() });
      const s = loadSession();
      if (s) this.raw('resume', s);
      for (const [t, p] of this.outbox.splice(0)) this.raw(t, p);
      clearInterval(this.pulse);
      this.pulse = setInterval(() => this.raw('pulse'), 10000);
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onNet(m); };
    ws.onclose = () => {
      clearInterval(this.pulse);
      if (this.ws !== ws) return;
      this.ws = null;
      if (!online()) return;
      if (room || loadSession()) {
        netDown = true; waitingNet = false; render();
        setTimeout(() => { if (online()) this.connect(); }, Math.min(4000, 500 * 2 ** this.retry++));
      } else showOnline('서버와 연결이 끊겼어요. 다시 시도해 주세요.');
    };
  },
  send(t, p = {}) {
    if (this.ws && this.ws.readyState === 1) this.raw(t, p);
    else { this.outbox.push([t, p]); this.connect(); }
  },
  raw(t, p = {}) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t, ...p })); },
  close() {
    const ws = this.ws;
    this.ws = null; this.outbox = [];
    clearInterval(this.pulse);
    if (ws) ws.close();
  },
};

function onNet(m) {
  if (m.t === 'queued') showQueued();
  else if (m.t === 'room') applyRoom(m);
  else if (m.t === 'rejected') { waitingNet = false; render(); }
  else if (m.t === 'error') { room = null; saveSession(null); showOnline(m.msg); }
  else if (m.t === 'resumeFailed') {
    saveSession(null);
    if (room) { room = null; showOnline('대국이 끝나서 이어갈 수 없어요.'); }
    netDown = false; render();
  }
}

function leaveOnline() {
  if (!online()) return;
  net.send('leave'); net.close();
  saveSession(null);
  room = null; netDown = false; waitingNet = false; mode = 'easy'; phase = 'title'; sel = -1;
}

// ---------- 온라인: 대국 ----------
function applyRoom(r) {
  const prev = room;
  const fresh = !prev || prev.code !== r.code;
  const newGame = fresh || prev.games !== r.games;
  room = r;
  netDown = false; waitingNet = false;
  saveSession({ code: r.code, token: r.token });
  turnEnd = performance.now() + r.remain;
  if (newGame) { seenMove = r.lastMove ? r.lastMove.seq : 0; sel = -1; lastMark = null; millHL = null; say(''); }
  if (r.state === 'waiting') { phase = 'title'; showWaiting(); drawBoard(); render(); return; }
  phase = r.state === 'playing' ? 'play' : 'over';
  if (newGame) drawBoard();
  if (newGame && r.state === 'playing') { sfx.found(); say(`내 말은 ${SIDE_NAME[r.you]}색이에요\n${r.turn === r.you ? '내가 먼저 놓아요' : '상대가 먼저 놓아요'}`); }
  if (!($('overlay').dataset.screen === 'confirm') && r.state !== 'over') hideOverlay();
  const lm = r.lastMove;
  if (lm && lm.seq > seenMove && !newGame) {
    seenMove = lm.seq;
    lastMark = { from: lm.from, to: lm.to, at: lm.at };
    announce(Object.assign({}, lm));
    if (lm.who === r.you) signalMine(lm);
  }
  render();
  if (r.state === 'over') afterOver();
}
function afterOver() {
  const r = room;
  const key = `${r.code}:${r.games}:${r.reason}:${r.winner}`;
  if (recorded !== key) {
    recorded = key;
    const rec = loadJson(ONLINE_KEY);
    if (r.winner === r.you) { rec.w = (rec.w || 0) + 1; sfx.win(); } else if (r.winner === 2) sfx.draw(); else { rec.l = (rec.l || 0) + 1; sfx.lose(); }
    store.set(ONLINE_KEY, JSON.stringify(rec));
    setTimeout(() => { if (room && room.state === 'over') showResult(); }, T.over);
  } else if (overlayOpen()) showResult();
}

function showResult() {
  const r = room;
  const won = r.winner === r.you, draw = r.winner === 2;
  const why = {
    pieces: won ? '상대 말이 두 개로 줄었어요' : '내 말이 두 개로 줄었어요',
    blocked: won ? '상대가 움직일 수 없어요' : '움직일 수 없어서(갇혀서) 졌어요',
    repetition: reasonText.repetition,
    limit: reasonText.limit,
    resign: won ? '상대가 기권했어요' : '기권했어요',
    timeout: won ? '상대가 시간을 넘겼어요' : '시간을 넘겼어요',
    left: won ? '상대가 나갔어요' : '연결이 끊겨 패배했어요',
  }[r.reason] || '';
  const rec = loadJson(ONLINE_KEY);
  const opp = r.players.find((p) => p.color !== r.you);
  const iVoted = r.rematch.includes(r.you), theyVoted = opp && r.rematch.includes(opp.color);
  let again;
  if (!opp) again = '<p>상대가 방을 나갔어요</p>';
  else if (iVoted) again = '<p>상대를 기다리는 중…</p>';
  else again = `${theyVoted ? '<p>상대가 한 판 더 하고 싶어해요!</p>' : ''}<button data-act="rematch">한 판 더</button>`;
  showOverlay(`
    <h2>${draw ? '🤝 무승부' : won ? '🎉 승리!' : '😵 패배'}</h2>
    ${why ? `<p>${esc(why)}</p>` : ''}
    <p>내 말 ${countOn(r.board, r.you) + r.toPlace[r.you]}개 · 상대 말 ${countOn(r.board, 1 - r.you) + r.toPlace[1 - r.you]}개 남음</p>
    <span class="tag">온라인 ${rec.w || 0}승 ${rec.l || 0}패</span>
    <div class="col">${again}
      <div class="row"><button class="sub" data-act="view">판 보기</button><button class="sub" data-act="leave">나가기</button></div>
    </div>`);
}

function showOnline(error = '') {
  leaveOnline();
  clearTimeout(cpuTimer); clearTimeout(overTimer);
  mode = 'online'; phase = 'title'; room = null; st = L.newGame(); waitingNet = false; thinking = false; sel = -1; lastMark = null; millHL = null; drawBoard();
  say(''); render();
  showOverlay(`
    <h2>🌐 온라인 대전</h2>
    <input id="nameInput" maxlength="10" placeholder="내 이름 (최대 10자)" value="${esc(myName())}" autocomplete="off">
    <div class="col">
      <button data-act="quick">⚡ 빠른 대전</button>
      <button class="sub" data-act="create">방 만들기</button>
      <div class="row join"><input id="codeInput" maxlength="4" placeholder="방 코드" autocomplete="off" autocapitalize="characters"><button class="sub" data-act="join">들어가기</button></div>
    </div>
    <span class="error">${esc(error)}</span>
    <button class="back" data-act="home">← 처음으로</button>
    <p style="font-size:12.5px">한 번 둘 때마다 45초 · 먼저 하는 쪽은 한 판마다 바뀌어요</p>`);
}
function showQueued() {
  showOverlay(`
    <h2>상대를 찾는 중…</h2>
    <div class="dots"><span></span><span></span><span></span></div>
    <p>누군가 빠른 대전을 누르면 바로 시작해요</p>
    <button class="sub" data-act="cancel">취소</button>`);
}
const inviteUrl = () => `${location.origin}${location.pathname}?room=${room.code}`;
function showWaiting() {
  showOverlay(`
    <h2>친구를 기다리는 중…</h2>
    <p>방 코드</p>
    <div class="code">${esc(room.code)}</div>
    <p>친구가 <b>온라인 대전 → 들어가기</b>에<br>이 코드를 넣으면 시작해요</p>
    <button data-act="copy">🔗 초대 링크 복사</button>
    <button class="sub" data-act="cancel">취소</button>`);
}
function saveName() {
  const input = $('nameInput');
  if (!input) return;
  const name = input.value.trim().slice(0, 10);
  store.set('morrisName', name);
  net.send('hello', { name });
}
function confirmResign() {
  showOverlay(`<h2>기권할까요?</h2><p>이번 판은 패배로 기록돼요</p>
    <div class="row"><button data-act="close">계속하기</button><button class="sub" data-act="resign">🏳 기권</button></div>`);
  $('overlay').dataset.screen = 'confirm';
}

let lastCpu = 'easy';
$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  $('overlay').dataset.screen = '';
  const act = btn.dataset.act;
  if (act === 'cpu') { lastCpu = btn.dataset.lv; startCpu(lastCpu, 0); }
  else if (act === 'again') startCpu(lastCpu, 1 - cpuYou);
  else if (act === 'home') showTitle();
  else if (act === 'online') showOnline();
  else if (act === 'quick') { saveName(); net.send('quick'); }
  else if (act === 'create') { saveName(); net.send('create'); }
  else if (act === 'join') {
    const code = ($('codeInput').value || '').trim().toUpperCase();
    if (code.length !== 4) { $('overlay').querySelector('.error').textContent = '방 코드 4자리를 넣어 주세요.'; return; }
    saveName();
    net.send('join', { code });
  } else if (act === 'cancel') { net.send('cancel'); showOnline(); }
  else if (act === 'copy') {
    const url = inviteUrl();
    const done = () => { btn.textContent = '✅ 복사했어요'; setTimeout(() => { btn.textContent = '🔗 초대 링크 복사'; }, 1500); };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: '아홉 말 모리스 한 판 해요!', url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('링크를 복사하세요', url));
    else prompt('링크를 복사하세요', url);
  } else if (act === 'rematch') { net.send('rematch'); }
  else if (act === 'view') hideOverlay();
  else if (act === 'leave') showOnline();
  else if (act === 'resign') { net.send('resign'); hideOverlay(); }
  else if (act === 'close') hideOverlay();
});
$('overlay').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'codeInput') $('overlay').querySelector('[data-act="join"]').click();
  if (e.target.id === 'nameInput') $('overlay').querySelector('[data-act="quick"]').click();
  e.stopPropagation();
});
$('resignBtn').onclick = (e) => { e.currentTarget.blur(); if (online() && room && room.state === 'playing') confirmResign(); };
setInterval(() => { if (online() && room && room.state === 'playing' && !netDown) renderHud(); }, 500);

// ---------- 시작 ----------
const invite = new URLSearchParams(location.search).get('room');
if (invite) { try { window.history.replaceState(null, '', location.pathname); } catch (_) {} }
function joinInvite(code) { showOnline(); net.send('join', { code: code.toUpperCase() }); }
if (loadSession()) {
  mode = 'online';
  st = L.newGame(); render();
  showOverlay('<h2>대국으로 돌아가는 중…</h2>');
  net.connect();
  const until = setInterval(() => {
    if (room || !loadSession()) { clearInterval(until); if (!room) invite ? joinInvite(invite) : showOnline(); }
  }, 100);
} else if (invite) joinInvite(invite);
else showTitle();

/* @test-hooks:start */
window.__mr = { get st() { return st; }, get mode() { return mode; }, get phase() { return phase; }, get room() { return room; }, get sel() { return sel; }, get thinking() { return thinking; }, T, dispatch, startCpu, render, model, L };
/* @test-hooks:end */
})();
