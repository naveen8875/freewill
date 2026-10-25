/* Little Worlds — Village Life pack.
   Adds to the base pack and engine without replacing them:
   · Villager v2: poses (sit, eat, talk, wave, cheer, dance), faces (happy, laugh, surprised, love, sad, angry, sleepy),
     ages (kid, elder), outfits (baker, apron, smith, vest, guard, bride, groom, scarf), glasses, umbrellas.
   · Everyday props: laundry line, bench, long table, wash tub, chicken coop, doghouse, garden bed, market cart, dogs.
   · Celebrations: bunting, maypole, bonfire, wedding arch, podium, fireworks, petals.
   · Social layer (Game.prototype): personas, staggered wake/bed times, shared meals, benches, chats, kids' ball games,
     waves, doors that open, windows that light up house by house, a village diary, and scripted community events.
   · Hearthvale: a compact village built to show all of it. */
(function () {
  'use strict';
  const LW = window.LW, A = LW.Assets, C = A.C, T = A.T, def = A.def, { R, P, disc, oval, line, roof, grid } = A.draw, ROOFS = A.ROOFS;
  const SKIN = A.SKIN, HAIR = A.HAIR, SHIRT = A.SHIRT, PANTS = A.PANTS, PINK = '#F2B8B0', ROSE = '#E08F8A';
  const pick = a => a[(Math.random() * a.length) | 0];

  /* ================= bubbles ================= */
  Object.assign(A.ICONS, {
    laugh: [C.sun2, ['.x...x.', 'x.x.x.x', '.......', '.xxxxx.', '..xxx..', '.......']],
    question: [C.k500, ['..xxx..', '.x...x.', '....x..', '...x...', '.......', '...x...']],
    coin: [C.sun2, ['..xxx..', '.xxxxx.', 'xx.x.xx', 'xx.x.xx', '.xxxxx.', '..xxx..']],
    bowl: [C.c500, ['.x.x.x.', '..x.x..', 'xxxxxxx', '.xxxxx.', '..xxx..', '.......']],
    flower: [ROSE, ['..x.x..', '.xxxxx.', '..xxx..', '...x...', '..xx...', '...x...']],
    angry: [C.b500, ['x.....x', '.x...x.', '..x.x..', '.......', '.xxxxx.', 'x.....x']],
    star: [C.sun, ['...x...', '..xxx..', 'xxxxxxx', '.xxxxx.', '.xx.xx.', 'x.....x']],
    ring: [C.sun2, ['..xxx..', '.x...x.', 'x.....x', 'x.....x', '.x...x.', '..xxx..']],
    wave: ['#C48A60', ['x.x.x..', 'x.x.x..', 'xxxxx.x', 'xxxxxx.', '.xxxx..', '..xx...']]
  });
  ['laugh', 'question', 'coin', 'bowl', 'flower', 'angry', 'star', 'ring', 'wave'].forEach(k => def('icon_' + k, { name: k[0].toUpperCase() + k.slice(1), cat: 'icon', box: [7, 6], outline: false, draw(g) { grid(g, A.ICONS[k][1], { x: A.ICONS[k][0] }); } }));

  /* ================= villager v2 ================= */
  function vtool(g, t, dir, up, skin) {
    const H = C.w2, M = C.co200, M2 = C.co500, side = dir === 'side';
    if (t === 'rod') { const b = up ? 0 : 1; if (side) { line(g, 6, 10, 12, 3, H); line(g, 12, 4, 12, 11 + b, C.s50); P(g, 12, 12 + b, C.b400); } else { line(g, 8, 10, 11, 4, H); line(g, 11, 5, 12, 13 + b, C.s50); P(g, 12, 14 + b, C.b400); } P(g, side ? 6 : 8, 10, skin); return; }
    const hx = side ? 6 : 8, hy = side ? 9 : 10, ex = up ? hx + 2 : hx + 5, ey = up ? 1 : hy + 4;
    line(g, hx, hy, ex, ey, H);
    if (t === 'axe') { if (up) { R(g, ex, ey - 1, 3, 3, M); P(g, ex + 2, ey - 1, '#FFFFFF'); } else { R(g, ex - 1, ey, 3, 3, M); P(g, ex + 1, ey + 2, '#FFFFFF'); } }
    else if (t === 'hammer') { if (up) R(g, ex - 1, ey - 1, 4, 2, C.co600); else R(g, ex, ey - 2, 2, 4, C.co600); }
    else if (t === 'pick') { if (up) { line(g, ex - 3, ey + 1, ex, ey - 1, M2); line(g, ex, ey - 1, ex + 3, ey + 1, M2); } else { line(g, ex - 1, ey - 3, ex + 1, ey, M2); line(g, ex + 1, ey, ex - 1, ey + 3, M2); } }
    else if (t === 'hoe') { if (up) R(g, ex, ey, 3, 1, M2); else R(g, ex, ey - 1, 1, 3, M2); }
    P(g, hx, hy, skin);
  }
  const V = A.get('villager');
  V.box = [18, 24, 9, 22];
  V.desc = 'look = [skin, hair, shirt, pants, hairStyle, hat, glasses] · dir · pose = sit | eat | talk | wave | cheer | dance · face = happy | laugh | surprised | love | sad | angry | sleepy · age 0 adult, 1 kid, 2 elder · outfit · umbrella · carry · tool';
  V.draw = function (g, o) {
    g.translate(4, 7);
    const L = o.look || [0, 0, 0, 0, 0, 0, 0], age = o.age || 0, kid = age === 1, eld = age === 2, out = o.outfit || null;
    const skin = SKIN[L[0] % 5], hair = eld ? (L[1] % 2 ? C.co200 : C.s200) : HAIR[L[1] % 6], style = L[4] % 3, glasses = L[6] === 1;
    let shirt = SHIRT[L[2] % 8], pants = PANTS[L[3] % 5], hat = L[5] % 3;
    if (out === 'bride') { shirt = C.s50; pants = C.s50; hat = 0; } else if (out === 'groom') { shirt = C.co700; pants = C.ink2; hat = 0; } else if (out === 'guard' || out === 'baker') { if (out === 'guard') shirt = C.k600; hat = 0; }
    const pose = o.pose || null, dir = o.dir || 'down', side = dir === 'side', back = dir === 'up';
    const f = (o.frame >= 4 || pose) ? 0 : o.frame % 4, alt = o.frame % 2, sit = pose === 'sit' || pose === 'eat';
    let by = (f === 1 || f === 3) ? -1 : 0; if ((pose === 'dance' || pose === 'cheer') && alt) by = -1;
    const k = kid ? 3 : 0, sy = sit ? (kid ? 1 : 2) : 0, hy = 1 + k + sy + by, tt = hy + 7, th = kid ? (sit ? 2 : 3) : (sit ? 3 : 5), tb = tt + th - 1;
    const foot = C.ink2, sd = A.shade(shirt, .8), ah = kid ? 3 : 4;
    // legs
    if (sit) {
      if (side) { R(g, 3, tb + 1, 6, 1, pants); R(g, 8, tb + 1, 1, 15 - tb, pants); P(g, 8, 15, foot); P(g, 9, 15, foot); }
      else { R(g, 2, tb + 1, 6, 1, pants); if (tb + 2 <= 14) { R(g, 2, tb + 2, 2, 13 - tb, pants); R(g, 6, tb + 2, 2, 13 - tb, pants); } R(g, 2, 15, 2, 1, foot); R(g, 6, 15, 2, 1, foot); }
    } else if (out === 'bride') { for (let y = tb; y <= 15; y++) { const w = 6 + Math.min(4, y - tb); R(g, 5 - (w >> 1), y, w, 1, y === 15 ? C.s200 : C.s50); } }
    else {
      const lt = tb + 1, lh = 16 - lt;
      if (side) {
        if (f === 1) { R(g, 3, lt, 2, lh, pants); R(g, 6, lt, 2, lh - 1, pants); R(g, 3, 15, 2, 1, foot); R(g, 6, 14, 2, 1, foot); }
        else if (f === 3) { R(g, 3, lt, 2, lh - 1, pants); R(g, 6, lt, 2, lh, pants); R(g, 3, 14, 2, 1, foot); R(g, 6, 15, 2, 1, foot); }
        else { R(g, 4, lt, 3, lh, pants); R(g, 4, 15, 3, 1, foot); }
      } else {
        const lL = f === 1 ? lh - 1 : lh, lR = f === 3 ? lh - 1 : lh, sp = pose === 'dance' && alt ? 1 : 0;
        R(g, 3 - sp, lt, 2, lL, pants); R(g, 3 - sp, lt + lL - 1, 2, 1, foot); R(g, 5 + sp, lt, 2, lR, pants); R(g, 5 + sp, lt + lR - 1, 2, 1, foot);
      }
    }
    if (out === 'bride') { if (side) R(g, 1, hy, 4, 10, C.s50); else R(g, 1, hy, 8, 10, C.s50); }
    // torso
    if (side) { R(g, 3, tt, 4, th, shirt); R(g, 3, tb, 4, 1, pants); } else { R(g, 2, tt, 6, th, shirt); R(g, 2, tb, 6, 1, out === 'bride' ? C.s200 : pants); }
    if (!back) {
      if (out === 'baker' || out === 'apron') { if (side) R(g, 6, tt + 1, 1, th + 1, C.s50); else { R(g, 3, tt + 1, 4, th, C.s50); P(g, 3, tt, C.s50); P(g, 6, tt, C.s50); } }
      else if (out === 'smith') { if (side) R(g, 6, tt + 1, 1, th + 1, C.w3); else { R(g, 3, tt + 1, 4, th, C.w3); P(g, 3, tt, C.w3); P(g, 6, tt, C.w3); } }
      else if (out === 'vest') { if (side) R(g, 3, tt, 1, th - 1, C.sun2); else { R(g, 2, tt, 1, th - 1, C.sun2); R(g, 7, tt, 1, th - 1, C.sun2); } }
      else if (out === 'guard') { if (side) R(g, 4, tt, 3, th, C.b400); else { R(g, 3, tt, 4, th, C.b400); P(g, 4, tt + 1, C.sun); P(g, 5, tt + 1, C.sun); } }
      else if (out === 'groom' && !side) { R(g, 4, tt, 2, 2, C.s50); P(g, 4, tt, C.b400); P(g, 5, tt, C.b400); }
      else if (out === 'bride' && !side) { P(g, 4, tt + 1, C.b400); P(g, 5, tt + 1, PINK); P(g, 4, tt + 2, C.p500); }
    }
    if (out === 'scarf') { if (side) { R(g, 3, tt, 4, 1, C.b400); R(g, 3, tt + 1, 1, 2, C.b400); } else { R(g, 2, tt, 6, 1, C.b400); R(g, 6, tt + 1, 1, 2, C.b400); } }
    // arms
    const armDown = (x, dy) => { const h = ah - (sit ? 1 : 0); R(g, x, tt + dy, 1, h, sd); P(g, x, tt + dy + h, skin); };
    const armUp = (x, dx) => { R(g, x, tt - 3, 1, 3, sd); P(g, x + dx, tt - 4, skin); };
    if (side) {
      if (pose === 'wave' || pose === 'cheer' || (pose === 'dance' && alt) || o.armUp) armUp(5, alt);
      else if (pose === 'talk') { R(g, 5, tt + 1, 3, 1, sd); P(g, 8, tt + 1 - alt, skin); }
      else if (pose === 'eat') { R(g, 5, tt + 1, 2, 1, sd); P(g, 7, tt - alt, skin); R(g, 7, tt + 1 - alt, 2, 1, C.c400); }
      else { const ax = 4 + (f === 1 ? 1 : f === 3 ? -1 : 0); R(g, ax, tt, 2, ah - (sit ? 1 : 0), sd); P(g, ax, tt + ah - (sit ? 1 : 0), skin); }
    } else {
      const lU = pose === 'cheer' || (pose === 'dance' && !alt) || o.armUp === 2, rU = pose === 'cheer' || pose === 'wave' || (pose === 'dance' && alt) || !!o.armUp;
      if (lU) armUp(1, alt ? -1 : 0); else armDown(1, f === 1 ? -1 : 0);
      if (rU) armUp(8, alt); else if (pose === 'talk') { R(g, 8, tt + 1, 2, 1, sd); P(g, 10, tt + 1 - alt, skin); }
      else if (pose === 'eat' && !back) { R(g, 8, tt, 1, 2, sd); P(g, 7, tt - 1 + alt, skin); P(g, 6, tt - 1 + alt, C.c400); }
      else armDown(8, f === 3 ? -1 : 0);
    }
    // head
    const ey = hy + 4, ink = C.ink, fc = o.face;
    if (side) {
      R(g, 3, hy + 1, 5, 6, skin); R(g, 2, hy, 6, 2, hair); R(g, 2, hy + 1, 2, style === 1 ? 7 : 4, hair); if (style === 2) R(g, 1, hy, 2, 2, hair);
      if (fc === 'laugh') { P(g, 6, ey - 1, ink); P(g, 7, ey + 1, C.c700); P(g, 7, ey + 2, C.c700); }
      else if (fc === 'surprised') { R(g, 6, ey - 1, 1, 2, ink); P(g, 7, ey + 2, C.c700); }
      else P(g, 6, ey, fc === 'love' ? C.b400 : fc === 'sleepy' ? C.co500 : ink);
      if (fc === 'happy' || fc === 'love') P(g, 7, ey + 2, C.c700);
      if (fc === 'sad') P(g, 6, ey + 1, C.k300); else if (fc === 'angry') P(g, 5, ey - 1, ink); else P(g, 7, ey + 1, fc === 'happy' || fc === 'love' ? C.c400 : C.c300);
      if (glasses) { P(g, 5, ey, C.ink2); P(g, 7, ey, C.ink2); }
    } else if (back) {
      R(g, 2, hy, 6, 7, hair); if (style === 1) R(g, 2, hy + 7, 6, 2, hair); if (style === 2) R(g, 4, hy - 1, 2, 1, hair);
    } else {
      R(g, 2, hy + 1, 6, 6, skin); R(g, 2, hy, 6, 2, hair); const sh = style === 1 ? 7 : 3; R(g, 1, hy + 1, 1, sh, hair); R(g, 8, hy + 1, 1, sh, hair); if (style === 2) R(g, 4, hy - 1, 2, 1, hair);
      const eyes = c => { P(g, 3, ey, c || ink); P(g, 6, ey, c || ink); }, mouth = c => { P(g, 4, ey + 2, c); P(g, 5, ey + 2, c); }, blush = c => { P(g, 2, ey + 1, c); P(g, 7, ey + 1, c); };
      if (fc === 'happy') { eyes(); mouth(C.c700); blush(C.c400); }
      else if (fc === 'laugh') { P(g, 3, ey - 1, ink); P(g, 6, ey - 1, ink); R(g, 4, ey + 1, 2, 2, C.c700); P(g, 5, ey + 2, C.b400); blush(C.c400); }
      else if (fc === 'surprised') { R(g, 3, ey - 1, 1, 2, ink); R(g, 6, ey - 1, 1, 2, ink); mouth(C.c700); }
      else if (fc === 'love') { eyes(C.b400); mouth(C.c700); blush(C.c400); }
      else if (fc === 'sad') { eyes(); P(g, 3, ey + 1, C.k300); mouth(C.co600); }
      else if (fc === 'angry') { eyes(); P(g, 2, ey - 1, ink); P(g, 7, ey - 1, ink); mouth(C.b500); }
      else if (fc === 'sleepy') { eyes(C.co500); }
      else { eyes(); blush(C.c300); }
      if (glasses) { P(g, 2, ey, C.ink2); P(g, 4, ey, C.ink2); P(g, 5, ey, C.ink2); P(g, 7, ey, C.ink2); }
      if (eld && L[1] % 3 === 0) R(g, 3, hy + 6, 4, 2, hair);
    }
    // headwear
    if (out === 'baker') { R(g, 2, hy - 3, 6, 3, C.s50); R(g, 3, hy - 4, 4, 1, C.s50); R(g, 2, hy, 6, 1, C.s300); }
    else if (out === 'guard') { R(g, 1, hy - 1, 8, 3, C.co300); R(g, 1, hy - 1, 8, 1, C.co200); P(g, 4, hy - 2, C.b400); P(g, 5, hy - 3, C.b400); }
    else if (out === 'bride') { [1, 3, 5, 7].forEach((x, i) => P(g, x, hy, i % 2 ? C.sun : PINK)); P(g, 2, hy, C.p500); P(g, 6, hy, C.p500); }
    else if (out === 'groom') { R(g, 2, hy - 2, 6, 2, C.ink2); R(g, 1, hy, 8, 1, C.ink2); }
    else if (hat === 1) { R(g, 0, hy + 1, 10, 1, C.sun); R(g, 2, hy - 1, 6, 2, C.sun2); R(g, 2, hy, 6, 1, C.c500); }
    else if (hat === 2) { R(g, 2, hy, 6, 2, C.b400); P(g, side ? 1 : 8, hy + 2, C.b400); }
    if (eld && !sit && !pose) { R(g, side ? 8 : 9, tt + 3, 1, 13 - tt, C.w3); P(g, side ? 8 : 9, tt + 2, skin); }
    // carry
    const cy = tt + 1;
    if (o.carry === 'wood') { R(g, side ? 2 : 1, cy, side ? 7 : 8, 2, C.w2); P(g, 8, cy, C.w1); P(g, side ? 2 : 1, cy, C.w1); }
    else if (o.carry === 'fish') { R(g, 8, cy + 3, 1, 3, C.l300); P(g, 8, cy + 6, C.l400); P(g, 9, cy + 6, C.l400); }
    else if (o.carry === 'water') { R(g, 8, cy + 3, 2, 2, C.co400); P(g, 8, cy + 3, C.k300); }
    else if (o.carry === 'wheat') { R(g, 0, cy - 3, 2, 6, C.sun); P(g, 0, cy - 4, C.sun2); P(g, 1, cy - 4, C.sun2); }
    else if (o.carry === 'ore' || o.carry === 'stone') { R(g, 1, cy, 8, 3, o.carry === 'ore' ? C.co500 : C.co300); P(g, 3, cy, C.co200); if (o.carry === 'ore') { P(g, 5, cy + 1, C.sun); P(g, 7, cy, C.l300); } }
    else if (o.carry === 'bread') { R(g, 1, cy + 1, 8, 2, C.w2); R(g, 2, cy - 1, 3, 2, C.c400); R(g, 5, cy - 1, 3, 2, C.sun2); P(g, 3, cy - 1, C.s300); }
    else if (o.carry === 'basket') { R(g, 1, cy + 1, 8, 3, C.w1); R(g, 1, cy + 1, 8, 1, C.w2); P(g, 2, cy, C.b400); P(g, 4, cy, C.p400); P(g, 6, cy, C.sun); line(g, 2, cy + 1, 5, cy - 2, C.w2); line(g, 5, cy - 2, 7, cy + 1, C.w2); }
    if (o.tool && o.frame >= 4) { g.translate(0, hy - 1); vtool(g, o.tool, dir, o.frame === 4, skin); g.translate(0, 1 - hy); }
    if (o.umbrella) { const c = o.umbrella, uy = hy - 6; R(g, 9, uy + 4, 1, tt + 2 - (uy + 4), C.w4); P(g, 9, tt + 2, skin); R(g, -2, uy + 2, 14, 2, c); R(g, 0, uy + 1, 10, 1, c); R(g, 2, uy, 6, 1, c); R(g, 1, uy + 1, 3, 1, A.shade(c, 1.18)); P(g, 5, uy - 1, C.w4); for (let x = -2; x < 12; x += 3) P(g, x + 1, uy + 4, c); }
  };

  /* ================= everyday props ================= */
  def('laundry', {
    name: 'Laundry Line', cat: 'life', foot: [2, 1], box: [34, 28, 17, 27], frames: 2, fps: 1.6, variants: 3, varNames: ['Monday', 'Tuesday', 'Wash day'],
    desc: 'Someone owns a lot of striped socks.',
    draw(g, o) {
      R(g, 1, 4, 2, 24, C.w3); R(g, 31, 4, 2, 24, C.w3); R(g, 0, 4, 4, 1, C.w2); R(g, 30, 4, 4, 1, C.w2);
      const ry = x => 5 + Math.round(Math.sin((x - 2) / 30 * Math.PI) * 3);
      for (let x = 2; x < 32; x++) P(g, x, ry(x), C.co300);
      const S = [[C.s50, C.k400, C.b400, C.sun], [C.l300, C.s50, C.c400, C.p300], [C.k300, C.sun2, C.s50, PINK]][o.v % 3], d = o.frame ? 1 : 0;
      let y = ry(6) + 1; R(g, 4, y, 7, 3, S[0]); R(g, 3, y, 1, 3, S[0]); R(g, 11, y, 1, 3, S[0]); R(g, 5, y + 3, 5, 4, S[0]); R(g, 5 + d, y + 7, 5, 1, S[0]); R(g, 6, y, 3, 1, A.shade(S[0], .85)); P(g, 5, y - 1, C.w1); P(g, 9, y - 1, C.w1);
      y = ry(16) + 1; for (let i = 0; i < 11; i++) { const off = Math.round(i / 10 * d * 1.5); R(g, 13 + off, y + i, 8, 1, i % 4 === 3 ? A.shade(S[1], .9) : S[1]); } P(g, 14, y - 1, C.w1); P(g, 19, y - 1, C.w1);
      y = ry(23) + 1; [22, 25].forEach((x, i) => { R(g, x + (i ? d : 0), y, 2, 5, S[2]); R(g, x + (i ? d : 0), y + 4, 3, 1, S[2]); P(g, x, y + 1, C.s50); P(g, x, y + 3, C.s50); P(g, x, y - 1, C.w1); });
      y = ry(28) + 1; R(g, 27, y, 4, 2, S[3]); R(g, 26 + d, y + 2, 6, 6, S[3]); R(g, 27, y + 2, 4, 1, A.shade(S[3], .85)); P(g, 28, y - 1, C.w1);
    }
  });
  def('bench', {
    name: 'Bench', cat: 'life', foot: [2, 1], box: [30, 15, 15, 14], solid: true, variants: 2, varNames: ['Wood', 'Stone'],
    desc: 'Two seats. Usually one elder and one pigeon.',
    draw(g, o) {
      const a = o.v ? C.co300 : C.w1, b = o.v ? C.co400 : C.w2, c = o.v ? C.co500 : C.w3;
      if (!o.v) { R(g, 2, 1, 2, 9, c); R(g, 26, 1, 2, 9, c); R(g, 1, 1, 28, 2, b); R(g, 1, 1, 28, 1, a); R(g, 1, 4, 28, 2, b); }
      R(g, 0, 8, 30, 3, a); R(g, 0, 10, 30, 1, c); R(g, 2, 11, 3, 4, c); R(g, 25, 11, 3, 4, c);
      if (o.v) { R(g, 0, 7, 30, 1, C.co200); P(g, 6, 9, C.p500); P(g, 7, 9, C.p400); }
    }
  });
  def('table', {
    name: 'Long Table', cat: 'life', foot: [2, 1], box: [34, 22, 17, 21], solid: true, variants: 2, varNames: ['Supper', 'Picnic'],
    desc: 'Four seats, six opinions.',
    draw(g, o) {
      R(g, 1, 3, 32, 2, C.w3); R(g, 1, 3, 32, 1, C.w2);
      if (o.v) { for (let x = 0; x < 34; x++) for (let y = 6; y < 11; y++) P(g, x, y, ((x >> 2) + (y >> 1)) % 2 ? C.s50 : C.b400); }
      else { R(g, 0, 6, 34, 5, C.w1); R(g, 0, 6, 34, 1, C.s300); }
      R(g, 0, 11, 34, 1, C.w3); R(g, 3, 12, 2, 7, C.w3); R(g, 29, 12, 2, 7, C.w3);
      [[5, C.c400], [13, C.b400], [21, C.l300], [28, C.c500]].forEach(([x, c], i) => { oval(g, x, 8, 3, 1, C.s50); R(g, x - 1, 7, 3, 1, c); if (i === 1) { P(g, x - 1, 6, C.b400); P(g, x + 1, 6, C.p400); } });
      [9, 25].forEach(x => { R(g, x, 5, 2, 3, C.sun2); P(g, x, 5, C.s50); P(g, x + 1, 5, C.s50); });
      R(g, 0, 16, 34, 3, C.w1); R(g, 0, 18, 34, 1, C.w3); R(g, 2, 19, 2, 3, C.w4); R(g, 30, 19, 2, 3, C.w4);
    }
  });
  def('washtub', { name: 'Wash Tub', cat: 'life', foot: [1, 1], box: [14, 11, 7, 10], solid: true, frames: 2, fps: 2, draw(g, o) { oval(g, 7, 6, 6, 4, C.w2); R(g, 1, 6, 12, 1, C.co500); oval(g, 7, 4, 5, 2, C.l300); [[4, 3], [8, 2], [10, 4], [6, 4]].forEach(([x, y], i) => P(g, x + ((i + o.frame) % 2), y - ((i + o.frame) % 2), C.s50)); R(g, 11, 0, 1, 4, C.w3); } });
  def('coop', {
    name: 'Chicken Coop', cat: 'life', foot: [1, 1], box: [20, 24, 10, 23], solid: true,
    draw(g) { R(g, 3, 17, 2, 7, C.w3); R(g, 15, 17, 2, 7, C.w3); R(g, 2, 9, 16, 9, C.w1); for (let y = 11; y < 18; y += 3) R(g, 2, y, 16, 1, C.w2); R(g, 6, 12, 5, 5, C.ink2); R(g, 7, 13, 3, 1, C.sun2); line(g, 11, 18, 18, 23, C.w2); for (let i = 0; i < 3; i++) P(g, 12 + i * 2, 19 + i * 1.5, C.w3); roof(g, 10, 2, 8, 6, 20, ROOFS[0]); P(g, 9, 17, C.s50); }
  });
  def('doghouse', {
    name: 'Doghouse', cat: 'life', foot: [1, 1], box: [18, 19, 9, 18], solid: true, variants: 2,
    draw(g, o) { const wc = o.v ? C.c500 : C.l500; R(g, 2, 8, 14, 11, wc); for (let x = 5; x < 16; x += 3) R(g, x, 8, 1, 11, A.shade(wc, .85)); R(g, 6, 11, 6, 8, C.ink2); R(g, 7, 10, 4, 1, C.ink2); R(g, 6, 9, 6, 1, C.s50); roof(g, 9, 1, 8, 4, 18, ROOFS[o.v ? 2 : 0]); oval(g, 15, 17, 2, 1, C.co500); P(g, 15, 16, C.c400); }
  });
  def('garden', {
    name: 'Garden Bed', cat: 'life', foot: [1, 1], box: [16, 12], variants: 3, varNames: ['Herbs', 'Flowers', 'Carrots'], noShadow: true, winterHide: true,
    draw(g, o) { R(g, 0, 3, 16, 9, C.w3); R(g, 0, 3, 16, 1, C.w2); R(g, 0, 11, 16, 1, C.w4); for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const x = 2 + c * 4, y = 6 + r * 4; if (o.v === 1) { P(g, x, y - 1, [C.b400, C.sun, PINK, C.k300][(c + r) % 4]); P(g, x, y, C.p500); } else if (o.v === 2) { R(g, x, y - 2, 1, 2, C.p400); P(g, x + 1, y - 2, C.p500); P(g, x, y, C.c400); } else { P(g, x, y - 1, C.p400); P(g, x - 1, y, C.p500); P(g, x + 1, y, C.p500); } } }
  });
  def('cart', {
    name: 'Market Cart', cat: 'life', box: [36, 22, 17, 21], frames: 2, variants: 2, varNames: ['Produce', 'Hay'],
    desc: 'Pulled by Biscuit, who sets the pace.',
    draw(g, o) {
      if (o.v) { oval(g, 10, 6, 9, 4, C.sun2); oval(g, 9, 5, 7, 3, C.sun); P(g, 5, 4, C.glow2); }
      else { [[4, C.b400], [8, C.p300], [12, C.c400], [16, C.b400], [6, C.sun], [11, C.p300], [14, C.sun]].forEach(([x, c], i) => disc(g, x, i < 4 ? 6 : 4, 2, c)); }
      R(g, 1, 8, 18, 7, C.w2); R(g, 1, 8, 18, 1, C.w1); [5, 10, 15].forEach(x => R(g, x, 8, 1, 7, C.w3)); R(g, 1, 14, 18, 1, C.w3);
      disc(g, 9, 16, 4, C.w3); disc(g, 9, 16, 3, C.w2); if (o.frame) { line(g, 6, 16, 12, 16, C.w4); line(g, 9, 13, 9, 19, C.w4); } else { line(g, 7, 14, 11, 18, C.w4); line(g, 11, 14, 7, 18, C.w4); } P(g, 9, 16, C.w4);
      line(g, 19, 12, 24, 11, C.w3);
      const d = o.frame; R(g, 22, 8, 9, 5, C.co400); R(g, 22, 12, 9, 1, C.co500); R(g, 22, 13, 1, 5 - d, C.co500); R(g, 24, 13, 1, 4 + d, C.co500); R(g, 28, 13, 1, 4 + d, C.co500); R(g, 30, 13, 1, 5 - d, C.co500);
      R(g, 30, 5, 2, 4, C.co400); R(g, 30, 3, 5, 4, C.co400); R(g, 33, 5, 2, 2, C.co200); P(g, 32, 4, C.ink); R(g, 30, 0, 1, 3, C.co400); R(g, 32, 1, 1, 2, C.co400); P(g, 21, 9, C.co500); P(g, 21, 10, C.ink2); R(g, 23, 8, 6, 1, C.b400);
    }
  });
  def('dog', {
    name: 'Dog', cat: 'animal', box: [13, 10], frames: 2, variants: 3, varNames: ['Brown', 'Spotted', 'Black'],
    draw(g, o) {
      const b = [C.w1, C.s50, C.ink2][o.v % 3], d = [C.w2, C.s300, C.co700][o.v % 3];
      R(g, 2, 4, 7, 3, b); R(g, 2, 6, 7, 1, d); R(g, 2, 7, 1, 3, d); R(g, 4, 7, 1, 2, d); R(g, 7, 7, 1, 3, d); R(g, 8, 7, 1, 2, d);
      if (o.frame) { R(g, 0, 1, 1, 3, b); P(g, 1, 3, b); } else { R(g, 0, 4, 2, 1, b); P(g, 0, 3, b); }
      R(g, 8, 1, 4, 4, b); R(g, 8, 1, 1, 3, d); P(g, 11, 2, C.ink); P(g, 12, 3, C.ink); if (o.frame) P(g, 11, 5, C.b400);
      if (o.v === 1) { P(g, 4, 4, C.co600); P(g, 6, 5, C.co600); P(g, 9, 2, C.co600); }
      R(g, 5, 4, 2, 1, C.b400);
    }
  });

  /* ================= celebrations ================= */
  const FLAGS = [C.b400, C.sun, C.l400, C.s50, C.k400, C.c400];
  def('bunting', {
    name: 'Bunting', cat: 'event', foot: [4, 1], box: [66, 30, 33, 29], frames: 2, fps: 2, litable: true, plazaOk: true,
    desc: 'Strung up for any excuse.', lights: [{ x: -20, y: -21, r: 14, mode: 'win' }, { x: 0, y: -18, r: 14, mode: 'win' }, { x: 20, y: -21, r: 14, mode: 'win' }],
    draw(g, o) {
      R(g, 1, 2, 2, 28, C.w3); R(g, 63, 2, 2, 28, C.w3); P(g, 1, 1, C.sun); P(g, 2, 1, C.sun); P(g, 63, 1, C.sun); P(g, 64, 1, C.sun);
      const sy = x => 4 + Math.round(Math.sin((x - 3) / 60 * Math.PI) * 6);
      for (let x = 3; x < 63; x++) P(g, x, sy(x), C.co600);
      for (let x = 5, i = 0; x < 60; x += 5, i++) { const y = sy(x + 2) + 1, c = FLAGS[i % FLAGS.length], tip = (o.frame + i) % 2; for (let r = 0; r < 5; r++) { const w = Math.max(1, 4 - r); R(g, x + (4 - w) / 2 + (r > 2 ? tip : 0), y + r, w, 1, c); } }
      [13, 33, 53].forEach(x => { const y = sy(x) + 1; R(g, x - 1, y, 3, 4, o.lit ? C.glow : C.c500); P(g, x, y + 1, o.lit ? C.glow2 : C.c400); });
    }
  });
  def('maypole', {
    name: 'Maypole', cat: 'event', foot: [1, 1], box: [44, 58, 22, 57], frames: 4, fps: 3, solid: true, plazaOk: true,
    desc: 'Dance around it until dizzy. Tradition.',
    draw(g, o) {
      const cx = 22, cols = [C.b400, C.sun, C.k400, C.s50, C.c400, C.l400];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + o.frame * Math.PI / 12, ex = cx + Math.cos(a) * 19, ey = 52 + Math.sin(a) * 5; if (Math.sin(a) < 0) { line(g, cx, 9, ex, ey, cols[i]); P(g, ex, ey + 1, cols[i]); } }
      R(g, 21, 6, 2, 50, C.w1); R(g, 22, 6, 1, 50, C.w2); R(g, 19, 55, 6, 2, C.co400);
      oval(g, cx, 7, 6, 2, C.p500); [[17, 7, C.b400], [20, 6, C.sun], [24, 6, C.s50], [27, 7, PINK], [22, 8, C.b400]].forEach(([x, y, c]) => P(g, x, y, c));
      R(g, 21, 1, 2, 4, C.sun); P(g, 21, 0, C.glow2);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + o.frame * Math.PI / 12, ex = cx + Math.cos(a) * 19, ey = 52 + Math.sin(a) * 5; if (Math.sin(a) >= 0) { line(g, cx, 9, ex, ey, cols[i]); P(g, ex, ey + 1, cols[i]); } }
    }
  });
  def('bonfire', {
    name: 'Bonfire', cat: 'event', foot: [2, 2], box: [36, 44, 18, 43], frames: 4, fps: 8, solid: true, fire: true, plazaOk: true,
    desc: 'Visible from the next valley.', lights: [{ x: 0, y: -14, r: 96, mode: 'fire' }],
    draw(g, o) {
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; R(g, 18 + Math.cos(a) * 15 - 2, 37 + Math.sin(a) * 5 - 1, 4, 3, k % 2 ? C.co300 : C.co400); }
      [[4, 40, 16, 16], [32, 40, 20, 16], [10, 42, 22, 18], [26, 42, 16, 18]].forEach(([a, b, c, d]) => line(g, a, b, c, d, C.w3, 2));
      const H = [[16, 22, 18, 14, 20], [20, 16, 24, 18, 14], [14, 24, 16, 22, 18], [18, 18, 22, 14, 22]][o.frame % 4];
      for (let i = 0; i < 5; i++) { const x = 8 + i * 4, h = H[i]; R(g, x, 38 - h, 4, h, C.c400); R(g, x + 1, 40 - h, 2, h - 4, C.sun); if (i % 2) P(g, x + 1, 37 - h, C.sun); }
      R(g, 14, 24, 8, 12, C.sun); R(g, 16, 26, 4, 9, C.glow2);
    }
  });
  def('arch', {
    name: 'Wedding Arch', cat: 'event', foot: [2, 1], box: [36, 46, 18, 45], plazaOk: true,
    desc: 'Borrowed every spring. Returned with fewer flowers.',
    draw(g) {
      R(g, 3, 12, 3, 34, C.s50); R(g, 30, 12, 3, 34, C.s50); R(g, 5, 12, 1, 34, C.s200); R(g, 32, 12, 1, 34, C.s200);
      for (let i = 0; i <= 40; i++) { const a = Math.PI - i / 40 * Math.PI, x = 18 + Math.cos(a) * 13.5, y = 13 - Math.sin(a) * 9; R(g, x - 1, y - 1, 3, 3, C.s50); }
      for (let i = 0; i <= 26; i++) { const a = Math.PI - i / 26 * Math.PI, x = 18 + Math.cos(a) * 14, y = 12 - Math.sin(a) * 9.5; P(g, x, y, i % 3 ? C.p500 : C.p400); if (i % 2 === 0) P(g, x + 1, y - 1, [ROSE, PINK, C.s50, C.sun][(i / 2) % 4]); }
      [[4, 18], [31, 22], [4, 28], [31, 32], [4, 38], [31, 14]].forEach(([x, y], i) => { P(g, x, y, C.p500); P(g, x + 1, y + 1, C.p400); P(g, x - 1, y + 1, i % 2 ? ROSE : PINK); });
      R(g, 17, 3, 3, 3, C.sun2); P(g, 18, 6, C.w4); line(g, 18, 6, 18, 9, C.co300);
      R(g, 6, 13, 1, 9, PINK); R(g, 29, 13, 1, 9, PINK);
    }
  });
  def('podium', {
    name: 'Podium', cat: 'event', foot: [1, 1], box: [22, 26, 11, 25], solid: true, plazaOk: true,
    desc: 'The town crier stands here. Loudly.',
    draw(g) { R(g, 0, 17, 22, 9, C.w2); for (let x = 3; x < 22; x += 5) R(g, x, 17, 1, 9, C.w3); R(g, 0, 17, 22, 1, C.w1); R(g, 0, 25, 22, 1, C.w4); R(g, 6, 18, 10, 6, C.b400); R(g, 6, 18, 10, 1, C.b500); R(g, 9, 20, 4, 2, C.sun); P(g, 6, 24, C.b400); P(g, 15, 24, C.b400); }
  });
  A.CATS.splice(A.CATS.findIndex(c => c[0] === 'prop') + 1, 0, ['life', 'Village Life'], ['event', 'Celebrations']);

  /* doors (sprite-local rects the engine opens when someone goes in or out) */
  const DOORS = { cottage: [14, 30, 6, 11], hall: [29, 51, 10, 19], storehouse: [12, 25, 10, 13], tavern: [23, 46, 8, 13], bakery: [6, 31, 6, 12], blacksmith: [22, 31, 6, 12], windmill: [21, 62, 6, 10], fishhut: [10, 19, 5, 9], lighthouse: [13, 63, 4, 7], mine: [14, 21, 12, 16] };
  Object.keys(DOORS).forEach(id => { const d = A.get(id); if (d) d.door = DOORS[id]; });

  /* ================= social layer ================= */
  const G = LW.Game.prototype;
  const base = { think: G.think, animal: G.animal, update: G.update, updateEntity: G.updateEntity, status: G.status, selInfo: G.selInfo, load: G.load, entSprite: G.entSprite };
  const TRAITS = ['Early riser', 'Night owl', 'Gossip', 'Romantic', 'Hard worker', 'Daydreamer', 'Grump', 'Foodie', 'Show-off', 'Peacemaker'];
  const LIKES = ['Fresh bread', 'Rainy days', 'Tavern songs', 'Cats', 'Gossip', 'Sunsets', 'Fishing', 'Festivals', 'Pumpkins', 'Quiet mornings'];
  const TOPICS = ['Gossiping about the baker', 'Arguing about turnips', 'Comparing hats', 'Sharing a joke', 'Planning the festival', 'Swapping recipes', 'Complaining about the rooster', 'Discussing the weather, again'];
  const MEET = ['Should the bridge be painted teal?', 'Do we need a second bakery?', 'Is the rooster allowed on the plaza?', 'Should the festival last two days?', 'Who has to fix the well?'];
  const UMB = [C.b400, C.k500, C.sun2, C.l500, C.c500];
  const FACE = { heart: 'love', laugh: 'laugh', angry: 'angry', question: 'surprised', bang: 'surprised', zzz: 'sleepy', note: 'happy', chat: 'happy', mug: 'happy', bowl: 'happy', bread: 'happy', sun: 'happy', coin: 'happy', star: 'happy', ring: 'love', wave: 'happy', fish: 'happy', wheat: 'happy', flower: 'love' };
  const night = h => h >= 21.8 || h < 5.4;
  const clockOf = W => String(Math.floor(W.hour)).padStart(2, '0') + ':' + String(Math.floor(W.time % 60)).padStart(2, '0');
  function walkNear(W, x, y, r) { r = r || 4; for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; if (W.walkable(x + dx, y + dy)) return [x + dx, y + dy]; } return null; }
  const vill = W => W.entities.filter(e => e.kind === 'villager');

  G.persona = function (e) {
    if (e._p || e.kind !== 'villager') return; e._p = true;
    const R = A.rng(e.uid * 977 + 13);
    if (e.age == null) e.age = e.opts.age != null ? e.opts.age : e.job === 'kid' ? 1 : (R() < .14 ? 2 : 0);
    if (e.age === 1) e.job = 'kid';
    e.trait = TRAITS[(R() * TRAITS.length) | 0]; e.likes = LIKES[(R() * LIKES.length) | 0]; e.mood = .6 + R() * .3; e.friends = {};
    e.outfit = { baker: 'baker', smith: 'smith', merchant: 'vest', guard: 'guard', innkeeper: 'apron' }[e.job] || null;
    while (e.look.length < 7) e.look.push(R() < .15 ? 1 : 0);
    if (e.age === 2 && R() < .5) e.look[6] = 1;
    if (e.age === 1 && e.home) { const p = e.home.residents.find(r => r !== e && r.kind === 'villager'); if (p) { e.look[0] = p.look[0]; if (R() < .6) e.look[1] = p.look[1]; } }
    const early = e.trait === 'Early riser';
    e.wake = e.age === 1 ? 6.4 + R() * .7 : early ? 5.45 + R() * .3 : 5.6 + R() * 1.3;
    e.bed = e.age === 1 ? 20.1 + R() * .6 : e.age === 2 ? 20.8 + R() * .7 : e.trait === 'Night owl' ? 23.9 : 21.2 + R() * .6;
  };
  G.diaryAdd = function (key, text, gap) {
    const W = this.world; this._dk = this._dk || {}; if (key && this._dk[key] != null && this.t - this._dk[key] < (gap == null ? 25 : gap)) return;
    if (key) this._dk[key] = this.t; this.diary = this.diary || []; this.diary.unshift({ when: clockOf(W), text, id: Math.random() }); this.diary.length = Math.min(this.diary.length, 30);
  };
  G.faceFor = function (e) {
    if (e.faceOverride) return e.faceOverride;
    const b = e.bubble && e.bubble.icon; if (b && FACE[b]) return FACE[b];
    if (e.pose === 'dance' || e.pose === 'cheer' || e.pose === 'eat') return 'happy';
    if (e.pose === 'sit' && e.age === 2) return 'sleepy';
    const wx = this.weather(); if ((wx === 'rain' || wx === 'storm') && e.age === 1) return 'happy';
    if (e.mood < .35) return 'sad';
    return null;
  };
  G.entSprite = function (e) {
    if (e.kind !== 'villager') return base.entSprite.call(this, e);
    this.persona(e);
    const moving = !!e.path, t = this.t, work = !moving && e.wait > 0 && e.tool;
    let pose = moving && e.pose !== 'dance' ? null : (e.pose || null), fr;
    if (pose) fr = Math.floor(t * ({ dance: 4, wave: 5, talk: 2.5, cheer: 3, eat: 1.4 }[pose] || 1) + e.phase) % 2;
    else fr = moving ? Math.floor(e.walk * 5) % 4 : work ? 4 + (Math.floor(t * (e.tool === 'rod' ? 1.2 : 2.8) + e.phase) % 2) : 0;
    const wx = this.weather(), W = this.world, wet = (wx === 'rain' || wx === 'storm') && !work && !pose && e.age !== 1;
    const outfit = e.outfit2 || e.outfit || (W.season === 3 && W.climate !== 'warm' ? 'scarf' : null), face = this.faceFor(e), umb = wet ? UMB[e.look[2] % 5] : null;
    const key = e.look.join('') + '|' + e.dir + '|' + (e.carry || '') + '|' + (work ? e.tool : '') + '|' + (pose || '') + '|' + (face || '') + '|' + e.age + '|' + (outfit || '') + '|' + (umb || '');
    return A.sprite('villager', { key, look: e.look, dir: e.dir, carry: e.carry, tool: work ? e.tool : null, pose, face, age: e.age, outfit, umbrella: umb }, fr);
  };
  G.litFor = function (o, lit) {
    const d = o.def; if (!d.litable || o.build < 1) return false;
    const h = this.world.hour, L = this.light ? this.light.L : 0, off = o.phase % 1;
    if (L < .22) return false;
    if (o.temp) return true;
    if (d.home) { const on = 17.3 + off * 1.4, out = 21.7 + off * 1.6; return (h >= on && h < out) || (h >= 4.9 && h < 5.6 + off * 1.2); }
    if (d.tavern) return h >= 17 || h < 1.5;
    return lit;
  };
  G.afterObject = function (ctx, o, s, fx, fy) {
    if (!(o.doorT > 0) || !o.def.door) return;
    const [dx, dy, dw, dh] = o.def.door, x0 = Math.round(fx) - s.ax + 1 + dx, y0 = Math.round(fy) - s.ay + 1 + dy, warm = this.light && this.light.L > .3;
    ctx.fillStyle = warm ? '#7A4522' : C.ink2; ctx.fillRect(x0, y0, dw, dh);
    ctx.fillStyle = warm ? C.c400 : C.co700; ctx.fillRect(x0, y0 + dh - 2, dw, 2);
    ctx.fillStyle = C.w2; ctx.fillRect(x0 - 2, y0, 2, dh); ctx.fillStyle = C.w3; ctx.fillRect(x0 - 2, y0, 1, dh);
  };
  G.drawParticle = function (ctx, p) {
    if (p.k === 'ball') { ctx.globalAlpha = .25; ctx.fillStyle = C.ink; ctx.fillRect(Math.round(p.x - 1), Math.round(p.gy), 3, 1); ctx.globalAlpha = 1; ctx.fillStyle = C.b400; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 3); ctx.fillStyle = C.s50; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 1, 1); }
    else if (p.k === 'rocket') { ctx.globalAlpha = 1; ctx.fillStyle = C.glow2; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 2); ctx.fillStyle = C.sun; ctx.fillRect(Math.round(p.x), Math.round(p.y + 2), 1, 2); }
    else if (p.k === 'fw') { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    else if (p.k === 'petal') { ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.sin(this.t * 7 + p.ph) > 0 ? 2 : 1, 1); }
  };
  G.extraGlow = function (glow, L) {
    const W = this.world;
    W.particles.forEach(p => { if (p.k === 'fw') glow(p.x, p.y, 7, .7 * Math.max(0, p.life / p.max)); else if (p.k === 'rocket') glow(p.x, p.y, 5, .6); });
    if (L > .3) W.objects.forEach(o => { if (o.doorT > 0 && o.def.door) { const b = A.boxOf(o.def, o.opts), d = o.def.door; glow((o.x + o.fw / 2) * T - b[2] + d[0] + d[2] / 2, (o.y + o.fh) * T - b[3] + d[1] + d[3], 16, .7 * L * Math.min(1, o.doorT)); } });
  };

  G.seats = function () {
    const W = this.world; if (this._seats && this._seatsV === W.version) return this._seats;
    const old = new Map((this._seats || []).filter(s => s.by).map(s => [s.key, s.by])), S = [];
    W.objects.forEach(o => {
      if (o.build < 1) return;
      if (o.id === 'bench') for (let i = 0; i < 2; i++) S.push({ key: o.uid + 'b' + i, o, kind: 'bench', tx: o.x + i, ty: o.y + 1, x: o.x + i + .5, y: o.y + .82, sortY: o.y + 1.1, dir: 'down', pose: 'sit' });
      if (o.id === 'table') for (let i = 0; i < 2; i++) { S.push({ key: o.uid + 'n' + i, o, kind: 'table', tx: o.x + i, ty: o.y - 1, x: o.x + i + .5, y: o.y + .45, sortY: o.y + .9, dir: 'down', pose: 'eat' }); S.push({ key: o.uid + 's' + i, o, kind: 'table', tx: o.x + i, ty: o.y + 1, x: o.x + i + .5, y: o.y + 1.2, sortY: o.y + 1.25, dir: 'up', pose: 'eat' }); }
    });
    S.forEach(s => { const b = old.get(s.key); if (b && W.entities.includes(b) && b.seat && b.seat.key === s.key) { s.by = b; b.seat = s; } });
    this._seats = S; this._seatsV = W.version; return S;
  };
  G.sitAt = function (e, seat, act, dur, done, icon) {
    seat.by = e; e.seat = seat; e.activity = act;
    e.goTo(seat.tx, seat.ty, () => { if (e.seat !== seat) return; e.x = seat.x; e.y = seat.y; e.sortY = seat.sortY; e.dir = seat.dir; e.pose = seat.pose; e.wait = dur; e.done = () => { this.stand(e); done && done(); }; if (icon) e.say(icon); });
    if (!e.path) this.stand(e);
  };
  G.stand = function (e) { const s = e.seat; if (s) { if (s.by === e) s.by = null; e.seat = null; e.x = s.tx + .5; e.y = s.ty + .5; } e.sortY = null; e.pose = null; };
  G.interrupt = function (e) { if (e.seat) this.stand(e); e.path = null; e.onArrive = null; e.wait = 0; e.done = null; e.tool = null; e.building = null; e.chop = null; e.sparks = false; e.pose = null; };
  G.free = function (p) { return p.kind === 'villager' && !p.inside && !p.role && !p.seat && !p.partner && !p.game && !p.carry && !p.tool && !p.building; };
  G.startChat = function (e) {
    const W = this.world, ps = vill(W).filter(p => p !== e && this.free(p) && Math.hypot(p.x - e.x, p.y - e.y) < 12);
    if (!ps.length) return false;
    const p = ps.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
    const m = walkNear(W, Math.floor((e.x + p.x) / 2), Math.floor((e.y + p.y) / 2), 3); if (!m) return false;
    const b = W.walkable(m[0] + 1, m[1]) ? [m[0] + 1, m[1]] : W.walkable(m[0] - 1, m[1]) ? [m[0] - 1, m[1]] : null; if (!b) return false;
    this.interrupt(p); this.persona(p);
    const dur = 10 + Math.random() * 10, topic = pick(TOPICS);
    e.partner = p; p.partner = e;
    [[e, m, p], [p, b, e]].forEach(([w, tile, o]) => { w.activity = topic + ' with ' + o.name; w.goTo(tile[0], tile[1], () => { this.face(w, o.x, o.y); w.wait = dur; w.done = () => { if (w.partner) { w.friends[o.name] = (w.friends[o.name] || 0) + 1; } w.partner = null; w.mood = Math.min(1, w.mood + .08); }; }); });
    if (Math.random() < .35) this.diaryAdd('chat', e.name + ' and ' + p.name + ': ' + topic.toLowerCase() + '.', 18);
    return true;
  };
  G.startGame = function (e) {
    const W = this.world, ps = vill(W).filter(p => p !== e && p.age === 1 && this.free(p) && Math.hypot(p.x - e.x, p.y - e.y) < 14);
    if (!ps.length) return false;
    const p = ps[0], x0 = Math.floor(e.x), y0 = Math.floor(e.y);
    let spot = null; for (let dy = -2; dy <= 2 && !spot; dy++) for (let dx = -3; dx <= 3 && !spot; dx++) { const x = x0 + dx, y = y0 + dy; if (W.walkable(x, y) && W.walkable(x + 3, y) && W.walkable(x + 1, y) && W.walkable(x + 2, y)) spot = [x, y]; }
    if (!spot) return false;
    this.interrupt(p); this.persona(p);
    const g = { a: e, b: p, t: 0, ball: { k: 'ball', x: (spot[0] + .5) * T, y: (spot[1] + .5) * T, gy: (spot[1] + .5) * T, vx: 0, vy: 0, life: 1e9, max: 1e9 } };
    W.particles.push(g.ball); this.games = this.games || []; this.games.push(g);
    const dur = 14 + Math.random() * 10;
    [[e, spot[0], p], [p, spot[0] + 3, e]].forEach(([w, x, o]) => { w.game = g; w.activity = 'Playing catch with ' + o.name; w.goTo(x, spot[1], () => { this.face(w, o.x, o.y); w.wait = dur; w.done = () => this.endGame(g); }); });
    this.diaryAdd('game', e.name + ' and ' + p.name + ' are playing catch.', 40);
    return true;
  };
  G.endGame = function (g) { g.ball.life = 0; [g.a, g.b].forEach(w => { if (w.game === g) { w.game = null; w.pose = null; } }); this.games = (this.games || []).filter(x => x !== g); };
  G.doPose = function (e, act, tx, ty, dur, pose, icon, face) { e.activity = act; e.goTo(tx, ty, () => { e.wait = dur; e.pose = pose; e.poseT = dur; if (icon) e.say(icon); if (face) this.face(e, face[0], face[1]); }); };

  G.think = function (e) {
    this.persona(e);
    if (e.seat) this.stand(e);
    e.pose = null; e.faceOverride = null; e.sortY = null; e.lift = 0;
    if (e.partner && !this.world.entities.includes(e.partner)) e.partner = null;
    if (e.game) this.endGame(e.game);
    if (this.event && this.eventThink(e)) return;
    const W = this.world, h = W.hour, R = Math.random, P = k => W.poi(k);
    if (night(h) && e.trait === 'Night owl' && h >= 21.8 && h < 23.6 && P('taverns').length && !e.carry) { this.enter(e, P('taverns')[0], 'One last song at the tavern', 15, null, 'mug'); return; }
    if (!night(h) && !e.carry) {
      if (h >= e.bed && e.home && W.objects.includes(e.home) && e.home.build >= 1) { const d = W.door(e.home); e.activity = e.age === 1 ? 'Sent to bed' : 'Off to bed early'; e.goTo(d.x, d.y, () => { e.inside = true; e.insideT = null; e.activity = 'Asleep'; }); return; }
      const meal = h >= 6.4 && h < 7.9 ? 'breakfast' : h >= 11.6 && h < 13.2 ? 'lunch' : h >= 18 && h < 19.6 ? 'supper' : null;
      e.ate = e.ate || {};
      if (meal && !e.ate[W.day + meal] && R() < .75) {
        e.ate[W.day + meal] = true;
        const seats = this.seats().filter(s => !s.by && s.kind === 'table' && W.walkable(s.tx, s.ty));
        if (meal !== 'breakfast' && seats.length) {
          const busy = seats.filter(s => this.seats().some(o => o.o === s.o && o.by)), s = (busy.length && R() < .8 ? busy : seats).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
          const mates = this.seats().filter(o => o.o === s.o && o.by).map(o => o.by.name);
          this.sitAt(e, s, meal === 'lunch' ? 'Lunch at the long table' : 'Supper with the neighbors', 12 + R() * 10, () => { e.mood = Math.min(1, e.mood + .1); }, 'bowl');
          if (mates.length) this.diaryAdd('meal' + s.o.uid, e.name + ' joined ' + mates.slice(0, 2).join(' and ') + ' for ' + meal + '.', 30);
          return;
        }
        if (e.home && W.objects.includes(e.home) && e.home.build >= 1) { this.enter(e, e.home, meal === 'breakfast' ? 'Breakfast at home' : 'Eating at home', 6 + R() * 8, () => { e.mood = Math.min(1, e.mood + .06); }, 'bowl'); return; }
      }
      const evening = h >= 16.5, free = (h >= 13.2 && h < 15 && R() < .25) || (evening && R() < .5) || (e.age === 2 && R() < .55) || e.job === 'wanderer';
      if (free) {
        const r = R();
        if (e.age === 1 && r < .55 && this.startGame(e)) return;
        if (h >= 19.2 && P('taverns').length && e.age !== 1 && r < .3) { const d = W.door(P('taverns')[0]); this.doPose(e, 'Dancing outside the tavern', d.x + Math.round((R() - .5) * 5), d.y + 1 + (R() * 2 | 0), 8 + R() * 8, 'dance', 'note'); return; }
        if (r < .45 && this.startChat(e)) return;
        const benches = this.seats().filter(s => !s.by && s.kind === 'bench' && W.walkable(s.tx, s.ty));
        if (benches.length && r < .85) { const s = benches.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[R() < .7 ? 0 : (R() * benches.length) | 0]; this.sitAt(e, s, e.age === 2 ? pick(['Feeding the pigeons', 'Telling stories nobody asked for', 'Napping, technically']) : pick(['Resting on the bench', 'Watching the world go by', 'People-watching']), 12 + R() * 14, () => { e.mood = Math.min(1, e.mood + .05); }, R() < .4 ? 'note' : null); return; }
      }
    }
    base.think.call(this, e);
  };
  G.animal = function (e) {
    const W = this.world, R = Math.random;
    if (e.kind === 'dog') {
      const o = e.owner; if (o && !W.entities.includes(o)) e.owner = null;
      if (e.owner) {
        if (e.owner.inside) { const h = e.owner.insideObj || e.owner.home; if (h && W.objects.includes(h)) { const d = W.door(h); e.goTo(d.x + 1, d.y, () => { e.wait = 3 + R() * 4; }); e.activity = 'Waiting by the door for ' + e.owner.name; return; } }
        const d = Math.hypot(e.owner.x - e.x, e.owner.y - e.y);
        if (d > 1.8) { e.goTo(Math.floor(e.owner.x + (R() < .5 ? -1 : 1)), Math.floor(e.owner.y), () => { e.wait = .4 + R(); }); } else { e.wait = 1 + R() * 2; if (R() < .15) e.say('heart', 1.2); }
        e.activity = 'Following ' + e.owner.name; return;
      }
    }
    if (e.kind === 'cart' && e.route) {
      const i = e.ri = ((e.ri || 0) + 1) % e.route.length, [tx, ty, stop] = e.route[i];
      e.activity = stop ? 'Unloading at the market' : 'On the road to market';
      e.goTo(tx, ty, () => { e.wait = stop ? 14 + R() * 8 : 2; if (stop) { e.say('coin', 3); this.diaryAdd('cart', pick(['The cart from Millbrook brought apples.', 'Fresh cabbages just rolled in on the cart.', 'The hay cart is here. The donkey looks proud.']), 60); } });
      return;
    }
    base.animal.call(this, e);
  };
  G.updateEntity = function (e, sdt, h) {
    if (e.kind !== 'villager') return base.updateEntity.call(this, e, sdt, h);
    this.persona(e);
    if (e.role && e.inside) { const o = e.insideObj || e.home; e.inside = false; e.insideT = null; e.insideObj = null; if (o) o.doorT = 1.1; }
    if (e.inside && e.insideT == null && !e.role && (h >= e.bed || h < e.wake)) return;
    const was = e.inside, obj = e.insideObj || e.home;
    base.updateEntity.call(this, e, sdt, h);
    if (was !== e.inside && obj && this.world.objects.includes(obj)) {
      obj.doorT = 1.1;
      if (!e.inside && obj === e.home && h >= 5.3 && h < 9 && e.activity === 'Waking up') {
        e.pose = 'cheer'; e.poseT = 1.3;
        const W = this.world; if (!W._firstUp || W._firstUp !== W.day) { W._firstUp = W.day; this.diaryAdd('wake', pick([e.name + ' is the first one up.', e.name + ' beat the rooster again.', e.name + ' is up before the sun.']), 5); }
      }
    }
  };
  G.update = function (dt) {
    const W = this.world, h0 = W.hour;
    base.update.call(this, dt);
    const sdt = dt * this.speed, R = Math.random, h = W.hour, t = this.t, vs = vill(W);
    W.objects.forEach(o => { if (o.doorT > 0) o.doorT -= dt; if (o.build >= 1 && o._wasSite) { o._wasSite = false; this.diaryAdd(null, 'The new ' + o.def.name.toLowerCase() + ' is finished.' + (o.def.home ? ' Two neighbors moved in.' : '')); } if (o.build < 1) o._wasSite = true; });
    vs.forEach(e => {
      if (e.poseT > 0) { e.poseT -= sdt > 0 ? sdt : dt; if (e.poseT <= 0 && !e.seat && !e.role) e.pose = null; }
      if (sdt > 0) e.mood = Math.max(.15, (e.mood || .7) - sdt * .0012);
      const p = e.partner;
      if (p && !e.path && e.wait > 0 && !p.path && p.wait > 0 && e.uid < p.uid && sdt > 0) {
        e.ct = (e.ct || 0) - sdt;
        if (e.ct <= 0) { e.ct = 1.5 + R() * 1.3; const s = R() < .5 ? e : p, l = s === e ? p : e; s.pose = 'talk'; s.poseT = 1.4; l.pose = null; s.say(pick(['chat', 'chat', 'laugh', 'question', 'heart', 'note', 'bang']), 1.5); if (R() < .3) l.say(pick(['laugh', 'heart', 'bang']), 1.2); this.face(s, l.x, l.y); this.face(l, s.x, s.y); }
      }
    });
    (this.games || []).forEach(g => {
      const a = g.a, b = g.b; if (a.path || b.path || !(a.wait > 0) || !(b.wait > 0)) return;
      g.t += sdt; const u = (g.t * .9) % 2, from = u < 1 ? a : b, to = u < 1 ? b : a, k = u % 1;
      g.ball.x = (from.x + (to.x - from.x) * k) * T; g.ball.gy = (from.y + (to.y - from.y) * k) * T; g.ball.y = g.ball.gy - 7 - Math.sin(Math.PI * k) * 12;
      from.pose = k < .2 ? 'cheer' : null; to.pose = k > .8 ? 'cheer' : null; if (R() < sdt * .25) pick([a, b]).say(pick(['laugh', 'star', 'bang']), 1.2);
    });
    this._waveT = (this._waveT || 0) - dt;
    if (this._waveT <= 0) { this._waveT = .5; const walk = vs.filter(e => e.path && !e.inside); for (let i = 0; i < walk.length; i++) for (let j = i + 1; j < walk.length; j++) { const a = walk[i], b = walk[j]; if (Math.abs(a.x - b.x) < 1.4 && Math.abs(a.y - b.y) < 1.4 && R() < .4 && t - (a.waved || -99) > 25 && t - (b.waved || -99) > 25) { a.waved = b.waved = t; a.say('wave', 1.6); b.say(R() < .6 ? 'wave' : 'heart', 1.6); } } }
    W.particles.forEach(p => { if (p.k === 'rocket' && !p.burst && p.life < .09) { p.burst = true; const c = pick([C.b400, C.sun, C.k300, C.s50, PINK, C.l300]); for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, s = 26 + R() * 18; W.particles.push({ k: 'fw', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 24, life: 1 + R() * .6, max: 1.6, c: i % 5 ? c : C.glow2 }); } } });
    if (sdt > 0) {
      const cross = x => h0 < x && h >= x;
      if (cross(5.6) && W.poi('bakeries').length) this.diaryAdd('t1', 'The bakery oven is warming up.');
      if (cross(12)) this.diaryAdd('t2', W.poi('stalls').length ? 'Noon. The long tables fill up.' : 'Noon. Everyone stops for lunch.');
      if (cross(17.6)) this.diaryAdd('t3', 'Windows are lighting up, one house at a time.');
      if (cross(20) && W.poi('taverns').length) this.diaryAdd('t4', pick(['Someone at the tavern started a song.', 'The tavern is louder than usual tonight.']));
      if (cross(22.6)) this.diaryAdd('t5', 'Most of the village is asleep.');
    }
    if (this.event) this.eventUpdate(dt, sdt);
  };
  G.load = function (W, o) {
    this.endEvent(); this.games = []; this.diary = []; this._dk = {}; this._seats = null;
    base.load.call(this, W, o);
    const n = vill(W).length, homes = W.objects.filter(x => x.def.home).length;
    this.diaryAdd(null, W.name + ': ' + n + ' villagers, ' + homes + ' homes, ' + (W.objects.filter(x => x.id === 'dog' || x.def.cat === 'life').length ? 'and a lot of laundry.' : 'one shared well.'));
  };
  G.status = function () {
    const s = base.status.call(this); if (!s) return s;
    const h = this.world.hour;
    s.event = this.event ? this.event.type : 'ordinary'; s.hour = h;
    s.diary = (this.diary || []).slice(0, 4);
    s.routine = h < 5.4 ? 'Sleeping' : h < 7.8 ? 'Waking up, breakfast' : h < 11.6 ? 'Morning work' : h < 13.2 ? 'Lunch break' : h < 17 ? 'Afternoon work' : h < 19.6 ? 'Supper' : h < 21.8 ? 'Evening at the tavern' : 'Sleeping';
    return s;
  };
  G.selInfo = function () {
    const info = base.selInfo.call(this); if (!info) return info;
    info.facts = []; const e = this.sel;
    if (info.type === 'villager') {
      this.persona(e);
      if (e.age === 1) info.eyebrow = 'Kid'; else if (e.age === 2) info.eyebrow += ' · Elder';
      e._port = e._port || A.thumb('villager', { key: 'P' + e.uid + e.look.join('') + e.age + (e.outfit || ''), look: e.look, dir: 'down', age: e.age, outfit: e.outfit, face: 'happy' }, 6); info.portrait = e._port;
      const bf = Object.keys(e.friends || {}).sort((a, b) => e.friends[b] - e.friends[a])[0];
      info.facts = [['Personality', e.trait], ['Loves', e.likes], [e.spouse ? 'Married to' : 'Best friend', e.spouse || bf || 'Still looking'], ['Mood', e.mood > .75 ? 'Cheerful' : e.mood > .5 ? 'Content' : e.mood > .35 ? 'Tired' : 'Grumpy']];
    } else if (e && e.kind === 'dog' && e.owner) info.facts = [['Owner', e.owner.name], ['Loves', 'Sticks']];
    return info;
  };

  /* ================= community events ================= */
  G.eventCenter = function () {
    const W = this.world, pl = W.poi('plaza');
    if (!pl.length) return walkNear(W, Math.round(W.focus.x), Math.round(W.focus.y), 6);
    let sx = 0, sy = 0; pl.forEach(p => { sx += p[0]; sy += p[1]; });
    return LW.gen.nearestOf(W, pl.filter(p => !W.occ[p[1] * W.w + p[0]]), sx / pl.length, sy / pl.length) || pl[0];
  };
  G.assignRole = function (e, role) {
    this.persona(e);
    if (e.inside) { const o = e.insideObj || e.home; e.inside = false; e.insideT = null; e.insideObj = null; if (o) o.doorT = 1.1; }
    if (e.partner) { e.partner.partner = null; e.partner = null; }
    if (e.game) this.endGame(e.game);
    this.interrupt(e); e.carry = null;
    e.role = role; role.e = e; e.roleAt = false; if (role.outfit) e.outfit2 = role.outfit;
    this.event.roles.push(role); this.toRole(e);
  };
  G.toRole = function (e) {
    const r = e.role, W = this.world; e.activity = r.act; if (r.browse) { e.roleAt = true; return; }
    const tile = walkNear(W, Math.floor(r.x), Math.floor(r.y), 4);
    const arrive = () => { if (e.role !== r) return; e.roleAt = true; e.x = r.x; e.y = r.y; e.sortY = r.sortY != null ? r.sortY : null; e.lift = r.lift || 0; e.wait = 1e9; if (r.dir) { e.dir = r.dir; e.flip = !!r.flip; } if (r.face) this.face(e, r.face[0], r.face[1]); e.pose = r.pose || null; };
    if (!tile) { arrive(); return; }
    e.goTo(tile[0], tile[1], arrive); if (!e.path) arrive();
  };
  G.eventThink = function (e) {
    const r = e.role; if (!r) return false;
    const W = this.world, R = Math.random;
    if (r.browse) {
      const st = W.poi('stalls'); if (!st.length) return false;
      if (e.carry && R() < .5) e.carry = null;
      const s = pick(st);
      this.task(e, pick(['Haggling over turnips', 'Sampling the cheese', 'Admiring the hats', 'Buying bread for the week', 'Pretending not to want the pie']), s.x + (R() * 2 | 0), s.y + 1, 4 + R() * 6, () => { if (R() < .3) e.carry = pick(['basket', 'bread', 'fish']); }, pick(['coin', 'coin', 'bowl', 'question', 'chat', 'heart']), null, [s.x + 1, s.y]);
      return true;
    }
    if (!e.roleAt) { this.toRole(e); return true; }
    e.wait = 1e9; return true;
  };
  G.startEvent = function (type) {
    this.endEvent();
    if (!type || type === 'ordinary') { this.diaryAdd(null, 'An ordinary day. Back to work.'); return; }
    const W = this.world, c = this.eventCenter(); if (!c) return;
    const ev = this.event = { type, t: 0, cx: c[0], cy: c[1], props: [], roles: [], ents: [], fired: {} };
    const put = (id, x, y, o, m) => { const ob = LW.gen.placeNear(W, id, x, y, o || {}, m == null ? 0 : m, 6); if (ob) { ob.temp = true; ev.props.push(ob); this.puff((ob.x + ob.fw / 2) * T, (ob.y + ob.fh) * T, 8, C.s50); } return ob; };
    const people = vill(W).filter(e => !e.role).sort((a, b) => Math.hypot(a.x - c[0], a.y - c[1]) - Math.hypot(b.x - c[0], b.y - c[1]));
    const take = (n, f) => { const out = []; for (let i = 0; i < people.length && out.length < n; i++) if (!f || f(people[i])) { out.push(people[i]); people.splice(i, 1); i--; } return out; };
    const R = Math.random, cx = c[0], cy = c[1];
    if (type === 'festival') {
      const mp = put('maypole', cx, cy); const mx = mp ? mp.x + .5 : cx + .5, my = mp ? mp.y + .9 : cy + .9; ev.mx = mx; ev.my = my;
      put('bunting', cx - 6, cy - 3); put('bunting', cx + 3, cy - 3); put('bunting', cx - 6, cy + 3); put('bunting', cx + 3, cy + 3);
      const bon = put('bonfire', cx + 7, cy + 1, {}, 0); if (bon) { ev.bx = (bon.x + 1) * T; ev.by = (bon.y + 1) * T; }
      put('table', cx - 7, cy, { v: 1 }, 0);
      take(8).forEach((e, i) => { const a = i / 8 * Math.PI * 2; this.assignRole(e, { ring: true, a0: a, x: mx + Math.cos(a) * 2.3, y: my + Math.sin(a) * 1.3, act: 'Dancing round the maypole', pose: 'dance' }); });
      take(2, e => e.age !== 1).forEach((e, i) => this.assignRole(e, { music: true, x: mx + (i ? 3.6 : -3.6), y: my - 1.4, act: i ? 'Playing the fiddle' : 'Playing the drum', pose: 'talk', face: [mx, my] }));
      take(14).forEach((e, i) => { const a = (i / 14) * Math.PI * 2 + .2; this.assignRole(e, { watch: true, x: mx + Math.cos(a) * 4.4, y: my + Math.sin(a) * 2.7, act: pick(['Clapping along', 'Cheering the dancers', 'Waiting for their turn']), face: [mx, my] }); });
      this.diaryAdd(null, 'The festival has begun! Ribbons are up on the plaza.');
    } else if (type === 'wedding') {
      const ar = put('arch', cx, cy - 2); const ax = ar ? ar.x + 1 : cx + 1, ay = ar ? ar.y + 1 : cy;
      put('bunting', ax - 6, ay - 2); put('bunting', ax + 2, ay - 2); put('table', ax - 6, ay + 3, { v: 1 }, 0); put('table', ax + 4, ay + 3, { v: 1 }, 0);
      const adults = people.filter(e => e.age === 0);
      let a = null, b = null; for (const e of adults) { this.persona(e); const bf = Object.keys(e.friends || {}).sort((x, y) => e.friends[y] - e.friends[x])[0]; const p = bf && adults.find(o => o.name === bf && o !== e); if (p) { a = e; b = p; break; } }
      if (!a) { a = adults[0]; b = adults[1]; }
      if (a && b) {
        people.splice(people.indexOf(a), 1); people.splice(people.indexOf(b), 1); ev.couple = [a, b];
        this.assignRole(a, { couple: 0, x: ax - .45, y: ay + .35, sortY: ay + .5, act: 'Getting married!', outfit: 'groom', dir: 'side', flip: false });
        this.assignRole(b, { couple: 1, x: ax + .45, y: ay + .35, sortY: ay + .5, act: 'Getting married!', outfit: 'bride', dir: 'side', flip: true });
      }
      take(1, e => e.age === 2).concat(take(people.some(e => e.age === 2) ? 0 : 1)).slice(0, 1).forEach(e => this.assignRole(e, { officiant: true, x: ax, y: ay - .12, sortY: ay - .1, act: 'Officiating (nervously)', dir: 'down' }));
      const slots = []; [-3, -2, 2, 3].forEach(dx => [1.5, 2.5, 3.5].forEach(dy => slots.push([ax + dx - (dx > 0 ? 0 : 0), ay + dy, dx > 0])));
      take(slots.length).forEach((e, i) => { const [x, y, right] = slots[i]; this.assignRole(e, { guest: true, x, y, act: pick(['Crying a little', 'Holding the flowers', 'Waiting for the kiss', 'Wearing their best hat']), dir: 'side', flip: right }); });
      ev.ax = ax; ev.ay = ay;
      if (a && b) this.diaryAdd(null, a.name + ' and ' + b.name + ' are getting married on the plaza.');
    } else if (type === 'market') {
      put('stall', cx - 3, cy + 1, { v: 2 }); put('stall', cx + 2, cy + 1, { v: 3 }); put('bunting', cx - 2, cy - 3);
      const stalls = W.poi('stalls');
      stalls.forEach(s => { const seller = take(1, e => e.job === 'merchant')[0] || take(1, e => e.age === 0)[0]; if (!seller) return; const behind = W.walkable(s.x, s.y - 1); this.assignRole(seller, { sell: true, x: s.x + 1, y: behind ? s.y + .3 : s.y + 1.4, sortY: behind ? s.y + .5 : null, act: 'Selling at the market', dir: behind ? 'down' : 'up' }); });
      take(16).forEach(e => this.assignRole(e, { browse: true, act: 'Shopping at the market' }));
      const st = walkNear(W, Math.max(1, cx - 16), cy + 2, 6); if (st) { const cart = W.spawn('cart', st[0], st[1], { v: 0 }); cart.speed = .8; cart.route = [[st[0], st[1], false], [cx, cy + 3, true]]; cart.ri = 0; cart.temp = true; ev.ents.push(cart); }
      this.diaryAdd(null, "It's market day! Every stall on the plaza is open.");
    } else if (type === 'meeting') {
      const pod = put('podium', cx, cy - 2); const px = pod ? pod.x + .5 : cx + .5, py = pod ? pod.y + .9 : cy - 1;
      const sp = take(1, e => e.age === 2)[0] || take(1, e => e.job === 'merchant')[0] || take(1)[0];
      if (sp) this.assignRole(sp, { speaker: true, x: px, y: py, sortY: py + .2, lift: 7, act: 'Leading the town meeting', dir: 'down', pose: 'talk' });
      take(18).forEach((e, i) => { const row = i % 2, n = 9, k = Math.floor(i / 2), a = Math.PI * (.12 + .76 * k / (n - 1)), r = 2.6 + row * 1.3; this.assignRole(e, { crowd: true, x: px + Math.cos(a) * r * 1.5, y: py + .6 + Math.sin(a) * r, act: pick(['Listening, mostly', 'Waiting to object', 'Taking notes', 'Whispering to a neighbor']), face: [px, py - .5] }); });
      ev.topic = pick(MEET); ev.px = px; ev.py = py;
      this.diaryAdd(null, 'Town meeting: "' + ev.topic + '"');
    }
  };
  G.endEvent = function () {
    const ev = this.event; if (!ev) return; const W = this.world;
    ev.props.forEach(o => W.remove(o)); ev.ents.forEach(e => W.despawn(e));
    ev.roles.forEach(r => { const e = r.e; if (!e || e.role !== r) return; e.role = null; e.roleAt = false; e.outfit2 = null; e.lift = 0; e.sortY = null; e.pose = null; e.wait = 0; e.done = null; e.faceOverride = null; e.mood = Math.min(1, (e.mood || .6) + .2); const tile = walkNear(W, Math.floor(e.x), Math.floor(e.y), 4); if (tile) { e.x = tile[0] + .5; e.y = tile[1] + .5; } });
    W.particles = W.particles.filter(p => p.k !== 'petal');
    this.event = null;
  };
  G.eventUpdate = function (dt, sdt) {
    const ev = this.event, W = this.world, R = Math.random, t = this.t; ev.t += sdt;
    ev.roles = ev.roles.filter(r => r.e && W.entities.includes(r.e) && r.e.role === r);
    const here = ev.roles.filter(r => r.e.roleAt && !r.e.path), chance = k => R() < sdt * k;
    if (ev.type === 'festival') {
      here.forEach(r => {
        const e = r.e;
        if (r.ring) { const a = r.a0 + ev.t * .45; e.x = ev.mx + Math.cos(a) * 2.3; e.y = ev.my + Math.sin(a) * 1.3; e.dir = 'side'; e.flip = Math.sin(a) > 0; e.pose = 'dance'; if (chance(.12)) e.say(pick(['note', 'heart', 'laugh']), 1.4); }
        else if (r.music) { e.pose = 'talk'; if (chance(.5)) e.say('note', 1.4); }
        else if (r.watch) { e.pose = Math.floor(t * .7 + e.phase) % 3 === 0 ? 'cheer' : null; if (chance(.08)) e.say(pick(['heart', 'laugh', 'star', 'note']), 1.4); }
      });
      if (this.light.L > .45 && chance(.9)) W.particles.push({ k: 'rocket', x: (ev.bx || ev.mx * T) + (R() - .5) * 60, y: (ev.by || ev.my * T) - 10, vx: (R() - .5) * 14, vy: -95 - R() * 35, life: 1 + R() * .4, max: 1.4 });
      if (!ev.fired.night && this.light.L > .45) { ev.fired.night = true; this.diaryAdd(null, 'Fireworks over the plaza!'); }
    } else if (ev.type === 'wedding') {
      const [a, b] = ev.couple || [], ax = ev.ax * T, ay = ev.ay * T;
      here.forEach(r => {
        const e = r.e;
        if (r.officiant) { e.pose = ev.t > 8 && ev.t < 22 ? 'talk' : ev.t >= 22 ? 'cheer' : null; if (ev.t > 8 && ev.t < 22 && chance(.4)) e.say(pick(['chat', 'ring', 'heart']), 1.5); }
        else if (r.guest) { e.pose = ev.t >= 22 && ev.t < 34 ? (Math.floor(t * 1.2 + e.phase) % 2 ? 'cheer' : null) : ev.t >= 34 ? 'dance' : null; if (chance(ev.t >= 22 ? .15 : .05)) e.say(pick(ev.t >= 22 ? ['heart', 'star', 'note', 'laugh'] : ['heart', 'flower']), 1.4); e.faceOverride = ev.t < 22 && e.uid % 4 === 0 ? 'sad' : null; }
        else if (r.couple != null) { e.faceOverride = 'love'; if (ev.t >= 34) { e.pose = 'dance'; } }
      });
      if (ev.t >= 22 && !ev.fired.kiss && a && b) {
        ev.fired.kiss = true; a.say('heart', 4); b.say('heart', 4); a.spouse = b.name; b.spouse = a.name;
        for (let i = 0; i < 70; i++) W.particles.push({ k: 'petal', x: ax + (R() - .5) * 30, y: ay - 30 - R() * 14, vx: (R() - .5) * 40, vy: -10 - R() * 20, g: 14, life: 3 + R() * 2, max: 5, ph: R() * 10, c: pick([PINK, C.s50, ROSE, C.sun]) });
        this.diaryAdd(null, a.name + ' and ' + b.name + ' are married!');
      }
      if (ev.t > 22 && chance(3)) W.particles.push({ k: 'petal', x: ax + (R() - .5) * 120, y: ay - 40, vx: 4 + R() * 6, vy: 6 + R() * 6, g: 0, life: 4, max: 4, ph: R() * 10, c: pick([PINK, C.s50, ROSE]) });
    } else if (ev.type === 'market') {
      here.forEach(r => { if (r.sell) { r.e.pose = Math.floor(t * .8 + r.e.phase) % 2 ? 'talk' : 'wave'; if (chance(.35)) r.e.say(pick(['coin', 'coin', 'bread', 'fish', 'star']), 1.5); } });
    } else if (ev.type === 'meeting') {
      const cyc = ev.t % 34;
      here.forEach(r => {
        const e = r.e;
        if (r.speaker) { e.pose = 'talk'; if (chance(.45)) e.say(pick(['chat', 'bang', 'question', 'sun']), 1.6); }
        else if (r.crowd) { e.pose = cyc > 26 && cyc < 31 && e.uid % 5 !== 0 ? 'cheer' : null; if (chance(.12)) { const ic = pick(['question', 'angry', 'laugh', 'heart', 'bang', 'chat']); e.say(ic, 1.4); } }
      });
      const round = Math.floor(ev.t / 34);
      if (cyc > 31 && !ev.fired['v' + round]) { ev.fired['v' + round] = true; const yes = 8 + ((R() * 8) | 0), no = 2 + ((R() * 6) | 0); this.diaryAdd(null, 'Vote on "' + ev.topic + '" ' + (yes > no ? 'passed' : 'failed') + ', ' + yes + ' to ' + no + '.'); ev.topic = pick(MEET.filter(m => m !== ev.topic)); this.diaryAdd(null, 'Next item: "' + ev.topic + '"'); }
    }
  };

  /* ================= Hearthvale ================= */
  function hearthvale(seed) {
    const W = new LW.World(60, 42, seed), N = W.noise, G2 = LW.gen, TID = A.TID, CX = 27, CY = 19;
    W.name = 'Hearthvale'; W.climate = 'temperate'; W.season = 1;
    const SP = [[44, 0], [45, 7], [43, 13], [46, 20], [45, 27], [48, 33], [52, 41]];
    const segD = (x, y) => { let best = 1e9; for (let i = 0; i < SP.length - 1; i++) { const [ax, ay] = SP[i], [bx, by] = SP[i + 1], dx = bx - ax, dy = by - ay, tt = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); best = Math.min(best, Math.hypot(x - ax - dx * tt, y - ay - dy * tt)); } return best; };
    G2.forTiles(W, (x, y) => {
      const edge = Math.min(x, y, 59 - x, 41 - y); let t = edge + (N.fbm(x * .15, y * .15) - .5) * 8 < 5 ? 'meadow' : 'grass';
      const pd = ((x - 8) / 4.6) ** 2 + ((y - 35) / 3) ** 2 + (N.n2(x * .4, y * .4) - .5) * .4; if (pd < .4) t = 'deep'; else if (pd < 1) t = 'water'; else if (pd < 1.4) t = 'sand';
      const d = segD(x + .5, y + .5) + (N.n2(x * .3, y * .3) - .5) * .5; if (d < 1.2) t = 'water'; else if (d < 1.9 && N.n2(x * .5, y * .5) > .5) t = 'sand';
      G2.setRaw(W, x, y, t);
    });
    for (let y = 16; y <= 22; y++) for (let x = 21; x <= 32; x++) { const corner = (x === 21 || x === 32) && (y === 16 || y === 22); if (!corner) G2.setRaw(W, x, y, 'plaza'); }
    for (let x = 0; x < 60; x++) if (W.isWater(x, 19) || W.isWater(x, 20)) { if (W.isWater(x, 18)) W.place('rail', x, 18); G2.setRaw(W, x, 19, 'planks'); G2.setRaw(W, x, 20, 'planks'); W.place('rail', x, 20); }
    const homes = [], put = (id, x, y, o, m, r) => G2.placeNear(W, id, x, y, o || {}, m == null ? 1 : m, r == null ? 3 : r);
    const link = (o, tile) => o && G2.link(W, o, CX, CY + 3 > 22 ? 22 : CY + 3, tile);
    link(put('tavern', 25, 12)); link(put('bakery', 17, 16)); link(put('blacksmith', 35, 17)); link(put('hall', 32, 10, { v: 1 })); link(put('storehouse', 10, 12));
    [[22, 17, 'table', 0], [29, 17, 'table', 1], [23, 21, 'stall', 0], [29, 21, 'stall', 1], [21, 19, 'bench', 0], [31, 19, 'bench', 0], [19, 21, 'well', 0]].forEach(([x, y, id, v]) => W.canPlace(id, x, y) && W.place(id, x, y, { v }));
    [[21, 16], [32, 16], [21, 22], [32, 22], [14, 18], [8, 18], [39, 18]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
    const SPOTS = [[13, 8, 0], [18, 8, 1], [10, 17, 0], [12, 23, 3], [17, 26, 0], [23, 27, 1], [29, 27, 0], [35, 23, 3], [39, 21, 0], [38, 13, 1], [37, 7, 0], [7, 24, 2]];
    const owners = [];
    SPOTS.forEach(([x, y, v], i) => {
      const h = put('cottage', x, y, { v }); if (!h) return; homes.push(h); link(h);
      if (i % 2 === 0) put('laundry', h.x + 2, h.y + 1, { v: i % 3 }, 0, 2);
      if (i % 4 === 0) put('washtub', h.x + 4, h.y + 1, {}, 0, 2);
      if (i % 4 === 1) put('bench', h.x - 2, h.y + 1, {}, 0, 2);
      if (i % 3 === 0) put('garden', h.x + 2, h.y, { v: i % 3 }, 0, 2); if (i % 3 === 1) put('garden', h.x - 1, h.y, { v: 1 }, 0, 2);
      if (i === 2 || i === 6 || i === 9) { const dh = put('doghouse', h.x - 1, h.y + 1, { v: i % 2 }, 0, 2); if (dh) owners.push([h, dh]); }
    });
    put('coop', 14, 13, {}, 0, 2);
    G2.field(W, 2, 4, 5, 3, 'wheat'); G2.field(W, 2, 8, 5, 3, 'wheat'); G2.field(W, 8, 3, 4, 3, 'cabbage'); G2.field(W, 2, 28, 4, 3, 'pumpkin');
    link(put('windmill', 15, 3, {}, 1, 4));
    const hut = G2.findSpot(W, 'fishhut', 2, 29, 16, 37, (x, y) => W.isWater(x, y + 2) && W.isWater(x + 1, y + 2)); if (hut) link(W.place('fishhut', hut[0], hut[1]));
    W.carvePath(0, 19, 21, 19, 'plaza'); W.carvePath(32, 19, 59, 19, 'plaza');
    const site = put('cottage', 50, 26, { v: 1 }, 1, 4); if (site) { site.build = .45; site.self = false; G2.link(W, site, 50, 20); }
    for (let x = 49; x < 58; x += 3) for (let y = 4; y < 14; y += 3) W.canPlace('oak', x, y) && W.place('oak', x, y, { v: 1 });
    G2.scatter(W, [
      { on: [TID.meadow], id: 'oak', p: .22, o: () => ({ v: W.rng() < .2 ? 1 : 0 }) }, { on: [TID.meadow], id: 'pine', p: .16 }, { on: [TID.meadow], id: 'birch', p: .1 },
      { on: [TID.grass, TID.sand], id: 'willow', p: (x, y) => (W.isWater(x + 1, y) || W.isWater(x - 1, y)) ? .14 : 0 },
      { on: [TID.grass, TID.meadow], id: 'bush', p: .03, o: () => ({ v: (W.rng() * 3) | 0 }) }
    ], [{ x: CX, y: CY, rx: 19, ry: 13 }, { x: 52, y: 22, rx: 5, ry: 6 }]);
    G2.scatter(W, [
      { on: [TID.grass], id: 'flowers', p: .07, o: () => ({ v: (W.rng() * 4) | 0 }) }, { on: [TID.grass, TID.meadow], id: 'tuft', p: .08 },
      { on: [TID.grass, TID.sand], id: 'reeds', p: (x, y) => (W.isWater(x, y + 1) || W.isWater(x + 1, y) || W.isWater(x - 1, y)) ? .25 : 0 },
      { on: [TID.water], id: 'lily', p: (x, y) => y > 30 && x < 16 ? .14 : 0, o: () => ({ v: W.rng() < .4 ? 1 : 0 }) }
    ]);
    G2.populate(W, { homes, cx: CX, cy: CY + 2 }, { farmer: 4, baker: 1, smith: 1, merchant: 2, innkeeper: 1, fisher: 1, builder: 2, woodcutter: 1, kid: 5, wanderer: 3 });
    W.entities.forEach(e => { if (e.job === 'wanderer') e.age = 2; if (e.job === 'kid') e.age = 1; });
    owners.forEach(([h, dh], i) => { const o = h.residents.find(r => r.age !== 1) || h.residents[0]; const d = W.spawn('dog', dh.x + 1, dh.y, { v: i % 3 }); d.speed = 1.9; d.owner = o || null; d.name = ['Biscuit', 'Pepper', 'Sir Woofs'][i % 3]; });
    G2.critters(W, 'chicken', 6, { x: 15, y: 15 }, 3, () => W.rng() < .5 ? 0 : 1); G2.critters(W, 'cat', 3, { x: CX, y: CY }, 8, () => (W.rng() * 3) | 0);
    G2.critters(W, 'duck', 4, { x: 8, y: 35 }, 3, () => W.rng() < .7 ? 0 : 1); G2.critters(W, 'rabbit', 4, { x: 52, y: 34 }, 6, 0); G2.critters(W, 'sheep', 3, { x: 5, y: 14 }, 2, 0);
    const cart = W.spawn('cart', 1, 19, { v: 0 }); cart.speed = .8; cart.route = [[1, 19, false], [26, 23, true], [58, 19, false], [27, 23, true]]; cart.ri = 0; cart.name = 'Millbrook Cart';
    W.focus = { x: CX + 1, y: CY - 1 };
    return W;
  }
  LW.registerPreset({ id: 'hearthvale', name: 'Hearthvale', blurb: 'A small village and everyone in it' }, hearthvale, true);
  LW.EVENTS = [['ordinary', 'Ordinary Day'], ['market', 'Market Day'], ['festival', 'Festival'], ['wedding', 'Wedding'], ['meeting', 'Town Meeting']];
})();
