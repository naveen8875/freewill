/* Little Worlds — engine: World (data + API), Game (renderer, input, life), presets.
   const w = LW.createWorld('clay-harbor', 7);   game.load(w);
   w.place('cottage', 12, 8, {v:1}, true) · w.spawn('villager', 14, 11).goTo(20, 9) · w.setTile(5, 5, 'plaza') · w.remove(obj) */
(function () {
  'use strict';
  const A = window.LW.Assets, T = A.T, TID = A.TID, C = A.C;
  const LAND = t => t >= 2;
  const NAMES = ['Ines', 'Tomás', 'Pip', 'Marisol', 'Oki', 'Bea', 'Lalo', 'Juno', 'Rafa', 'Nina', 'Teo', 'Coco', 'Ama', 'Kiko', 'Lupe', 'Darío', 'Wren', 'Sol', 'Mika', 'Ofelia', 'Beto', 'Yara', 'Iggy', 'Rosa', 'Pancho', 'Lía', 'Gus', 'Noor', 'Tito', 'Vera', 'Chepe', 'Olga', 'Remy', 'Isa', 'Félix', 'Mara', 'Quino', 'Dot', 'Ezra', 'Paz'];
  const ANAMES = { chicken: ['Nugget', 'Señora', 'Pickles', 'Dot', 'Omelette', 'Clucky'], sheep: ['Wooliam', 'Fluff', 'Barb', 'Cumulus'], cat: ['Mango', 'Ceviche', 'Ghost', 'Tamal'], duck: ['Puddle', 'Sir Quacks', 'Bun', 'Admiral'], deer: ['Clover', 'Fern', 'Bramble', 'Hazel'], fox: ['Rusty', 'Vixen', 'Ember'], rabbit: ['Biscuit', 'Thumper', 'Mochi', 'Pip'] };
  const JOB = { farmer: 'Farmer', fisher: 'Fisher', woodcutter: 'Woodcutter', merchant: 'Merchant', kid: 'Kid', wanderer: 'Wanderer', miner: 'Miner', smith: 'Blacksmith', baker: 'Baker', builder: 'Builder', innkeeper: 'Innkeeper', guard: 'Guard' };

  function makeNoise(seed) {
    const r = A.rng(seed), p = new Uint8Array(512), a = []; for (let i = 0; i < 256; i++) a.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = a[i & 255];
    const v = new Float32Array(256); for (let i = 0; i < 256; i++) v[i] = r();
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf), X = xi & 255, Y = yi & 255;
      const a0 = v[p[p[X] + Y]], b0 = v[p[p[X + 1] + Y]], c0 = v[p[p[X] + Y + 1]], d0 = v[p[p[X + 1] + Y + 1]];
      return a0 + (b0 - a0) * u + (c0 - a0) * w + (a0 - b0 - c0 + d0) * u * w;
    }
    function fbm(x, y, o) { o = o || 3; let s = 0, amp = .5, f = 1, nm = 0; for (let i = 0; i < o; i++) { s += amp * n2(x * f, y * f); nm += amp; amp *= .5; f *= 2; } return s / nm; }
    return { n2, fbm };
  }

  const PRED = { trees: d => d.tree, homes: d => d.home, stalls: d => d.stall, fires: d => d.fire, wells: d => d.well, stores: d => d.store, mills: d => d.mill, smiths: d => d.smith, bakeries: d => d.bakery, taverns: d => d.tavern, mines: d => d.mine, huts: d => d.hut, towers: d => d.tower, keeps: d => d.keep, crops: d => d.crop, landmarks: d => d.visit };
  /* ================= World ================= */
  class World {
    constructor(w, h, seed) {
      this.w = w; this.h = h; this.seed = seed; this.tiles = new Uint8Array(w * h).fill(TID.grass);
      this.block = new Uint8Array(w * h); this.occ = new Uint16Array(w * h);
      this.objects = []; this.entities = []; this.particles = []; this.time = 8 * 60; this.day = 1; this.uid = 1;
      this.noise = makeNoise(seed); this.rng = A.rng(seed * 7 + 1); this.dirty = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
      this.stock = { wheat: 0, fish: 0, wood: 0, water: 0, ore: 0, stone: 0, bread: 0 }; this.season = 1; this.climate = 'temperate'; this.dayInSeason = 0; this.seasonLen = 2; this.version = 0; this.name = 'Untitled'; this.focus = { x: w / 2, y: h / 2 };
    }
    get hour() { return this.time / 60; }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    tile(x, y) { x = Math.max(0, Math.min(this.w - 1, x | 0)); y = Math.max(0, Math.min(this.h - 1, y | 0)); return this.tiles[y * this.w + x]; }
    isWater(x, y) { return this.tile(x, y) <= 1; }
    setTile(x, y, t) { if (!this.inb(x, y)) return; if (typeof t === 'string') t = TID[t]; const i = y * this.w + x; if (this.tiles[i] === t) return; this.tiles[i] = t; this.markDirty(x, y, x, y); }
    fillTiles(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.setTile(x, y, t); }
    markDirty(x0, y0, x1, y1) { this.version++; const d = this.dirty; if (!d) this.dirty = { x0, y0, x1, y1 }; else { d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0); d.x1 = Math.max(d.x1, x1); d.y1 = Math.max(d.y1, y1); } }
    walkable(x, y) { if (!this.inb(x, y)) return false; const i = y * this.w + x; return this.tiles[i] >= 2 && !this.block[i]; }
    stamp(o, d) { for (let y = o.y; y < o.y + o.fh; y++) for (let x = o.x; x < o.x + o.fw; x++) if (this.inb(x, y)) { const i = y * this.w + x; this.occ[i] += d; if (o.def.solid) this.block[i] += d; } }
    canPlace(id, x, y, margin) {
      const d = A.get(id); if (!d) return false; const [fw, fh] = d.foot; margin = margin || 0;
      for (let ty = y - margin; ty < y + fh + margin; ty++) for (let tx = x - margin; tx < x + fw + margin; tx++) {
        if (!this.inb(tx, ty)) return false; const i = ty * this.w + tx, t = this.tiles[i];
        const inside = tx >= x && ty >= y && tx < x + fw && ty < y + fh;
        if (inside) {
          if (this.occ[i]) return false;
          if (d.on === 'water') { if (t > 1) return false; }
          else { if (t <= 1 || t === TID.planks) return false; if ((d.cat === 'building') && !d.plazaOk && (t === TID.plaza || t === TID.field)) return false; if (d.crop && t !== TID.field) return false; }
        } else if (this.block[i]) return false;
      }
      return true;
    }
    place(id, x, y, opts, animate) {
      const d = A.get(id); const o = { uid: this.uid++, id, def: d, x, y, fw: d.foot[0], fh: d.foot[1], opts: Object.assign({ v: 0 }, opts || {}), phase: this.rng() * 10, build: animate ? 0 : 1, self: !!animate, age: d.crop ? [10, 55, 110][(opts && opts.v) || 0] + this.rng() * 20 : 0, residents: [] };
      this.objects.push(o); this.stamp(o, 1); this.version++; return o;
    }
    remove(o) {
      const i = this.objects.indexOf(o); if (i < 0) return; this.objects.splice(i, 1); this.stamp(o, -1); this.version++;
      this.entities.forEach(e => { if (e.home === o) { e.home = null; e.inside = false; } });
    }
    objectAt(tx, ty) { for (let i = this.objects.length - 1; i >= 0; i--) { const o = this.objects[i]; if (tx >= o.x && ty >= o.y && tx < o.x + o.fw && ty < o.y + o.fh) return o; } return null; }
    spawn(kind, x, y, opts) { const e = new Entity(this, kind, x + .5, y + .5, opts || {}); this.entities.push(e); return e; }
    despawn(e) { const i = this.entities.indexOf(e); if (i >= 0) this.entities.splice(i, 1); this.objects.forEach(o => { const k = o.residents.indexOf(e); if (k >= 0) o.residents.splice(k, 1); }); }
    door(o) { return { x: o.x + (o.fw >> 1), y: o.y + o.fh }; }
    scan(fn) { const out = []; for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (fn(this.tiles[y * this.w + x], x, y)) out.push([x, y]); return out; }
    poi(kind) {
      this._poi = this._poi && this._poi.v === this.version ? this._poi : { v: this.version };
      if (this._poi[kind]) return this._poi[kind];
      let r;
      if (kind === 'fields') r = this.scan((t, x, y) => t === TID.field && !this.block[y * this.w + x]);
      else if (kind === 'plaza') r = this.scan((t, x, y) => t === TID.plaza && !this.block[y * this.w + x]);
      else if (kind === 'docks') r = this.scan((t, x, y) => t === TID.planks && (this.isWater(x - 1, y) || this.isWater(x + 1, y) || this.isWater(x, y + 1)));
      else if (kind === 'shore') r = this.scan((t, x, y) => t === TID.sand && (this.isWater(x, y + 1) || this.isWater(x - 1, y) || this.isWater(x + 1, y)) && !this.block[y * this.w + x]);
      else if (kind === 'sites') r = this.objects.filter(o => o.build < 1 && o.def.cat === 'building');
      else r = PRED[kind] ? this.objects.filter(o => o.build >= 1 && PRED[kind](o.def)) : [];
      this._poi[kind] = r; return r;
    }
    findPath(sx, sy, tx, ty, maxIt) {
      sx |= 0; sy |= 0; tx |= 0; ty |= 0; const W = this.w;
      if (!this.walkable(tx, ty)) { let best = null, bd = 1e9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (this.walkable(tx + dx, ty + dy)) { const d = dx * dx + dy * dy + Math.abs(tx + dx - sx) * .01; if (d < bd) { bd = d; best = [tx + dx, ty + dy]; } } } if (!best) return null; tx = best[0]; ty = best[1]; }
      if (sx === tx && sy === ty) return [];
      const g = new Float32Array(this.w * this.h).fill(1e9), from = new Int32Array(this.w * this.h).fill(-1), closed = new Uint8Array(this.w * this.h);
      const heap = [], push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      const hh = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return 0.5 * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
      const s = sy * W + sx, goal = ty * W + tx; g[s] = 0; push(s, hh(sx, sy)); let it = 0; maxIt = maxIt || 9000;
      while (heap.length && it++ < maxIt) {
        const cur = pop()[1]; if (cur === goal) break; if (closed[cur]) continue; closed[cur] = 1;
        const cx = cur % W, cy = (cur / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (!this.walkable(nx, ny)) continue;
          if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
          const ni = ny * W + nx, ng = g[cur] + A.COST[this.tiles[ni]] * (dx && dy ? 1.414 : 1);
          if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ni, ng + hh(nx, ny)); }
        }
      }
      if (from[goal] < 0) return null;
      const path = []; let k = goal; while (k !== s && k >= 0) { path.push([k % W, (k / W) | 0]); k = from[k]; } return path.reverse();
    }
    carvePath(sx, sy, tx, ty, tile) { tile = tile || 'path'; const p = this.findPath(sx, sy, tx, ty, 20000); if (!p) return; [[sx, sy]].concat(p).forEach(([x, y]) => { const t = this.tile(x, y); if (t === TID.grass || t === TID.meadow || t === TID.sand || t === TID.dune || t === TID.stone || (t === TID.path && tile !== 'path')) this.setTile(x, y, tile); }); }
  }

  /* ================= Entities ================= */
  class Entity {
    constructor(world, kind, x, y, o) {
      this.world = world; this.uid = world.uid++; this.kind = kind; this.x = x; this.y = y; this.ax = x; this.ay = y;
      this.opts = o; this.dir = 'down'; this.flip = false; this.walk = 0; this.path = null; this.wait = world.rng() * 3; this.phase = world.rng() * 10;
      this.speed = { villager: 1.5, sheep: 0.5, duck: 0.45, deer: 0.9, rabbit: 2.6, fox: 1.3 }[kind] || 0.9; this.v = o.v || 0;
      this.bubble = null; this.activity = 'Looking around'; this.home = o.home || null; this.job = o.job || 'wanderer'; this.carry = null; this.inside = false;
      if (kind === 'villager') {
        const r = world.rng; this.look = o.look || [r() * 5 | 0, r() * 6 | 0, r() * 8 | 0, r() * 5 | 0, r() * 3 | 0, r() < .35 ? (r() < .6 ? 1 : 2) : 0];
        this.name = o.name || NAMES[(r() * NAMES.length) | 0]; if (this.job === 'kid') this.speed = 2.1;
        if (this.home) this.home.residents.push(this);
      } else this.name = o.name || (ANAMES[kind] ? ANAMES[kind][(world.rng() * ANAMES[kind].length) | 0] : A.get(kind).name);
    }
    goTo(tx, ty, cb) { const p = this.world.findPath(Math.floor(this.x), Math.floor(this.y), tx, ty); if (p) { this.path = p; this.onArrive = cb || null; if (!p.length) { this.path = null; cb && cb(); } } else { this.wait = 1 + Math.random() * 2; } return this; }
    say(icon, dur) { this.bubble = { icon, t: dur || 2.4 }; return this; }
    get lookKey() { return this.look.join('') + this.dir + (this.carry || ''); }
  }

  /* ================= Presets ================= */
  function forTiles(W, fn) { for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) fn(x, y); }
  function setRaw(W, x, y, t) { W.tiles[y * W.w + x] = typeof t === 'string' ? TID[t] : t; }
  function scatter(W, rules, avoid) {
    forTiles(W, (x, y) => {
      if (avoid && avoid.some(a => ((x - a.x) / a.rx) ** 2 + ((y - a.y) / a.ry) ** 2 < 1)) return;
      const t = W.tile(x, y);
      for (let ri = 0; ri < rules.length; ri++) { const r = rules[ri]; if (!r.on.includes(t)) continue; const p = typeof r.p === 'function' ? r.p(x, y) : r.p; if (A.hash2(x * 7 + ri * 1013 + (W.seed % 997), y * 13 + ri * 71) < p && W.canPlace(r.id, x, y, r.m || 0)) { W.place(r.id, x, y, r.o ? r.o(x, y) : {}); break; } }
    });
  }
  function field(W, x, y, w, h, crop) {
    for (let ty = y - 1; ty <= y + h; ty++) for (let tx = x - 1; tx <= x + w; tx++) { if (!W.inb(tx, ty) || W.occ[ty * W.w + tx] || W.tile(tx, ty) <= 1 || W.tile(tx, ty) === TID.plaza) return false; }
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) setRaw(W, tx, ty, 'field');
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) W.place(crop, tx, ty, { v: crop === 'wheat' ? (W.rng() < .7 ? 2 : 1) : 0 });
    return true;
  }
  function village(W, cx, cy, cfg) {
    const R = W.rng, homes = [], [pw, ph] = cfg.plaza, px0 = cx - (pw >> 1), py0 = cy - (ph >> 1);
    forTiles(W, (x, y) => { if (((x - cx) / (cfg.ringMax + 3)) ** 2 + ((y - cy) / (cfg.ringMax * .75 + 2)) ** 2 < 1 && W.tile(x, y) === TID.meadow) setRaw(W, x, y, cfg.ground || 'grass'); });
    for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) { const corner = (x === px0 || x === px0 + pw - 1) && (y === py0 || y === py0 + ph - 1); if (!corner && LAND(W.tile(x, y))) setRaw(W, x, y, 'plaza'); }
    W.place('well', cx, cy);
    if (cfg.statue) W.place('statue', cx - 2, cy);
    [[px0 + 1, py0], [px0 + pw - 2, py0], [px0 + 1, py0 + ph - 1], [px0 + pw - 2, py0 + ph - 1]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
    let hall = null; if (cfg.hall && W.canPlace('hall', cx - 2, py0 - 4, 0)) hall = W.place('hall', cx - 2, py0 - 4, { v: cfg.hallV || 0 });
    for (let i = 0; i < (cfg.stalls || 0); i++) { const x = i % 2 ? px0 + pw - 4 : px0 + 2, y = i < 2 ? py0 + ph - 2 : py0 + 1; if (W.canPlace('stall', x, y)) W.place('stall', x, y, { v: (i + (R() * 4 | 0)) % 4 }); }
    const homeIds = cfg.homeIds || ['cottage'];
    for (let k = 0; k < 900 && homes.length < cfg.houses; k++) {
      const a = R() * Math.PI * 2, rad = cfg.ringMin + R() * (cfg.ringMax - cfg.ringMin), id = homeIds[(R() * homeIds.length) | 0];
      const x = Math.round(cx + Math.cos(a) * rad * 1.3) - 1, y = Math.round(cy + Math.sin(a) * rad * .8) - 1;
      if (W.canPlace(id, x, y, 1) && LAND(W.tile(x + 1, y + 2)) && W.tile(x + 1, y + 2) !== TID.planks) homes.push(W.place(id, x, y, { v: cfg.roofs[(R() * cfg.roofs.length) | 0] }));
    }
    const fields = [];
    for (let k = 0; k < 600 && fields.length < (cfg.fields || 0); k++) {
      const a = R() * Math.PI * 2, rad = cfg.ringMax + 1 + R() * 6, w = 4 + (R() * 3 | 0), h = 3 + (R() * 2 | 0);
      const x = Math.round(cx + Math.cos(a) * rad * 1.3 - w / 2), y = Math.round(cy + Math.sin(a) * rad * .8 - h / 2);
      const crop = cfg.crops[(R() * cfg.crops.length) | 0];
      if (field(W, x, y, w, h, crop)) fields.push({ x, y, w, h });
    }
    if (cfg.store) { for (let k = 0; k < 300; k++) { const f = fields[0] || { x: cx + 8, y: cy, w: 1, h: 1 }; const x = f.x + ((R() * (f.w + 6)) | 0) - 3, y = f.y - 3 + ((R() * (f.h + 5)) | 0); if (W.canPlace('storehouse', x, y, 1)) { homes.store = W.place('storehouse', x, y); break; } } }
    const target = [cx, py0 + ph - 1];
    homes.concat(hall ? [hall] : [], homes.store ? [homes.store] : []).forEach(o => { const d = W.door(o); W.carvePath(d.x, d.y, cx, cy + 1); });
    fields.forEach(f => W.carvePath(f.x + (f.w >> 1), f.y + f.h, target[0], target[1]));
    return { homes, fields, plaza: { x: px0, y: py0, w: pw, h: ph }, cx, cy };
  }
  function populate(W, V, jobs) {
    const pool = []; Object.keys(jobs).forEach(j => { for (let i = 0; i < jobs[j]; i++) pool.push(j); });
    for (let i = pool.length - 1; i > 0; i--) { const j = (W.rng() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let k = 0; const homes = V.homes.length ? V.homes : [null];
    pool.forEach(job => { const home = homes[k++ % homes.length]; const d = home ? W.door(home) : { x: V.cx + 1, y: V.cy + 1 }; const e = W.spawn('villager', d.x, d.y, { home, job }); e.x += (W.rng() - .5) * .6; });
  }
  function critters(W, kind, n, near, r, v) {
    for (let i = 0, k = 0; i < n && k < 400; k++) {
      const x = Math.round(near.x + (W.rng() - .5) * 2 * r), y = Math.round(near.y + (W.rng() - .5) * 2 * r);
      const ok = kind === 'duck' ? (W.inb(x, y) && W.tile(x, y) === TID.water) : W.walkable(x, y);
      if (ok) { const e = W.spawn(kind, x, y, { v: typeof v === 'function' ? v() : (v || 0) }); e.ax = x + .5; e.ay = y + .5; e.range = r * .7 + 2; i++; }
    }
  }
  function nearestOf(W, list, x, y) { let b = null, bd = 1e9; list.forEach(p => { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; b = p; } }); return b; }

  const PRESETS = [
    { id: 'clay-harbor', name: 'Clay Harbor', blurb: 'Fishing village on a sun-baked island' },
    { id: 'pinewood', name: 'Pinewood Hollow', blurb: 'River valley with a windmill and too many sheep' },
    { id: 'oasis', name: 'Oasis of Sel', blurb: 'Desert market around a spring' },
    { id: 'meadow', name: 'Open Meadow', blurb: 'An empty plot and three optimists' }
  ];
  const GEN = {
    'clay-harbor'(seed) {
      const W = new World(72, 48, seed), N = W.noise, cx = 36, cy = 24; W.name = 'Clay Harbor'; W.climate = 'warm';
      forTiles(W, (x, y) => { const dx = (x - cx) / 29, dy = (y - cy) / 18; const e = 1 - Math.sqrt(dx * dx + dy * dy) + (N.fbm(x * .09, y * .09) - .5) * .55; let t = e < .02 ? 'deep' : e < .13 ? 'water' : e < .22 ? 'sand' : 'grass'; if (t === 'grass' && e > .3 && N.fbm(x * .12 + 50, y * .12 + 50) > .55) t = 'meadow'; setRaw(W, x, y, t); });
      const vx = cx - 3, vy = cy - 2;
      const V = village(W, vx, vy, { houses: 10, plaza: [9, 6], hall: true, statue: true, stalls: 2, fields: 2, crops: ['wheat', 'wheat', 'cabbage', 'pumpkin'], store: true, ringMin: 6, ringMax: 12, roofs: [0, 0, 0, 1, 3] });
      let dx0 = vx + 2, y = vy + 3; while (y < W.h - 8 && !W.isWater(dx0, y)) y++;
      for (let i = 0; i < 7; i++) setRaw(W, dx0, y + i, 'planks'); for (let k = -2; k <= 2; k++) setRaw(W, dx0 + k, y + 6, 'planks');
      W.carvePath(vx, vy + 3, dx0, y - 1);
      [[dx0 + 1, y + 2, 1], [dx0 - 3, y + 4, 0], [dx0 + 2, y + 8, 2]].forEach(([x, yy, v]) => W.canPlace('boat', x, yy) && W.place('boat', x, yy, { v }));
      for (let k = 0, n = 0; k < 300 && n < 3; k++) { const x = (W.rng() * 70) | 0, yy = (W.rng() * 46) | 0; if (W.tile(x, yy) === TID.deep && W.tile(x + 1, yy) === TID.deep && W.canPlace('boat', x, yy)) { W.place('boat', x, yy, { v: (W.rng() * 4) | 0, flip: W.rng() < .5 }); n++; } }
      let best = null, bs = -1e9; forTiles(W, (x, yy) => { if (W.tile(x, yy) === TID.sand && W.canPlace('lighthouse', x, yy, 0)) { const s = x * 1 + yy * .5; if (s > bs) { bs = s; best = [x, yy]; } } });
      if (best) { const L = W.place('lighthouse', best[0], best[1]); W.carvePath(best[0], best[1] + 2, vx, vy + 1); }
      const sand = W.poi('shore'); const cf = nearestOf(W, sand.filter(p => W.canPlace('campfire', p[0], p[1] - 1, 1)), vx - 7, vy + 7); if (cf) W.place('campfire', cf[0], cf[1] - 1);
      link(W, placeNear(W, 'tavern', vx + 6, vy - 1, {}, 1, 8), vx, vy + 1);
      link(W, placeNear(W, 'bakery', vx - 7, vy, {}, 1, 8), vx, vy + 1);
      { const sp = findSpot(W, 'fishhut', dx0 - 9, y - 5, dx0 + 9, y + 2, (x, yy) => W.isWater(x, yy + 2) && W.isWater(x + 1, yy + 2)); if (sp) link(W, W.place('fishhut', sp[0], sp[1]), vx, vy + 1); }
      const av = [{ x: vx, y: vy, rx: 13, ry: 9 }];
      scatter(W, [
        { on: [TID.sand], id: 'palm', p: .09, o: () => ({ flip: W.rng() < .5 }) },
        { on: [TID.sand], id: 'rock', p: .012 },
        { on: [TID.meadow], id: 'oak', p: .38, o: () => ({ v: W.rng() < .2 ? 1 : 0 }) },
        { on: [TID.meadow], id: 'pine', p: .1 },
        { on: [TID.grass, TID.meadow], id: 'bush', p: .035, o: () => ({ v: (W.rng() * 3) | 0 }) },
        { on: [TID.grass], id: 'oak', p: .035, o: () => ({ v: W.rng() < .4 ? 1 : W.rng() < .3 ? 3 : 0 }) },
        { on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) },
        { on: [TID.grass, TID.meadow], id: 'tuft', p: .08 }
      ], av);
      scatter(W, [{ on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) }, { on: [TID.grass], id: 'tuft', p: .05 }]);
      populate(W, V, { fisher: 4, farmer: 4, woodcutter: 2, merchant: 2, kid: 3, wanderer: 1, baker: 1, innkeeper: 1, builder: 1 });
      critters(W, 'chicken', 6, { x: vx, y: vy + 5 }, 7, () => W.rng() < .5 ? 0 : 1); critters(W, 'cat', 2, { x: vx, y: vy }, 6, () => (W.rng() * 3) | 0);
      critters(W, 'duck', 5, { x: vx - 10, y: vy + 12 }, 12, () => W.rng() < .7 ? 0 : 1);
      W.focus = { x: vx + 1, y: vy + 3 }; return W;
    },
    pinewood(seed) {
      const W = new World(72, 48, seed), N = W.noise; W.name = 'Pinewood Hollow';
      const ry = x => 35 + Math.sin(x * .13) * 3 + (N.n2(x * .08, 9) - .5) * 4;
      forTiles(W, (x, y) => {
        let t = N.fbm(x * .1, y * .1) > .55 || y > ry(x) + 3 ? 'meadow' : 'grass';
        if (y < 3 || x < 2 || x > 69) t = 'meadow';
        const d = Math.abs(y - ry(x)); if (d < 1.6) t = 'water'; else if (d < 2.5 && N.n2(x * .3, y * .3) > .45) t = 'sand';
        const pd = ((x - 60) / 6) ** 2 + ((y - 9) / 4) ** 2 + (N.n2(x * .4, y * .4) - .5) * .6; if (pd < 1) t = 'water'; else if (pd < 1.35) t = 'grass';
        if (t === 'meadow' && N.fbm(x * .2 + 9, y * .2) > .66) t = 'stone';
        setRaw(W, x, y, t);
      });
      const vx = 24, vy = 17;
      const V = village(W, vx, vy, { houses: 11, plaza: [8, 5], hall: true, hallV: 1, stalls: 2, fields: 0, crops: ['wheat'], ringMin: 5, ringMax: 12, roofs: [0, 1, 3, 0, 1] });
      for (let i = 0; i < 4; i++) { const fx = 40 + (i % 2) * 7, fy = 12 + Math.floor(i / 2) * 6; field(W, fx, fy, 5, 4, i === 3 ? 'pumpkin' : 'wheat'); V.fields.push({ x: fx, y: fy, w: 5, h: 4 }); }
      for (let k = 0; k < 60; k++) { const x = 44 + (k % 8), y = 5 + ((k / 8) | 0); if (W.canPlace('windmill', x, y, 1)) { const m = W.place('windmill', x, y); const d = W.door(m); W.carvePath(d.x, d.y, vx, vy + 1); break; } }
      for (let k = 0; k < 80; k++) { const x = 52 + (k % 9), y = 14 + ((k / 9) | 0); if (W.canPlace('storehouse', x, y, 1)) { const s = W.place('storehouse', x, y); const d = W.door(s); W.carvePath(d.x, d.y, vx, vy + 1); break; } }
      W.carvePath(43, 16, vx, vy + 1); W.carvePath(50, 22, vx, vy + 1);
      const bx = vx + 1; let y = vy + 3; while (y < 46 && !W.isWater(bx, y)) y++; W.carvePath(vx, vy + 2, bx, y - 1);
      while (y < 46 && W.isWater(bx, y)) { setRaw(W, bx, y, 'planks'); setRaw(W, bx + 1, y, 'planks'); y++; }
      for (let yy = y; yy < 46; yy++) { setRaw(W, bx, yy, 'path'); }
      const px0 = 42, py0 = 40, pw = 14, ph = 6;
      for (let yy = py0 - 1; yy <= py0 + ph; yy++) for (let xx = px0 - 1; xx <= px0 + pw; xx++) if (W.tile(xx, yy) > 1) setRaw(W, xx, yy, 'grass');
      for (let xx = px0; xx < px0 + pw; xx++) { if (xx !== px0 + 6 && xx !== px0 + 7) W.canPlace('fence', xx, py0) && W.place('fence', xx, py0); W.canPlace('fence', xx, py0 + ph - 1) && W.place('fence', xx, py0 + ph - 1); }
      for (let yy = py0 + 1; yy < py0 + ph - 1; yy++) { W.canPlace('fence', px0, yy) && W.place('fence', px0, yy, { v: 1 }); W.canPlace('fence', px0 + pw - 1, yy) && W.place('fence', px0 + pw - 1, yy, { v: 1 }); }
      W.place('haystack', px0 + 2, py0 + 2);
      W.carvePath(px0 + 6, py0 - 1, bx, 45);
      link(W, placeNear(W, 'tavern', vx + 5, vy - 4, {}, 1, 8), vx, vy + 1);
      link(W, placeNear(W, 'blacksmith', vx - 7, vy + 3, {}, 1, 8), vx, vy + 1);
      { const sp = findSpot(W, 'mine', 4, 4, 68, 30, (x, yy) => W.tile(x, yy) === TID.stone && W.tile(x + 1, yy + 1) === TID.stone, 1); if (sp) link(W, W.place('mine', sp[0], sp[1]), vx, vy + 1); }
      { const sp = findSpot(W, 'lumbermill', 40, 3, 64, 16, (x, yy) => W.isWater(x + 3, yy) && W.isWater(x + 3, yy + 1)); if (sp) link(W, W.place('lumbermill', sp[0], sp[1]), vx, vy + 1); }
      const cf = [vx - 9, vy + 6]; if (W.canPlace('campfire', cf[0], cf[1], 1)) W.place('campfire', cf[0], cf[1]);
      scatter(W, [{ on: [TID.water], id: 'lily', p: (x, y) => (((x - 60) / 6) ** 2 + ((y - 9) / 4) ** 2 < 1.2 ? .18 : .02), o: () => ({ v: W.rng() < .3 ? 1 : 0 }) }]);
      scatter(W, [{ on: [TID.grass, TID.sand], id: 'reeds', p: (x, y) => (W.isWater(x, y + 1) || W.isWater(x, y - 1) || W.isWater(x + 1, y)) ? .3 : 0 }]);
      const av = [{ x: vx, y: vy, rx: 14, ry: 9 }, { x: 49, y: 14, rx: 10, ry: 9 }, { x: px0 + 7, y: py0 + 3, rx: 9, ry: 5 }];
      scatter(W, [
        { on: [TID.meadow], id: 'pine', p: .42, o: () => ({ v: W.rng() < .25 ? 1 : 0 }) },
        { on: [TID.meadow], id: 'mushroom', p: .03 },
        { on: [TID.stone], id: 'rock', p: .25, o: () => ({ v: W.rng() < .5 ? 1 : 0 }) },
        { on: [TID.grass], id: 'oak', p: .05, o: () => ({ v: W.rng() < .5 ? 2 : W.rng() < .5 ? 0 : 1 }) },
        { on: [TID.grass, TID.meadow], id: 'bush', p: .03, o: () => ({ v: (W.rng() * 3) | 0 }) },
        { on: [TID.grass, TID.meadow], id: 'stump', p: .008 }
      ], av);
      scatter(W, [{ on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) }, { on: [TID.grass, TID.meadow], id: 'tuft', p: .09 }]);
      populate(W, V, { farmer: 5, woodcutter: 4, merchant: 2, fisher: 2, kid: 4, wanderer: 1, smith: 1, miner: 2, innkeeper: 1 });
      critters(W, 'sheep', 6, { x: px0 + 7, y: py0 + 3 }, 3, 0); W.entities.filter(e => e.kind === 'sheep').forEach(e => e.range = 4);
      critters(W, 'chicken', 5, { x: vx, y: vy + 4 }, 7, () => W.rng() < .5 ? 0 : 1); critters(W, 'cat', 2, { x: vx, y: vy }, 6, () => (W.rng() * 3) | 0);
      critters(W, 'duck', 4, { x: 60, y: 9 }, 4, () => W.rng() < .6 ? 0 : 1);
      W.focus = { x: vx + 6, y: vy + 4 }; return W;
    },
    oasis(seed) {
      const W = new World(72, 48, seed), N = W.noise, ox = 36, oy = 19; W.name = 'Oasis of Sel'; W.climate = 'warm';
      forTiles(W, (x, y) => {
        const d = Math.sqrt(((x - ox) / 1.35) ** 2 + (y - oy) ** 2) + (N.fbm(x * .15, y * .15) - .5) * 3;
        let t = 'dune'; if (N.fbm(x * .07 + 20, y * .07) > .64) t = 'stone';
        if (d < 3) t = 'deep'; else if (d < 5.6) t = 'water'; else if (d < 8.5) t = 'grass'; else if (d < 10) t = 'sand';
        setRaw(W, x, y, t);
      });
      const vx = 36, vy = 34;
      const V = village(W, vx, vy, { houses: 8, plaza: [12, 5], hall: false, statue: true, stalls: 4, fields: 0, crops: [], ringMin: 5, ringMax: 11, roofs: [2, 2, 0], ground: 'dune' });
      for (let k = 0, n = 0; k < 600 && n < 6; k++) { const a = W.rng() * Math.PI * 2, r = 13 + W.rng() * 6; const x = Math.round(ox + Math.cos(a) * r * 1.6), y = Math.round(oy + Math.sin(a) * r * .85); if (W.canPlace('tent', x, y, 1)) { const t = W.place('tent', x, y, { v: (W.rng() * 4) | 0 }); V.homes.push(t); n++; const d = W.door(t); W.carvePath(d.x, d.y, vx, vy); } }
      let y = vy - 3; while (y > 0 && !W.isWater(ox, y)) y--; W.carvePath(vx, vy - 2, ox, y + 1); for (let i = 0; i < 3; i++) setRaw(W, ox, y - i, 'planks');
      field(W, ox + 11, oy - 2, 4, 3, 'cabbage'); field(W, ox - 15, oy - 1, 4, 3, 'pumpkin'); W.carvePath(ox + 13, oy + 1, vx, vy); W.carvePath(ox - 13, oy + 2, vx, vy);
      const cf = [vx + 9, vy + 4]; if (W.canPlace('campfire', cf[0], cf[1], 1)) W.place('campfire', cf[0], cf[1]);
      W.canPlace('barrel', vx - 7, vy - 1) && W.place('barrel', vx - 7, vy - 1); W.canPlace('crate', vx - 7, vy) && W.place('crate', vx - 7, vy);
      scatter(W, [
        { on: [TID.grass, TID.sand], id: 'palm', p: .3, o: () => ({ flip: W.rng() < .5 }) },
        { on: [TID.grass], id: 'flowers', p: .12, o: () => ({ v: (W.rng() * 4) | 0 }) },
        { on: [TID.grass], id: 'tuft', p: .2 },
        { on: [TID.dune], id: 'cactus', p: .022 },
        { on: [TID.dune], id: 'palm', p: .006 },
        { on: [TID.stone], id: 'rock', p: .14, o: () => ({ v: W.rng() < .4 ? 1 : 0 }) },
        { on: [TID.dune], id: 'rock', p: .008 }
      ], [{ x: vx, y: vy, rx: 9, ry: 5 }]);
      scatter(W, [{ on: [TID.water], id: 'lily', p: .04, o: () => ({ v: W.rng() < .4 ? 1 : 0 }) }, { on: [TID.sand, TID.grass], id: 'reeds', p: (x, y) => (W.isWater(x, y - 1) || W.isWater(x, y + 1)) ? .2 : 0 }]);
      populate(W, V, { merchant: 5, farmer: 3, fisher: 1, kid: 4, wanderer: 3, woodcutter: 1 });
      critters(W, 'sheep', 6, { x: ox - 18, y: oy + 8 }, 6, 1); critters(W, 'chicken', 4, { x: vx, y: vy - 1 }, 6, 1); critters(W, 'cat', 3, { x: vx, y: vy }, 8, () => (W.rng() * 3) | 0);
      critters(W, 'duck', 3, { x: ox, y: oy }, 5, 1);
      W.focus = { x: vx, y: vy - 6 }; return W;
    },
    meadow(seed) {
      const W = new World(56, 36, seed), N = W.noise; W.name = 'Open Meadow';
      forTiles(W, (x, y) => { const edge = Math.min(x, y, 55 - x, 35 - y); let t = edge + (N.fbm(x * .15, y * .15) - .5) * 8 < 4 ? 'meadow' : 'grass'; const pd = ((x - 41) / 4.5) ** 2 + ((y - 11) / 3) ** 2 + (N.n2(x * .5, y * .5) - .5) * .5; if (pd < 1) t = 'water'; else if (pd < 1.4) t = 'sand'; setRaw(W, x, y, t); });
      W.place('campfire', 24, 18);
      scatter(W, [{ on: [TID.meadow], id: 'oak', p: .25, o: () => ({ v: W.rng() < .3 ? 2 : 0 }) }, { on: [TID.meadow], id: 'pine', p: .15 }, { on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) }, { on: [TID.grass, TID.meadow], id: 'tuft', p: .1 }, { on: [TID.grass], id: 'rock', p: .006 }, { on: [TID.sand], id: 'reeds', p: .25 }]);
      scatter(W, [{ on: [TID.water], id: 'lily', p: .12, o: () => ({ v: W.rng() < .3 ? 1 : 0 }) }]);
      for (let i = 0; i < 3; i++) W.spawn('villager', 22 + i * 2, 20, { job: 'wanderer' });
      critters(W, 'chicken', 2, { x: 25, y: 20 }, 3, 0); critters(W, 'duck', 2, { x: 41, y: 11 }, 3, 0);
      W.focus = { x: 27, y: 18 }; return W;
    }
  };
  function placeNear(W, id, x, y, opts, margin, rad, animate) { rad = rad == null ? 4 : rad; for (let r = 0; r <= rad; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (W.canPlace(id, x + dx, y + dy, margin || 0)) return W.place(id, x + dx, y + dy, opts || {}, animate); } return null; }
  function findSpot(W, id, x0, y0, x1, y1, pred, margin) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (W.canPlace(id, x, y, margin || 0) && (!pred || pred(x, y))) return [x, y]; return null; }
  function link(W, o, tx, ty, tile) { if (!o) return o; const d = W.door(o); W.carvePath(d.x, d.y, tx, ty, tile); return o; }
  function registerPreset(meta, fn, front) { GEN[meta.id] = fn; const i = PRESETS.findIndex(p => p.id === meta.id); if (i >= 0) PRESETS.splice(i, 1); if (front) PRESETS.unshift(meta); else PRESETS.push(meta); }
  function createWorld(id, seed, opts) { seed = seed == null ? 7 : seed; const W = (GEN[id] || GEN[PRESETS[0].id])(seed, opts || {}); W.preset = id; return W; }

  /* ================= Game ================= */
  const TINT = [[0, '#58527A', 1], [4.8, '#58527A', 1], [6.2, '#E8B7A6', .45], [7.6, '#FFFFFF', 0], [17, '#FFFFFF', 0], [18.6, '#FFD7A8', .12], [19.8, '#D49A9A', .5], [21, '#58527A', 1], [24, '#58527A', 1]];
  function lerpHex(a, b, t) { const A1 = A.rgb(a), B1 = A.rgb(b); return 'rgb(' + A1.map((v, i) => Math.round(v + (B1[i] - v) * t)).join(',') + ')'; }
  function tintAt(h) { for (let i = 0; i < TINT.length - 1; i++) { const a = TINT[i], b = TINT[i + 1]; if (h >= a[0] && h <= b[0]) { const t = (h - a[0]) / (b[0] - a[0] || 1); return { c: lerpHex(a[1], b[1], t), L: a[2] + (b[2] - a[2]) * t, white: a[1] === '#FFFFFF' && b[1] === '#FFFFFF' }; } } return { c: '#fff', L: 0, white: true }; }
  function phaseOf(h) { return h < 5 ? 'Night' : h < 7 ? 'Dawn' : h < 11 ? 'Morning' : h < 14 ? 'Midday' : h < 17.5 ? 'Afternoon' : h < 20 ? 'Golden hour' : h < 22 ? 'Evening' : 'Night'; }
  const pad = n => String(n).padStart(2, '0');
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const SMAP = [
    { [C.p400]: '#78B851', '#7BB559': '#86C25E', '#65A346': '#6AAA48' },
    {},
    { [C.p400]: '#A2A548', '#7BB559': '#B3AE52', '#65A346': '#93983F', [C.p300]: '#C8B95E', [C.p200]: '#DCCB80', [C.p500]: '#82873A', '#447C2D': '#6C7530', [C.p600]: '#5F6529', [C.p700]: '#4B5021' },
    { [C.p400]: '#EDF2F5', '#7BB559': '#F5F8FA', '#65A346': '#E2EAF0', [C.p300]: '#FFFFFF', [C.p200]: '#FFFFFF', [C.p500]: '#D3DEE7', '#447C2D': '#C7D5E0', [C.p600]: '#B7C7D4', [C.p700]: '#A4B5C4', '#8E5E36': '#EEF2F5', [C.w3]: '#D9E2E9', [C.s300]: '#E2DCD2', '#D4BC8E': '#E9E4DC', [C.s400]: '#CBBFAE', [C.l400]: '#92D0D2', '#38A094': '#87C7C9', [C.co400]: '#C9CED3', '#ABA08F': '#D3D7DA', [C.co300]: '#E6EAEE' }
  ];
  const STINT = ['#FFF9EE', null, '#FFEFD6', '#E2EBF7'];
  const WX = { temperate: [[['rain', .3], ['fog', .15]], [['storm', .12], ['rain', .1]], [['rain', .3], ['fog', .2], ['storm', .08]], [['snow', .6], ['fog', .1]]], warm: [[['rain', .2]], [['storm', .15]], [['rain', .3]], [['rain', .35]]] };
  function weatherFor(W, day) { if (day <= 1) return 'clear'; const tbl = (WX[W.climate] || WX.temperate)[W.season]; let r = A.hash2(day * 31 + 7, W.seed % 1000), acc = 0; for (const [k, p] of tbl) { acc += p; if (r < acc) return k; } return 'clear'; }
  function blob(rgb, a0) { const c = A.mk(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')'); r.addColorStop(.38, 'rgba(' + rgb + ',' + (a0 * .45) + ')'); r.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; }
  const LEAFY = id => id === 'oak' || id === 'birch' || id === 'willow' || id === 'elder';

  class Game {
    constructor(canvas, cb) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.cb = cb || {}; this.externalDecisions = false;
      this.cam = { x: 0, y: 0, z: 3 }; this.tool = 'watch'; this.item = null; this.hover = null; this.sel = null; this.follow = false;
      this.opts = { weather: 'auto', ambient: true, grid: false }; this.speed = 1; this.t = 0; this.last = performance.now();
      this.flyers = []; this.rain = []; this.snow = []; this.fog = []; this.flash = 0; this.wk = { rain: 0, snow: 0, fog: 0, storm: 0 }; this.visTrees = [];
      this.clouds = []; for (let i = 0; i < 6; i++) this.clouds.push({ x: Math.random() * 1400, y: Math.random() * 900, s: 40 + Math.random() * 60 });
      this.glow = blob('255,190,110', 1); this.cool = blob('110,240,220', 1); this.fogImg = blob('246,242,234', .9);
      this.shadows = new Map();
      this.bindInput(); this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); this.resize();
      this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
    }
    destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.unbind && this.unbind(); }
    resize() { const r = this.cv.getBoundingClientRect(); this.vw = Math.max(1, Math.round(r.width)); this.vh = Math.max(1, Math.round(r.height)); this.cv.width = this.vw; this.cv.height = this.vh; this.clampCam(); }
    load(W, o) {
      o = typeof o === 'number' ? { hour: o } : (o || {});
      this.world = W; this.sel = null; this.follow = false; if (o.hour != null) W.time = o.hour * 60; if (o.season != null) W.season = o.season;
      W.weatherToday = weatherFor(W, W.day);
      const pw = W.w * T, ph = W.h * T; this.terrain = A.mk(pw, ph); this.tctx = this.terrain.getContext('2d'); this.foam = A.mk(pw, ph); this.fctx = this.foam.getContext('2d'); this.pmap = new Uint8Array(pw * ph);
      W.dirty = { x0: 0, y0: 0, x1: W.w - 1, y1: W.h - 1 }; this.bakeDirty();
      this.fog = []; for (let i = 0; i < 30; i++) this.fog.push({ x: Math.random() * pw, y: Math.random() * ph, r: 50 + Math.random() * 80, v: 3 + Math.random() * 5 });
      const wx = this.weather(); for (const k in this.wk) this.wk[k] = (wx === k || (k === 'rain' && wx === 'storm')) ? 1 : 0;
      this.cam.z = Math.max(2, Math.min(5, Math.round(Math.min(this.vw / (30 * T), this.vh / (18 * T))))); this.centerOn(W.focus.x * T, W.focus.y * T);
      window.world = W; window.game = this;
    }
    weather() { const w = this.opts.weather; return !w || w === 'auto' ? (this.world.weatherToday || 'clear') : w; }
    setSeason(s) { const W = this.world; W.season = ((s % 4) + 4) % 4; W.dayInSeason = 0; W.weatherToday = weatherFor(W, W.day); W.dirty = { x0: 0, y0: 0, x1: W.w - 1, y1: W.h - 1 }; W.particles = W.particles.filter(p => p.k !== 'leaf'); }
    centerOn(ax, ay) { this.cam.x = ax - this.vw / this.cam.z / 2; this.cam.y = ay - this.vh / this.cam.z / 2; this.clampCam(); }
    clampCam() {
      if (!this.world) return; const z = this.cam.z, ww = this.world.w * T, wh = this.world.h * T, vw = this.vw / z, vh = this.vh / z;
      this.cam.x = vw >= ww ? (ww - vw) / 2 : Math.max(-8, Math.min(ww - vw + 8, this.cam.x)); this.cam.y = vh >= wh ? (wh - vh) / 2 : Math.max(-8, Math.min(wh - vh + 8, this.cam.y));
    }
    zoomAt(sx, sy, dz) { const z0 = this.cam.z, z1 = Math.max(1, Math.min(8, z0 + dz)); if (z1 === z0) return; const ax = this.cam.x + sx / z0, ay = this.cam.y + sy / z0; this.cam.z = z1; this.cam.x = ax - sx / z1; this.cam.y = ay - sy / z1; this.clampCam(); }
    setTool(tool, item) { this.tool = tool; this.item = item || null; }
    setOptions(o) { Object.assign(this.opts, o); }

    bakeDirty() {
      const W = this.world, d = W.dirty; if (!d) return; W.dirty = null;
      const S = W.season, warm = W.climate === 'warm', smap = SMAP[warm && S === 3 ? 1 : S] || {}, speck = S === 0 ? .982 : (S === 3 && !warm) ? 2 : .995;
      const x0 = Math.max(0, d.x0 - 1), y0 = Math.max(0, d.y0 - 1), x1 = Math.min(W.w - 1, d.x1 + 1), y1 = Math.min(W.h - 1, d.y1 + 1);
      const PW = W.w * T, PH = W.h * T, px0 = x0 * T, py0 = y0 * T, px1 = (x1 + 1) * T, py1 = (y1 + 1) * T, m = 4;
      const qx0 = Math.max(0, px0 - m), qy0 = Math.max(0, py0 - m), qx1 = Math.min(PW, px1 + m), qy1 = Math.min(PH, py1 + m), N = W.noise, pm = this.pmap, H = A.HARD;
      for (let py = qy0; py < qy1; py++) for (let px = qx0; px < qx1; px++) {
        const tx = (px / T) | 0, ty = (py / T) | 0, t0 = W.tiles[ty * W.w + tx]; let t = t0;
        if (!H[t0]) { const jx = (N.n2(px * .06, py * .06) - .5) * 16 + (N.n2(px * .2 + 5, py * .2) - .5) * 5, jy = (N.n2(px * .06 + 37.2, py * .06 + 11.7) - .5) * 16 + (N.n2(px * .2, py * .2 + 9) - .5) * 5; const jtx = Math.max(0, Math.min(W.w - 1, ((px + jx) / T) | 0)), jty = Math.max(0, Math.min(W.h - 1, ((py + jy) / T) | 0)); const tj = W.tiles[jty * W.w + jtx]; if (!H[tj]) t = tj; }
        pm[py * PW + px] = t;
      }
      const w = px1 - px0, h = py1 - py0, img = this.tctx.createImageData(w, h), fim = this.fctx.createImageData(w, h), D = img.data, F = fim.data;
      const at = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH) ? 255 : pm[y * PW + x];
      const land = (x, y) => { const v = at(x, y); return v !== 255 && v >= 2; };
      for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) {
        const t = pm[py * PW + px], hh = A.hash2(px, py), n = N.n2(px * .05, py * .05), i = ((py - py0) * w + (px - px0)) * 4; let col, fa = 0;
        if (t <= 1) {
          if (land(px - 1, py) || land(px + 1, py) || land(px, py - 1) || land(px, py + 1)) { col = C.l300; fa = 235; }
          else if (land(px - 3, py) || land(px + 3, py) || land(px, py - 3) || land(px, py + 3) || land(px - 2, py - 2) || land(px + 2, py + 2) || land(px + 2, py - 2) || land(px - 2, py + 2)) { col = t === 0 ? '#2A8C80' : (hh > .4 ? C.l300 : '#6BBDB2'); fa = hh > .7 ? 110 : 0; }
          else if (t === 0 && (at(px, py - 4) === 1 || at(px, py + 4) === 1 || at(px - 4, py) === 1 || at(px + 4, py) === 1)) col = '#23847A';
          else col = A.terrainPixel(t, px, py, hh, n);
        } else {
          const tb = at(px, py + 1), tr = at(px + 1, py), tb2 = at(px, py + 2);
          if (tb <= 1 || (tb2 <= 1 && t !== TID.planks)) col = A.LIP[t];
          else if ((tb !== t && tb !== 255 && tb >= 2) || (tr !== t && tr !== 255 && tr >= 2)) col = A.EDGE[t];
          else col = A.terrainPixel(t, px, py, hh, n);
          if ((t === TID.grass || t === TID.meadow) && hh > speck) col = [C.s50, C.sun, C.b400, '#F2B8B0', C.k300][(hh * 1000 | 0) % (S === 0 ? 5 : 3)];
        }
        col = smap[col] || col;
        const c = A.rgb(col); D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
        if (fa) { F[i] = 251; F[i + 1] = 246; F[i + 2] = 236; F[i + 3] = fa; }
      }
      this.tctx.putImageData(img, px0, py0); this.fctx.putImageData(fim, px0, py0);
    }

    /* ---------- input ---------- */
    bindInput() {
      const cv = this.cv; let down = null; const keys = {};
      const pos = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
      const toWorld = (sx, sy) => ({ ax: this.cam.x + sx / this.cam.z, ay: this.cam.y + sy / this.cam.z });
      const onDown = e => { const p = pos(e); down = { ...p, cx: this.cam.x, cy: this.cam.y, moved: false, b: e.button }; cv.setPointerCapture(e.pointerId); if (this.tool === 'terrain' && e.button === 0) { this.paint(); down.painting = true; } };
      const onMove = e => {
        const p = pos(e), w = toWorld(p.sx, p.sy); this.hover = { ax: w.ax, ay: w.ay, tx: Math.floor(w.ax / T), ty: Math.floor(w.ay / T), sx: p.sx, sy: p.sy };
        if (!down) return; const dx = p.sx - down.sx, dy = p.sy - down.sy;
        if (down.painting) { this.paint(); return; }
        if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
        if (down.moved) { this.cam.x = down.cx - dx / this.cam.z; this.cam.y = down.cy - dy / this.cam.z; this.follow = false; this.clampCam(); }
      };
      const onUp = () => { if (down && !down.moved && !down.painting && down.b === 0) this.click(); down = null; };
      const onWheel = e => { e.preventDefault(); const p = pos(e); this.zoomAt(p.sx, p.sy, e.deltaY < 0 ? 1 : -1); };
      const onLeave = () => { this.hover = null; };
      const onKey = e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; keys[e.key.toLowerCase()] = e.type === 'keydown'; };
      cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('wheel', onWheel, { passive: false }); cv.addEventListener('pointerleave', onLeave); cv.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); this.keys = keys;
      this.unbind = () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
    }
    entityAt(ax, ay) { let best = null, bd = 1e9; this.world.entities.forEach(e => { if (e.inside) return; const ex = e.x * T, ey = e.y * T, dx = ax - ex, dy = ay - (ey - 6); if (Math.abs(dx) < 7 && dy > -11 && dy < 8) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } } }); return best; }
    paint() {
      const h = this.hover, it = this.item; if (!h || !it) return; const W = this.world, v = W.version, brush = Math.max(1, it.brush || 1), radius = (brush - 1) >> 1;
      if (it.fill) {
        const from = W.tile(h.tx, h.ty), to = it.terrain; if (from === to) return;
        const q = [[h.tx, h.ty]], seen = new Uint8Array(W.w * W.h); seen[h.ty * W.w + h.tx] = 1; let head = 0;
        while (head < q.length && q.length < W.w * W.h) {
          const [x, y] = q[head++]; if (W.tile(x, y) !== from) continue; W.setTile(x, y, to);
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy, i = ny * W.w + nx; if (W.inb(nx, ny) && !seen[i] && W.tile(nx, ny) === from) { seen[i] = 1; q.push([nx, ny]); } }
        }
      } else {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) W.setTile(h.tx + dx, h.ty + dy, it.terrain);
      }
      if (W.version !== v) this.cb.onMutate && this.cb.onMutate();
    }
    puff(ax, ay, n, color) { for (let i = 0; i < n; i++) this.world.particles.push({ k: 'dust', x: ax + (Math.random() - .5) * 14, y: ay - Math.random() * 6, vx: (Math.random() - .5) * 18, vy: -Math.random() * 14, life: .7 + Math.random() * .5, max: 1.2, s: 2, c: color || C.s200 }); }
    click() {
      const h = this.hover, W = this.world; if (!h) return; const it = this.item;
      if (this.tool === 'watch') { const e = this.entityAt(h.ax, h.ay); if (e) { this.sel = e; } else { const o = W.objectAt(h.tx, h.ty); this.sel = o && !o.def.small ? o : null; this.follow = false; } this.cb.onSelect && this.cb.onSelect(); return; }
      if ((this.tool === 'build' || this.tool === 'plant') && it) {
        const d = A.get(it.id), x = h.tx - ((d.foot[0] - 1) >> 1), y = h.ty - (d.foot[1] - 1);
        if (W.canPlace(it.id, x, y)) { const o = W.place(it.id, x, y, Object.assign({}, it.opts, it.id === 'palm' ? { flip: Math.random() < .5 } : {}), true); this.puff((x + o.fw / 2) * T, (y + o.fh) * T, 8); this.cb.onMutate && this.cb.onMutate(); }
        return;
      }
      if (this.tool === 'people' && it) {
        const k = it.id; if (k === 'duck' ? W.tile(h.tx, h.ty) !== TID.water : !W.walkable(h.tx, h.ty)) return;
        const e = W.spawn(k, h.tx, h.ty, Object.assign({}, it.opts, k === 'villager' && !(it.opts && it.opts.job) ? { job: ['farmer', 'woodcutter', 'fisher', 'merchant', 'kid', 'wanderer', 'builder', 'miner', 'guard'][(Math.random() * 9) | 0] } : {})); e.ax = e.x; e.ay = e.y; e.range = 5; e.say('heart', 2); this.puff(e.x * T, e.y * T, 6, C.s50); this.cb.onMutate && this.cb.onMutate(); return;
      }
      if (this.tool === 'erase') {
        const e = this.entityAt(h.ax, h.ay); if (e) { W.despawn(e); this.puff(e.x * T, e.y * T, 10); if (this.sel === e) this.sel = null; this.cb.onMutate && this.cb.onMutate(); return; }
        const o = W.objectAt(h.tx, h.ty); if (o) { W.remove(o); this.puff((o.x + o.fw / 2) * T, (o.y + o.fh) * T - 8, 16); if (this.sel === o) this.sel = null; this.cb.onSelect && this.cb.onSelect(); this.cb.onMutate && this.cb.onMutate(); }
      }
    }

    /* ---------- life ---------- */
    task(e, act, tx, ty, wait, done, icon, tool, face) {
      e.activity = act;
      e.goTo(tx, ty, () => { e.wait = wait; e.done = done || null; e.tool = tool || null; if (icon) e.say(icon); if (face) this.face(e, face[0], face[1]); });
    }
    face(e, fx, fy) { const dx = fx - e.x, dy = fy - e.y; if (Math.abs(dx) >= Math.abs(dy) * .7) { e.dir = 'side'; e.flip = dx < 0; } else e.dir = dy < 0 ? 'up' : 'down'; }
    enter(e, o, act, dur, done, icon) { const d = this.world.door(o); e.activity = act; e.goTo(d.x, d.y, () => { e.inside = true; e.insideT = dur; e.insideObj = o; e.done = done || null; if (icon) e.say(icon, 2); }); }
    waterNear(x, y) { const W = this.world; for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) if (W.isWater(x + dx, y + dy)) return [x + dx + .5, y + dy + .5]; return null; }
    think(e) {
      const W = this.world, h = W.hour, R = Math.random, pick = a => a[(R() * a.length) | 0], P = k => W.poi(k);
      e.tool = null; e.building = null; e.sparks = false; e.chop = null;
      const near = (list, n) => list.slice().sort((a, b) => ((a.x - e.x) ** 2 + (a.y - e.y) ** 2) - ((b.x - e.x) ** 2 + (b.y - e.y) ** 2)).slice(0, n || 6);
      if (e.carry) {
        const c = e.carry, dest = { wood: P('mills')[0] || P('stores')[0], ore: P('smiths')[0] || P('stores')[0], stone: P('stores')[0], bread: pick(P('taverns').concat(P('stalls'))), fish: pick(P('stalls').concat(P('taverns'))), wheat: P('bakeries')[0] || P('stores')[0] }[c] || P('stores')[0] || (e.home && W.objects.includes(e.home) ? e.home : null);
        if (dest) { const d = W.door(dest); this.task(e, 'Carrying ' + c + ' to the ' + dest.def.name.toLowerCase(), d.x, d.y, 1.2, () => { W.stock[c] = (W.stock[c] || 0) + 1; e.carry = null; }); return; }
        e.carry = null;
      }
      if (h >= 21.8 || h < 5.4) {
        if (e.job === 'guard') { const tw = P('towers').concat(P('keeps')); if (tw.length) { const d = W.door(pick(tw)); this.task(e, 'Keeping the night watch', d.x, d.y, 15 + R() * 15, null, R() < .3 ? 'bang' : null); return; } }
        if (e.home && W.objects.includes(e.home) && e.home.build >= 1) { const d = W.door(e.home); e.activity = 'Heading home'; e.goTo(d.x, d.y, () => { e.inside = true; e.insideT = null; e.activity = 'Asleep'; }); return; }
        const f = P('fires'); if (f.length) { const o = f[0]; this.task(e, 'Sleeping under the stars', o.x + (R() < .5 ? -1 : 1), o.y + 1, 30, null, 'zzz'); return; }
      }
      if (h >= 18 && h < 21.8) {
        const tv = P('taverns');
        if (tv.length && R() < .65) { const o = pick(tv); if (R() < .5) this.enter(e, o, 'Singing at the tavern', 12 + R() * 20, null, 'mug'); else { const d = W.door(o); this.task(e, pick(['Arguing about the weather', 'Telling the fish story again', 'Toasting the harvest']), d.x + Math.round((R() - .5) * 4), d.y + (R() * 2 | 0), 8 + R() * 10, null, pick(['note', 'mug', 'chat'])); } return; }
        const f = P('fires'); if (f.length && R() < .75) { const o = pick(f); this.task(e, pick(['Warming up by the fire', 'Telling the fish story again', 'Humming by the fire']), o.x + Math.round((R() - .5) * 4), o.y + Math.round(R() * 2), 10 + R() * 15, null, pick(['note', 'heart', 'chat'])); return; }
        const pl = P('plaza'); if (pl.length) { const p = pick(pl); this.task(e, 'Evening stroll', p[0], p[1], 6 + R() * 8, null, 'chat'); return; }
      }
      if (h >= 5.4 && h < 7 && R() < .4) { const wl = P('wells'); if (wl.length) { const w = pick(wl); this.task(e, 'Fetching water', w.x, w.y + 1, 3, () => { e.carry = 'water'; }, 'drop'); return; } }
      if (h >= 11.5 && h < 13.2 && R() < .6) { const st = P('stalls'), pl = P('plaza'); if (st.length && R() < .5) { const s = pick(st); this.task(e, 'Lunch at the market', s.x + (R() * 2 | 0), s.y + 1, 6 + R() * 6, null, 'chat'); return; } if (pl.length) { const p = pick(pl); this.task(e, 'Gossiping on the plaza', p[0], p[1], 6 + R() * 8, null, 'chat'); return; } }
      switch (e.job) {
        case 'farmer': {
          const cr = P('crops');
          if (cr.length && W.season !== 3) { const ripe = cr.filter(o => o.age >= 95), o = ripe.length && R() < .75 ? pick(near(ripe, 8)) : pick(cr), nm = o.def.name.toLowerCase();
            this.task(e, o.age >= 95 ? 'Harvesting the ' + nm : pick(['Tending the ' + nm, 'Pulling weeds', 'Talking to the pumpkins']), o.x, o.y, 7 + R() * 9, () => { if (!W.objects.includes(o)) return; if (o.age >= 95) { o.age = 0; e.carry = 'wheat'; e.say('wheat'); } else o.age += 12; }, null, 'hoe', [o.x + 1.5, o.y + .5]); return; }
          const st = P('stores')[0]; if (st) { const d = W.door(st); this.task(e, 'Counting the winter stores', d.x, d.y, 8 + R() * 6, null, 'chat'); return; }
          break;
        }
        case 'fisher': {
          const hut = P('huts')[0], d = P('docks'), s = d.length ? d : P('shore');
          if (s.length) { const p = hut && R() < .6 ? (nearestOf(W, s, hut.x + 1, hut.y + 2) || pick(s)) : pick(s); this.task(e, 'Fishing off the ' + (d.length ? 'dock' : 'shore'), p[0], p[1], 14 + R() * 14, () => { if (R() < .6) { e.carry = 'fish'; e.say('fish'); } }, null, 'rod', this.waterNear(p[0], p[1])); return; }
          break;
        }
        case 'woodcutter': {
          const tr = P('trees').filter(t => t.id !== 'elder');
          if (tr.length) { const t = pick(near(tr, 10)), left = W.walkable(t.x - 1, t.y), sx = left ? t.x - 1 : t.x, sy = left ? t.y : t.y + 1;
            this.task(e, 'Chopping wood, mostly', sx, sy, 8 + R() * 8, () => { if (R() < .65) e.carry = 'wood'; if (R() < .12 && P('trees').length > 50 && W.objects.includes(t)) { W.remove(t); W.place('stump', t.x, t.y); this.puff((t.x + .5) * T, (t.y + 1) * T - 10, 14, C.p400); } }, null, 'axe', [t.x + .5, t.y + .5]); e.chop = t; return; }
          break;
        }
        case 'miner': { const m = P('mines'); if (m.length) { this.enter(e, pick(m), 'Down in the mine', 14 + R() * 14, () => { e.carry = R() < .75 ? 'ore' : 'stone'; e.say('pick'); }); return; } break; }
        case 'smith': { const s = P('smiths'); if (s.length) { const o = s[0], ax = o.x + o.fw, ay = o.y + o.fh - 1; this.task(e, pick(['Hammering horseshoes', 'Sharpening axes', 'Forging nails']), ax, ay, 10 + R() * 10, null, null, 'hammer', [ax - .4, ay + .5]); e.sparks = true; return; } break; }
        case 'baker': { const b = P('bakeries'); if (b.length) { this.enter(e, b[0], 'Baking bread', 12 + R() * 12, () => { e.carry = 'bread'; e.say('bread'); }); return; } break; }
        case 'builder': { const s = P('sites'); if (s.length) { const o = pick(near(s, 3)), bx = o.x + Math.floor(R() * o.fw), by = o.y + o.fh; this.task(e, 'Building the ' + o.def.name.toLowerCase(), bx, by, 10 + R() * 8, null, R() < .3 ? 'hammer' : null, 'hammer', [bx + .5, by - .6]); e.building = o; return; } break; }
        case 'merchant': { const st = P('stalls'); if (st.length) { const s = st[e.uid % st.length]; this.task(e, 'Minding the stall', s.x + (e.uid % 2), s.y + 1, 18 + R() * 12, null, 'chat'); return; } break; }
        case 'innkeeper': { const tv = P('taverns'); if (tv.length) { const o = tv[0], d = W.door(o); if (R() < .4) this.enter(e, o, 'Polishing mugs', 10 + R() * 10); else this.task(e, 'Sweeping the doorstep', d.x + 1, d.y, 6 + R() * 6, null, 'mug'); return; } break; }
        case 'guard': { const tw = P('towers').concat(P('keeps')); if (tw.length) { const d = W.door(pick(tw)); this.task(e, pick(['Patrolling the walls', 'Guarding the gate', 'Looking stern']), d.x, d.y, 8 + R() * 10, null, R() < .2 ? 'bang' : null); return; } break; }
        case 'kid': { const pl = P('plaza'), base = pl.length ? pick(pl) : [Math.floor(e.x), Math.floor(e.y)]; this.task(e, pick(['Playing tag (losing)', 'Chasing a chicken', 'Hiding from chores']), base[0] + Math.round((R() - .5) * 10), base[1] + Math.round((R() - .5) * 8), 1 + R() * 3, null, R() < .3 ? 'bang' : null); return; }
      }
      const lm = P('landmarks'); if (lm.length && R() < .25) { const o = pick(lm), d = W.door(o); this.task(e, 'Visiting the ' + o.def.name.toLowerCase(), d.x, d.y, 6 + R() * 8, null, pick(['heart', 'bang', 'chat'])); return; }
      this.task(e, pick(['Wandering', 'Admiring a rock', 'Looking for something to do', 'Watching the clouds']), Math.floor(e.x + (R() - .5) * 14), Math.floor(e.y + (R() - .5) * 10), 3 + R() * 6, null);
    }
    animal(e) {
      const W = this.world, R = Math.random, r = e.range || 4;
      if (e.kind === 'duck') { for (let k = 0; k < 6; k++) { const tx = e.ax + (R() - .5) * 2 * r, ty = e.ay + (R() - .5) * 2 * r; if (W.tile(Math.floor(tx), Math.floor(ty)) <= 1) { e.path = [[tx - .5, ty - .5]]; e.free = true; break; } } e.wait = 2 + R() * 5; e.activity = 'Paddling about'; return; }
      if (e.kind === 'rabbit') { let tx = e.x + (R() - .5) * 5, ty = e.y + (R() - .5) * 4; if (Math.hypot(tx - e.ax, ty - e.ay) > r) { tx = e.ax; ty = e.ay; } e.goTo(Math.floor(tx), Math.floor(ty), () => { e.wait = .6 + R() * 3; }); e.activity = 'Hopping about'; return; }
      e.goTo(Math.floor(e.ax + (R() - .5) * 2 * r), Math.floor(e.ay + (R() - .5) * 2 * r), () => { e.wait = 2 + R() * 6; });
      e.activity = { chicken: 'Pecking at nothing', sheep: 'Grazing thoughtfully', cat: 'Judging everyone', deer: 'Grazing in the clearing', fox: 'Up to something' }[e.kind] || 'Roaming';
    }
    updateEntity(e, sdt, h) {
      if (e.bubble) { e.bubble.t -= sdt > 0 ? Math.max(sdt, 0.016) : 0.016; if (e.bubble.t <= 0) e.bubble = null; }
      if (e.inside) {
        if (e.insideT != null) { if (sdt > 0) e.insideT -= sdt; if (e.insideT <= 0) { e.inside = false; e.insideT = null; e.insideObj = null; e.wait = .3; const d = e.done; e.done = null; d && d(); } return; }
        if (!(h >= 21.8 || h < 5.4)) { e.inside = false; e.wait = Math.random() * 3; e.say('sun', 2); e.activity = 'Waking up'; } else return;
      }
      if (sdt <= 0) return;
      if (e.path) {
        let step = e.speed * sdt;
        while (step > 0 && e.path && e.path.length) {
          const [nx, ny] = e.path[0], tx = nx + .5, ty = ny + .5, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
          if (Math.abs(dx) > Math.abs(dy) * 1.1) { e.dir = 'side'; e.flip = dx < 0; } else if (d > .01) e.dir = dy < 0 ? 'up' : 'down';
          if (d <= step) { e.x = tx; e.y = ty; e.path.shift(); step -= d; e.walk += d; } else { e.x += dx / d * step; e.y += dy / d * step; e.walk += step; step = 0; }
        }
        if (e.path && !e.path.length) { e.path = null; e.free = false; const cb = e.onArrive; e.onArrive = null; cb && cb(); }
        return;
      }
      if (e.wait > 0) {
        e.wait -= sdt; const R = Math.random, Wp = this.world.particles;
        if (e.chop && R() < sdt * 1.5) { const t = e.chop; Wp.push({ k: 'dust', x: (t.x + .5) * T + (R() - .5) * 6, y: (t.y + 1) * T - 8, vx: (R() - .5) * 20, vy: -10 - R() * 10, life: .5, max: .5, s: 1, c: C.w1 }); }
        if (e.sparks && R() < sdt * 5) for (let i = 0; i < 3; i++) Wp.push({ k: 'spark', x: e.x * T + (e.flip ? -6 : 6), y: e.y * T - 9, vx: (R() - .5) * 30, vy: -10 - R() * 20, life: .4 + R() * .3, max: .7, g: 60 });
        if (e.building && R() < sdt * 2) this.puff(e.x * T + (R() - .5) * 8, e.y * T - 12, 1, C.s300);
        if (e.wait <= 0) { const d = e.done; e.done = null; e.chop = null; e.sparks = false; e.building = null; e.tool = null; d && d(); }
        return;
      }
      if (e.kind === 'villager') { if (this.externalDecisions) { e.wait = .2; return; } this.think(e); } else this.animal(e);
    }
    ambient(dt) {
      const W = this.world, L = this.light.L, cam = this.cam, vw = this.vw / cam.z, vh = this.vh / cam.z, R = Math.random, S = W.season, warm = W.climate === 'warm';
      const storm = this.wk.storm > .5, wet = this.wk.rain > .5 || this.wk.snow > .5, bugs = (warm || S < 2) && !wet;
      if (!this.opts.ambient) { this.flyers.length = 0; return; }
      if (bugs && L < .5 && this.flyers.filter(f => f.k === 'butterfly').length < 8 && R() < dt * 1.5) { const x = cam.x + R() * vw, y = cam.y + R() * vh; if (W.tile(x / T, y / T) >= 3) this.flyers.push({ k: 'butterfly', x, y, v: (R() * 4) | 0, life: 12 + R() * 10, ph: R() * 10, dx: (R() - .5) * 8 }); }
      if (!storm && R() < dt * .12 && this.flyers.filter(f => f.k === 'bird').length < 4) { const n = 1 + (R() * 3 | 0), y0 = cam.y + R() * vh, left = R() < .5; for (let i = 0; i < n; i++) this.flyers.push({ k: 'bird', x: (left ? cam.x - 20 : cam.x + vw + 20) - i * 9 * (left ? 1 : -1), y: y0 + i * 6, vx: (left ? 1 : -1) * (26 + R() * 6), life: 40, ph: R() * 10 }); }
      if (bugs && L > .5 && W.particles.filter(p => p.k === 'fly').length < 40 && R() < dt * 6) { const x = cam.x + R() * vw, y = cam.y + R() * vh, t = W.tile(x / T, y / T); if (t === TID.meadow || t === TID.grass) W.particles.push({ k: 'fly', x, y, vx: 0, vy: 0, life: 6 + R() * 6, max: 12, ph: R() * 10 }); }
      if (R() < dt * .8 && !(S === 3 && !warm)) { const x = cam.x + R() * vw, y = cam.y + R() * vh; if (W.tile(x / T, y / T) <= 1) for (let i = 0; i < 5; i++) W.particles.push({ k: 'drop', x, y, vx: (R() - .5) * 20, vy: -20 - R() * 20, life: .6, max: .6, s: 1, c: C.l200, g: 70 }); }
      if (this.visTrees.length && (S === 2 || S === 0) && !(warm && S === 2) && R() < dt * (S === 2 ? 14 : 6) * (storm ? 2.5 : 1)) {
        const t = this.visTrees[(R() * this.visTrees.length) | 0];
        if (LEAFY(t.id) && (S === 2 || (t._ro && t._ro.v === 3) || t.id === 'elder')) { const bx = (t.x + t.fw / 2) * T + (R() - .5) * 18 * t.fw, by = (t.y + t.fh) * T - 18 - R() * 14 * t.fh; W.particles.push({ k: 'leaf', x: bx, y: by, gy: (t.y + t.fh) * T + R() * 10, vx: 5 + R() * 6 + (storm ? 30 : 0), vy: 7 + R() * 5, life: 5 + R() * 3, max: 8, ph: R() * 10, c: S === 2 ? [C.c400, C.c500, C.sun, C.sun2, C.c600][(R() * 5) | 0] : (R() < .5 ? '#F2B8B0' : C.s50) }); }
      }
      this.flyers.forEach(f => { f.life -= dt; if (f.k === 'butterfly') { f.x += Math.sin(this.t * 1.3 + f.ph) * 10 * dt + f.dx * dt; f.y += Math.cos(this.t * 2.1 + f.ph) * 8 * dt; } else f.x += f.vx * dt; });
      this.flyers = this.flyers.filter(f => f.life > 0 && !(f.k === 'butterfly' && (L > .6 || wet)));
    }
    update(dt) {
      const W = this.world, sdt = dt * this.speed, R = Math.random;
      W.time += sdt * 5;
      if (W.time >= 1440) { W.time -= 1440; W.day++; W.dayInSeason = (W.dayInSeason || 0) + 1; if (W.autoSeason !== false && W.dayInSeason >= (W.seasonLen || 2)) this.setSeason(W.season + 1); W.weatherToday = weatherFor(W, W.day); }
      const h = W.hour; this.light = tintAt(h);
      const wx = this.weather(); for (const k in this.wk) { const tg = (wx === k || (k === 'rain' && wx === 'storm')) ? 1 : 0; this.wk[k] += (tg - this.wk[k]) * Math.min(1, dt * 1.2); }
      W.entities.forEach(e => { if (e.building && e.wait > 0 && !e.path) e.building._w = (e.building._w || 0) + 1; });
      W.entities.forEach(e => this.updateEntity(e, sdt, h));
      const snowy = W.season === 3 && W.climate !== 'warm';
      W.objects.slice().forEach(o => {
        const d = o.def;
        if (o.externallyManaged) { o._w = 0; return; }
        if (o.build < 1) {
          const bld = d.cat === 'building', rate = bld ? ((o.self ? .3 : 0) + (o._w || 0) * .07) / Math.max(1, o.fw * o.fh / 4) : 1.2;
          o.build = Math.min(1, o.build + (bld ? sdt : dt) * rate);
          if (o.self && R() < dt * 10) this.puff((o.x + o.fw / 2) * T, (o.y + o.fh) * T, 1);
          if (o.build >= 1) { W.version++; this.puff((o.x + o.fw / 2) * T, (o.y + o.fh) * T - 6, 18, C.s50); if (d.home) { const n = typeof d.home === 'number' ? d.home : 2; for (let i = 0; i < n; i++) { const dr = W.door(o); const e = W.spawn('villager', dr.x, dr.y, { home: o, job: ['farmer', 'woodcutter', 'fisher', 'merchant', 'kid', 'builder', 'miner'][(R() * 7) | 0] }); e.say('heart', 3); e.activity = 'Moving in'; } } }
        }
        o._w = 0;
        if (d.crop && !o.externallyManaged && o.build >= 1 && !snowy) o.age = Math.min(130, (o.age || 0) + sdt * (W.season === 1 ? 1.1 : W.season === 2 ? .7 : .9));
        if (o.build < 1) return;
        if (d.smoke && R() < dt * (d.smith || d.bakery ? 2.6 : (h > 17 || h < 9 || snowy ? 2.2 : .9))) d.smoke.forEach(s => W.particles.push({ k: 'smoke', x: (o.x + o.fw / 2) * T + s.x, y: (o.y + o.fh) * T + s.y, vx: 3 + R() * 3 + this.wk.storm * 20, vy: -7 - R() * 4, life: 3 + R() * 1.5, max: 4.5, s: 2, c: s.dark ? C.co500 : C.s100 }));
        if (d.fire && R() < dt * 4) W.particles.push({ k: 'spark', x: (o.x + .5) * T + (R() - .5) * 6, y: (o.y + 1) * T - 8, vx: (R() - .5) * 6, vy: -16 - R() * 12, life: .9 + R() * .6, max: 1.5, s: 1 });
        if (d.mist && R() < dt * 18) W.particles.push({ k: 'mist', x: (o.x + o.fw / 2) * T + d.mist.x + (R() - .5) * 36, y: (o.y + o.fh) * T + d.mist.y, vx: (R() - .5) * 8, vy: -4 - R() * 7, life: 1.4 + R(), max: 2.4, s: 2 + (R() * 2 | 0) });
        if (d.splash && R() < dt * 8) d.splash.forEach(s => W.particles.push({ k: 'drop', x: (o.x + o.fw / 2) * T + s.x + (R() - .5) * 8, y: (o.y + o.fh) * T + s.y, vx: (R() - .5) * 16, vy: -12 - R() * 14, life: .5, max: .5, s: 1, c: C.l200, g: 70 }));
      });
      this.ambient(dt);
      W.particles.forEach(p => {
        p.life -= dt;
        if (p.k === 'fly') { p.x += Math.sin(this.t * .9 + p.ph) * 6 * dt; p.y += Math.cos(this.t * 1.3 + p.ph) * 5 * dt; }
        else if (p.k === 'leaf') { if (p.y < p.gy) { p.x += (p.vx + Math.sin(this.t * 2.2 + p.ph) * 9) * dt; p.y += p.vy * dt; } }
        else { p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; if (p.k === 'dust') { p.vx *= .92; p.vy *= .92; } }
      });
      W.particles = W.particles.filter(p => p.life > 0);
      const rN = Math.round(240 * this.wk.rain + 180 * this.wk.storm);
      while (this.rain.length < rN) this.rain.push({ x: R() * (this.vw + 100), y: R() * this.vh, v: 380 + R() * 160 }); this.rain.length = Math.min(this.rain.length, rN);
      this.rain.forEach(r => { r.y += r.v * dt; r.x -= r.v * (.15 + .3 * this.wk.storm) * dt; if (r.y > this.vh) { r.y = -10; r.x = R() * (this.vw + 100); } });
      if (R() < dt * 30 * this.wk.rain) W.particles.push({ k: 'ring', x: this.cam.x + R() * this.vw / this.cam.z, y: this.cam.y + R() * this.vh / this.cam.z, vx: 0, vy: 0, life: .5, max: .5 });
      const sN = Math.round(280 * this.wk.snow);
      while (this.snow.length < sN) this.snow.push({ x: R() * this.vw, y: R() * this.vh, v: 22 + R() * 34, s: R() < .3 ? 2 : 1, ph: R() * 10 }); this.snow.length = Math.min(this.snow.length, sN);
      this.snow.forEach(f => { f.y += f.v * dt; f.x += (Math.sin(this.t * .9 + f.ph) * 14 - 6) * dt; if (f.y > this.vh) { f.y = -4; f.x = R() * this.vw; } if (f.x < -4) f.x += this.vw + 8; });
      if (this.wk.storm > .6 && R() < dt * .08) this.flash = 1; this.flash = Math.max(0, this.flash - dt * 2.2);
      this.fog.forEach(f => { f.x += f.v * dt; if (f.x - f.r > W.w * T) f.x = -f.r; });
      this.clouds.forEach(c => { c.x += dt * (6 + this.wk.storm * 20); if (c.x - c.s * 2 > W.w * T) { c.x = -c.s * 2; c.y = R() * W.h * T; } });
      const k = this.keys, ps = 300 / this.cam.z * dt; if (k) { if (k.a || k.arrowleft) this.cam.x -= ps; if (k.d || k.arrowright) this.cam.x += ps; if (k.w || k.arrowup) this.cam.y -= ps; if (k.s || k.arrowdown) this.cam.y += ps; if (k.a || k.d || k.w || k.s || k.arrowleft || k.arrowright || k.arrowup || k.arrowdown) { this.follow = false; this.clampCam(); } }
      if (this.follow && this.sel && this.sel.kind) { const tx = this.sel.x * T - this.vw / this.cam.z / 2, ty = this.sel.y * T - this.vh / this.cam.z / 2; this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 4); this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 4); this.clampCam(); }
    }
    loop(now) {
      const dt = Math.max(0, Math.min(.05, (now - this.last) / 1000)); this.last = now; this.t += dt;
      if (this.world) { this.update(dt); if (this.world.dirty) this.bakeDirty(); this.render(); }
      this.raf = requestAnimationFrame(this.loop);
    }

    /* ---------- render ---------- */
    shadow(rx, ry) { const k = rx + 'x' + ry; let c = this.shadows.get(k); if (!c) { c = A.mk(rx * 2 + 1, ry * 2 + 1); const g = c.getContext('2d'); g.fillStyle = 'rgba(42,31,22,0.24)'; for (let dy = -ry; dy <= ry; dy++) { const hw = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry))); g.fillRect(rx - hw, ry + dy, hw * 2 + 1, 1); } this.shadows.set(k, c); } return c; }
    drawSpr(ctx, s, fx, fy, flip, clip) {
      fx = Math.round(fx); fy = Math.round(fy);
      if (clip != null && clip < 1) { const hgt = s.c.height, vis = Math.max(1, Math.round(hgt * clip)); ctx.drawImage(s.c, 0, hgt - vis, s.c.width, vis, fx - s.ax, fy - s.ay + hgt - vis, s.c.width, vis); return; }
      if (flip) { ctx.save(); ctx.translate(fx, 0); ctx.scale(-1, 1); ctx.drawImage(s.c, -s.ax, fy - s.ay); ctx.restore(); } else ctx.drawImage(s.c, fx - s.ax, fy - s.ay);
    }
    seasonOpts(o) {
      const W = this.world, warm = W.climate === 'warm', S = warm && W.season === 3 ? 1 : W.season, snowy = W.season === 3 && !warm, d = o.def, sk = S + (snowy ? 's' : '') + (o.opts.v || 0);
      if (o._sk === sk) return o._ro;
      let v = o.opts.v || 0;
      if (d.seasonMap) v = d.seasonMap[S];
      else if (d.id === 'oak') v = S === 0 ? (v === 2 ? 0 : (o.uid % 3 === 0 ? 3 : v)) : S === 1 ? v : S === 2 ? 2 : 4;
      o._sk = sk; o._ro = { v, snow: snowy && d.on !== 'water', flip: o.opts.flip }; return o._ro;
    }
    litFor(o, lit) { return lit && !!o.def.litable && o.build >= 1; }
    objSprite(o, fr, lit) {
      const d = o.def;
      if (d.crop) { const st = o.age >= 95 ? 2 : o.age >= 45 ? 1 : 0; if (o.id === 'wheat' || st < 2) return A.sprite('wheat', { v: st }, o.id === 'wheat' ? fr : 0); return A.sprite(o.id, o.opts, 0); }
      return A.sprite(o.id, this.seasonOpts(o), fr, lit);
    }
    entSprite(e) {
      const moving = !!e.path, f = moving ? (Math.floor(e.walk * 5) % 4) : 0;
      if (e.kind === 'villager') {
        const work = !moving && e.wait > 0 && e.tool, fr = moving ? f : work ? 4 + (Math.floor(this.t * (e.tool === 'rod' ? 1.2 : 2.8) + e.phase) % 2) : 0;
        return A.sprite('villager', { key: e.look.join('') + e.dir + (e.carry || '') + (work ? e.tool : ''), look: e.look, dir: e.dir, carry: e.carry, tool: work ? e.tool : null }, fr);
      }
      const def = A.get(e.kind), fr = def.frames ? (moving ? Math.floor(this.t * 6) % 2 : e.kind === 'deer' ? (Math.floor(this.t * .4 + e.phase) % 3 ? 1 : 0) : (Math.floor(this.t * 1.5 + e.phase) % 3 === 0 ? 1 : 0)) : 0;
      return A.sprite(e.kind, { v: e.v }, fr);
    }
    drawSite(ctx, o, s, fx, fy) {
      const x0 = o.x * T, y0 = o.y * T, w = o.fw * T, h = o.fh * T, rev = o.build < .12 ? 0 : (o.build - .12) / .88;
      ctx.fillStyle = '#C9AE80'; ctx.fillRect(x0 + 2, y0 + 3, w - 4, h - 4);
      ctx.fillStyle = C.w3; ctx.fillRect(x0 + 2, y0 + 2, w - 4, 1); ctx.fillRect(x0 + 2, y0 + h - 2, w - 4, 1); ctx.fillRect(x0 + 2, y0 + 2, 1, h - 4); ctx.fillRect(x0 + w - 3, y0 + 2, 1, h - 4);
      if (rev > 0) this.drawSpr(ctx, s, fx, fy, o.opts.flip, Math.max(.03, rev));
      const H = Math.round((s.c.height - 2) * Math.max(.18, Math.min(1, rev + .08))), top = fy - H, poles = [x0 + 3, x0 + w - 4];
      if (w > 40) poles.push(Math.round(x0 + w / 2));
      ctx.fillStyle = C.w4; poles.forEach(p => ctx.fillRect(p, top, 1, H));
      for (let yy = fy - 7; yy > top + 2; yy -= 10) { ctx.fillStyle = C.w1; ctx.fillRect(x0 + 1, yy, w - 2, 2); ctx.fillStyle = C.w4; ctx.fillRect(x0 + 1, yy + 2, w - 2, 1); }
      ctx.fillStyle = C.w2; ctx.fillRect(x0 - 4, fy - 5, 8, 2); ctx.fillStyle = C.w1; ctx.fillRect(x0 - 3, fy - 7, 7, 2); ctx.fillStyle = C.w4; ctx.fillRect(x0 - 4, fy - 3, 8, 1);
    }
    render() {
      const ctx = this.ctx, W = this.world, z = this.cam.z, Lt = this.light || tintAt(W.hour), L = Lt.L, t = this.t;
      const cx = Math.round(this.cam.x * z) / z, cy = Math.round(this.cam.y * z) / z, snowy = W.season === 3 && W.climate !== 'warm';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#1C736A'; ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
      if (!this.opts.layers || this.opts.layers.terrain !== false) ctx.drawImage(this.terrain, 0, 0);
      const vx0 = Math.max(0, Math.floor(cx / T) - 4), vy0 = Math.max(0, Math.floor(cy / T) - 2), vx1 = Math.min(W.w - 1, Math.ceil((cx + this.vw / z) / T) + 4), vy1 = Math.min(W.h - 1, Math.ceil((cy + this.vh / z) / T) + 8);
      if (!this.opts.layers || this.opts.layers.terrain !== false) { ctx.globalAlpha = .45 + .4 * Math.sin(t * 1.4); ctx.drawImage(this.foam, 0, 0); ctx.globalAlpha = 1; }
      ctx.fillStyle = C.l200;
      for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
        if (W.tiles[ty * W.w + tx] > 1) continue; const h1 = A.hash2(tx, ty), h2 = A.hash2(ty + 7, tx + 3), ph = (t * .5 + h1 * 9) % 3;
        if (ph < 1) { ctx.globalAlpha = Math.sin(ph * Math.PI) * .8; ctx.fillRect(tx * T + Math.floor(h1 * 11) + Math.floor(ph * 3), ty * T + Math.floor(h2 * 14), 3, 1); }
      }
      ctx.globalAlpha = 1;
      if (this.opts.grid) { ctx.fillStyle = 'rgba(42,31,22,.12)'; for (let x = vx0; x <= vx1 + 1; x++) ctx.fillRect(x * T, vy0 * T, 1 / z, (vy1 - vy0 + 1) * T); for (let y = vy0; y <= vy1 + 1; y++) ctx.fillRect(vx0 * T, y * T, (vx1 - vx0 + 1) * T, 1 / z); }
      const lit = L > .3 && !(W.hour >= .5 && W.hour < 4.8), list = [], windy = this.wk.storm > .5 ? 4 : 1; this.visTrees.length = 0;
      if (!this.opts.layers || this.opts.layers.objects !== false) W.objects.forEach(o => {
        if (o.x + o.fw < vx0 || o.x > vx1 || o.y > vy1 || o.y + o.fh < vy0) return;
        if (snowy && (o.def.crop || o.def.winterHide)) return;
        if (o.def.tree) this.visTrees.push(o);
        if (o.def.layer === 'ground') { const s = A.sprite(o.id, this.seasonOpts(o), 0, false); this.drawSpr(ctx, s, (o.x + o.fw / 2) * T, (o.y + o.fh) * T - 4 + Math.round(Math.sin(t + o.phase) * .6), o.opts.flip, o.build); return; }
        list.push({ y: o.y + o.fh, o });
      });
      if (!this.opts.layers || this.opts.layers.people !== false) W.entities.forEach(e => { if (e.inside || e.x < vx0 || e.x > vx1 + 1 || e.y < vy0 || e.y > vy1 + 1) return; list.push({ y: e.sortY != null ? e.sortY : e.y, e }); });
      list.sort((a, b) => a.y - b.y);
      ctx.globalAlpha = 1 - L * .7;
      list.forEach(d => { if (d.o) { const o = d.o, def = o.def; if (def.noShadow || def.on === 'water') return; const [bw] = A.boxOf(def, o.opts); const rx = Math.max(3, Math.min(o.fw * 8, Math.round(bw * .38))), ry = Math.max(2, Math.round(rx * .38)); ctx.drawImage(this.shadow(rx, ry), Math.round((o.x + o.fw / 2) * T - rx + (def.tree ? 2 : 0)), Math.round((o.y + o.fh) * T - ry - 1)); } else { const e = d.e; if (e.kind === 'duck') return; const rx = { sheep: 6, deer: 6, cart: 11, villager: 4, dog: 4 }[e.kind] || 3; ctx.drawImage(this.shadow(rx, 2), Math.round(e.x * T - rx), Math.round(e.y * T - 2)); } });
      ctx.globalAlpha = 1;
      list.forEach(d => {
        if (d.o) {
          const o = d.o, def = o.def, fr = def.frames ? Math.floor(t * (def.fps || 2) * (def.tree ? windy : 1) + o.phase) % def.frames : 0;
          const s = this.objSprite(o, fr, this.litFor(o, lit));
          let fy = (o.y + o.fh) * T; if (def.bob) fy += Math.round(Math.sin(t * 1.5 + o.phase));
          if (o.build < 1 && def.cat === 'building') this.drawSite(ctx, o, s, (o.x + o.fw / 2) * T, fy); else this.drawSpr(ctx, s, (o.x + o.fw / 2) * T, fy, o.opts.flip, o.build);
          if (this.afterObject && o.build >= 1) this.afterObject(ctx, o, s, (o.x + o.fw / 2) * T, fy);
          if (this.sel === o) { ctx.fillStyle = C.sun; const b = A.boxOf(def, o.opts); ctx.globalAlpha = .5 + .3 * Math.sin(t * 5); ctx.fillRect(o.x * T, (o.y + o.fh) * T, o.fw * T, 1); ctx.fillRect(o.x * T, (o.y + o.fh) * T - b[1], 1, b[1]); ctx.fillRect((o.x + o.fw) * T - 1, (o.y + o.fh) * T - b[1], 1, b[1]); ctx.globalAlpha = 1; }
        } else {
          const e = d.e, s = this.entSprite(e); let fy = e.y * T - (e.lift || 0);
          if (e.kind === 'duck') fy += Math.round(Math.sin(t * 2 + e.phase) * .6);
          if ((e.job === 'kid' || e.kind === 'rabbit') && e.path) fy -= Math.abs(Math.sin(e.walk * 6)) > .6 ? 1 : 0;
          if (this.sel === e) { ctx.globalAlpha = .7; ctx.drawImage(this.shadow(6, 2), Math.round(e.x * T - 6), Math.round(e.y * T - 2)); ctx.globalAlpha = 1; }
          this.drawSpr(ctx, s, e.x * T, fy, e.flip && e.dir === 'side' || (e.kind !== 'villager' && e.flip));
        }
      });
      W.particles.forEach(p => {
        if (p.k === 'smoke') { const k = 1 - p.life / p.max, s = Math.round(2 + k * 4); ctx.globalAlpha = (1 - k) * .55; ctx.fillStyle = p.c || C.s100; ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
        else if (p.k === 'mist') { const k = 1 - p.life / p.max; ctx.globalAlpha = (1 - k) * .5; ctx.fillStyle = C.s50; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
        else if (p.k === 'spark') { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.life > .6 ? C.glow2 : C.sun; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
        else if (p.k === 'leaf') { ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), (Math.sin(this.t * 6 + p.ph) > 0 ? 2 : 1), 1); }
        else if (p.k === 'dust' || p.k === 'drop') { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
        else if (p.k === 'ring') { const k = 1 - p.life / p.max, r = Math.round(1 + k * 3); ctx.globalAlpha = (1 - k) * .6; ctx.fillStyle = C.k200; ctx.fillRect(Math.round(p.x - r), Math.round(p.y), r * 2, 1); }
        else if (this.drawParticle) this.drawParticle(ctx, p);
      });
      ctx.globalAlpha = 1;
      this.flyers.forEach(f => { if (f.k === 'butterfly') this.drawSpr(ctx, A.sprite('butterfly', { v: f.v }, Math.floor(t * 8 + f.ph) % 2), f.x, f.y); else { ctx.globalAlpha = .18; ctx.fillStyle = C.ink; ctx.fillRect(Math.round(f.x - 2), Math.round(f.y + 26), 5, 1); ctx.globalAlpha = 1; this.drawSpr(ctx, A.sprite('bird', {}, Math.floor(t * 5 + f.ph) % 2), f.x, f.y, f.vx < 0); } });
      ctx.fillStyle = 'rgba(20,40,30,0.07)';
      if (L < .6 && this.wk.rain < .3 && this.wk.fog < .3) this.clouds.forEach(c => { ctx.beginPath(); ctx.ellipse(c.x, c.y, c.s, c.s * .45, 0, 0, Math.PI * 2); ctx.ellipse(c.x + c.s * .7, c.y + 6, c.s * .7, c.s * .35, 0, 0, Math.PI * 2); ctx.fill(); });
      if (this.wk.fog > .02) { ctx.globalAlpha = this.wk.fog * .6; this.fog.forEach(f => ctx.drawImage(this.fogImg, f.x - f.r, f.y - f.r * .5, f.r * 2, f.r)); ctx.globalAlpha = this.wk.fog * .28; ctx.fillStyle = '#F4F0E8'; ctx.fillRect(cx, cy, this.vw / z, this.vh / z); ctx.globalAlpha = 1; }
      this.drawGhost(ctx);
      // light pass
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply';
      const mul = (c, a) => { if (!c || a < .01) return; ctx.fillStyle = lerpHex('#FFFFFF', c, Math.min(1, a)); ctx.fillRect(0, 0, this.vw, this.vh); };
      if (!Lt.white) { ctx.fillStyle = Lt.c; ctx.fillRect(0, 0, this.vw, this.vh); }
      mul(STINT[W.climate === 'warm' && W.season === 3 ? 1 : W.season], 1 - L);
      mul('#B9C3C9', this.wk.rain * (1 - this.wk.storm)); mul('#8E98A8', this.wk.storm); mul('#E0E6EE', this.wk.snow);
      ctx.globalCompositeOperation = 'lighter';
      const sx = a => (a - cx) * z, sy = a => (a - cy) * z, glow = (x, y, r, a, img) => { if (a <= 0.01) return; const R2 = r * z; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(img || this.glow, sx(x) - R2, sy(y) - R2, R2 * 2, R2 * 2); };
      list.forEach(d => { const o = d.o; if (!o || !o.def.lights || o.build < 1) return; const fx = (o.x + o.fw / 2) * T, fy = (o.y + o.fh) * T; o.def.lights.forEach(l => {
        if (l.mode === 'win' && this.litFor(o, lit)) glow(fx + l.x, fy + l.y, l.r, .55 * L);
        else if (l.mode === 'night' && L > .2) glow(fx + l.x, fy + l.y, l.r, .8 * L);
        else if (l.mode === 'fire') glow(fx + l.x, fy + l.y, l.r * (1 + .06 * Math.sin(t * 13 + o.phase) + .04 * Math.sin(t * 7)), .25 + .75 * L);
        else if (l.mode === 'forge') glow(fx + l.x, fy + l.y, l.r * (1 + .1 * Math.sin(t * 11 + o.phase)), .22 + .6 * L);
        else if (l.mode === 'rune' && L > .3) glow(fx + l.x, fy + l.y, l.r * (.9 + .1 * Math.sin(t * 1.5)), L * (.55 + .3 * Math.sin(t * 1.5 + o.phase)), this.cool);
        else if (l.mode === 'beacon' && L > .2) { glow(fx + l.x, fy + l.y, l.r * (.8 + .2 * Math.sin(t * 2)), L); glow(fx + l.x + Math.cos(t) * 50, fy + l.y + Math.sin(t) * 18, 30, .5 * L); }
      }); });
      W.particles.forEach(p => { if (p.k === 'fly') { const a = (Math.sin(this.t * 3 + p.ph) * .5 + .5) * Math.min(1, p.life) * L; glow(p.x, p.y, 6, a); ctx.globalAlpha = a; ctx.fillStyle = C.glow; ctx.fillRect(Math.round(sx(p.x)), Math.round(sy(p.y)), z, z); } if (p.k === 'spark') glow(p.x, p.y, 4, .4 * (p.life / p.max)); });
      if (this.extraGlow) this.extraGlow(glow, L);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (this.rain.length) { ctx.fillStyle = 'rgba(216,232,242,.5)'; const rw = Math.max(1, Math.round(z * .5)), rh = Math.round(z * 4); this.rain.forEach(r => ctx.fillRect(Math.round(r.x), Math.round(r.y), rw, rh)); }
      if (this.snow.length) { ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = .92; const s1 = Math.max(1, Math.round(z * .6)), s2 = Math.max(2, z); this.snow.forEach(f => { const s = f.s === 2 ? s2 : s1; ctx.fillRect(Math.round(f.x), Math.round(f.y), s, s); }); ctx.globalAlpha = 1; }
      if (this.flash > 0) { ctx.globalAlpha = this.flash * (Math.sin(this.t * 50) > -.3 ? .55 : .25); ctx.fillStyle = '#F4F7FF'; ctx.fillRect(0, 0, this.vw, this.vh); ctx.globalAlpha = 1; }
      ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
      list.forEach(d => { const e = d.e; if (!e || !e.bubble) return; const b = A.bubble(e.bubble.icon); ctx.drawImage(b, Math.round(e.x * T - 7), Math.round(e.y * T - 20 - b.height - (e.lift || 0) + (e.age === 1 ? 3 : 0) + (e.pose === 'sit' || e.pose === 'eat' ? 2 : 0) + Math.sin(t * 3) * .6)); });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const hov = this.hover && this.tool === 'watch' ? this.entityAt(this.hover.ax, this.hover.ay) : null;
      [hov, this.sel && this.sel.kind ? this.sel : null].forEach(e => { if (!e || e.inside) return; ctx.font = '800 12px Nunito, sans-serif'; const tx = e.name, w = ctx.measureText(tx).width + 14, x = Math.round((e.x * T - cx) * z - w / 2), y = Math.round((e.y * T - cy) * z - 20 * z - (e.bubble ? 14 * z : 0) - 6); ctx.fillStyle = 'rgba(42,31,22,.88)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y - 16, w, 20, 10) : ctx.rect(x, y - 16, w, 20); ctx.fill(); ctx.fillStyle = '#FBF6EC'; ctx.fillText(tx, x + 7, y - 2); });
    }
    drawGhost(ctx) {
      const h = this.hover, it = this.item, W = this.world; if (!h) return;
      if ((this.tool === 'build' || this.tool === 'plant') && it) {
        const d = A.get(it.id), x = h.tx - ((d.foot[0] - 1) >> 1), y = h.ty - (d.foot[1] - 1), ok = W.canPlace(it.id, x, y);
        ctx.fillStyle = ok ? 'rgba(77,157,224,.28)' : 'rgba(226,96,77,.32)'; ctx.fillRect(x * T, y * T, d.foot[0] * T, d.foot[1] * T);
        ctx.fillStyle = ok ? C.k400 : C.b400; ctx.fillRect(x * T, y * T, d.foot[0] * T, 1); ctx.fillRect(x * T, (y + d.foot[1]) * T - 1, d.foot[0] * T, 1); ctx.fillRect(x * T, y * T, 1, d.foot[1] * T); ctx.fillRect((x + d.foot[0]) * T - 1, y * T, 1, d.foot[1] * T);
        ctx.globalAlpha = .65; this.drawSpr(ctx, A.sprite(it.id, it.opts, 0, false), (x + d.foot[0] / 2) * T, (y + d.foot[1]) * T); ctx.globalAlpha = 1;
      } else if (this.tool === 'terrain' || this.tool === 'people' || this.tool === 'erase') {
        ctx.fillStyle = this.tool === 'erase' ? C.b400 : C.k400; const x = h.tx * T, y = h.ty * T;
        ctx.globalAlpha = .9; ctx.fillRect(x, y, T, 1); ctx.fillRect(x, y + T - 1, T, 1); ctx.fillRect(x, y, 1, T); ctx.fillRect(x + T - 1, y, 1, T); ctx.globalAlpha = .18; ctx.fillRect(x, y, T, T); ctx.globalAlpha = 1;
      }
    }

    /* ---------- status for UI ---------- */
    status() {
      const W = this.world; if (!W) return null; const h = W.hour, vill = W.entities.filter(e => e.kind === 'villager');
      return { clock: pad(Math.floor(h)) + ':' + pad(Math.floor(W.time % 60)), phase: phaseOf(h), day: W.day, pop: vill.length, asleep: vill.filter(e => e.inside).length, night: (this.light || {}).L > .5, season: W.season, seasonName: SEASONS[W.season], weather: this.weather(), weatherMode: this.opts.weather, era: W.era, eras: W.eras || null, name: W.name, sel: this.selInfo(), stock: Object.assign({}, W.stock) };
    }
    selInfo() {
      const s = this.sel, W = this.world; if (!s) return null;
      if (s.kind) {
        if (!W.entities.includes(s)) { this.sel = null; return null; }
        if (s.kind === 'villager') { s.portrait = s.portrait || A.thumb('villager', { key: s.look.join('') + 'down', look: s.look, dir: 'down' }, 6); return { type: 'villager', uid: s.uid, title: s.name, eyebrow: JOB[s.job] || 'Villager', activity: s.inside ? (s.insideT != null ? s.activity : 'Asleep') : s.activity, home: s.home ? 'Lives in the ' + s.home.def.name.toLowerCase() + ' #' + s.home.uid : 'No fixed address', portrait: s.portrait, follow: this.follow }; }
        return { type: 'animal', uid: s.uid, title: s.name, eyebrow: A.get(s.kind).name, activity: s.activity, home: 'Roams near ' + Math.round(s.ax) + ', ' + Math.round(s.ay), portrait: A.thumb(s.kind, { v: s.v }, 6), follow: this.follow };
      }
      if (!W.objects.includes(s)) { this.sel = null; return null; }
      const res = s.residents.filter(e => W.entities.includes(e)).map(e => e.name), inside = W.entities.filter(e => e.inside && e.insideObj === s).length;
      let activity = s.def.desc || '', home = s.def.home ? (res.length ? 'Home to ' + res.slice(0, 3).join(', ') + (res.length > 3 ? ' and ' + (res.length - 3) + ' more' : '') : 'Empty, for now') : 'Tile ' + s.x + ', ' + s.y + ' · ' + s.fw + '×' + s.fh;
      if (s.def.store) activity = 'Holding ' + W.stock.wheat + ' wheat, ' + W.stock.fish + ' fish, ' + W.stock.wood + ' wood, ' + (W.stock.stone || 0) + ' stone.';
      if (inside) home = inside + (inside === 1 ? ' villager' : ' villagers') + ' inside right now';
      if (s.build < 1 && s.def.cat === 'building') { const b = W.entities.filter(e => e.building === s).length; activity = 'Under construction · ' + Math.floor(s.build * 100) + '%'; home = b ? b + (b === 1 ? ' builder' : ' builders') + ' on site' : (s.self ? 'Going up on its own' : 'Waiting for builders'); }
      return { type: 'object', uid: s.uid, title: s.def.name + (s.def.home ? ' #' + s.uid : ''), eyebrow: s.def.cat === 'building' ? 'Building' : s.def.cat, activity, home, portrait: A.thumb(s.id, s.def.crop ? s.opts : this.seasonOpts(s), s.fw > 2 ? 1 : s.fw > 1 ? 2 : 3), follow: false };
    }
  }

  window.LW.World = World; window.LW.Entity = Entity; window.LW.Game = Game; window.LW.PRESETS = PRESETS; window.LW.createWorld = createWorld; window.LW.registerPreset = registerPreset; window.LW.SEASONS = SEASONS;
  window.LW.gen = { forTiles, setRaw, scatter, field, village, populate, critters, nearestOf, placeNear, findSpot, link }; window.LW.ready = true;
})();
