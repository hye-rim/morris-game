'use strict';

// 아홉 말 모리스 규칙·컴퓨터 시험. 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../public/logic.js');

// 고정 난수 (확률이 걸린 시험은 항상 같은 결과가 나오게)
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 판을 직접 꾸민다: p0/p1 = 각자 판 위의 점 번호, 남은 말 수와 차례
function setup(p0, p1, toPlace = [0, 0], turn = 0) {
  const g = L.newGame();
  p0.forEach((i) => { g.board[i] = 1; });
  p1.forEach((i) => { g.board[i] = 2; });
  g.toPlace = toPlace.slice();
  g.turn = turn;
  return g;
}
const place = (g, to) => L.apply(g, { type: 'place', to });
const move = (g, from, to) => L.apply(g, { type: 'move', from, to });
const remove = (g, at) => L.apply(g, { type: 'remove', at });

test('board shape: 24 points, neighbor counts, 16 mills with every point in two', () => {
  assert.strictEqual(L.ADJ.length, 24);
  assert.deepStrictEqual(L.ADJ.map((a) => a.length), [2, 3, 2, 3, 2, 3, 2, 3, 2, 4, 2, 4, 2, 4, 2, 4, 2, 3, 2, 3, 2, 3, 2, 3]);
  L.ADJ.forEach((list, i) => list.forEach((j) => assert.ok(L.ADJ[j].includes(i), 'neighbors are mutual')));
  assert.strictEqual(L.MILLS.length, 16);
  for (let i = 0; i < 24; i++) assert.strictEqual(L.MILLS.filter((m) => m.includes(i)).length, 2, `point ${i}`);
  for (const m of L.MILLS) { assert.strictEqual(m.length, 3); assert.strictEqual(new Set(m).size, 3); }
});

test('new game: empty board, 9 pieces each, first player to place', () => {
  const g = L.newGame();
  assert.ok(g.board.every((v) => v === 0));
  assert.deepStrictEqual(g.toPlace, [9, 9]);
  assert.strictEqual(g.turn, 0);
  assert.strictEqual(L.legalActions(g).length, 24);
  assert.ok(L.legalActions(g).every((a) => a.type === 'place'));
});

test('placing alternates the turn, refuses occupied and bad points, and no moves while pieces remain', () => {
  const g = L.newGame();
  assert.ok(place(g, 0));
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(g.toPlace[0], 8);
  assert.strictEqual(place(g, 0), null, 'occupied');
  for (const bad of [{ type: 'place', to: -1 }, { type: 'place', to: 24 }, { type: 'place', to: 1.5 }, { type: 'place', to: '3' }, { type: 'place' }, { type: 'move', from: 0, to: 1 }, { type: 'remove', at: 0 }, { type: 'x' }, {}, null, undefined, 4]) {
    assert.strictEqual(L.apply(g, bad), null);
  }
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(move(g, 0, 1), null, 'cannot move during the placing phase');
});

test('three in a row makes a mill: the same player must then remove a piece', () => {
  const g = L.newGame();
  place(g, 0); place(g, 8); place(g, 1); place(g, 10);
  const ev = place(g, 2);                                    // 0-1-2 가 바깥 윗변
  assert.deepStrictEqual(ev.mill, [0, 1, 2]);
  assert.strictEqual(g.mustRemove, true);
  assert.strictEqual(g.turn, 0, 'still the same player');
  assert.ok(L.legalActions(g).every((a) => a.type === 'remove'));
  assert.strictEqual(place(g, 3), null, 'must remove first');
  const r = remove(g, 8);
  assert.ok(r);
  assert.strictEqual(g.board[8], 0);
  assert.strictEqual(g.mustRemove, false);
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(L.total(g, 1), 8, 'one of the nine is gone');
});

test('the lines across the squares are mills too', () => {
  const g = setup([1, 9], [0, 2, 4], [7, 6], 0);
  const ev = place(g, 17);
  assert.deepStrictEqual(ev.mill, [1, 9, 17]);
  const h = setup([3, 11], [0, 2, 4], [7, 6], 0);
  assert.deepStrictEqual(place(h, 19).mill, [3, 11, 19]);
});

