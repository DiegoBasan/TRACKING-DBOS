/* =========================================================
   NUESTROS PLANES (Elia) — solo lectura
   Segunda app de Firebase (proyecto personal-75acf). Diego entra con su
   Google; las reglas de Elia dejan leer a los miembros de planes/{coupleId}.
   Nunca escribe nada en ese proyecto.
   ========================================================= */
const ELIA_CFG = {
  apiKey: 'AIzaSyC2j-keohRRLs8dnQk6hQXGT9eItJXmzik',
  authDomain: 'personal-75acf.firebaseapp.com',
  projectId: 'personal-75acf',
  storageBucket: 'personal-75acf.firebasestorage.app',
  messagingSenderId: '12344295289',
  appId: '1:12344295289:web:5b54150483457bb94439a8'
};
const E = { app: null, auth: null, db: null, user: null, cid: null, names: {}, tipos: {}, ev: [], pe: [], unsub: [], estado: 'off', err: '' };
const E_TIPOS = { plan: ['Plan', 'sparkle'], cita: ['Cita', 'heart'], viaje: ['Viaje', 'plane'], cumple: ['Cumpleaños', 'gift'], aniversario: ['Aniversario', 'ring'], pendiente: ['Pendiente', 'checklist'], otro: ['Otro', 'event'] };
const E_ICONS = { music: 'music', heart: 'heart', plane: 'plane', gift: 'gift', ring: 'ring', star: 'star', food: 'food', coffee: 'coffee', film: 'film', game: 'game', book: 'book', home: 'home', car: 'car', camera: 'camera', party: 'party', flower: 'flower', cart: 'cart', pin: 'pin' };
let eliaOn = true; try { eliaOn = localStorage.getItem('tracker-elia') !== '0' } catch (e) { }

function eliaInit() {
  if (E.app || typeof firebase === 'undefined' || !firebase.auth) return;
  E.app = firebase.initializeApp(ELIA_CFG, 'nuestros-planes');
  E.auth = E.app.auth(); E.db = E.app.firestore();
  E.auth.getRedirectResult().catch(e => { E.err = e.message; eliaSet('error') });
  E.auth.onAuthStateChanged(u => { E.user = u; eliaStop(); if (u) eliaStart(); else { E.ev = []; E.pe = []; eliaSet('off'); eliaPush() } });
}
function eliaSet(s) { E.estado = s; const b = document.getElementById('eliaBox'); if (b) eliaSettings(b) }
function eliaStop() { E.unsub.forEach(f => { try { f() } catch (e) { } }); E.unsub = [] }
async function eliaStart() {
  eliaSet('busy');
  try {
    const q = await E.db.collection('planes').where('members', 'array-contains', E.user.uid).limit(1).get();
    if (q.empty) { E.err = `La cuenta ${E.user.email} no está en el espacio de Nuestros Planes.`; eliaSet('error'); return }
    const d = q.docs[0]; E.cid = d.id;
    const upd = x => { E.names = x.names || {}; E.tipos = {}; (x.tipos || []).forEach(t => E.tipos[t.k] = [t.l, E_ICONS[t.i] || 'event']) };
    upd(d.data());
    const base = E.db.collection('planes').doc(E.cid);
    const fail = e => { E.err = e.message; eliaSet('error') };
    E.unsub.push(base.onSnapshot(s => { upd(s.data() || {}); eliaPush() }, fail));
    E.unsub.push(base.collection('eventos').onSnapshot(s => { E.ev = s.docs.map(x => ({ id: x.id, ...x.data() })); eliaSet('on'); eliaPush() }, fail));
    E.unsub.push(base.collection('pendientes').onSnapshot(s => { E.pe = s.docs.map(x => ({ id: x.id, ...x.data() })); eliaSet('on'); eliaPush() }, fail));
  } catch (e) { E.err = e.message; eliaSet('error') }
}
async function eliaLogin() {
  eliaInit(); if (!E.auth) { toast('No se pudo cargar Firebase Auth'); return }
  const prov = new firebase.auth.GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
  try { await E.auth.signInWithPopup(prov) }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request', 'auth/web-storage-unsupported'].includes(e.code)) return E.auth.signInWithRedirect(prov);
    if (e.code !== 'auth/popup-closed-by-user') { E.err = e.code === 'auth/unauthorized-domain' ? 'Falta autorizar diegobasan.github.io en Firebase de Elia (Authentication → Settings → Authorized domains).' : e.message; eliaSet('error') }
  }
}

