// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar;

/* =========================================================
   Tracker · Widget CALENDARIO mediano (2×1) para Scriptable
   Calendario a todo lo ancho con las tareas como barras de texto.
   Parámetro del widget (opcional):
     (vacío) o "mes" → mes completo
     "2" o "3"       → solo 2 o 3 semanas desde la actual (más legible)
   Datos: Firestore (diagram-diapp / tracking-dbos) vía REST
   ========================================================= */

const APP_URL = 'https://diegobasan.github.io/TRACKING-DBOS/';
const API_KEY = 'AIzaSyDfWuyJFV2vV8yQAdngrorTMZWn9p0DIqI';
const FS_URL = 'https://firestore.googleapis.com/v1/projects/diagram-diapp/databases/(default)/documents/tracking-dbos/app/actividades?pageSize=300&key=' + API_KEY;
const CAT_URL = APP_URL + 'categorias.js';

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

// ---------- Tamaño del widget mediano según el iPhone ----------
function widgetSize() {
  const w = Device.screenSize().width, h = Device.screenSize().height;
  const W = Math.min(w, h);
  const T = { 440: [364, 170], 430: [364, 170], 428: [364, 170], 414: [360, 169], 402: [338, 158], 393: [338, 158], 390: [338, 158], 375: [329, 155], 360: [329, 155], 320: [292, 141] };
  return T[W] || [338, 158];
}

