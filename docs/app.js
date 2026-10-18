/* MealMate web app — v1.1 */
(function () {
  'use strict';

  var VERSION = '1.1';
  var CFG = window.MEALMATE_CONFIG || {};
  var API = String(CFG.apiBase || '').replace(/\/$/, '');
  var app = document.getElementById('app');

  var CATEGORIES = ['Vegetable', 'Fruit', 'Meat', 'Fish', 'Dairy', 'Bakery', 'Store cupboard', 'Frozen', 'Drinks', 'Other'];
  var UNITS = ['', 'pieces', 'g', 'kg', 'ml', 'litre', 'pack', 'tin', 'jar', 'bag', 'bottle', 'bunch', 'head', 'slices'];
  var CAT_COLOURS = {
    Vegetable: ['#E8F3E8', '#22602A'], Fruit: ['#FFF1D6', '#7A4A00'], Meat: ['#FDE8E6', '#9B2C24'],
    Fish: ['#E7F0FB', '#2F6FB5'], Dairy: ['#E7F0FB', '#2F6FB5'], Bakery: ['#FFF1D6', '#7A4A00'],
    'Store cupboard': ['#FFF1D6', '#7A4A00'], Frozen: ['#E7F0FB', '#2F6FB5'], Drinks: ['#F1F3F0', '#444B44'], Other: ['#F1F3F0', '#444B44']
  };
  var LS = { code: 'mm_code', cache: 'mm_state', filters: 'mm_filters', alertSeen: 'mm_alert_seen', lastSync: 'mm_last_sync' };

  // ------------------------------------------------------------ icons
  function svg(paths, size, extra) {
    size = size || 24;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + paths + '</svg>';
  }
  var I = {
    home: function (s) { return svg('<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>', s); },
    list: function (s) { return svg('<path d="M4 6h16M4 12h16M4 18h16"/>', s); },
    search: function (s) { return svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', s); },
    heart: function (s, filled) { return svg('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"' + (filled ? ' fill="currentColor"' : '') + '/>', s); },
    more: function (s) { return '<svg width="' + (s || 24) + '" height="' + (s || 24) + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>'; },
    dots: function (s) { return '<svg width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>'; },
    chev: function (s) { return svg('<path d="M9 6l6 6-6 6"/>', s || 20); },
    back: function (s) { return svg('<path d="M15 6l-6 6 6 6"/>', s || 24); },
    plus: function (s) { return svg('<path d="M12 5v14M5 12h14"/>', s || 28, ' stroke-width="2.6"'); },
    clock: function (s) { return svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s || 14); },
    cart: function (s) { return svg('<path d="M3 4h2l2.4 11h10.2L20 8H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>', s); },
    cloud: function (s) { return svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a3.5 3.5 0 0 1 0 9H7z"/>', s); },
    down: function (s) { return svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', s); },
    up: function (s) { return svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', s); },
    filter: function (s) { return svg('<path d="M4 6h16M7 12h10M10 18h4"/>', s); },
    check: function (s) { return svg('<path d="M5 12l5 5 9-10"/>', s || 14, ' stroke-width="3"'); },
    clip: function (s) { return svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>', s); },
    trash: function (s) { return svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', s || 20); },
    edit: function (s) { return svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', s || 20); },
    bag: function (s) { return svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>', s || 20); },
    refresh: function (s) { return svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>', s || 20); }
  };
  var LOGO = '<svg width="64" height="58" viewBox="0 0 60 54" aria-hidden="true"><path d="M16 32 V20 a11 11 0 0 1 9-10.8 A12 12 0 0 1 44 20 V32 Z" fill="#2E7D32"/><rect x="14" y="32" width="32" height="8" rx="2" fill="#2E7D32"/><path d="M6 50 C6 36 16 28 28 28 C28 42 18 50 6 50 Z" fill="#6DBB72"/><path d="M52 48 C52 36 46 30 36 30 C36 42 42 48 52 48 Z" fill="#A8DBA9"/></svg>';

  // ------------------------------------------------------------ utils
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return isoOf(new Date()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); }
  function daysLeft(iso) {
    if (!iso) return null;
    var p = iso.split('-'), t = new Date();
    return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { if (!iso) return ''; var p = iso.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function fmtTime(iso) { if (!iso) return 'never'; var d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' at ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function plural(n, w, p) { return n + ' ' + (n === 1 ? w : (p || w + 's')); }
  function alertDays() { return (S.data && S.data.settings && S.data.settings.alertDays) || 3; }
  function qty(i) { return [i.quantity, i.unit].filter(Boolean).join(' '); }

  function expiryBadge(i) {
    if (i.status === 'not_bought') return '<span class="badge grey">To buy</span>';
    var d = daysLeft(i.expiry);
    if (d === null) return '';
    if (d < 0) return '<span class="badge red">Expired</span>';
    if (d === 0) return '<span class="badge red">Today</span>';
    var txt = plural(d, 'day');
    if (d <= alertDays()) return '<span class="badge red">' + txt + '</span>';
    if (d <= 7) return '<span class="badge amber">' + txt + '</span>';
    return '<span class="badge green">' + txt + '</span>';
  }
  function tile(name, category) {
    var c = CAT_COLOURS[category] || CAT_COLOURS.Other;
    return '<span class="tile" aria-hidden="true" style="background:' + c[0] + ';color:' + c[1] + '">' + esc((name || '?').charAt(0).toUpperCase()) + '</span>';
  }

  // ------------------------------------------------------------ state
  var S = {
    data: lsGet(LS.cache, null),
    lastSync: lsGet(LS.lastSync, null),
    online: true,
    recipes: null, recipeNote: '', recipeSource: null, recipeError: '', loadingRecipes: false, recipeChip: 'all',
    recipeIndex: {}, details: {},
    ingFilter: 'all',
    manageSel: {},
    filters: Object.assign({ diet: '', maxTime: 0, cuisine: '', onlyHave: false, includeNotBought: false, prioritiseExpiring: true }, lsGet(LS.filters, {})),
    route: null
  };
  function ingredients() { return (S.data && S.data.ingredients) || []; }
  function favourites() { return (S.data && S.data.favourites) || []; }
  function isFav(source, id) { return favourites().some(function (f) { return f.id === source + ':' + id; }); }
  function ingSignature(list) { return JSON.stringify((list || []).map(function (i) { return [i.id, i.name, i.status, i.expiry, i.storage]; })); }

  function applyState(s) {
    var changed = !S.data || ingSignature(S.data.ingredients) !== ingSignature(s.ingredients);
    S.data = s;
    lsSet(LS.cache, s);
    S.lastSync = new Date().toISOString();
    lsSet(LS.lastSync, S.lastSync);
    S.online = true;
    if (changed) { S.recipes = null; S.details = {}; }
  }

  function api(method, path, body) {
    var code = lsGet(LS.code, '');
    var opts = { method: method, headers: { Authorization: 'Bearer ' + code } };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (res.status === 401) {
          lsSet(LS.code, '');
          renderLogin('That household code was not accepted.');
          throw new Error('Wrong household code');
        }
        if (!res.ok) throw new Error(json.error || ('Server error ' + res.status));
        if (json.state) applyState(json.state);
        return json;
      });
    }, function () {
      S.online = false;
      throw new Error('Can’t reach MealMate right now. Check your connection.');
    });
  }

  function refresh(quiet) {
    return api('GET', '/api/state').then(function (s) {
      applyState(s);
      render();
      maybeShowExpiryAlert();
    }).catch(function (e) { if (!quiet) toast(e.message); render(); });
  }

  // ------------------------------------------------------------ UI helpers
  var toastTimer;
  function toast(msg, actionLabel, actionFn) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    clearTimeout(toastTimer);
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button type="button">' + esc(actionLabel) + '</button>' : '');
    if (actionLabel) el.querySelector('button').onclick = function () { el.remove(); actionFn(); };
    document.body.appendChild(el);
    toastTimer = setTimeout(function () { el.remove(); }, actionLabel ? 6000 : 3500);
  }

  function sheet(html, onReady) {
    closeSheet();
    var t = document.querySelector('.toast');
    if (t) t.remove();
    var bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    bd.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>' + html + '</div>';
    bd.addEventListener('click', function (e) { if (e.target === bd) closeSheet(); });
    document.body.appendChild(bd);
    if (onReady) onReady(bd.querySelector('.sheet'));
    var f = bd.querySelector('button, input, a');
    if (f) f.focus({ preventScroll: true });
    return bd;
  }
  function closeSheet() { var s = document.querySelector('.sheet-backdrop'); if (s) s.remove(); }

  function confirmSheet(title, text, okLabel, onOk) {
    sheet('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="actions">' +
      '<button type="button" class="sheet-item red" data-ok>' + esc(okLabel) + '</button>' +
      '<button type="button" class="sheet-item" data-cancel>Cancel</button></div>', function (el) {
      el.querySelector('[data-ok]').onclick = function () { closeSheet(); onOk(); };
      el.querySelector('[data-cancel]').onclick = closeSheet;
    });
  }

  function tabbar(active) {
    var tabs = [['home', '#/', 'Home', I.home()], ['ingredients', '#/ingredients', 'Ingredients', I.list()], ['recipes', '#/recipes', 'Recipes', I.search()], ['favourites', '#/favourites', 'Favourites', I.heart()], ['more', '#/more', 'More', I.more()]];
    return '<nav class="tabbar" aria-label="Main">' + tabs.map(function (t) {
      return '<a href="' + t[1] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '>' + t[3] + t[2] + '</a>';
    }).join('') + '</nav>';
  }

  function backLink(href, label) { return '<a class="icon-btn" href="' + href + '" aria-label="' + esc(label || 'Back') + '">' + I.back() + '</a>'; }

  // ------------------------------------------------------------ expiry alert on open
  function expiringItems() {
    var n = alertDays();
    return ingredients().filter(function (i) { var d = daysLeft(i.expiry); return i.status === 'have' && d !== null && d <= n; })
      .sort(function (a, b) { return a.expiry.localeCompare(b.expiry); });
  }

  function maybeShowExpiryAlert() {
    if (lsGet(LS.alertSeen, '') === todayISO()) return;
    var items = expiringItems();
    if (!items.length) return;
    lsSet(LS.alertSeen, todayISO());
    var expired = items.filter(function (i) { return daysLeft(i.expiry) < 0; });
    var soon = items.length - expired.length;
    var title = soon ? plural(soon, 'item') + ' to use soon' : plural(expired.length, 'item') + ' past the use-by date';
    sheet('<h2>' + esc(title) + '</h2><p>' + (expired.length && soon ? plural(expired.length, 'item has', 'items have') + ' also passed the use-by date.' : 'Here’s what needs using first.') + '</p>' +
      items.slice(0, 8).map(function (i) {
        return '<div class="row">' + tile(i.name, i.category) + '<div style="flex:1;min-width:0"><div class="name">' + esc(i.name) + '</div><div class="meta">Use by ' + esc(fmtDate(i.expiry)) + '</div></div>' + expiryBadge(i) + '</div>';
      }).join('') + (items.length > 8 ? '<p style="margin-top:8px">and ' + (items.length - 8) + ' more</p>' : '') +
      '<div class="actions"><button type="button" class="primary-btn" data-go>Find recipes using them</button><button type="button" class="sheet-item" data-close style="justify-content:center">Not now</button></div>',
    function (el) {
      el.querySelector('[data-go]').onclick = function () {
        closeSheet();
        if (!S.filters.prioritiseExpiring) { S.filters.prioritiseExpiring = true; lsSet(LS.filters, S.filters); S.recipes = null; }
        location.hash = '#/recipes';
      };
      el.querySelector('[data-close]').onclick = closeSheet;
    });
  }

  // ------------------------------------------------------------ views
  function viewHome() {
    var ings = ingredients();
    var have = ings.filter(function (i) { return i.status === 'have'; });
    var toBuy = ings.filter(function (i) { return i.status === 'not_bought'; });
    var exp = expiringItems();
    var expired = exp.filter(function (i) { return daysLeft(i.expiry) < 0; }).length;
    var alert = '';
    if (exp.length) {
      var head = expired === exp.length ? plural(expired, 'item has', 'items have') + ' expired'
        : plural(exp.length - expired, 'item') + ' expire' + (exp.length - expired === 1 ? 's' : '') + ' within ' + plural(alertDays(), 'day') + (expired ? ' · ' + expired + ' expired' : '');
      alert = '<a class="alert" href="#/ingredients"><div><strong>' + esc(head) + '</strong><div class="names">' + esc(exp.slice(0, 4).map(function (i) { return i.name; }).join(', ') + (exp.length > 4 ? '…' : '')) + '</div></div><span class="go">Review</span></a>';
    }
    return '<main class="screen">' +
      '<div class="brand">' + LOGO + '<div class="wordmark">Meal<span>Mate</span></div><div class="tagline">Turn your ingredients into<br>great meals</div></div>' +
      alert +
      '<a class="cta" href="#/recipes">' + I.search(24) + 'Find Recipes</a>' +
      '<div class="cards">' +
      navCard('#/ingredients', 'bg-blue', I.clip(22), 'My Ingredients', plural(have.length, 'item') + (exp.length ? ' · ' + exp.length + ' to use soon' : '')) +
      navCard('#/favourites', 'bg-red', I.heart(22), 'Favourites', plural(favourites().length, 'recipe')) +
      navCard('#/shopping', 'bg-green', I.cart(22), 'Shopping List', plural(toBuy.length, 'item')) +
      navCard('#/more', 'bg-blue', I.cloud(22), 'Import / Export', 'Share with your partner') +
      '</div><div class="footnote">MealMate v' + VERSION + (S.online ? '' : ' · offline, showing saved list') + '</div></main>' + tabbar('home');
  }
  function navCard(href, cls, icon, title, sub) {
    return '<a class="nav-card" href="' + href + '"><span class="ic ' + cls + '">' + icon + '</span><span class="txt"><strong>' + esc(title) + '</strong><small>' + esc(sub) + '</small></span><span class="chev">' + I.chev() + '</span></a>';
  }

  function sortByExpiry(a, b) { return (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.name.localeCompare(b.name); }

  function ingRow(i) {
    var meta = [qty(i)];
    if (i.status === 'not_bought') meta.push('Not bought yet');
    else meta.push(i.expiry ? 'Use by ' + fmtDate(i.expiry) : 'No expiry');
    return '<div class="row" data-name="' + esc(i.name.toLowerCase()) + '">' +
      '<a class="row-main" href="#/ingredient/' + esc(i.id) + '">' + tile(i.name, i.category) +
      '<span style="min-width:0"><span class="name" style="display:block">' + esc(i.name) + '</span>' +
      meta.filter(Boolean).map(function (m) { return '<span class="meta" style="display:block">' + esc(m) + '</span>'; }).join('') + '</span></a>' +
      expiryBadge(i) +
      '<button type="button" class="more-btn" data-action="ing-menu" data-id="' + esc(i.id) + '" aria-label="Options for ' + esc(i.name) + '">' + I.dots() + '</button></div>';
  }

  function viewIngredients(mode) {
    var shopping = mode === 'shopping';
    var all = ingredients();
    var have = all.filter(function (i) { return i.status === 'have'; });
    var short = have.filter(function (i) { return i.storage === 'short'; }).sort(sortByExpiry);
    var long = have.filter(function (i) { return i.storage === 'long'; }).sort(sortByExpiry);
    var toBuy = all.filter(function (i) { return i.status === 'not_bought'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var f = shopping ? 'not_bought' : S.ingFilter;
    var sections = [];
    if (f === 'all' || f === 'short') sections.push(['Short Life', '(Fridge / Freezer)', short]);
    if (f === 'all' || f === 'long') sections.push(['Long Life', '(Cupboard / Pantry)', long]);
    if (f === 'all' || f === 'not_bought') sections.push([shopping ? 'To buy' : 'Not bought yet', '(Shopping list)', toBuy]);
    var chips = shopping ? '' : '<div class="chips" role="group" aria-label="Show">' +
      [['all', 'All (' + all.length + ')'], ['short', 'Short Life (' + short.length + ')'], ['long', 'Long Life (' + long.length + ')'], ['not_bought', 'Not bought (' + toBuy.length + ')']].map(function (c) {
        return '<button type="button" class="chip" data-action="ing-filter" data-f="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + '</button>';
      }).join('') + '</div>';
    var body = sections.filter(function (s) { return s[2].length || f !== 'all'; }).map(function (s) {
      return '<section class="ing-section"><h2 class="section-title">' + esc(s[0]) + ' <span>' + esc(s[1]) + '</span></h2>' +
        (s[2].length ? s[2].map(ingRow).join('') : '<div class="empty" style="padding:20px 0">Nothing here yet.</div>') + '</section>';
    }).join('');
    if (!all.length) body = '<div class="empty"><strong>Your pantry is empty</strong>Tap + to add what’s in your fridge and cupboards.</div>';
    else if (shopping && !toBuy.length) body = '<div class="empty"><strong>Nothing to buy</strong>Add “not bought yet” items here, or add missing ingredients from a recipe.</div>';
    return '<main class="screen">' +
      '<div class="topbar">' + (shopping ? '<div class="side">' + backLink('#/', 'Back to home') + '</div>' : '<div class="side"><a class="text-btn" href="#/manage">Select</a></div>') +
      '<h1>' + (shopping ? 'Shopping List' : 'My Ingredients') + '</h1><div class="side right"></div></div>' +
      chips +
      '<div class="search">' + I.search(20) + '<label class="visually-hidden" for="ing-search">Search ingredients</label><input id="ing-search" type="search" placeholder="Search ingredients…" autocomplete="off"></div>' +
      '<div id="ing-list">' + body + '</div>' +
      '<div class="empty" id="no-match" hidden>No ingredients match.</div>' +
      '</main><a class="fab" href="#/ingredient/new' + (shopping ? '?tobuy=1' : '') + '" aria-label="Add ingredient">' + I.plus() + '</a>' + tabbar(shopping ? 'home' : 'ingredients');
  }

  function viewEdit(id, params) {
    var isNew = id === 'new';
    var i = isNew ? null : ingredients().filter(function (x) { return x.id === id; })[0];
    if (!isNew && !i) return '<main class="screen"><div class="topbar"><div class="side">' + backLink('#/ingredients') + '</div><h1>Ingredient</h1><div class="side"></div></div><div class="empty"><strong>Not found</strong>It may have been deleted on another phone.</div></main>';
    i = i || { name: '', category: 'Vegetable', storage: 'short', quantity: '', unit: '', expiry: '', status: params.tobuy ? 'not_bought' : 'have', notes: '' };
    var status = params.bought ? 'have' : i.status;
    var unitOpts = UNITS.slice();
    if (i.unit && unitOpts.indexOf(i.unit) < 0) unitOpts.push(i.unit);
    return '<main class="screen no-tabs"><form id="ing-form" novalidate>' +
      '<div class="topbar"><div class="side"><a class="text-btn" href="' + (params.from || '#/ingredients') + '">Cancel</a></div><h1>' + (isNew ? 'Add Ingredient' : 'Edit Ingredient') + '</h1><div class="side right"><button type="submit" class="pill-btn">Save</button></div></div>' +
      (params.bought ? '<div class="note">Bought it? Set the use-by date, then save to move it into your pantry.</div>' : '') +
      '<div class="form">' +
      '<div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" value="' + esc(i.name) + '" maxlength="80" autocapitalize="sentences" placeholder="e.g. Chicken thighs" required></div>' +
      '<div class="field"><label for="f-cat">Category</label><select id="f-cat" name="category">' + CATEGORIES.map(function (c) { return '<option' + (c === i.category ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><span class="label" id="l-type">Type</span><div class="segmented" role="radiogroup" aria-labelledby="l-type">' +
      '<label><input type="radio" name="storage" value="short"' + (i.storage !== 'long' ? ' checked' : '') + '><span>Short life</span></label>' +
      '<label><input type="radio" name="storage" value="long"' + (i.storage === 'long' ? ' checked' : '') + '><span>Long life</span></label></div></div>' +
      '<div class="two"><div class="field"><label for="f-qty">Quantity</label><input id="f-qty" name="quantity" type="text" inputmode="decimal" value="' + esc(i.quantity) + '" maxlength="20" placeholder="e.g. 500"></div>' +
      '<div class="field"><label for="f-unit">Unit</label><select id="f-unit" name="unit">' + unitOpts.map(function (u) { return '<option value="' + esc(u) + '"' + (u === i.unit ? ' selected' : '') + '>' + (u || '—') + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="f-exp">Use by</label><input id="f-exp" name="expiry" type="date" value="' + esc(i.expiry || '') + '">' +
      '<div class="quick" role="group" aria-label="Set use-by date">' +
      '<button type="button" data-days="3">Opened: 3 days</button><button type="button" data-days="7">1 week</button><button type="button" data-days="28">4 weeks</button><button type="button" data-days="42">6 weeks</button><button type="button" data-days="">No expiry</button></div>' +
      '<div class="hint">Opened something? Change the date to how long it lasts now.</div></div>' +
      '<div class="field"><label for="f-notes">Notes (optional)</label><textarea id="f-notes" name="notes" maxlength="300" placeholder="e.g. Opened pack – lasts about a week">' + esc(i.notes) + '</textarea></div>' +
      '<label class="check"><input type="checkbox" name="not_bought"' + (status === 'not_bought' ? ' checked' : '') + '>Not bought yet (add to shopping list)</label>' +
      '<div class="err" id="form-err" role="alert"></div>' +
      (isNew ? '' : '<button type="button" class="danger-btn" data-action="ing-delete" data-id="' + esc(i.id) + '">' + 'Delete ingredient</button>') +
      '</div></form></main>';
  }

  function viewManage() {
    var list = ingredients().slice().sort(function (a, b) { return a.status.localeCompare(b.status) || sortByExpiry(a, b); });
    var n = Object.keys(S.manageSel).filter(function (k) { return S.manageSel[k]; }).length;
    return '<main class="screen no-tabs"><div class="topbar"><div class="side">' + backLink('#/ingredients') + '</div><h1>Manage Ingredients</h1><div class="side right"><a class="text-btn" href="#/ingredients">Done</a></div></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><button type="button" class="delete-pill" data-action="manage-delete"' + (n ? '' : ' disabled') + '>Delete (' + n + ')</button>' +
      '<label class="check" style="color:var(--green);font-weight:600">Select all <input type="checkbox" data-action="manage-all"' + (n && n === list.length ? ' checked' : '') + '></label></div>' +
      '<div style="margin-top:8px">' + (list.length ? list.map(function (i) {
        var sel = !!S.manageSel[i.id];
        return '<label class="manage-row' + (sel ? ' sel' : '') + '"><input type="checkbox" data-action="manage-toggle" data-id="' + esc(i.id) + '"' + (sel ? ' checked' : '') + '>' + tile(i.name, i.category) +
          '<span style="flex:1;min-width:0"><span class="name" style="display:block;font-weight:600">' + esc(i.name) + '</span><span class="meta" style="display:block;font-size:12px;color:var(--muted)">' +
          esc([qty(i), i.status === 'not_bought' ? 'Not bought yet' : (i.expiry ? 'Use by ' + fmtDate(i.expiry) : 'No expiry')].filter(Boolean).join(' · ')) + '</span></span></label>';
      }).join('') : '<div class="empty">Nothing to manage yet.</div>') + '</div></main>';
  }

  // --- recipes
  function chipMatch(r, chip) {
    if (chip === 'quick') return r.readyInMinutes && r.readyInMinutes <= 30;
    if (chip === 'healthy') return r.healthy;
    if (chip === 'family') return r.servings && r.servings >= 4;
    if (chip === 'veg') return r.vegetarian;
    return true;
  }
  function loadRecipes(force) {
    if (S.loadingRecipes) return;
    if (S.recipes && !force) return;
    S.loadingRecipes = true; S.recipeError = '';
    render();
    api('POST', '/api/recipes/suggest', { filters: S.filters, today: todayISO() }).then(function (r) {
      S.recipes = r.recipes || []; S.recipeNote = r.note || ''; S.recipeSource = r.source;
      S.recipeIndex = {};
      S.recipes.forEach(function (x) { S.recipeIndex[x.source + ':' + x.id] = x; });
    }).catch(function (e) { S.recipeError = e.message; }).then(function () { S.loadingRecipes = false; render(); });
  }

  function recipeCard(r) {
    var tag = r.missedCount === 0 && !r.needsBuying.length ? '<div class="rtag ok">Ready to cook</div>'
      : '<div class="rtag need">Needs ' + esc(r.missed.concat(r.needsBuying).slice(0, 2).join(', ')) + (r.missedCount + r.needsBuying.length > 2 ? ' +' + (r.missedCount + r.needsBuying.length - 2) : '') + '</div>';
    var exp = r.usesExpiring && r.usesExpiring.length ? '<div class="rmeta" style="color:#9B2C24">Uses ' + esc(r.usesExpiring.slice(0, 2).join(', ')) + '</div>' : '';
    var fav = isFav(r.source, r.id);
    return '<div class="rcard"><a href="#/recipe/' + r.source + '/' + esc(r.id) + '" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;flex:1">' +
      '<div class="img">' + (r.image ? '<img src="' + esc(r.image) + '" alt="" loading="lazy">' : '') + '</div>' +
      '<div class="body"><h2>' + esc(r.title) + '</h2>' +
      '<div class="rmeta">' + I.clock() + (r.readyInMinutes ? r.readyInMinutes + ' mins' : 'Time not listed') + '</div>' +
      '<div class="rmeta">Uses ' + plural(r.usedCount, 'ingredient') + '</div>' + exp + tag + '</div></a>' +
      '<button type="button" class="heart" data-action="fav" data-key="' + esc(r.source + ':' + r.id) + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favourites' : 'Save to favourites') + '">' + I.heart(20, fav) + '</button></div>';
  }

  function viewRecipes() {
    if (!S.recipes && !S.loadingRecipes && !S.recipeError) setTimeout(function () { loadRecipes(); }, 0);
    var have = ingredients().filter(function (i) { return i.status === 'have'; }).length;
    var chips = [['all', 'All'], ['quick', 'Quick'], ['healthy', 'Healthy'], ['family', 'Family'], ['veg', 'Vegetarian']];
    var active = Object.keys(S.filters).filter(function (k) { return ['diet', 'maxTime', 'cuisine', 'onlyHave', 'includeNotBought'].indexOf(k) >= 0 && S.filters[k]; }).length;
    var head = '<div class="topbar">' + backLink('#/', 'Back to home') + '<div class="title-block" style="flex:1"><h1>Recipes for You</h1><div class="sub">Based on your ' + plural(have, 'ingredient') + '</div></div>' +
      '<a class="icon-btn" href="#/filters" aria-label="Filters' + (active ? ' (' + active + ' on)' : '') + '" style="position:relative">' + I.filter() + (active ? '<span style="position:absolute;top:6px;right:6px;width:9px;height:9px;border-radius:5px;background:var(--red)"></span>' : '') + '</a></div>' +
      '<div class="chips" role="group" aria-label="Quick filters">' + chips.map(function (c) { return '<button type="button" class="chip" data-action="recipe-chip" data-c="' + c[0] + '" aria-pressed="' + (S.recipeChip === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>';
    var body;
    if (S.loadingRecipes) {
      body = '<p class="lead" style="text-align:center">Finding recipes for your ingredients…</p><div class="grid">' + [0, 1, 2, 3].map(function () { return '<div class="rcard"><div class="img skeleton"></div><div class="body"><div class="skeleton" style="height:14px;border-radius:6px"></div><div class="skeleton" style="height:12px;width:60%;border-radius:6px;margin-top:6px"></div></div></div>'; }).join('') + '</div>';
    } else if (S.recipeError) {
      body = '<div class="empty"><strong>Couldn’t get recipes</strong>' + esc(S.recipeError) + '<div style="margin-top:14px"><button type="button" class="pill-btn" data-action="recipes-reload">Try again</button></div></div>';
    } else if (S.recipes) {
      var list = S.recipes.filter(function (r) { return chipMatch(r, S.recipeChip); }).slice(0, 10);
      body = (S.recipeNote ? '<div class="note">' + esc(S.recipeNote) + '</div>' : '') +
        (list.length ? '<div class="grid">' + list.map(recipeCard).join('') + '</div>'
          : '<div class="empty"><strong>No recipes found</strong>' + (S.filters.onlyHave ? 'No recipes use only what you have. Try turning off “Only use ingredients I have” in Filters.' : (S.recipeChip !== 'all' ? 'Try the All chip, or change your filters.' : 'Add a few more ingredients, or change your filters.')) + '</div>') +
        '<div style="display:flex;justify-content:center;margin-top:18px"><button type="button" class="text-btn" data-action="recipes-reload">' + I.refresh(18) + '&nbsp;Refresh ideas</button></div>' +
        (S.recipeSource === 'spoonacular' ? '<div class="attribution">Recipes powered by <a href="https://spoonacular.com/food-api" target="_blank" rel="noopener">spoonacular</a></div>'
          : S.recipeSource === 'mealdb' ? '<div class="attribution">Recipes from <a href="https://www.themealdb.com" target="_blank" rel="noopener">TheMealDB</a></div>' : '');
    } else body = '';
    return '<main class="screen">' + head + body + '</main>' + tabbar('recipes');
  }

  function viewFilters() {
    var f = S.filters;
    function group(label, key, opts) {
      return '<div><div class="settings-h" style="margin-top:20px">' + label + '</div><div class="chip-wrap" role="group" aria-label="' + label + '">' + opts.map(function (o) {
        return '<button type="button" class="chip" data-action="filter-pick" data-k="' + key + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(f[key]) === String(o[0])) + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';
    }
    return '<main class="screen no-tabs"><div class="topbar"><div class="side"><a class="text-btn plain" href="#/recipes" data-action="filters-cancel">Cancel</a></div><h1>Filters</h1><div class="side right"><button type="button" class="text-btn" data-action="filters-apply">Apply</button></div></div>' +
      group('Dietary', 'diet', [['', 'Any'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['gluten free', 'Gluten free'], ['dairy free', 'Dairy free'], ['high protein', 'High protein']]) +
      group('Cooking time', 'maxTime', [[0, 'Any'], [20, 'Under 20 mins'], [30, 'Under 30 mins'], [60, 'Under 1 hour']]) +
      group('Cuisine', 'cuisine', [['', 'Any'], ['Italian', 'Italian'], ['Indian', 'Indian'], ['Asian', 'Asian'], ['British', 'British'], ['Mexican', 'Mexican'], ['Mediterranean', 'Mediterranean']]) +
      '<div class="settings-h" style="margin-top:20px">Use ingredients</div>' +
      '<label class="check"><input type="checkbox" data-action="filter-check" data-k="onlyHave"' + (f.onlyHave ? ' checked' : '') + '>Only use ingredients I have</label>' +
      '<label class="check"><input type="checkbox" data-action="filter-check" data-k="includeNotBought"' + (f.includeNotBought ? ' checked' : '') + '>Include ‘not bought yet’ ingredients</label>' +
      '<label class="check"><input type="checkbox" data-action="filter-check" data-k="prioritiseExpiring"' + (f.prioritiseExpiring ? ' checked' : '') + '>Prioritise ingredients nearing expiry</label>' +
      '<div style="margin-top:22px"><button type="button" class="secondary-btn" data-action="filters-reset">Reset filters</button></div></main>';
  }

  var STATUS_LABEL = { have: '(You have this)', not_bought: '(Not bought yet)', missing: '(Missing)', staple: '(Store cupboard)' };

  function loadDetail(source, id) {
    var key = source + ':' + id;
    if (S.details[key]) return;
    S.details[key] = { loading: true };
    api('GET', '/api/recipes/' + source + '/' + encodeURIComponent(id) + '?today=' + todayISO()).then(function (d) {
      S.details[key] = { data: d };
    }).catch(function (e) { S.details[key] = { error: e.message }; }).then(function () {
      if (S.route && S.route.indexOf('#/recipe/' + source + '/' + id) === 0) render();
    });
  }

  function viewRecipe(source, id, sub) {
    var key = source + ':' + id;
    var entry = S.details[key];
    if (!entry) { setTimeout(function () { loadDetail(source, id); }, 0); entry = { loading: true }; }
    var summary = S.recipeIndex[key] || favourites().filter(function (f) { return f.id === key; })[0] || {};
    if (sub === 'shop') return viewShop(source, id, entry);
    var d = entry.data || {};
    var title = d.title || summary.title || 'Recipe';
    var image = d.image || summary.image;
    var mins = d.readyInMinutes || summary.readyInMinutes;
    var fav = isFav(source, id);
    var html = '<main class="screen no-tabs"><div class="hero">' + (image ? '<img src="' + esc(image) + '" alt="">' : '') +
      '<a class="back" href="#/recipes" data-action="go-back" aria-label="Back">' + I.back(22) + '</a>' +
      '<button type="button" class="heart" data-action="fav" data-key="' + esc(key) + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favourites' : 'Save to favourites') + '">' + I.heart(22, fav) + '</button>' +
      (mins ? '<span class="time">' + I.clock() + mins + ' mins</span>' : '') + '</div><div class="detail"><h1>' + esc(title) + '</h1>';
    if (entry.loading) return html + '<div style="padding:40px 0"><div class="spin"></div></div></div></main>';
    if (entry.error) return html + '<div class="empty"><strong>Couldn’t load this recipe</strong>' + esc(entry.error) + '<div style="margin-top:14px"><button type="button" class="pill-btn" data-action="detail-reload" data-key="' + esc(key) + '">Try again</button></div></div></div></main>';
    var counted = d.ingredients.filter(function (x) { return x.status !== 'staple'; });
    var haveN = counted.filter(function (x) { return x.status === 'have'; }).length;
    var toShop = d.ingredients.filter(function (x) { return x.status === 'missing' || x.status === 'not_bought'; });
    html += '<div class="meta">' + [d.servings ? 'Serves ' + d.servings : '', 'You have ' + haveN + ' of ' + counted.length + ' ingredients'].filter(Boolean).join(' · ') + '</div>' +
      (d.tags && d.tags.length ? '<div class="tags">' + d.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="h2row"><h2>Ingredients</h2>' + (d.servings ? '<small>Serves ' + d.servings + '</small>' : '') + '</div>' +
      d.ingredients.map(function (x) {
        var on = x.status === 'have' || x.status === 'staple';
        return '<div class="ing"><span class="box ' + (on ? 'on' : 'off') + '" aria-hidden="true">' + (on ? I.check() : '') + '</span><span class="nm">' + esc(x.label) + '</span><span class="amt">' + esc(x.amount) + '</span><span class="st ' + x.status + '">' + STATUS_LABEL[x.status] + '</span></div>';
      }).join('') +
      (d.steps && d.steps.length ? '<div class="h2row"><h2>Method</h2></div><ol class="steps">' + d.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '') +
      (d.sourceUrl ? '<p style="margin-top:6px"><a href="' + esc(d.sourceUrl) + '" target="_blank" rel="noopener">View the original recipe</a></p>' : '') +
      '<div class="attribution">' + (source === 'spoonacular' ? 'Recipe data powered by <a href="https://spoonacular.com/food-api" target="_blank" rel="noopener">spoonacular</a>' : 'Recipe from <a href="https://www.themealdb.com" target="_blank" rel="noopener">TheMealDB</a>') + '</div>' +
      '</div></main><div class="bottom-bar">' +
      (toShop.length ? '<a class="cta" style="margin:0;height:54px;font-size:16px" href="#/recipe/' + source + '/' + esc(id) + '/shop">' + I.cart(22) + 'Add to Shopping List (' + toShop.length + ')</a>'
        : '<button type="button" class="primary-btn" disabled>You have everything for this</button>') + '</div>';
    return html;
  }

  function viewShop(source, id, entry) {
    var back = '#/recipe/' + source + '/' + id;
    if (!entry.data) return '<main class="screen no-tabs"><div class="topbar"><div class="side">' + backLink(back) + '</div><h1>Add to Shopping List</h1><div class="side"></div></div><div style="padding:40px 0"><div class="spin"></div></div></main>';
    var items = entry.data.ingredients.filter(function (x) { return x.status === 'missing' || x.status === 'not_bought'; });
    return '<main class="screen no-tabs"><form id="shop-form"><div class="topbar"><div class="side">' + backLink(back) + '</div><h1>Add to Shopping List</h1><div class="side right"><button type="submit" class="text-btn">Done</button></div></div>' +
      '<div style="margin-top:8px">' + items.map(function (x, n) {
        var already = x.status === 'not_bought';
        return '<label class="row" style="cursor:pointer"><input type="checkbox" name="pick" value="' + n + '"' + (already ? ' disabled' : ' checked') + ' style="width:22px;height:22px;accent-color:var(--green);flex:none;margin:0">' +
          tile(x.label, 'Other') + '<span style="flex:1;min-width:0"><span class="name" style="display:block">' + esc(x.label) + '</span>' + (already ? '<span class="meta" style="display:block">Already on your list</span>' : '') + '</span><span class="meta">' + esc(x.amount) + '</span></label>';
      }).join('') + '</div>' +
      '<p class="lead" style="text-align:center;margin-top:24px">These ingredients will be saved to your shopping list and marked as “Not bought yet”.</p></form></main>';
  }

  function viewFavourites() {
    var favs = favourites();
    return '<main class="screen"><div class="topbar"><div class="side">' + backLink('#/', 'Back to home') + '</div><h1>Favourite Recipes</h1><div class="side"></div></div>' +
      (favs.length ? favs.map(function (f) {
        return '<div class="row fav-row"><a class="row-main" href="#/recipe/' + f.source + '/' + esc(f.recipeId) + '"><span class="tile" style="background:var(--green-soft)">' + (f.image ? '<img src="' + esc(f.image) + '" alt="" loading="lazy">' : '') + '</span>' +
          '<span style="min-width:0"><span class="name" style="display:block">' + esc(f.title) + '</span>' + (f.readyInMinutes ? '<span class="time-pill">' + I.clock(12) + f.readyInMinutes + ' mins</span>' : '') + '</span></a>' +
          '<button type="button" class="fav-heart" data-action="fav-remove" data-key="' + esc(f.id) + '" aria-label="Remove ' + esc(f.title) + ' from favourites">' + I.heart(24, true) + '</button></div>';
      }).join('') : '<div class="empty"><strong>No favourites yet</strong>Tap the heart on a recipe you like and it will be saved here for both of you.</div>') +
      '</main>' + tabbar('favourites');
  }

  function viewMore() {
    var connected = S.online && S.lastSync;
    var days = alertDays();
    return '<main class="screen"><div class="topbar"><div class="side">' + backLink('#/', 'Back to home') + '</div><h1>Import / Export</h1><div class="side"></div></div>' +
      '<p class="lead">Keep your ingredient list in sync with your partner or across devices.</p>' +
      '<div class="cards" style="margin-top:14px">' +
      '<button type="button" class="nav-card" data-action="export" style="width:100%;text-align:left;font:inherit"><span class="ic bg-blue">' + I.down(22) + '</span><span class="txt"><strong>Export to File</strong><small>Save your ingredients and favourites as a file to share</small></span><span class="chev">' + I.chev() + '</span></button>' +
      '<label class="nav-card" style="cursor:pointer"><span class="ic bg-blue">' + I.up(22) + '</span><span class="txt"><strong>Import from File</strong><small>Load a MealMate file someone shared</small></span><span class="chev">' + I.chev() + '</span><input type="file" id="import-file" accept=".json,application/json" class="visually-hidden"></label>' +
      '<div class="box-card"><div class="hd"><span class="ic bg-blue" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none">' + I.cloud(22) + '</span><span style="flex:1"><strong style="display:block;font-size:16px;font-weight:600">Shared pantry</strong><small style="font-size:13px;color:var(--muted)">Anyone with your household code sees the same list</small></span><span class="status ' + (connected ? 'ok' : 'off') + '">' + (connected ? 'Connected' : 'Offline') + '</span></div>' +
      '<div class="ft"><span>Last synced ' + esc(fmtTime(S.lastSync)) + '</span><button type="button" class="pill-btn" data-action="sync">Sync now</button></div></div></div>' +
      '<h2 class="settings-h">Expiry alerts</h2><div class="field"><label for="alert-days">Warn me when something expires within</label><select id="alert-days" data-action="alert-days">' +
      [1, 2, 3, 5, 7].map(function (n) { return '<option value="' + n + '"' + (n === days ? ' selected' : '') + '>' + plural(n, 'day') + '</option>'; }).join('') + '</select><div class="hint">You’ll see a reminder the first time you open MealMate each day.</div></div>' +
      '<h2 class="settings-h">This phone</h2><button type="button" class="secondary-btn" data-action="signout">Sign out of MealMate</button>' +
      '<div class="footnote">MealMate v' + VERSION + (S.data && S.data.serverVersion ? ' · server v' + esc(S.data.serverVersion) : '') + '</div></main>' + tabbar('more');
  }

  // ------------------------------------------------------------ login
  function renderLogin(err) {
    closeSheet();
    var noApi = !API;
    app.innerHTML = '<main class="login"><div class="brand">' + LOGO + '<div class="wordmark">Meal<span>Mate</span></div><div class="tagline">Turn your ingredients into<br>great meals</div></div>' +
      (noApi ? '<div class="note" style="margin-top:30px">The server address isn’t set yet. Edit <strong>config.js</strong> and set apiBase to your MealMate server address.</div>'
        : '<form class="form" id="login-form"><div class="field"><label for="code">Household code</label><input id="code" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>' +
        '<div class="hint">The code you chose when you set up the server. You only need to enter it once on each phone.</div></div>' +
        '<div class="err" role="alert">' + esc(err || '') + '</div><button type="submit" class="primary-btn">Continue</button></form>') + '</main>';
    var form = document.getElementById('login-form');
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      var code = document.getElementById('code').value.trim();
      if (!code) return;
      lsSet(LS.code, code);
      form.querySelector('button').disabled = true;
      api('GET', '/api/state').then(function (s) { applyState(s); S.route = null; render(); maybeShowExpiryAlert(); })
        .catch(function (e2) { if (lsGet(LS.code, '')) { lsSet(LS.code, ''); renderLogin(e2.message); } });
    };
  }

  // ------------------------------------------------------------ router
  function parseRoute() {
    var h = location.hash || '#/';
    var q = {};
    var qi = h.indexOf('?');
    if (qi >= 0) { h.slice(qi + 1).split('&').forEach(function (p) { var kv = p.split('='); q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '1'); }); h = h.slice(0, qi); }
    return { path: h.replace(/^#/, '') || '/', q: q };
  }

  function render() {
    if (!lsGet(LS.code, '') || !API) return renderLogin();
    var r = parseRoute();
    var parts = r.path.split('/').filter(Boolean);
    var html;
    if (!parts.length) html = viewHome();
    else if (parts[0] === 'ingredients') html = viewIngredients();
    else if (parts[0] === 'shopping') html = viewIngredients('shopping');
    else if (parts[0] === 'ingredient') html = viewEdit(parts[1] || 'new', Object.assign({}, r.q, { from: r.q.from ? '#/' + r.q.from : null }));
    else if (parts[0] === 'manage') html = viewManage();
    else if (parts[0] === 'recipes') html = viewRecipes();
    else if (parts[0] === 'filters') { if (S.route !== location.hash) S.draft = null; html = viewFilters(); }
    else if (parts[0] === 'recipe' && parts[2]) html = viewRecipe(parts[1], parts[2], parts[3]);
    else if (parts[0] === 'favourites') html = viewFavourites();
    else if (parts[0] === 'more') html = viewMore();
    else html = viewHome();

    var routeKey = location.hash;
    var keepScroll = routeKey === S.route;
    var y = window.scrollY;
    // keep the search text when re-rendering the ingredient list
    var search = document.getElementById('ing-search');
    var searchVal = keepScroll && search ? search.value : '';
    app.innerHTML = html;
    if (searchVal) { var s2 = document.getElementById('ing-search'); if (s2) { s2.value = searchVal; filterRows(searchVal); } }
    window.scrollTo(0, keepScroll ? y : 0);
    S.route = routeKey;
    bindForms();
  }

  function filterRows(q) {
    q = q.trim().toLowerCase();
    var any = false;
    document.querySelectorAll('#ing-list .ing-section').forEach(function (sec) {
      var shown = 0;
      sec.querySelectorAll('.row').forEach(function (row) {
        var ok = !q || row.getAttribute('data-name').indexOf(q) >= 0;
        row.hidden = !ok; if (ok) shown++;
      });
      sec.hidden = !!q && !shown;
      if (shown) any = true;
    });
    var nm = document.getElementById('no-match');
    if (nm) nm.hidden = !q || any;
  }

  function bindForms() {
    var search = document.getElementById('ing-search');
    if (search) search.oninput = function () { filterRows(search.value); };

    var form = document.getElementById('ing-form');
    if (form) {
      var F = form.elements;
      form.querySelectorAll('[data-days]').forEach(function (b) {
        b.onclick = function () { var d = b.getAttribute('data-days'); F.namedItem('expiry').value = d === '' ? '' : addDays(+d); };
      });
      form.onsubmit = function (e) {
        e.preventDefault();
        var nameEl = F.namedItem('name');
        var name = nameEl.value.trim();
        var err = document.getElementById('form-err');
        if (!name) { err.textContent = 'Please enter a name.'; nameEl.focus(); return; }
        var body = {
          name: name, category: F.namedItem('category').value, storage: form.querySelector('input[name=storage]:checked').value,
          quantity: F.namedItem('quantity').value.trim(), unit: F.namedItem('unit').value, expiry: F.namedItem('expiry').value || null,
          notes: F.namedItem('notes').value.trim(), status: F.namedItem('not_bought').checked ? 'not_bought' : 'have'
        };
        var id = parseRoute().path.split('/')[2];
        var btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        var p = id === 'new' ? api('POST', '/api/ingredients', body) : api('PUT', '/api/ingredients/' + encodeURIComponent(id), body);
        p.then(function () {
          toast(id === 'new' ? name + ' added' : 'Saved');
          var q = parseRoute().q;
          location.hash = q.from ? '#/' + q.from : (body.status === 'not_bought' && q.tobuy ? '#/shopping' : '#/ingredients');
        }).catch(function (e2) { btn.disabled = false; err.textContent = e2.message; });
      };
    }

    var shop = document.getElementById('shop-form');
    if (shop) shop.onsubmit = function (e) {
      e.preventDefault();
      var parts = parseRoute().path.split('/').filter(Boolean);
      var entry = S.details[parts[1] + ':' + parts[2]];
      var items = entry.data.ingredients.filter(function (x) { return x.status === 'missing' || x.status === 'not_bought'; });
      var picks = [].slice.call(shop.querySelectorAll('input[name=pick]:checked')).map(function (c) { return items[+c.value]; });
      var back = '#/recipe/' + parts[1] + '/' + parts[2];
      if (!picks.length) { location.hash = back; return; }
      api('POST', '/api/ingredients', { items: picks.map(function (x) { return { name: x.label, quantity: x.amount, unit: '', status: 'not_bought', storage: 'short', category: 'Other', expiry: null }; }) })
        .then(function () {
          delete S.details[parts[1] + ':' + parts[2]];
          toast('Added ' + plural(picks.length, 'item') + ' to your shopping list');
          location.hash = back;
        }).catch(function (e2) { toast(e2.message); });
    };

    var file = document.getElementById('import-file');
    if (file) file.onchange = function () {
      var f = file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); } catch (e) { toast('That file isn’t a MealMate export.'); return; }
        if (!data || data.app !== 'MealMate') { toast('That file isn’t a MealMate export.'); return; }
        var n = (data.ingredients || []).length, fv = (data.favourites || []).length;
        sheet('<h2>Import ' + plural(n, 'ingredient') + '?</h2><p>The file also has ' + plural(fv, 'favourite') + '. Merge adds them to your list and updates matching items. Replace deletes your current list first.</p>' +
          '<div class="actions"><button type="button" class="primary-btn" data-m="merge">Merge with my list</button><button type="button" class="sheet-item red" data-m="replace" style="justify-content:center">Replace my list</button><button type="button" class="sheet-item" data-c style="justify-content:center">Cancel</button></div>',
        function (el) {
          el.querySelector('[data-c]').onclick = closeSheet;
          el.querySelectorAll('[data-m]').forEach(function (b) {
            b.onclick = function () {
              var mode = b.getAttribute('data-m');
              var go = function () {
                closeSheet();
                api('POST', '/api/import', { mode: mode, data: data }).then(function (r) {
                  toast(mode === 'replace' ? 'Replaced with ' + plural(r.added, 'ingredient') : 'Added ' + r.added + ', updated ' + r.updated);
                  render();
                }).catch(function (e2) { toast(e2.message); });
              };
              if (mode === 'replace') confirmSheet('Replace your list?', 'This deletes everything currently in MealMate on both phones and replaces it with the file. A daily backup is kept on the server.', 'Replace', go);
              else go();
            };
          });
        });
        file.value = '';
      };
      reader.readAsText(f);
    };

    var ad = document.getElementById('alert-days');
    if (ad) ad.onchange = function () {
      api('PUT', '/api/settings', { alertDays: +ad.value }).then(function () { toast('Alerts set to ' + plural(+ad.value, 'day')); render(); }).catch(function (e) { toast(e.message); });
    };
  }

  // ------------------------------------------------------------ actions
  function favToggle(key) {
    var r = S.recipeIndex[key];
    var d = S.details[key] && S.details[key].data;
    var parts = key.split(':');
    if (isFav(parts[0], parts[1])) return removeFav(key);
    var src = d || r;
    if (!src) return;
    api('POST', '/api/favourites', { source: parts[0], recipeId: parts[1], title: src.title, image: src.image, readyInMinutes: src.readyInMinutes, servings: src.servings, sourceUrl: src.sourceUrl })
      .then(function () { toast('Saved to favourites'); render(); }).catch(function (e) { toast(e.message); });
  }
  function removeFav(key) {
    var old = favourites().filter(function (f) { return f.id === key; })[0];
    api('DELETE', '/api/favourites/' + encodeURIComponent(key)).then(function () {
      render();
      if (old) toast('Removed from favourites', 'Undo', function () { api('POST', '/api/favourites', old).then(render).catch(function (e) { toast(e.message); }); });
    }).catch(function (e) { toast(e.message); });
  }
  function deleteIngredient(id, after) {
    var i = ingredients().filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    confirmSheet('Delete ' + i.name + '?', 'It will be removed from MealMate on both phones.', 'Delete', function () {
      api('DELETE', '/api/ingredients/' + encodeURIComponent(id)).then(function () {
        if (after) location.hash = after; else render();
        toast(i.name + ' deleted', 'Undo', function () {
          var copy = Object.assign({}, i); delete copy.id;
          api('POST', '/api/ingredients', copy).then(render).catch(function (e) { toast(e.message); });
        });
      }).catch(function (e) { toast(e.message); });
    });
  }

  var actions = {
    'ing-filter': function (el) { S.ingFilter = el.getAttribute('data-f'); render(); },
    'ing-menu': function (el) {
      var id = el.getAttribute('data-id');
      var i = ingredients().filter(function (x) { return x.id === id; })[0];
      if (!i) return;
      var back = parseRoute().path === '/shopping' ? '&from=shopping' : '';
      sheet('<h2>' + esc(i.name) + '</h2><p>' + esc([qty(i), i.status === 'not_bought' ? 'Not bought yet' : (i.expiry ? 'Use by ' + fmtDate(i.expiry) : 'No expiry')].filter(Boolean).join(' · ')) + '</p><div class="actions">' +
        '<a class="sheet-item" href="#/ingredient/' + esc(id) + (back ? '?' + back.slice(1) : '') + '" style="text-decoration:none;color:inherit">' + I.edit() + 'Edit</a>' +
        (i.status === 'not_bought'
          ? '<a class="sheet-item" href="#/ingredient/' + esc(id) + '?bought=1' + back + '" style="text-decoration:none;color:inherit">' + I.check(20) + 'Mark as bought</a>'
          : '<button type="button" class="sheet-item" data-tobuy>' + I.bag() + 'Move to shopping list</button>') +
        '<button type="button" class="sheet-item red" data-del>' + I.trash() + 'Delete</button></div>', function (sh) {
        sh.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeSheet); });
        var tb = sh.querySelector('[data-tobuy]');
        if (tb) tb.onclick = function () {
          closeSheet();
          api('PUT', '/api/ingredients/' + encodeURIComponent(id), { status: 'not_bought' }).then(function () { toast(i.name + ' moved to your shopping list'); render(); }).catch(function (e) { toast(e.message); });
        };
        sh.querySelector('[data-del]').onclick = function () { closeSheet(); deleteIngredient(id); };
      });
    },
    'ing-delete': function (el) { deleteIngredient(el.getAttribute('data-id'), '#/ingredients'); },
    'manage-toggle': function (el) { S.manageSel[el.getAttribute('data-id')] = el.checked; render(); },
    'manage-all': function (el) { S.manageSel = {}; if (el.checked) ingredients().forEach(function (i) { S.manageSel[i.id] = true; }); render(); },
    'manage-delete': function () {
      var ids = Object.keys(S.manageSel).filter(function (k) { return S.manageSel[k]; });
      if (!ids.length) return;
      confirmSheet('Delete ' + plural(ids.length, 'item') + '?', 'They will be removed from MealMate on both phones.', 'Delete', function () {
        api('POST', '/api/ingredients/delete', { ids: ids }).then(function () { S.manageSel = {}; toast(plural(ids.length, 'item') + ' deleted'); render(); }).catch(function (e) { toast(e.message); });
      });
    },
    'recipe-chip': function (el) { S.recipeChip = el.getAttribute('data-c'); render(); },
    'recipes-reload': function () { S.recipes = null; S.recipeError = ''; loadRecipes(true); },
    'detail-reload': function (el) { var k = el.getAttribute('data-key'); delete S.details[k]; render(); },
    'fav': function (el) { favToggle(el.getAttribute('data-key')); },
    'fav-remove': function (el) { removeFav(el.getAttribute('data-key')); },
    'filter-pick': function (el) {
      var k = el.getAttribute('data-k'), v = el.getAttribute('data-v');
      S.draft = S.draft || Object.assign({}, S.filters);
      S.draft[k] = k === 'maxTime' ? +v : v;
      el.parentNode.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === el ? 'true' : 'false'); });
    },
    'filter-check': function (el) { S.draft = S.draft || Object.assign({}, S.filters); S.draft[el.getAttribute('data-k')] = el.checked; },
    'filters-apply': function () {
      if (S.draft) { S.filters = S.draft; S.draft = null; lsSet(LS.filters, S.filters); S.recipes = null; }
      location.hash = '#/recipes';
    },
    'filters-cancel': function () { S.draft = null; },
    'filters-reset': function () { S.draft = { diet: '', maxTime: 0, cuisine: '', onlyHave: false, includeNotBought: false, prioritiseExpiring: true }; S.filters = S.draft; S.draft = null; lsSet(LS.filters, S.filters); S.recipes = null; render(); },
    'go-back': function (el, e) { if (history.length > 1) { e.preventDefault(); history.back(); } },
    'sync': function () { refresh(false).then(function () { if (S.online) toast('Up to date'); }); },
    'export': function () {
      api('GET', '/api/export').then(function (data) {
        var name = 'mealmate-' + todayISO() + '.json';
        var text = JSON.stringify(data, null, 1);
        var file;
        try { file = new File([text], name, { type: 'application/json' }); } catch (e) { file = null; }
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'MealMate ingredients' }).catch(function () { /* cancelled */ });
        } else {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
          a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        }
      }).catch(function (e) { toast(e.message); });
    },
    'signout': function () {
      confirmSheet('Sign out on this phone?', 'Your pantry stays on the server. You’ll need the household code to sign back in.', 'Sign out', function () {
        lsSet(LS.code, ''); lsSet(LS.cache, null); S.data = null; renderLogin();
      });
    }
  };

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT') return;
    var fn = actions[el.getAttribute('data-action')];
    if (!fn) return;
    if (el.tagName === 'INPUT') { fn(el, e); return; }
    if (el.tagName === 'BUTTON' || el.getAttribute('data-action') === 'filters-apply') e.preventDefault();
    fn(el, e);
  });

  window.addEventListener('hashchange', function () { closeSheet(); render(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && lsGet(LS.code, '') && API) refresh(true);
  });

  // ------------------------------------------------------------ start
  render();
  if (lsGet(LS.code, '') && API) refresh(true);
})();
