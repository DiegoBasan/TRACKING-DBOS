/* =========================================================
   RUTINAS — hábitos diarios, semanales y periódicos
   Firestore: tracking-dbos/app/rutinas/{id}  ·  tracking-dbos/app/rutinasLog/{YYYY-MM-DD}
   Usa funciones globales de index.html (ic, $, ROOT, TS, openSheet, toast, etc.)
   ========================================================= */
const RUT_COL = ROOT.collection('rutinas');
const LOG_COL = ROOT.collection('rutinasLog');
let RUTS = [], LOG = {}, RUT_READY = false;
let RDAY = TODAY;                          // día que se está viendo/marcando
let DE = false; try { DE = localStorage.getItem('tracker-de') === '1' } catch (e) {}

/* ---------- Textos ES / DE (modo alemán para que no se entienda) ---------- */
const TX = {
  es: { tab: 'Rutinas', title: 'Rutinas', diaria: 'Todos los días', semanal: 'Algunos días', periodica: 'Periódicas', pausa: 'En pausa',
    hoy: 'Hoy', racha: 'Racha', dias: 'días', de: 'de', toca: 'Toca hoy', en: 'en', atras: 'atrasada', ultima: 'última', nunca: 'Sin registro',
    cada: 'Cada', semanas: 'semanas', meses: 'meses', diasU: 'días', mes: 'Cada mes, día', prox: 'Próx.', activar: 'Activar', nada: 'Nada que marcar este día',
    progreso: 'Constancia', dow: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], dowS: ['D', 'L', 'M', 'M', 'J', 'V', 'S'], mes3: MES3, desde: 'desde', hasta: 'hasta', nueva: 'Nueva rutina' },
  de: { tab: 'Routinen', title: 'Routinen', diaria: 'Täglich', semanal: 'Bestimmte Tage', periodica: 'Regelmäßig', pausa: 'Pausiert',
    hoy: 'Heute', racha: 'Serie', dias: 'Tage', de: 'von', toca: 'Heute fällig', en: 'in', atras: 'überfällig', ultima: 'zuletzt', nunca: 'Noch nie',
    cada: 'Alle', semanas: 'Wochen', meses: 'Monate', diasU: 'Tage', mes: 'Monatlich, Tag', prox: 'Nächst.', activar: 'Aktivieren', nada: 'Heute nichts zu tun',
    progreso: 'Fortschritt', dow: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], dowS: ['S', 'M', 'D', 'M', 'D', 'F', 'S'], mes3: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'], desde: 'ab', hasta: 'bis', nueva: 'Neue Routine' }
};
const T = () => TX[DE ? 'de' : 'es'];
const rName = r => DE ? (r.nombreDe || r.nombre) : r.nombre;

/* ---------- Íconos extra ---------- */
Object.assign(ICONS, {
  habit: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 4 12 13l-3-3"/>',
  owl: '<path d="M5 4.5 8 7h8l3-2.5V13a7 7 0 0 1-14 0z"/><circle cx="9.3" cy="11" r="2"/><circle cx="14.7" cy="11" r="2"/><path d="M11 15l1 1 1-1"/>',
  pan: '<path d="M3 12h13a0 0 0 0 1 0 0 6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z"/><path d="M16 13h5M8 8c0-1.2 1-1.2 1-2.4M12 8c0-1.2 1-1.2 1-2.4"/>',
  nail: '<path d="M8 21V9a4 4 0 0 1 8 0v12"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0V12h-5z"/>'
});
['habit', 'owl', 'pan', 'nail'].forEach(k => { if (!ICON_GROUPS[8][1].includes(k)) ICON_GROUPS[8][1].push(k) });

