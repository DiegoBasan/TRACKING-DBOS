// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar;

/* =========================================================
   Tracker · Widget CALENDARIO (mediano o grande) para Scriptable
   Estilo de la app: celdas redondeadas y barras de colores que cruzan los días.
   Parámetro del widget (opcional, separado por comas):
     semanas: vacío = 3 semanas desde la actual · "1"…"6" = esas semanas · "mes" = mes completo
     tema:    vacío = transparente (Liquid Glass) · "oscuro" · "claro"
     titulo:  muestra el encabezado del mes en el mediano (quita espacio a las tareas)
   Ejemplos:  (vacío)   ·   2   ·   mes,oscuro,titulo
   ========================================================= */
const APP_URL = 'https://diegobasan.github.io/TRACKING-DBOS/';
const API_KEY = 'AIzaSyDfWuyJFV2vV8yQAdngrorTMZWn9p0DIqI';
const FS_URL = 'https://firestore.googleapis.com/v1/projects/diagram-diapp/databases/(default)/documents/tracking-dbos/app/actividades?pageSize=300&key=' + API_KEY;
const CAT_URL = APP_URL + 'categorias.js';

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

// ---------- Tamaño del widget ----------
function widgetSize(fam) {
  const s = Device.screenSize(), W = Math.min(s.width, s.height);
  const M = { 440: [364, 170], 430: [364, 170], 428: [364, 170], 414: [360, 169], 402: [338, 158], 393: [338, 158], 390: [338, 158], 375: [329, 155], 360: [329, 155], 320: [292, 141] };
  const L = { 440: [364, 382], 430: [364, 382], 428: [364, 382], 414: [360, 379], 402: [338, 354], 393: [338, 354], 390: [338, 354], 375: [329, 345], 360: [329, 345], 320: [292, 311] };
  return ((fam === 'large' ? L : M)[W]) || (fam === 'large' ? [338, 354] : [338, 158]);
}

// ---------- Tema ----------
// Los colores pueden ser '#hex' o ['#hex', opacidad]
const THEMES = {
  // Para Liquid Glass "Transparente": sin fondo, celdas apenas marcadas y texto blanco
  transparente: { bg: null, tile: ['#ffffff', 0.08], tileOut: ['#ffffff', 0.035], ink: '#ffffff', inv: '#ffffff', mut: ['#ffffff', 0.6], out: ['#ffffff', 0.28], red: '#ff6b6b', glass: true },
  oscuro: { bg: '#1e1e1e', tile: '#151515', tileOut: '#191919', ink: '#f0f0f0', inv: '#141414', mut: '#858585', out: '#4a4a4a', red: '#ff4d55' },
  claro:  { bg: '#ececec', tile: '#ffffff', tileOut: '#f5f5f5', ink: '#141414', inv: '#ffffff', mut: '#8b8b8b', out: '#c2c2c2', red: '#e5262f' },
};