// =========================================================
async function main() {
  const catRes = await getText(CAT_URL, 'cats.js');
  CAT = JSON.parse(catRes.t.slice(catRes.t.indexOf('{'), catRes.t.lastIndexOf('}') + 1));
  prepCats();
  const fsRes = await getText(FS_URL, 'data.json');
  const docs = (JSON.parse(fsRes.t).documents || []).map(d => obj(d.fields || {}));
  const acts = docs.filter(a => a.id && a.inicio).map(a => ({ ...a, fin: a.fin || a.inicio }));

  const PADX = 8, PADY = 8;
  const [WW, WH] = widgetSize();
  const innerW = WW - PADX * 2, innerH = WH - PADY * 2;
  const colW = Math.floor(innerW / 7);

  // Rango de semanas
  const param = String(args.widgetParameter || 'mes').trim().toLowerCase();
  let start, end;
  if (param === '2' || param === '3') {
    start = addD(now, -now.getDay());
    end = addD(start, Number(param) * 7 - 1);
  } else {
    const first = new Date(now.getFullYear(), now.getMonth(), 1), last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    start = addD(first, -first.getDay()); end = addD(last, 6 - last.getDay());
  }
  const nWeeks = Math.round((end - start) / 864e5 + 1) / 7;

  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(PADY, PADX, PADY, PADX);
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  // Encabezado
  const HEAD = 13, DOW = 9, GAP = 1.5;
  const h = w.addStack(); h.layoutHorizontally(); h.centerAlignContent(); h.size = new Size(innerW, HEAD);
  const tt = h.addText(MES[now.getMonth()].replace(/^./, c => c.toUpperCase()) + ' ' + now.getFullYear());
  tt.font = Font.heavySystemFont(11); tt.textColor = C.ink;
  h.addSpacer();
  const activas = acts.filter(a => a.inicio <= TODAY && a.fin >= TODAY && status(a) !== 'Completada').length;
  const ht = h.addText(fsRes.offline ? 'sin conexión' : `Hoy ${DIA3[now.getDay()]} ${now.getDate()} · ${activas} activas`);
  ht.font = Font.semiboldSystemFont(8.5); ht.textColor = fsRes.offline ? C.red : C.mut;

  const dow = w.addStack(); dow.size = new Size(innerW, DOW);
  ['D', 'L', 'M', 'M', 'J', 'V', 'S'].forEach(l => {
    const c = dow.addStack(); c.size = new Size(colW, DOW); c.centerAlignContent();
    const x = c.addText(l); x.font = Font.mediumMonospacedSystemFont(7); x.textColor = C.mut;
  });

  // Alto disponible por semana
  const weekH = Math.floor((innerH - HEAD - DOW - GAP * (nWeeks - 1)) / nWeeks);
  const NUM = nWeeks >= 6 ? 8.5 : 10;               // fila del número de día
  const laneH = nWeeks <= 2 ? 12 : nWeeks === 3 ? 11 : Math.max(7.5, Math.min(9.5, weekH - NUM - 1));
  const fontS = nWeeks <= 2 ? 8 : nWeeks === 3 ? 7.5 : 6.5;
  const maxLanes = Math.max(1, Math.floor((weekH - NUM - 1) / laneH));

  for (let ws = start, k = 0; ws <= end; ws = addD(ws, 7), k++) {
    if (k) w.addSpacer(GAP);
    const wsS = Y(ws), weS = Y(addD(ws, 6));
    const week = w.addStack(); week.layoutVertically(); week.size = new Size(innerW, weekH);
    week.backgroundColor = C.soft; week.cornerRadius = 5;

    // números
    const nr = week.addStack(); nr.size = new Size(innerW, NUM);
    for (let i = 0; i < 7; i++) {
      const d = addD(ws, i), ds = Y(d), inMonth = param.match(/^[23]$/) || d.getMonth() === now.getMonth();
      const c = nr.addStack(); c.size = new Size(colW, NUM); c.layoutHorizontally(); c.setPadding(1, 3, 0, 0);
      const nb = c.addStack(); nb.centerAlignContent(); nb.cornerRadius = 4.5; nb.setPadding(0, 2.5, 0, 2.5);
      if (ds === TODAY) nb.backgroundColor = C.ink;
      const n = nb.addText((d.getDate() === 1 && param.match(/^[23]$/) ? MES3[d.getMonth()] + ' ' : '') + d.getDate());
      n.font = ds === TODAY ? Font.heavySystemFont(7.5) : Font.semiboldSystemFont(7.5);
      n.textColor = ds === TODAY ? C.inv : inMonth ? C.ink : C.out;
      c.addSpacer();
    }

    // carriles de tareas
    const ev = acts.filter(a => a.inicio <= weS && a.fin >= wsS)
      .sort((a, b) => a.inicio.localeCompare(b.inicio) || (P(b.fin) - P(b.inicio)) - (P(a.fin) - P(a.inicio)) || (a.titulo || '').localeCompare(b.titulo || ''));
    const lanes = [], hidden = Array(7).fill(0);
    ev.forEach(a => {
      const c0 = Math.max(0, Math.round((P(a.inicio) - P(wsS)) / 864e5)), c1 = Math.min(6, Math.round((P(a.fin) - P(wsS)) / 864e5));
      let l = lanes.findIndex(L => L.end < c0); if (l < 0) { l = lanes.length; lanes.push({ end: -1, segs: [] }) }
      lanes[l].end = c1; lanes[l].segs.push({ a, c0, c1 });
    });
    const overflow = lanes.length > maxLanes;
    const show = overflow ? Math.max(0, maxLanes - 1) : lanes.length;
    lanes.slice(show).forEach(L => L.segs.forEach(s => { for (let c = s.c0; c <= s.c1; c++) hidden[c]++ }));

    lanes.slice(0, show).forEach(L => {
      const r = week.addStack(); r.layoutHorizontally(); r.size = new Size(innerW, laneH); r.centerAlignContent();
      let cur = 0;
      L.segs.forEach(({ a, c0, c1 }) => {
        if (c0 > cur) r.addSpacer((c0 - cur) * colW);
        const s = status(a), c = CAT.CATS[catOf(a)].c, span = c1 - c0 + 1;
        const bar = r.addStack(); bar.size = new Size(span * colW - 2, laneH - 1.5); bar.cornerRadius = 2.5;
        bar.layoutHorizontally(); bar.centerAlignContent(); bar.setPadding(0, 2.5, 0, 2);
        bar.backgroundColor = s === 'En curso' ? new Color(c) : alpha(c, s === 'Completada' ? 0.1 : 0.2);
        if (span >= 2) {
          const im = bar.addImage(sym(iconOf(a), 7, 'bold')); im.imageSize = new Size(fontS, fontS);
          im.tintColor = s === 'En curso' ? Color.white() : alpha(c, s === 'Completada' ? 0.4 : 1);
          bar.addSpacer(2);
        }
        const t = bar.addText(a.titulo || ''); t.font = Font.boldSystemFont(fontS); t.lineLimit = 1; t.minimumScaleFactor = 0.75;
        t.textColor = s === 'En curso' ? Color.white() : s === 'Completada' ? C.mut : new Color(c);
        bar.addSpacer();
        r.addSpacer(2);
        cur = c1 + 1;
      });
      r.addSpacer();
    });
    if (overflow) {
      const r = week.addStack(); r.layoutHorizontally(); r.size = new Size(innerW, laneH);
      hidden.forEach(n => { const c = r.addStack(); c.size = new Size(colW, laneH); c.centerAlignContent();
        if (n) { const t = c.addText('+' + n); t.font = Font.boldSystemFont(fontS); t.textColor = C.mut } });
    }
    week.addSpacer();
  }

  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
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