/* ---------- Convertir a actividades del tracker ---------- */
const eDate = ms => { const d = new Date(ms); return Y(d) };
const eAdd = (ds, n) => Y(addD(P(ds), n));
function eOccur(ev) {
  const out = [], from = eAdd(TODAY, -150), to = eAdd(TODAY, 400);
  const span = ev.endDate && ev.endDate > ev.date ? dd(ev.date, ev.endDate) : 0;
  const r = ev.repeat || 'no';
  if (r === 'no') { out.push(ev.date); return out }
  const [y0, m0, d0] = ev.date.split('-').map(Number);
  for (let i = 0; i < 800; i++) {
    let ds;
    if (r === 'semanal') ds = eAdd(ev.date, 7 * i);
    else if (r === 'mensual') { const t = new Date(y0, m0 - 1 + i, 1); if (new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() < d0) continue; t.setDate(d0); ds = Y(t) }
    else if (r === 'anual') { if (m0 === 2 && d0 === 29 && new Date(y0 + i, 1, 29).getMonth() !== 1) continue; ds = Y(new Date(y0 + i, m0 - 1, d0)) }
    else { out.push(ev.date); break }
    if (ds > to) break;
    if (eAdd(ds, span) >= from) out.push(ds);
  }
  return out;
}
function eliaItems() {
  if (!eliaOn) return [];
  const items = [];
  for (const ev of E.ev) {
    if (!ev.date) continue;
    const [tl, ti] = E.tipos[ev.type] || E_TIPOS[ev.type] || E_TIPOS.otro;
    const span = ev.endDate && ev.endDate > ev.date ? dd(ev.date, ev.endDate) : 0;
    const hora = ev.allDay || !ev.time ? '' : ev.time + (ev.endTime ? '–' + ev.endTime : '');
    for (const ds of eOccur(ev)) {
      const fin = eAdd(ds, span);
      items.push({ id: `elia:ev:${ev.id}:${ds}`, titulo: ev.title || '(sin título)', inicio: ds, fin, estado: fin < TODAY ? 'Completada' : 'Pendiente', tipo: 'simple', notas: ev.note || '', categoria: 'elia', icono: ti, orden: '', fuente: 'elia', notionUrl: '', notionStatus: '', eKind: 'evento', eTipo: tl, eHora: hora, ePlace: ev.place || '', eRepeat: ev.repeat || 'no', eBy: E.names[ev.createdBy] || '' });
    }
  }
  for (const p of E.pe) {
    const dia = p.due || (p.done && p.doneAt ? eDate(p.doneAt) : TODAY);
    const para = p.para === 'ambos' ? 'Ambos' : (E.names[p.para] || '');
    items.push({ id: `elia:pe:${p.id}`, titulo: p.t || '(sin título)', inicio: dia, fin: dia, estado: p.done ? 'Completada' : 'Pendiente', tipo: 'simple', notas: p.note || '', categoria: 'elia', icono: 'checklist', orden: '', fuente: 'elia', notionUrl: '', notionStatus: '', eKind: 'pendiente', eTipo: 'Pendiente', ePara: para, eDue: p.due || '', eBy: E.names[p.createdBy] || '', eDoneBy: p.done ? (E.names[p.doneBy] || '') : '' });
  }
  return items;
}
function eliaPush() {
  ELIA = eliaItems(); applyFilter();
  if ((LP && LP.active) || DRAG) return;
  render();
}