// =========================================================
async function main() {
  const fam0 = String(args.widgetParameter || '').toLowerCase();
  const fam = config.widgetFamily || (fam0.includes('grande') ? 'large' : 'medium');
  const tokens = String(args.widgetParameter || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const themeName = tokens.includes('oscuro') ? 'oscuro' : tokens.includes('claro') ? 'claro' : 'transparente';
  const T = THEMES[themeName];
  const weeksParam = tokens.find(t => /^[1-6]$/.test(t)) || (tokens.includes('mes') ? 'mes' : '3');

  const catRes = await getText(CAT_URL, 'cats.js');
  CAT = JSON.parse(catRes.t.slice(catRes.t.indexOf('{'), catRes.t.lastIndexOf('}') + 1));
  prepCats();
  const fsRes = await getText(FS_URL, 'data.json');
  const docs = (JSON.parse(fsRes.t).documents || []).map(d => obj(d.fields || {}));
  const acts = docs.filter(a => a.id && a.inicio && !(a.fuente === 'notion' && a.notionStatus && a.notionStatus !== 'HOY')).map(a => ({ ...a, fin: a.fin || a.inicio }));

  // Rango
  let start, end;
  if (weeksParam !== 'mes') { start = addD(now, -now.getDay()); end = addD(start, Number(weeksParam) * 7 - 1) }
  else {
    const first = new Date(now.getFullYear(), now.getMonth(), 1), last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    start = addD(first, -first.getDay()); end = addD(last, 6 - last.getDay());
  }
  const nW = Math.round((end - start) / 864e5 + 1) / 7;

  // Medidas
  const [WW, WH] = widgetSize(fam);
  const big = fam === 'large';
  const WR = 23;                                  // radio de las esquinas del widget de iOS
  const PAD = big ? 12 : 9, GAP = big ? 3.5 : 2;
  const showHead = big || tokens.includes('titulo');
  const HEAD = showHead ? (big ? 20 : 12) : 0, DOW = big ? 14 : 8.5;
  const gridW = WW - PAD * 2, gridH = WH - PAD * 2 - HEAD - DOW;
  const tileW = (gridW - GAP * 6) / 7;
  const weekH = (gridH - GAP * (nW - 1)) / nW;
  const NUM = big ? 16 : 9;
  const laneH = big ? 12 : (weekH > 60 ? 9.5 : 8);
  const FS = big ? 8.3 : (weekH > 60 ? 7 : 6);
  const NUMFS = big ? 10.5 : 7;
  const maxLanes = Math.max(1, Math.floor((weekH - NUM - 1.5) / laneH));
  const RT = big ? 12 : 8;                        // radio de las celdas
  const RO = Math.max(RT, WR - PAD);              // radio de las 4 celdas de las esquinas (concéntrico al widget)

  const ctx = new DrawContext();
  ctx.size = new Size(WW, WH);
  ctx.respectScreenScale = true;
  ctx.opaque = !!T.bg;
  const col = (c, a) => Array.isArray(c) ? new Color(c[0], c[1] * (a ?? 1)) : new Color(c, a ?? 1);
  const fill = (c, a) => ctx.setFillColor(col(c, a));
  const mix = (c1, c2, t) => { const h = x => [1, 3, 5].map(i => parseInt(x.replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16));
    const a = h(c1), b = h(c2); return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('') };
  const rr = (x, y, w, h, r) => { const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); return p };
  // rectángulo con radio distinto por esquina [arriba-izq, arriba-der, abajo-der, abajo-izq]
  const rrc = (x, y, w, h, [tl, tr, br, bl]) => {
    const p = new Path(), k = 0.5523; // aproximación de cuarto de círculo con curvas Bézier
    p.move(new Point(x + tl, y));
    p.addLine(new Point(x + w - tr, y)); p.addCurve(new Point(x + w, y + tr), new Point(x + w - tr + tr * k, y), new Point(x + w, y + tr - tr * k));
    p.addLine(new Point(x + w, y + h - br)); p.addCurve(new Point(x + w - br, y + h), new Point(x + w, y + h - br + br * k), new Point(x + w - br + br * k, y + h));
    p.addLine(new Point(x + bl, y + h)); p.addCurve(new Point(x, y + h - bl), new Point(x + bl - bl * k, y + h), new Point(x, y + h - bl + bl * k));
    p.addLine(new Point(x, y + tl)); p.addCurve(new Point(x + tl, y), new Point(x, y + tl - tl * k), new Point(x + tl - tl * k, y));
    p.closeSubpath(); return p;
  };
  // cuánto hay que meter hacia adentro algo que está a "dy" del borde en una esquina de radio R
  const cornerInset = (R, dy) => dy >= R ? 0 : R - Math.sqrt(Math.max(0, R * R - (R - dy) * (R - dy)));
  const text = (s, x, y, w, h, fs, color, opts = {}) => {
    ctx.setFont(opts.mono ? Font.mediumMonospacedSystemFont(fs) : opts.weight === 'heavy' ? Font.heavySystemFont(fs) : opts.weight === 'semi' ? Font.semiboldSystemFont(fs) : Font.boldSystemFont(fs));
    ctx.setTextColor(col(color));
    if (opts.align === 'center') ctx.setTextAlignedCenter(); else if (opts.align === 'right') ctx.setTextAlignedRight(); else ctx.setTextAlignedLeft();
    ctx.drawTextInRect(s, new Rect(x, y, w, h));
  };
  const fit = (s, w, fs) => { const n = Math.max(1, Math.floor(w / (fs * 0.53))); return s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : s };

  if (T.bg) { fill(T.bg); ctx.fillRect(new Rect(0, 0, WW, WH)) }

  // Encabezado (solo en grande, o con el parámetro "titulo")
  const cap = t => t.replace(/^./, c => c.toUpperCase());
  if (showHead) {
    const mesTxt = weeksParam === 'mes' || start.getMonth() === end.getMonth()
      ? cap(MES[(weeksParam === 'mes' ? now : start).getMonth()]) + ' ' + now.getFullYear()
      : cap(MES3[start.getMonth()]) + ' – ' + cap(MES3[end.getMonth()]) + ' ' + end.getFullYear();
    text(mesTxt, PAD + 6, PAD - 1.5, gridW / 2, HEAD, big ? 14 : 9.5, T.ink, { weight: 'heavy' });
    const activas = acts.filter(a => a.inicio <= TODAY && a.fin >= TODAY && status(a) !== 'Completada').length;
    text(fsRes.offline ? 'sin conexión' : `Hoy ${DIA3[now.getDay()]} ${now.getDate()} · ${activas} activas`, PAD + gridW / 2, PAD + (big ? 2 : 1), gridW / 2 - 8, HEAD, big ? 9.5 : 7, fsRes.offline ? T.red : T.mut, { weight: 'semi', align: 'right' });
  } else if (fsRes.offline) {
    text('sin conexión', PAD, PAD - 1, gridW - 10, DOW, 6.5, T.red, { weight: 'semi', align: 'right' });
  }

  // Días de la semana
  const top0 = PAD + HEAD;
  ['D', 'L', 'M', 'M', 'J', 'V', 'S'].forEach((l, i) => text(l, PAD + i * (tileW + GAP), top0, tileW, DOW, big ? 8.5 : 6.5, T.mut, { mono: true, align: 'center' }));

  const gy = top0 + DOW;
  for (let k = 0, ws = start; k < nW; k++, ws = addD(ws, 7)) {
    const y = gy + k * (weekH + GAP), wsS = Y(ws), weS = Y(addD(ws, 6));
    const topRow = k === 0 && !showHead, botRow = k === nW - 1;   // filas que tocan las esquinas del widget

    // Celdas
    for (let i = 0; i < 7; i++) {
      const d = addD(ws, i), ds = Y(d), x = PAD + i * (tileW + GAP);
      const inMonth = weeksParam !== 'mes' || d.getMonth() === now.getMonth();
      const radii = [
        topRow && i === 0 ? RO : RT, topRow && i === 6 ? RO : RT,
        botRow && i === 6 ? RO : RT, botRow && i === 0 ? RO : RT];
      fill(inMonth ? T.tile : T.tileOut); ctx.addPath(rrc(x, y, tileW, weekH, radii)); ctx.fillPath();
      const label = ((weeksParam !== 'mes' && (d.getDate() === 1 || (k === 0 && i === 0))) && ds !== TODAY ? MES3[d.getMonth()] + ' ' : '') + d.getDate();
      const nx = x + (big ? 8 : 5) + (topRow && i === 0 ? 2.5 : 0);
      if (ds === TODAY) {
        const cs = NUMFS + (big ? 8 : 5.5), cx = nx - (big ? 3 : 2), cy = y + (big ? 3 : 1.5);
        if (T.glass) {
          ctx.setStrokeColor(col(T.ink)); ctx.setLineWidth(big ? 1.6 : 1.1);
          ctx.strokeEllipse(new Rect(cx, cy, cs, cs));
          text(label, cx, cy + (cs - NUMFS * 1.25) / 2, cs, cs, NUMFS, T.ink, { align: 'center', weight: 'heavy' });
        } else {
          fill(T.ink); ctx.fillEllipse(new Rect(cx, cy, cs, cs));
          text(label, cx, cy + (cs - NUMFS * 1.25) / 2, cs, cs, NUMFS, T.inv, { align: 'center', weight: 'heavy' });
        }
        ctx.setStrokeColor(col(T.ink)); ctx.setLineWidth(big ? 1.6 : 1.1);
        ctx.addPath(rrc(x + 0.55, y + 0.55, tileW - 1.1, weekH - 1.1, radii.map(r => Math.max(0, r - 0.55)))); ctx.strokePath();
      } else {
        text(label, nx, y + (big ? 4 : 2), tileW, NUM, NUMFS, inMonth ? T.ink : T.out, { weight: 'semi' });
      }
    }

    // Carriles de tareas
    const ev = acts.filter(a => a.inicio <= weS && a.fin >= wsS)
      .sort((a, b) => (status(a) === 'Completada') - (status(b) === 'Completada') || a.inicio.localeCompare(b.inicio) || (P(b.fin) - P(b.inicio)) - (P(a.fin) - P(a.inicio)) || (a.titulo || '').localeCompare(b.titulo || ''));
    const lanes = [], hidden = Array(7).fill(0);
    ev.forEach(a => {
      const c0 = Math.max(0, Math.round((P(a.inicio) - P(wsS)) / 864e5)), c1 = Math.min(6, Math.round((P(a.fin) - P(wsS)) / 864e5));
      let l = lanes.findIndex(L => L.end < c0); if (l < 0) { l = lanes.length; lanes.push({ end: -1, segs: [] }) }
      lanes[l].end = c1; lanes[l].segs.push({ a, c0, c1, cl: a.inicio < wsS, cr: a.fin > weS });
    });
    const show = Math.min(lanes.length, maxLanes);
    lanes.slice(show).forEach(L => L.segs.forEach(s => { for (let c = s.c0; c <= s.c1; c++) hidden[c]++ }));

    lanes.slice(0, show).forEach((L, li) => {
      const by = y + NUM + li * laneH + (big ? 2 : 1.5);
      const bh = laneH - (big ? 2.2 : 1.6), r = big ? 4 : 2.5;
      L.segs.forEach(({ a, c0, c1, cl, cr }) => {
        const s = status(a), c = CAT.CATS[catOf(a)].c;
        let x0 = PAD + c0 * (tileW + GAP) + (cl ? -GAP / 2 : 1.5);
        let x1 = PAD + c1 * (tileW + GAP) + tileW + (cr ? GAP / 2 : -1.5);
        // respetar la curva de las esquinas del widget
        const dTop = by - y, dBot = y + weekH - (by + bh);
        if (c0 === 0) { if (topRow) x0 += cornerInset(RO, dTop); if (botRow) x0 += cornerInset(RO, dBot) }
        if (c1 === 6) { if (topRow) x1 -= cornerInset(RO, dTop); if (botRow) x1 -= cornerInset(RO, dBot) }
        if (T.glass) fill(c, s === 'En curso' ? 0.8 : s === 'Completada' ? 0.16 : 0.36);
        else fill(s === 'En curso' ? c : mix(c, T.tile, s === 'Completada' ? 0.14 : 0.3));
        ctx.addPath(rr(x0, by, x1 - x0, bh, r)); ctx.fillPath();
        const tc = s === 'En curso' ? '#ffffff' : s === 'Completada' ? T.mut : T.glass ? mix(c, '#ffffff', 0.45) : c;
        const padL = big ? 5 : 2.5, ty = by + (bh - FS * 1.22) / 2;
        const label = fit(a.titulo || '', x1 - x0 - padL * 2, FS);
        text(label, x0 + padL, ty, x1 - x0 - padL, bh, FS, tc);
        if (s === 'Completada') { fill(T.mut, 0.9); ctx.fillRect(new Rect(x0 + padL, by + bh / 2, Math.min(x1 - x0 - padL * 2, label.length * FS * 0.52), 0.6)) }
      });
    });
    // "+n" en la esquina de la celda cuando no caben
    hidden.forEach((n, c) => { if (n) text('+' + n, PAD + c * (tileW + GAP), y + (big ? 4 : 2), tileW - (big ? 7 : 4) - (topRow && c === 6 ? 3 : 0), NUM, NUMFS * 0.85, T.mut, { align: 'right' }) });
  }

  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  if (T.glass) w.backgroundColor = new Color('#000000', 0);
  w.backgroundImage = ctx.getImage();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  if (config.runsInWidget) Script.setWidget(w);
  else if (tokens.includes('grande') || fam === 'large') await w.presentLarge();
  else await w.presentMedium();
  Script.complete();
}

// ---------- Errores ----------
try { await main() }
catch (e) {
  const w = new ListWidget(); w.backgroundColor = new Color('#1e1e1e'); w.url = APP_URL;
  const t = w.addText('Tracker'); t.font = Font.heavySystemFont(13); t.textColor = Color.white();
  w.addSpacer(4);
  const m = w.addText('No se pudo cargar: ' + e.message); m.font = Font.mediumSystemFont(10); m.textColor = Color.gray();
  if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
  Script.complete();
}
