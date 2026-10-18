'use strict';
/*
 * MealMate backend — v1.0.0
 * Zero-dependency Node.js server (Node 18+). Stores the shared pantry and
 * favourites in a JSON file and fetches recipe ideas from Spoonacular, with
 * TheMealDB as a fallback when Spoonacular is unavailable or out of quota.
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

loadEnvFile(path.join(__dirname, '.env'));

const VERSION = '1.0.0';
const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '127.0.0.1';
const HOUSEHOLD_CODE = process.env.MEALMATE_CODE || '';
const SPOON_KEY = process.env.SPOONACULAR_API_KEY || '';
const SPOON_BASE = (process.env.SPOONACULAR_BASE || 'https://api.spoonacular.com').replace(/\/$/, '');
const MEALDB_BASE = (process.env.MEALDB_BASE || 'https://www.themealdb.com/api/json/v1/1').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!HOUSEHOLD_CODE || HOUSEHOLD_CODE.length < 6) {
  console.error('MEALMATE_CODE must be set (at least 6 characters). Run install.sh or edit .env');
  process.exit(1);
}

const CATEGORIES = ['Vegetable', 'Fruit', 'Meat', 'Fish', 'Dairy', 'Bakery', 'Store cupboard', 'Frozen', 'Drinks', 'Other'];
const STAPLES = new Set(['salt', 'pepper', 'black pepper', 'water', 'ice', 'oil', 'olive oil', 'vegetable oil', 'sunflower oil', 'cooking spray']);

// ---------------------------------------------------------------- storage

const DATA_FILE = path.join(DATA_DIR, 'mealmate.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

let db = { schema: 1, ingredients: [], favourites: [], settings: { alertDays: 3 }, updatedAt: nowISO() };
if (fs.existsSync(DATA_FILE)) {
  try {
    db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (e) {
    console.error('Could not read data file — refusing to start so it is not overwritten:', e.message);
    process.exit(1);
  }
}

let writeChain = Promise.resolve();
function save() {
  db.updatedAt = nowISO();
  const snapshot = JSON.stringify(db, null, 1);
  writeChain = writeChain.then(async () => {
    const tmp = DATA_FILE + '.tmp';
    await fsp.writeFile(tmp, snapshot);
    await fsp.rename(tmp, DATA_FILE);
    await dailyBackup(snapshot);
  }).catch(e => console.error('Save failed:', e));
  return writeChain;
}

async function dailyBackup(snapshot) {
  const file = path.join(BACKUP_DIR, `mealmate-${nowISO().slice(0, 10)}.json`);
  if (fs.existsSync(file)) return;
  await fsp.writeFile(file, snapshot);
  const all = (await fsp.readdir(BACKUP_DIR)).filter(f => f.endsWith('.json')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 14))) await fsp.unlink(path.join(BACKUP_DIR, old));
}

// ---------------------------------------------------------------- helpers

function nowISO() { return new Date().toISOString(); }

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : (v == null ? '' : String(v).slice(0, max)); }

function isISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
}

function cleanIngredient(input, existing) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Invalid ingredient');
  const out = existing ? { ...existing } : { id: crypto.randomUUID(), createdAt: nowISO() };
  const has = k => Object.prototype.hasOwnProperty.call(input, k);
  if (has('name') || !existing) {
    const name = str(input.name, 80).trim();
    if (!name) throw new HttpError(400, 'Ingredient name is required');
    out.name = name;
  }
  if (has('category') || !existing) out.category = CATEGORIES.includes(input.category) ? input.category : 'Other';
  if (has('storage') || !existing) out.storage = input.storage === 'long' ? 'long' : 'short';
  if (has('quantity') || !existing) out.quantity = str(input.quantity, 20).trim();
  if (has('unit') || !existing) out.unit = str(input.unit, 20).trim();
  if (has('expiry') || !existing) {
    const e = input.expiry;
    if (e === null || e === '' || e === undefined) out.expiry = null;
    else if (isISODate(e)) out.expiry = e;
    else throw new HttpError(400, 'Expiry must be a date (YYYY-MM-DD)');
  }
  if (has('status') || !existing) out.status = input.status === 'not_bought' ? 'not_bought' : 'have';
  if (has('notes') || !existing) out.notes = str(input.notes, 300).trim();
  out.updatedAt = nowISO();
  return out;
}

function cleanFavourite(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Invalid favourite');
  const source = input.source === 'mealdb' ? 'mealdb' : 'spoonacular';
  const recipeId = str(input.recipeId, 40).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(recipeId)) throw new HttpError(400, 'Invalid recipe id');
  const title = str(input.title, 200).trim();
  if (!title) throw new HttpError(400, 'Recipe title is required');
  const image = str(input.image, 500);
  const sourceUrl = str(input.sourceUrl, 500);
  return {
    id: `${source}:${recipeId}`,
    source, recipeId, title,
    image: /^https:\/\//.test(image) ? image : '',
    readyInMinutes: Number.isFinite(+input.readyInMinutes) && +input.readyInMinutes > 0 ? Math.round(+input.readyInMinutes) : null,
    servings: Number.isFinite(+input.servings) && +input.servings > 0 ? Math.round(+input.servings) : null,
    sourceUrl: /^https?:\/\//.test(sourceUrl) ? sourceUrl : '',
    savedAt: input.savedAt && !isNaN(Date.parse(input.savedAt)) ? new Date(input.savedAt).toISOString() : nowISO(),
  };
}

// Name matching between recipe ingredients and pantry items
function singular(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(singular).join(' ');
}
function namesMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return (' ' + x + ' ').includes(' ' + y + ' ') || (' ' + y + ' ').includes(' ' + x + ' ');
}
function matchPantry(name, pantry) {
  let best = null;
  for (const p of pantry) {
    if (!namesMatch(name, p.name)) continue;
    if (!best || (best.status !== 'have' && p.status === 'have')) best = p;
  }
  return best;
}
function isStaple(name) { return STAPLES.has(norm(name)); }

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url, label) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'MealMate/' + VERSION } });
  } catch (e) {
    throw Object.assign(new Error(`${label} could not be reached`), { upstream: true });
  }
  if (!res.ok) {
    const err = new Error(`${label} returned ${res.status}`);
    err.upstream = true; err.upstreamStatus = res.status;
    throw err;
  }
  return res.json();
}

function qs(obj) {
  return Object.entries(obj).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx).catch(() => null); }
  });
  await Promise.all(workers);
  return out;
}

// Small TTL caches to save API quota
function makeCache(ttlMs, max) {
  const m = new Map();
  return {
    get(k) { const e = m.get(k); if (!e) return undefined; if (Date.now() > e.t) { m.delete(k); return undefined; } return e.v; },
    set(k, v) { m.set(k, { v, t: Date.now() + ttlMs }); if (m.size > max) m.delete(m.keys().next().value); },
  };
}
const spoonInfoCache = makeCache(24 * 3600e3, 500);
const mealdbCache = makeCache(24 * 3600e3, 1000);
const suggestCache = makeCache(6 * 3600e3, 100);

// ---------------------------------------------------------------- recipes

const CUISINE_AREAS = {
  Italian: ['Italian'],
  Indian: ['Indian'],
  Asian: ['Chinese', 'Japanese', 'Thai', 'Vietnamese', 'Malaysian', 'Filipino', 'Korean'],
  British: ['British', 'Irish'],
  Mexican: ['Mexican'],
  Mediterranean: ['Greek', 'Spanish', 'Portuguese', 'Croatian', 'Turkish', 'Moroccan', 'Tunisian', 'Italian', 'French'],
};

function readFilters(f) {
  f = f && typeof f === 'object' ? f : {};
  const diets = ['vegetarian', 'vegan', 'gluten free', 'dairy free', 'high protein'];
  const cuisines = Object.keys(CUISINE_AREAS);
  return {
    diet: diets.includes(f.diet) ? f.diet : '',
    maxTime: [20, 30, 60].includes(+f.maxTime) ? +f.maxTime : 0,
    cuisine: cuisines.includes(f.cuisine) ? f.cuisine : '',
    onlyHave: !!f.onlyHave,
    includeNotBought: !!f.includeNotBought,
    prioritiseExpiring: f.prioritiseExpiring !== false,
  };
}

function pantryContext(today, filters) {
  const alertDays = db.settings.alertDays || 3;
  const usable = db.ingredients.filter(i => i.status === 'have' || (filters.includeNotBought && i.status === 'not_bought'));
  const expiring = usable.filter(i => i.status === 'have' && i.expiry && (() => { const d = daysBetween(today, i.expiry); return d >= 0 && d <= alertDays; })());
  // Order: expiring first, then other short-life, then the rest
  const rank = i => expiring.includes(i) ? 0 : (i.storage === 'short' ? 1 : 2);
  const ordered = [...usable].sort((a, b) => rank(a) - rank(b) || (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  return { usable, expiring, ordered };
}

function scoreAndSort(list, filters) {
  for (const r of list) {
    r.score = r.usedCount - r.missedCount * 1.5 + (filters.prioritiseExpiring ? r.usesExpiring.length * 3 : 0);
  }
  return list.sort((a, b) => b.score - a.score || a.missedCount - b.missedCount);
}

function summarise(ingredientNames, ctx) {
  const used = [], missed = [], needsBuying = [], usesExpiring = [];
  for (const n of ingredientNames) {
    if (isStaple(n)) continue;
    const p = matchPantry(n, ctx.usable);
    if (!p) { missed.push(n); continue; }
    used.push(n);
    if (p.status === 'not_bought') needsBuying.push(n);
    if (ctx.expiring.includes(p) && !usesExpiring.includes(p.name)) usesExpiring.push(p.name);
  }
  return { used, missed, needsBuying, usesExpiring, usedCount: used.length, missedCount: missed.length };
}

// --- Spoonacular

async function spoonSuggest(ctx, filters) {
  const names = [...new Set(ctx.ordered.map(i => i.name))].slice(0, 30);
  const found = await fetchJson(`${SPOON_BASE}/recipes/findByIngredients?` + qs({
    ingredients: names.join(','), number: 25, ranking: 2, ignorePantry: true, apiKey: SPOON_KEY,
  }), 'Spoonacular');
  if (!Array.isArray(found) || !found.length) return [];
  const ids = found.map(r => r.id);
  const missing = ids.filter(id => !spoonInfoCache.get(id));
  if (missing.length) {
    const infos = await fetchJson(`${SPOON_BASE}/recipes/informationBulk?` + qs({
      ids: missing.join(','), includeNutrition: filters.diet === 'high protein', apiKey: SPOON_KEY,
    }), 'Spoonacular');
    for (const info of infos || []) spoonInfoCache.set(info.id, info);
  }
  const out = [];
  for (const id of ids) {
    const info = spoonInfoCache.get(id);
    if (!info) continue;
    if (!spoonPassesFilters(info, filters)) continue;
    const ingNames = (info.extendedIngredients || []).map(e => e.nameClean || e.name);
    out.push({
      source: 'spoonacular', id: String(info.id), title: info.title, image: info.image || '',
      readyInMinutes: info.readyInMinutes || null, servings: info.servings || null,
      healthy: !!info.veryHealthy || (info.healthScore || 0) >= 50,
      vegetarian: !!info.vegetarian,
      sourceUrl: info.sourceUrl || info.spoonacularSourceUrl || '',
      ...summarise(ingNames, ctx),
    });
  }
  return out;
}

function spoonPassesFilters(info, f) {
  if (f.maxTime && (!info.readyInMinutes || info.readyInMinutes > f.maxTime)) return false;
  if (f.diet === 'vegetarian' && !info.vegetarian) return false;
  if (f.diet === 'vegan' && !info.vegan) return false;
  if (f.diet === 'gluten free' && !info.glutenFree) return false;
  if (f.diet === 'dairy free' && !info.dairyFree) return false;
  if (f.diet === 'high protein') {
    const p = (info.nutrition?.nutrients || []).find(n => n.name === 'Protein');
    if (!p || p.amount < 25) return false;
  }
  if (f.cuisine) {
    const c = (info.cuisines || []).map(x => x.toLowerCase());
    const want = [f.cuisine.toLowerCase(), ...CUISINE_AREAS[f.cuisine].map(x => x.toLowerCase())];
    if (f.cuisine === 'Asian' && c.some(x => ['asian', 'chinese', 'japanese', 'thai', 'korean', 'vietnamese'].includes(x))) return true;
    if (!c.some(x => want.includes(x))) return false;
  }
  return true;
}

async function spoonDetail(id, ctx) {
  let info = spoonInfoCache.get(+id) || spoonInfoCache.get(id);
  if (!info) {
    info = await fetchJson(`${SPOON_BASE}/recipes/${encodeURIComponent(id)}/information?` + qs({ includeNutrition: false, apiKey: SPOON_KEY }), 'Spoonacular');
    spoonInfoCache.set(info.id, info);
  }
  const ingredients = (info.extendedIngredients || []).map(e => {
    const m = e.measures?.metric;
    const amount = m && m.amount ? `${+m.amount.toFixed(m.amount < 10 ? 1 : 0)} ${m.unitShort || ''}`.trim() : '';
    return { name: e.nameClean || e.name, label: capitalise(e.nameClean || e.name), amount, original: e.original || '' };
  });
  let steps = (info.analyzedInstructions?.[0]?.steps || []).map(s => s.step);
  if (!steps.length && info.instructions) steps = stripHtml(info.instructions).split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
  return {
    source: 'spoonacular', id: String(info.id), title: info.title, image: info.image || '',
    readyInMinutes: info.readyInMinutes || null, servings: info.servings || null,
    sourceUrl: info.sourceUrl || info.spoonacularSourceUrl || '', sourceName: info.sourceName || 'Spoonacular',
    tags: [...(info.dishTypes || []).slice(0, 2), ...(info.diets || []).slice(0, 2)].map(capitalise),
    ingredients: annotate(ingredients, ctx), steps,
  };
}

// --- TheMealDB (fallback)

async function mealdbLookup(id) {
  const hit = mealdbCache.get('l' + id);
  if (hit) return hit;
  const data = await fetchJson(`${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(id)}`, 'TheMealDB');
  const meal = data?.meals?.[0] || null;
  if (meal) mealdbCache.set('l' + id, meal);
  return meal;
}

async function mealdbFilter(name) {
  const key = 'f' + norm(name);
  const hit = mealdbCache.get(key);
  if (hit) return hit;
  const tryName = async n => (await fetchJson(`${MEALDB_BASE}/filter.php?i=${encodeURIComponent(n.trim().toLowerCase().replace(/\s+/g, '_'))}`, 'TheMealDB'))?.meals || [];
  let meals = await tryName(name);
  if (!meals.length && name.trim().includes(' ')) meals = await tryName(name.trim().split(/\s+/).pop());
  mealdbCache.set(key, meals);
  return meals;
}

function mealIngredients(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const n = (meal['strIngredient' + i] || '').trim();
    if (!n) continue;
    out.push({ name: n, label: capitalise(n), amount: (meal['strMeasure' + i] || '').trim(), original: '' });
  }
  return out;
}

async function mealdbSuggest(ctx, filters) {
  const keys = [...new Set(ctx.ordered.filter(i => !isStaple(i.name)).map(i => i.name))].slice(0, 5);
  const hits = new Map();
  for (const k of keys) {
    for (const m of await mealdbFilter(k).catch(() => [])) hits.set(m.idMeal, (hits.get(m.idMeal) || 0) + 1);
  }
  const ids = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);
  const meals = (await mapLimit(ids, 5, mealdbLookup)).filter(Boolean);
  const out = [];
  for (const meal of meals) {
    if (filters.diet === 'vegetarian' && !['Vegetarian', 'Vegan'].includes(meal.strCategory)) continue;
    if (filters.diet === 'vegan' && meal.strCategory !== 'Vegan') continue;
    if (filters.cuisine && !CUISINE_AREAS[filters.cuisine].includes(meal.strArea)) continue;
    out.push({
      source: 'mealdb', id: meal.idMeal, title: meal.strMeal, image: meal.strMealThumb || '',
      readyInMinutes: null, servings: null, healthy: false,
      vegetarian: ['Vegetarian', 'Vegan'].includes(meal.strCategory),
      sourceUrl: meal.strSource || '',
      ...summarise(mealIngredients(meal).map(i => i.name), ctx),
    });
  }
  return out;
}

async function mealdbDetail(id, ctx) {
  const meal = await mealdbLookup(id);
  if (!meal) throw new HttpError(404, 'Recipe not found');
  const steps = String(meal.strInstructions || '').split(/\r?\n+/).map(s => s.replace(/^(step\s*)?\d+[.)]?\s*/i, '').trim()).filter(s => s.length > 2);
  return {
    source: 'mealdb', id: meal.idMeal, title: meal.strMeal, image: meal.strMealThumb || '',
    readyInMinutes: null, servings: null, sourceUrl: meal.strSource || '', sourceName: 'TheMealDB',
    tags: [meal.strCategory, meal.strArea].filter(Boolean),
    ingredients: annotate(mealIngredients(meal), ctx), steps,
  };
}