test('removing: only opponent pieces, and not ones in a mill unless all are in mills', () => {
  const g = setup([0, 1, 5], [8, 9, 10, 20], [6, 5], 0);      // 상대 8-9-10 은 밀, 20 은 밀 밖
  place(g, 2);                                               // 0-1-2 밀 완성
  assert.strictEqual(g.mustRemove, true);
  assert.strictEqual(remove(g, 0), null, 'own piece');
  assert.strictEqual(remove(g, 3), null, 'empty point');
  assert.strictEqual(remove(g, 8), null, 'piece in a mill while another is free');
  assert.deepStrictEqual(L.legalActions(g).map((a) => a.at), [20]);
  assert.ok(remove(g, 20));
  const h = setup([0, 1, 5], [8, 9, 10], [6, 6], 0);          // 상대 말이 모두 밀 안이면 그 중 아무거나
  place(h, 2);
  assert.deepStrictEqual(L.legalActions(h).map((a) => a.at).sort((x, y) => x - y), [8, 9, 10]);
  assert.ok(remove(h, 9));
});

test('moving phase: one step along a line, no jumps, no occupied target', () => {
  const g = setup([0, 4, 12, 18], [1, 3, 14, 22, 23], [0, 0], 0);
  assert.strictEqual(move(g, 0, 2), null, 'not adjacent');
  assert.strictEqual(move(g, 0, 1), null, 'occupied');
  assert.strictEqual(move(g, 2, 3), null, 'not your piece');
  assert.strictEqual(move(g, 0, 7).type, 'move');
  assert.strictEqual(g.board[0], 0);
  assert.strictEqual(g.board[7], 1);
  assert.strictEqual(g.turn, 1);
  const h = setup([1, 12, 14, 18], [3, 5, 7, 21, 22], [0, 0], 0);   // 가운데 변 점(1)은 안쪽으로도 이어진다
  assert.ok(move(h, 1, 9));
  assert.strictEqual(L.ADJ[1].includes(9), true);
});

test('with only three pieces left a player may fly to any empty point', () => {
  const g = setup([0, 12, 20], [1, 3, 5, 14, 22], [0, 0], 0);
  assert.strictEqual(L.canFly(g, 0), true);
  assert.ok(move(g, 0, 16), 'jumps across the board');
  const h = setup([0, 12, 20, 4], [1, 3, 5, 14, 22], [0, 0], 0);   // 네 개면 못 난다
  assert.strictEqual(L.canFly(h, 0), false);
  assert.strictEqual(move(h, 0, 16), null);
});

test('closing a mill again by moving out and back removes another piece', () => {
  const g = setup([0, 1, 2, 12, 20], [8, 10, 14, 22, 23], [0, 0], 0);   // 0-1-2 는 이미 밀 (놓을 때 뗐다고 가정)
  assert.ok(move(g, 2, 3));                                  // 밀을 열고
  move(g, 8, 9);                                             // 상대가 둠
  assert.ok(move(g, 3, 2).mill, 'closing it again is a new mill');
  assert.strictEqual(g.mustRemove, true);
});

test('reducing the opponent to two pieces wins', () => {
  const g = setup([0, 1, 3, 14], [8, 10, 20], [0, 0], 0);       // 3 번 말을 2 번으로 옮기면 바깥 윗변 밀
  const ev = move(g, 3, 2);
  assert.ok(ev.mill);
  const r = remove(g, 8);
  assert.strictEqual(r.over, true);
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.reason, 'pieces');
  assert.strictEqual(L.apply(g, { type: 'move', from: 14, to: 15 }), null, 'nothing after the end');
  assert.deepStrictEqual(L.legalActions(g), []);
});

test('a player who cannot move loses, unless down to three pieces and able to fly', () => {
  // 두 번째 사람 말 4개가 바깥 네모 모서리(0,2,4,6)에 있고 첫 번째 사람이 변 가운데(1,3,5,7)를 모두 막고 있다
  const g = setup([1, 3, 5, 7, 12], [0, 2, 4, 6], [0, 0], 0);
  assert.ok(move(g, 12, 13), 'first player makes any move');
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.reason, 'blocked');
  // 세 개면 날 수 있으니 갇혀 있어도 지지 않는다
  const f = setup([1, 3, 5, 7, 12], [0, 2, 6], [0, 0], 0);
  assert.ok(move(f, 12, 13));
  assert.strictEqual(f.over, false);
  assert.strictEqual(L.canFly(f, 1), true);
  assert.ok(L.legalActions(f).length > 0);
});

