/* Little Worlds — Market Society pack ("Copperfield").
   Five villagers invent an economy one decision at a time. Builds on base + plus + village + civ layers.
   · Assets: property stake (owner colours), coin pile (wealth tiers), shop sign (open / hiring / for sale / foreclosed / strike),
     counting house (bank), manor, toll booth, price board · bubbles: deal, up, down.
   · Overlays: live price tags above shops (coins or tally notches), coin and goods hand-offs between villagers, property lens.
   · LW.MARKET: STAGES, DECISIONS, OUTCOMES, model(stage, picks) → wealth per villager, meters, outcome.
   · LW.createWorld('copperfield', seed, { stage: 0..7, picks: ['a'|'b', ...] }) */
(function () {
  'use strict';
  const LW = window.LW, A = LW.Assets, C = A.C, T = A.T, def = A.def, { R, P, disc, oval, line, roof, grid } = A.draw, ROOFS = A.ROOFS;
  const pick = a => a[(Math.random() * a.length) | 0];
  const OWN = [
    { name: 'Odile', c: C.c500, job: 'baker', look: [1, 3, 2, 1, 1, 0, 0], trade: 'bread' },
    { name: 'Bram', c: C.p500, job: 'woodcutter', look: [3, 0, 5, 2, 0, 2, 0], trade: 'wood' },
    { name: 'Tamsin', c: C.b400, job: 'smith', look: [2, 1, 7, 3, 2, 0, 0], trade: 'ore' },
    { name: 'Pip', c: C.k500, job: 'fisher', look: [0, 4, 3, 0, 0, 1, 0], trade: 'fish' },
    { name: 'Wren', c: C.sun2, job: 'merchant', look: [4, 2, 6, 4, 1, 0, 1], trade: 'basket' }
  ];
  const COMMONS = C.s400;
  const GOOD = { bread: C.c400, wood: C.w1, ore: C.co400, fish: C.l300, basket: C.p400, coin: C.sun, tally: C.w2, wheat: C.sun2 };

  /* ================= bubbles ================= */
  Object.assign(A.ICONS, {
    deal: [C.c500, ['.......', 'xx...xx', 'xxx.xxx', '.xxxxx.', '..xxx..', '.......']],
    up: [C.p500, ['......x', '.....xx', 'x...x.x', '.x.x...', '..x....', '.......']],
    down: [C.b500, ['.......', '..x....', '.x.x...', 'x...x.x', '.....xx', '......x']]
  });
  ['deal', 'up', 'down'].forEach(k => def('icon_' + k, { name: k[0].toUpperCase() + k.slice(1), cat: 'icon', box: [7, 6], outline: false, draw(g) { grid(g, A.ICONS[k][1], { x: A.ICONS[k][0] }); } }));

  /* ================= assets ================= */
  def('stake', { name: 'Property Stake', cat: 'market', foot: [1, 1], box: [12, 20, 6, 19], variants: 6, varNames: OWN.map(o => o.name).concat('Commons'), frames: 2, fps: 2, plazaOk: true, desc: 'Driven in with a rock and a lot of conviction.',
    draw(g, o) { const c = o.v < 5 ? OWN[o.v].c : COMMONS; R(g, 5, 4, 2, 16, C.w2); R(g, 5, 4, 1, 16, C.w1); R(g, 4, 18, 4, 2, C.w3); P(g, 5, 3, C.w1); const f = o.frame;
      for (let y = 0; y < 6; y++) R(g, 7, 4 + y, 5 - Math.floor(y / 2) + (y > 2 ? f : 0), 1, y === 0 ? A.shade(c, 1.15) : c); P(g, 8, 6, C.s50); } });
  def('coinpile', { name: 'Coin Pile', cat: 'market', foot: [1, 1], box: [16, 14, 8, 13], variants: 4, varNames: ['Scraping by', 'Saving', 'Comfortable', 'Rich'], noShadow: true, desc: 'How the neighbours keep score.',
    draw(g, o) { const coin = (x, y) => { R(g, x, y, 4, 2, C.sun2); R(g, x, y, 4, 1, C.sun); P(g, x + 3, y + 1, '#B98227'); }, stack = (x, n) => { for (let i = 0; i < n; i++) coin(x, 11 - i * 2); P(g, x + 1, 11 - (n - 1) * 2, C.glow2); };
      if (o.v === 0) { coin(6, 11); return; }
      if (o.v >= 2) { R(g, 1, 6, 6, 7, C.w1); R(g, 2, 5, 4, 1, C.w2); R(g, 3, 3, 2, 2, C.w2); R(g, 1, 12, 6, 1, C.w2); R(g, 3, 8, 2, 2, C.sun2); }
      if (o.v === 3) { stack(11, 5); stack(7, 3); coin(0, 12); P(g, 14, 12, C.sun); P(g, 15, 13, C.sun2); return; }
      stack(8, o.v === 1 ? 2 : 3); if (o.v === 2) stack(12, 2); } });
  const SIGNS = [[C.p500, ['......x', '.....x.', 'x...x..', '.x.x...', '..x....', '.......']], [C.w3, A.ICONS.hammer ? A.ICONS.hammer[1] : ['xxxxx..', 'xxxxx..', '..x....', '..x....', '..x....', '..x....']], [C.sun2, A.ICONS.coin[1]], [C.b500, ['x.....x', '.x...x.', '..x.x..', '...x...', '..x.x..', '.x...x.']], [C.b500, A.ICONS.fist[1]]];
  def('shopsign', { name: 'Shop Sign', cat: 'market', foot: [1, 1], box: [16, 22, 8, 21], variants: 5, varNames: ['Open', 'Hiring', 'For sale', 'Foreclosed', 'On strike'], plazaOk: true,
    draw(g, o) { R(g, 7, 9, 2, 13, C.w3); R(g, 6, 20, 4, 2, C.w4); R(g, 1, 1, 14, 10, C.w2); R(g, 1, 1, 14, 1, C.w1); R(g, 1, 10, 14, 1, C.w4); R(g, 2, 2, 12, 8, o.v === 3 ? C.co200 : C.s50); const s = SIGNS[o.v % 5]; grid(g, s[1], { x: s[0] }, 4, 3);
      if (o.v === 3) { line(g, 0, 2, 15, 9, C.w3, 2); P(g, 2, 3, C.co600); P(g, 13, 8, C.co600); } } });
  def('countinghouse', { name: 'Counting House', cat: 'market', foot: [3, 2], box: [54, 54, 27, 53], solid: true, litable: true, bank: true, store: true, desc: 'Lends money to people who can prove they do not need it.',
    lights: [{ x: -15, y: -15, r: 20, mode: 'win' }, { x: 15, y: -15, r: 20, mode: 'win' }],
    draw(g, o) { R(g, 2, 48, 50, 6, C.co300); R(g, 4, 46, 46, 2, C.co200); for (let y = 22; y < 46; y += 4) for (let x = 5 + ((y / 4) % 2) * 3; x < 49; x += 6) { R(g, x, y, 6, 4, C.s100); R(g, x, y + 3, 6, 1, C.s300); R(g, x + 5, y, 1, 4, C.s300); } R(g, 5, 22, 44, 24, 'rgba(0,0,0,0)');
      [8, 41].forEach(x => { R(g, x, 25, 5, 21, C.s50); R(g, x + 4, 25, 1, 21, C.s300); R(g, x - 1, 24, 7, 2, C.s200); R(g, x - 1, 44, 7, 2, C.s200); });
      [[16, 29], [32, 29]].forEach(([x, y]) => { R(g, x, y, 6, 9, C.co600); R(g, x + 1, y + 1, 4, 7, o.lit ? C.glow : C.glass); for (let k = 0; k < 4; k++) R(g, x + 1 + k, y + 1, 1, 7, k % 2 ? 'rgba(0,0,0,0)' : C.co500); });
      R(g, 23, 32, 8, 14, C.co600); disc(g, 27, 38, 3, C.co400); disc(g, 27, 38, 1, C.sun2); R(g, 23, 32, 8, 1, C.co500);
      for (let i = 0; i < 13; i++) { const w = Math.round(6 + i * 3.6); R(g, 27 - w / 2, 7 + i, w, 1, i < 2 ? C.s50 : i > 10 ? C.s300 : C.s100); } R(g, 3, 20, 48, 2, C.s300); R(g, 3, 20, 48, 1, C.s50);
      disc(g, 27, 13, 4, C.sun2); disc(g, 27, 13, 3, C.sun); R(g, 26, 11, 2, 5, '#B98227'); R(g, 25, 12, 4, 1, '#B98227'); R(g, 25, 14, 4, 1, '#B98227'); P(g, 25, 11, C.glow2); } });
  def('manor', { name: 'Manor', cat: 'market', foot: [3, 2], box: [54, 60, 27, 59], solid: true, litable: true, home: 1, desc: 'Fourteen rooms. Two of them have been used.',
    lights: [{ x: -14, y: -12, r: 20, mode: 'win' }, { x: 14, y: -12, r: 20, mode: 'win' }, { x: -14, y: -30, r: 18, mode: 'win' }, { x: 14, y: -30, r: 18, mode: 'win' }], smoke: [{ x: -16, y: -59 }, { x: 16, y: -59 }],
    draw(g, o) { const wl = A.WALLS ? A.WALLS[0] : [C.s50, C.s200, C.s300]; R(g, 4, 20, 46, 38, wl[0]); R(g, 4, 20, 2, 38, wl[1]); R(g, 48, 20, 2, 38, wl[1]); R(g, 4, 37, 46, 2, C.sun2); R(g, 4, 55, 46, 3, wl[2]);
      const win = (x, y) => { R(g, x, y, 8, 9, C.w3); R(g, x + 1, y + 1, 6, 7, o.lit ? C.glow : C.glass); R(g, x + 4, y + 1, 1, 7, C.w3); R(g, x + 1, y + 4, 6, 1, C.w3); if (o.lit) P(g, x + 1, y + 1, C.glow2); else P(g, x + 1, y + 1, C.l300); R(g, x - 1, y + 9, 10, 1, C.s300); };
      win(9, 25); win(37, 25); win(9, 42); win(37, 42); R(g, 22, 41, 10, 17, C.w3); R(g, 23, 42, 8, 16, C.l500); R(g, 27, 42, 1, 16, C.l600); P(g, 25, 50, C.sun); P(g, 29, 50, C.sun); R(g, 21, 39, 12, 2, C.sun2);
      R(g, 20, 27, 14, 7, C.w3); R(g, 21, 28, 12, 5, o.lit ? C.glow : C.glass); for (let x = 19; x < 36; x += 2) R(g, x, 34, 1, 3, C.co300); R(g, 18, 34, 18, 1, C.co200);
      roof(g, 27, 4, 18, 30, 54, ROOFS[0]); [8, 40].forEach(x => { R(g, x, 0, 6, 10, C.c600); R(g, x, 0, 6, 2, C.c700); R(g, x + 1, 0, 4, 1, C.ink2); }); R(g, 26, 2, 2, 4, C.sun); P(g, 26, 1, C.glow2);
      [[1, 50], [50, 50]].forEach(([x, y]) => { disc(g, x + 2, y + 4, 3, C.p500); disc(g, x + 2, y + 3, 2, C.p400); }); } });
  def('tollbooth', { name: 'Toll Booth', cat: 'market', foot: [1, 1], box: [30, 28, 9, 27], solid: true, litable: true, lights: [{ x: 0, y: -14, r: 18, mode: 'win' }], desc: 'Two pennies to enter. Three to complain.',
    draw(g, o) { R(g, 2, 10, 14, 17, C.w2); for (let y = 12; y < 27; y += 3) R(g, 2, y, 14, 1, C.w3); R(g, 4, 13, 10, 6, C.w3); R(g, 5, 14, 8, 4, o.lit ? C.glow : C.glass); R(g, 3, 19, 12, 1, C.w1); R(g, 6, 20, 5, 2, C.sun2);
      roof(g, 9, 2, 8, 6, 18, ROOFS[0]); R(g, 16, 18, 2, 9, C.w3); for (let x = 18; x < 30; x++) R(g, x, 19, 1, 2, Math.floor((x - 18) / 3) % 2 ? C.b400 : C.s50); P(g, 29, 21, C.w3); R(g, 28, 21, 1, 6, C.w3); } });
  def('priceboard', { name: 'Price Board', cat: 'market', foot: [2, 1], box: [34, 30, 17, 29], solid: true, plazaOk: true, desc: 'Fair prices, chalked fresh every morning.',
    draw(g) { R(g, 4, 18, 2, 12, C.w3); R(g, 28, 18, 2, 12, C.w3); R(g, 1, 1, 32, 20, C.w3); R(g, 3, 3, 28, 16, C.ink2); R(g, 1, 1, 32, 1, C.w2);
      const rows = [[C.c400, 2], [C.l300, 3], [C.w1, 4], [C.co400, 6]]; rows.forEach(([c, n], i) => { const y = 5 + i * 3.5 | 0; R(g, 5, y, 3, 2, c); R(g, 10, y + 1, 8, 1, C.s300); for (let k = 0; k < n; k++) P(g, 21 + k * 2, y + 1, C.s50); }); R(g, 3, 20, 28, 1, C.w2); } });
  A.CATS.splice(A.CATS.findIndex(c => c[0] === 'civic') + 1, 0, ['market', 'Market & Money']);

  /* ================= model ================= */
  const STAGES = [
    { name: 'Barter', year: 'Spring, Year 1', hour: 9.2 }, { name: 'Property', year: 'Year 2', hour: 10 }, { name: 'Money', year: 'Year 4', hour: 11 }, { name: 'Labor', year: 'Year 7', hour: 13.8 },
    { name: 'Trade', year: 'Year 10', hour: 11.6 }, { name: 'Capital', year: 'Year 14', hour: 15 }, { name: 'Rules', year: 'Year 19', hour: 10.6 }, { name: 'Reckoning', year: 'Year 30', hour: 17.4 }
  ];
  const DECISIONS = [
    { q: 'Who owns the land?', a: { t: 'Fence the plots', d: 'Each villager stakes a claim. Fields get tended, borders get argued.', fx: [['Growth', 1], ['Fairness', -1]], m: [1.45, 1.5, 1.1, .8, 1], g: 12, s: -2 }, b: { t: 'Keep a commons', d: 'One shared field and pasture. Houses are private, the land is not.', fx: [['Fairness', 1], ['Growth', -1]], m: [1.1, 1.1, 1.1, 1.1, 1.1], g: 4, s: 6 } },
    { q: 'What do we trade with?', a: { t: 'Mint coins', d: 'Copper pennies with a fish on one side. Every shop puts up a price.', fx: [['Growth', 1], ['Wealth', 1]], m: [1.3, 1.2, 1.3, 1.1, 1.7], g: 12, s: -3 }, b: { t: 'Keep tally sticks', d: 'Debts notched on wood and settled every harvest.', fx: [['Stability', 1], ['Growth', -1]], m: [1.15, 1.15, 1.15, 1.15, 1.15], g: 5, s: 10 } },
    { q: 'Who does the work?', a: { t: 'Hire for wages', d: "Bram's mill takes on Pip and Wren at two pennies a day.", fx: [['Growth', 1], ['Fairness', -1]], m: [1.1, 2.5, 1.2, .8, .8], g: 16, s: -4 }, b: { t: 'Form a co-op', d: 'Everyone owns a share of the workshop and splits the profit.', fx: [['Fairness', 1], ['Growth', -1]], m: [1.25, 1.25, 1.25, 1.25, 1.25], g: 6, s: 6 } },
    { q: 'Who can trade here?', a: { t: 'Open the road', d: 'Caravans welcome. Cheaper goods, tougher competition.', fx: [['Growth', 1], ['Stability', -1]], m: [1.3, 1.4, 1.2, 1.05, 1.9], g: 14, s: -10 }, b: { t: 'Raise a toll gate', d: 'Outsiders pay at the gate. Local shops stay safe.', fx: [['Stability', 1], ['Growth', -1]], m: [1.1, 1.1, 1.3, 1.1, .95], g: 3, s: 8 } },
    { q: 'Where do savings go?', a: { t: 'Open a bank', d: "Wren's counting house lends to anyone with a plan.", fx: [['Growth', 1], ['Stability', -1]], m: [1.2, 1.6, 1.1, .9, 2.6], g: 18, s: -18 }, b: { t: 'Fill the granary', d: 'Grain and coin stored for bad years.', fx: [['Stability', 1], ['Wealth', -1]], m: [1.1, 1.1, 1.1, 1.1, 1.1], g: 4, s: 12 } },
    { q: 'Who sets the rules?', a: { t: 'Let it run', d: 'No price caps, no inspectors, no complaints department.', fx: [['Growth', 1], ['Fairness', -1]], m: [1, 1.4, 1, .8, 1.6], g: 8, s: -12 }, b: { t: 'Write market laws', d: 'Fair weights, a price board, and an inspector with a clipboard.', fx: [['Fairness', 1], ['Stability', 1]], m: null, g: -2, s: 12 } }
  ];
  const OUTCOMES = {
    crash: { t: 'The Crash', d: 'Loans went bad all at once. Shops are boarded and the bank is closed.', how: 'Bank + no rules + a fragile town' },
    gilded: { t: 'Gilded Copperfield', d: 'Business is booming for some. The rest are on strike outside the mill.', how: 'Big wealth gaps and no rules' },
    fair: { t: 'Fair Market Town', d: 'Busy shops, honest weights and an inspector nobody minds.', how: 'Market laws on a growing town' },
    commons: { t: 'Cozy Commonwealth', d: 'Nobody is rich, nobody is hungry, and the co-op meets on Thursdays.', how: 'Shared land, shared work' },
    steady: { t: 'Steady Market', d: 'A modest town that pays its debts and closes early on Sundays.', how: 'Anything in between' }
  };
  const OKEYS = ['fair', 'gilded', 'steady', 'commons', 'crash'];
  const clamp = v => Math.max(0, Math.min(1, v));
  function gini(w) { const n = w.length, m = w.reduce((a, b) => a + b, 0) / n; let s = 0; w.forEach(a => w.forEach(b => { s += Math.abs(a - b); })); return s / (2 * n * n * m); }
  function model(stage, picks) {
    let w = [10, 10, 10, 10, 10], g = 18, s = 62, f = 0;
    const n = Math.min(stage, 6);
    for (let i = 0; i < n; i++) {
      const p = picks[i]; if (!p) break; const o = DECISIONS[i][p];
      if (o.m) w = w.map((x, k) => x * o.m[k]); else { const mean = w.reduce((a, b) => a + b, 0) / 5; w = w.map(x => x + (mean - x) * .45); f += .14; }
      g += o.g; s += o.s;
    }
    let outcome = null;
    if (stage >= 7) {
      const gi0 = gini(w);
      if (picks[4] === 'a' && picks[5] === 'a' && s < 40) outcome = 'crash';
      else if (picks[5] === 'a' && gi0 > .26) outcome = 'gilded';
      else if (picks[5] === 'b' && g >= 55) outcome = 'fair';
      else if (gi0 < .1 && g < 60) outcome = 'commons';
      else outcome = 'steady';
      if (outcome === 'crash') { w = w.map((x, k) => x * [.6, .35, .75, .7, .25][k]); g -= 30; s = 14; }
      if (outcome === 'gilded') { const mx = Math.max(...w); w = w.map(x => x === mx ? x * 1.5 : x * .85); g += 8; s -= 8; }
      if (outcome === 'fair') { g += 10; s += 8; }
      if (outcome === 'commons') { s += 10; }
    }
    const tot = w.reduce((a, b) => a + b, 0), gi = gini(w);
    const meters = [['Wealth', clamp(Math.log(tot / 40) / Math.log(30))], ['Fairness', clamp(1 - gi * 2.2 + f)], ['Growth', clamp(g / 100)], ['Stability', clamp(s / 100)]];
    const rich = w.indexOf(Math.max(...w)), poor = w.indexOf(Math.min(...w));
    const price = stage < 2 ? 1 : (1 + (g - 18) / 90) * (outcome === 'crash' ? 2.4 : outcome === 'gilded' ? 1.6 : outcome === 'fair' ? .9 : 1) * (picks[5] === 'b' && stage >= 6 ? .8 : 1);
    return { wealth: w.map(x => Math.round(x)), gini: gi, meters, outcome, rich, poor, price, growth: g, stability: s };
  }
  function systemLabel(stage, picks) {
    if (stage === 0) return 'Barter and favours';
    const parts = [];
    if (stage >= 1) parts.push(picks[0] === 'a' ? 'Private land' : 'Commons');
    if (stage >= 2) parts.push(picks[1] === 'a' ? 'coins' : 'tallies');
    if (stage >= 3) parts.push(picks[2] === 'a' ? 'wages' : 'co-op');
    if (stage >= 5) parts.push(picks[4] === 'a' ? 'bank' : 'granary');
    if (stage >= 6) parts.push(picks[5] === 'a' ? 'free market' : 'market laws');
    return parts.slice(0, 1).concat(parts.slice(1).slice(-3)).join(' · ');
  }
  const HEAD = [
    () => 'Five strangers, one clearing, and nothing to buy anything with.',
    p => p[0] === 'a' ? 'Fences go up. Bram and Odile already disagree about a hedge.' : 'The big field stays open. Sheep approve.',
    p => p[1] === 'a' ? 'Copper pennies change hands. Every shop chalks up a price.' : 'Everyone carries a notched stick. Wren keeps the master copy.',
    p => p[2] === 'a' ? "Bram's mill pays wages. Pip and Wren haul logs for two pennies a day." : 'The co-op splits its profit five ways every Friday.',
    p => p[3] === 'a' ? 'Caravans roll in from the coast with cheaper everything.' : 'A toll gate on the west road. Outsiders pay to sell.',
    p => p[4] === 'a' ? "Wren's counting house is lending. Three new buildings go up at once." : 'The granary is full. Nobody is getting rich, nobody is worried.',
    p => p[5] === 'a' ? 'No rules. Prices climb, and so do the profits.' : 'Fair weights, a price board, and Tamsin with a clipboard.'
  ];
  LW.MARKET = { STAGES, DECISIONS, OUTCOMES, OKEYS, OWN, model, systemLabel, COMMONS };

  /* ================= world ================= */
  function copperfield(seed, opts) {
    const stage = Math.max(0, Math.min(7, opts.stage | 0)), picks = (opts.picks || []).slice(0, 6), G2 = LW.gen, TID = A.TID;
    const M = model(stage, picks), out = M.outcome, pk = i => stage > i ? picks[i] : null;
    const W = new LW.World(54, 38, seed), N = W.noise, CX = 25, CY = 17;
    W.name = 'Copperfield'; W.climate = 'temperate'; W.season = stage === 7 ? 2 : stage === 0 ? 0 : 1;
    W.market = { stage, picks, M };
    const SX = y => 41 + Math.round(Math.sin(y * .23) * 1.3);
    G2.forTiles(W, (x, y) => {
      const edge = Math.min(x, y, 53 - x, 37 - y), d = Math.hypot((x - CX) / 1.5, y - CY);
      let t = edge + (N.fbm(x * .14, y * .14) - .5) * 7 < 4 || (d > 15 && N.fbm(x * .1 + 4, y * .1) > .58) ? 'meadow' : 'grass';
      const pd = ((x - 8) / 5) ** 2 + ((y - 32) / 3.2) ** 2 + (N.n2(x * .4, y * .4) - .5) * .4; if (pd < .35) t = 'deep'; else if (pd < 1) t = 'water'; else if (pd < 1.35) t = 'sand';
      const sx = SX(y); if (x >= sx && x <= sx + 1) t = 'water'; else if ((x === sx - 1 || x === sx + 2) && N.n2(x * .5, y * .5) > .55) t = 'sand';
      if (y < 3 + N.n2(x * .2, 1) * 2) t = 'stone';
      G2.setRaw(W, x, y, t);
    });
    const S = W.mk = { stage, picks, M, homes: [], biz: {}, stalls: [], sites: [], center: [CX, CY], exits: [[1, CY], [52, CY]], fields: [] };
    const put = (id, x, y, o, m, r) => G2.placeNear(W, id, x, y, o || {}, m == null ? 1 : m, r == null ? 3 : r);
    const link = o => o && G2.link(W, o, CX, CY + 1);
    if (stage >= 1) {
      W.carvePath(0, CY, 53, CY);
      for (let x = 0; x < 54; x++) if (W.isWater(x, CY) || W.isWater(x, CY + 1)) { if (W.isWater(x, CY - 1)) W.place('rail', x, CY - 1); G2.setRaw(W, x, CY, 'planks'); G2.setRaw(W, x, CY + 1, 'planks'); W.place('rail', x, CY + 1); }
    }
    if (stage >= 2) for (let y = CY - 3; y <= CY + 3; y++) for (let x = CX - 5; x <= CX + 5; x++) { const corner = (Math.abs(x - CX) === 5) && (Math.abs(y - CY) === 3); if (!corner && W.tile(x, y) >= 2) G2.setRaw(W, x, y, 'plaza'); }

    /* homes: one per villager, sized by wealth */
    const HS = [[15, 9], [31, 8], [14, 22], [18, 28], [31, 23]];
    if (stage === 0) {
      [[CX - 6, CY - 4], [CX + 2, CY - 5], [CX + 6, CY - 1], [CX - 7, CY + 1], [CX + 2, CY + 4]].forEach(([x, y], i) => { const t = put('tent', x, y, { v: i % 4 }, 0, 2); if (t) S.homes[i] = t; });
      put('campfire', CX - 1, CY - 2, {}, 0, 2); S.blanket = put('table', CX - 1, CY + 1, { v: 1 }, 0, 2); put('logpile', CX + 5, CY - 4, {}, 0, 2); put('rack', CX - 4, CY - 1, {}, 0, 2);
      put('basket' in A.DEFS ? 'basket' : 'crate', CX + 3, CY + 1, {}, 0, 2); put('barrel', CX - 5, CY + 3, {}, 0, 2);
    } else {
      HS.forEach(([x, y], i) => {
        const w = M.wealth[i], tier = w < 14 ? 0 : w < 34 ? 1 : 2, rich = tier === 2 && (out === 'gilded' || out === 'crash' || stage >= 5) && i === M.rich;
        const id = rich ? 'manor' : tier === 0 ? 'hut' : 'cottage', h = put(id, rich ? x - 1 : x, y, id === 'cottage' ? { v: [0, 1, 3, 2, 0][i] } : { v: i % 2 }, 1, 4);
        if (!h) return; S.homes[i] = h; link(h); if (rich) S.manor = h;
        if ((out === 'gilded' || out === 'crash') && tier === 0) h.decay = 1;
        if (out === 'crash' && rich) h.decay = 1;
        const d = W.door(h); const cp = put('coinpile', d.x + 1, d.y, { v: w < 12 ? 0 : w < 25 ? 1 : w < 50 ? 2 : 3 }, 0, 2); if (cp) cp.owner = i;
        if (stage <= 3 && i !== 4) put('laundry', h.x + h.fw + 1, h.y + 1, { v: i % 3 }, 0, 2);
      });
    }
    /* land */
    const PLOTS = [[5, 5, 8, 6], [33, 3, 6, 7], [5, 19, 6, 6], [4, 26, 6, 4], [33, 26, 6, 6]];
    if (stage >= 1) {
      W.fmap = new Uint8Array(W.w * W.h); W.fcolors = OWN.map(o => o.c).concat(COMMONS); W.lensName = 'property';
      const fill = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (W.inb(x, y) && W.tile(x, y) >= 2) W.fmap[y * W.w + x] = v; };
      const fenceRect = (x0, y0, w, h) => { for (let x = x0 - 1; x <= x0 + w; x++) [y0 - 1, y0 + h].forEach(y => { if (x !== x0 + (w >> 1) && W.canPlace('fence', x, y) && W.tile(x, y) !== TID.path) W.place('fence', x, y); }); for (let y = y0; y < y0 + h; y++) [x0 - 1, x0 + w].forEach(x => { if (y !== y0 + (h >> 1) && W.canPlace('fence', x, y) && W.tile(x, y) !== TID.path) W.place('fence', x, y); }); };
      if (pk(0) === 'a') {
        PLOTS.forEach(([x, y, w, h], i) => {
          fill(x - 1, y - 1, w + 2, h + 2, i + 1);
          const crop = ['wheat', null, 'cabbage', null, 'pumpkin'][i];
          if (crop && G2.field(W, x + 1, y + 1, w - 2, h - 2, crop)) S.fields[i] = [x + 1 + ((w - 2) >> 1), y + 1 + ((h - 2) >> 1)];
          if (i === 1) for (let k = 0; k < 6; k++) { const tx = x + 1 + (k % 3) * 2, ty = y + 1 + Math.floor(k / 3) * 3; if (W.canPlace('oak', tx, ty)) W.place('oak', tx, ty, { v: k % 2 }); }
          fenceRect(x, y, w, h); const st = put('stake', x - 1, y - 2, { v: i }, 0, 2) || put('stake', x + w, y + h, { v: i }, 0, 2);
        });
        HS.forEach(([x, y], i) => fill(x - 1, y - 1, 5, 5, i + 1));
      } else {
        const [x, y, w, h] = [4, 4, 10, 8]; fill(x - 1, y - 1, w + 2, h + 2, 6);
        if (G2.field(W, x + 1, y + 1, 5, 3, 'wheat')) S.fields[0] = [x + 3, y + 2];
        if (G2.field(W, x + 1, y + 5, 4, 2, 'cabbage')) S.fields[2] = [x + 2, y + 5];
        fenceRect(x, y, w, h); put('stake', x - 1, y - 2, { v: 5 }, 0, 2); put('noticeboard', x + w + 1, y + 3, { v: 0 }, 0, 2);
        HS.forEach(([hx, hy], i) => fill(hx - 1, hy - 1, 4, 4, i + 1));
        G2.critters(W, 'sheep', 4, { x: x + 8, y: y + 4 }, 1.5, () => W.rng() < .3 ? 1 : 0);
        S.pasture = [x + 8, y + 3];
      }
    }
    /* businesses */
    if (stage >= 2) {
      S.biz.bakery = put('bakery', 19, 9, {}, 1, 3); link(S.biz.bakery);
      S.biz.smith = put('blacksmith', 19, 22, {}, 1, 3); link(S.biz.smith);
      const ms = G2.findSpot(W, 'lumbermill', 33, 9, 40, 15, (x, y) => W.isWater(x + 3, y) && W.isWater(x + 3, y + 1)); if (ms) { S.biz.mill = W.place('lumbermill', ms[0], ms[1]); link(S.biz.mill); }
      const hs = G2.findSpot(W, 'fishhut', 3, 24, 18, 33, (x, y) => W.isWater(x, y + 2) && W.isWater(x + 1, y + 2)); if (hs) { S.biz.hut = W.place('fishhut', hs[0], hs[1]); link(S.biz.hut); }
      S.stalls.push(put('stall', CX - 3, CY - 2, { v: 0 }, 0, 2), put('stall', CX + 2, CY - 2, { v: 1 }, 0, 2));
      if (pk(1) === 'b') S.tally = put('tally', CX - 1, CY + 2, {}, 0, 2); else put('well', CX, CY + 2, {}, 0, 2);
      [[CX - 5, CY - 3], [CX + 5, CY - 3], [CX - 5, CY + 3], [CX + 5, CY + 3]].forEach(([x, y]) => W.canPlace('lamp', x, y) && W.place('lamp', x, y));
    }
    if (stage >= 3) {
      if (pk(2) === 'a') { S.hiring = put('shopsign', (S.biz.mill ? S.biz.mill.x - 1 : 34), (S.biz.mill ? S.biz.mill.y + 2 : 12), { v: out === 'gilded' ? 4 : 1 }, 0, 2); }
      else { put('bunting', CX - 3, CY - 4, {}, 0, 2); S.coopTable = put('table', CX + 1, CY + 1, { v: 0 }, 0, 2); put('flag', CX - 6, CY - 1, { v: 0 }, 0, 2); }
      put('crate', 23, 11, {}, 0, 2); put('barrel', 24, 22, {}, 0, 2);
    }
    if (stage >= 4) {
      if (pk(3) === 'a') { S.stalls.push(put('stall', CX - 3, CY + 2, { v: 2 }, 0, 2), put('stall', CX + 3, CY + 2, { v: 3 }, 0, 2)); S.openRoad = true; }
      else { S.gate = put('gate', 4, CY - 1, {}, 0, 1); S.booth = put('tollbooth', 6, CY - 2, {}, 0, 2); put('crate', 7, CY + 2, {}, 0, 2); put('barrel', 3, CY + 2, {}, 0, 2); }
    }
    if (stage >= 5) {
      if (pk(4) === 'a') {
        S.biz.bank = put('countinghouse', 26, 9, {}, 1, 3); link(S.biz.bank);
        [['tavern', 9, 13], ['cottage', 36, 19]].forEach(([id, x, y], k) => { const o = put(id, x, y, { v: 1 }, 1, 4); if (!o) return; link(o); if (stage < 6 || out === 'crash') { o.build = out === 'crash' ? .55 : .32 + k * .2; o.self = false; S.sites.push(o); } else if (id === 'tavern') S.biz.tavern = o; });
      } else { S.biz.granary = put('granary', 9, 13, {}, 1, 3); link(S.biz.granary); }
    }
    if (stage >= 6 && pk(5) === 'b') { S.board = put('priceboard', CX - 1, CY - 4, {}, 0, 2); S.hall = put('hall', 3, 7, { v: 1 }, 1, 3); if (S.hall) { link(S.hall); S.hall.flag = 0; } }
    if (stage === 7) {
      if (out === 'crash') {
        if (S.biz.bank) { S.biz.bank.decay = 2; put('shopsign', S.biz.bank.x + 3, S.biz.bank.y + 2, { v: 3 }, 0, 2); }
        if (S.biz.mill) { S.biz.mill.decay = 1; put('shopsign', S.biz.mill.x - 1, S.biz.mill.y + 2, { v: 2 }, 0, 2); }
        [S.biz.bakery, S.biz.tavern].forEach(o => o && (o.decay = 1)); S.stalls.forEach((o, k) => { if (o && k > 0) { W.remove(o); } });
        W.grade = '#D9D6CC'; W.forceWeather = 'fog';
      } else if (out === 'gilded') {
        if (S.manor) { put('fence', S.manor.x - 1, S.manor.y + 2, { v: 1 }, 0, 1); put('fence', S.manor.x + 3, S.manor.y + 2, { v: 1 }, 0, 1); put('fountain', S.manor.x + 4, S.manor.y - 1, {}, 0, 2); }
        put('shopsign', 24, 12, { v: 4 }, 0, 2); W.grade = '#FFEBD2';
      } else if (out === 'fair') { put('bunting', CX - 3, CY - 4, {}, 0, 2); put('bunting', CX - 3, CY + 4, {}, 0, 2); put('fountain', CX - 1, CY - 1, {}, 0, 2); }
      else if (out === 'commons') { put('bunting', CX - 3, CY + 4, {}, 0, 2); S.supper = put('table', CX - 2, CY - 1, { v: 0 }, 0, 2); put('garden', 22, 26, { v: 1 }, 0, 2); }
    }
    /* prices */
    const PR = { bakery: 2, blacksmith: 7, lumbermill: 4, fishhut: 3, stall: 3, tavern: 2 };
    if (stage >= 2) W.objects.forEach(o => { if (PR[o.id] && o.build >= 1 && !(o.decay >= 2)) o.price = Math.max(1, Math.round(PR[o.id] * M.price)); });
    W.tally = pk(1) === 'b';
    /* nature */
    G2.scatter(W, [
      { on: [TID.meadow], id: 'oak', p: .24, o: () => ({ v: W.rng() < .2 ? 1 : 0 }) }, { on: [TID.meadow], id: 'pine', p: .14 }, { on: [TID.meadow], id: 'birch', p: .08 },
      { on: [TID.grass, TID.sand], id: 'willow', p: (x, y) => (W.isWater(x + 1, y) || W.isWater(x - 1, y)) ? .12 : 0 }, { on: [TID.stone], id: 'rock', p: .14, o: () => ({ v: W.rng() < .5 ? 1 : 0 }) },
      { on: [TID.grass, TID.meadow], id: 'bush', p: .03, o: () => ({ v: (W.rng() * 3) | 0 }) }
    ], [{ x: CX, y: CY, rx: 20, ry: 13 }]);
    G2.scatter(W, [{ on: [TID.grass], id: 'flowers', p: .05, o: () => ({ v: (W.rng() * 4) | 0 }) }, { on: [TID.grass, TID.meadow], id: 'tuft', p: .08 }, { on: [TID.grass, TID.sand], id: 'reeds', p: (x, y) => (W.isWater(x, y + 1) || W.isWater(x + 1, y)) ? .22 : 0 }, { on: [TID.water], id: 'lily', p: (x, y) => x < 16 ? .1 : 0 }]);
    if (stage === 7 && out === 'crash') G2.scatter(W, [{ on: [TID.plaza, TID.path, TID.grass], id: 'tuft', p: .1 }]);
    /* the five */
    S.v = OWN.map((o, i) => {
      const h = S.homes[i], d = h ? W.door(h) : { x: CX + i - 2, y: CY + 1 }, e = W.spawn('villager', d.x, d.y, { home: h || null, job: o.job, look: o.look.slice(), name: o.name });
      e.age = 0; e.mkIdx = i; e.band = o.c; if (stage === 0) e.civOutfit = 'settler'; return e;
    });
    if (S.openRoad) S.travelers = [0, 1].map(k => { const e = W.spawn('villager', 2 + k, CY + 1, { job: 'merchant', look: [k + 2, 5, 4 + k, 1, k, 1, 0], name: ['Marguerite of the Coast', 'Old Fennick'][k] }); e.age = 0; e.title = 'Traveling merchant'; return e; });
    if (stage >= 1) G2.critters(W, 'chicken', 3, { x: 17, y: 13 }, 3, () => W.rng() < .5 ? 0 : 1);
    if (stage >= 2) G2.critters(W, 'cat', 1, { x: CX, y: CY }, 6, 0);
    G2.critters(W, 'duck', 3, { x: 8, y: 32 }, 3, 0); G2.critters(W, 'rabbit', 3, { x: 46, y: 30 }, 6, 0);
    if (stage === 0) G2.critters(W, 'deer', 3, { x: 46, y: 9 }, 6, () => W.rng() < .3 ? 1 : 0);
    if (stage === 7 && out === 'crash') G2.critters(W, 'crow', 5, { x: 28, y: 12 }, 5, 0);
    const cartGo = (v, stop) => { const e = W.spawn('cart', 1, CY, { v }); e.speed = .8; e.route = [[1, CY, false]].concat(stop).concat([[CX, CY + 1, true], [52, CY, false]]); e.ri = 0; e.name = v ? 'Hay cart' : 'Coast caravan'; return e; };
    if (stage >= 4) { if (S.openRoad && out !== 'crash') { cartGo(0, []); if (out === 'fair' || out === 'gilded') cartGo(1, []); } else if (S.gate) S.cart = cartGo(1, [[5, CY, true]]); }
    W.startHour = STAGES[stage].hour; W.focus = { x: CX, y: stage === 0 ? CY - 1 : CY - 3 };
    return W;
  }
  LW.registerPreset({ id: 'copperfield', name: 'Copperfield', blurb: 'Five villagers invent an economy' }, copperfield, true);

  /* ================= engine layer ================= */
  const G = LW.Game.prototype;
  const base = { load: G.load, startEvent: G.startEvent, eventUpdate: G.eventUpdate, status: G.status, selInfo: G.selInfo, afterObject: G.afterObject, drawParticle: G.drawParticle };
  const DIG = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
  function walkNear(W, x, y, r) { r = r || 4; x = Math.round(x); y = Math.round(y); for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; if (W.walkable(x + dx, y + dy)) return [x + dx, y + dy]; } return null; }
  G.load = function (W, o) {
    base.load.call(this, W, o);
    if (W.market) { if (W.forceWeather) W.weatherToday = W.forceWeather; const wx = this.weather(); for (const k in this.wk) this.wk[k] = (wx === k || (k === 'rain' && wx === 'storm')) ? 1 : 0; this.diary = []; const S = W.mk; this.diaryAdd(null, STAGES[S.stage].year + ' · ' + (S.stage < 7 ? HEAD[Math.min(6, S.stage)](S.picks) : OUTCOMES[S.M.outcome].d)); this.startEvent('market'); }
  };
  G.afterObject = function (ctx, o, s, fx, fy) {
    base.afterObject.call(this, ctx, o, s, fx, fy);
    if (o.price == null || !this.world.market || o.burning) return;
    const b = A.boxOf(o.def, o.opts), top = Math.round(fy) - b[3], x0 = Math.round(fx) - b[2] + Math.round(b[0] * .72), bob = Math.round(Math.sin(this.t * 1.6 + o.phase) * .6), y0 = top - 5 + bob, tally = this.world.tally;
    const digits = String(o.price).split(''), w = tally ? 3 + Math.min(o.price, 12) * 2 : 7 + digits.length * 4, hot = this.world.mk.M.price > 1.7;
    ctx.fillStyle = C.co600; ctx.fillRect(x0 + 2, y0 + 7, 1, 3);
    ctx.fillStyle = C.ink; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 9); ctx.fillStyle = C.s50; ctx.fillRect(x0, y0, w, 7);
    if (tally) { ctx.fillStyle = C.w3; for (let k = 0; k < Math.min(o.price, 12); k++) { if (k % 5 === 4) { ctx.fillRect(x0 + 2 + (k - 4) * 2, y0 + 3, 9, 1); } else ctx.fillRect(x0 + 2 + k * 2, y0 + 1, 1, 5); } return; }
    ctx.fillStyle = C.sun2; ctx.fillRect(x0 + 1, y0 + 2, 3, 3); ctx.fillStyle = C.sun; ctx.fillRect(x0 + 1, y0 + 2, 2, 1);
    ctx.fillStyle = hot ? C.b500 : C.ink2; digits.forEach((dg, i) => DIG[dg].forEach((row, ry) => { for (let rx = 0; rx < 3; rx++) if (row[rx] === '1') ctx.fillRect(x0 + 6 + i * 4 + rx, y0 + 1 + ry, 1, 1); }));
  };
  G.drawParticle = function (ctx, p) {
    if (p.k !== 'coin') return base.drawParticle && base.drawParticle.call(this, ctx, p);
    const k = 1 - p.life / p.max, x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k - Math.sin(Math.PI * k) * p.h;
    ctx.globalAlpha = 1; ctx.fillStyle = C.ink; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 4); ctx.fillStyle = p.c; ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    if (p.c === C.sun) { ctx.fillStyle = C.glow2; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  };
  G.coinFly = function (a, b, c, n) {
    if (!a || !b) return; const W = this.world, ax = a.x != null && a.fw == null ? a.x : (a.x + a.fw / 2), ay = a.fw == null ? a.y : a.y + a.fh, bx = b.fw == null ? b.x : (b.x + b.fw / 2), by = b.fw == null ? b.y : b.y + b.fh;
    for (let i = 0; i < (n || 1); i++) W.particles.push({ k: 'coin', x0: ax * T + (Math.random() - .5) * 4, y0: ay * T - 10, x1: bx * T + (Math.random() - .5) * 4, y1: by * T - 10, h: 10 + Math.random() * 6, life: .9 + i * .14, max: .9 + i * .14, vx: 0, vy: 0, c: c || C.sun });
  };
  G.startEvent = function (type) {
    if (type !== 'market') return base.startEvent.call(this, type);
    this.endEvent();
    const W = this.world, S = W.mk, st = S.stage, p = S.picks, out = S.M.outcome, V = S.v, R = Math.random, [CX, CY] = S.center;
    const ev = this.event = { type: 'civ', ch: 'market', t: 0, props: [], roles: [], ents: [], fired: {}, swaps: [], flows: [] };
    const cast = (e, r) => { if (!e || !W.entities.includes(e)) return; this.assignRole(e, r); if (r.held) e.roleHeld = r.held; if (r.arm) e.roleArm = r.arm; if (r.sign) e.roleSign = r.sign; if (r.speed) { e._spd = e._spd || e.speed; e.speed = r.speed; } if (r.tool) e.tool = r.tool; if (r.carry) e.carry = r.carry; if (r.title) e.title = r.title; return e; };
    const door = o => { const d = W.door(o); return [d.x + .5, d.y + .5]; };
    const at = (o, dx, dy) => { if (!o) return null; const d = W.door(o), t = walkNear(W, d.x + (dx || 0), d.y + (dy || 0), 3); return t ? [t[0] + .5, t[1] + .5] : [d.x + .5, d.y + .5]; };
    const fieldSpot = i => S.fields[i] ? [S.fields[i][0] + .5, S.fields[i][1] + .5] : null;
    const tc = W.tally ? C.w2 : C.sun, money = W.tally ? 'scroll' : 'coin';
    const work = (e, spot, act, tool, icons, extra) => { if (!spot) return; cast(e, Object.assign({ x: spot[0], y: spot[1], act, tool, icons, rate: .08, dir: tool === 'rod' ? 'down' : undefined }, extra || {})); };
    const stand = (e, spot, act, icons, extra) => spot && cast(e, Object.assign({ x: spot[0], y: spot[1], act, icons, rate: .18 }, extra || {}));
    const route = (e, pts, act, extra) => cast(e, Object.assign({ route: pts, act }, extra || {}));
    const seller = (e, stall, act) => { if (!stall) return; const behind = W.walkable(stall.x, stall.y - 1) && W.walkable(stall.x + 1, stall.y - 1); stand(e, [stall.x + 1, behind ? stall.y + .3 : stall.y + 1.4], act || 'Minding the stall', [money, 'chat', 'star'], { sortY: behind ? stall.y + .5 : null, dir: behind ? 'down' : 'up', poses: ['talk', null, 'wave'] }); };
    const pondSpot = () => { const sh = W.poi('shore'); const q = LW.gen.nearestOf(W, sh, 10, 28) || [10, 28]; return [q[0] + .5, q[1] + .5]; };
    const treeSpot = () => { const tr = W.poi('trees').filter(t => t.x > 30 && t.x < 40 && t.y < 14); const t = tr[0]; if (!t) return [36, 6]; const s = walkNear(W, t.x - 1, t.y, 2) || [t.x, t.y + 1]; return [s[0] + .5, s[1] + .5]; };
    const [O, B, Tm, Pp, Wr] = V;
    if (st === 0) {
      const bl = S.blanket, bx = bl ? bl.x + 1 : CX, by = bl ? bl.y + 1.3 : CY + 2;
      const pair = (a, b, x, y, ga, gb) => { stand(a, [x - .7, y], 'Swapping ' + ga + ' for ' + gb, ['deal', 'question', 'chat'], { dir: 'side', flip: false, poses: ['talk', null] }); stand(b, [x + .7, y], 'Swapping ' + gb + ' for ' + ga, ['deal', 'heart', 'chat'], { dir: 'side', flip: true, poses: [null, 'talk'] }); ev.swaps.push({ a, b, ca: GOOD[ga], cb: GOOD[gb], t: R() * 2 }); };
      pair(O, Pp, bx, by, 'bread', 'fish');
      pair(B, Tm, CX + 4.5, CY - 1.5, 'wood', 'ore');
      route(Wr, [[CX - 1, CY + 3, 3, 'question'], [CX + 5, CY, 3, 'deal'], [CX - 4, CY - 3, 3, 'basket'], [CX + 1, CY - 4, 2, 'question']], 'Trying to trade a basket for anything', { carry: 'basket' });
      this.diaryAdd(null, 'Odile offers three loaves for two fish. Pip counter-offers one fish and a compliment.');
    } else if (st === 1) {
      if (p[0] === 'a') {
        work(O, fieldSpot(0), 'Hoeing her own field', 'hoe', ['wheat', 'heart']); work(Tm, fieldSpot(2), 'Planting cabbages on her plot', 'hoe', ['star']);
        work(Pp, pondSpot(), 'Fishing from his stretch of shore', 'rod', ['fish']); work(B, treeSpot(), 'Clearing his woodlot', 'axe', ['angry', 'bang']);
        work(Wr, fieldSpot(4) || [34, 28], 'Hammering in a boundary stake', 'hammer', ['deal', 'scroll']);
        this.diaryAdd(null, 'Bram moved his stake one tile west overnight. Odile noticed.');
      } else {
        const f = fieldSpot(0) || [8, 6], f2 = fieldSpot(2) || [7, 10];
        work(O, [f[0] - 1, f[1]], 'Working the common field', 'hoe', ['note', 'heart']); work(Tm, [f[0] + 1.2, f[1]], 'Working the common field', 'hoe', ['note']); work(Wr, f2, 'Weeding the shared cabbages', 'hoe', ['chat']);
        route(Pp, [[S.pasture[0], S.pasture[1], 4, 'heart'], [S.pasture[0] + 2, S.pasture[1] + 2, 3], [S.pasture[0] - 2, S.pasture[1] + 1, 3, 'note']], 'Minding the shared sheep');
        work(B, treeSpot(), 'Cutting wood for everyone', 'axe', ['heart']);
        this.diaryAdd(null, 'The commons notice board says: take what you need, leave the gate shut.');
      }
    } else if (st >= 2 && st < 7 || (st === 7 && (out === 'steady' || out === 'fair'))) {
      const bk = S.biz.bakery, sm = S.biz.smith, ml = S.biz.mill, ht = S.biz.hut, st0 = S.stalls[0], st1 = S.stalls[1];
      stand(O, at(bk, 1, 0), 'Selling bread at the bakery door', ['bread', money, 'chat'], { carry: 'bread', poses: [null, 'wave'] });
      if (sm) { const ax = sm.x + sm.fw, ay = sm.y + sm.fh - 1; work(Tm, [ax + .5, ay + .5], 'Hammering out horseshoes', 'hammer', ['bang', money], { face: [ax, ay + .5] }); ev.sparkE = Tm; }
      const millD = ml ? at(ml, -1, 0) : [36, 14], tree = treeSpot(), pond = pondSpot(), sell = st0 ? [st0.x + .5 + (W.walkable(st0.x, st0.y - 1) ? 0 : 0), st0.y + 1.5] : [CX, CY + 1];
      const pay = (from, c) => e => this.coinFly(from, e, c || tc, 2);
      if (st === 3 && p[2] === 'a' || (st >= 3 && p[2] === 'a' && out !== 'fair')) {
        stand(B, millD, 'Running the mill (and the payroll)', [money, 'bang', 'chat'], { outfit: 'vest', title: 'Mill owner', poses: ['talk', null] });
        route(Pp, [[tree[0], tree[1] + 1, 5], [millD[0] + 1, millD[1], 1.5, money, pay(B)]], 'Hauling logs for wages', { tool: 'axe', carry: 'wood', title: 'Mill hand' });
        if (st === 3 || !st0) route(Wr, [[tree[0] - 1, tree[1] + 1, 6], [millD[0] - 1, millD[1], 1.5, money, pay(B)]], 'Hauling logs for wages', { carry: 'wood', title: 'Mill hand' });
        else seller(Wr, st0, 'Selling at the market (on her day off)');
        this.diaryAdd(null, 'Payday at the mill: two pennies each. Bram keeps the rest.');
      } else if (st >= 3 && p[2] === 'b' && st < 5) {
        route(B, [[tree[0], tree[1], 6, null], [millD[0], millD[1], 2, 'heart']], 'Cutting logs for the co-op', { tool: 'axe', carry: 'wood' });
        route(Pp, [[pond[0], pond[1], 8], [sell[0], sell[1], 2, 'fish']], 'Fishing for the co-op', { carry: 'fish' });
        const tb = S.coopTable; if (tb) { stand(Wr, [tb.x + .5, tb.y + .45], 'Splitting the profit five ways', ['coin', 'scroll', 'heart'], { pose: 'eat', sortY: tb.y + .9, title: 'Co-op treasurer' }); ev.flows.push({ from: Wr, to: [O, B, Tm, Pp], every: 5, c: tc }); }
        else seller(Wr, st0);
        this.diaryAdd(null, 'Co-op meeting: profits split five ways. Pip asks for a sixth way for his cat.');
      } else {
        route(B, [[tree[0], tree[1], 6], [millD[0], millD[1], 2, money]], 'Cutting and milling timber', { tool: 'axe', carry: 'wood' });
        if (st >= 5 && p[4] === 'a' && S.biz.bank) stand(Wr, at(S.biz.bank, 1, 0), 'Running the counting house', ['coin', 'scroll', 'deal', 'up'], { outfit: 'vest', title: 'Banker', poses: ['talk', null] });
        else if (st >= 4 && S.booth) stand(Wr, [S.booth.x + .5, S.booth.y + 1.4], 'Collecting tolls at the gate', ['coin', 'scroll', 'bang'], { title: 'Toll keeper', dir: 'down' });
        else seller(Wr, st0);
        route(Pp, [[pond[0], pond[1], 8], [sell[0], sell[1], 2.2, money, e => this.coinFly(Wr, e, tc, 2)]], 'Selling his catch at the market', { tool: 'rod', carry: 'fish' });
      }
      if (st === 2) this.diaryAdd(null, W.tally ? 'Wren notches the first debt on the master tally: Pip owes Odile two loaves.' : 'The first penny changes hands. Odile prices bread at two.');
      if (st >= 4 && S.travelers) { S.travelers.forEach((e, k) => seller(e, S.stalls[2 + k], 'Selling cheap goods from the coast')); route(O, [[sell[0] + 3, sell[1] + 3, 3, 'question'], [at(bk, 1, 0)[0], at(bk, 1, 0)[1], 5, 'down']], 'Checking the caravan prices (nervously)', { carry: 'bread' }); this.diaryAdd(null, 'Coast bread sells for one penny. Odile is not amused.'); }
      if (st >= 4 && S.gate && S.cart) this.diaryAdd(null, 'The hay cart pays two pennies at the gate and grumbles all the way to the plaza.');
      if (st === 5 && p[4] === 'a') {
        S.sites.forEach((o, k) => { const e = [Tm, Pp][k]; if (!e) return; const s = walkNear(W, o.x + 1, o.y + o.fh, 2); if (s) { if (e === Tm) ev.sparkE = null; cast(e, { x: s[0] + .5, y: s[1] + .5, act: 'Building with borrowed money', tool: 'hammer', icons: ['hammer', 'up'], rate: .1, face: [s[0] + .5, s[1] - .5] }); ev.sites = (ev.sites || []).concat([[e, o]]); } });
        if (S.biz.bank) route(O, [[door(S.biz.bank)[0] - 1, door(S.biz.bank)[1] + 1, 3, 'scroll', e => this.coinFly(S.biz.bank, e, C.sun, 4)], [at(bk, 1, 0)[0], at(bk, 1, 0)[1], 6, 'up']], 'Taking out a loan for a second oven', { carry: 'bread' });
        this.diaryAdd(null, 'Wren lends forty pennies to Odile, sixty to Bram and a cautious ten to Tamsin.');
      }
      if (st === 5 && p[4] === 'b' && S.biz.granary) { const gd = at(S.biz.granary, 0, 0); route(Tm, [[gd[0], gd[1], 2, 'heart'], [fieldSpot(0) ? fieldSpot(0)[0] : 8, fieldSpot(0) ? fieldSpot(0)[1] : 7, 5]], 'Carrying grain to the granary', { carry: 'wheat' }); ev.sparkE = null; this.diaryAdd(null, 'The granary is full enough for two bad winters.'); }
      if (st >= 6 && p[5] === 'b' && (st === 6 || out === 'fair')) { const shops = [bk, sm, ml, st0, st1].filter(Boolean); ev.sparkE = null; cast(Tm, { route: shops.map(o => { const d = at(o, 0, 0); return [d[0], d[1], 3, pick(['scales', 'scroll', 'star'])]; }), act: 'Inspecting weights and prices', outfit: 'scholar', held: 'scroll', title: 'Market inspector' }); this.diaryAdd(null, "Tamsin checks the baker's scale. It is honest, mostly."); }
      if (st === 6 && p[5] === 'a') this.diaryAdd(null, 'Bread is up to ' + Math.round(2 * S.M.price) + ' pennies. Nobody is checking.');
      if (out === 'fair') this.diaryAdd(null, 'Market day every day. The inspector buys the first loaf.');
      if (out === 'steady') this.diaryAdd(null, 'Thirty years in, the books balance and the bakery still closes at five.');
    } else if (st === 7 && out === 'crash') {
      const bank = S.biz.bank, bd = bank ? at(bank, 0, 1) : [CX, CY];
      stand(Wr, [bd[0], bd[1]], 'Sitting outside the closed bank', ['heartbreak', 'down', 'scroll'], { pose: 'sit', title: 'Former banker', faceOv: 'sad' });
      route(B, [[bd[0] + 2, bd[1] + 1, 4, 'down'], [CX + 6, CY + 2, 3, 'angry'], [bd[0] - 2, bd[1] + 2, 3, 'question']], 'Asking where his savings went', { faceOv: 'angry' });
      route(O, [[1, CY + 1, 6, 'heartbreak'], [CX - 3, CY + 1, 4]], 'Leaving town with what fits in a sack', { held: 'sack', faceOv: 'sad', speed: 1 });
      route(Pp, [[52, CY + 1, 6, 'heartbreak'], [CX + 3, CY + 1, 4]], 'Looking for work downriver', { held: 'sack', faceOv: 'sad', speed: 1 });
      const sm = S.biz.smith; if (sm) { const ax = sm.x + sm.fw, ay = sm.y + sm.fh - 1; work(Tm, [ax + .5, ay + .5], 'Still working. Horses still need shoes.', 'hammer', ['bang'], { face: [ax, ay + .5] }); ev.sparkE = Tm; }
      this.diaryAdd(null, 'The counting house doors are chained. A note says: back soon.');
      this.diaryAdd(null, 'Half the loans were for buildings that were never finished.');
    } else if (st === 7 && out === 'gilded') {
      const rich = V[S.M.rich], md = S.manor ? at(S.manor, 0, 0) : [CX, CY - 6];
      stand(rich, md, 'Admiring the new manor', ['coin', 'up', 'star'], { outfit: 'sash', title: 'Richest in Copperfield', poses: ['cheer', null, null] });
      const others = V.filter(e => e !== rich), ml = S.biz.mill || S.biz.bank, md2 = ml ? at(ml, -1, 1) : [CX, CY];
      others.slice(0, 3).forEach((e, k) => stand(e, [md2[0] - 1.2 + k * 1.2, md2[1] + .6], 'On strike for a fair wage', ['fist', 'angry', 'bang'], { held: 'sign', arm: 2, sign: C.b400, outfit: 'rebel', poses: [null, 'cheer'], rate: .3 }));
      const last = others[3]; if (last) seller(last, S.stalls[0], 'Selling at triple the old price');
      this.diaryAdd(null, rich.name + ' owns the mill, the bank and most of the field.');
      this.diaryAdd(null, 'The strikers want four pennies a day. The manor has fourteen rooms.');
    } else if (st === 7 && out === 'commons') {
      const tb = S.supper; if (tb) [O, B, Tm, Pp].forEach((e, k) => stand(e, [tb.x + .5 + (k % 2), tb.y + (k < 2 ? .45 : 1.2)], 'Co-op supper', ['bowl', 'heart', 'note', 'laugh'], { pose: 'eat', dir: k < 2 ? 'down' : 'up', sortY: tb.y + (k < 2 ? .9 : 1.25), rate: .15 }));
      seller(Wr, S.stalls[0], 'Running the co-op stall');
      ev.flows.push({ from: Wr, to: [O, B, Tm, Pp], every: 6, c: tc });
      this.diaryAdd(null, 'Thursday co-op supper. The vote on a second bakery is tabled, again.');
    }
    if (st === 7 && (out === 'fair' || out === 'steady')) V.forEach(e => { e.faceOverride = 'happy'; });
  };
  G.eventUpdate = function (dt, sdt) {
    base.eventUpdate.call(this, dt, sdt);
    const ev = this.event; if (!ev || ev.ch !== 'market') return;
    const W = this.world, R = Math.random;
    ev.swaps.forEach(s => { if (s.a.path || s.b.path || !s.a.roleAt || !s.b.roleAt) return; s.t -= sdt; if (s.t <= 0) { s.t = 2.2 + R(); s.dir = !s.dir; this.coinFly(s.dir ? s.a : s.b, s.dir ? s.b : s.a, s.dir ? s.ca : s.cb, 1); if (R() < .4) (s.dir ? s.b : s.a).say(pick(['deal', 'heart', 'question']), 1.3); } });
    ev.flows.forEach(f => { f.t = (f.t == null ? f.every : f.t) - sdt; if (f.t <= 0 && f.from.roleAt && !f.from.path) { f.t = f.every; f.to.forEach((e, k) => setTimeout(() => this.world === W && this.coinFly(f.from, e, f.c, 1), k * 140)); f.from.say(W.tally ? 'scroll' : 'coin', 1.4); } });
    if (ev.sparkE && ev.sparkE.roleAt && !ev.sparkE.path && R() < sdt * 5) { const e = ev.sparkE; for (let i = 0; i < 3; i++) W.particles.push({ k: 'spark', x: e.x * T + (e.flip ? -6 : 6), y: e.y * T - 9, vx: (R() - .5) * 30, vy: -10 - R() * 20, life: .4 + R() * .3, max: .7, g: 60 }); }
    (ev.sites || []).forEach(([e, o]) => { if (e.roleAt && !e.path && R() < sdt * 2) this.puff(e.x * T + (R() - .5) * 8, e.y * T - 12, 1, C.s300); });
  };
  G.status = function () {
    const s = base.status.call(this); if (!s) return s; const W = this.world; if (!W.market) return s;
    const S = W.mk, M = S.M, tot = M.wealth.reduce((a, b) => a + b, 0);
    s.market = { stage: S.stage, picks: S.picks.slice(), outcome: M.outcome };
    s.realm = { year: STAGES[S.stage].year, chapter: STAGES[S.stage].name, gov: S.stage === 7 ? OUTCOMES[M.outcome].t : systemLabel(S.stage, S.picks), headline: S.stage < 7 ? HEAD[S.stage](S.picks) : OUTCOMES[M.outcome].d, meters: M.meters, factions: OWN.map((o, i) => [o.name, o.c, M.wealth[i] / tot]), factionsLabel: 'Share of wealth', lensName: 'property' };
    s.hasLens = !!W.fmap; s.lens = !!this.lens;
    return s;
  };
  G.selInfo = function () {
    const info = base.selInfo.call(this); if (!info) return info; const e = this.sel, W = this.world; if (!W.market) return info;
    const S = W.mk, unit = W.tally ? ' notches' : ' pennies';
    if (info.type === 'villager' && e.mkIdx != null) {
      const i = e.mkIdx, w = S.M.wealth[i], owns = [];
      if (S.stage >= 1) owns.push(S.picks[0] === 'a' ? 'a fenced plot' : 'a share of the commons');
      const bz = { 0: 'bakery', 1: 'mill', 2: 'smithy', 3: 'fishing hut', 4: S.biz.bank ? 'counting house' : 'market stall' }[i]; if (S.stage >= 2) owns.unshift(bz);
      if (S.manor && S.homes[i] === S.manor) owns.unshift('the manor');
      info.facts = [['Wealth', S.stage === 0 ? 'Whatever fits in a basket' : w + unit], ['Owns', owns.length ? owns.join(', ') : 'A tent and opinions'], ['Rank', S.M.rich === i ? 'Richest in town' : S.M.poor === i ? 'Poorest in town' : 'Getting by']].concat(info.facts.filter(f => f[0] === 'Personality'));
    }
    if (info.type === 'object' && e.price != null) info.home = 'Price: ' + e.price + unit;
    if (info.type === 'object' && e.id === 'coinpile' && e.owner != null) { info.activity = OWN[e.owner].name + "'s savings, piled where the neighbours can see."; info.home = S.M.wealth[e.owner] + unit; }
    return info;
  };
})();