function annotate(ingredients, ctx) {
  return ingredients.map(i => {
    if (isStaple(i.name)) return { ...i, status: 'staple' };
    const p = matchPantry(i.name, ctx.usable);
    return { ...i, status: p ? p.status : 'missing', pantryId: p ? p.id : null };
  });
}

function capitalise(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

async function suggest(body) {
  const filters = readFilters(body.filters);
  const today = isISODate(body.today) ? body.today : nowISO().slice(0, 10);
  const ctxF = pantryContext(today, filters);
  if (!ctxF.usable.length) return { source: null, recipes: [], note: 'Add some ingredients first and MealMate will find recipes for them.' };

  const cacheKey = crypto.createHash('sha1').update(JSON.stringify([ctxF.ordered.map(i => [i.name, i.status, i.expiry]), filters, today])).digest('hex');
  const cached = suggestCache.get(cacheKey);
  if (cached) return cached;

  let result;
  let note = '';
  if (SPOON_KEY) {
    try {
      result = { source: 'spoonacular', recipes: await spoonSuggest(ctxF, filters) };
    } catch (e) {
      if (!e.upstream) throw e;
      note = e.upstreamStatus === 402
        ? 'Spoonacular\'s daily limit has been reached, so these recipes come from TheMealDB.'
        : 'Spoonacular is unavailable right now, so these recipes come from TheMealDB.';
      console.warn('Spoonacular failed, using TheMealDB:', e.message);
    }
  } else {
    note = 'No Spoonacular key is set, so these recipes come from TheMealDB.';
  }
  if (!result) {
    try {
      result = { source: 'mealdb', recipes: await mealdbSuggest(ctxF, filters) };
    } catch (e) {
      if (!e.upstream) throw e;
      throw new HttpError(502, 'Recipe services could not be reached. Try again in a minute.');
    }
  }
  let recipes = scoreAndSort(result.recipes, filters);
  if (filters.onlyHave) recipes = recipes.filter(r => r.missedCount === 0);
  result.recipes = recipes.slice(0, 25);
  result.note = note;
  if (result.source === 'mealdb' && filters.maxTime) result.note = (note ? note + ' ' : '') + 'TheMealDB has no cooking times, so the time filter was not applied.';
  suggestCache.set(cacheKey, result);
  return result;
}

async function recipeDetail(source, id, today) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new HttpError(400, 'Invalid recipe id');
  const ctx = pantryContext(isISODate(today) ? today : nowISO().slice(0, 10), { includeNotBought: true });
  try {
    if (source === 'spoonacular') {
      if (!SPOON_KEY) throw new HttpError(503, 'Spoonacular key not configured');
      return await spoonDetail(id, ctx);
    }
    if (source === 'mealdb') return await mealdbDetail(id, ctx);
  } catch (e) {
    if (e.upstream) throw new HttpError(502, e.upstreamStatus === 402 ? 'Spoonacular\'s daily limit has been reached. Try again tomorrow.' : 'The recipe service could not be reached.');
    throw e;
  }
  throw new HttpError(404, 'Unknown recipe source');
}