/* ---------- Formas del check ---------- */
const SHAPES = {
  circle: '<circle class="sh" cx="12" cy="12" r="9"/>',
  square: '<rect class="sh" x="3.5" y="3.5" width="17" height="17" rx="5"/>',
  diamond: '<path class="sh" d="M12 2.6 21.4 12 12 21.4 2.6 12z"/>',
  hexagon: '<path class="sh" d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2z"/>',
  star: '<path class="sh" d="m12 2.6 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 16.9l-5.6 2.9 1.1-6.2-4.5-4.4 6.2-.9z"/>',
  triangle: '<path class="sh" d="M12 3.2 21.6 19.6H2.4z"/>',
  pill: '<rect class="sh" x="2.5" y="6.5" width="19" height="11" rx="5.5"/>',
  squircle: '<path class="sh" d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9z"/>',
  double: '<circle class="ring" cx="12" cy="12" r="10"/><circle class="sh" cx="12" cy="12" r="6.6"/>',
  dashed: '<circle class="sh dash" cx="12" cy="12" r="9"/>'
};
const TICK = { triangle: 'm8.4 14.2 2.5 2.5 4.8-5', star: 'm9 12.3 2.2 2.2 4-4.2', double: 'm9.2 12.2 2 2 3.8-4', default: 'm7.6 12.3 3 3 5.8-6.1' };
const PALETTE = ['#38bdf8', '#a78bfa', '#22c55e', '#f97316', '#f472b6', '#eab308', '#a16207', '#10b981', '#94a3b8', '#ef4444', '#14b8a6', '#8b5cf6'];

function checkSVG(r) {
  const f = SHAPES[r.forma] ? r.forma : 'circle';
  return `<svg viewBox="0 0 24 24" class="cks s-${f}">${SHAPES[f]}<path class="tk" d="${TICK[f] || TICK.default}"/></svg>`;
}

/* ---------- Rutinas iniciales (las que pediste) ---------- */
const SEED = [
  { id: 'dientes', nombre: 'Dientes', nombreDe: 'Zähneputzen', icono: 'tooth', color: '#38bdf8', forma: 'circle', grosor: 1.7, tipo: 'diaria',
    ventanas: [{ ini: '05:00', fin: '' }, { ini: '12:30', fin: '16:00' }, { ini: '20:00', fin: '23:00' }] },
  { id: 'barba', nombre: 'Minoxidil / barba', nombreDe: 'Bartpflege', icono: 'beard', color: '#a78bfa', forma: 'hexagon', grosor: 2.4, tipo: 'diaria', ventanas: [{ ini: '22:00', fin: '23:00' }] },
  { id: 'duolingo', nombre: 'Duolingo', nombreDe: 'Sprachübung', icono: 'owl', color: '#22c55e', forma: 'square', grosor: 3, tipo: 'diaria', ventanas: [{ ini: '12:30', fin: '15:00' }] },
  { id: 'workout', nombre: 'Workout', nombreDe: 'Training', icono: 'dumbbell', color: '#f97316', forma: 'diamond', grosor: 2.3, tipo: 'semanal', pausable: true,
    dias: { 2: [{ ini: '19:00', fin: '' }], 3: [{ ini: '19:00', fin: '' }], 5: [{ ini: '', fin: '15:00' }], 0: [{ ini: '', fin: '15:00' }] } },
  { id: 'basura', nombre: 'Sacar basura', nombreDe: 'Müll rausbringen', icono: 'bin', color: '#94a3b8', forma: 'dashed', grosor: 2.4, tipo: 'semanal',
    dias: { 2: [{ ini: '22:00', fin: '23:00' }], 4: [{ ini: '22:00', fin: '23:00' }], 0: [{ ini: '22:00', fin: '23:00' }] } },
  { id: 'cocinar', nombre: 'Cocinar', nombreDe: 'Kochen', icono: 'pan', color: '#a16207', forma: 'pill', grosor: 2.2, tipo: 'semanal', pausable: true, dias: { 0: [{ ini: '', fin: '' }] } },
  { id: 'unas', nombre: 'Cortar uñas', nombreDe: 'Nägel schneiden', icono: 'nail', color: '#f472b6', forma: 'star', grosor: 1.8, tipo: 'intervalo', cada: 2, unidad: 'semanas' },
  { id: 'cabello', nombre: 'Cortar cabello', nombreDe: 'Haare schneiden', icono: 'scissors', color: '#eab308', forma: 'triangle', grosor: 2.2, tipo: 'intervalo', cada: 3, unidad: 'meses' },
  { id: 'tarjeta', nombre: 'Pagar tarjeta', nombreDe: 'Kreditkarte zahlen', icono: 'card', color: '#10b981', forma: 'double', grosor: 2, tipo: 'mensual', diaMes: 12 },
];

