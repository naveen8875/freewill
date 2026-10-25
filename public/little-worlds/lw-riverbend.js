/* Little Worlds — Riverbend: one valley shown across four eras (Camp → Hamlet → Village → Town).
   Each era replays the earlier stages in order, then adds its own, so a lot built in the Hamlet era stands in the same place in the Town era.
   Next era's first buildings show up as construction sites, worked on by builders.
   LW.createWorld('riverbend', seed, { era: 0..3 }) */
(function () {
  'use strict';
  const LW = window.LW, A = LW.Assets, G = LW.gen, TID = A.TID;
  const ERAS = ['Camp', 'Hamlet', 'Village', 'Town'];
  const RP = [[31, 9], [30, 15], [33, 21], [32, 27], [35, 33], [42, 38], [52, 40], [62, 39], [71, 42], [81, 44]];
  const CX = 19, CY = 29;
  function segD(x, y) { let best = 1e9; for (let i = 0; i < RP.length - 1; i++) { const [ax, ay] = RP[i], [bx, by] = RP[i + 1], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))), d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < best) best = d; } return best; }

  function riverbend(seed, opts) {
    const era = Math.max(0, Math.min(3, opts.era == null ? 2 : opts.era | 0));
    const W = new LW.World(80, 54, seed), N = W.noise;
    W.name = 'Riverbend'; W.era = era; W.eras = ERAS; W.climate = 'temperate';
    const clear = [7, 11, 14, 17][era];
    G.forTiles(W, (x, y) => {
      const ridge = 9.5 + (N.n2(x * .15, 3) - .5) * 3, dist = Math.hypot((x - CX) / 1.25, y - CY), f = N.fbm(x * .09 + 11, y * .09 + 5);
      let t = f + Math.min(.32, dist * .013) + (x > 36 ? .1 : 0) > .7 ? 'meadow' : 'grass';
      if (dist < clear && x < 31) t = 'grass';
      if (y < ridge + 1 || (y < ridge + 3 && N.n2(x * .4, y * .4) > .55)) t = 'stone';
      const ld = ((x - 11) / 7.5) ** 2 + ((y - 47) / 4.2) ** 2 + (N.n2(x * .3, y * .3) - .5) * .5;
      if (ld < .4) t = 'deep'; else if (ld < 1) t = 'water'; else if (ld < 1.4) t = 'sand';
      if (y >= 9) { const d = segD(x + .5, y + .5) + (N.n2(x * .3, y * .3) - .5) * .7, wd = 1.4 + Math.min(1, (y - 9) / 24) * .7; if (d < wd * .45 && y > 12) t = 'deep'; else if (d < wd) t = 'water'; else if (d < wd + 1 && t !== 'stone' && N.n2(x * .5, y * .5) > .45) t = 'sand'; }
      G.setRaw(W, x, y, t);
    });

    /* fixed landscape: mountains, waterfall, landmarks */
    [0, 5, 10, 15, 20, 36, 41, 46, 51, 56, 61, 66, 71, 75].forEach((x, i) => { const y = A.hash2(i, 13) > .5 ? 3 : 4; if (W.canPlace('mountain', x, y)) W.place('mountain', x, y, { v: (A.hash2(i * 3, 5) * 3) | 0 }); });
    W.place('waterfall', 29, 7); W.canPlace('crag', 26, 6) && W.place('crag', 26, 6, { v: 0 }); W.canPlace('crag', 33, 6) && W.place('crag', 33, 6, { v: 1 });
    G.placeNear(W, 'elder', 47, 19, {}, 1, 4); G.placeNear(W, 'ruins', 63, 27, {}, 1, 4); G.placeNear(W, 'stones', 68, 15, {}, 1, 4);

    const homes = [], put = (ctx, id, x, y, o, margin, rad) => {
      if (ctx.site) { if (ctx.budget <= 0 || A.get(id).cat !== 'building') return null; const ob = G.placeNear(W, id, x, y, o, margin == null ? 1 : margin, rad == null ? 5 : rad); if (ob) { ob.build = .2 + ctx.budget * .14; ob.self = false; ctx.budget--; } return ob; }
      const ob = G.placeNear(W, id, x, y, o, margin == null ? 1 : margin, rad == null ? 5 : rad); if (ob && ob.def.home) homes.push(ob); return ob;
    };
    const path = (ctx, o, tx, ty, tile) => { if (!ctx.site && o) G.link(W, o, tx == null ? CX : tx, ty == null ? CY + 2 : ty, tile); return o; };
    const camp = [];
    const STAGES = [
      ctx => {
        [[15, 26, 0], [20, 25, 1], [16, 31, 2]].forEach(([x, y, v]) => { const t = put(ctx, 'tent', x, y, { v }, 0, 2); if (t) camp.push(t); });
        if (ctx.site) return;
        camp.push(W.place('campfire', 19, 29)); const r = G.placeNear(W, 'rack', 22, 29, {}, 0, 2), l = G.placeNear(W, 'logpile', 13, 29, {}, 0, 2); r && camp.push(r); l && camp.push(l);
      },
      ctx => {
        [[11, 23, 0], [25, 23, 1], [10, 32, 0], [25, 33, 3], [18, 36, 0]].forEach(([x, y, v]) => path(ctx, put(ctx, 'cottage', x, y, { v }, 1, 3)));
        if (ctx.site) return;
        W.place('well', 22, 30);
        G.field(W, 3, 21, 5, 3, 'wheat'); G.field(W, 3, 26, 4, 4, 'cabbage');
        path(ctx, put(ctx, 'storehouse', 8, 27, {}, 1, 4));
        const sp = G.findSpot(W, 'fishhut', 4, 40, 20, 46, (x, y) => W.isWater(x, y + 2) && W.isWater(x + 1, y + 2)); if (sp) path(ctx, W.place('fishhut', sp[0], sp[1]));
        W.carvePath(4, 25, CX, CY + 2);
      },
      ctx => {
        path(ctx, put(ctx, 'tavern', 17, 21, {}, 1, 4)); path(ctx, put(ctx, 'bakery', 10, 26, {}, 1, 5)); path(ctx, put(ctx, 'blacksmith', 25, 26, {}, 1, 4));
        if (ctx.site) return;
        camp.forEach(o => W.remove(o));
        for (let y = 26; y <= 32; y++) for (let x = 14; x <= 24; x++) { const corner = (x === 14 || x === 24) && (y === 26 || y === 32); if (!corner && W.tile(x, y) >= 2 && !W.occ[y * W.w + x]) G.setRaw(W, x, y, 'plaza'); }
        W.place('statue', 15, 29); [[15, 26], [23, 26], [15, 32], [23, 32]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
        W.canPlace('stall', 16, 31) && W.place('stall', 16, 31, { v: 0 }); W.canPlace('stall', 20, 27) && W.place('stall', 20, 27, { v: 1 });
        let bx0 = 99, bx1 = -1; for (let x = 26; x < 44; x++) if (W.isWater(x, 29) || W.isWater(x, 30)) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); }
        if (bx1 > 0) { for (let x = bx0; x <= bx1; x++) { if (W.isWater(x, 28)) W.place('rail', x, 28); G.setRaw(W, x, 29, 'planks'); G.setRaw(W, x, 30, 'planks'); W.place('rail', x, 30); } W.dirty = { x0: 0, y0: 0, x1: W.w - 1, y1: W.h - 1 }; W.version++; W.carvePath(bx0 - 1, 30, 24, 30); }
        [[8, 20, 2], [27, 19, 0], [5, 36, 1], [23, 37, 0], [13, 39, 3], [28, 23, 0]].forEach(([x, y, v]) => path(ctx, put(ctx, 'cottage', x, y, { v }, 1, 3)));
        G.field(W, 3, 16, 5, 3, 'wheat'); G.field(W, 3, 33, 5, 3, 'pumpkin');
        path(ctx, put(ctx, 'windmill', 10, 15, {}, 1, 4));
        const mill = G.findSpot(W, 'lumbermill', 20, 12, 30, 24, (x, y) => W.isWater(x + 3, y) && W.isWater(x + 3, y + 1)); if (mill) path(ctx, W.place('lumbermill', mill[0], mill[1]));
        const mine = G.placeNear(W, 'mine', 52, 9, {}, 0, 4); if (mine && bx1 > 0) G.link(W, mine, bx1 + 1, 30);
      },
      ctx => {
        const keep = put(ctx, 'castle', 12, 9, { v: 0 }, 1, 4); path(ctx, keep, CX, CY - 3, 'plaza');
        path(ctx, put(ctx, 'watchtower', 4, 30, {}, 1, 3)); path(ctx, put(ctx, 'watchtower', 30, 40, {}, 1, 3)); path(ctx, put(ctx, 'watchtower', 38, 26, {}, 1, 3), 37, 30);
        if (ctx.site) return;
        W.canPlace('fountain', 18, 28) && W.place('fountain', 18, 28);
        W.canPlace('stall', 21, 31) && W.place('stall', 21, 31, { v: 2 }); W.canPlace('stall', 15, 27) && W.place('stall', 15, 27, { v: 3 });
        [[38, 31, 1], [41, 25, 0], [42, 33, 3], [45, 28, 0], [3, 40, 1], [27, 44, 0]].forEach(([x, y, v]) => path(ctx, put(ctx, 'cottage', x, y, { v }, 1, 3), 37, 30));
        put(ctx, 'storehouse', 7, 33, {}, 1, 4);
        [[29, 28], [29, 32], [37, 28], [37, 32], [19, 22], [19, 16]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
      }
    ];
    for (let e = 0; e <= era; e++) STAGES[e]({ site: false });
    if (era < 3) STAGES[era + 1]({ site: true, budget: era === 2 ? 2 : 2 });

    /* nature, after the settlement so forests fill whatever is still wild */
    const avoid = [{ x: CX, y: CY, rx: clear * 1.25, ry: clear }].concat(era === 3 ? [{ x: 42, y: 29, rx: 7, ry: 6 }] : []);
    const wet = (x, y) => W.isWater(x + 1, y) || W.isWater(x - 1, y) || W.isWater(x, y + 1) || W.isWater(x, y - 1);
    G.scatter(W, [
      { on: [TID.meadow], id: 'pine', p: (x, y) => y < 20 ? .36 : .12, o: () => ({ v: W.rng() < .2 ? 1 : 0 }) },
      { on: [TID.meadow], id: 'birch', p: (x) => x > 36 ? .16 : .05 },
      { on: [TID.meadow], id: 'oak', p: .22, o: () => ({ v: W.rng() < .15 ? 1 : 0 }) },
      { on: [TID.meadow], id: 'mushroom', p: .03 },
      { on: [TID.grass, TID.sand], id: 'willow', p: (x, y) => wet(x, y) && y > 12 ? .2 : 0 },
      { on: [TID.grass, TID.meadow], id: 'bush', p: .03, o: () => ({ v: (W.rng() * 3) | 0 }) },
      { on: [TID.grass], id: 'oak', p: .03, o: () => ({ v: W.rng() < .4 ? 1 : 0 }) },
      { on: [TID.stone], id: 'rock', p: .12, o: () => ({ v: W.rng() < .5 ? 1 : 0 }) },
      { on: [TID.stone], id: 'pine', p: .06, o: () => ({ v: 1 }) }
    ], avoid);
    if (era > 0) G.forTiles(W, (x, y) => { const d = Math.hypot((x - CX) / 1.25, y - CY); if (d > clear && d < clear + 3 && W.tile(x, y) === TID.grass && A.hash2(x + 5, y + 9) < .06 && W.canPlace('stump', x, y)) W.place('stump', x, y); });
    G.scatter(W, [
      { on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) },
      { on: [TID.grass, TID.meadow], id: 'tuft', p: .08 },
      { on: [TID.grass, TID.sand], id: 'reeds', p: (x, y) => wet(x, y) ? .22 : 0 },
      { on: [TID.water], id: 'lily', p: (x, y) => y > 42 ? .1 : .02, o: () => ({ v: W.rng() < .3 ? 1 : 0 }) }
    ]);

    const jobs = [
      { woodcutter: 1, fisher: 1, wanderer: 1, kid: 1 },
      { farmer: 3, fisher: 1, woodcutter: 2, builder: 2, kid: 2 },
      { farmer: 4, fisher: 2, woodcutter: 2, miner: 2, smith: 1, baker: 1, builder: 2, merchant: 2, innkeeper: 1, kid: 3, wanderer: 1 },
      { farmer: 5, fisher: 2, woodcutter: 3, miner: 3, smith: 1, baker: 1, builder: 3, merchant: 4, innkeeper: 1, guard: 3, kid: 4, wanderer: 2 }
    ][era];
    G.populate(W, { homes: homes.filter(h => W.objects.includes(h)), cx: CX, cy: CY + 1 }, jobs);
    G.critters(W, 'deer', [6, 5, 4, 3][era], { x: 56, y: 22 }, 10, () => W.rng() < .3 ? 1 : 0);
    G.critters(W, 'fox', era < 2 ? 2 : 1, { x: 62, y: 33 }, 10, 0);
    G.critters(W, 'rabbit', [7, 6, 4, 3][era], { x: 8, y: 18 }, 9, () => W.rng() < .2 ? 1 : 0);
    G.critters(W, 'rabbit', 3, { x: 55, y: 30 }, 8, 0);
    G.critters(W, 'duck', 4, { x: 11, y: 47 }, 5, () => W.rng() < .7 ? 0 : 1);
    G.critters(W, 'duck', 2, { x: 40, y: 37 }, 4, 0);
    if (era >= 1) G.critters(W, 'chicken', 3 + era, { x: CX, y: CY + 5 }, 6, () => W.rng() < .5 ? 0 : 1);
    if (era >= 2) { G.critters(W, 'sheep', 5, { x: 6, y: 13 }, 3, () => W.rng() < .2 ? 1 : 0); G.critters(W, 'cat', era, { x: CX, y: CY }, 6, () => (W.rng() * 3) | 0); }
    W.focus = { x: CX + 2, y: era >= 3 ? 23 : CY - 1 };
    return W;
  }

  LW.registerPreset({ id: 'riverbend', name: 'Riverbend', blurb: 'A river valley, from first camp to castle town', eras: ERAS }, riverbend, true);
  LW.ERAS = ERAS;
})();