// ---------------------------------------------------------------- auth + http

const failures = new Map(); // ip -> {count, until}
function clientIp(req) { return req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }
const codeHash = crypto.createHash('sha256').update(HOUSEHOLD_CODE).digest();

function checkAuth(req) {
  const ip = clientIp(req);
  const f = failures.get(ip);
  if (f && f.count >= 10 && Date.now() < f.until) throw new HttpError(429, 'Too many wrong codes. Try again in 15 minutes.');
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const given = crypto.createHash('sha256').update(m ? m[1] : '').digest();
  if (m && crypto.timingSafeEqual(given, codeHash)) { failures.delete(ip); return; }
  const next = f && Date.now() < f.until ? f.count + 1 : 1;
  failures.set(ip, { count: next, until: Date.now() + 15 * 60e3 });
  throw new HttpError(401, 'Wrong household code');
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new HttpError(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function state() {
  return { ingredients: db.ingredients, favourites: db.favourites, settings: db.settings, updatedAt: db.updatedAt, serverVersion: VERSION };
}

const routes = [
  ['GET', /^\/api\/health$/, async () => ({ ok: true, version: VERSION, spoonacular: !!SPOON_KEY }), { public: true }],

  ['GET', /^\/api\/state$/, async () => state()],

  ['POST', /^\/api\/ingredients$/, async (req, body) => {
    const items = Array.isArray(body.items) ? body.items : [body];
    if (items.length > 200) throw new HttpError(400, 'Too many items');
    const created = items.map(i => cleanIngredient(i));
    db.ingredients.push(...created);
    await save();
    return { created, state: state() };
  }],

  ['PUT', /^\/api\/ingredients\/([\w-]+)$/, async (req, body, [id]) => {
    const idx = db.ingredients.findIndex(i => i.id === id);
    if (idx < 0) throw new HttpError(404, 'Ingredient not found — it may have been deleted on another phone');
    db.ingredients[idx] = cleanIngredient(body, db.ingredients[idx]);
    await save();
    return { updated: db.ingredients[idx], state: state() };
  }],

  ['DELETE', /^\/api\/ingredients\/([\w-]+)$/, async (req, body, [id]) => {
    db.ingredients = db.ingredients.filter(i => i.id !== id);
    await save();
    return { state: state() };
  }],

  ['POST', /^\/api\/ingredients\/delete$/, async (req, body) => {
    const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
    db.ingredients = db.ingredients.filter(i => !ids.has(i.id));
    await save();
    return { state: state() };
  }],

  ['POST', /^\/api\/favourites$/, async (req, body) => {
    const fav = cleanFavourite(body);
    db.favourites = db.favourites.filter(f => f.id !== fav.id);
    db.favourites.unshift(fav);
    await save();
    return { favourite: fav, state: state() };
  }],

  ['DELETE', /^\/api\/favourites\/([\w%:-]+)$/, async (req, body, [id]) => {
    const fid = decodeURIComponent(id);
    db.favourites = db.favourites.filter(f => f.id !== fid);
    await save();
    return { state: state() };
  }],

  ['PUT', /^\/api\/settings$/, async (req, body) => {
    const d = Math.round(+body.alertDays);
    if (!(d >= 1 && d <= 30)) throw new HttpError(400, 'Alert days must be between 1 and 30');
    db.settings.alertDays = d;
    await save();
    return { state: state() };
  }],

  ['GET', /^\/api\/export$/, async () => ({
    app: 'MealMate', schema: 1, exportedAt: nowISO(), ingredients: db.ingredients, favourites: db.favourites,
  })],

  ['POST', /^\/api\/import$/, async (req, body) => {
    const data = body.data || {};
    if (data.app !== 'MealMate') throw new HttpError(400, 'That file is not a MealMate export');
    const incoming = (Array.isArray(data.ingredients) ? data.ingredients : []).slice(0, 1000);
    const favs = (Array.isArray(data.favourites) ? data.favourites : []).slice(0, 1000);
    const cleanIngs = [];
    for (const raw of incoming) {
      try {
        const c = cleanIngredient(raw);
        if (typeof raw.id === 'string' && /^[\w-]{8,64}$/.test(raw.id)) c.id = raw.id;
        cleanIngs.push(c);
      } catch { /* skip bad rows */ }
    }
    const cleanFavs = [];
    for (const f of favs) { try { cleanFavs.push(cleanFavourite(f)); } catch { /* skip */ } }

    let added = 0, updated = 0;
    if (body.mode === 'replace') {
      db.ingredients = cleanIngs; db.favourites = cleanFavs;
      added = cleanIngs.length;
    } else {
      for (const c of cleanIngs) {
        const idx = db.ingredients.findIndex(i => i.id === c.id || (norm(i.name) === norm(c.name) && i.status === c.status && i.storage === c.storage));
        if (idx >= 0) { db.ingredients[idx] = { ...c, id: db.ingredients[idx].id, createdAt: db.ingredients[idx].createdAt }; updated++; }
        else { db.ingredients.push(c); added++; }
      }
      for (const f of cleanFavs) if (!db.favourites.some(x => x.id === f.id)) db.favourites.push(f);
    }
    await save();
    return { added, updated, favourites: cleanFavs.length, state: state() };
  }],

  ['POST', /^\/api\/recipes\/suggest$/, async (req, body) => suggest(body)],

  ['GET', /^\/api\/recipes\/(spoonacular|mealdb)\/([\w-]+)$/, async (req, body, [source, id], url) =>
    recipeDetail(source, id, url.searchParams.get('today'))],
];

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  try {
    for (const [method, re, handler, opts] of routes) {
      if (method !== req.method) continue;
      const m = re.exec(url.pathname);
      if (!m) continue;
      if (!opts?.public) checkAuth(req);
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
      return send(res, 200, await handler(req, body, m.slice(1), url));
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Something went wrong on the server' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MealMate server v${VERSION} on http://${HOST}:${PORT} — Spoonacular ${SPOON_KEY ? 'on' : 'off'}; origins: ${ALLOWED_ORIGINS.join(', ') || '(none)'}`);
});

process.on('SIGTERM', async () => { await writeChain; process.exit(0); });
process.on('SIGINT', async () => { await writeChain; process.exit(0); });

// ---------------------------------------------------------------- .env loader

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
