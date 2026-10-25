/* Little Worlds — expansion pack: civic buildings, landmarks, forests, wildlife, camp props.
   Registers into LW.Assets via def(); same conventions as the base pack (16px tiles, auto-outline, variants, frames).
   New def flags read by the engine: seasonMap [spring,summer,autumn,winter] variant · smoke{dark} · mist · splash · lights mode forge|rune
   · role flags (tavern, smith, bakery, mill, mine, hut, tower, keep) · visit (landmarks villagers wander to) · winterHide. */
(function () {
  'use strict';
  const A = window.LW.Assets, C = A.C, def = A.def, { R, P, disc, oval, line, roof, grid } = A.draw, ROOFS = A.ROOFS, LEAVES = A.LEAVES;
  const SLATE = [C.co500, C.co600, C.co700, C.ink2], STONE = [C.co300, C.co300, C.co400], STONE2 = [C.co400, C.co400, C.co500];
  const GOLD = [C.glow2, C.sun, C.sun2, '#B98227'], RUNE = '#8FF5E6';
  function bricks(g, x, y, w, h, cols, bh) { bh = bh || 3; for (let r = 0; r * bh < h; r++) { const yy = y + r * bh, hh = Math.min(bh, h - r * bh); R(g, x, yy, w, hh, cols[0]); R(g, x, yy + hh - 1, w, 1, cols[2]); for (let xx = x + (r % 2) * 3; xx < x + w; xx += 6) R(g, xx, yy, 1, hh, cols[2]); } }
  function crenel(g, x, y, w, c) { for (let k = x; k < x + w - 2; k += 6) { R(g, k, y, 4, 4, c); R(g, k, y, 4, 1, C.co200); } }
  ['flowers', 'tuft', 'lily'].forEach(id => { A.get(id).winterHide = true; });
  A.get('wheat').winterHide = true;

  /* ---------- civic buildings ---------- */
  def('tavern', {
    name: 'Tavern', cat: 'building', foot: [3, 2], box: [54, 60, 27, 59], solid: true, litable: true, variants: 2, tavern: true,
    desc: 'Opens at noon. Closes when the last song ends.',
    lights: [{ x: -15, y: -11, r: 26, mode: 'win' }, { x: 15, y: -11, r: 26, mode: 'win' }, { x: 0, y: -28, r: 30, mode: 'win' }], smoke: [{ x: 13, y: -59 }],
    draw(g, o) {
      const r = ROOFS[o.v ? 1 : 0];
      R(g, 5, 42, 44, 17, C.s100); R(g, 5, 42, 44, 2, C.s300); R(g, 5, 56, 44, 3, C.co400);
      [5, 16, 37, 47].forEach(x => R(g, x, 42, 2, 15, C.w3));
      R(g, 22, 45, 10, 14, C.w3); R(g, 23, 46, 8, 13, C.w2); R(g, 27, 46, 1, 13, C.w3); P(g, 25, 52, C.sun); P(g, 29, 52, C.sun);
      const bw = x => { R(g, x, 45, 9, 7, C.w3); R(g, x + 1, 46, 7, 5, o.lit ? C.glow : C.glass); R(g, x + 4, 46, 1, 5, C.w3); R(g, x + 1, 48, 7, 1, C.w3); if (o.lit) { P(g, x + 1, 46, C.glow2); P(g, x + 5, 46, C.glow2); } else P(g, x + 1, 46, C.l300); R(g, x - 1, 52, 11, 1, C.w3); };
      bw(8); bw(37);
      R(g, 3, 39, 48, 3, C.w3); R(g, 3, 39, 48, 1, C.w2);
      R(g, 3, 24, 48, 15, C.s50); R(g, 3, 24, 48, 1, C.s300);
      [3, 14, 26, 38, 49].forEach(x => R(g, x, 24, 2, 15, C.w3));
      const sw = x => { R(g, x, 28, 6, 6, C.w3); R(g, x + 1, 29, 4, 4, o.lit ? C.glow : C.glass); R(g, x + 1, 31, 4, 1, C.w3); if (o.lit) P(g, x + 1, 29, C.glow2); };
      sw(18); sw(30);
      line(g, 5, 37, 13, 26, C.w3); line(g, 40, 26, 48, 37, C.w3);
      roof(g, 27, 3, 22, 30, 54, r);
      R(g, 37, 0, 6, 11, C.c600); R(g, 37, 0, 6, 2, C.c700); R(g, 38, 0, 4, 1, C.ink2);
      R(g, 0, 30, 7, 1, C.w4); P(g, 1, 31, C.w4); P(g, 5, 31, C.w4);
      R(g, 0, 32, 7, 7, C.w1); R(g, 0, 32, 7, 1, C.w2); R(g, 0, 38, 7, 1, C.w3); R(g, 2, 34, 3, 3, C.sun); P(g, 5, 35, C.sun2); P(g, 2, 33, C.s50); P(g, 3, 33, C.s50);
      oval(g, 35, 56, 2, 2, C.w2); R(g, 33, 56, 5, 1, C.co600); oval(g, 19, 57, 2, 1, C.w2);
    }
  });
  def('bakery', {
    name: 'Bakery', cat: 'building', foot: [2, 2], box: [40, 44, 17, 43], solid: true, litable: true, frames: 3, fps: 5, bakery: true,
    desc: 'Smells like Tuesday mornings.',
    lights: [{ x: 5, y: -8, r: 24, mode: 'win' }, { x: 16, y: -3, r: 20, mode: 'forge' }], smoke: [{ x: 6, y: -43 }],
    draw(g, o) {
      const wl = A.WALLS[2];
      R(g, 2, 25, 30, 18, wl[0]); R(g, 2, 25, 1, 18, wl[1]); R(g, 31, 25, 1, 18, wl[1]); R(g, 2, 25, 30, 2, wl[2]); R(g, 2, 40, 30, 3, wl[2]);
      R(g, 5, 30, 8, 13, C.w3); R(g, 6, 31, 6, 12, C.l500); R(g, 7, 32, 4, 4, o.lit ? C.glow : C.glass); P(g, 11, 37, C.sun);
      R(g, 16, 31, 13, 8, C.w3); R(g, 17, 32, 11, 6, o.lit ? C.glow : C.l300);
      [[18, 35], [21, 34], [24, 35]].forEach(([x, y]) => { R(g, x, y, 3, 2, C.c400); P(g, x + 1, y, C.s300); }); R(g, 17, 37, 11, 1, C.w2);
      for (let x = 15; x < 31; x++) { const c = Math.floor((x - 15) / 3) % 2 ? C.s50 : C.c500; R(g, x, 27, 1, 3, c); if ((x - 15) % 3 !== 1) P(g, x, 30, c); }
      roof(g, 17, 5, 21, 20, 34, ROOFS[2]);
      R(g, 21, 0, 5, 12, C.c600); R(g, 21, 0, 5, 2, C.c700); R(g, 22, 0, 3, 1, C.ink2);
      oval(g, 33, 38, 6, 5, C.c600); oval(g, 32, 37, 5, 4, C.c500); P(g, 30, 34, C.c400); P(g, 31, 34, C.c400);
      const f = o.frame % 3; R(g, 31, 39, 5, 4, C.ink2); R(g, 32, 40, 3, 3, f === 1 ? C.sun : C.c400); P(g, 33, 41 - (f % 2), C.glow2);
      R(g, 4, 22, 9, 1, C.w4); grid(g, ['.x.x.', 'x.x.x', 'x.x.x', '.xxx.'], { x: C.c500 }, 7, 23);
    }
  });
  def('blacksmith', {
    name: 'Blacksmith', cat: 'building', foot: [2, 2], box: [38, 44, 18, 43], solid: true, frames: 3, fps: 6, litable: true, smith: true,
    desc: 'Fixes everything. Breaks it again to be sure.',
    lights: [{ x: -7, y: -9, r: 30, mode: 'forge' }], smoke: [{ x: -9, y: -43, dark: true }],
    draw(g, o) {
      bricks(g, 3, 25, 30, 18, STONE); R(g, 30, 25, 3, 18, C.co400); R(g, 3, 40, 30, 3, C.co400);
      R(g, 5, 28, 12, 15, C.ink2); R(g, 4, 27, 14, 1, C.w3); R(g, 4, 27, 1, 16, C.w3); R(g, 17, 27, 1, 16, C.w3);
      R(g, 6, 37, 10, 6, C.co600); R(g, 6, 37, 10, 1, C.co500); R(g, 8, 34, 6, 3, C.co700);
      const f = o.frame % 3; R(g, 8, 33 - f, 6, 3 + f, C.c400); R(g, 9, 34 - f, 4, 2, C.sun); P(g, 10 + (f % 2), 32 - f, C.glow2); P(g, 7, 36, C.c500); P(g, 14, 36, C.c500);
      R(g, 14, 29, 1, 3, C.co500); R(g, 13, 29, 3, 1, C.co200); R(g, 7, 29, 1, 4, C.co500);
      R(g, 21, 30, 8, 13, C.w3); R(g, 22, 31, 6, 12, C.w2); R(g, 25, 31, 1, 12, C.w3); P(g, 27, 36, C.sun);
      roof(g, 18, 5, 22, 24, 38, SLATE);
      R(g, 6, 0, 6, 13, C.co400); R(g, 6, 0, 6, 2, C.co500); R(g, 7, 0, 4, 1, C.ink2); R(g, 10, 2, 2, 11, C.co500);
      R(g, 30, 21, 8, 1, C.w4); R(g, 31, 22, 6, 6, C.w1); R(g, 31, 22, 6, 1, C.w2); R(g, 32, 24, 4, 1, C.co600); R(g, 32, 24, 1, 3, C.co600); R(g, 35, 24, 1, 3, C.co600);
      R(g, 29, 37, 8, 2, C.co600); R(g, 29, 37, 8, 1, C.co500); R(g, 31, 39, 4, 2, C.co700); R(g, 30, 41, 6, 2, C.w3); P(g, 36, 38, C.co600);
    }
  });
  def('lumbermill', {
    name: 'Lumber Mill', cat: 'building', foot: [3, 2], box: [60, 48, 24, 47], solid: true, frames: 8, fps: 6, mill: true,
    desc: 'Turns trees into planks and the river into noise. Wants water on its right.', splash: [{ x: 26, y: -4 }],
    draw(g, o) {
      [[4, 45], [9, 45], [14, 45], [6, 41], [11, 41], [8, 37]].forEach(([x, y]) => { disc(g, x, y, 2, C.w1); P(g, x, y, C.w2); });
      R(g, 10, 24, 34, 23, C.w2); for (let x = 13; x < 44; x += 4) R(g, x, 24, 1, 23, C.w3); R(g, 10, 44, 34, 3, C.w3);
      R(g, 18, 31, 18, 16, C.ink2); R(g, 17, 30, 20, 1, C.w4);
      const a0 = o.frame * Math.PI / 16;
      disc(g, 27, 37, 5, C.co200); for (let k = 0; k < 8; k++) { const a = a0 * 2 + k * Math.PI / 4; P(g, 27 + Math.cos(a) * 6, 37 + Math.sin(a) * 6, C.co300); }
      line(g, 27 + Math.cos(a0 * 2) * 4, 37 + Math.sin(a0 * 2) * 4, 27 - Math.cos(a0 * 2) * 4, 37 - Math.sin(a0 * 2) * 4, C.co400); P(g, 27, 37, C.co600);
      R(g, 19, 42, 17, 3, C.w1); R(g, 19, 42, 17, 1, C.s300); P(g, 22, 41, C.s200); P(g, 31, 41, C.s200);
      roof(g, 27, 6, 19, 30, 40, ROOFS[0]);
      const cx = 50, cy = 33;
      for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; P(g, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, C.w4); }
      for (let k = 0; k < 8; k++) { const a = a0 + k * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a); line(g, cx, cy, cx + ca * 8, cy + sa * 8, C.w3); R(g, cx + ca * 9 - 1, cy + sa * 9 - 1, 3, 3, C.w2); }
      disc(g, cx, cy, 2, C.w4); P(g, cx, cy, C.w1);
      R(g, 41, 44, 19, 3, C.l300); for (let x = 41; x < 60; x += 2) P(g, x + (o.frame % 2), 44, C.s50); P(g, cx + 6, cy + 3 + (o.frame % 3), C.l200); P(g, cx + 7, cy + 6 + (o.frame % 2), C.l200);
    }
  });
  def('fishhut', {
    name: 'Fishing Hut', cat: 'building', foot: [2, 2], box: [38, 46, 17, 45], solid: true, litable: true, home: 1, hut: true,
    desc: 'Smells exactly how you think.', lights: [{ x: 5, y: -25, r: 20, mode: 'win' }],
    draw(g, o) {
      [5, 15, 26].forEach(x => { R(g, x, 30, 2, 15, C.w3); R(g, x, 30, 1, 15, C.w2); }); line(g, 6, 44, 16, 32, C.w4); line(g, 16, 44, 26, 32, C.w4);
      R(g, 1, 28, 34, 3, C.w2); for (let x = 3; x < 35; x += 4) P(g, x, 29, C.w3); R(g, 1, 30, 34, 1, C.w3);
      R(g, 4, 14, 24, 14, C.l400); for (let y = 16; y < 28; y += 3) R(g, 4, y, 24, 1, C.l500); R(g, 4, 14, 1, 14, C.l300);
      R(g, 9, 18, 7, 10, C.w3); R(g, 10, 19, 5, 9, C.w2); P(g, 14, 23, C.sun);
      R(g, 19, 18, 6, 5, C.w3); R(g, 20, 19, 4, 3, o.lit ? C.glow : C.glass);
      roof(g, 16, 3, 12, 14, 32, ROOFS[0]);
      R(g, 29, 12, 1, 16, C.w3); R(g, 35, 12, 1, 16, C.w3); R(g, 28, 13, 9, 1, C.w2);
      [30, 32, 34].forEach((x, i) => { R(g, x, 14, 1, 5 + (i % 2), C.l300); P(g, x, 19 + (i % 2), C.l400); P(g, x, 14, C.co400); });
      for (let y = 20; y < 28; y++) for (let x = 0; x < 5; x++) if ((x + y) % 3 === 0) P(g, x, y, C.co400);
      R(g, 12, 31, 1, 14, C.w3); R(g, 17, 31, 1, 14, C.w3); for (let y = 33; y < 45; y += 3) R(g, 12, y, 6, 1, C.w2);
    }
  });
  def('watchtower', {
    name: 'Watchtower', cat: 'building', foot: [1, 1], box: [24, 62, 12, 61], solid: true, litable: true, frames: 2, fps: 3, tower: true,
    desc: 'Mostly used for watching sunsets.', lights: [{ x: 0, y: -47, r: 34, mode: 'night' }],
    draw(g, o) {
      line(g, 4, 60, 7, 26, C.w3, 2); line(g, 18, 60, 15, 26, C.w3, 2);
      line(g, 5, 58, 17, 44, C.w2); line(g, 18, 58, 6, 44, C.w2); line(g, 6, 42, 16, 30, C.w2); line(g, 17, 42, 7, 30, C.w2);
      R(g, 5, 44, 14, 1, C.w3); R(g, 6, 30, 12, 1, C.w3);
      R(g, 2, 24, 20, 3, C.w2); R(g, 2, 24, 20, 1, C.w1); R(g, 2, 26, 20, 1, C.w4);
      R(g, 3, 18, 18, 6, C.w1); for (let x = 3; x < 21; x += 3) R(g, x, 18, 1, 6, C.w3); R(g, 3, 18, 18, 1, C.w3);
      R(g, 3, 10, 2, 8, C.w3); R(g, 19, 10, 2, 8, C.w3);
      R(g, 11, 10, 2, 2, C.ink2); R(g, 10, 12, 4, 5, o.lit ? C.glow : C.co400); R(g, 10, 12, 4, 1, C.ink2); if (o.lit) P(g, 11, 14, C.glow2);
      roof(g, 12, 4, 7, 4, 24, ROOFS[0]);
      R(g, 11, 0, 1, 5, C.w4); if (o.frame) { R(g, 12, 0, 5, 2, C.b400); P(g, 16, 2, C.b400); } else { R(g, 12, 0, 4, 2, C.b400); R(g, 12, 2, 5, 1, C.b500); }
    }
  });
  def('castle', {
    name: 'Castle Keep', cat: 'building', foot: [5, 4], box: [88, 112, 44, 111], solid: true, litable: true, frames: 2, fps: 2, keep: true,
    desc: 'The founders built it to look important. It works.',
    lights: [{ x: -11, y: -62, r: 20, mode: 'win' }, { x: 0, y: -62, r: 20, mode: 'win' }, { x: 11, y: -62, r: 20, mode: 'win' }, { x: -34, y: -39, r: 16, mode: 'win' }, { x: 33, y: -39, r: 16, mode: 'win' }, { x: 0, y: -11, r: 28, mode: 'night' }],
    draw(g, o) {
      bricks(g, 22, 34, 44, 44, STONE2); R(g, 62, 34, 4, 44, C.co500); crenel(g, 22, 30, 44, C.co400);
      [30, 41, 52].forEach(x => { R(g, x, 44, 6, 9, C.ink2); R(g, x + 1, 45, 4, 8, o.lit ? C.glow : C.glass); if (o.lit) P(g, x + 1, 46, C.glow2); });
      bricks(g, 36, 14, 16, 22, STONE); R(g, 49, 14, 3, 22, C.co400); R(g, 41, 20, 6, 8, C.ink2); R(g, 42, 21, 4, 7, o.lit ? C.glow : C.glass);
      roof(g, 44, 4, 11, 2, 20, ROOFS[3]);
      R(g, 44, 0, 1, 5, C.w4); if (o.frame) R(g, 45, 0, 7, 3, C.b400); else { R(g, 45, 0, 6, 2, C.b400); R(g, 45, 2, 7, 1, C.b500); }
      bricks(g, 16, 80, 56, 32, STONE); crenel(g, 16, 76, 56, C.co300); R(g, 16, 108, 56, 4, C.co400);
      R(g, 36, 88, 16, 24, C.ink2); R(g, 37, 86, 14, 2, C.ink2); R(g, 39, 85, 10, 1, C.ink2);
      for (let x = 38; x < 51; x += 3) R(g, x, 88, 1, 18, C.co600); for (let y = 90; y < 106; y += 4) R(g, 37, y, 14, 1, C.co600);
      R(g, 36, 106, 16, 6, C.w3); R(g, 36, 106, 16, 1, C.w2);
      [23, 59].forEach(x => { R(g, x, 82, 6, 12, C.b400); R(g, x, 82, 6, 1, C.w4); P(g, x, 94, C.b400); P(g, x + 5, 94, C.b400); R(g, x + 2, 86, 2, 2, C.sun); });
      [1, 67].forEach(x => { bricks(g, x, 60, 18, 52, STONE); R(g, x + 15, 60, 3, 52, C.co400); R(g, x + 7, 68, 4, 7, C.ink2); R(g, x + 8, 69, 2, 6, o.lit ? C.glow : C.glass); R(g, x + 7, 90, 4, 6, C.ink2); roof(g, x + 9, 40, 20, 4, 20, ROOFS[3]); });
    }
  });
  def('fountain', {
    name: 'Fountain', cat: 'building', foot: [2, 2], box: [34, 34, 17, 33], solid: true, frames: 4, fps: 6, plazaOk: true,
    desc: 'Wishes accepted. Results vary.',
    draw(g, o) {
      oval(g, 17, 26, 16, 7, C.co400); oval(g, 17, 25, 15, 6, C.co300); oval(g, 17, 25, 12, 4, C.l400); oval(g, 17, 25, 9, 2, C.l300);
      for (let k = 0; k < 3; k++) { const r = 4 + Math.round(((o.frame + k * 1.3) % 4) * 2); P(g, 17 - r, 25, C.l200); P(g, 17 + r, 25, C.l200); }
      R(g, 15, 10, 4, 15, C.co300); R(g, 18, 10, 1, 15, C.co400); oval(g, 17, 11, 6, 2, C.co300); oval(g, 17, 10, 5, 1, C.l300);
      R(g, 16, 4, 2, 6, C.l200); P(g, 16, 3 + (o.frame % 2), C.s50); P(g, 17, 3, C.s50);
      for (let k = 0; k < 5; k++) { const t = ((o.frame + k) % 5) / 5; P(g, 11 - t * 3, 12 + t * 10, C.l200); P(g, 23 + t * 3, 12 + t * 10, C.l200); P(g, 10 - t * 3, 13 + t * 10, C.s50); }
    }
  });
  def('mine', {
    name: 'Mine', cat: 'building', foot: [2, 2], box: [40, 38, 20, 37], solid: true, litable: true, mine: true,
    desc: 'Goes deeper than anyone admits.', lights: [{ x: -15, y: -24, r: 26, mode: 'night' }, { x: 0, y: -7, r: 14, mode: 'forge' }],
    draw(g, o) {
      oval(g, 20, 24, 19, 13, C.co500); oval(g, 18, 22, 17, 12, C.co400); oval(g, 15, 17, 10, 7, C.co300); P(g, 11, 13, C.co200); P(g, 12, 12, C.co200);
      [[6, 14], [26, 12], [32, 20], [3, 26]].forEach(([x, y]) => { P(g, x, y, C.p500); P(g, x + 1, y, C.p400); P(g, x, y + 1, C.p600); });
      R(g, 13, 20, 14, 17, C.ink); R(g, 14, 19, 12, 1, C.ink);
      for (let y = 28; y < 37; y += 3) R(g, 15, y, 10, 1, C.w3);
      line(g, 17, 25, 15, 36, C.co500); line(g, 22, 25, 24, 36, C.co500);
      R(g, 11, 17, 3, 20, C.w2); R(g, 26, 17, 3, 20, C.w2); R(g, 11, 17, 1, 20, C.w1); R(g, 10, 15, 20, 3, C.w3); R(g, 10, 15, 20, 1, C.w1);
      R(g, 29, 27, 9, 6, C.co600); R(g, 29, 27, 9, 1, C.co500); P(g, 31, 26, C.co300); P(g, 33, 26, C.sun); P(g, 34, 26, C.co300); P(g, 36, 26, C.l300); P(g, 30, 33, C.ink); P(g, 36, 33, C.ink);
      R(g, 5, 14, 1, 22, C.w3); R(g, 3, 11, 5, 5, o.lit ? C.glow : C.co400); R(g, 3, 10, 5, 1, C.ink2); if (o.lit) P(g, 4, 12, C.glow2);
    }
  });

  /* ---------- camp & small props ---------- */
  def('rack', { name: 'Drying Rack', cat: 'prop', foot: [1, 1], box: [18, 18], solid: true, draw(g) { R(g, 2, 3, 2, 15, C.w3); R(g, 14, 3, 2, 15, C.w3); R(g, 1, 3, 16, 2, C.w2); R(g, 1, 3, 16, 1, C.w1); R(g, 4, 5, 4, 8, C.w1); R(g, 4, 5, 4, 1, C.w2); P(g, 5, 13, C.w1); R(g, 9, 5, 4, 6, C.s300); R(g, 9, 5, 4, 1, C.s400); P(g, 10, 11, C.s300); } });
  def('logpile', { name: 'Log Pile', cat: 'prop', foot: [1, 1], box: [17, 13], solid: true, draw(g) { [[3, 10], [8, 10], [13, 10], [5, 6], [10, 6], [8, 2]].forEach(([x, y]) => { disc(g, x, y, 2, C.w1); P(g, x, y, C.w2); P(g, x - 2, y, C.w3); }); } });
  def('rail', { name: 'Bridge Rail', cat: 'prop', foot: [1, 1], box: [16, 14], on: 'water', noShadow: true, draw(g) { R(g, 0, 3, 16, 2, C.w2); R(g, 0, 3, 16, 1, C.w1); R(g, 1, 1, 2, 12, C.w3); R(g, 13, 1, 2, 12, C.w3); R(g, 1, 1, 2, 1, C.w1); R(g, 13, 1, 2, 1, C.w1); R(g, 0, 12, 16, 1, C.w4); } });

  /* ---------- forests ---------- */
  def('birch', {
    name: 'Birch', cat: 'nature', foot: [1, 1], box: [24, 42], solid: true, tree: true, variants: 3, varNames: ['Summer', 'Autumn', 'Bare'], seasonMap: [0, 0, 1, 2], frames: 2, fps: 0.9,
    draw(g, o) {
      const d = o.frame ? 1 : 0;
      R(g, 11, 16, 3, 25, C.s50); R(g, 13, 16, 1, 25, C.s300); for (let y = 18; y < 40; y += 4) R(g, 11 + ((y / 4) % 2), y, 2, 1, C.ink2);
      if (o.v === 2) { line(g, 12, 20, 5, 10, C.s300); line(g, 12, 17, 19, 7, C.s300); line(g, 12, 16, 12, 3, C.s50); line(g, 8, 14, 6, 6, C.s300); line(g, 16, 11, 18, 3, C.s300); return; }
      const L = o.v === 1 ? GOLD : [C.p200, C.p300, C.p400, C.p500];
      disc(g, 12 + d, 12, 9, L[3]); disc(g, 6 + d, 19, 5, L[3]); disc(g, 18 + d, 18, 5, L[3]);
      disc(g, 12 + d, 10, 8, L[2]); disc(g, 6 + d, 17, 4, L[2]); disc(g, 18 + d, 16, 4, L[2]);
      disc(g, 10 + d, 8, 5, L[1]); disc(g, 9 + d, 6, 2, L[0]);
      for (let k = 0; k < 18; k++) P(g, 4 + Math.floor(o.rnd() * 16) + d, 3 + Math.floor(o.rnd() * 18), o.rnd() > .5 ? L[1] : L[3]);
    }
  });
  def('willow', {
    name: 'Willow', cat: 'nature', foot: [1, 1], box: [36, 40, 18, 39], solid: true, tree: true, variants: 3, varNames: ['Summer', 'Autumn', 'Bare'], seasonMap: [0, 0, 1, 2], frames: 2, fps: 0.7,
    draw(g, o) {
      const d = o.frame ? 1 : 0; R(g, 16, 22, 4, 17, C.w3); R(g, 16, 22, 1, 17, C.w2);
      if (o.v === 2) { for (let x = 4; x < 33; x += 3) { const y0 = 8 + Math.round(Math.abs(x - 18) * .3); line(g, 18, 14, x, y0, C.w3); line(g, x, y0, x + d, 28 + ((x * 7) % 6), C.w2); } return; }
      const L = o.v === 1 ? GOLD : [C.p300, C.p400, C.p500, C.p600];
      disc(g, 18, 13, 13, L[3]); disc(g, 18, 11, 12, L[2]); disc(g, 15, 8, 7, L[1]); disc(g, 13, 6, 3, L[0]);
      for (let x = 5; x < 32; x += 2) { const y0 = 8 + Math.round(Math.abs(x - 18) * .45), y1 = 28 + ((x * 7) % 7), dx = x % 4 ? d : -d; line(g, x, y0, x + dx, y1, x % 4 ? L[2] : L[3]); P(g, x + dx, y1, L[1]); }
    }
  });

  /* ---------- landmarks ---------- */
  def('mountain', {
    name: 'Mountain', cat: 'landmark', foot: [5, 3], box: [86, 98, 43, 97], solid: true, variants: 3, varNames: ['Peak', 'Twin peaks', 'Range'], noShadow: true,
    desc: 'Snow all year. The goats insist it is fine.',
    draw(g, o) {
      const W = 86, H = 98, PK = [[[43, 6]], [[28, 16], [58, 4]], [[16, 28], [46, 8], [72, 22]]][o.v % 3], s = 1.35, top = [], who = [];
      let j = 0;
      for (let x = 0; x < W; x++) {
        j += (o.rnd() - .5) * 3.2; j *= .86; let best = 1e9, b = 0;
        PK.forEach((p, i) => { const t = p[1] + Math.abs(x - p[0]) * s; if (t < best) { best = t; b = i; } });
        top[x] = Math.round(Math.max(best + j + Math.sin(x * .45 + o.v) * 1.5, H - 1 - Math.min(x, W - 1 - x) * 2.6)); who[x] = b;
      }
      for (let x = 0; x < W; x++) for (let y = top[x]; y < H; y++) {
        const p = PK[who[x]], left = x < p[0], dep = (y - p[1]) / (H - p[1]);
        let c = left ? (dep < .5 ? C.co200 : C.co300) : (dep < .5 ? C.co400 : C.co500);
        if (((y + Math.floor(x / 6) * 2) % 11) === 0) c = left ? C.co400 : C.co600;
        if (x === p[0] + 1 && y < p[1] + 34) c = C.co600;
        const sl = p[1] + 17 + ((x * 7) % 5) + Math.floor(A.hash2(x, o.v) * 4);
        if (y < sl) c = left ? '#FFFFFF' : '#D7E3EC'; else if (y === sl && A.hash2(x, y) > .5) c = left ? '#EAF1F6' : '#BFD0DD';
        if (y > H - 12) { const k = y - (H - 12); if (A.hash2(x, y) < k / 12) c = k > 6 ? C.p600 : C.p500; }
        P(g, x, y, c);
      }
      for (let k = 0; k < 12; k++) { const x = 6 + Math.floor(o.rnd() * (W - 12)), by = H - 2 - Math.floor(o.rnd() * 5); if (by < top[x] + 7) continue; for (let i = 0; i < 8; i++) { const w = Math.floor(i / 2); R(g, x - w, by - 7 + i, w * 2 + 1, 1, i % 3 === 2 ? C.p700 : C.p600); } P(g, x, by + 1, C.w3); }
    }
  });
  def('crag', {
    name: 'Crag', cat: 'landmark', foot: [2, 2], box: [34, 34], solid: true, variants: 2,
    draw(g, o) {
      (o.v ? [[6, 10, 9, 22], [14, 3, 10, 29], [23, 12, 8, 20]] : [[4, 14, 10, 18], [13, 7, 12, 25], [24, 16, 8, 16]]).forEach(([x, y, w, h]) => {
        R(g, x, y, w, h, C.co400); R(g, x, y, Math.ceil(w / 2), h, C.co300); R(g, x + w - 2, y, 2, h, C.co500); R(g, x + 1, y - 1, w - 2, 1, C.co300); P(g, x + 1, y, C.co200);
        for (let yy = y + 5; yy < y + h; yy += 6) R(g, x, yy, w, 1, C.co500);
      });
      R(g, 2, 31, 30, 3, C.co500); P(g, 8, 30, C.p500); P(g, 9, 30, C.p400); P(g, 25, 31, C.p500);
    }
  });
  def('waterfall', {
    name: 'Waterfall', cat: 'landmark', foot: [3, 2], box: [52, 58, 26, 57], solid: true, frames: 4, fps: 8, noShadow: true, visit: true, mist: { x: 0, y: -8 },
    desc: 'Where the river starts its day.',
    draw(g, o) {
      const rock = (x0, x1) => { for (let x = x0; x < x1; x++) { const t = 2 + Math.floor(A.hash2(x, 3) * 6); for (let y = t; y < 50; y++) { let c = (x - x0) < (x1 - x0) / 2 ? C.co300 : C.co400; if (((y + (x >> 2) * 3) % 9) === 0) c = C.co500; P(g, x, y, c); } } };
      rock(0, 17); rock(35, 52);
      for (let x = 17; x < 35; x++) for (let y = 0; y < 48; y++) { const v = (((y - o.frame * 4 + ((x * 5) % 7)) % 8) + 8) % 8; let c = v < 1 ? C.s50 : v < 4 ? C.l200 : C.l300; if (x === 17 || x === 34) c = C.l400; if (y < 3) c = y === 0 ? C.l300 : C.l200; P(g, x, y, c); }
      oval(g, 26, 51, 24, 6, C.l300); oval(g, 26, 50, 20, 4, C.l200);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + o.frame * .4; disc(g, 26 + Math.cos(a) * 14, 50 + Math.sin(a) * 3, 2, C.s50); }
      R(g, 18, 46, 16, 3, C.s50);
      [[3, 20], [8, 34], [44, 28], [48, 40], [12, 44], [40, 46]].forEach(([x, y]) => { P(g, x, y, C.p500); P(g, x + 1, y, C.p400); P(g, x, y + 1, C.p600); });
    }
  });
  def('elder', {
    name: 'Elder Tree', cat: 'landmark', foot: [3, 3], box: [78, 92, 39, 91], solid: true, tree: true, variants: 3, varNames: ['Summer', 'Autumn', 'Bare'], seasonMap: [0, 0, 1, 2], frames: 2, fps: 0.6, litable: true, visit: true,
    desc: 'Older than the village. Someone lives in the trunk.',
    lights: [{ x: -24, y: -41, r: 16, mode: 'win' }, { x: 22, y: -43, r: 16, mode: 'win' }, { x: -6, y: -34, r: 14, mode: 'win' }, { x: 1, y: -23, r: 16, mode: 'win' }],
    draw(g, o) {
      const d = o.frame ? 1 : 0, L = o.v === 1 ? LEAVES[2] : LEAVES[0];
      line(g, 31, 89, 20, 91, C.w3, 2); line(g, 47, 89, 59, 91, C.w3, 2); line(g, 35, 88, 28, 91, C.w4, 2); line(g, 44, 88, 50, 91, C.w4, 2);
      R(g, 31, 52, 17, 39, C.w3); R(g, 31, 52, 4, 39, C.w2); R(g, 44, 52, 4, 39, C.w4); for (let y = 56; y < 88; y += 5) P(g, 36 + (y % 3), y, C.w4);
      if (o.v === 2) {
        [[39, 54, 39, 14, 3], [39, 42, 14, 24, 2], [40, 38, 64, 22, 2], [39, 30, 24, 8, 2], [40, 28, 56, 6, 2], [20, 28, 10, 18, 1], [58, 25, 70, 18, 1], [30, 16, 26, 4, 1], [50, 12, 54, 2, 1], [14, 24, 6, 22, 1], [64, 22, 72, 26, 1], [39, 14, 37, 3, 1]].forEach(([a, b, c, e, t]) => line(g, a, b, c, e, C.w3, t));
      } else {
        disc(g, 39 + d, 34, 28, L[3]); disc(g, 16 + d, 44, 14, L[3]); disc(g, 62 + d, 44, 14, L[3]);
        disc(g, 39 + d, 30, 26, L[2]); disc(g, 17 + d, 40, 12, L[2]); disc(g, 61 + d, 40, 12, L[2]);
        disc(g, 34 + d, 24, 16, L[1]); disc(g, 54 + d, 30, 9, L[1]); disc(g, 17 + d, 36, 6, L[1]); disc(g, 28 + d, 18, 7, L[0]); disc(g, 50 + d, 14, 4, L[0]);
        for (let k = 0; k < 90; k++) { const a = o.rnd() * Math.PI * 2, rr = o.rnd() * 26; P(g, 39 + d + Math.cos(a) * rr, 32 + Math.sin(a) * rr * .8, o.rnd() > .5 ? L[1] : L[3]); }
      }
      R(g, 36, 76, 8, 13, C.w4); R(g, 37, 75, 6, 1, C.w4); R(g, 37, 77, 6, 12, C.c600); R(g, 40, 77, 1, 12, C.c700); P(g, 42, 83, C.sun);
      R(g, 38, 66, 4, 4, C.w4); R(g, 39, 67, 2, 2, o.lit ? C.glow : C.glass);
      [[15, 48], [61, 46], [33, 55]].forEach(([x, y]) => { line(g, x, y - 6, x, y - 1, C.ink2); R(g, x - 1, y, 3, 4, o.lit ? C.glow : C.c500); P(g, x, y + 1, o.lit ? C.glow2 : C.c400); R(g, x - 1, y - 1, 3, 1, C.ink2); });
    }
  });
  def('ruins', {
    name: 'Old Ruins', cat: 'landmark', foot: [3, 2], box: [52, 46, 26, 45], solid: true, visit: true,
    desc: 'A temple, a bathhouse, or a very ambitious shed.',
    draw(g, o) {
      for (let k = 0; k < 12; k++) R(g, 2 + Math.floor(o.rnd() * 46), 39 + Math.floor(o.rnd() * 6), 4, 2, k % 2 ? C.co300 : C.co400);
      for (let x = 2; x < 20; x++) { const t = 22 + Math.floor(Math.abs(Math.sin(x * .7)) * 8 + (x > 14 ? (x - 14) * 2 : 0)); for (let y = t; y < 42; y++) P(g, x, y, ((y + (Math.floor(x / 4) % 2) * 2) % 4 === 0 || x % 4 === 0) ? C.co400 : C.co300); }
      const pil = (x, top) => { R(g, x, top, 6, 42 - top, C.co300); R(g, x + 4, top, 2, 42 - top, C.co400); R(g, x - 1, top, 8, 2, C.co200); R(g, x - 1, 40, 8, 2, C.co400); for (let y = top + 4; y < 40; y += 4) P(g, x + 2, y, C.co400); };
      pil(24, 8); pil(40, 18);
      R(g, 23, 5, 13, 3, C.co300); R(g, 23, 7, 13, 1, C.co400); R(g, 34, 6, 3, 1, C.co300);
      R(g, 30, 37, 18, 5, C.co300); R(g, 30, 41, 18, 1, C.co400); for (let x = 31; x < 47; x += 3) P(g, x, 38, C.co200); disc(g, 48, 39, 2, C.co200);
      for (let k = 0; k < 34; k++) { const x = 2 + Math.floor(o.rnd() * 46), y = 8 + Math.floor(o.rnd() * 34); P(g, x, y, o.rnd() > .5 ? C.p500 : C.p400); }
      line(g, 26, 9, 26, 21, C.p600); line(g, 42, 19, 43, 29, C.p600); line(g, 8, 25, 8, 33, C.p600);
    }
  });
  def('stones', {
    name: 'Standing Stones', cat: 'landmark', foot: [3, 2], box: [52, 40, 26, 39], solid: true, litable: true, visit: true,
    desc: 'They hum at night. Nobody talks about it.', lights: [{ x: 0, y: -18, r: 44, mode: 'rune' }],
    draw(g, o) {
      const stone = (x, top, w, bot) => { R(g, x, top + 1, w, bot - top - 1, C.co400); R(g, x + 1, top, w - 2, 1, C.co400); R(g, x, top + 1, 2, bot - top - 1, C.co300); R(g, x + w - 2, top + 1, 2, bot - top - 1, C.co500); const my = Math.round((top + bot) / 2); [[0, -3], [1, -2], [0, -1], [1, 1], [0, 2]].forEach(([dx, dy]) => P(g, x + 2 + dx, my + dy, o.lit ? RUNE : C.co500)); P(g, x, bot - 1, C.p500); P(g, x + w - 1, bot - 1, C.p600); };
      [[6, 10, 7, 28], [17, 4, 7, 28], [29, 2, 7, 28], [40, 10, 7, 28]].forEach(a => stone(...a));
      R(g, 19, 30, 14, 4, C.co300); R(g, 19, 33, 14, 1, C.co500); if (o.lit) { P(g, 25, 31, RUNE); P(g, 26, 31, RUNE); }
      [[10, 22, 6, 38], [36, 22, 6, 38]].forEach(a => stone(...a));
    }
  });

  /* ---------- wildlife ---------- */
  def('deer', {
    name: 'Deer', cat: 'animal', box: [16, 17], frames: 2, variants: 2, varNames: ['Doe', 'Stag'],
    draw(g, o) {
      g.translate(0, 3); const b = C.w1, dk = C.w2;
      [3, 5, 9, 11].forEach(x => R(g, x, 8, 1, 5, C.w3)); oval(g, 7, 7, 5, 2, b); R(g, 3, 9, 9, 1, dk); P(g, 2, 6, C.s50); P(g, 2, 5, b); P(g, 6, 6, C.s200); P(g, 9, 6, C.s200);
      if (o.frame) { R(g, 11, 7, 2, 3, b); R(g, 12, 10, 3, 2, b); P(g, 14, 11, C.ink); if (o.v) { line(g, 12, 9, 10, 6, C.w4); line(g, 13, 9, 15, 6, C.w4); } else P(g, 11, 9, dk); }
      else { R(g, 11, 3, 2, 5, b); R(g, 11, 1, 4, 3, b); P(g, 13, 2, C.ink); P(g, 15, 2, C.ink2); P(g, 10, 0, b); if (o.v) { line(g, 11, 0, 9, -3, C.w4); P(g, 8, -2, C.w4); line(g, 13, 0, 14, -3, C.w4); P(g, 15, -2, C.w4); } }
    }
  });
  def('fox', {
    name: 'Fox', cat: 'animal', box: [13, 8], frames: 2,
    draw(g, o) {
      R(g, 3, 5, 1, 3, C.ink2); R(g, 8, 5, 1, 3, C.ink2); R(g, 2, 3, 8, 3, C.c400); R(g, 2, 5, 8, 1, C.c500); R(g, 4, 5, 4, 1, C.s50);
      if (o.frame) { R(g, 0, 2, 3, 2, C.c400); P(g, 0, 1, C.s50); } else { R(g, 0, 3, 3, 2, C.c400); P(g, 0, 5, C.s50); }
      R(g, 9, 1, 3, 3, C.c400); P(g, 9, 0, C.c500); P(g, 11, 0, C.c500); P(g, 12, 3, C.ink); P(g, 11, 2, C.ink); R(g, 9, 3, 2, 1, C.s50);
    }
  });
  def('rabbit', {
    name: 'Rabbit', cat: 'animal', box: [8, 8], frames: 2, variants: 2, varNames: ['Brown', 'White'],
    draw(g, o) {
      const b = o.v ? C.s50 : C.co400, e = o.v ? '#F2B8B0' : C.co500;
      if (o.frame) { R(g, 1, 4, 5, 2, b); R(g, 5, 2, 2, 3, b); P(g, 5, 0, b); P(g, 6, 0, b); P(g, 5, 1, e); P(g, 6, 3, C.ink); P(g, 0, 4, C.s50); P(g, 1, 6, b); P(g, 5, 6, b); }
      else { oval(g, 3, 5, 2, 2, b); R(g, 5, 3, 2, 3, b); R(g, 5, 0, 1, 3, b); R(g, 6, 1, 1, 2, e); P(g, 6, 4, C.ink); P(g, 1, 5, C.s50); }
    }
  });
})();
