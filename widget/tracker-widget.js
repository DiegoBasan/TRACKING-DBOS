// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;

/* =========================================================
   Tracker · Widget mediano (2×1) para Scriptable
   Izquierda: calendario del mes con puntos por categoría
   Derecha: tareas de hoy y próximas, con ícono, color y avance
   Datos: Firestore (diagram-diapp / tracking-dbos) vía REST
   ========================================================= */

const APP_URL = 'https://diegobasan.github.io/TRACKING-DBOS/';
const API_KEY = 'AIzaSyDfWuyJFV2vV8yQAdngrorTMZWn9p0DIqI';
const FS_URL = 'https://firestore.googleapis.com/v1/projects/diagram-diapp/databases/(default)/documents/tracking-dbos/app/actividades?pageSize=300&key=' + API_KEY;
const CAT_URL = APP_URL + 'categorias.js';
const MAX_ROWS = 4;

// ---------- Colores (claro / oscuro) ----------
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg: dyn('#ffffff', '#141414'),
  ink: dyn('#141414', '#f0f0f0'),
  inv: dyn('#ffffff', '#141414'),
  mut: dyn('#8b8b8b', '#8a8a8a'),
  out: dyn('#c4c4c4', '#4a4a4a'),
  soft: dyn('#f2f2f2', '#222222'),
  red: dyn('#e5262f', '#ff4d55'),
};
const alpha = (hex, a) => new Color(hex, a);

// ---------- Caché local ----------
const fm = FileManager.local();
const cachePath = n => fm.joinPath(fm.documentsDirectory(), 'tracker-' + n);
const save = (n, s) => { try { fm.writeString(cachePath(n), s) } catch (e) {} };
const load = n => { try { return fm.fileExists(cachePath(n)) ? fm.readString(cachePath(n)) : null } catch (e) { return null } };

async function getText(url, name) {
  try {
    const r = new Request(url); r.timeoutInterval = 12;
    const t = await r.loadString();
    if (r.response && r.response.statusCode >= 400) throw new Error('HTTP ' + r.response.statusCode);
    save(name, t); return { t, offline: false };
  } catch (e) {
    const t = load(name); if (t) return { t, offline: true };
    throw e;
  }
}

// ---------- Firestore REST → objetos JS ----------
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return obj(v.mapValue.fields || {});
  return null;
}
const obj = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));

// ---------- Categorías (mismas reglas que la app) ----------
let CAT;
const norm = s => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9!]+/g, ' ') + ' ';
const mk = kw => kw[0] === '=' ? new RegExp(' ' + kw.slice(1) + ' ') : new RegExp(' ' + kw);
let CAT_RX, ICON_RX;
function prepCats() {
  CAT_RX = Object.fromEntries(Object.entries(CAT.CAT_KW).map(([k, v]) => [k, v.map(mk)]));
  ICON_RX = CAT.ICON_KW.map(([i, v]) => [i, v.map(mk)]);
}
const txt = a => (a.titulo || '') + ' ' + (a.notas || '');
function catOf(a) {
  if (CAT.CATS[a.categoria]) return a.categoria;
  const t = norm(txt(a)); if (/!!/.test(txt(a))) return 'urgente';
  for (const k of CAT.CAT_ORDER) if (CAT_RX[k].some(r => r.test(t))) return k;
  return 'general';
}
function iconOf(a) {
  if (a.icono && CAT.ICON_SF[a.icono]) return a.icono;
  const t = norm(txt(a));
  for (const [i, rs] of ICON_RX) if (rs.some(r => r.test(t))) return i;
  return CAT.CATS[catOf(a)].i;
}

// ---------- Fechas ----------
const pad = n => String(n).padStart(2, '0');
const Y = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const P = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x };
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const sh = s => { const d = P(s); return d.getDate() + ' ' + MES3[d.getMonth()] };
const now = new Date(), TODAY = Y(now), TOMORROW = Y(addD(now, 1));

// ---------- Estado ----------
function status(a) {
  const e = a.etapas || [];
  if (a.tipo === 'tracker' && e.length) {
    const d = e.filter(x => x.completada).length;
    if (d === e.length) return 'Completada';
    if (d > 0) return 'En curso';
  }
  return a.estado || 'Pendiente';
}

