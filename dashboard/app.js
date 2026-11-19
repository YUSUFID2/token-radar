// TOKEN RADAR radar-2 — renders window.RADAR (data.js) with no network.
// Defensive by design: Builder A's data.js carries per-row `factors` and
// `farm_steps`; when either is absent the page derives the same numbers
// from the row's own snapshot figures, so the board still renders.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !DATA.rows) {
    if (app) app.textContent = 'No radar data loaded.';
    return;
  }
  var M = DATA.model || {};
  var BASE = typeof M.base_multiple === 'number' ? M.base_multiple : 0.25;
  var GW = typeof M.growth_weight === 'number' ? M.growth_weight : 0.5;
  var GF = typeof M.growth_floor === 'number' ? M.growth_floor : -60;
  var GC = typeof M.growth_cap === 'number' ? M.growth_cap : 120;
  var MF = typeof M.maturity_floor === 'number' ? M.maturity_floor : 0.6;
  var MR = typeof M.maturity_range === 'number' ? M.maturity_range : 0.4;
  var MD = typeof M.maturity_days === 'number' ? M.maturity_days : 1095;
  var UA = typeof M.unknown_age_days === 'number' ? M.unknown_age_days : 365;
  var FLOOR = DATA.floor_usd || 50000000;

  var state = { q: '', cat: 'all', chain: 'all', watch: false, sort: 'rank',
    tab: 'board', page: 1, sel: null, base: BASE, growth: GW };
  var PER = 25;

  // ---- formatting -------------------------------------------------------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMult(n) { return (typeof n === 'number' && isFinite(n)) ? n.toFixed(2) + 'x' : 'n/a'; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ---- model (DESIGN.md, one table, one place) ---------------------------
  var CAT_MULT = { 'risk curators': 1.25, 'onchain capital allocator': 1.20,
    'derivatives': 1.15, 'dexs': 1.10, 'lending': 1.05, 'cdp': 1.00,
    'rwa': 0.95, 'yield': 0.90, 'yield aggregator': 0.85, 'payments': 0.80 };
  function catMult(cat) {
    var c = (cat || '').toLowerCase();
    var keys = Object.keys(CAT_MULT);
    for (var i = 0; i < keys.length; i++) if (c.indexOf(keys[i]) >= 0) return CAT_MULT[keys[i]];
    return 1.00;
  }
  function catLabel(cat) {
    var c = (cat || '').toLowerCase();
    var keys = Object.keys(CAT_MULT);
    for (var i = 0; i < keys.length; i++) if (c.indexOf(keys[i]) >= 0) return keys[i];
    return 'other';
  }
  function likelihood(r, growthPct) {
    var l = 0.70;
    if ((r.age_days || 0) >= 365) l += 0.10;
    if (growthPct > 0) l += 0.10;
    if (['risk curators', 'onchain capital allocator', 'derivatives', 'dexs', 'lending']
      .indexOf(catLabel(r.category)) >= 0) l += 0.10;
    return clamp(l, 0.40, 1.00);
  }
  // Full factor set for a row: prefer data.js, else derive from the row.
  function factors(r) {
    var f = r.factors || {};
    var growthPct = clamp(r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d, GF, GC);
    var age = r.age_days === null || r.age_days === undefined ? UA : r.age_days;
    var base = typeof f.base_usd === 'number' ? f.base_usd : r.tvl_usd * BASE;
    var gm = typeof f.growth_multiplier === 'number' ? f.growth_multiplier : 1 + (growthPct / 100) * GW;
    var mm = typeof f.maturity_multiplier === 'number' ? f.maturity_multiplier
      : MF + (Math.min(Math.max(age, 0), MD) / MD) * MR;
    var cm = typeof f.category_multiplier === 'number' ? f.category_multiplier : catMult(r.category);
    var ch = typeof f.chain_multiplier === 'number' ? f.chain_multiplier
      : 1 + 0.02 * Math.min(Math.max((r.chains || []).length - 1, 0), 5);
    var lk = typeof f.likelihood === 'number' ? f.likelihood : likelihood(r, growthPct);
    return { base_usd: base, growth_pct: growthPct, growth_multiplier: gm,
      maturity_multiplier: mm, category_multiplier: cm, chain_multiplier: ch,
      likelihood: lk, age_days: age };
  }
  function impliedWith(r, baseMult, growthW) {
    var f = factors(r);
    var base = f.base_usd * (baseMult / BASE);
    var gm = 1 + (f.growth_pct / 100) * growthW;
    return Math.max(1, Math.round(base * gm * f.maturity_multiplier *
      f.category_multiplier * f.chain_multiplier * f.likelihood));
  }
  function isWatch(r) {
    if (r.watchlist === true) return true;
    return r.tvl_usd >= FLOOR;
  }

  // ---- farm plan fallback (same derivation as the model: category, chain,
  // TVL tier, age — never a protocol name) ---------------------------------
  function gasFor(chain) {
    if (chain === 'Ethereum') return '~$8';
    if (chain === 'Solana') return '~$0.05';
    if (['Arbitrum', 'Base', 'Optimism', 'Polygon'].indexOf(chain) >= 0) return '~$0.50';
    return '~$2';
  }
  function capitalFor(r) {
    if (r.tvl_usd >= 5e9) return 250;
    if (r.tvl_usd >= 1e9) return 150;
    if (r.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(r, cap, chain) {
    var c = (r.category || '').toLowerCase();
    var n = r.name;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return 'Deposit $' + cap + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('rwa') >= 0)
      return 'Mint $' + cap + ' of the protocol\u2019s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('cdp') >= 0)
      return 'Mint $' + cap + ' of stablecoin against collateral on ' + n + ' (' + chain + ') and keep the position healthy.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0)
      return 'Deposit $' + cap + ' of USDC as margin on ' + n + ' and open one small hedge.';
    if (c.indexOf('dex') >= 0)
      return 'Provide $' + cap + ' of liquidity to ' + n + '\u2019s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('lend') >= 0)
      return 'Supply $' + cap + ' of USDC to ' + n + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0)
      return 'Deposit $' + cap + ' into ' + n + '\u2019s main yield position on ' + chain + ' and keep it open.';
    if (c.indexOf('payment') >= 0)
      return 'Move $' + cap + ' through ' + n + ' on ' + chain + ' for a real payment and keep the receipt.';
    return 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(r) {
    if (Array.isArray(r.farm_steps) && r.farm_steps.length >= 3) return r.farm_steps;
    var chain = (r.chains && r.chains[0]) || 'its main chain';
    var cap = capitalFor(r), hold = holdFor(r.age_days), gas = gasFor(chain);
    return [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      actionFor(r, cap, chain) + ' Cost: $' + cap + ' of capital and about ' + gas + ' of gas. Time: 15 minutes to set up.',
      'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Cost: the $' + cap + ' stays in the position. Time: ' + hold + ' days.',
      'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.',
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.'
    ];
  }

  // ---- DOM helpers -------------------------------------------------------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  function $(id) { return document.getElementById(id); }

  // ---- filtering / sorting / sandbox ------------------------------------
  function sandboxOn() { return state.base !== BASE || state.growth !== GW; }
  function viewRows() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.rows.filter(function (r) {
      if (state.cat !== 'all' && (r.category || 'Other') !== state.cat) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watch && !isWatch(r)) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (sandboxOn()) {
      list = list.map(function (r) { return { r: r, v: impliedWith(r, state.base, state.growth) }; });
      list.sort(function (a, b) { return b.v - a.v || (a.r.slug < b.r.slug ? -1 : 1); });
      list = list.map(function (x, i) { x.r._sv = x.v; x.r._sr = i + 1; return x.r; });
    } else {
      var key = state.sort;
      list.sort(function (a, b) {
        var av, bv;
        if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
        else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
        else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
        else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
        else { av = a.rank; bv = b.rank; return av - bv; }
        if (av < bv) return 1;
        if (av > bv) return -1;
        return a.slug < b.slug ? -1 : 1;
      });
    }
    return list;
  }

  // ---- render: board -----------------------------------------------------
  function renderBoard() {
    var list = viewRows();
    var pages = Math.max(1, Math.ceil(list.length / PER));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PER;
    var page = list.slice(start, start + PER);
    var tbody = $('rows');
    tbody.textContent = '';
    var max = 1;
    list.forEach(function (r) {
      var v = sandboxOn() ? (r._sv || r.implied_value_usd) : r.implied_value_usd;
      if (v > max) max = v;
    });
    if (page.length === 0) {
      var tr0 = el('tr', null, el('td', { colspan: '8', class: 'empty', text: 'No protocol matches that filter. Clear the search or pick another category.' }));
      tbody.appendChild(tr0);
    }
    page.forEach(function (r) {
      var v = sandboxOn() ? r._sv : r.implied_value_usd;
      var rankTxt = sandboxOn() ? ('#' + r._sr + ' (was #' + r.rank + ')') : ('#' + r.rank);
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var tr = el('tr', {
        'data-selected': state.sel === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: rankTxt }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: r.slug + (isWatch(r) ? ' \u00b7 watchlist' : '') }))),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: (r.chains || []).slice(0, 2).join(', ') || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: g }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num imp' },
          el('span', { class: 'bar', 'aria-hidden': 'true' },
            el('i', { style: 'width:' + Math.max(3, Math.round((v / max) * 100)) + '%' })),
          el('span', { text: fmtUsd(v) })));
      tbody.appendChild(tr);
    });
    $('count').textContent = list.length === 0 ? '0 rows match.'
      : 'Showing ' + (start + 1) + '\u2013' + Math.min(start + PER, list.length) + ' of ' + list.length
        + ' rows' + (sandboxOn() ? ' \u00b7 sandbox re-rank active' : '')
        + (state.watch ? ' \u00b7 watchlist only' : '');
    $('pageinfo').textContent = 'Page ' + state.page + ' of ' + pages;
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= pages;
  }

  // ---- render: live ------------------------------------------------------
  function renderLive() {
    var tbody = $('live-rows');
    tbody.textContent = '';
    (DATA.live || []).forEach(function (r, i) {
      var ratio = (r.mcap_usd && r.mcap_usd > 0) ? (r.tvl_usd / r.mcap_usd).toFixed(2) + 'x' : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio })));
    });
    $('count').textContent = (DATA.live || []).length + ' live-token protocols, by market cap.';
  }

  // ---- render: detail ----------------------------------------------------
  function whyLine(r, f) {
    var drivers = [];
    if (f.growth_multiplier > 1.05) drivers.push('7d growth ' + fmtPct(r.change_7d) + ' lifts it ' + fmtMult(f.growth_multiplier));
    if (f.maturity_multiplier > 0.9) drivers.push('a long record with no token (maturity ' + fmtMult(f.maturity_multiplier) + ')');
    if (f.category_multiplier > 1.1) drivers.push('a ' + catLabel(r.category) + ' business (category ' + fmtMult(f.category_multiplier) + ')');
    if (f.chain_multiplier > 1.04) drivers.push('presence on ' + (r.chains || []).length + ' chains (' + fmtMult(f.chain_multiplier) + ')');
    if (f.likelihood >= 0.9) drivers.push('a high launch likelihood (' + f.likelihood.toFixed(2) + ')');
    var d = drivers.length ? drivers.join(', ') + ' — ' : '';
    return 'Why rank #' + r.rank + ': ' + fmtUsd(r.tvl_usd) + ' of TVL at a 0.25 base is '
      + fmtUsd(f.base_usd) + ', and ' + d + 'that compounds to ' + fmtUsd(r.implied_value_usd)
      + ', the ' + r.rank + (r.rank === 1 ? 'st' : r.rank === 2 ? 'nd' : r.rank === 3 ? 'rd' : 'th')
      + '-largest implied value on the board.';
  }
  function openDetail(slug) {
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.sel = slug;
    var f = factors(r);
    $('detail').hidden = false;
    $('detail-rank').textContent = 'RANK #' + r.rank + ' OF ' + DATA.rows.length + (isWatch(r) ? ' \u00b7 WATCHLIST' : '');
    $('detail-h').textContent = r.name;
    $('detail-sub').textContent = (r.category || 'Other') + ' on ' + ((r.chains || []).join(', ') || 'an unnamed chain') + ' \u00b7 ' + r.slug;
    var st = $('detail-stats');
    st.textContent = '';
    [['TVL', fmtUsd(r.tvl_usd)], ['7d change', fmtPct(r.change_7d)],
     ['Age', fmtAge(r.age_days)], ['Listed', r.listed_at || 'unknown'],
     ['Chains', String((r.chains || []).length)], ['Implied value', fmtUsd(r.implied_value_usd)]
    ].forEach(function (kv) {
      st.appendChild(el('div', null, el('dt', { text: kv[0] }), el('dd', { text: kv[1] })));
    });
    var eq = $('detail-model');
    eq.textContent = '';
    [['Base (TVL \u00d7 ' + BASE + ')', fmtUsd(f.base_usd)],
     ['Growth multiplier (7d ' + fmtPct(r.change_7d) + ')', fmtMult(f.growth_multiplier)],
     ['Maturity multiplier (' + fmtAge(r.age_days) + ')', fmtMult(f.maturity_multiplier)],
     ['Category multiplier (' + catLabel(r.category) + ')', fmtMult(f.category_multiplier)],
     ['Chain multiplier (' + (r.chains || []).length + ' chains)', fmtMult(f.chain_multiplier)],
     ['Launch likelihood', f.likelihood.toFixed(2)]
    ].forEach(function (kv) {
      eq.appendChild(el('div', null, el('dt', { text: kv[0] }), el('dd', { text: kv[1] })));
    });
    eq.appendChild(el('div', { class: 'total' },
      el('dt', { text: 'Implied value' }), el('dd', { text: fmtUsd(r.implied_value_usd) })));
    $('detail-why').textContent = whyLine(r, f);
    var ol = $('detail-steps');
    ol.textContent = '';
    farmSteps(r).forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      ol.appendChild(el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail })));
    });
    $('detail').scrollIntoView({ block: 'nearest' });
    renderBoard();
  }

  // ---- tabs / controls ---------------------------------------------------
  function setTab(tab) {
    state.tab = tab;
    $('tab-board').setAttribute('aria-pressed', tab === 'board' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-pressed', tab === 'live' ? 'true' : 'false');
    var boardPanel = document.querySelector('#board .panel');
    boardPanel.hidden = tab !== 'board';
    $('detail').hidden = tab !== 'board' || !state.sel;
    $('live').hidden = tab !== 'live';
    document.querySelector('.sandbox').hidden = tab !== 'board';
    document.querySelector('.pager').style.display = tab === 'board' ? '' : 'none';
    if (tab === 'live') renderLive(); else renderBoard();
  }
  function fillSelects() {
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category || 'Other'] = 1;
      (r.chains || []).forEach(function (c) { chains[c] = 1; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      $('cat').appendChild(el('option', { value: c, text: c }));
    });
    Object.keys(chains).sort().forEach(function (c) {
      $('chain').appendChild(el('option', { value: c, text: c }));
    });
  }
  function bind() {
    $('q').addEventListener('input', function () { state.q = $('q').value; state.page = 1; renderBoard(); });
    $('cat').addEventListener('change', function () { state.cat = $('cat').value; state.page = 1; renderBoard(); });
    $('chain').addEventListener('change', function () { state.chain = $('chain').value; state.page = 1; renderBoard(); });
    $('sort').addEventListener('change', function () { state.sort = $('sort').value; state.page = 1; renderBoard(); });
    $('watch').addEventListener('change', function () { state.watch = $('watch').checked; state.page = 1; renderBoard(); });
    $('prev').addEventListener('click', function () { if (state.page > 1) { state.page--; renderBoard(); } });
    $('next').addEventListener('click', function () { state.page++; renderBoard(); });
    $('tab-board').addEventListener('click', function () { setTab('board'); });
    $('tab-live').addEventListener('click', function () { setTab('live'); });
    $('detail-close').addEventListener('click', function () { state.sel = null; $('detail').hidden = true; renderBoard(); });
    $('base').addEventListener('input', function () {
      state.base = parseFloat($('base').value);
      $('base-val').textContent = state.base.toFixed(2);
      state.page = 1; renderBoard(); sandboxNote();
    });
    $('growth').addEventListener('input', function () {
      state.growth = parseFloat($('growth').value);
      $('growth-val').textContent = state.growth.toFixed(2);
      state.page = 1; renderBoard(); sandboxNote();
    });
    $('sandbox-reset').addEventListener('click', function () {
      state.base = BASE; state.growth = GW;
      $('base').value = String(BASE); $('growth').value = String(GW);
      $('base-val').textContent = BASE.toFixed(2); $('growth-val').textContent = GW.toFixed(2);
      state.page = 1; renderBoard(); sandboxNote();
    });
  }
  function sandboxNote() {
    $('sandbox-note').textContent = sandboxOn()
      ? 'Sandbox active: base ' + state.base.toFixed(2) + ', growth weight ' + state.growth.toFixed(2)
        + ' — the board above is re-ranked on those numbers. Reset to return to the published radar-2 ranking.'
      : 'Sandbox at radar-2 defaults (base 0.25, growth weight 0.50) — the board above is the published ranking.';
  }

  // ---- boot --------------------------------------------------------------
  fillSelects();
  bind();
  var top = DATA.rows.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; })[0];
  $('snap').textContent = 'Snapshot ' + DATA.as_of + ' \u00b7 '
    + (DATA.source || 'DefiLlama').split(',')[0].replace(/[a-z]+:\/\//g, '')
    + ' \u00b7 ' + DATA.rows.length + ' rows ranked \u00b7 ' + (DATA.watchlist_size || 40) + ' watchlist'
    + ' \u00b7 model ' + (DATA.model_version || 'radar-2');
  $('score-top').textContent = top ? fmtUsd(top.implied_value_usd) : '—';
  $('score-rows').textContent = String(DATA.rows.length);
  $('score-live').textContent = String((DATA.live || []).length);
  sandboxNote();
  renderBoard();
})();