/* ---------- Lógica de calendario ---------- */
const addInterval = (ds, n, u) => { const d = P(ds); if (u === 'meses') d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * (u === 'semanas' ? 7 : 1)); return Y(d) };
const isDone = (ds, k) => !!(LOG[ds] && LOG[ds][k]);
function lastDone(r, before) {
  let best = '';
  for (const ds in LOG) if ((!before || ds <= before) && LOG[ds][r.id + '_0'] && ds > best) best = ds;
  return best;
}
function nextDue(r, ref) {
  const ld = lastDone(r, ref);
  if (ld) return addInterval(ld, Number(r.cada) || 1, r.unidad || 'dias');
  return r.desde || ref;
}
/* Ventanas (checks) que tocan en un día. [] = no toca */
function slotsFor(r, ds) {
  if (r.activa === false) return [];
  const d = P(ds);
  if (r.tipo === 'diaria') return r.ventanas && r.ventanas.length ? r.ventanas : [{}];
  if (r.tipo === 'semanal') { const v = (r.dias || {})[d.getDay()]; return v ? (v.length ? v : [{}]) : [] }
  if (r.tipo === 'mensual') { const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return d.getDate() === Math.min(Number(r.diaMes) || 1, last) ? [{}] : [] }
  if (r.tipo === 'intervalo') {
    if (isDone(ds, r.id + '_0')) return [{}];
    if (ds !== TODAY) return [];                      // para días pasados solo cuenta si se hizo
    return nextDue(r, ds) <= ds ? [{}] : [];
  }
  return [];
}
const hm = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) };
const fmtT = s => { if (!s) return ''; const [h, m] = s.split(':'); return Number(h) + (m && m !== '00' ? ':' + m : '') };
const shortWin = w => w.ini && w.fin ? `${fmtT(w.ini)}–${fmtT(w.fin)}` : w.ini ? `${fmtT(w.ini)}+` : w.fin ? `<${fmtT(w.fin)}` : '';
const winTxt = w => w.ini && w.fin ? `${fmtT(w.ini)}–${fmtT(w.fin)}` : w.ini ? `${T().desde} ${fmtT(w.ini)}` : w.fin ? `${T().hasta} ${fmtT(w.fin)}` : '';
function nowState(w, ds) {               // 'now' | 'late' | 'soon' | ''
  if (ds !== TODAY) return ds < TODAY ? 'late' : '';
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), a = hm(w.ini), b = hm(w.fin);
  if (a != null && m < a) return 'soon';
  if (b != null && m > b) return 'late';
  if (a != null || b != null) return 'now';
  return '';
}
function dayStats(ds) {
  let due = 0, done = 0;
  RUTS.forEach(r => slotsFor(r, ds).forEach((_, i) => { due++; if (isDone(ds, r.id + '_' + i)) done++ }));
  return { due, done };
}
function streak() {
  let n = 0, d = P(TODAY);
  const ok = ds => { const s = dayStats(ds); return s.due > 0 && s.done / s.due >= .85 };
  if (!ok(Y(d))) d = addD(d, -1);
  while (ok(Y(d)) && n < 999) { n++; d = addD(d, -1) }
  return n;
}

