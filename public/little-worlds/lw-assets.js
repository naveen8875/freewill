/* Little Worlds — asset pack.
   Every asset is a pure draw function on a tiny pixel canvas (1 unit = 1 art pixel, 16 px per tile).
   Sprites are cached per (id, variant, frame, lit) and auto-outlined.
   API: LW.Assets.get(id) · sprite(id, opts, frame, lit) · thumb(id, opts, scale) · list() · swatch(terrain) */
(function () {
  'use strict';
  const C = {
    ink: '#2A1F16', ink2: '#3F3024', co700: '#5A463A', co600: '#7A6657', co500: '#9B8775', co400: '#B7A799', co300: '#CFC2B5', co200: '#E3D9CC',
    s50: '#FBF6EC', s100: '#F5ECD8', s200: '#ECDDBE', s300: '#DCC79A', s400: '#C2A877',
    c300: '#F0A077', c400: '#E18259', c500: '#C96B43', c600: '#A4502E', c700: '#7A3A1F',
    l200: '#B6E0DA', l300: '#7CC8BE', l400: '#3DA89B', l500: '#248A7E', l600: '#186A60',
    p200: '#C8E2A8', p300: '#9CCB76', p400: '#6FAD4E', p500: '#4F8E36', p600: '#386824', p700: '#244616',
    k200: '#BFDDF7', k300: '#88BFEF', k400: '#4D9DE0', k500: '#2F7FC7', k600: '#1F5E9A', k700: '#143F69',
    sun: '#F5C24A', sun2: '#E0A52A', b400: '#E2604D', b500: '#C04030',
    w1: '#C8925A', w2: '#A8703F', w3: '#7A4E2A', w4: '#5A3A1E',
    glow: '#FFD978', glow2: '#FFF1C2', glass: '#2F5F63'
  };
  const T = 16;

  /* ---------- helpers ---------- */
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function R(g, x, y, w, h, c) { if (w <= 0 || h <= 0) return; g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function P(g, x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function disc(g, cx, cy, r, c) { g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const hw = Math.round(Math.sqrt(r * r - dy * dy)); g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); } }
  function oval(g, cx, cy, rx, ry, c) { g.fillStyle = c; for (let dy = -ry; dy <= ry; dy++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)))); g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); } }
  function line(g, x0, y0, x1, y1, c, th) {
    th = th || 1; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; g.fillStyle = c;
    for (;;) { g.fillRect(x0, y0, th, th); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const RGB = new Map();
  function rgb(hex) { let v = RGB.get(hex); if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(hex, v); } return v; }
  function shade(hex, f) { const [r, g, b] = rgb(hex); const m = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join(''); }
  function outline(c, color) {
    const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), a = d.data, out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (a[i * 4 + 3] >= 128) continue;
      if ((x > 0 && a[(i - 1) * 4 + 3] >= 128) || (x < w - 1 && a[(i + 1) * 4 + 3] >= 128) || (y > 0 && a[(i - w) * 4 + 3] >= 128) || (y < h - 1 && a[(i + w) * 4 + 3] >= 128)) out[i] = 1;
    }
    const [r, gg, b] = rgb(color);
    for (let i = 0; i < w * h; i++) if (out[i]) { a[i * 4] = r; a[i * 4 + 1] = gg; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  function snowCap(c) {
    const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), a = d.data, S = [[255, 255, 255], [238, 244, 249], [212, 225, 235]];
    for (let x = 0; x < w; x++) { let run = -1; for (let y = 0; y < h; y++) { const i = (y * w + x) * 4; if (a[i + 3] < 128) { run = -1; continue; } run++; if (run < 3 && !(run === 2 && (x * 7 + y) % 3)) { const s = S[run]; a[i] = s[0]; a[i + 1] = s[1]; a[i + 2] = s[2]; } } }
    g.putImageData(d, 0, 0);
  }
  function roof(g, cx, y0, h, wT, wB, r) {
    for (let i = 0; i < h; i++) {
      const w = Math.round(wT + (wB - wT) * i / Math.max(1, h - 1)), x0 = Math.round(cx - w / 2), band = Math.floor(i / 3);
      for (let x = x0; x < x0 + w; x++) {
        let c = r[1];
        if (i % 3 === 2) c = r[2]; else if (((x + band * 2) % 5) === 0) c = r[2];
        if (i < 2) c = r[0]; else if (x < x0 + 2 && i % 3 !== 2) c = r[0];
        if (x >= x0 + w - 2 && i >= 2) c = r[2];
        if (i >= h - 2) c = i === h - 1 ? r[3] : r[2];
        g.fillStyle = c; g.fillRect(x, y0 + i, 1, 1);
      }
    }
  }
  function win(g, x, y, lit, tall) {
    const h = tall ? 7 : 5;
    R(g, x, y, 5, h, C.w3); R(g, x + 1, y + 1, 3, h - 2, lit ? C.glow : C.glass);
    P(g, x + 1, y + 1, lit ? C.glow2 : C.l300);
    if (tall) R(g, x + 1, y + 3, 3, 1, C.w3);
    R(g, x - 1, y, 1, h, C.l500); R(g, x + 5, y, 1, h, C.l500);
    R(g, x, y + h + 1, 5, 1, C.w3);
    P(g, x, y + h, C.b400); P(g, x + 1, y + h, C.p500); P(g, x + 2, y + h, C.sun); P(g, x + 3, y + h, C.p500); P(g, x + 4, y + h, C.b400);
  }
  function grid(g, rows, map, ox, oy) { rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch !== '.' && map[ch]) P(g, (ox || 0) + x, (oy || 0) + y, map[ch]); } }); }

  const ROOFS = [[C.c400, C.c500, C.c600, C.c700], [C.l300, C.l400, C.l500, C.l600], [C.sun, C.sun2, '#B98227', '#8A5E1A'], [C.k300, C.k400, C.k500, C.k600]];
  const WALLS = [[C.s50, C.s100, C.s300], [C.s100, C.s200, C.s300], ['#F7E1CF', '#EFCDB6', '#D9A98C'], [C.s50, C.s100, C.s300]];
  const LEAVES = [[C.p300, C.p400, C.p500, C.p600], [C.p300, C.p400, C.p500, C.p600], [C.sun, C.c400, C.c500, C.c600], ['#FBE4E0', '#F2B8B0', '#E08F8A', '#B86A6A']];
  const SKIN = ['#F3D0AE', '#E0AC82', '#C48A60', '#9A6544', '#6E4630'];
  const HAIR = [C.ink2, C.w4, C.c600, C.sun2, C.co300, C.c700];
  const SHIRT = [C.c500, C.l500, C.p500, C.k500, C.sun, C.b400, C.s50, C.co600];
  const PANTS = [C.w3, C.k600, C.co700, C.p600, C.c700];

  /* ---------- registry ---------- */
  const DEFS = {}, ORDER = [];
  function def(id, d) { d.id = id; d.foot = d.foot || [1, 1]; d.variants = d.variants || 1; DEFS[id] = d; ORDER.push(id); }
  const CACHE = new Map();
  function boxOf(d, o) { const b = typeof d.box === 'function' ? d.box(o) : d.box; return [b[0], b[1], b[2] != null ? b[2] : (b[0] >> 1), b[3] != null ? b[3] : b[1] - 1]; }
  function sprite(id, o, frame, lit) {
    const d = DEFS[id]; o = o || {}; frame = frame || 0;
    const base = id + '|' + (o.key != null ? o.key : (o.v || 0)), snow = !!o.snow && d.outline !== false;
    const key = base + '|' + frame + '|' + (lit ? 1 : 0) + (snow ? '|s' : '') + (o.decay ? '|d' + o.decay : '');
    let s = CACHE.get(key); if (s) return s;
    const [w, h, ax, ay] = boxOf(d, o);
    const c = mk(w + 2, h + 2), g = c.getContext('2d'); g.translate(1, 1);
    d.draw(g, Object.assign({}, o, { v: o.v || 0, frame, lit: !!lit, rnd: rng(hashStr(base)) }), w, h);
    if (snow) snowCap(c);
    if (o.decay && window.LW.Assets.decayFx) window.LW.Assets.decayFx(c, o.decay, base);
    if (d.outline !== false) outline(c, d.outlineColor || C.ink);
    s = { c, ax: ax + 1, ay: ay + 1 }; CACHE.set(key, s); return s;
  }
  const TH = new Map();
  function toURL(c) { const b64 = c.toDataURL().split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([u], { type: 'image/png' })); }
  function thumb(id, o, scale, frame) {
    o = o || {}; const tk = id + '|' + (o.key != null ? o.key : (o.v || 0)) + '|' + (scale || 3) + '|' + (frame || 0) + (o.snow ? 's' : '') + (o.decay ? 'd' + o.decay : ''); if (TH.has(tk)) return TH.get(tk);
    const u = thumbCanvas(id, o, scale, frame); TH.set(tk, u); return u;
  }
  function thumbCanvas(id, o, scale, frame) {
    const s = sprite(id, o, frame || 0, false); scale = scale || 3;
    const c = mk(s.c.width * scale, s.c.height * scale), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(s.c, 0, 0, c.width, c.height); return toURL(c);
  }

  /* ---------- buildings ---------- */
  def('cottage', {
    name: 'Cottage', cat: 'building', foot: [2, 2], box: [34, 42], solid: true, variants: 4, litable: true, home: 2,
    desc: 'Two residents, one opinion about the neighbors.',
    lights: [{ x: -9, y: -10, r: 22, mode: 'win' }, { x: 10, y: -10, r: 22, mode: 'win' }], smoke: [{ x: 8, y: -41 }],
    draw(g, o) {
      const r = ROOFS[o.v % 4], wl = WALLS[o.v % 4];
      R(g, 3, 24, 28, 17, wl[0]); R(g, 3, 24, 1, 17, wl[1]); R(g, 30, 24, 1, 17, wl[1]); R(g, 3, 24, 28, 2, wl[2]); R(g, 3, 38, 28, 3, wl[2]);
      R(g, 13, 29, 8, 12, C.w3); R(g, 14, 30, 6, 11, C.l500); R(g, 15, 31, 4, 10, C.l400); R(g, 17, 31, 1, 10, C.l500); P(g, 19, 35, C.sun); R(g, 12, 40, 10, 1, C.co400);
      win(g, 5, 28, o.lit); win(g, 24, 28, o.lit);
      roof(g, 17, 3, 23, 20, 34, r);
      R(g, 23, 1, 5, 9, C.co400); R(g, 23, 1, 5, 1, C.co500); R(g, 24, 1, 3, 1, C.ink2); R(g, 27, 2, 1, 8, C.co500);
    }
  });
  def('hall', {
    name: 'Town Hall', cat: 'building', foot: [4, 3], box: [68, 70], solid: true, variants: 2, litable: true, frames: 2, fps: 2,
    desc: 'Where the village argues about fences.',
    lights: [{ x: -20, y: -16, r: 24, mode: 'win' }, { x: 21, y: -16, r: 24, mode: 'win' }, { x: 0, y: -10, r: 26, mode: 'win' }],
    draw(g, o) {
      const r = ROOFS[o.v ? 1 : 0], wl = WALLS[0];
      R(g, 4, 44, 60, 26, wl[0]); R(g, 4, 44, 60, 2, wl[2]); R(g, 4, 66, 60, 4, wl[2]);
      [4, 22, 44, 62].forEach(x => { R(g, x, 46, 2, 20, wl[1]); });
      R(g, 28, 50, 12, 20, C.w3); R(g, 29, 51, 10, 19, C.w2); R(g, 34, 51, 1, 19, C.w3); R(g, 30, 49, 8, 1, C.w3); P(g, 32, 60, C.sun); P(g, 36, 60, C.sun);
      R(g, 26, 68, 16, 2, C.co300);
      win(g, 9, 49, o.lit, true); win(g, 16, 49, o.lit, true); win(g, 47, 49, o.lit, true); win(g, 54, 49, o.lit, true);
      roof(g, 34, 14, 32, 46, 68, r);
      R(g, 28, 5, 12, 13, wl[0]); R(g, 28, 5, 12, 1, wl[2]); R(g, 31, 8, 6, 6, C.ink2); disc(g, 34, 11, 2, C.sun); R(g, 28, 16, 12, 2, wl[2]);
      roof(g, 34, 0, 6, 4, 16, r);
      R(g, 56, 2, 1, 14, C.w4);
      if (o.frame) { R(g, 57, 2, 6, 2, C.b400); R(g, 57, 4, 5, 2, C.b500); } else { R(g, 57, 2, 5, 2, C.b400); R(g, 57, 4, 6, 2, C.b500); }
    }
  });
  def('storehouse', {
    name: 'Storehouse', cat: 'building', foot: [2, 2], box: [34, 38], solid: true, store: true,
    desc: 'Where the harvest goes to be counted twice.',
    draw(g) {
      R(g, 3, 20, 28, 18, C.w2); for (let x = 6; x < 31; x += 4) R(g, x, 20, 1, 18, C.w3); R(g, 3, 35, 28, 3, C.w3);
      R(g, 11, 24, 12, 14, C.w4); R(g, 12, 25, 10, 13, C.w1); line(g, 12, 25, 21, 37, C.w3); line(g, 21, 25, 12, 37, C.w3); R(g, 12, 25, 10, 1, C.w3);
      roof(g, 17, 3, 20, 22, 34, ROOFS[2]);
      oval(g, 30, 34, 3, 3, C.s200); P(g, 30, 31, C.s400); oval(g, 4, 35, 2, 2, C.s200);
    }
  });
  def('windmill', {
    name: 'Windmill', cat: 'building', foot: [2, 2], box: [48, 72, 24, 71], solid: true, frames: 8, fps: 5, litable: true,
    desc: 'Grinds wheat into flour and gossip.',
    lights: [{ x: 0, y: -26, r: 18, mode: 'win' }],
    draw(g, o) {
      for (let i = 0; i < 42; i++) { const y = 30 + i, w = Math.round(16 + i * 10 / 41), x0 = Math.round(24 - w / 2); R(g, x0, y, w, 1, C.s50); R(g, x0 + w - 3, y, 3, 1, C.s200); P(g, x0, y, C.s100); }
      for (let k = 0; k < 18; k++) { const x = 18 + Math.floor(o.rnd() * 12), y = 34 + Math.floor(o.rnd() * 34); R(g, x, y, 2, 1, C.co200); }
      R(g, 20, 61, 8, 11, C.w3); R(g, 21, 62, 6, 10, C.l500); R(g, 24, 62, 1, 10, C.l600);
      R(g, 22, 44, 4, 5, C.w3); R(g, 23, 45, 2, 3, o.lit ? C.glow : C.glass);
      roof(g, 24, 18, 15, 4, 24, ROOFS[0]);
      const cx = 24, cy = 22, a0 = o.frame * (Math.PI / 2) / 8;
      for (let b = 0; b < 4; b++) {
        const a = a0 + b * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), pc = Math.cos(a + Math.PI / 2), ps = Math.sin(a + Math.PI / 2);
        for (let s = 3; s <= 22; s += 0.5) {
          const px = cx + ca * s, py = cy + sa * s; P(g, px, py, C.w3);
          if (s >= 7) for (let k = 1; k <= 4; k += 0.5) P(g, px + pc * k, py + ps * k, (Math.round(s) % 4 === 0 || k === 4) ? C.s300 : C.s50);
        }
      }
      disc(g, cx, cy, 2, C.w4); P(g, cx, cy, C.w1);
    }
  });
  def('well', {
    name: 'Well', cat: 'building', foot: [1, 1], box: [18, 24], solid: true, plazaOk: true, well: true,
    desc: 'The real town hall.',
    draw(g) {
      R(g, 2, 6, 2, 13, C.w3); R(g, 14, 6, 2, 13, C.w3); R(g, 2, 7, 14, 1, C.w4);
      R(g, 9, 8, 1, 6, C.s300); R(g, 8, 13, 3, 3, C.w2); P(g, 8, 13, C.w1);
      oval(g, 9, 18, 8, 3, C.co300); oval(g, 9, 18, 6, 2, '#1E4F4A'); P(g, 7, 18, C.l300);
      R(g, 1, 19, 17, 4, C.co400); [3, 7, 11, 15].forEach(x => P(g, x, 20, C.co500)); [5, 9, 13].forEach(x => P(g, x, 22, C.co500));
      roof(g, 9, 1, 6, 6, 18, ROOFS[0]);
    }
  });
  def('stall', {
    name: 'Market Stall', cat: 'building', foot: [2, 1], box: [34, 30], solid: true, variants: 4, plazaOk: true, stall: true,
    desc: 'Mostly fruit. Sometimes rumors.',
    draw(g, o) {
      const A = [C.c500, C.l500, C.sun2, C.b400][o.v % 4];
      R(g, 2, 9, 2, 20, C.w3); R(g, 30, 9, 2, 20, C.w3);
      R(g, 1, 19, 32, 11, C.w2); R(g, 1, 19, 32, 2, C.w1); R(g, 1, 24, 32, 1, C.w3); R(g, 1, 28, 32, 2, C.w3);
      const goods = [C.b400, C.sun, C.p400, C.c400, C.s50, C.l300];
      for (let i = 0; i < 9; i++) { const x = 3 + i * 3, col = goods[Math.floor(o.rnd() * goods.length)]; R(g, x, 17, 2, 2, col); if (o.rnd() > .4) P(g, x + (i % 2), 16, col); }
      for (let i = 0; i < 10; i++) { const w = 30 + Math.round(i * 4 / 9), x0 = Math.round(17 - w / 2); for (let x = x0; x < x0 + w; x++) P(g, x, 2 + i, (Math.floor((x - x0) / 4) % 2) ? C.s50 : (i < 2 ? shade(A, 1.15) : A)); }
      for (let x = 0; x < 34; x++) if (Math.floor(x / 4) % 2 === 0) P(g, x, 12, A);
    }
  });
  def('tent', {
    name: 'Nomad Tent', cat: 'building', foot: [2, 2], box: [34, 30], solid: true, variants: 4, home: 2, frames: 2, fps: 2,
    desc: 'Portable home. Not portable in practice.',
    lights: [{ x: 0, y: -4, r: 18, mode: 'win' }], litable: true,
    draw(g, o) {
      const A = [C.c500, C.l500, C.sun2, C.k500][o.v % 4];
      for (let i = 0; i < 22; i++) { const y = 7 + i, w = Math.round(4 + i * 1.38), x0 = Math.round(17 - w / 2); for (let x = x0; x < x0 + w; x++) { let c = (Math.floor((x - 17 + 40) / 5) % 2) ? C.s100 : A; if (i > 19) c = shade(c, .82); P(g, x, y, c); } }
      for (let i = 0; i < 10; i++) { const hw = Math.floor(i / 2) + 1; R(g, 17 - hw, 19 + i, hw * 2, 1, o.lit ? (i > 6 ? C.glow : C.c400) : C.ink2); }
      R(g, 16, 1, 2, 7, C.w3); if (o.frame) R(g, 18, 1, 5, 3, C.b400); else { R(g, 18, 1, 4, 3, C.b400); P(g, 22, 2, C.b400); }
    }
  });
  def('lighthouse', {
    name: 'Lighthouse', cat: 'building', foot: [2, 2], box: [30, 80, 15, 79], solid: true, litable: true,
    desc: 'Keeps the boats honest.',
    lights: [{ x: 0, y: -66, r: 90, mode: 'beacon' }],
    draw(g, o) {
      R(g, 2, 70, 26, 10, C.co400); R(g, 2, 70, 26, 2, C.co300); [5, 11, 17, 23].forEach(x => P(g, x, 75, C.co500));
      for (let i = 0; i < 48; i++) { const y = 22 + i, w = Math.round(12 + i * 8 / 47), x0 = Math.round(15 - w / 2), band = Math.floor(i / 8) % 2; R(g, x0, y, w, 1, band ? C.b400 : C.s50); R(g, x0 + w - 2, y, 2, 1, band ? C.b500 : C.s200); }
      R(g, 12, 62, 6, 8, C.l500); R(g, 13, 63, 4, 7, C.l400);
      R(g, 6, 18, 18, 4, C.co700); R(g, 6, 17, 18, 1, C.co600);
      R(g, 9, 9, 12, 9, o.lit ? C.glow : C.l300); if (o.lit) R(g, 11, 11, 8, 5, C.glow2); R(g, 12, 9, 1, 9, C.co700); R(g, 17, 9, 1, 9, C.co700);
      for (let i = 0; i < 9; i++) { const w = Math.round(2 + i * 1.6); R(g, 15 - w / 2, 1 + i, w, 1, C.b500); }
      P(g, 15, 0, C.co700);
    }
  });
  def('statue', {
    name: 'Founder Statue', cat: 'building', foot: [1, 1], box: [16, 30], solid: true, plazaOk: true,
    desc: 'Nobody remembers who. Everyone has a theory.',
    draw(g) {
      R(g, 2, 21, 12, 9, C.co300); R(g, 1, 20, 14, 2, C.co200); R(g, 2, 28, 12, 2, C.co400); R(g, 5, 24, 6, 3, C.sun2);
      R(g, 6, 15, 2, 5, C.co200); R(g, 9, 15, 2, 5, C.co200); R(g, 5, 9, 7, 7, C.co200); R(g, 10, 9, 2, 7, C.co300);
      disc(g, 8, 6, 3, C.co200); R(g, 11, 3, 2, 7, C.co200); P(g, 11, 2, C.sun); P(g, 12, 1, C.sun);
      P(g, 5, 14, C.p500); P(g, 6, 15, C.p500); P(g, 3, 21, C.p500);
    }
  });
  def('lamp', {
    name: 'Lamp Post', cat: 'prop', foot: [1, 1], box: [8, 22], solid: true, litable: true, plazaOk: true,
    lights: [{ x: 0, y: -16, r: 34, mode: 'night' }],
    draw(g, o) { R(g, 3, 6, 2, 15, C.co700); R(g, 2, 19, 4, 2, C.co700); R(g, 2, 1, 4, 1, C.co700); R(g, 1, 2, 6, 5, o.lit ? C.glow : C.s200); if (o.lit) R(g, 3, 3, 2, 3, C.glow2); R(g, 1, 7, 6, 1, C.co700); }
  });
  def('campfire', {
    name: 'Campfire', cat: 'prop', foot: [1, 1], box: [16, 15, 8, 13], solid: true, frames: 4, fps: 7, plazaOk: true, fire: true,
    desc: 'Evening headquarters.',
    lights: [{ x: 0, y: -5, r: 58, mode: 'fire' }],
    draw(g, o) {
      line(g, 3, 13, 12, 10, C.w3, 2); line(g, 3, 10, 12, 13, C.w3, 2);
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; R(g, 8 + Math.cos(a) * 6.5 - 1, 11.5 + Math.sin(a) * 2.6 - 1, 2, 2, k % 2 ? C.co400 : C.co500); }
      const H = [[5, 8, 6], [6, 7, 8], [8, 6, 5], [7, 9, 6]][o.frame % 4];
      for (let k = 0; k < 3; k++) { const x = 5 + k * 2, h = H[k]; R(g, x, 11 - h, 2, h, C.c400); R(g, x, 13 - h, 2, h - 3, C.sun); P(g, x + ((o.frame + k) % 2), 10 - h, C.sun); }
      R(g, 7, 8, 2, 3, C.glow2);
    }
  });
  def('fence', {
    name: 'Fence', cat: 'prop', foot: [1, 1], box: [16, 14], solid: true, variants: 2,
    draw(g, o) {
      if (o.v === 1) { R(g, 5, 0, 1, 13, C.w2); R(g, 10, 0, 1, 13, C.w2); R(g, 6, 3, 4, 10, C.w3); R(g, 6, 3, 4, 1, C.w1); }
      else { R(g, 1, 3, 2, 11, C.w3); R(g, 13, 3, 2, 11, C.w3); R(g, 0, 5, 16, 2, C.w2); R(g, 0, 9, 16, 2, C.w2); R(g, 0, 5, 16, 1, C.w1); R(g, 1, 3, 2, 1, C.w1); R(g, 13, 3, 2, 1, C.w1); }
    }
  });
  def('boat', {
    name: 'Fishing Boat', cat: 'prop', foot: [2, 1], box: [32, 26, 16, 23], on: 'water', variants: 4, bob: true,
    desc: 'Leaves at dawn, returns with stories.',
    draw(g, o) {
      const S = [C.s50, C.c300, C.l300, C.sun][o.v % 4];
      R(g, 15, 1, 2, 18, C.w4);
      for (let i = 0; i < 15; i++) R(g, 17, 3 + i, Math.round(1 + i * 0.75), 1, i % 5 === 4 ? shade(S, .88) : S);
      for (let i = 0; i < 10; i++) { const w = Math.round(i * 0.6); R(g, 15 - w, 8 + i, w, 1, S); }
      for (let i = 0; i < 6; i++) { const w = Math.round(28 - i * 2.4); R(g, 16 - w / 2, 18 + i, w, 1, i === 0 ? C.w1 : (i > 3 ? C.w3 : C.w2)); }
      R(g, 8, 20, 16, 1, C.c500);
    }
  });
  def('haystack', { name: 'Haystack', cat: 'prop', foot: [1, 1], box: [16, 14], solid: true, draw(g) { oval(g, 8, 9, 7, 4, C.sun2); oval(g, 8, 7, 5, 3, C.sun); for (let x = 3; x < 14; x += 3) P(g, x, 10, '#B98227'); P(g, 6, 5, C.glow2); } });
  def('barrel', { name: 'Barrel', cat: 'prop', foot: [1, 1], box: [10, 13], solid: true, draw(g) { R(g, 1, 2, 8, 11, C.w2); R(g, 0, 4, 10, 7, C.w2); R(g, 0, 4, 10, 1, C.co600); R(g, 0, 10, 10, 1, C.co600); oval(g, 5, 2, 4, 1, C.w1); R(g, 7, 3, 1, 9, C.w3); } });
  def('crate', { name: 'Crate', cat: 'prop', foot: [1, 1], box: [12, 12], solid: true, draw(g) { R(g, 0, 2, 12, 10, C.w1); R(g, 0, 0, 12, 3, C.s300); line(g, 1, 3, 10, 11, C.w2); line(g, 10, 3, 1, 11, C.w2); R(g, 0, 2, 12, 1, C.w2); } });

  /* ---------- nature ---------- */
  def('oak', {
    name: 'Oak', cat: 'nature', foot: [1, 1], box: [32, 40], solid: true, tree: true, variants: 5, frames: 2, fps: 0.8,
    varNames: ['Summer', 'Fruit', 'Autumn', 'Blossom', 'Bare'],
    draw(g, o) {
      if (o.v === 4) {
        R(g, 14, 26, 4, 13, C.w3); R(g, 14, 26, 1, 13, C.w2); R(g, 12, 38, 2, 1, C.w3); R(g, 18, 38, 2, 1, C.w3);
        line(g, 15, 27, 15, 8, C.w3, 2); line(g, 16, 21, 7, 12, C.w3, 2); line(g, 16, 18, 25, 10, C.w3, 2); line(g, 15, 13, 11, 4, C.w3); line(g, 16, 12, 22, 3, C.w3);
        line(g, 9, 14, 4, 10, C.w3); line(g, 23, 11, 28, 8, C.w3); line(g, 12, 6, 10, 2, C.w3); line(g, 20, 5, 21, 1, C.w3); line(g, 7, 12, 6, 6, C.w3); line(g, 25, 10, 27, 4, C.w3); line(g, 16, 9, 17, 2, C.w3);
        return;
      }
      const L = LEAVES[o.v % 4], d = o.frame ? 1 : 0;
      R(g, 14, 26, 4, 13, C.w3); R(g, 14, 26, 1, 13, C.w2); R(g, 12, 38, 2, 1, C.w3); R(g, 18, 38, 2, 1, C.w3);
      disc(g, 16 + d, 17, 12, L[3]); disc(g, 9 + d, 21, 7, L[3]); disc(g, 23 + d, 21, 7, L[3]);
      disc(g, 16 + d, 14, 11, L[2]); disc(g, 9 + d, 18, 6, L[2]); disc(g, 23 + d, 18, 6, L[2]);
      disc(g, 13 + d, 11, 7, L[1]); disc(g, 8 + d, 16, 3, L[1]); disc(g, 21 + d, 12, 4, L[1]); disc(g, 11 + d, 9, 3, L[0]);
      for (let k = 0; k < 26; k++) { const a = o.rnd() * Math.PI * 2, rr = o.rnd() * 10; P(g, 16 + d + Math.cos(a) * rr, 15 + Math.sin(a) * rr * .8, o.rnd() > .5 ? L[1] : L[3]); }
      if (o.v === 1) for (let k = 0; k < 9; k++) { const x = 6 + Math.floor(o.rnd() * 20) + d, y = 8 + Math.floor(o.rnd() * 16); P(g, x, y, C.b400); P(g, x, y - 1, C.c300); }
      if (o.v === 3) for (let k = 0; k < 10; k++) P(g, 6 + Math.floor(o.rnd() * 20) + d, 6 + Math.floor(o.rnd() * 18), C.s50);
    }
  });
  function tier(g, cx, y0, h, wT, wB, L, top) {
    for (let i = 0; i < h; i++) {
      const w = Math.round(wT + (wB - wT) * i / Math.max(1, h - 1)), x0 = Math.round(cx - w / 2);
      for (let x = x0; x < x0 + w; x++) { let c = x < cx - 1 ? L[1] : L[2]; if (i === h - 1) { if (x % 3 === 0) continue; c = L[3]; } else if (i === h - 2 && x % 2) c = L[3]; if (top && i < 2) c = L[0]; P(g, x, y0 + i, c); }
    }
  }
  def('pine', {
    name: 'Pine', cat: 'nature', foot: [1, 1], box: [22, 42], solid: true, tree: true, variants: 2, frames: 2, fps: 0.7,
    varNames: ['Green', 'Blue'],
    draw(g, o) {
      const L = o.v ? [C.l300, C.l400, C.l500, C.l600] : [C.p300, C.p500, C.p600, C.p700], d = o.frame ? 1 : 0;
      R(g, 9, 33, 4, 8, C.w3); R(g, 9, 33, 1, 8, C.w2);
      tier(g, 11, 18, 16, 8, 22, L); tier(g, 11 + d * .5, 9, 14, 5, 18, L); tier(g, 11 + d, 1, 12, 1, 12, L, true);
    }
  });
  def('palm', {
    name: 'Palm', cat: 'nature', foot: [1, 1], box: [36, 46, 14, 45], solid: true, tree: true, frames: 2, fps: 0.9,
    draw(g, o) {
      const L = [C.p300, C.p400, C.p500, C.p600], d = o.frame ? 1 : 0;
      for (let i = 0; i < 32; i++) { const t = i / 31, x = 13 + Math.round(7 * t * t), y = 45 - i; R(g, x, y, 3, 1, i % 4 === 0 ? C.w3 : C.w2); P(g, x, y, C.w1); }
      const cx = 21 + d, cy = 13;
      [200, 232, 290, 330, 18, 160, 250].forEach((deg, j) => {
        const a = deg * Math.PI / 180, len = j === 6 ? 9 : 13;
        for (let s = 0; s <= len; s++) { const fx = cx + Math.cos(a) * s, fy = cy + Math.sin(a) * s * 0.55 + s * s * 0.05; R(g, fx, fy, 2, 2, L[2]); P(g, fx, fy, L[1]); if (s > 2 && s % 2 === 0) P(g, fx, fy + 2, L[3]); }
      });
      disc(g, cx - 1, cy + 2, 1, C.w3); disc(g, cx + 2, cy + 2, 1, C.w4); disc(g, cx, cy, 2, L[1]);
    }
  });
  def('bush', {
    name: 'Bush', cat: 'nature', foot: [1, 1], box: [16, 12], solid: true, variants: 3, varNames: ['Leafy', 'Berry', 'Flowering'],
    draw(g, o) {
      oval(g, 8, 7, 7, 4, C.p600); oval(g, 8, 6, 6, 4, C.p500); oval(g, 6, 5, 3, 2, C.p400); P(g, 5, 4, C.p300);
      if (o.v) for (let k = 0; k < 6; k++) P(g, 3 + Math.floor(o.rnd() * 10), 4 + Math.floor(o.rnd() * 6), o.v === 1 ? C.b400 : C.sun);
    }
  });
  def('rock', {
    name: 'Rock', cat: 'nature', foot: [1, 1], variants: 2, varNames: ['Small', 'Boulder'], solid: true,
    box: (o) => o.v === 1 ? [22, 16] : [12, 9],
    draw(g, o) {
      if (o.v === 1) { oval(g, 9, 9, 8, 6, C.co400); oval(g, 16, 11, 5, 4, C.co500); oval(g, 7, 7, 5, 4, C.co300); P(g, 5, 5, C.co200); R(g, 3, 14, 16, 1, C.co600); P(g, 12, 6, C.p500); P(g, 13, 6, C.p400); }
      else { oval(g, 6, 5, 5, 3, C.co400); oval(g, 5, 4, 3, 2, C.co300); R(g, 2, 7, 8, 1, C.co600); }
    }
  });
  def('flowers', {
    name: 'Wildflowers', cat: 'nature', foot: [1, 1], box: [16, 12], outline: false, variants: 4, noShadow: true, small: true,
    draw(g, o) {
      const col = [C.s50, C.b400, C.k300, '#F2B8B0'][o.v % 4];
      for (let k = 0; k < 6; k++) { const x = 2 + Math.floor(o.rnd() * 12), y = 3 + Math.floor(o.rnd() * 7); R(g, x, y + 1, 1, 2, C.p600); P(g, x - 1, y, col); P(g, x + 1, y, col); P(g, x, y - 1, col); P(g, x, y + 1, col); P(g, x, y, C.sun); }
    }
  });
  def('tuft', {
    name: 'Grass Tuft', cat: 'nature', foot: [1, 1], box: [10, 7], outline: false, frames: 2, fps: 1.2, noShadow: true, small: true,
    draw(g, o) { const d = o.frame ? 1 : 0; line(g, 2, 6, 1 + d, 2, C.p600); line(g, 5, 6, 5 + d, 0, C.p500); line(g, 8, 6, 9 + d, 2, C.p600); P(g, 5 + d, 0, C.p300); line(g, 4, 6, 3 + d, 3, C.p300); }
  });
  def('reeds', {
    name: 'Reeds', cat: 'nature', foot: [1, 1], box: [12, 18], frames: 2, fps: 1, outlineColor: C.p700, noShadow: true, small: true,
    draw(g, o) { const d = o.frame ? 1 : 0;[[2, 0], [5, 3], [8, 1], [10, 5]].forEach(([x, y], i) => { line(g, x, 17, x + (i % 2 ? d : -d), y + 4, C.p500); R(g, x + (i % 2 ? d : -d), y, 2, 4, C.w3); }); }
  });
  def('mushroom', { name: 'Mushrooms', cat: 'nature', foot: [1, 1], box: [12, 9], noShadow: true, small: true, draw(g) { R(g, 3, 5, 2, 4, C.s50); oval(g, 4, 4, 3, 2, C.b400); P(g, 3, 3, C.s50); P(g, 5, 4, C.s50); R(g, 8, 6, 2, 3, C.s50); oval(g, 9, 6, 2, 1, C.c500); } });
  def('cactus', {
    name: 'Cactus', cat: 'nature', foot: [1, 1], box: [16, 24], solid: true,
    draw(g) { R(g, 6, 4, 5, 20, C.p500); R(g, 6, 4, 1, 20, C.p400); R(g, 9, 5, 1, 19, C.p600); R(g, 1, 9, 3, 6, C.p500); R(g, 1, 14, 6, 2, C.p500); R(g, 12, 7, 3, 5, C.p500); R(g, 10, 11, 5, 2, C.p500); P(g, 8, 3, C.c300); P(g, 7, 3, C.b400); R(g, 7, 2, 3, 1, C.c300); }
  });
  def('lily', { name: 'Lily Pad', cat: 'nature', foot: [1, 1], box: [12, 8], on: 'water', layer: 'ground', variants: 2, outlineColor: C.l600, noShadow: true, small: true, draw(g, o) { oval(g, 6, 4, 5, 3, C.p400); R(g, 6, 1, 1, 3, C.l400); P(g, 4, 3, C.p300); if (o.v) { disc(g, 7, 4, 1, '#F2B8B0'); P(g, 7, 4, C.sun); } } });
  def('stump', { name: 'Stump', cat: 'nature', foot: [1, 1], box: [12, 9], solid: true, draw(g) { R(g, 1, 3, 10, 6, C.w3); oval(g, 6, 3, 5, 2, C.w1); oval(g, 6, 3, 2, 1, C.w2); R(g, 0, 8, 2, 1, C.w3); R(g, 10, 8, 2, 1, C.w3); } });

  /* ---------- crops ---------- */
  def('wheat', {
    name: 'Wheat', cat: 'crop', foot: [1, 1], box: [16, 16], outline: false, variants: 3, frames: 2, fps: 1.1, noShadow: true, crop: true, small: true,
    varNames: ['Sprout', 'Growing', 'Ripe'],
    draw(g, o) {
      const st = o.v, d = o.frame ? 1 : 0, hgt = [3, 6, 9][st], head = st === 2 ? C.sun : st === 1 ? C.p300 : C.p400;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x = 2 + c * 4 + (r % 2), y = 6 + r * 4; line(g, x, y + 2, x + d, y + 2 - hgt, st === 2 ? C.sun2 : C.p500); R(g, x + d, y + 2 - hgt - 1, 1, 3, head); if (st === 2) P(g, x + d + 1, y + 2 - hgt, C.sun2); }
    }
  });
  def('cabbage', { name: 'Cabbages', cat: 'crop', foot: [1, 1], box: [16, 14], crop: true, outlineColor: C.p700, noShadow: true, small: true, draw(g) { [[4, 4], [11, 4], [4, 10], [11, 10]].forEach(([x, y]) => { oval(g, x, y, 3, 2, C.p300); P(g, x, y, C.p200); P(g, x - 2, y + 1, C.p400); }); } });
  def('pumpkin', { name: 'Pumpkins', cat: 'crop', foot: [1, 1], box: [16, 14], crop: true, small: true, draw(g) { line(g, 1, 9, 14, 6, C.p500); oval(g, 5, 9, 4, 3, C.c400); R(g, 5, 7, 1, 5, C.c500); P(g, 5, 5, C.p500); oval(g, 12, 9, 3, 2, C.sun2); P(g, 12, 6, C.p500); oval(g, 9, 4, 2, 1, C.p400); } });

  /* ---------- characters ---------- */
  def('villager', {
    name: 'Villager', cat: 'character', box: [16, 19, 8, 17], frames: 6,
    desc: 'look = [skin, hair, shirt, pants, hairStyle, hat] · dir = down | up | side · carry = wood | fish | water | wheat | ore | stone | bread · tool = axe | pick | hammer | hoe | rod (frames 4–5 = work swing)',
    draw(g, o) {
      g.translate(3, 2);
      const L = o.look || [0, 0, 0, 0, 0, 0], skin = SKIN[L[0] % 5], hair = HAIR[L[1] % 6], shirt = SHIRT[L[2] % 8], pants = PANTS[L[3] % 5], style = L[4] % 3, hat = L[5] % 3;
      const f = o.frame >= 4 ? 0 : o.frame % 4, dir = o.dir || 'down', by = (f === 1 || f === 3) ? -1 : 0, foot = C.ink2, sd = shade(shirt, .8);
      if (dir === 'side') {
        if (f === 1) { R(g, 3, 13, 2, 3, pants); R(g, 6, 13, 2, 2, pants); P(g, 3, 15, foot); P(g, 4, 15, foot); }
        else if (f === 3) { R(g, 3, 13, 2, 2, pants); R(g, 6, 13, 2, 3, pants); P(g, 6, 15, foot); P(g, 7, 15, foot); }
        else { R(g, 4, 13, 3, 3, pants); R(g, 4, 15, 3, 1, foot); }
        R(g, 3, 8 + by, 4, 5, shirt); R(g, 3, 12 + by, 4, 1, pants);
        const ax = 4 + (f === 1 ? 1 : f === 3 ? -1 : 0); R(g, ax, 8 + by, 2, 4, sd); P(g, ax, 12 + by, skin);
        R(g, 3, 2 + by, 5, 6, skin); R(g, 2, 1 + by, 6, 2, hair); R(g, 2, 2 + by, 2, style === 1 ? 7 : 4, hair); P(g, 6, 5 + by, C.ink); P(g, 7, 6 + by, C.c300);
        if (style === 2) R(g, 1, 1 + by, 2, 2, hair);
      } else {
        const lL = f === 1 ? 2 : 3, lR = f === 3 ? 2 : 3;
        R(g, 3, 13, 2, lL, pants); R(g, 5, 13, 2, lR, pants); R(g, 3, 12 + lL, 2, 1, foot); R(g, 5, 12 + lR, 2, 1, foot);
        R(g, 2, 8 + by, 6, 5, shirt); R(g, 2, 12 + by, 6, 1, pants);
        const aL = f === 1 ? -1 : 0, aR = f === 3 ? -1 : 0;
        R(g, 1, 8 + by + aL, 1, 4, sd); R(g, 8, 8 + by + aR, 1, 4, sd); P(g, 1, 12 + by + aL, skin); P(g, 8, 12 + by + aR, skin);
        if (dir === 'up') { R(g, 2, 1 + by, 6, 7, hair); if (style === 1) R(g, 2, 8 + by, 6, 2, hair); if (style === 2) R(g, 4, 0 + by, 2, 1, hair); }
        else {
          R(g, 2, 2 + by, 6, 6, skin); R(g, 2, 1 + by, 6, 2, hair);
          const sh = style === 1 ? 7 : 3; R(g, 1, 2 + by, 1, sh, hair); R(g, 8, 2 + by, 1, sh, hair);
          if (style === 2) R(g, 4, 0 + by, 2, 1, hair);
          P(g, 3, 5 + by, C.ink); P(g, 6, 5 + by, C.ink); P(g, 2, 6 + by, C.c300); P(g, 7, 6 + by, C.c300);
        }
      }
      if (hat === 1) { R(g, 0, 2 + by, 10, 1, C.sun); R(g, 2, 0 + by, 6, 2, C.sun2); R(g, 2, 1 + by, 6, 1, C.c500); }
      else if (hat === 2) { R(g, 2, 1 + by, 6, 2, C.b400); P(g, dir === 'side' ? 1 : 8, 3 + by, C.b400); }
      const cy = 9 + by;
      if (o.carry === 'wood') { R(g, dir === 'side' ? 2 : 1, cy, dir === 'side' ? 7 : 8, 2, C.w2); P(g, dir === 'side' ? 8 : 8, cy, C.w1); P(g, dir === 'side' ? 2 : 1, cy, C.w1); }
      else if (o.carry === 'fish') { R(g, 8, cy + 3, 1, 3, C.l300); P(g, 8, cy + 6, C.l400); P(g, 9, cy + 6, C.l400); }
      else if (o.carry === 'water') { R(g, 8, cy + 3, 2, 2, C.co400); P(g, 8, cy + 3, C.k300); }
      else if (o.carry === 'wheat') { R(g, 0, cy - 3, 2, 6, C.sun); P(g, 0, cy - 4, C.sun2); P(g, 1, cy - 4, C.sun2); }
      else if (o.carry === 'ore' || o.carry === 'stone') { R(g, 1, cy, 8, 3, o.carry === 'ore' ? C.co500 : C.co300); P(g, 3, cy, C.co200); if (o.carry === 'ore') { P(g, 5, cy + 1, C.sun); P(g, 7, cy, C.l300); } }
      else if (o.carry === 'bread') { R(g, 1, cy + 1, 8, 2, C.w2); R(g, 2, cy - 1, 3, 2, C.c400); R(g, 5, cy - 1, 3, 2, C.sun2); P(g, 3, cy - 1, C.s300); }
      if (o.tool && o.frame >= 4) tool(g, o.tool, dir, o.frame === 4, skin);
    }
  });

  /* ---------- animals ---------- */
  def('chicken', {
    name: 'Chicken', cat: 'animal', box: [8, 8], frames: 2, variants: 2, varNames: ['White', 'Brown'],
    draw(g, o) { const b = o.v ? C.w1 : C.s50; oval(g, 3, 4, 3, 2, b); P(g, 0, 2, b); P(g, 0, 3, b); const hy = o.frame ? 3 : 1; R(g, 5, hy, 2, 2, b); P(g, 5, hy - 1, C.b400); P(g, 6, hy - 1, C.b400); P(g, 7, hy + 1, C.sun2); P(g, 2, 7, C.sun2); P(g, 4, 7, C.sun2); P(g, 2, 4, shade(b, .85)); }
  });
  def('sheep', {
    name: 'Sheep', cat: 'animal', box: [13, 10], frames: 2, variants: 2, varNames: ['Sheep', 'Goat'],
    draw(g, o) { const wo = o.v ? C.s300 : C.s50, fc = o.v ? C.w3 : C.ink2; R(g, 3, 7, 1, 3, fc); R(g, 5, 7, 1, 3, fc); R(g, 8, 7, 1, 3, fc); oval(g, 6, 4, 5, 3, wo); [2, 5, 8].forEach(x => P(g, x, 1, wo)); P(g, 4, 3, shade(wo, .9)); const hy = o.frame ? 4 : 3; R(g, 10, hy, 3, 3, fc); P(g, 9, hy, fc); P(g, 12, hy + 1, C.s50); if (o.v) { P(g, 10, hy - 1, C.s400); P(g, 12, hy - 1, C.s400); } }
  });
  def('cat', {
    name: 'Cat', cat: 'animal', box: [9, 7], frames: 2, variants: 3, varNames: ['Ginger', 'Black', 'Cream'],
    draw(g, o) { const b = [C.c400, C.ink2, C.s200][o.v % 3]; R(g, 1, 3, 6, 3, b); R(g, 1, 6, 1, 1, b); R(g, 6, 6, 1, 1, b); R(g, 5, 1, 3, 3, b); P(g, 5, 0, b); P(g, 7, 0, b); P(g, 6, 2, o.v === 1 ? C.sun : C.ink); if (o.frame) line(g, 0, 3, 0, 0, b); else line(g, 0, 4, -0, 2, b); }
  });
  def('duck', {
    name: 'Duck', cat: 'animal', box: [8, 6], variants: 2, on: 'water', varNames: ['Mallard', 'White'],
    draw(g, o) { oval(g, 3, 4, 3, 1, o.v ? C.s50 : C.w1); R(g, 5, 1, 2, 3, o.v ? C.s50 : C.p600); P(g, 7, 2, C.sun2); P(g, 1, 3, o.v ? C.s200 : C.w3); }
  });
  def('butterfly', { name: 'Butterfly', cat: 'animal', box: [5, 3], frames: 2, variants: 4, outline: false, draw(g, o) { const c = [C.sun, C.s50, C.k300, C.c300][o.v % 4]; if (o.frame) { P(g, 1, 0, c); P(g, 3, 0, c); } else { P(g, 0, 0, c); P(g, 1, 0, c); P(g, 3, 0, c); P(g, 4, 0, c); P(g, 1, 1, c); P(g, 3, 1, c); } P(g, 2, 0, C.ink); P(g, 2, 1, C.ink); } });
  def('bird', { name: 'Seagull', cat: 'animal', box: [7, 3], frames: 2, outline: false, draw(g, o) { const c = C.s50; if (o.frame) { R(g, 0, 1, 7, 1, c); P(g, 3, 2, C.co500); } else { P(g, 0, 0, c); P(g, 1, 1, c); P(g, 2, 1, c); P(g, 3, 2, C.co500); P(g, 4, 1, c); P(g, 5, 1, c); P(g, 6, 0, c); } } });

  /* ---------- bubble icons ---------- */
  const ICONS = {
    heart: [C.b400, ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...']],
    note: [C.ink2, ['..xxxx.', '..x..x.', '..x..x.', '..x..x.', 'xxx.xxx', 'xxx.xxx']],
    zzz: [C.k500, ['xxxxx..', '...x...', '..x....', '.x..xxx', 'xxxx.x.', '....xxx']],
    sun: [C.sun2, ['x..x..x', '.xxxxx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', 'x..x..x']],
    drop: [C.k400, ['...x...', '..xxx..', '.xxxxx.', '.xxxxx.', '.xxxxx.', '..xxx..']],
    fish: [C.l500, ['.......', '.xxx..x', 'xxxxxxx', 'xxxxxxx', '.xxx..x', '.......']],
    wheat: [C.sun2, ['.x.x.x.', '.xxxxx.', '..xxx..', '...x...', '...x...', '...x...']],
    chat: [C.co600, ['.......', '.......', 'x..x..x', 'x..x..x', '.......', '.......']],
    hammer: [C.co700, ['xxxxx..', 'xxxxx..', '..x....', '..x....', '..x....', '..x....']],
    bang: [C.c500, ['...x...', '...x...', '...x...', '...x...', '.......', '...x...']],
    mug: [C.sun2, ['.xxxx..', 'xxxxxx.', 'xxxxx.x', 'xxxxx.x', 'xxxxxx.', '.xxxx..']],
    bread: [C.c500, ['.......', '..xxx..', '.xxxxx.', 'xxxxxxx', 'xxxxxxx', '.......']],
    pick: [C.co600, ['.xxxxx.', 'x..x..x', '...x...', '...x...', '...x...', '...x...']]
  };
  function tool(g, t, dir, up, skin) {
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
  Object.keys(ICONS).forEach(k => def('icon_' + k, { name: k[0].toUpperCase() + k.slice(1), cat: 'icon', box: [7, 6], outline: false, draw(g) { grid(g, ICONS[k][1], { x: ICONS[k][0] }); } }));
  const BUB = new Map();
  function bubble(icon) {
    let c = BUB.get(icon); if (c) return c;
    c = mk(15, 14); const g = c.getContext('2d');
    R(g, 2, 1, 11, 9, C.s50); R(g, 1, 2, 13, 7, C.s50); R(g, 6, 10, 3, 1, C.s50); P(g, 7, 11, C.s50);
    outline(c, C.ink);
    grid(g, ICONS[icon] ? ICONS[icon][1] : ICONS.chat[1], { x: (ICONS[icon] || ICONS.chat)[0] }, 4, 2);
    BUB.set(icon, c); return c;
  }

  /* ---------- terrain ---------- */
  const TERRAIN = ['deep', 'water', 'sand', 'grass', 'meadow', 'path', 'field', 'plaza', 'planks', 'dune', 'stone'];
  const TID = {}; TERRAIN.forEach((t, i) => TID[t] = i);
  const TNAMES = ['Deep Water', 'Shallows', 'Beach Sand', 'Grass', 'Wild Meadow', 'Dirt Path', 'Tilled Field', 'Cobble Plaza', 'Wooden Planks', 'Desert Dune', 'Bare Stone'];
  const HARD = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0];
  const EDGE = [null, null, C.s300, C.p500, C.p600, C.s400, C.w4, C.co500, C.w4, '#D2B07A', C.co500];
  const LIP = [null, null, '#C4AC7E', C.p600, C.p700, C.s400, C.w4, C.co600, C.w4, '#C9A46C', C.co600];
  const COST = [99, 99, 1.15, 1, 1.2, 0.5, 2.5, 0.55, 0.6, 1.3, 1.2];
  function terrainPixel(t, x, y, h, n) {
    switch (t) {
      case 0: return h > 0.993 ? C.l500 : (n > 0.55 ? '#1E7A70' : '#1C736A');
      case 1: return h > 0.975 ? C.l300 : (n > 0.5 ? C.l400 : '#38A094');
      case 2: return h > 0.995 ? C.s400 : h > 0.93 ? C.s100 : (n > 0.62 ? '#E6D4AE' : C.s200);
      case 3: return h > 0.985 ? C.p200 : h > 0.93 ? C.p300 : h < 0.04 ? C.p500 : (n > 0.62 ? '#7BB559' : n < 0.3 ? '#65A346' : C.p400);
      case 4: return h > 0.94 ? C.p400 : h < 0.05 ? C.p700 : (n < 0.38 ? '#447C2D' : C.p500);
      case 5: return h > 0.95 ? C.s400 : h < 0.02 ? C.s100 : (n > 0.55 ? '#D4BC8E' : C.s300);
      case 6: { const r = y % 4; return h > 0.97 ? C.w2 : r === 0 ? '#8E5E36' : r === 3 ? C.w4 : C.w3; }
      case 7: { const row = Math.floor(y / 4), bx = Math.floor((x + (row % 2) * 2) / 4); if ((x + (row % 2) * 2) % 4 === 0 || y % 4 === 0) return C.co500; const k = hash2(bx, row); return k > .66 ? C.co200 : k > .33 ? C.co300 : '#D6CBBE'; }
      case 8: { if (y % 4 === 3) return '#3D2A18'; const k = hash2(Math.floor(x / 24) + Math.floor(y / 4) * 7, Math.floor(y / 4)); if (x % 16 === 2 && y % 4 === 1) return C.w4; return k > .5 ? C.w2 : C.w1; }
      case 9: return h > 0.96 ? '#F0DCAE' : (((x * 0.35 + Math.sin(y * 0.3) * 2 + y * 0.9) % 9) < 1 ? '#D4B47A' : (n > .6 ? '#EAD19C' : '#E6CC94'));
      case 10: return h > 0.93 ? C.co300 : h < 0.06 ? C.co600 : (n > .55 ? C.co400 : '#ABA08F');
    }
    return '#ff00ff';
  }
  function swatch(t, scale) {
    scale = scale || 2; const s = 24, c = mk(s, s), g = c.getContext('2d'), d = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const [r, gg, b] = rgb(terrainPixel(t, x, y, hash2(x + 99, y + 31), 0.5 + 0.3 * Math.sin(x * .2 + y * .15))); const i = (y * s + x) * 4; d.data[i] = r; d.data[i + 1] = gg; d.data[i + 2] = b; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); const o = mk(s * scale, s * scale), og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, o.width, o.height); return toURL(o);
  }

  const CATS = [['building', 'Buildings'], ['prop', 'Props'], ['nature', 'Nature'], ['landmark', 'Landmarks'], ['crop', 'Crops'], ['character', 'Characters'], ['animal', 'Animals'], ['icon', 'Bubbles']];
  function list() { return ORDER.map(id => DEFS[id]); }

  window.LW = window.LW || {};
  window.LW.Assets = { draw: { R, P, disc, oval, line, roof, win, grid, tier, outline }, ROOFS, WALLS, LEAVES, ICONS, C, T, DEFS, CATS, TERRAIN, TID, TNAMES, HARD, EDGE, LIP, COST, SKIN, HAIR, SHIRT, PANTS, get: id => DEFS[id], def, list, sprite, thumb, bubble, terrainPixel, swatch, rng, hash2, hashStr, rgb, shade, mk, boxOf };
})();