// ---------- Símbolos ----------
function sym(key, size, weight) {
  const name = CAT.ICON_SF[key] || 'circle.fill';
  let s = SFSymbol.named(name) || SFSymbol.named('circle.fill');
  s.applyFont(weight === 'bold' ? Font.boldSystemFont(size) : Font.semiboldSystemFont(size));
  return s.image;
}

// =========================================================
async function main() {
  const catRes = await getText(CAT_URL, 'cats.js');
  CAT = JSON.parse(catRes.t.slice(catRes.t.indexOf('{'), catRes.t.lastIndexOf('}') + 1));
  prepCats();

  const fsRes = await getText(FS_URL, 'data.json');
  const docs = (JSON.parse(fsRes.t).documents || []).map(d => obj(d.fields || {}));
  const acts = docs.filter(a => a.id && a.inicio).map(a => ({ ...a, fin: a.fin || a.inicio }));

  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 12, 12, 12);
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const row = w.addStack();
  row.layoutHorizontally();
  row.topAlignContent();

  drawCalendar(row.addStack(), acts);
  row.addSpacer(12);
  drawList(row.addStack(), acts, fsRes.offline);

  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
}

// ---------- Calendario ----------
function drawCalendar(col, acts) {
  col.layoutVertically();
  col.size = new Size(142, 0);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const start = addD(first, -first.getDay());
  const end = addD(last, 6 - last.getDay());
  const weeks = Math.round((end - start) / 864e5 + 1) / 7;
  const rowH = weeks >= 6 ? 16 : 18.5;

  const h = col.addStack();
  const t = h.addText(MES[now.getMonth()].replace(/^./, c => c.toUpperCase()));
  t.font = Font.heavySystemFont(12); t.textColor = C.ink;
  col.addSpacer(3);

  const dow = col.addStack();
  ['D', 'L', 'M', 'M', 'J', 'V', 'S'].forEach(l => {
    const c = dow.addStack(); c.size = new Size(20, 10); c.centerAlignContent();
    const x = c.addText(l); x.font = Font.mediumMonospacedSystemFont(7.5); x.textColor = C.mut;
  });

  for (let ws = start; ws <= end; ws = addD(ws, 7)) {
    const r = col.addStack();
    for (let i = 0; i < 7; i++) {
      const d = addD(ws, i), ds = Y(d), inMonth = d.getMonth() === now.getMonth();
      const cell = r.addStack(); cell.size = new Size(20, rowH); cell.layoutVertically(); cell.centerAlignContent();
      // número
      const nr = cell.addStack(); nr.layoutHorizontally(); nr.addSpacer();
      const nb = nr.addStack(); nb.size = new Size(14, 12); nb.centerAlignContent(); nb.cornerRadius = 6;
      if (ds === TODAY) nb.backgroundColor = C.ink;
      const n = nb.addText(String(d.getDate()));
      n.font = ds === TODAY ? Font.heavySystemFont(8.5) : Font.semiboldSystemFont(8.5);
      n.textColor = ds === TODAY ? C.inv : inMonth ? C.ink : C.out;
      n.minimumScaleFactor = 0.7;
      nr.addSpacer();
      // puntos de color (hasta 3)
      const day = acts.filter(a => a.inicio <= ds && a.fin >= ds)
        .sort((a, b) => (status(a) === 'Completada') - (status(b) === 'Completada'));
      const dr = cell.addStack(); dr.layoutHorizontally(); dr.addSpacer(); dr.spacing = 1.5;
      if (day.length) {
        day.slice(0, 3).forEach(a => {
          const s = status(a), c = CAT.CATS[catOf(a)].c;
          const dot = dr.addStack(); dot.size = new Size(3.5, 3.5); dot.cornerRadius = 1.75;
          dot.backgroundColor = alpha(c, s === 'Completada' ? 0.3 : s === 'Pendiente' ? 0.55 : 1);
        });
      } else { const e = dr.addStack(); e.size = new Size(3.5, 3.5) }
      dr.addSpacer();
    }
  }
}