/* ---------- Detalle (solo lectura) ---------- */
function eliaDetail(a) {
  const c = colorOf(a);
  const rep = { semanal: 'Cada semana', mensual: 'Cada mes', anual: 'Cada año' }[a.eRepeat];
  const kv = (k, v) => v ? `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>` : '';
  openSheet(`<div style="--c:${c}">
    <div class="shead"><button class="rnd" data-close>${ic('back')}</button><h3>Nuestros Planes</h3><span style="width:40px"></span></div>
    <div class="hero"><div class="ico ${stCls(status(a))}">${ic(iconOf(a))}</div><div class="t"><div class="lbl">ELIA · ${esc(a.eTipo)}</div><b>${esc(a.titulo)}</b></div>${pill(a)}</div>
    <div class="dcard"><div class="h">${ic('info')} Detalles</div><div class="in">
      ${kv('Fecha', a.inicio === a.fin ? shY(a.inicio) : sh(a.inicio) + ' – ' + shY(a.fin))}
      ${kv('Hora', a.eHora)}${kv('Lugar', a.ePlace)}${kv('Se repite', rep)}
      ${a.eKind === 'pendiente' ? kv('Para', a.ePara) + kv('Fecha límite', a.eDue ? shY(a.eDue) : 'Sin fecha') + kv('Estado', a.estado === 'Completada' ? 'Hecho' + (a.eDoneBy ? ' · ' + a.eDoneBy : '') : 'Pendiente') : ''}
      ${kv('Creado por', a.eBy)}${kv('Nota', a.notas)}
    </div></div>
    <a class="nlink" href="https://eliaflores.github.io/Personal/planes/" target="_blank" rel="noopener"><span class="nbadge eb">E</span> Abrir en Nuestros Planes ${ic('ext')}</a>
    <p class="note">Solo lectura: se edita desde la app de Elia.</p></div>`);
  document.getElementById('sheet').querySelector('[data-close]').onclick = closeSheet;
}

/* ---------- Ajustes ---------- */
function eliaSettings(box) {
  const u = E.user, st = E.estado;
  const n = E.ev.length + E.pe.length;
  const msg = !u ? 'Muestra en morado los eventos y pendientes compartidos de Nuestros Planes (solo lectura). Entra con tu cuenta de Google.'
    : st === 'busy' ? 'Conectando…'
      : st === 'error' ? `<b style="color:var(--red)">${esc(E.err)}</b>`
        : `<b>Conectado</b> como ${esc(u.email || '')} · ${E.ev.length} eventos, ${E.pe.length} pendientes`;
  box.innerHTML = `<div class="dcard" style="margin-bottom:12px"><div class="h">${ic('heart')} Nuestros Planes (Elia)</div><div class="in" style="padding:4px 14px">
    <div class="tg" style="display:block;line-height:1.45;color:var(--ink2)">${msg}</div>
    ${u ? `<div class="tg"><div>Mostrar en el calendario<small>Eventos y pendientes compartidos, en morado</small></div>
      <label class="sw"><input type="checkbox" id="eOn" ${eliaOn ? 'checked' : ''}><i></i></label></div>` : ''}
  </div></div>
  ${u && E.cid ? `<button class="big ghost" style="margin-top:0" data-ekey>${ic('sparkle')} Copiar llave para Atajos (ideas)</button>` : ''}
  <button class="big ${u ? 'ghost' : ''}" style="margin-top:0" data-elia>${ic(u ? 'x' : 'heart')} ${u ? 'Desconectar Nuestros Planes' : 'Conectar con Nuestros Planes'}</button>`;
  box.querySelector('[data-elia]').onclick = () => u ? E.auth.signOut().then(() => toast('Desconectado')) : eliaLogin();
  const kb = box.querySelector('[data-ekey]');
  if (kb) kb.onclick = async () => {
    const key = `${E.user.uid}|${E.cid}|${E.user.refreshToken}`;
    try { await navigator.clipboard.writeText(key); toast('Llave copiada: pégala en el atajo. Trátala como contraseña.') }
    catch (e) { prompt('Copia esta llave (trátala como contraseña):', key) }
  };
  const on = box.querySelector('#eOn');
  if (on) on.onchange = () => { eliaOn = on.checked; try { localStorage.setItem('tracker-elia', eliaOn ? '1' : '0') } catch (e) { } eliaPush() };
}

eliaInit();
