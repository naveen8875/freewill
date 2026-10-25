/* Little Worlds — Birth of a Civilization pack.
   Builds on the base, plus, village layers. Adds:
   · Building states (any sprite): decay 1 (weathered) / 2 (abandoned, boarded, overgrown), burning (flames, black smoke, glow), faction flags.
   · Civic assets: lean-to, raft, hut, palisade, gate, granary, pact stone, notice board, stocks, jail, courthouse, ballot booth,
     campaign poster, tally board, parliament, leader statue (standing / toppled), barricade, library, clock tower, monument,
     faction flag, grave, crow.
   · Roles on villagers: settler, crown, sash, sage, judge, thief, rebel, prisoner, scholar · held items: torch, sign, flag, spear, scroll, sack · faction armbands.
   · Lenses: politics overlay (faction territory) and per-chapter colour grade.
   · Aster: one valley told in eight chapters, each with a staged scene (crime & trial, election / coronation / council, rallies, revolution...). */
(function () {
  'use strict';
  const LW = window.LW, A = LW.Assets, C = A.C, T = A.T, def = A.def, { R, P, disc, oval, line, roof, grid } = A.draw, ROOFS = A.ROOFS;
  const pick = a => a[(Math.random() * a.length) | 0];
  const FAC = [
    { name: 'Hearth', c: C.c500, em: ['.x.', 'xxx', '.x.'] },
    { name: 'River League', c: C.l500, em: ['x.x', '.x.', 'x.x'] },
    { name: 'The Crown', c: C.sun2, em: ['x.x', 'xxx', 'xxx'] },
    { name: 'Free Folk', c: C.b500, em: ['xx.', 'xxx', 'xx.'] }
  ];
  LW.FACTIONS = FAC;
  const emblem = (g, x, y, f, c) => grid(g, FAC[f].em, { x: c || C.s50 }, x, y);

  /* ================= bubbles ================= */
  Object.assign(A.ICONS, {
    crown: [C.sun2, ['.......', 'x.x.x.x', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '.......']],
    scales: [C.co600, ['...x...', 'xxxxxxx', 'x..x..x', 'x..x..x', 'xx.x.xx', '..xxx..']],
    fist: [C.b500, ['.xxxx..', 'xxxxxx.', 'xxxxxxx', '.xxxxxx', '..xxxx.', '..xxx..']],
    vote: [C.p500, ['......x', '.....x.', 'x...x..', '.x.x...', '..x....', '.......']],
    fire: [C.c400, ['...x...', '..xx...', '..xxx..', '.xxxxx.', '.xxxxx.', '..xxx..']],
    scroll: [C.w2, ['xxxxxx.', '.x...x.', '.xxxxx.', '.x...x.', '.xxxxx.', 'xxxxxx.']],
    shield: [C.k500, ['xxxxxxx', 'x.....x', 'x..x..x', '.x...x.', '..x.x..', '...x...']],
    loot: [C.w1, ['..xxx..', '...x...', '.xxxxx.', 'xxx.xxx', 'xxxxxxx', '.xxxxx.']],
    heartbreak: [C.b400, ['.xx.xx.', 'xx.x.xx', 'x..x..x', '.x.x.x.', '..x.x..', '...x...']]
  });
  ['crown', 'scales', 'fist', 'vote', 'fire', 'scroll', 'shield', 'loot', 'heartbreak'].forEach(k => def('icon_' + k, { name: k[0].toUpperCase() + k.slice(1), cat: 'icon', box: [7, 6], outline: false, draw(g) { grid(g, A.ICONS[k][1], { x: A.ICONS[k][0] }); } }));

  /* ================= building states ================= */
  A.decayFx = function (c, level, seed) {
    const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), a = d.data, rnd = A.rng(A.hashStr(seed + 'decay')), op = i => a[i * 4 + 3] > 128;
    const glassy = (r, gg, b) => (Math.abs(r - 47) < 12 && Math.abs(gg - 95) < 12 && Math.abs(b - 99) < 12) || (r > 240 && gg > 200 && b < 200);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (a[i + 3] < 128) continue;
      let r = a[i], gg = a[i + 1], b = a[i + 2];
      if (level >= 2 && glassy(r, gg, b)) { const pl = (x + y * 2) % 5 < 2 ? [90, 58, 30] : [168, 112, 63]; r = pl[0]; gg = pl[1]; b = pl[2]; }
      const l = r * .3 + gg * .59 + b * .11, k = level >= 2 ? .45 : .22, dk = 1 - .08 * level;
      a[i] = (r * (1 - k) + l * k) * dk; a[i + 1] = (gg * (1 - k) + l * k) * dk; a[i + 2] = (b * (1 - k) + l * k) * dk * .97;
    }
    const top = []; for (let x = 0; x < w; x++) { top[x] = -1; for (let y = 0; y < h; y++) if (op(y * w + x)) { top[x] = y; break; } }
    for (let n = 0; n < level * 5; n++) { const x = 2 + Math.floor(rnd() * (w - 4)); if (top[x] < 0) continue; const y = top[x] + 2 + Math.floor(rnd() * h * .25); for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2 + level; dx++) { const j = (y + dy) * w + x + dx; if (y + dy < h && x + dx < w && op(j)) { a[j * 4] = 42; a[j * 4 + 1] = 31; a[j * 4 + 2] = 22; } } }
    for (let n = 0; n < 3 + level * 5; n++) {
      let x = 1 + Math.floor(rnd() * (w - 2)), y = h - 2; while (y > 0 && !op(y * w + x)) y--;
      const len = Math.floor(h * (.15 + rnd() * .3 * level));
      for (let s = 0; s < len && y > 0; s++, y--) { if (s % 3 === 2) x += rnd() < .5 ? -1 : 1; const j = y * w + x; if (x < 0 || x >= w || !op(j)) break; const c2 = rnd() < .5 ? [79, 142, 54] : [56, 104, 36]; a[j * 4] = c2[0]; a[j * 4 + 1] = c2[1]; a[j * 4 + 2] = c2[2]; }
    }
    g.putImageData(d, 0, 0);
  };

  /* ================= primitive age ================= */
  def('leanto', { name: 'Lean-to', cat: 'civic', foot: [1, 1], box: [22, 18, 11, 17], solid: true, desc: 'Branches, leaves, optimism.',
    draw(g) { line(g, 2, 17, 12, 2, C.w3, 2); line(g, 20, 17, 12, 2, C.w3); for (let i = 0; i < 12; i++) { const y = 4 + i, x0 = 12 - i * .8, x1 = 12 + i * .55; R(g, x0, y, x1 - x0, 1, i % 3 ? C.p500 : C.p600); } for (let k = 0; k < 10; k++) P(g, 5 + (k * 7) % 12, 6 + (k * 5) % 10, C.p400); R(g, 9, 14, 8, 3, C.k300); R(g, 9, 14, 2, 3, C.s200); } });
  def('raft', { name: 'Settler Raft', cat: 'civic', foot: [2, 1], box: [36, 30, 18, 27], on: 'water', bob: true, desc: 'How everyone got here.',
    draw(g) { for (let i = 0; i < 5; i++) { R(g, 3 + i * 6, 20, 6, 8, i % 2 ? C.w2 : C.w1); R(g, 3 + i * 6, 20, 6, 1, C.w1); P(g, 4 + i * 6, 23, C.w3); } R(g, 2, 22, 32, 1, C.w4); R(g, 2, 26, 32, 1, C.w4); R(g, 17, 1, 2, 20, C.w3);
      for (let i = 0; i < 14; i++) { const w = 3 + Math.round(i * .9); R(g, 19, 3 + i, w, 1, i % 4 === 3 ? C.s300 : C.s200); } R(g, 21, 8, 3, 3, C.s400); P(g, 27, 12, C.s400); R(g, 7, 17, 4, 3, C.w2); R(g, 26, 17, 3, 3, C.co400); } });
  def('hut', { name: 'Hut', cat: 'civic', foot: [2, 2], box: [34, 36, 17, 35], solid: true, home: 2, variants: 2, litable: true, lights: [{ x: 0, y: -7, r: 18, mode: 'win' }], desc: 'Mud, straw and a door that sticks.',
    draw(g, o) { const wl = o.v ? '#D9B98C' : C.s300; oval(g, 17, 27, 14, 8, C.w2); R(g, 4, 20, 26, 12, wl); oval(g, 17, 32, 13, 3, wl); for (let y = 22; y < 32; y += 4) R(g, 4, y, 26, 1, A.shade(wl, .9)); R(g, 13, 24, 8, 11, C.ink2); R(g, 14, 23, 6, 1, C.ink2); if (o.lit) { R(g, 14, 30, 6, 5, C.c500); P(g, 16, 31, C.glow); }
      for (let i = 0; i < 18; i++) { const w = Math.round(4 + i * 1.75); for (let x = 0; x < w; x++) P(g, 17 - w / 2 + x, 2 + i, (x + i) % 4 === 0 ? '#B98227' : i > 15 ? C.sun2 : C.sun); } R(g, 15, 0, 4, 3, C.w3); } });
  def('palisade', { name: 'Palisade', cat: 'civic', foot: [1, 1], box: [16, 24, 8, 23], solid: true,
    draw(g) { [[1, 3], [6, 0], [11, 2]].forEach(([x, y]) => { R(g, x, y + 2, 4, 22 - y, C.w2); R(g, x, y + 2, 1, 22 - y, C.w1); R(g, x + 1, y, 2, 2, C.w2); P(g, x + 1, y, C.w1); }); R(g, 0, 15, 16, 2, C.w3); } });
  def('gate', { name: 'Gate', cat: 'civic', foot: [2, 1], box: [34, 30, 17, 29],
    draw(g) { R(g, 1, 2, 4, 28, C.w3); R(g, 29, 2, 4, 28, C.w3); R(g, 0, 2, 34, 3, C.w2); R(g, 0, 2, 34, 1, C.w1); R(g, 5, 7, 4, 22, C.w2); R(g, 25, 7, 4, 22, C.w2); P(g, 2, 0, C.w2); P(g, 31, 0, C.w2); R(g, 14, 0, 6, 2, C.sun2); } });
  def('granary', { name: 'Granary', cat: 'civic', foot: [2, 2], box: [34, 42, 17, 41], solid: true, store: true, desc: 'Counts the harvest, then counts it again.',
    draw(g) { [7, 16, 25].forEach(x => R(g, x, 32, 2, 10, C.w3)); R(g, 5, 31, 24, 2, C.w2); R(g, 6, 16, 22, 15, C.s300); for (let y = 18; y < 31; y += 4) R(g, 6, y, 22, 1, C.w2); R(g, 24, 16, 4, 15, C.s400); R(g, 14, 22, 6, 8, C.w3);
      for (let i = 0; i < 15; i++) { const w = Math.round(2 + i * 1.8); R(g, 17 - w / 2, 2 + i, w, 1, i > 12 ? C.sun2 : C.sun); } line(g, 20, 33, 23, 41, C.w2); line(g, 24, 33, 27, 41, C.w2); for (let y = 35; y < 41; y += 2) R(g, 21 + (y - 33) * .37, y, 4, 1, C.w2); } });
  def('pactstone', { name: 'Pact Stone', cat: 'civic', foot: [1, 1], box: [18, 32, 9, 31], solid: true, litable: true, plazaOk: true, visit: true, lights: [{ x: 0, y: -16, r: 30, mode: 'rune' }], desc: 'Every founder pressed a hand here.',
    draw(g, o) { R(g, 3, 3, 12, 26, C.co400); R(g, 4, 1, 10, 2, C.co400); R(g, 3, 3, 3, 26, C.co300); R(g, 12, 3, 3, 26, C.co500); R(g, 1, 28, 16, 3, C.co500); const c = o.lit ? '#8FF5E6' : C.co600;
      [[6, 7], [10, 9], [6, 14], [10, 17], [7, 21]].forEach(([x, y]) => { R(g, x, y, 2, 2, c); P(g, x - 1, y - 1, c); P(g, x + 2, y - 1, c); }); P(g, 2, 30, C.p500); P(g, 15, 29, C.p400); } });

  /* ================= law & order ================= */
  def('noticeboard', { name: 'Notice Board', cat: 'civic', foot: [1, 1], box: [20, 24, 10, 23], solid: true, plazaOk: true, variants: 2, varNames: ['Laws', 'Wanted'],
    draw(g, o) { R(g, 2, 8, 2, 16, C.w3); R(g, 16, 8, 2, 16, C.w3); R(g, 0, 2, 20, 13, C.w2); R(g, 0, 2, 20, 1, C.w1); R(g, 0, 14, 20, 1, C.w4);
      if (o.v) { R(g, 5, 4, 10, 9, C.s100); disc(g, 10, 7, 2, C.co600); R(g, 8, 9, 5, 3, C.co600); R(g, 5, 4, 10, 1, C.b400); P(g, 7, 12, C.c600); P(g, 12, 12, C.c600); }
      else { [[2, 4], [8, 3], [14, 5]].forEach(([x, y], i) => { R(g, x, y, 5, 8, C.s50); for (let k = 0; k < 3; k++) R(g, x + 1, y + 2 + k * 2, 3, 1, C.co400); P(g, x + 2, y, C.b400); }); } } });
  def('stocks', { name: 'Stocks', cat: 'civic', foot: [2, 1], box: [30, 20, 15, 19], solid: true, plazaOk: true, desc: 'Public opinion, in wooden form.',
    draw(g) { R(g, 3, 4, 3, 16, C.w3); R(g, 24, 4, 3, 16, C.w3); R(g, 0, 8, 30, 5, C.w2); R(g, 0, 8, 30, 1, C.w1); R(g, 0, 12, 30, 1, C.w4); [9, 15, 21].forEach((x, i) => { disc(g, x, 10, i === 1 ? 2 : 1, C.ink2); }); R(g, 0, 18, 30, 2, C.w3); } });
  def('jail', { name: 'Jail', cat: 'civic', foot: [2, 2], box: [36, 38, 18, 37], solid: true, litable: true, lights: [{ x: 12, y: -16, r: 16, mode: 'night' }],
    draw(g, o) { for (let y = 14; y < 38; y += 4) for (let x = 2 + ((y / 4) % 2) * 3; x < 34; x += 6) { R(g, x, y, 6, 4, C.co400); R(g, x, y + 3, 6, 1, C.co500); R(g, x + 5, y, 1, 4, C.co500); } R(g, 2, 14, 32, 24, 'rgba(0,0,0,0)');
      for (let x = 1; x < 35; x += 6) R(g, x, 10, 4, 4, C.co400); R(g, 1, 13, 34, 1, C.co500); R(g, 6, 19, 8, 7, C.ink2); for (let x = 7; x < 14; x += 2) R(g, x, 19, 1, 7, C.co600); R(g, 20, 24, 9, 14, C.co600); R(g, 20, 24, 9, 1, C.co500); [22, 27].forEach(x => [27, 31, 35].forEach(y => P(g, x, y, C.co300))); P(g, 27, 30, C.sun2);
      R(g, 30, 18, 3, 4, o.lit ? C.glow : C.co300); } });
  def('courthouse', { name: 'Courthouse', cat: 'civic', foot: [3, 2], box: [54, 54, 27, 53], solid: true, litable: true, court: true, lights: [{ x: -14, y: -16, r: 22, mode: 'win' }, { x: 14, y: -16, r: 22, mode: 'win' }], desc: 'Where arguments go to become official.',
    draw(g, o) { R(g, 2, 48, 50, 6, C.co300); R(g, 4, 46, 46, 2, C.co200); R(g, 6, 24, 42, 22, C.s100); R(g, 6, 24, 42, 2, C.s300);
      [8, 16, 34, 42].forEach(x => { R(g, x, 26, 4, 20, C.s50); R(g, x + 3, 26, 1, 20, C.s300); R(g, x - 1, 25, 6, 2, C.s200); R(g, x - 1, 44, 6, 2, C.s200); });
      R(g, 22, 30, 10, 16, C.w3); R(g, 23, 31, 8, 15, C.w2); R(g, 27, 31, 1, 15, C.w3); [[13, 32], [37, 32]].forEach(([x]) => { R(g, x - 1, 31, 4, 8, C.w3); R(g, x, 32, 2, 6, o.lit ? C.glow : C.glass); });
      for (let i = 0; i < 14; i++) { const w = Math.round(8 + i * 3.3); R(g, 27 - w / 2, 8 + i, w, 1, i < 2 ? C.s50 : i > 11 ? C.s300 : C.s100); } R(g, 4, 22, 46, 2, C.s300);
      line(g, 21, 15, 33, 15, C.sun2); R(g, 26, 12, 2, 8, C.sun2); line(g, 21, 15, 19, 19, C.sun2); line(g, 21, 15, 23, 19, C.sun2); R(g, 18, 19, 6, 1, C.sun2); line(g, 33, 15, 31, 19, C.sun2); line(g, 33, 15, 35, 19, C.sun2); R(g, 30, 19, 6, 1, C.sun2); roof(g, 27, 4, 5, 6, 18, [C.co400, C.co500, C.co600, C.co700]); } });

  /* ================= politics ================= */
  def('ballotbox', { name: 'Ballot Booth', cat: 'civic', foot: [1, 1], box: [20, 28, 10, 27], solid: true, plazaOk: true, desc: 'One villager, one pebble.',
    draw(g) { R(g, 1, 2, 2, 26, C.w3); R(g, 17, 2, 2, 26, C.w3); R(g, 0, 1, 20, 3, C.w2); R(g, 0, 1, 20, 1, C.w1); for (let x = 3; x < 17; x++) R(g, x, 4, 1, 14, Math.floor((x - 3) / 2) % 2 ? C.k400 : C.k500); for (let x = 3; x < 17; x += 2) P(g, x, 18, C.k600);
      R(g, 5, 19, 10, 8, C.w1); R(g, 5, 19, 10, 1, C.s300); R(g, 8, 20, 4, 1, C.ink2); line(g, 7, 22, 12, 26, C.b400); line(g, 12, 22, 7, 26, C.b400); } });
  def('poster', { name: 'Campaign Poster', cat: 'civic', foot: [1, 1], box: [16, 24, 8, 23], variants: 4, varNames: FAC.map(f => f.name), plazaOk: true,
    draw(g, o) { const f = FAC[o.v % 4]; R(g, 7, 12, 2, 12, C.w3); R(g, 1, 1, 14, 13, f.c); R(g, 2, 2, 12, 11, C.s50); disc(g, 8, 5, 2, f.c); R(g, 5, 8, 6, 4, f.c); R(g, 2, 11, 12, 2, f.c); emblem(g, 3, 2, o.v % 4, f.c); } });
  def('tally', { name: 'Tally Board', cat: 'civic', foot: [2, 1], box: [34, 34, 17, 33], solid: true, plazaOk: true, desc: 'Chalk, two colors, many feelings.',
    draw(g) { R(g, 4, 20, 2, 14, C.w3); R(g, 28, 20, 2, 14, C.w3); R(g, 1, 2, 32, 22, C.w3); R(g, 3, 4, 28, 18, C.s50); R(g, 3, 4, 28, 3, C.ink2); R(g, 7, 5, 8, 1, C.s300); R(g, 19, 5, 8, 1, C.s300); for (let x = 3; x < 31; x += 4) P(g, x, 21, C.s300); } });
  def('parliament', { name: 'Parliament', cat: 'civic', foot: [4, 3], box: [70, 76, 35, 75], solid: true, litable: true, keep: true, desc: 'A dome so everyone can argue under it.',
    lights: [{ x: -18, y: -22, r: 22, mode: 'win' }, { x: 18, y: -22, r: 22, mode: 'win' }, { x: 0, y: -46, r: 26, mode: 'win' }],
    draw(g, o) { R(g, 0, 68, 70, 8, C.co300); R(g, 3, 65, 64, 3, C.co200); R(g, 6, 38, 58, 27, C.s100); R(g, 6, 38, 58, 3, C.s300);
      [8, 17, 26, 40, 49, 58].forEach(x => { R(g, x, 41, 4, 24, C.s50); R(g, x + 3, 41, 1, 24, C.s300); R(g, x - 1, 40, 6, 2, C.s200); });
      R(g, 30, 45, 10, 20, C.w3); R(g, 31, 46, 8, 19, C.w2); R(g, 35, 46, 1, 19, C.w3); [13, 22, 45, 54].forEach(x => { R(g, x, 46, 3, 7, C.w3); R(g, x, 47, 3, 5, o.lit ? C.glow : C.glass); });
      R(g, 4, 34, 62, 4, C.s300); R(g, 4, 34, 62, 1, C.s50);
      R(g, 20, 24, 30, 10, C.s100); [22, 30, 38, 46].forEach(x => R(g, x, 25, 2, 9, C.s300));
      for (let y = 0; y < 16; y++) { const w = Math.round(Math.sqrt(1 - ((15 - y) / 16) ** 2) * 28); for (let x = -w; x < w; x++) P(g, 35 + x, 8 + y, Math.abs(x) % 6 === 0 ? C.l600 : x < -w / 3 ? C.l300 : C.l400); }
      R(g, 34, 2, 2, 7, C.w4); R(g, 36, 2, 7, 4, FAC[2].c); emblem(g, 38, 2, 2); } });
  def('statue2', { name: 'Leader Statue', cat: 'civic', foot: [1, 1], box: [24, 40, 12, 39], solid: true, plazaOk: true, variants: 2, varNames: ['Standing', 'Toppled'],
    draw(g, o) { R(g, 6, 30, 12, 10, C.co300); R(g, 5, 29, 14, 2, C.co200); R(g, 6, 38, 12, 2, C.co400); R(g, 9, 33, 6, 3, C.sun2);
      if (o.v) { R(g, 6, 28, 12, 1, C.co500); R(g, 0, 34, 6, 5, C.co200); R(g, 1, 33, 4, 1, C.co300); disc(g, 21, 36, 3, C.co200); R(g, 15, 37, 9, 3, C.co200); P(g, 3, 31, C.co400); P(g, 17, 25, C.co400); P(g, 20, 33, C.co400); return; }
      R(g, 9, 21, 2, 8, C.co200); R(g, 13, 21, 2, 8, C.co200); R(g, 8, 12, 8, 9, C.co200); R(g, 14, 12, 2, 9, C.co300); R(g, 16, 4, 2, 10, C.co200); disc(g, 12, 9, 3, C.co200); R(g, 9, 4, 6, 2, C.sun2); P(g, 9, 3, C.sun2); P(g, 12, 3, C.sun2); P(g, 14, 3, C.sun2); P(g, 17, 3, C.co200); } });
  def('barricade', { name: 'Barricade', cat: 'civic', foot: [2, 1], box: [36, 30, 18, 29], solid: true, plazaOk: true, desc: 'Every crate in town, stacked with feeling.',
    draw(g) { R(g, 1, 18, 11, 11, C.w1); line(g, 1, 18, 11, 28, C.w2); line(g, 11, 18, 1, 28, C.w2); R(g, 10, 12, 10, 17, C.w2); R(g, 10, 12, 10, 1, C.w1); disc(g, 26, 22, 7, C.w3); disc(g, 26, 22, 5, C.w2); line(g, 21, 22, 31, 22, C.w4); line(g, 26, 17, 26, 27, C.w4);
      line(g, 0, 16, 34, 9, C.w3, 2); R(g, 3, 26, 30, 3, C.co400); R(g, 16, 0, 1, 12, C.w4); R(g, 17, 0, 7, 5, C.b500); emblem(g, 19, 1, 3); P(g, 23, 5, C.b500); } });

  /* ================= golden age ================= */
  def('library', { name: 'Library', cat: 'civic', foot: [3, 2], box: [54, 58, 27, 57], solid: true, litable: true, library: true, visit: true, desc: 'One thousand books. Two of them about cheese.',
    lights: [{ x: -16, y: -14, r: 22, mode: 'win' }, { x: 16, y: -14, r: 22, mode: 'win' }, { x: 0, y: -24, r: 24, mode: 'win' }],
    draw(g, o) { R(g, 2, 52, 50, 6, C.co300); R(g, 3, 30, 48, 22, C.s100); R(g, 3, 30, 48, 2, C.s300); R(g, 3, 50, 48, 2, C.s300);
      [[8, 36], [37, 36]].forEach(([x, y]) => { R(g, x, y, 9, 12, C.w3); R(g, x + 1, y + 2, 7, 9, o.lit ? C.glow : C.glass); R(g, x + 2, y + 1, 5, 1, C.w3); for (let k = 0; k < 6; k++) R(g, x + 1 + k, y + 8, 1, 3, [C.b400, C.k400, C.sun2, C.p400, C.c400, C.l400][k]); });
      R(g, 21, 36, 12, 16, C.w3); R(g, 22, 37, 10, 15, C.k600); R(g, 26, 37, 2, 15, C.k500); R(g, 22, 34, 10, 2, C.w3);
      roof(g, 27, 20, 10, 40, 54, [C.k300, C.k400, C.k500, C.k600]);
      for (let y = 0; y < 14; y++) { const w = Math.round(Math.sqrt(1 - ((13 - y) / 14) ** 2) * 13); for (let x = -w; x < w; x++) P(g, 27 + x, 6 + y, Math.abs(x) % 4 === 0 ? C.co600 : x < -w / 3 ? C.co200 : C.co300); }
      R(g, 26, 1, 2, 6, C.sun2); disc(g, 27, 1, 1, C.sun); R(g, 22, 22, 10, 6, C.b400); R(g, 24, 23, 6, 4, C.s50); R(g, 27, 23, 1, 4, C.b400); } });
  def('clocktower', { name: 'Clock Tower', cat: 'civic', foot: [1, 1], box: [22, 76, 11, 75], solid: true, litable: true, plazaOk: true, desc: 'Keeps the village roughly on time.', lights: [{ x: 0, y: -57, r: 22, mode: 'win' }],
    draw(g, o) { for (let y = 24; y < 76; y += 3) for (let x = 3 + ((y / 3) % 2) * 2; x < 19; x += 4) { R(g, x, y, 4, 3, C.c500); R(g, x, y + 2, 4, 1, C.c600); } R(g, 15, 24, 4, 52, C.c600); R(g, 8, 62, 6, 14, C.w3); R(g, 9, 63, 4, 13, C.w2);
      R(g, 2, 10, 18, 15, C.co300); R(g, 2, 10, 18, 1, C.co200); disc(g, 11, 18, 6, C.s50); disc(g, 11, 18, 5, o.lit ? C.glow2 : C.s50); [[11, 13], [16, 18], [11, 23], [6, 18]].forEach(([x, y]) => P(g, x, y, C.ink2)); R(g, 9, 26, 4, 6, o.lit ? C.glow : C.glass);
      roof(g, 11, 0, 10, 2, 22, [C.k300, C.k400, C.k500, C.k600]); } });
  def('monument', { name: 'Monument', cat: 'civic', foot: [1, 1], box: [20, 62, 10, 61], solid: true, plazaOk: true, visit: true, desc: 'To everyone who stayed.',
    draw(g) { R(g, 0, 54, 20, 8, C.co300); R(g, 2, 50, 16, 4, C.co200); for (let y = 6; y < 50; y++) { const w = Math.round(4 + (y - 6) * .1); R(g, 10 - w, y, w * 2, 1, C.co200); R(g, 10, y, w, 1, C.co300); } for (let i = 0; i < 5; i++) R(g, 10 - i, i + 1, i * 2, 1, C.sun2); P(g, 10, 0, C.glow2); oval(g, 10, 30, 4, 3, C.p500); oval(g, 10, 30, 2, 1, C.co200); P(g, 7, 30, C.b400); P(g, 13, 30, C.b400); } });
  def('flag', { name: 'Faction Flag', cat: 'civic', foot: [1, 1], box: [18, 36, 6, 35], variants: 4, varNames: FAC.map(f => f.name), frames: 2, fps: 2.5, plazaOk: true,
    draw(g, o) { const f = FAC[o.v % 4]; R(g, 5, 1, 2, 35, C.w4); P(g, 5, 0, C.sun); P(g, 6, 0, C.sun); for (let y = 0; y < 9; y++) { const wv = o.frame ? Math.round(Math.sin(y * .5) ) : 0; R(g, 7, 2 + y, 10 + wv, 1, y === 0 ? A.shade(f.c, 1.15) : f.c); } emblem(g, 10, 4, o.v % 4); R(g, 3, 33, 6, 3, C.co400); } });
  def('grave', { name: 'Memorial Stone', cat: 'civic', foot: [1, 1], box: [14, 16, 7, 15], variants: 3, noShadow: true,
    draw(g, o) { if (o.v === 1) { R(g, 6, 1, 2, 13, C.w2); R(g, 3, 4, 8, 2, C.w2); } else { R(g, 3, 3, 8, 11, o.v ? C.co300 : C.co400); R(g, 4, 1, 6, 2, o.v ? C.co300 : C.co400); R(g, 5, 6, 4, 1, C.co600); } R(g, 1, 13, 12, 3, C.w3); P(g, 2, 12, C.b400); P(g, 11, 12, C.sun); P(g, 3, 12, C.p500); } });
  def('crow', { name: 'Crow', cat: 'animal', box: [8, 7], frames: 2, draw(g, o) { R(g, 1, 3, 5, 3, C.ink2); R(g, 5, 1, 2, 3, C.ink2); P(g, 7, 2, C.sun2); P(g, 6, 1, C.s50); R(g, 0, 4, 2, 1, C.ink); if (o.frame) { R(g, 1, 1, 3, 2, C.ink); } P(g, 2, 6, C.co600); P(g, 4, 6, C.co600); } });
  A.CATS.splice(A.CATS.findIndex(c => c[0] === 'event') + 1, 0, ['civic', 'Civilization']);

  /* ================= villager roles (overlay on top of the village villager) ================= */
  const V = A.get('villager'), vdraw = V.draw;
  V.desc += ' · civ outfit = settler | crown | sash | sage | judge | thief | rebel | prisoner | scholar · held = torch | sign | flag | spear | scroll | sack · band · signC · armUp';
  V.draw = function (g, o) {
    vdraw.call(this, g, o);
    const age = o.age || 0, kid = age === 1, pose = o.pose || null, f = (o.frame >= 4 || pose) ? 0 : o.frame % 4, alt = o.frame % 2, sit = pose === 'sit' || pose === 'eat';
    let by = (f === 1 || f === 3) ? -1 : 0; if ((pose === 'dance' || pose === 'cheer') && alt) by = -1;
    const k = kid ? 3 : 0, sy = sit ? (kid ? 1 : 2) : 0, hy = 1 + k + sy + by, tt = hy + 7, th = kid ? (sit ? 2 : 3) : (sit ? 3 : 5), tb = tt + th - 1, ey = hy + 4;
    const dir = o.dir || 'down', side = dir === 'side', back = dir === 'up', out = o.outfit, tx = side ? 3 : 2, tw = side ? 4 : 6;
    if (out === 'settler') { R(g, tx, tt, tw, th, C.w1); R(g, tx, tb, tw, 1, C.s300); if (!back) P(g, tx + 1, tt + 1, C.w2); }
    else if (out === 'crown') { if (back) R(g, 1, tt, 8, Math.min(16, tb + 3) - tt, C.b500); else { R(g, 1, tt, 1, th + 2, C.b500); R(g, 8, tt, 1, th + 2, C.b500); R(g, 2, tt, 6, 1, C.s50); } R(g, 2, hy - 1, 6, 2, C.sun); [2, 4, 7].forEach(x => P(g, x, hy - 2, C.sun)); if (!back) P(g, 4, hy - 1, C.b400); }
    else if (out === 'sash') { if (!back) { line(g, 2, tt, 6, tb - 1, C.sun2); line(g, 3, tt, 7, tb - 1, C.sun2); P(g, 7, tb - 1, C.b400); } R(g, 2, hy, 6, 1, C.co700); }
    else if (out === 'sage') { R(g, tx, tt, tw, 16 - tt, C.p600); if (!back) R(g, 4, tt, 2, 3, C.s50); [2, 4, 6].forEach(x => P(g, x, hy - 1, C.p400)); P(g, 3, hy - 1, C.b400); }
    else if (out === 'judge') { R(g, tx, tt, tw, 16 - tt, C.ink2); if (!back) R(g, 4, tt, 2, 2, C.s50); R(g, 1, hy - 1, 8, 3, C.s50); R(g, 1, hy + 2, 1, 4, C.s50); R(g, 8, hy + 2, 1, 4, C.s50); P(g, 1, hy + 6, C.s200); P(g, 8, hy + 6, C.s200); }
    else if (out === 'thief') { R(g, tx, tt, tw, th, C.co700); if (back) R(g, 2, hy - 1, 6, 8, C.co700); else { R(g, 1, hy - 1, 8, 3, C.co700); R(g, 1, hy + 2, 1, 5, C.co700); R(g, 8, hy + 2, 1, 5, C.co700); if (side) { R(g, 4, ey, 4, 1, C.ink); P(g, 6, ey, C.s50); } else { R(g, 2, ey, 6, 1, C.ink); P(g, 3, ey, C.s50); P(g, 6, ey, C.s50); } } }
    else if (out === 'rebel') { R(g, 2, hy, 6, 1, C.b500); if (!back) { if (side) R(g, 5, ey + 1, 3, 2, C.b400); else R(g, 2, ey + 1, 6, 2, C.b400); } }
    else if (out === 'prisoner') { for (let y = tt; y <= tb; y++) R(g, tx, y, tw, 1, (y - tt) % 2 ? C.ink2 : C.s50); }
    else if (out === 'scholar') { R(g, tx, tt, tw, 16 - tt, C.k600); if (!back) R(g, 4, tt, 2, 1, C.s50); R(g, 1, hy - 1, 8, 1, C.ink2); R(g, 3, hy - 2, 4, 1, C.ink2); P(g, 8, hy, C.sun); }
    if (o.band) { const bx = side ? 4 : 1; P(g, bx, tt + 1, o.band); P(g, bx, tt + 2, o.band); if (!side) { P(g, 8, tt + 1, o.band); } }
    const hd = o.held, sc = o.signC || C.s50, ax = side ? 5 : 8;
    if (hd === 'torch') { R(g, ax, tt - 10, 1, 7, C.w3); R(g, ax - 1, tt - 13, 3, 3, C.c400); P(g, ax, tt - 14 - alt, C.sun); P(g, ax, tt - 12, C.glow2); P(g, ax + (alt ? 1 : -1), tt - 13, C.sun); }
    else if (hd === 'sign') { R(g, 4, hy - 4, 1, 4, C.w3); R(g, 0, hy - 9, 10, 6, sc); R(g, 0, hy - 9, 10, 1, A.shade(sc, .8)); R(g, 2, hy - 7, 6, 1, C.s50); R(g, 2, hy - 5, 4, 1, C.s50); }
    else if (hd === 'flag') { R(g, 9, hy - 9, 1, 25 - hy, C.w4); R(g, 10, hy - 9, 4, 5, sc); P(g, 13, hy - 4 + alt, sc); P(g, 11, hy - 7, C.s50); }
    else if (hd === 'spear') { R(g, 9, hy - 6, 1, 22 - hy, C.w3); R(g, 9, hy - 9, 1, 3, C.co200); P(g, 8, hy - 7, C.co200); P(g, 10, hy - 7, C.co200); }
    else if (hd === 'scroll') { R(g, 6, tt + 1, 4, 2, C.s100); P(g, 6, tt + 1, C.s300); P(g, 9, tt + 2, C.s300); }
    else if (hd === 'sack') { R(g, -2, tt - 1, 4, 5, C.w1); R(g, -1, tt - 2, 2, 1, C.w2); P(g, 0, tt + 1, C.sun); }
  };

  /* ================= engine layer ================= */
  const G = LW.Game.prototype;
  const base = { entSprite: G.entSprite, afterObject: G.afterObject, extraGlow: G.extraGlow, update: G.update, drawGhost: G.drawGhost, status: G.status, selInfo: G.selInfo, load: G.load, startEvent: G.startEvent, endEvent: G.endEvent, eventThink: G.eventThink, eventUpdate: G.eventUpdate, toRole: G.toRole, litFor: G.litFor, seasonOpts: G.seasonOpts };
  const UMB = [C.b400, C.k500, C.sun2, C.l500, C.c500];
  function walkNear(W, x, y, r) { r = r || 4; x = Math.round(x); y = Math.round(y); for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; if (W.walkable(x + dx, y + dy)) return [x + dx, y + dy]; } return null; }
  Object.assign(G.faceForMap = {}, { crown: 'happy', fist: 'angry', fire: 'surprised', vote: 'happy', loot: 'laugh', heartbreak: 'sad', scales: null, shield: null, scroll: null });
  G.entSprite = function (e) {
    if (e.kind !== 'villager') return base.entSprite.call(this, e);
    this.persona(e);
    const moving = !!e.path, t = this.t, work = !moving && e.wait > 0 && e.tool;
    let pose = moving && e.pose !== 'dance' ? null : (e.pose || null), fr;
    if (pose) fr = Math.floor(t * ({ dance: 4, wave: 5, talk: 2.5, cheer: 3, eat: 1.4 }[pose] || 1) + e.phase) % 2;
    else fr = moving ? Math.floor(e.walk * 5) % 4 : work ? 4 + (Math.floor(t * (e.tool === 'rod' ? 1.2 : 2.8) + e.phase) % 2) : (e.roleHeld === 'torch' || e.roleHeld === 'flag' ? Math.floor(t * 3 + e.phase) % 2 : 0);
    const W = this.world, wx = this.weather(), held = e.roleHeld || e.held || null, armUp = e.roleArm || (held === 'torch' || held === 'flag' ? 1 : held === 'sign' ? 2 : 0);
    const wet = (wx === 'rain' || wx === 'storm') && !work && !pose && e.age !== 1 && !held;
    const outfit = e.outfit2 || e.civOutfit || e.outfit || (W.season === 3 && W.climate !== 'warm' ? 'scarf' : null);
    let face = this.faceFor(e); const b = e.bubble && e.bubble.icon; if (!e.faceOverride && b && b in G.faceForMap) face = G.faceForMap[b] || face;
    const umb = wet ? UMB[e.look[2] % 5] : null, band = e.band || null, signC = e.roleSign || band;
    const key = [e.look.join(''), e.dir, e.carry || '', work ? e.tool : '', pose || '', face || '', e.age, outfit || '', umb || '', held || '', armUp, band || '', signC || ''].join('|');
    return A.sprite('villager', { key, look: e.look, dir: e.dir, carry: e.carry, tool: work ? e.tool : null, pose, face, age: e.age, outfit, umbrella: umb, held, armUp, band, signC }, fr);
  };
  G.seasonOpts = function (o) {
    const ro = base.seasonOpts.call(this, o); if (!o.decay) return ro;
    if (o._rd && o._rd._src === ro && o._rd.decay === o.decay) return o._rd;
    o._rd = Object.assign({}, ro, { decay: o.decay, _src: ro }); return o._rd;
  };
  G.litFor = function (o, lit) { if (o.burning) return true; if (o.decay >= 2) return false; return base.litFor.call(this, o, lit); };
  G.afterObject = function (ctx, o, s, fx, fy) {
    base.afterObject && base.afterObject.call(this, ctx, o, s, fx, fy);
    const d = o.def, b = A.boxOf(d, o.opts), top = Math.round(fy) - b[3], left = Math.round(fx) - b[2], t = this.t, W = this.world;
    if (o.flag != null && !o.burning && !(o.decay >= 2)) { const f = FAC[o.flag], x = left + b[0] - 7, y = top + 2; ctx.fillStyle = C.w4; ctx.fillRect(x, y - 9, 1, 12); ctx.fillStyle = f.c; const wv = Math.floor(t * 2.5 + o.phase) % 2; ctx.fillRect(x + 1, y - 9, 5, 4); ctx.fillRect(x + 5 + wv, y - 8, 1, 2); ctx.fillStyle = C.s50; ctx.fillRect(x + 3, y - 8, 1, 2); }
    if (o.burning) {
      const n = Math.max(3, Math.round(b[0] / 7));
      for (let i = 0; i < n; i++) {
        const x = left + 3 + Math.round((i + .5) * (b[0] - 6) / n), y = top + Math.round(b[1] * (.18 + .22 * A.hash2(o.uid, i))), hgt = 7 + Math.round(4 * Math.sin(t * 9 + i * 2.1 + o.phase) + 3 * A.hash2(i, o.uid));
        ctx.fillStyle = C.c500; ctx.fillRect(x - 2, y - hgt + 3, 5, hgt); ctx.fillStyle = C.c400; ctx.fillRect(x - 1, y - hgt + 1, 3, hgt); ctx.fillStyle = C.sun; ctx.fillRect(x - 1, y - hgt + 4, 2, hgt - 5); ctx.fillStyle = C.glow2; ctx.fillRect(x, y - 2, 1, 2);
        if ((Math.floor(t * 6) + i) % 3 === 0) { ctx.fillStyle = C.sun; ctx.fillRect(x + (i % 2 ? 1 : -1), y - hgt - 1, 1, 1); }
      }
    }
    if (d.id === 'clocktower') { const h = o.decay >= 2 ? 4.2 : W.hour, m = o.decay >= 2 ? 12 : W.time % 60, cx = left + 11, cy = top + 18; const hand = (a, len, c) => { ctx.fillStyle = c; for (let k = 1; k <= len; k++) ctx.fillRect(Math.round(cx + Math.cos(a) * k), Math.round(cy + Math.sin(a) * k), 1, 1); }; hand((m / 60) * Math.PI * 2 - Math.PI / 2, 4, C.co600); hand(((h % 12) / 12) * Math.PI * 2 - Math.PI / 2, 3, C.ink2); ctx.fillStyle = C.ink2; ctx.fillRect(cx, cy, 1, 1); }
    if (d.id === 'tally' && this.event && this.event.tally) { const tv = this.event.tally; [0, 1].forEach(i => { const hgt = Math.round(Math.min(1, tv[i] / 30) * 13); ctx.fillStyle = FAC[i].c; ctx.fillRect(left + 8 + i * 12, top + 21 - hgt, 6, hgt); }); }
  };
  G.extraGlow = function (glow, L) {
    base.extraGlow && base.extraGlow.call(this, glow, L);
    this.world.objects.forEach(o => { if (!o.burning) return; const b = A.boxOf(o.def, o.opts); glow((o.x + o.fw / 2) * T, (o.y + o.fh) * T - b[1] * .55, b[0] * (1.1 + .08 * Math.sin(this.t * 8 + o.phase)), .45 + .5 * L); });
  };
  G.drawGhost = function (ctx) {
    const W = this.world, z = this.cam.z, cx = this.cam.x, cy = this.cam.y, vw = this.vw / z, vh = this.vh / z;
    if (W.grade) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = W.grade; ctx.fillRect(cx - 20, cy - 20, vw + 40, vh + 40); ctx.restore(); }
    if (this.lens && W.fmap) {
      const x0 = Math.max(0, Math.floor(cx / T)), y0 = Math.max(0, Math.floor(cy / T)), x1 = Math.min(W.w - 1, Math.ceil((cx + vw) / T)), y1 = Math.min(W.h - 1, Math.ceil((cy + vh) / T));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const f = W.fmap[y * W.w + x]; if (!f) continue; const c = FAC[f - 1].c, at = (a, b2) => (a < 0 || b2 < 0 || a >= W.w || b2 >= W.h) ? 0 : W.fmap[b2 * W.w + a];
        ctx.globalAlpha = .22; ctx.fillStyle = c; ctx.fillRect(x * T, y * T, T, T); ctx.globalAlpha = .95;
        if (at(x, y - 1) !== f) for (let k = 0; k < T; k += 4) ctx.fillRect(x * T + k, y * T, 2, 1);
        if (at(x, y + 1) !== f) for (let k = 0; k < T; k += 4) ctx.fillRect(x * T + k, y * T + T - 1, 2, 1);
        if (at(x - 1, y) !== f) for (let k = 0; k < T; k += 4) ctx.fillRect(x * T, y * T + k, 1, 2);
        if (at(x + 1, y) !== f) for (let k = 0; k < T; k += 4) ctx.fillRect(x * T + T - 1, y * T + k, 1, 2);
      }
      ctx.globalAlpha = 1;
      (W.districts || []).forEach(dd => this.drawSpr(ctx, A.sprite('flag', { v: dd.f }, Math.floor(this.t * 2.5) % 2), dd.x * T, dd.y * T));
    }
    base.drawGhost.call(this, ctx);
  };
  G.update = function (dt) {
    base.update.call(this, dt);
    const W = this.world, R = Math.random;
    W.objects.forEach(o => {
      if (!o.burning) return; const b = A.boxOf(o.def, o.opts), x = (o.x + o.fw / 2) * T, y = (o.y + o.fh) * T - b[1] * .7;
      if (R() < dt * 9) W.particles.push({ k: 'smoke', x: x + (R() - .5) * b[0] * .7, y, vx: 6 + R() * 5, vy: -10 - R() * 6, life: 3.5 + R() * 2, max: 5.5, s: 3, c: R() < .5 ? C.co700 : C.ink2 });
      if (R() < dt * 6) W.particles.push({ k: 'spark', x: x + (R() - .5) * b[0] * .6, y: y + 6, vx: (R() - .5) * 14, vy: -24 - R() * 20, life: .8 + R() * .7, max: 1.5, s: 1 });
    });
  };
  G.load = function (W, o) {
    base.load.call(this, W, o);
    if (W.forceWeather) W.weatherToday = W.forceWeather;
    if (W.chapter != null) { const wx = this.weather(); for (const k in this.wk) this.wk[k] = (wx === k || (k === 'rain' && wx === 'storm')) ? 1 : 0; this.diary = []; this.diaryAdd(null, W.realm.year + ' · ' + W.realm.headline); this.startEvent('civ'); }
  };
  G.status = function () {
    const s = base.status.call(this); if (!s) return s; const W = this.world;
    if (W.chapter != null) { s.chapter = W.chapter; s.chapters = CH.map(c => c.name); s.gov = W.gov; s.realm = W.realm; s.lens = !!this.lens; s.hasLens = !!W.fmap; }
    return s;
  };
  G.selInfo = function () {
    const info = base.selInfo.call(this); if (!info) return info; const e = this.sel;
    if (info.type === 'villager') { if (e.title) info.eyebrow = e.title; if (e.faction != null) info.facts.unshift(['Faction', FAC[e.faction].name]); }
    if (info.type === 'object' && e.burning) { info.activity = 'On fire.'; info.home = 'Nobody is putting it out yet.'; }
    else if (info.type === 'object' && e.decay >= 2) { info.activity = 'Abandoned. Vines are moving in.'; info.home = 'Last lit ' + (20 + (e.uid % 30)) + ' years ago'; }
    return info;
  };
  G.toRole = function (e) { const r = e.role; if (r && (r.route || r.script)) { e.roleAt = true; e.activity = r.act; return; } base.toRole.call(this, e); };
  G.eventThink = function (e) {
    const r = e.role; if (!r) return false;
    if (r.script) { e.wait = 1e9; return true; }
    if (r.route) {
      const W = this.world; r.i = ((r.i == null ? -1 : r.i) + 1) % r.route.length; const wp = r.route[r.i], tile = walkNear(W, wp[0], wp[1], 3);
      if (!tile) { e.wait = 1; return true; }
      const ic = wp[3] || (r.icons && Math.random() < (r.rate || .4) ? pick(r.icons) : null);
      this.task(e, r.act, tile[0], tile[1], wp[2] == null ? .5 + Math.random() * 2 : wp[2], wp[4] ? () => wp[4](e) : null, ic, r.tool || null, r.face || null);
      return true;
    }
    return base.eventThink.call(this, e);
  };
  G.endEvent = function () {
    const ev = this.event;
    if (ev && ev.type === 'civ') ev.roles.forEach(r => { const e = r.e; if (!e) return; e.roleHeld = null; e.roleArm = 0; e.roleSign = null; if (e._spd) { e.speed = e._spd; e._spd = null; } e.tool = null; });
    base.endEvent.call(this);
  };
  G.startEvent = function (type) {
    if (type !== 'civ') return base.startEvent.call(this, type);
    this.endEvent();
    const W = this.world, ch = W.chapter, S = W.civ, R = Math.random;
    const ev = this.event = { type: 'civ', ch, t: 0, props: [], roles: [], ents: [], fired: {} };
    const put = (id, x, y, o, m) => { const ob = LW.gen.placeNear(W, id, x, y, o || {}, m == null ? 0 : m, 6); if (ob) { ob.temp = true; ev.props.push(ob); } return ob; };
    const people = W.entities.filter(e => e.kind === 'villager' && !e.role);
    const take = (n, f, near) => { if (near) people.sort((a, b) => Math.hypot(a.x - near[0], a.y - near[1]) - Math.hypot(b.x - near[0], b.y - near[1])); const out = []; for (let i = 0; i < people.length && out.length < n; i++) if (!f || f(people[i])) { out.push(people[i]); people.splice(i, 1); i--; } return out; };
    const cast = (e, r) => { this.assignRole(e, r); if (r.held) e.roleHeld = r.held; if (r.arm) e.roleArm = r.arm; if (r.sign) e.roleSign = r.sign; if (r.speed) { e._spd = e._spd || e.speed; e.speed = r.speed; } if (r.tool) e.tool = r.tool; return e; };
    const ring = (n, cx, cy, rx, ry, a0, a1) => { const out = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n > 1 ? i / (n - 1) : .5); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return out; };
    const [CX, CY] = S.center;
    ev.cast = cast; ev.take = take; ev.put = put;
    if (ch === 0) {
      const [fx, fy] = S.camp;
      take(2, null, S.camp).forEach((e, i) => cast(e, { x: fx + (i ? 1.4 : -1.4), y: fy + 2.4, pose: 'sit', act: i ? 'Arguing about which way is north' : 'Keeping the first fire alive', face: [fx, fy + 2], icons: ['chat', 'question', 'note', 'fire'], rate: .15 }));
      take(2).forEach((e, i) => { cast(e, { route: S.bushes.slice(i * 3, i * 3 + 5).map(b => [b[0], b[1] + 1, 3 + R() * 3, R() < .4 ? 'bowl' : null]), act: 'Foraging for berries', speed: 1.2 }); e.carry = 'basket'; });
      take(1).forEach(e => { const sh = walkNear(W, S.shore[0], S.shore[1], 3) || S.shore; cast(e, { x: sh[0] + .5, y: sh[1] + .5, act: 'Fishing for dinner', tool: 'rod', icons: ['fish', 'question'], rate: .05 }); });
      take(1).forEach(e => cast(e, { x: S.camp[0] + 3.5, y: S.camp[1] + .5, act: 'Building another lean-to', tool: 'hammer', icons: ['hammer'], rate: .08 }));
      take(1).forEach(e => cast(e, { route: [[fx + 14, fy - 6, 2, 'question'], [fx + 22, fy - 2, 3, 'bang'], [fx + 18, fy - 10, 2, 'star'], [fx + 4, fy - 6, 1]], act: 'Scouting the valley', speed: 1.6 }));
      this.diaryAdd(null, 'Seven settlers, one raft, and a goal: ' + W.realm.objective.toLowerCase() + '.');
    } else if (ch === 1) {
      const [px, py] = S.pact;
      const lead = W.leader && W.entities.includes(W.leader) ? [W.leader] : take(1); lead.forEach(e => { people.splice(people.indexOf(e), 1); cast(e, { x: px + .5, y: py + 1.6, dir: 'up', act: 'Reading the pact aloud', held: 'scroll', icons: ['scroll', 'chat', 'star'], rate: .4, poses: ['talk', null] }); });
      ring(10, px + .5, py + .8, 3.4, 2.2, Math.PI * .1, Math.PI * 1.9).forEach(([x, y], i) => { const e = take(1, null, [px, py])[0]; if (e) cast(e, { x, y, act: 'Swearing on the pact', face: [px + .5, py + .5], pact: true, icons: ['heart', 'star', 'question'], rate: .06 }); });
      this.diaryAdd(null, 'At the pact stone, the founders press their hands to the rock.');
    } else if (ch === 2 && S.court) {
      const ct = S.court, cd = W.door(ct), st = W.poi('stalls');
      take(1, e => e.age === 2).concat(take(1)).slice(0, 1).forEach(e => { e.title = 'Judge'; cast(e, { x: cd.x + .5, y: cd.y + .25, dir: 'down', outfit: 'judge', act: 'Presiding over the court', icons: ['scales', 'chat'], rate: .12, judge: true }); });
      ring(6, cd.x + .5, cd.y + 2.2, 3.2, 1.6, Math.PI * .05, Math.PI * .95).forEach(([x, y]) => { const e = take(1)[0]; if (e) cast(e, { x, y, face: [cd.x + .5, cd.y], act: 'Watching the trial', icons: ['question', 'bang', 'angry', 'laugh'], rate: .08 }); });
      const nb = S.board; if (nb) take(3, null, nb).forEach((e, i) => cast(e, { x: nb[0] + .5 + (i - 1) * .9, y: nb[1] + 1.5, dir: 'up', act: 'Reading the new laws', icons: ['scroll', 'question', 'bang'], rate: .1 }));
      const so = S.stocks; if (so) take(3, null, so).forEach((e, i) => cast(e, { x: so[0] + (i - 1) * 1.1 + 1, y: so[1] + 2.1, dir: 'up', act: 'Heckling the prisoner', icons: ['laugh', 'angry', 'chat'], rate: .1 }));
      const thief = take(1, e => e.age === 0)[0], guard = W.entities.find(e => e.job === 'guard' && !e.role) || take(1)[0];
      if (thief && guard && st.length) { thief.title = 'Petty thief'; cast(thief, { script: true, act: 'Looking innocent', outfit: 'thief' }); people.splice(people.indexOf(guard), 1); cast(guard, { script: true, act: 'On patrol', held: 'spear' }); ev.crime = { thief, guard, ph: 'sneak', t: 0, stall: st[0], n: 0 }; }
      this.diaryAdd(null, 'The first laws are nailed to the notice board.');
    } else if (ch === 3) {
      const g = W.gov, sp = S.seat, sd = sp ? W.door(sp) : { x: CX, y: CY - 6 };
      if (g === 'republic') {
        const pa = put('podium', CX - 4, CY - 1), pb = put('podium', CX + 4, CY - 1), tl = put('tally', CX - 1, CY - 4), bx = put('ballotbox', CX, CY + 3);
        put('poster', CX - 7, CY + 2, { v: 0 }); put('poster', CX + 7, CY + 2, { v: 1 }); put('poster', CX - 8, CY - 3, { v: 0 }); put('poster', CX + 8, CY - 3, { v: 1 }); put('flag', CX - 6, CY - 2, { v: 0 }); put('flag', CX + 6, CY - 2, { v: 1 });
        ev.tally = [0, 0]; ev.cands = [];
        [pa, pb].forEach((p, i) => { if (!p) return; const e = take(1, x => x.age === 0)[0]; if (!e) return; e.title = 'Candidate · ' + FAC[i].name; e.faction = i; e.band = FAC[i].c; ev.cands.push(e); cast(e, { x: p.x + .5, y: p.y + .9, sortY: p.y + 1.1, lift: 7, dir: 'down', pose: 'talk', act: 'Giving a stump speech', icons: ['chat', 'star', 'fist', 'heart'], rate: .45 });
          ring(6, p.x + .5, p.y + 1.5, 2.2, 1.3, Math.PI * .1, Math.PI * .9).forEach(([x, y]) => { const s = take(1, null, [p.x, p.y])[0]; if (s) { s.faction = i; s.band = FAC[i].c; cast(s, { x, y: y + .6, face: [p.x + .5, p.y + .5], held: 'sign', sign: FAC[i].c, act: 'Rallying for ' + FAC[i].name, icons: ['fist', 'star', 'heart', 'chat'], rate: .12, poses: [null, null, 'cheer'], rally: i }); } }); });
        if (bx) take(10).forEach((e, i) => cast(e, { route: [[bx.x, bx.y + 1, 2.5, 'vote', v => { if (ev.tally && !ev.fired.result) ev.tally[(v.faction != null ? v.faction : v.uid) % 2] += .8 + R() * .9; }], [CX - 6 + (i % 4) * 4, CY + 5 + (i % 2), 3 + R() * 4]], act: 'Voting', speed: 1.3 }));
        this.diaryAdd(null, 'Election day. Hearth and the River League both want the sash.');
      } else if (g === 'kingdom') {
        const pd = put('podium', sd.x, sd.y + 1); put('bunting', sd.x - 5, sd.y + 3); put('bunting', sd.x + 2, sd.y + 3); put('flag', sd.x - 3, sd.y + 1, { v: 2 }); put('flag', sd.x + 3, sd.y + 1, { v: 2 });
        const k = W.leader && W.entities.includes(W.leader) ? W.leader : take(1, e => e.age === 0)[0]; if (k && pd) { const ix = people.indexOf(k); if (ix >= 0) people.splice(ix, 1); ev.king = k; k.title = 'Heir to the throne'; cast(k, { x: pd.x + .5, y: pd.y + .9, sortY: pd.y + 1.1, lift: 7, dir: 'down', act: 'Being crowned', icons: ['heart'], rate: .05, outfit: 'sash' }); }
        take(2).forEach((e, i) => cast(e, { x: (pd ? pd.x : sd.x) + .5 + (i ? 2.2 : -2.2), y: (pd ? pd.y : sd.y) + 1.4, dir: 'down', held: 'flag', sign: FAC[2].c, act: 'Herald of the crown', icons: ['note', 'crown'], rate: .15 }));
        for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) { const e = take(1)[0]; if (!e) break; cast(e, { x: (pd ? pd.x : sd.x) + .5 + (i - 2.5) * 1.15, y: (pd ? pd.y : sd.y) + 3.2 + row * 1.1, dir: 'up', pose: 'sit', act: 'Kneeling for the coronation', kneel: true, icons: ['crown', 'heart'], rate: .04 }); }
        this.diaryAdd(null, 'The whole valley gathers below the castle for a coronation.');
      } else {
        const [px, py] = S.pact; put('campfire', px + 4, py + 1); const fx = px + 4.5, fy = py + 1.6;
        ring(7, fx, fy, 2.4, 1.5, 0, Math.PI * 2 * 6 / 7).forEach(([x, y], i) => { const e = take(1, v => v.age === 2 || i > 4)[0]; if (e) { e.title = 'Elder of the council'; cast(e, { x, y, pose: 'sit', face: [fx, fy], act: 'Debating at the council fire', icons: ['chat', 'question', 'scales', 'angry', 'heart'], rate: .25, outfit: 'sage' }); } });
        take(8).forEach((e, i) => { const a = Math.PI * (.15 + .7 * i / 7); cast(e, { x: fx + Math.cos(a) * 4.6, y: fy + Math.sin(a) * 3, face: [fx, fy], act: 'Listening to the elders', icons: ['question', 'heart'], rate: .05 }); });
        this.diaryAdd(null, 'The council of elders meets at the fire. Nobody hurries.');
      }
    } else if (ch === 4 || ch === 5) {
      if (ch === 4) {
        S.rallies.forEach((p, i) => { const pd = put('podium', p[0], p[1]); if (!pd) return; const sp = take(1, e => e.faction === i && e.age === 0, p)[0]; if (sp) { sp.title = 'Speaker for ' + FAC[i].name; cast(sp, { x: pd.x + .5, y: pd.y + .9, sortY: pd.y + 1.1, lift: 7, dir: 'down', pose: 'talk', act: 'Firing up the crowd', icons: ['fist', 'chat', 'bang'], rate: .45 }); }
          ring(7, pd.x + .5, pd.y + 1.6, 2.3, 1.3, Math.PI * .08, Math.PI * .92).forEach(([x, y]) => { const s = take(1, e => e.faction === i, p)[0]; if (s) cast(s, { x, y: y + .6, face: [pd.x + .5, pd.y + .5], held: R() < .5 ? 'sign' : 'flag', sign: FAC[i].c, act: 'Chanting for ' + FAC[i].name, icons: ['fist', 'star', 'angry'], rate: .12, poses: [null, 'cheer'] }); }); });
        for (let i = 0; i < 3; i++) { const a = take(1, e => e.faction === 0)[0], b = take(1, e => e.faction === 1)[0]; if (!a || !b) break; const y = CY - 3 + i * 3; cast(a, { x: CX - .1, y, dir: 'side', flip: false, act: 'Arguing over the border', icons: ['angry', 'fist', 'bang', 'question'], rate: .3, poses: ['talk', null] }); cast(b, { x: CX + 1.1, y, dir: 'side', flip: true, act: 'Arguing over the border', icons: ['angry', 'fist', 'bang'], rate: .3, poses: [null, 'talk'] }); }
        const [rx, ry] = S.rebel; ring(6, rx + .5, ry + .7, 2.2, 1.4, 0, Math.PI * 2 * 5 / 6).forEach(([x, y], i) => { const e = take(1, v => v.faction === 3, S.rebel)[0]; if (e) cast(e, { x, y, pose: i % 2 ? 'sit' : null, face: [rx + .5, ry + .5], held: i % 2 ? null : 'flag', sign: FAC[3].c, act: 'Plotting with the Free Folk', icons: ['fist', 'chat', 'note', 'question'], rate: .15 }); });
        this.diaryAdd(null, 'Two rallies on the same afternoon. Someone painted the well teal.');
      } else {
        const loop = S.march;
        take(14, e => e.age !== 2).forEach((e, i) => { e.faction = 3; e.band = FAC[3].c; cast(e, { route: loop.map((p, j) => [p[0] + (i % 3) - 1, p[1] + ((i / 3) | 0) % 2, j === 1 ? 1.5 : .2]), act: 'Marching on the courthouse', outfit: 'rebel', held: i % 3 === 0 ? 'sign' : 'torch', sign: FAC[3].c, icons: ['fist', 'fire', 'angry', 'bang'], rate: .5, speed: 1.35 }); });
        const cd = S.court ? W.door(S.court) : { x: CX, y: CY - 4 }; W.entities.filter(e => e.job === 'guard' && !e.role).concat(take(3, e => e.age === 0)).slice(0, 6).forEach((e, i) => { const ix = people.indexOf(e); if (ix >= 0) people.splice(ix, 1); cast(e, { x: cd.x - 1.9 + i * .9, y: cd.y + 1.4, dir: 'down', held: 'spear', outfit: 'guard', act: 'Holding the courthouse steps', icons: ['shield', 'bang'], rate: .1 }); });
        (S.barricades || []).forEach(b => take(2, e => e.age === 0, b).forEach((e, i) => cast(e, { x: b[0] + .5 + i, y: b[1] - .3, dir: 'down', held: 'flag', sign: FAC[3].c, outfit: 'rebel', act: 'Defending the barricade', icons: ['fist', 'shield'], rate: .12 })));
        take(6).forEach((e, i) => { const ex = S.exits[i % S.exits.length]; cast(e, { route: [[ex[0], ex[1], 4, 'bang'], [CX + (i - 3) * 2, CY + 7, 1, 'fire']], act: 'Running for it', icons: ['bang', 'heartbreak'], speed: 2.1 }); });
        this.diaryAdd(null, 'Torches on the plaza. The Free Folk march on the courthouse.');
      }
    } else if (ch === 6) {
      const lb = S.library, ld = lb ? W.door(lb) : { x: S.center[0], y: S.center[1] };
      take(6, e => e.age !== 1).forEach((e, i) => { e.title = 'Scholar'; cast(e, { route: [[ld.x, ld.y, 3, 'scroll'], [CX + (i % 3) * 2 - 2, CY + 1, 4, pick(['chat', 'star', 'question'])], [S.monument[0], S.monument[1] + 1, 2]], act: 'Carrying books across town', outfit: 'scholar', held: 'scroll' }); });
      take(10).forEach(e => cast(e, { browse: true, act: 'Shopping at the market' }));
      take(2, e => e.age === 0).forEach((e, i) => cast(e, { x: CX + (i ? 3.5 : -3.5), y: CY - 1.5, pose: 'talk', face: [CX, CY], act: i ? 'Playing the fiddle' : 'Playing the flute', icons: ['note'], rate: .6 }));
      this.diaryAdd(null, 'The library lends its thousandth book. The clock is never wrong.');
    } else if (ch === 7) {
      const [px, py] = S.pact;
      take(1, e => e.age === 2).forEach(e => { e.title = 'The last founder'; cast(e, { x: px + 2.2, y: py + 1.6, pose: 'sit', dir: 'down', act: 'Telling the old stories', icons: ['chat', 'scroll', 'heart', 'star'], rate: .35 }); });
      take(2, e => e.age === 1).forEach((e, i) => cast(e, { x: px + 1.4 + i * 1.7, y: py + 3, pose: 'sit', dir: 'up', act: 'Listening to the old stories', icons: ['question', 'heart', 'bang'], rate: .1 }));
      take(4).forEach((e, i) => cast(e, { route: S.ruinsWalk.map(p => [p[0] + i, p[1], 3 + R() * 3, R() < .4 ? pick(['heartbreak', 'question']) : null]), act: pick(['Looking for anything useful', 'Visiting the old house', 'Counting who is left']), speed: .8, faceOv: 'sad' }));
      this.diaryAdd(null, 'The clock stopped at 4:12. Nobody has wound it since.');
    }
  };
  G.eventUpdate = function (dt, sdt) {
    const ev = this.event; if (!ev || ev.type !== 'civ') return base.eventUpdate.call(this, dt, sdt);
    const W = this.world, R = Math.random, t = this.t; ev.t += sdt;
    ev.roles = ev.roles.filter(r => r.e && W.entities.includes(r.e) && r.e.role === r);
    ev.roles.forEach(r => {
      const e = r.e; if (r.faceOv) e.faceOverride = r.faceOv;
      if (r.route || r.script || !e.roleAt || e.path) return;
      if (r.tool) e.tool = r.tool;
      if (r.poses) e.pose = r.poses[Math.floor(t * .8 + e.phase) % r.poses.length];
      if (r.pact) e.pose = ev.t % 30 > 22 ? 'cheer' : null;
      if (r.kneel && ev.fired.crown) { e.pose = Math.floor(t + e.phase) % 2 ? 'cheer' : null; }
      if (r.rally != null && ev.fired.result) { e.pose = r.rally === ev.winner ? (Math.floor(t * 2 + e.phase) % 2 ? 'cheer' : null) : null; e.faceOverride = r.rally === ev.winner ? 'happy' : 'sad'; }
      if (r.icons && R() < sdt * (r.rate || .2)) e.say(pick(r.icons), 1.5);
    });
    if (ev.ch === 1 && ev.t % 30 > 22 && !ev.fired['p' + Math.floor(ev.t / 30)]) { ev.fired['p' + Math.floor(ev.t / 30)] = true; this.diaryAdd(null, pick(['"We build together, or not at all."', 'The founders vote: yes, unanimously. Mostly.', 'A child adds a tiny handprint to the stone.'])); }
    if (ev.crime) this.crimeTick(ev, sdt);
    if (ev.tally && !ev.fired.result && (ev.tally[0] + ev.tally[1] > 30 || ev.t > 70)) {
      ev.fired.result = true; ev.winner = ev.tally[0] >= ev.tally[1] ? 0 : 1; const w = ev.cands[ev.winner];
      if (w) { w.civOutfit = 'sash'; w.title = 'Elected leader · ' + FAC[ev.winner].name; w.say('crown', 4); for (let i = 0; i < 60; i++) W.particles.push({ k: 'petal', x: w.x * T + (R() - .5) * 20, y: w.y * T - 30, vx: (R() - .5) * 50, vy: -20 - R() * 20, g: 18, life: 3 + R() * 2, max: 5, ph: R() * 10, c: pick([FAC[ev.winner].c, C.s50, C.sun]) }); }
      this.diaryAdd(null, FAC[ev.winner].name + ' wins, ' + Math.round(Math.max(...ev.tally)) + ' to ' + Math.round(Math.min(...ev.tally)) + '. ' + (w ? w.name + ' takes the sash.' : ''));
    }
    if (ev.ch === 3 && W.gov === 'kingdom' && ev.king && ev.t > 14 && !ev.fired.crown) {
      ev.fired.crown = true; const k = ev.king; k.outfit2 = null; k.civOutfit = 'crown'; k.title = W.realm.ruler; k.say('crown', 4);
      for (let i = 0; i < 70; i++) W.particles.push({ k: 'petal', x: k.x * T + (R() - .5) * 30, y: k.y * T - 36, vx: (R() - .5) * 60, vy: -20 - R() * 20, g: 18, life: 3 + R() * 2, max: 5, ph: R() * 10, c: pick([C.sun, C.sun2, C.s50]) });
      this.diaryAdd(null, 'Long live ' + k.name + '! The crown fits, roughly.');
    }
    if (ev.ch === 5 && R() < sdt * .05) this.diaryAdd('rev', pick(['The courthouse doors are barred.', "The founder's statue is down.", 'Someone is ringing the bell over and over.', 'The guards have not moved. Neither have the rebels.']), 18);
    if (ev.ch === 6 && this.light.L > .45 && R() < sdt * .7) W.particles.push({ k: 'rocket', x: (W.civ.center[0] + (R() - .5) * 10) * T, y: (W.civ.center[1] + 2) * T, vx: (R() - .5) * 14, vy: -95 - R() * 35, life: 1 + R() * .4, max: 1.4 });
  };
  G.crimeTick = function (ev, sdt) {
    const c = ev.crime, W = this.world, th = c.thief, gd = c.guard, R = Math.random; if (!W.entities.includes(th) || !W.entities.includes(gd)) { ev.crime = null; return; }
    c.t += sdt; const near = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) < d, go = (e, x, y, cb) => { const tile = walkNear(W, x, y, 3); if (tile) e.goTo(tile[0], tile[1], cb); };
    const cd = W.door(W.civ.court), so = W.civ.stocksObj;
    if (c.ph === 'sneak') {
      if (!c.go) { c.go = true; c.stall = pick(W.poi('stalls')) || c.stall; th.activity = 'Looking innocent'; go(th, c.stall.x + 1, c.stall.y + 1, () => { c.arr = true; }); gd.activity = 'On patrol'; go(gd, cd.x + 1, cd.y + 1); }
      if (c.arr && c.t > 4) { c.ph = 'flee'; c.t = 0; c.go = false; c.arr = false; th.roleHeld = 'sack'; th.say('loot', 2); th.activity = 'Running off with a pie'; this.diaryAdd(null, th.name + ' just grabbed something from the market stall!'); const ex = pick(W.civ.exits); th._spd = th._spd || th.speed; th.speed = 2.3; go(th, ex[0], ex[1]); gd.say('bang', 2); gd._spd = gd._spd || gd.speed; gd.speed = 2.7; gd.activity = 'Chasing a thief'; }
    } else if (c.ph === 'flee') {
      c.rp = (c.rp || 0) - sdt; if (c.rp <= 0) { c.rp = .6; go(gd, Math.floor(th.x), Math.floor(th.y)); }
      if (near(th, gd, 1.2) || c.t > 30) { c.ph = 'march'; c.t = 0; th.path = null; gd.path = null; th.say('heartbreak', 2.5); gd.say('shield', 2); th.roleHeld = null; th.speed = 1.1; gd.speed = 1.2; this.diaryAdd(null, gd.name + ' caught ' + th.name + ' by the collar.'); go(th, cd.x, cd.y + 2, () => { c.ta = true; }); go(gd, cd.x + 1, cd.y + 2, () => { c.ga = true; }); th.activity = 'Being marched to court'; gd.activity = 'Escorting the accused'; }
    } else if (c.ph === 'march') {
      if ((c.ta && c.ga) || c.t > 25) { c.ph = 'trial'; c.t = 0; c.ta = c.ga = false; th.dir = 'up'; gd.dir = 'up'; th.faceOverride = 'sad'; th.activity = 'On trial'; gd.activity = 'Testifying'; }
    } else if (c.ph === 'trial') {
      if (R() < sdt * .4) gd.say(pick(['chat', 'shield', 'loot']), 1.4); if (R() < sdt * .3) th.say(pick(['question', 'heartbreak', 'heart']), 1.4);
      if (c.t > 12) { const jd = ev.roles.find(r => r.judge); if (jd) jd.e.say('scales', 3); this.diaryAdd(null, 'Verdict: guilty. ' + th.name + ' gets an afternoon in the stocks.'); c.ph = 'tostocks'; c.t = 0; if (so) go(th, so.x, so.y + 1, () => { c.ta = true; }); go(gd, cd.x + 2, cd.y + 1); th.activity = 'Walking to the stocks'; gd.activity = 'Back on duty'; }
    } else if (c.ph === 'tostocks') {
      if (c.ta || c.t > 20) { c.ph = 'stocks'; c.t = 0; c.ta = false; th.outfit2 = 'prisoner'; if (so) { th.x = so.x + 1; th.y = so.y + .35; th.sortY = so.y + .5; th.dir = 'down'; } th.activity = 'Serving time in the stocks'; th.faceOverride = 'sad'; }
    } else if (c.ph === 'stocks') {
      if (R() < sdt * .25) th.say(pick(['heartbreak', 'question', 'zzz']), 1.4);
      if (c.t > 24) { c.ph = 'sneak'; c.t = 0; c.go = false; th.outfit2 = 'thief'; th.sortY = null; th.faceOverride = null; th.speed = th._spd || 1.5; gd.speed = gd._spd || 1.5; const tile = walkNear(W, th.x, th.y + 1, 2); if (tile) { th.x = tile[0] + .5; th.y = tile[1] + .5; } this.diaryAdd(null, th.name + ' is free, and suspiciously close to the market again.'); }
    }
  };

  /* ================= Aster: eight chapters ================= */
  const CH = [
    { name: 'Landfall', year: 'Year 1', hour: 7.4, m: [.1, .15, .95, .7], head: 'Seven settlers wash up with one raft and a shared goal.', gov: () => 'Nobody in charge' },
    { name: 'The Pact', year: 'Year 3', hour: 9.2, m: [.24, .38, .85, .9], head: 'Around the pact stone, the founders agree how to live.', gov: () => 'Circle of founders' },
    { name: 'First Laws', year: 'Year 9', hour: 10.4, m: [.42, .62, .62, .72], head: 'The first theft, the first trial, the first afternoon in the stocks.', gov: () => 'Settlement council' },
    { name: 'Who Rules', year: 'Year 15', hour: 11, m: [.55, .7, .6, .62], head: '', gov: g => ({ republic: 'Republic of Aster', kingdom: 'Kingdom of Aster', council: 'Council of Elders' })[g] },
    { name: 'Factions', year: 'Year 22', hour: 16.4, m: [.6, .42, .55, .3], head: 'Hearth and the River League no longer share a table.', gov: g => ({ republic: 'Republic, divided', kingdom: 'Kingdom, uneasy', council: 'Council, deadlocked' })[g] },
    { name: 'Revolution', year: 'Year 24', hour: 20.6, m: [.28, .1, .38, .12], head: 'The Free Folk march on the courthouse with torches.', gov: () => 'Nobody, tonight' },
    { name: 'Golden Age', year: 'Year 40', hour: 18.3, m: [.93, .82, .78, .86], head: 'A library, a clock tower, and an argument-free week.', gov: () => 'Commonwealth of Aster' },
    { name: 'Collapse', year: 'Year 71', hour: 16.8, m: [.06, .14, .5, .1], head: 'The clock stopped. So did most of the village.', gov: () => 'What remains' }
  ];
  const HEAD3 = { republic: 'Election day. Two parties, one ballot box.', kingdom: 'A coronation under the castle walls.', council: 'The elders sit down at the council fire.' };
  const FSHARE = [[['Settlers', C.s400, 1]], [['Founders', C.s400, 1]], [['Townsfolk', C.s400, 1]], null, [[0, .42], [1, .38], [3, .2]], [[0, .25], [1, .25], [3, .5]], [[2, .82], [0, .1], [1, .08]], [['Remnants', C.co400, 1]]];
  function realm(ch, gov) {
    const c = CH[ch], fs = (ch === 3 ? (gov === 'kingdom' ? [[2, .7], [3, .3]] : gov === 'republic' ? [[0, .5], [1, .5]] : [['Elders', C.p600, .3], ['Townsfolk', C.s400, .7]]) : FSHARE[ch]).map(x => typeof x[0] === 'number' ? [FAC[x[0]].name, FAC[x[0]].c, x[1]] : x);
    return { year: c.year, chapter: c.name, gov: c.gov(gov), headline: ch === 3 ? HEAD3[gov] : c.head, objective: { republic: 'Establish a democracy', kingdom: 'Found a kingdom', council: 'Build a civilization' }[gov], meters: ['Prosperity', 'Order', 'Freedom', 'Unity'].map((n, i) => [n, c.m[i]]), factions: fs, ruler: gov === 'kingdom' ? 'Ruler of Aster' : 'Leader' };
  }
  function genesis(seed, opts) {
    const ch = Math.max(0, Math.min(7, opts.chapter == null ? 0 : opts.chapter | 0)), gov = opts.gov || 'republic';
    const W = new LW.World(64, 44, seed), N = W.noise, G2 = LW.gen, TID = A.TID, CX = 32, CY = 19;
    W.name = 'Aster'; W.climate = 'temperate'; W.season = ch === 7 ? 2 : 1; W.chapter = ch; W.gov = gov; W.realm = realm(ch, gov);
    const coast = x => 35 + Math.sin(x * .17) * 1.6 + (N.n2(x * .2, 4) - .5) * 2 - (x < 22 ? (22 - x) * .55 : 0);
    const clear = [0, 10, 12, 13, 14, 14, 16, 11][ch], campX = 14, campY = Math.round(coast(14)) - 4;
    G2.forTiles(W, (x, y) => {
      const cy = coast(x); let t;
      if (y > cy + 3) t = 'deep'; else if (y > cy) t = 'water'; else if (y > cy - 2.2) t = 'sand';
      else { const d = Math.hypot((x - CX) / 1.3, y - CY), dc = Math.hypot((x - campX) / 1.4, y - campY), f = N.fbm(x * .1 + 3, y * .1 + 7); t = d < clear || dc < 5 ? 'grass' : f + Math.min(.35, Math.max(0, d - clear) * .035) > .47 ? 'meadow' : 'grass'; if (y < 3 + N.n2(x * .2, 1) * 2) t = 'stone'; }
      G2.setRaw(W, x, y, t);
    });
    const S = W.civ = { center: [CX, CY], camp: [campX, campY], pact: [CX, CY], exits: [[2, CY], [61, CY], [CX, 2]], bushes: [], rallies: [[CX - 8, CY - 1], [CX + 7, CY - 1]], rebel: [53, 9], march: [[CX - 6, CY + 4], [CX, CY - 3], [CX + 6, CY + 4], [CX, CY + 6]], ruinsWalk: [[CX - 6, CY - 4], [CX + 6, CY - 3], [CX + 5, CY + 5], [CX - 5, CY + 5]] };
    const homes = [], putP = (id, x, y, o, m, r) => G2.placeNear(W, id, x, y, o || {}, m == null ? 1 : m, r == null ? 3 : r), link = (o, tile) => o && G2.link(W, o, CX, CY + 2, tile);
    const sh = W.poi('shore'); S.shore = G2.nearestOf(W, sh, campX + 4, campY + 4) || [campX, campY + 3];
    const camp = [], huts = [];
    // 0 · landfall
    { let rt = null; for (let x = campX - 4; x < campX + 6 && !rt; x++) for (let y = campY + 2; y < 44 && !rt; y++) if (W.canPlace('raft', x, y) && !W.isWater(x, y - 1)) rt = [x, y]; if (rt) W.place('raft', rt[0], rt[1]); }
    [[-3, 0], [0, -1], [3, 0]].forEach(([dx, dy]) => { const o = putP('leanto', campX + dx, campY + dy, {}, 0, 2); if (o) camp.push(o); });
    camp.push(W.place('campfire', campX, campY + 2)); [putP('rack', campX - 5, campY + 2, {}, 0, 2), putP('logpile', campX + 5, campY + 1, {}, 0, 2)].forEach(o => o && camp.push(o));
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, b = putP('bush', Math.round(campX + 4 + Math.cos(a) * 8), Math.round(campY - 4 + Math.sin(a) * 5), { v: 1 }, 0, 2); if (b) S.bushes.push([b.x, b.y]); }
    if (ch >= 1) {
      camp.filter(o => o.id !== 'campfire').forEach(o => W.remove(o));
      W.place('pactstone', CX, CY); const fire = putP('campfire', CX - 2, CY + 1, {}, 0, 2);
      [[26, 14], [34, 12], [38, 17], [37, 23], [26, 23], [22, 18]].forEach(([x, y], i) => { const h = putP('hut', x, y, { v: i % 2 }); if (h) { huts.push(h); link(h); } });
      putP('granary', 39, 22 + 0, {}, 1, 4); G2.field(W, 13, 11, 5, 3, 'wheat'); G2.field(W, 48, 12, 5, 3, 'wheat'); G2.field(W, 13, 15, 4, 3, 'cabbage');
      const ring = new Set(); for (let a = 0; a < Math.PI * 2; a += .02) { const x = Math.round(CX + Math.cos(a) * 13), y = Math.round(CY + Math.sin(a) * 9.5); if ((Math.abs(x - CX) <= 1) || Math.abs(y - CY) <= 1) continue; ring.add(x + ',' + y); }
      ring.forEach(k => { const [x, y] = k.split(',').map(Number); if (W.canPlace('palisade', x, y)) W.place('palisade', x, y); });
      W.canPlace('gate', CX - 1, CY + 10) && W.place('gate', CX - 1, CY + 10);
      W.carvePath(CX, CY + 2, CX, 40); W.carvePath(CX - 1, CY, 2, CY); W.carvePath(CX + 1, CY, 61, CY); W.carvePath(campX, campY + 1, CX - 2, CY + 9);
      if (ch >= 2 && fire) W.remove(fire);
    }
    if (ch >= 2) {
      huts.forEach((h, i) => { W.remove(h); const c = W.canPlace('cottage', h.x, h.y) ? W.place('cottage', h.x, h.y, { v: [0, 1, 3][i % 3] }) : null; if (c) homes.push(c); });
      for (let y = CY - 2; y <= CY + 3; y++) for (let x = CX - 4; x <= CX + 4; x++) if (W.tile(x, y) >= 2 && !W.occ[y * W.w + x]) G2.setRaw(W, x, y, 'plaza');
      S.court = putP('courthouse', CX - 1, CY - 6, {}, 1, 3); link(S.court);
      const jl = putP('jail', CX + 8, CY - 4, {}, 1, 3); link(jl);
      S.stocksObj = putP('stocks', CX - 4, CY + 2, {}, 0, 2); if (S.stocksObj) S.stocks = [S.stocksObj.x, S.stocksObj.y];
      const nb = putP('noticeboard', CX + 3, CY + 3, { v: ch === 5 ? 1 : 0 }, 0, 2); if (nb) S.board = [nb.x, nb.y];
      [[CX - 4, CY - 1, 0], [CX + 2, CY - 2, 1]].forEach(([x, y, v]) => putP('stall', x, y, { v }, 0, 2));
      S.statue = putP('statue2', CX + 4, CY, { v: 0 }, 0, 2);
      [[CX - 5, CY - 3], [CX + 5, CY - 3], [CX - 5, CY + 4], [CX + 5, CY + 4]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
      [[20, 13], [43, 19], [21, 23]].forEach(([x, y], i) => { const c = putP('cottage', x, y, { v: i }); if (c) { homes.push(c); link(c); } });
    }
    if (ch >= 3) {
      S.seat = gov === 'kingdom' ? putP('castle', CX - 2, 3, {}, 1, 3) : gov === 'republic' ? putP('parliament', CX - 2, 4, {}, 1, 3) : putP('hall', CX - 2, 5, { v: 1 }, 1, 3);
      if (S.seat) { W.carvePath(W.door(S.seat).x, W.door(S.seat).y, CX, CY - 2, 'plaza'); S.seat.flag = 2; }
      link(putP('tavern', CX + 6, CY + 5));
      [[23, 9], [40, 8], [18, 27], [45, 25]].forEach(([x, y], i) => { const c = putP('cottage', x, y, { v: (i + 1) % 4 }); if (c) { homes.push(c); link(c); } });
    }
    if (ch >= 4) {
      link(putP('bakery', CX - 9, CY + 4));
      const rc = []; [[52, 6], [55, 9], [50, 10]].forEach(([x, y]) => { const t = putP('tent', x, y, { v: 0 }, 1, 2); if (t) rc.push(t); }); const rf = putP('campfire', 53, 12, {}, 0, 2); const fl = putP('flag', 56, 5, { v: 3 }, 0, 2); rc.push(rf, fl); S.rebelObjs = rc.filter(Boolean);
      [[49, 18], [50, 24], [11, 20], [12, 25]].forEach(([x, y], i) => { const c = putP('cottage', x, y, { v: i % 4 }); if (c) { homes.push(c); link(c); } });
      W.fmap = new Uint8Array(W.w * W.h); W.districts = [{ x: CX - 11, y: CY - 7, f: 0 }, { x: CX + 13, y: CY - 7, f: 1 }, { x: 57, y: 13, f: 3 }];
      G2.forTiles(W, (x, y) => { if (W.tile(x, y) < 2) return; if (Math.hypot(x - 53, (y - 9) * 1.2) < 6) W.fmap[y * W.w + x] = 4; else if (Math.hypot((x - CX) / 1.6, y - CY) < 13) W.fmap[y * W.w + x] = x < CX + .5 ? 1 : 2; });
      W.objects.forEach(o => { if (o.def.home && o.def.cat === 'building' && o.id !== 'tent') { const f = W.fmap[(o.y + 1) * W.w + o.x + 1]; if (f) o.flag = f - 1; } });
    }
    if (ch === 5) {
      S.barricades = []; [[CX - 6, CY + 5], [CX + 5, CY - 4], [CX + 6, CY + 2]].forEach(([x, y]) => { const b = putP('barricade', x, y, {}, 0, 3); if (b) S.barricades.push([b.x, b.y]); });
      if (S.statue) S.statue.opts.v = 1;
      W.objects.filter(o => o.id === 'tavern' || (o.id === 'cottage' && A.hash2(o.x, o.y) < .3) || o.id === 'jail').slice(0, 4).forEach(o => { o.burning = true; o.decay = 1; });
      W.grade = '#F4CDB6';
    }
    if (ch >= 6) {
      W.fmap = null; W.districts = null;
      W.objects.filter(o => o.id === 'palisade' || o.id === 'gate').forEach(o => W.remove(o));
      (S.rebelObjs || []).forEach(o => W.remove(o));
      W.objects.forEach(o => { o.flag = (o.id === 'courthouse' || o.id === 'parliament' || o.id === 'hall' || o.id === 'castle') ? 2 : null; });
      S.library = putP('library', CX + 9, CY - 7, {}, 1, 3); link(S.library);
      link(putP('clocktower', CX - 6, CY - 3, {}, 0, 2)); const mn = putP('monument', CX - 1, CY + 1, {}, 0, 2); S.monument = mn ? [mn.x, mn.y] : [CX, CY];
      W.canPlace('fountain', CX + 1, CY + 2) && W.place('fountain', CX + 1, CY + 2); putP('bunting', CX - 3, CY - 3, {}, 0, 2); putP('bunting', CX - 3, CY + 4, {}, 0, 2);
      [[52, 8], [55, 13], [8, 15], [9, 26], [27, 30], [40, 30], [54, 20]].forEach(([x, y], i) => { const c = putP('cottage', x, y, { v: i % 4 }); if (c) { homes.push(c); link(c); } });
      [[CX - 8, CY], [CX + 8, CY], [CX, CY - 8], [CX, CY + 8]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
      W.grade = ch === 6 ? '#FFF4E2' : null;
    }
    if (ch === 7) {
      W.objects.slice().forEach(o => {
        const d = o.def, h = A.hash2(o.x * 3, o.y * 7);
        if (d.cat === 'building' || d.cat === 'civic' || d.cat === 'life' || d.cat === 'event' || d.cat === 'prop') {
          if (o.id === 'bunting' || (o.id === 'lamp' && h < .6) || o.id === 'fountain' || d.crop) { W.remove(o); return; }
          if (o.id === 'cottage' && h < .3) { W.remove(o); const i = homes.indexOf(o); if (i >= 0) homes.splice(i, 1); W.canPlace('rock', o.x, o.y) && W.place('rock', o.x, o.y, { v: 1 }); W.canPlace('bush', o.x + 1, o.y + 1) && W.place('bush', o.x + 1, o.y + 1, {}); return; }
          o.decay = d.home && h > .7 ? 1 : 2;
        }
      });
      W.objects.filter(o => o.def.crop).forEach(o => W.remove(o));
      if (S.statue && W.objects.includes(S.statue)) S.statue.opts.v = 1;
      for (let i = 0; i < 7; i++) { const x = CX + 7 + (i % 4) * 1, y = CY + 4 + Math.floor(i / 4) * 2; W.canPlace('grave', x, y) && W.place('grave', x, y, { v: i % 3 }); }
      W.grade = '#CBCDBE'; W.forceWeather = 'fog';
    }
    // nature
    const av = [{ x: CX, y: CY, rx: clear * 1.3, ry: clear }, { x: campX, y: campY, rx: 7, ry: 5 }];
    G2.scatter(W, [
      { on: [TID.meadow], id: 'oak', p: .26, o: () => ({ v: W.rng() < .15 ? 1 : 0 }) }, { on: [TID.meadow], id: 'pine', p: .18 }, { on: [TID.meadow], id: 'birch', p: .08 },
      { on: [TID.sand], id: 'palm', p: .05, o: () => ({ flip: W.rng() < .5 }) }, { on: [TID.stone], id: 'rock', p: .15, o: () => ({ v: W.rng() < .5 ? 1 : 0 }) },
      { on: [TID.grass, TID.meadow], id: 'bush', p: .03, o: () => ({ v: (W.rng() * 3) | 0 }) }
    ], av);
    if (ch === 7) G2.scatter(W, [{ on: [TID.grass, TID.path, TID.plaza], id: 'bush', p: .05 }, { on: [TID.grass, TID.path], id: 'tuft', p: .2 }, { on: [TID.grass], id: 'oak', p: (x, y) => Math.hypot((x - CX) / 1.3, y - CY) > 8 ? .05 : 0 }]);
    G2.scatter(W, [{ on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) }, { on: [TID.grass, TID.meadow], id: 'tuft', p: .08 }]);
    // people
    const J = [{ wanderer: 1, woodcutter: 2, fisher: 1, builder: 1, farmer: 2 }, { farmer: 4, woodcutter: 3, builder: 3, fisher: 2, kid: 2, wanderer: 2 }, { farmer: 4, woodcutter: 2, builder: 2, fisher: 2, guard: 2, merchant: 2, kid: 3, wanderer: 4 }, { farmer: 4, woodcutter: 2, builder: 2, fisher: 2, guard: 3, merchant: 2, innkeeper: 1, kid: 4, wanderer: 6 },
      { farmer: 5, woodcutter: 2, builder: 2, fisher: 2, guard: 3, merchant: 3, innkeeper: 1, baker: 1, kid: 5, wanderer: 8 }, null, { farmer: 5, woodcutter: 2, builder: 3, fisher: 2, guard: 3, merchant: 4, innkeeper: 1, baker: 1, kid: 6, wanderer: 8 }, { wanderer: 4, farmer: 1, kid: 2 }];
    const hs = W.objects.filter(o => o.def.home && o.def.cat !== 'life' && !(o.decay >= 2));
    G2.populate(W, { homes: ch === 0 ? [] : hs, cx: ch === 0 ? campX : CX, cy: ch === 0 ? campY + 1 : CY + 2 }, J[ch] || J[4]);
    const vs = W.entities.filter(e => e.kind === 'villager');
    vs.forEach((e, i) => {
      if (e.job === 'kid') e.age = 1; else if (e.job === 'wanderer') e.age = i % 3 === 0 ? 2 : 0;
      if (ch <= 1) e.civOutfit = 'settler';
      if (e.job === 'guard' && ch >= 2 && ch !== 7) e.held = 'spear';
      if (W.fmap) { const f = W.fmap[Math.floor(e.y) * W.w + Math.floor(e.x)]; e.faction = f ? f - 1 : (e.x < CX ? 0 : 1); if (i % 6 === 5) e.faction = 3; e.band = FAC[e.faction].c; }
    });
    const elder = vs.find(e => e.age === 2) || vs[0];
    if (elder && ch >= 1 && ch !== 7) { W.leader = elder; elder.title = ch >= 3 ? W.realm.ruler : 'Founder'; if (ch >= 4 || (ch === 3 && gov === 'council')) elder.civOutfit = gov === 'kingdom' ? 'crown' : gov === 'republic' ? 'sash' : 'sage'; }
    if (ch === 0) { G2.critters(W, 'deer', 5, { x: 40, y: 16 }, 12, () => W.rng() < .3 ? 1 : 0); G2.critters(W, 'rabbit', 6, { x: 26, y: 26 }, 10, 0); G2.critters(W, 'fox', 1, { x: 46, y: 22 }, 10, 0); }
    if (ch >= 1 && ch <= 6) G2.critters(W, 'chicken', 2 + ch, { x: CX - 3, y: CY + 5 }, 4, () => W.rng() < .5 ? 0 : 1);
    if (ch >= 2 && ch <= 6) G2.critters(W, 'cat', 2, { x: CX, y: CY }, 6, () => (W.rng() * 3) | 0);
    if (ch === 7) { G2.critters(W, 'crow', 9, { x: CX, y: CY }, 9, 0); G2.critters(W, 'deer', 3, { x: CX + 6, y: CY - 6 }, 6, 0); }
    G2.critters(W, 'duck', 3, { x: 30, y: 39 }, 5, 0);
    W.startHour = CH[ch].hour; W.focus = ch === 0 ? { x: campX + 3, y: campY - 1 } : ch === 3 ? { x: CX, y: CY - 4 } : ch === 4 ? { x: CX + 5, y: CY - 2 } : { x: CX, y: CY - 1 };
    return W;
  }
  LW.registerPreset({ id: 'aster', name: 'Aster', blurb: 'One valley, from first landfall to its last lamp', chapters: CH.map(c => c.name) }, genesis, true);
  LW.CHAPTERS = CH;
})();