/* ---------- Vista ---------- */
function routinesView() {
  if (!RUT_READY) return `<div class="card empty">Cargando…</div>`;
  const t = T(), d = P(RDAY), st = dayStats(RDAY);
  const act = RUTS.filter(r => r.activa !== false), paused = RUTS.filter(r => r.activa === false);
  const grp = k => act.filter(r => k === 'periodica' ? (r.tipo === 'intervalo' || r.tipo === 'mensual') : r.tipo === k);
  const pct = st.due ? Math.round(st.done / st.due * 100) : 0;
  return `<div class="rutwrap">
  <div class="card rgraph">${graphHTML()}</div>
  <div class="rday">
    <button class="rnd2" data-rd="-1">${ic('left')}</button>
    <div class="rdt"><b>${RDAY === TODAY ? t.hoy : t.dow[d.getDay()]} ${d.getDate()} ${t.mes3[d.getMonth()]}</b><small>${st.done} ${t.de} ${st.due} · ${pct}%</small></div>
    <div class="rring" style="--p:${pct}"><span>${pct}</span></div>
    <button class="rnd2" data-rd="1" ${RDAY >= TODAY ? 'disabled' : ''}>${ic('right')}</button>
    <button class="debtn ${DE ? 'on' : ''}" data-de title="Modo alemán">DE</button>
  </div>
  ${['diaria', 'semanal', 'periodica'].map(k => { const L = grp(k); return L.length ? `<div class="sect">${t[k]} <small>${L.length}</small></div><div class="card rlist">${L.map(rowR).join('')}</div>` : '' }).join('')}
  ${paused.length ? `<div class="sect">${t.pausa} <small>${paused.length}</small></div><div class="card rlist">${paused.map(rowR).join('')}</div>` : ''}
  </div>`;
}
function subTxt(r) {
  const t = T(), d = P(RDAY);
  if (r.activa === false) return t.pausa;
  if (r.tipo === 'diaria') return t.diaria;
  if (r.tipo === 'semanal') {
    const ks = Object.keys(r.dias || {}).map(Number).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return ks.map(k => t.dow[k]).join(' · ');
  }
  if (r.tipo === 'mensual') {
    const due = slotsFor(r, RDAY).length; if (due) return `${t.mes} ${r.diaMes}`;
    let n = d, k = 0; while (k < 40 && !slotsFor(r, Y(n)).length) { n = addD(n, 1); k++ }
    return `${t.mes} ${r.diaMes} · ${t.en} ${k} ${t.dias}`;
  }
  if (r.tipo === 'intervalo') {
    const base = `${t.cada} ${r.cada} ${r.unidad === 'meses' ? t.meses : r.unidad === 'semanas' ? t.semanas : t.diasU}`;
    const ld = lastDone(r), nd = nextDue(r, RDAY), diff = dd(RDAY, nd);
    const s = !ld && !r.desde ? t.toca : diff > 0 ? `${t.en} ${diff} ${t.dias}` : diff === 0 ? t.toca : `${t.atras} ${-diff} ${t.dias}`;
    const shD = x => { const q = P(x); return q.getDate() + ' ' + t.mes3[q.getMonth()] };
    return `${base} · ${s}${ld ? ` · ${t.ultima} ${shD(ld)}` : ''}`;
  }
  return '';
}
function rowR(r) {
  const slots = slotsFor(r, RDAY), paused = r.activa === false;
  const allDone = slots.length && slots.every((_, i) => isDone(RDAY, r.id + '_' + i));
  const notToday = !paused && !slots.length;
  let right;
  if (paused) right = `<button class="ract" data-ract="${esc(r.id)}">${T().activar}</button>`;
  else if (notToday) {
    let n = addD(P(RDAY), 1), k = 0; while (k < 400 && !slotsFor({ ...r, tipo: r.tipo === 'intervalo' ? 'x' : r.tipo }, Y(n)).length) { n = addD(n, 1); k++ }
    right = r.tipo === 'semanal' ? `<span class="rnext">${T().prox} ${T().dow[n.getDay()]}</span>` : '';
  } else right = `<div class="cks-row">${slots.map((w, i) => {
    const on = isDone(RDAY, r.id + '_' + i), ns = nowState(w, RDAY), lab = shortWin(w);
    return `<button class="ck2 ${on ? 'on' : ''} ${ns}" data-ck="${esc(r.id)}" data-i="${i}" style="--c:${r.color};--w:${r.grosor || 2}">${checkSVG(r)}${lab ? `<small>${esc(lab)}</small>` : ''}</button>`;
  }).join('')}</div>`;
  return `<div class="rrow ${paused || notToday ? 'dim' : ''} ${allDone ? 'alldone' : ''}" style="--c:${r.color}">
    <button class="rinfo" data-redit="${esc(r.id)}"><div class="ico rico">${ic(r.icono || 'habit')}</div>
    <div class="t"><b>${esc(rName(r))}</b><small>${esc(subTxt(r))}</small></div></button>${right}</div>`;
}

