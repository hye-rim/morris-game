'use strict';
// 아홉 말 모리스: 규칙과 컴퓨터. 화면 없이 Node 에서 시험한다 (브라우저에서는 전역 LOGIC_MORRIS).
// 점 24개: 바깥(0~7) · 가운데(8~15) · 안쪽(16~23) 네모. 네모마다 0 왼쪽 위, 1 위 가운데, 2 오른쪽 위, 3 오른쪽 가운데, 4 오른쪽 아래, 5 아래 가운데, 6 왼쪽 아래, 7 왼쪽 가운데.
// 칸 값 0 비어 있음, 1 첫 번째 사람 말, 2 두 번째 사람 말.
const LOGIC_MORRIS = (() => {
  const N = 24, START = 9;
  const HARD_SLIP = 0.2;             // 어려움도 다섯 번에 한 번쯤은 쉬움처럼 둔다 (사람이 이길 수 있게)
  const DEPTH = { easy: 1, hard: 4 };
  const MAX_PLIES = 300;             // 끝없이 도는 판을 막는 안전장치 (무승부)
  const QUIET_LIMIT = 60;            // 말을 놓거나 떼는 일 없이 이만큼 지나면 무승부

  // 이웃: 같은 네모의 앞뒤 점, 그리고 변 가운데(홀수) 점은 안팎 네모의 같은 점과 이어진다
  const ADJ = [];
  for (let i = 0; i < N; i++) {
    const sq = Math.floor(i / 8), k = i % 8, list = [sq * 8 + (k + 1) % 8, sq * 8 + (k + 7) % 8];
    if (k % 2 === 1) { if (sq > 0) list.push((sq - 1) * 8 + k); if (sq < 2) list.push((sq + 1) * 8 + k); }
    ADJ.push(list);
  }
  // 밀(세 점 한 줄): 네모마다 변 4개, 그리고 안팎을 가로지르는 선 4개 = 16개
  const MILLS = [];
  for (let sq = 0; sq < 3; sq++) for (let s = 0; s < 4; s++) MILLS.push([sq * 8 + s * 2, sq * 8 + s * 2 + 1, sq * 8 + (s * 2 + 2) % 8]);
  for (const k of [1, 3, 5, 7]) MILLS.push([k, 8 + k, 16 + k]);
  const MILLS_OF = Array.from({ length: N }, (_, i) => MILLS.filter((m) => m.includes(i)));

  function newGame() {
    return { board: new Array(N).fill(0), toPlace: [START, START], turn: 0, mustRemove: false, plies: 0, quiet: 0, over: false, winner: -1, reason: '', seen: {} };
  }
  const clone = (g) => ({ board: g.board.slice(), toPlace: g.toPlace.slice(), turn: g.turn, mustRemove: g.mustRemove, plies: g.plies, quiet: g.quiet, over: g.over, winner: g.winner, reason: g.reason, seen: null });
  const onBoard = (g, p) => { let n = 0; for (let i = 0; i < N; i++) if (g.board[i] === p + 1) n++; return n; };
  const total = (g, p) => onBoard(g, p) + g.toPlace[p];
  const canFly = (g, p) => g.toPlace[p] === 0 && onBoard(g, p) === 3;
  const millAt = (board, i, v) => MILLS_OF[i].find((m) => m.every((j) => board[j] === v)) || null;
  const inMill = (board, i) => !!board[i] && !!millAt(board, i, board[i]);
  // 뗄 수 있는 상대 말: 밀에 들어 있지 않은 말, 전부 밀에 들어 있으면 아무 말이나
  function removable(g, opp) {
    const all = [], free = [];
    for (let i = 0; i < N; i++) if (g.board[i] === opp + 1) { all.push(i); if (!inMill(g.board, i)) free.push(i); }
    return free.length ? free : all;
  }
  function movesOf(g, p) {                        // 움직이는 단계에서 p 가 둘 수 있는 [출발, 도착]
    const out = [], fly = canFly(g, p);
    for (let i = 0; i < N; i++) if (g.board[i] === p + 1) {
      if (fly) { for (let j = 0; j < N; j++) if (!g.board[j]) out.push([i, j]); }
      else for (const j of ADJ[i]) if (!g.board[j]) out.push([i, j]);
    }
    return out;
  }
  // 지금 둘 수 있는 동작 목록
  function legalActions(g) {
    const out = [];
    if (g.over) return out;
    if (g.mustRemove) { for (const at of removable(g, 1 - g.turn)) out.push({ type: 'remove', at }); return out; }
    if (g.toPlace[g.turn] > 0) { for (let i = 0; i < N; i++) if (!g.board[i]) out.push({ type: 'place', to: i }); return out; }
    for (const [from, to] of movesOf(g, g.turn)) out.push({ type: 'move', from, to });
    return out;
  }

  function finish(g, winner, reason) { g.over = true; g.winner = winner; g.reason = reason; }
  function endTurn(g) {
    g.turn = 1 - g.turn;
    const p = g.turn;
    if (g.toPlace[p] === 0 && !canFly(g, p) && movesOf(g, p).length === 0) { finish(g, 1 - p, 'blocked'); return; }
    if (g.seen && g.toPlace[0] === 0 && g.toPlace[1] === 0) {
      const key = g.board.join('') + g.turn;
      g.seen[key] = (g.seen[key] || 0) + 1;
      if (g.seen[key] >= 3) { finish(g, 2, 'repetition'); return; }
    }
    if (g.quiet >= QUIET_LIMIT) finish(g, 2, 'limit');
    else if (g.plies >= MAX_PLIES) finish(g, 2, 'limit');
  }

  // 한 동작을 둔다: { type:'place', to } · { type:'move', from, to } · { type:'remove', at }. 규칙에 맞지 않으면 null
  function apply(g, a) {
    if (!a || g.over || typeof a !== 'object') return null;
    const who = g.turn, me = who + 1, opp = 2 - who, b = g.board;
    const pt = (v) => Number.isInteger(v) && v >= 0 && v < N;
    if (g.mustRemove) {
      if (a.type !== 'remove' || !pt(a.at) || b[a.at] !== opp || !removable(g, 1 - who).includes(a.at)) return null;
      b[a.at] = 0; g.mustRemove = false; g.plies++; g.quiet = 0;
      if (total(g, 1 - who) <= 2) { finish(g, who, 'pieces'); return { who, type: 'remove', at: a.at, mill: null, over: true, winner: who }; }
      endTurn(g);
      return { who, type: 'remove', at: a.at, mill: null, over: g.over, winner: g.winner };
    }
    let to, from = -1;
    if (a.type === 'place') {
      if (g.toPlace[who] <= 0 || !pt(a.to) || b[a.to]) return null;
      to = a.to; b[to] = me; g.toPlace[who]--; g.quiet = 0;
    } else if (a.type === 'move') {
      if (g.toPlace[who] > 0 || !pt(a.from) || !pt(a.to) || b[a.from] !== me || b[a.to]) return null;
      if (!canFly(g, who) && !ADJ[a.from].includes(a.to)) return null;
      from = a.from; to = a.to; b[from] = 0; b[to] = me; g.quiet++;
    } else return null;
    g.plies++;
    const mill = millAt(b, to, me);
    if (mill) { g.mustRemove = true; return { who, type: a.type, from, to, mill, over: false, winner: -1 }; }
    endTurn(g);
    return { who, type: a.type, from, to, mill: null, over: g.over, winner: g.winner };
  }

  // ---------- 컴퓨터 ----------
  function evaluate(g, me) {
    if (g.over) return g.winner === me ? 100000 : g.winner === 2 ? 0 : -100000;
    const opp = 1 - me, v = me + 1, o = opp + 1;
    let s = (total(g, me) - total(g, opp)) * 100;
    for (const m of MILLS) {
      let a = 0, c = 0, e = 0;
      for (const i of m) { if (g.board[i] === v) a++; else if (g.board[i] === o) c++; else e++; }
      if (a === 3) s += 12; else if (c === 3) s -= 12;
      else if (a === 2 && e === 1) s += 9; else if (c === 2 && e === 1) s -= 9;
    }
    if (g.toPlace[0] === 0 && g.toPlace[1] === 0) s += (movesOf(g, me).length - movesOf(g, opp).length) * 2;
    else for (let i = 0; i < N; i++) if (g.board[i]) s += (g.board[i] === v ? 1 : -1) * ADJ[i].length;   // 놓는 단계: 길이 많은 점이 유리
    return s;
  }
  // 밀을 만드는 수와 떼는 수를 먼저 살펴 가지치기를 돕는다
  function ordered(g) {
    const acts = legalActions(g), me = g.turn + 1;
    const key = (a) => {
      if (a.type === 'remove') return 50 + (MILLS_OF[a.at].some((m) => m.filter((j) => g.board[j] === 2 - g.turn).length >= 2) ? 20 : 0);
      const to = a.to; let k = 0;
      const b = g.board.slice(); if (a.type === 'move') b[a.from] = 0; b[to] = me;
      if (millAt(b, to, me)) k += 100;
      if (MILLS_OF[to].some((m) => m.filter((j) => g.board[j] === 3 - me).length === 2 && m.every((j) => g.board[j] !== me))) k += 40;   // 상대 밀 길목 막기
      return k + ADJ[to].length;
    };
    return acts.map((a) => ({ a, k: key(a) })).sort((x, y) => y.k - x.k).map((x) => x.a);
  }
  function search(g, depth, alpha, beta, me) {
    if (g.over || depth === 0) return evaluate(g, me);
    const maximizing = g.turn === me;
    let best = maximizing ? -Infinity : Infinity;
    for (const a of ordered(g)) {
      const c = clone(g);
      apply(c, a);
      const v = search(c, depth - 1, alpha, beta, me);
      if (maximizing) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
      if (beta <= alpha) break;
    }
    return best;
  }
  function easyPick(g, rng) {
    const acts = legalActions(g);
    const mills = acts.filter((a) => a.type !== 'remove' && (() => { const c = clone(g); const ev = apply(c, a); return ev && ev.mill; })());
    if (mills.length && rng() < 0.8) return mills[Math.floor(rng() * mills.length)];       // 밀을 만들 수 있으면 대체로 만든다 (막는 건 안 한다)
    return acts[Math.floor(rng() * acts.length)];
  }
  function aiPick(g, level = 'easy', rng = Math.random) {
    const acts = legalActions(g);
    if (!acts.length) return null;
    if (acts.length === 1) return acts[0];
    if (level !== 'hard' || rng() < HARD_SLIP) return easyPick(g, rng);
    const me = g.turn;
    let best = acts[0], bestV = -Infinity;
    for (const a of ordered(g)) {
      const c = clone(g);
      apply(c, a);
      const v = search(c, DEPTH.hard - 1, -Infinity, Infinity, me);
      if (v > bestV) { bestV = v; best = a; }
    }
    return best;
  }

  return { N, START, HARD_SLIP, DEPTH, MAX_PLIES, QUIET_LIMIT, ADJ, MILLS, newGame, clone, onBoard, total, canFly, millAt, inMill, removable, movesOf, legalActions, apply, aiPick };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_MORRIS;