// ---------- Lista ----------
function drawList(col, acts, offline) {
  col.layoutVertically();
  const todayActs = acts.filter(a => a.inicio <= TODAY && a.fin >= TODAY && status(a) !== 'Completada');
  const lateActs = acts.filter(a => a.fin < TODAY && status(a) !== 'Completada');
  const prio = a => (catOf(a) === 'urgente' ? 0 : 3) + (status(a) === 'En curso' ? 0 : 1);
  let items = [...lateActs, ...todayActs].sort((a, b) => prio(a) - prio(b) || a.fin.localeCompare(b.fin));
  const upcoming = acts.filter(a => a.inicio > TODAY && status(a) !== 'Completada').sort((a, b) => a.inicio.localeCompare(b.inicio));
  const total = items.length;
  items = items.concat(upcoming).slice(0, MAX_ROWS);

  // encabezado
  const h = col.addStack(); h.layoutHorizontally(); h.centerAlignContent();
  const t = h.addText('Hoy'); t.font = Font.heavySystemFont(12); t.textColor = C.ink;
  h.addSpacer(5);
  const d = h.addText(`${DIA3[now.getDay()]} ${now.getDate()} ${MES3[now.getMonth()]}`); d.font = Font.semiboldSystemFont(9.5); d.textColor = C.mut;
  h.addSpacer();
  const cnt = h.addText(offline ? 'sin conexión' : String(total)); cnt.font = Font.boldSystemFont(9); cnt.textColor = offline ? C.red : C.mut;
  col.addSpacer(7);

  if (!items.length) {
    const e = col.addText('Nada pendiente 🎉'); e.font = Font.semiboldSystemFont(11); e.textColor = C.mut;
    col.addSpacer(); return;
  }

  items.forEach((a, i) => {
    if (i) col.addSpacer(5);
    const s = status(a), cat = CAT.CATS[catOf(a)], c = cat.c;
    const isLate = a.fin < TODAY, isUp = a.inicio > TODAY;
    const r = col.addStack(); r.layoutHorizontally(); r.centerAlignContent();

    // ícono: pendiente = opaco, en curso = lleno
    const tile = r.addStack(); tile.size = new Size(20, 20); tile.cornerRadius = 6; tile.centerAlignContent();
    tile.backgroundColor = s === 'En curso' ? new Color(c) : alpha(c, isUp ? 0.12 : 0.2);
    const img = tile.addImage(sym(iconOf(a), 10, 'bold'));
    img.imageSize = new Size(11, 11);
    img.tintColor = s === 'En curso' ? Color.white() : alpha(c, isUp ? 0.6 : 1);
    r.addSpacer(7);

    const tx = r.addStack(); tx.layoutVertically();
    const ti = tx.addText(a.titulo || ''); ti.font = Font.semiboldSystemFont(11); ti.lineLimit = 1;
    ti.textColor = isUp ? C.mut : C.ink;

    // subtítulo: avance / fecha
    const e = a.etapas || [];
    let sub;
    if (isLate) sub = 'Atrasada · ' + sh(a.fin);
    else if (isUp) sub = (a.inicio === TOMORROW ? 'Mañana' : sh(a.inicio)) + ' · ' + cat.n;
    else if (a.tipo === 'tracker' && e.length) {
      const nx = e.find(x => !x.completada);
      sub = `${e.filter(x => x.completada).length}/${e.length}` + (nx ? ' · ' + nx.titulo : '');
    } else sub = (a.fin === TODAY ? 'Hoy' : 'Hasta ' + sh(a.fin)) + ' · ' + s;
    const st = tx.addText(sub); st.font = Font.mediumSystemFont(8.5); st.lineLimit = 1;
    st.textColor = isLate ? C.red : C.mut;

    // mini barra de avance para trackers
    if (!isUp && a.tipo === 'tracker' && e.length) {
      r.addSpacer(4);
      const pct = e.filter(x => x.completada).length / e.length;
      const bar = r.addStack(); bar.size = new Size(22, 3); bar.cornerRadius = 1.5; bar.backgroundColor = alpha(c, 0.2);
      bar.layoutHorizontally();
      if (pct > 0) { const f = bar.addStack(); f.size = new Size(Math.max(3, 22 * pct), 3); f.cornerRadius = 1.5; f.backgroundColor = new Color(c) }
      bar.addSpacer();
    }
    r.addSpacer();
  });
  col.addSpacer();
}

// ---------- Errores ----------
try { await main() }
catch (e) {
  const w = new ListWidget(); w.backgroundColor = C.bg; w.url = APP_URL;
  const t = w.addText('Tracker'); t.font = Font.heavySystemFont(13); t.textColor = C.ink;
  w.addSpacer(4);
  const m = w.addText('No se pudo cargar: ' + e.message); m.font = Font.mediumSystemFont(10); m.textColor = C.mut;
  if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
  Script.complete();
}