/* Gráfica tipo contribuciones de GitHub */
function graphHTML() {
  const t = T(), W = isDesk() ? 30 : 17;
  const end = addD(P(TODAY), 6 - P(TODAY).getDay());
  const start = addD(end, -(W * 7 - 1));
  let cols = '', months = '', lastM = -1;
  for (let w = 0; w < W; w++) {
    let col = '';
    const ws = addD(start, w * 7);
    if (ws.getMonth() !== lastM) { months += `<span style="grid-column:${w + 1}">${t.mes3[ws.getMonth()]}</span>`; lastM = ws.getMonth() }
    for (let k = 0; k < 7; k++) {
      const d = addD(ws, k), ds = Y(d);
      if (ds > TODAY) { col += `<i class="g fut"></i>`; continue }
      const s = dayStats(ds), r = s.due ? s.done / s.due : (s.done ? 1 : 0);
      const lv = !s.done ? 0 : r < .34 ? 1 : r < .67 ? 2 : r < 1 ? 3 : 4;
      col += `<i class="g l${lv} ${ds === RDAY ? 'sel' : ''} ${ds === TODAY ? 'tod' : ''}" data-gd="${ds}" title="${ds} · ${s.done}/${s.due}"></i>`;
    }
    cols += `<div class="gcol">${col}</div>`;
  }
  const s = streak();
  return `<div class="gh"><b>${t.progreso}</b><small>${t.racha}: ${s} ${t.dias}</small></div>
    <div class="gwrap"><div class="gdow">${t.dowS.map((x, i) => `<span>${i % 2 ? x : ''}</span>`).join('')}</div>
    <div class="gmain"><div class="gmon" style="grid-template-columns:repeat(${W},1fr)">${months}</div><div class="ggrid" style="grid-template-columns:repeat(${W},1fr)">${cols}</div></div></div>
    <div class="gleg"><span>−</span>${[0, 1, 2, 3, 4].map(l => `<i class="g l${l}"></i>`).join('')}<span>+</span></div>`;
}

/* ---------- Eventos ---------- */
function bindRoutines() {
  const v = $('view'); if (!v.querySelector('.rutwrap')) return;
  v.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => {
    const k = b.dataset.ck + '_' + b.dataset.i, val = !isDone(RDAY, k);
    b.classList.toggle('on', val); navigator.vibrate?.(val ? 12 : 6);
    LOG[RDAY] = { ...(LOG[RDAY] || {}), [k]: val };
    LOG_COL.doc(RDAY).set({ [k]: val }, { merge: true }).catch(e => toast('Error: ' + e.message));
    setTimeout(render, 380);
  });
  v.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => { const n = Y(addD(P(RDAY), +b.dataset.rd)); if (n <= TODAY) { RDAY = n; render() } });
  v.querySelectorAll('[data-gd]').forEach(b => b.onclick = () => { RDAY = b.dataset.gd; render() });
  const de = v.querySelector('[data-de]'); if (de) de.onclick = () => { DE = !DE; try { localStorage.setItem('tracker-de', DE ? '1' : '0') } catch (e) {} ROOT.set({ rutinasDE: DE }, { merge: true }).catch(() => {}); render() };
  v.querySelectorAll('[data-redit]').forEach(b => b.onclick = () => openRoutineForm(b.dataset.redit));
  v.querySelectorAll('[data-ract]').forEach(b => b.onclick = () => RUT_COL.doc(b.dataset.ract).set({ activa: true }, { merge: true }));
}