test('threefold repetition is a draw', () => {
  const g = setup([0, 12, 14, 20], [4, 10, 16, 22], [0, 0], 0);
  g.seen = {};
  const cycle = [[0, 7], [4, 3], [7, 0], [3, 4]];
  let guard = 0;
  while (!g.over && guard < 40) { const [f, t] = cycle[guard % 4]; assert.ok(move(g, f, t)); guard++; }
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.winner, 2);
  assert.strictEqual(g.reason, 'repetition');
});

test('a long stretch with no placing or removing is a draw', () => {
  const g = setup([0, 12, 14, 20], [4, 10, 16, 22], [0, 0], 0);
  g.quiet = L.QUIET_LIMIT - 1;
  move(g, 0, 7);
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.reason, 'limit');
  assert.strictEqual(g.winner, 2);
});

test('random games always end, only legal actions apply, and pieces are conserved', () => {
  const rng = seeded(2026);
  for (let k = 0; k < 60; k++) {
    const g = L.newGame();
    let guard = 0, removed = [0, 0];
    while (!g.over && guard++ < 2000) {
      const acts = L.legalActions(g);
      assert.ok(acts.length > 0, 'a game in progress always has an action');
      const a = acts[Math.floor(rng() * acts.length)];
      const who = g.turn;
      const ev = L.apply(g, a);
      assert.ok(ev, `legal ${JSON.stringify(a)}`);
      if (a.type === 'remove') removed[1 - who]++;
      assert.strictEqual(L.total(g, 0) + removed[0], 9);
      assert.strictEqual(L.total(g, 1) + removed[1], 9);
    }
    assert.ok(g.over, 'every game ends');
    assert.ok([0, 1, 2].includes(g.winner));
  }
});

test('computer returns only legal actions', () => {
  const rng = seeded(8);
  for (const level of ['easy', 'normal', 'hard']) {
    for (let k = 0; k < 12; k++) {
      const g = L.newGame();
      for (let i = 0; i < Math.floor(rng() * 30) && !g.over; i++) { const acts = L.legalActions(g); L.apply(g, acts[Math.floor(rng() * acts.length)]); }
      if (g.over) continue;
      const a = L.aiPick(g, level, rng);
      assert.ok(L.apply(L.clone(g), a), `${level} gave a legal action`);
    }
  }
});

test('hard computer closes a mill it can close and blocks one it must block', () => {
  const noSlip = () => 0.99;
  const close = setup([0, 1], [8, 9], [7, 7], 0);               // 내(첫 번째) 0-1 에 2 를 놓으면 밀 (상대 8-9 도 열려 있지만 내가 먼저 완성)
  assert.deepStrictEqual(L.aiPick(close, 'hard', noSlip), { type: 'place', to: 2 });
  const block = setup([0, 12], [8, 9], [7, 7], 0);              // 상대 8-9 의 세 번째 점 10 을 막아야 한다
  assert.deepStrictEqual(L.aiPick(block, 'hard', noSlip), { type: 'place', to: 10 });
});

test('hard computer takes a loose piece when it closes a mill', () => {
  const noSlip = () => 0.99;
  const g = setup([0, 1, 12], [8, 9, 10, 20], [1, 4], 0);    // 0-1-2 를 완성한 뒤 뗄 때는 밀 밖의 20 을 골라야 함
  const ev = L.apply(g, L.aiPick(g, 'hard', noSlip));
  assert.ok(ev.mill);
  const r = L.aiPick(g, 'hard', noSlip);
  assert.strictEqual(r.type, 'remove');
  assert.strictEqual(r.at, 20);
});

test('hard computer beats easy in most seeded games (both seats)', () => {
  const rng = seeded(31337);
  let hardWins = 0, games = 12;
  for (let k = 0; k < games; k++) {
    const g = L.newGame();
    const hardSide = k % 2;
    let guard = 0;
    while (!g.over && guard++ < 1000) assert.ok(L.apply(g, L.aiPick(g, g.turn === hardSide ? 'hard' : 'easy', rng)));
    if (g.winner === hardSide) hardWins++;
  }
  assert.ok(hardWins >= 9, `hard won ${hardWins}/${games}`);
});