/* ---------- Formulario de rutina ---------- */
function openRoutineForm(id) {
  const src = RUTS.find(r => r.id === id);
  const r = src ? JSON.parse(JSON.stringify(src)) : { id: '', nombre: '', nombreDe: '', icono: 'habit', color: PALETTE[0], forma: 'circle', grosor: 2, tipo: 'diaria', ventanas: [{ ini: '', fin: '' }], dias: {}, cada: 2, unidad: 'semanas', diaMes: 1, activa: true, pausable: true };
  r.ventanas = r.ventanas || [{ ini: '', fin: '' }]; r.dias = r.dias || {};
  let showIcons = false;
  const DOWL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], DOWN = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const paint = () => {
    openSheet(`<div style="--c:${r.color}">
    <div class="shead"><button class="rnd" data-close>${ic('x')}</button><h3>${id ? 'Editar rutina' : T().nueva}</h3><span style="width:40px"></span></div>
    <div class="tg card" style="padding:10px 14px;margin-bottom:12px"><div>Activa<small>Desactívala por temporada (ej. workout)</small></div><label class="sw"><input type="checkbox" id="rA" ${r.activa !== false ? 'checked' : ''}><i></i></label></div>
    <label class="f"><span>Nombre</span><input id="rN" class="ttl-in" value="${esc(r.nombre)}" placeholder="Ej. Dientes"></label>
    <label class="f"><span>Nombre en alemán (modo DE)</span><div style="display:flex;gap:8px"><input id="rD" value="${esc(r.nombreDe || '')}" placeholder="Ej. Zähneputzen"><button class="rnd" style="width:46px;height:46px;flex:none;background:var(--card)" data-tr title="Traducir con Gemini">${ic('sparkle')}</button></div></label>
    <span class="flbl">Frecuencia</span>
    <div class="seg">${[['diaria', 'Diaria'], ['semanal', 'Días'], ['intervalo', 'Cada…'], ['mensual', 'Mensual']].map(([k, n]) => `<button data-tp="${k}" class="${r.tipo === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="card" style="padding:10px 12px;margin-bottom:12px">${schedHTML()}</div>
    <span class="flbl">Check: forma y grosor</span>
    <div class="shapes">${Object.keys(SHAPES).map(f => `<button data-sf="${f}" class="${r.forma === f ? 'on' : ''}"><span class="ck2 on" style="--c:${r.color};--w:${r.grosor}">${checkSVG({ forma: f })}</span></button>`).join('')}</div>
    <label class="sl" style="margin:4px 4px 12px"><span>Grosor</span><input type="range" id="rG" min="1.2" max="3.6" step=".1" value="${r.grosor}"><b id="rGv">${r.grosor}</b></label>
    <span class="flbl">Color</span>
    <div class="cats">${PALETTE.map(c => `<button class="chip ${r.color === c ? 'on' : ''}" data-col="${c}" style="--c:${c};padding:9px 12px"><i class="dt"></i></button>`).join('')}</div>
    <div class="ipick"><button class="iph" data-ipt><div class="ico cn">${ic(r.icono)}</div><div class="t">Ícono<small>Toca para cambiar</small></div>${ic(showIcons ? 'down' : 'right')}</button>
      ${showIcons ? `<div class="igrid">${ICON_GROUPS.map(([g, list]) => `<div class="igrp">${g}</div><div class="igl">${list.map(k => `<button data-ico="${k}" class="${r.icono === k ? 'on' : ''}">${ic(k)}</button>`).join('')}</div>`).join('')}</div>` : ''}</div>
    <button class="big" data-save>${ic('check')} Guardar</button>
    ${id ? `<div class="acts"><button class="del" data-del>${ic('trash')} Eliminar rutina</button></div>` : ''}</div>`);
    const s = $('sheet');
    const grab = () => {
      r.nombre = $('rN').value; r.nombreDe = $('rD').value; r.activa = $('rA').checked;
      s.querySelectorAll('[data-wi]').forEach(e => { const [i, k] = e.dataset.wi.split(':'); r.ventanas[+i][k] = e.value });
      s.querySelectorAll('[data-dw]').forEach(e => { const [d, k] = e.dataset.dw.split(':'); (r.dias[d] = r.dias[d] && r.dias[d].length ? r.dias[d] : [{ ini: '', fin: '' }])[0][k] = e.value });
      const c = $('rC'); if (c) r.cada = Math.max(1, +c.value || 1); const u = $('rU'); if (u) r.unidad = u.value; const ds = $('rL'); if (ds) r.desde = ds.value;
      const m = $('rM'); if (m) r.diaMes = Math.min(31, Math.max(1, +m.value || 1));
    };
    const re = () => { grab(); const y = s.scrollTop; paint(); $('sheet').scrollTop = y };
    s.querySelector('[data-close]').onclick = closeSheet;
    s.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { grab(); r.tipo = b.dataset.tp; re() });
    s.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { grab(); r.forma = b.dataset.sf; re() });
    s.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { grab(); r.color = b.dataset.col; re() });
    s.querySelector('[data-ipt]').onclick = () => { grab(); showIcons = !showIcons; re() };
    s.querySelectorAll('[data-ico]').forEach(b => b.onclick = () => { grab(); r.icono = b.dataset.ico; re() });
    $('rG').oninput = e => { r.grosor = +e.target.value; $('rGv').textContent = r.grosor; s.querySelectorAll('.shapes .ck2').forEach(x => x.style.setProperty('--w', r.grosor)) };
    s.querySelectorAll('[data-addw]').forEach(b => b.onclick = () => { grab(); r.ventanas.push({ ini: '', fin: '' }); re() });
    s.querySelectorAll('[data-rmw]').forEach(b => b.onclick = () => { grab(); r.ventanas.splice(+b.dataset.rmw, 1); if (!r.ventanas.length) r.ventanas.push({ ini: '', fin: '' }); re() });
    s.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => { grab(); const k = b.dataset.dt; if (r.dias[k]) delete r.dias[k]; else r.dias[k] = [{ ini: '', fin: '' }]; re() });
    s.querySelector('[data-tr]').onclick = async () => {
      grab(); if (!r.nombre.trim()) return toast('Escribe el nombre primero');
      const b = s.querySelector('[data-tr]'); b.innerHTML = '<span class="spin"></span>';
      try { r.nombreDe = await geminiText(`Traduce al alemán de forma natural y corta (1 a 3 palabras, sin comillas ni explicación) este nombre de un hábito personal: "${r.nombre}"`); $('rD').value = r.nombreDe }
      catch (e) { toast('Gemini: ' + e.message) } b.innerHTML = ic('sparkle');
    };
    const del = s.querySelector('[data-del]');
    if (del) del.onclick = () => {
      if (!del.classList.contains('arm')) { del.classList.add('arm'); del.innerHTML = ic('trash') + ' ¿Seguro? Toca otra vez'; return }
      closeSheet(); RUT_COL.doc(id).delete().then(() => toast('Rutina eliminada'));
    };
    s.querySelector('[data-save]').onclick = () => {
      grab(); if (!r.nombre.trim()) { toast('Ponle un nombre'); return }
      const out = { ...r, id: r.id || 'R' + Date.now().toString(36), nombre: r.nombre.trim(), nombreDe: (r.nombreDe || '').trim(), actualizado: TS() };
      out.ventanas = (r.ventanas || []).filter(w => w.ini || w.fin);
      if (r.tipo !== 'semanal') out.dias = {}; else Object.keys(out.dias).forEach(k => out.dias[k] = out.dias[k].filter(w => w.ini || w.fin));
      if (out.orden == null) out.orden = RUTS.length + 1;
      closeSheet(); RUT_COL.doc(out.id).set(out).then(() => toast('Rutina guardada')).catch(e => toast('Error: ' + e.message));
    };
  };
  const schedHTML = () => {
    if (r.tipo === 'diaria') return `<div class="lbl" style="margin-bottom:6px">Horarios del día (un check por horario; vacío = sin hora)</div>
      ${r.ventanas.map((w, i) => `<div class="wrow"><input type="time" data-wi="${i}:ini" value="${w.ini || ''}"><span>–</span><input type="time" data-wi="${i}:fin" value="${w.fin || ''}"><button class="rm" data-rmw="${i}">${ic('x')}</button></div>`).join('')}
      <button class="addst" data-addw>${ic('plus')} Agregar horario</button>`;
    if (r.tipo === 'semanal') return `<div class="dtog">${DOWL.map((x, k) => `<button data-dt="${k}" class="${r.dias[k] ? 'on' : ''}">${x}</button>`).join('')}</div>
      ${[1, 2, 3, 4, 5, 6, 0].filter(k => r.dias[k]).map(k => { const w = (r.dias[k] && r.dias[k][0]) || {}; return `<div class="wrow"><b style="width:34px">${DOWN[k]}</b><input type="time" data-dw="${k}:ini" value="${w.ini || ''}"><span>–</span><input type="time" data-dw="${k}:fin" value="${w.fin || ''}"></div>` }).join('')}
      <div class="lbl" style="margin-top:6px">Deja vacío "desde" o "hasta" para "antes de" / "después de".</div>`;
    if (r.tipo === 'intervalo') return `<div class="wrow"><span>Cada</span><input type="number" id="rC" min="1" value="${r.cada || 1}" style="width:70px"><select id="rU">${['dias', 'semanas', 'meses'].map(u => `<option value="${u}" ${r.unidad === u ? 'selected' : ''}>${u === 'dias' ? 'días' : u}</option>`).join('')}</select></div>
      <div class="wrow"><span>Última vez</span><input type="date" id="rL" value="${r.desde || ''}"></div><div class="lbl">Se calcula la siguiente a partir de la última vez que la marques.</div>`;
    return `<div class="wrow"><span>Día del mes</span><input type="number" id="rM" min="1" max="31" value="${r.diaMes || 1}" style="width:80px"></div>`;
  };
  paint();
}

/* Gemini para textos cortos (traducciones) */
async function geminiText(prompt) {
  if (!GEM.key) throw new Error('Falta tu clave de Gemini (⚙︎ Ajustes)');
  for (const m of [GEM.model || GEM_DEF, 'gemini-flash-latest', 'gemini-flash-lite-latest']) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(GEM.key)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: .2 } }) });
    const j = await r.json();
    if (r.ok) return (j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '').trim().replace(/^["'«]|["'»]$/g, '');
  }
  throw new Error('no respondió');
}

/* ---------- Datos en vivo ---------- */
RUT_COL.onSnapshot(q => {
  RUTS = q.docs.map(d => d.data()).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  if (!RUTS.length && !q.metadata.fromCache) {
    ROOT.get().then(d => {
      if (d.exists && d.data().rutinasSeeded) return;
      const b = db.batch(); SEED.forEach((r, i) => b.set(RUT_COL.doc(r.id), { ...r, activa: true, orden: i + 1, creado: TODAY }));
      b.set(ROOT, { rutinasSeeded: true }, { merge: true }); b.commit();
    });
  }
  RUT_READY = true; if (S.view === 'rut' && !(LP && LP.active)) render();
}, e => toast('Rutinas: ' + e.message));
LOG_COL.onSnapshot(q => {
  LOG = {}; q.docs.forEach(d => { const o = { ...d.data() }; delete o.actualizado; LOG[d.id] = o });
  if (S.view === 'rut') render();
}, () => {});
if (S.view === 'rut') render();
