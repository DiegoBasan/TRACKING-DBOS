// Envía notificaciones push del Tracker (lo ejecuta GitHub Actions cada hora).
// Lee Firestore: tracking-dbos/app/actividades y tracking-dbos/app/dispositivos
// Evita duplicados con tracking-dbos/app/enviados
import admin from 'firebase-admin';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('Falta el secreto FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });

const db = admin.firestore();
const ROOT = db.collection('tracking-dbos').doc('app');
const APP_URL = process.env.APP_URL || 'https://diegobasan.github.io/TRACKING-DBOS/';
const TZ = process.env.TZ_APP || 'America/Chihuahua';
const MODO = process.env.MODO || 'auto';

// ---- Fecha/hora local
const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
const now = new Date();
const p = parts(now);
const HOY = `${p.year}-${p.month}-${p.day}`;
const HORA = Number(p.hour);
const NOWMIN = HORA * 60 + Number(p.minute || 0);
const t = parts(new Date(now.getTime() + 24 * 3600e3));
const MANANA = `${t.year}-${t.month}-${t.day}`;
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corto = s => { const [, m, d] = s.split('-').map(Number); return `${d} ${MES3[m - 1]}`; };
const HORARIA = Number(p.minute || 0) < 5 || MODO === 'prueba';   // corrida "completa" una vez por hora
console.log(`Hoy ${HOY} ${HORA}:${p.minute} (${TZ}) · modo ${MODO} · ${HORARIA ? 'completa' : 'ligera'}`);

// ---- Datos
// De Notion solo cuentan las que están en STATUS "HOY" (las demás solo se ven en el modo Todo)
// (Las actividades solo se leen cuando hacen falta, para no gastar la cuota gratis de Firestore)
let acts = [];
const cargarActs = async () => { acts = (await ROOT.collection('actividades').get()).docs.map(d => d.data()).filter(a => a.id && a.inicio && !(a.fuente === 'notion' && a.notionStatus && a.notionStatus !== 'HOY')) };
// ---- Rutinas
const cfg = (await ROOT.get()).data() || {};
const DE = !!cfg.rutinasDE;
const ruts = (await ROOT.collection('rutinas').get()).docs.map(d => d.data()).filter(r => r.activa !== false);
const LOG = {};
const hayIntervalo = ruts.some(r => r.tipo === 'intervalo');
if (HORARIA && hayIntervalo) {
  const desde = new Date(now.getTime() - 400 * 24 * 3600e3).toISOString().slice(0, 10);
  (await ROOT.collection('rutinasLog').where(admin.firestore.FieldPath.documentId(), '>=', desde).get()).docs.forEach(d => LOG[d.id] = d.data());
} else { const d = await ROOT.collection('rutinasLog').doc(HOY).get(); if (d.exists) LOG[HOY] = d.data(); }
const addInterval = (ds, n, u) => { const [y, m, dd] = ds.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1, dd)); if (u === 'meses') d.setUTCMonth(d.getUTCMonth() + n); else d.setUTCDate(d.getUTCDate() + n * (u === 'semanas' ? 7 : 1)); return d.toISOString().slice(0, 10) };
const dowOf = ds => { const [y, m, dd] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay() };
function slotsHoy(r) {
  if (r.tipo === 'diaria') return r.ventanas && r.ventanas.length ? r.ventanas : [{}];
  if (r.tipo === 'semanal') { const v = (r.dias || {})[dowOf(HOY)]; return v ? (v.length ? v : [{}]) : [] }
  if (r.tipo === 'mensual') { const [y, m, d] = HOY.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return d === Math.min(Number(r.diaMes) || 1, last) ? [{}] : [] }
  if (r.tipo === 'intervalo') {
    if (!HORARIA) return [];   // se revisan en la corrida de cada hora
    let ld = ''; for (const ds in LOG) if (ds <= HOY && LOG[ds][r.id + '_0'] && ds > ld) ld = ds;
    const nd = ld ? addInterval(ld, Number(r.cada) || 1, r.unidad || 'dias') : (r.desde || HOY);
    return nd <= HOY ? [{}] : [];
  }
  return [];
}
const toMin = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) };
const fmtT = s => { const [h, m] = s.split(':'); return Number(h) + (m !== '00' ? ':' + m : '') };
const rutAvisos = [];   // {key, title, body}
for (const r of ruts) {
  slotsHoy(r).forEach((w, i) => {
    if (LOG[HOY] && LOG[HOY][r.id + '_' + i]) return;            // ya hecho
    const a = toMin(w.ini), b = toMin(w.fin);
    const start = a != null ? a : b != null ? b - 180 : 9 * 60;  // sin hora → 9:00; solo "hasta" → 3 h antes
    const end = b != null ? b : start + 180;
    if (NOWMIN < start - 20 || NOWMIN >= end) return;
    const name = DE ? (r.nombreDe || r.nombre) : r.nombre;
    const when = w.ini && w.fin ? `${fmtT(w.ini)}–${fmtT(w.fin)}` : w.ini ? (DE ? 'ab ' : 'desde ') + fmtT(w.ini) : w.fin ? (DE ? 'bis ' : 'antes de las ') + fmtT(w.fin) : (DE ? 'heute' : 'hoy');
    rutAvisos.push({ key: `rut-${r.id}-${i}-${HOY}`, title: name, body: (DE ? 'Routine · ' : 'Rutina · ') + when });
  });
}
console.log(`${ruts.length} rutinas activas · ${rutAvisos.length} avisos posibles ahora`);

const devs = (await ROOT.collection('dispositivos').get()).docs.map(d => ({ _id: d.id, ...d.data() })).filter(d => d.token);
if (!devs.length) { console.log('Sin dispositivos'); process.exit(0); }

// ---- Envíos de hoy: un solo documento por día (enviadosDia/{HOY}) en vez de uno por aviso
const diaRef = ROOT.collection('enviadosDia').doc(HOY);
const ENV = new Set(Object.keys((await diaRef.get()).data() || {}));
const pend = {};

// ¿Hace falta leer las actividades?
const quiereResumen = d => d.resumen !== false && HORA >= Number(d.horaResumen ?? 8) && HORA <= Number(d.horaResumen ?? 8) + 2 && !ENV.has(`resumen-${HOY}-${d._id}`);
const quiereRecord = d => d.recordatorios !== false && HORA >= Number(d.horaResumen ?? 8) && HORA <= 21;
if (MODO === 'prueba' || devs.some(quiereResumen) || (HORARIA && devs.some(quiereRecord))) await cargarActs();
console.log(`${acts.length} actividades leídas · ${devs.length} dispositivos`);

const etapas = a => a.etapas || [];
const estado = a => {
  const e = etapas(a);
  if (a.tipo === 'tracker' && e.length) {
    const d = e.filter(x => x.completada).length;
    if (d === e.length) return 'Completada';
    if (d > 0) return 'En curso';
  }
  return a.estado || 'Pendiente';
};
const abiertas = acts.filter(a => estado(a) !== 'Completada');
const fin = a => a.fin || a.inicio;

// ---- Envío
async function yaEnviado(key) { return ENV.has(key) || key in pend; }
async function marcar(key) { pend[key] = true; ENV.add(key); }

let malos = [];
async function enviar(dev, key, title, body, tag) {
  if (key && await yaEnviado(key)) return;
  try {
    await admin.messaging().send({
      token: dev.token,
      notification: { title, body },
      webpush: {
        notification: { title, body, icon: APP_URL + 'icons/icon-192.png', badge: APP_URL + 'icons/icon-192.png', tag: tag || key || 'tracker' },
        fcmOptions: { link: APP_URL }
      }
    });
    if (key) await marcar(key);
    console.log(`✓ ${dev._id}: ${title} — ${body}`);
  } catch (e) {
    console.warn(`✗ ${dev._id}: ${e.code || e.message}`);
    if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'].includes(e.code)) malos.push(dev._id);
  }
}

// Notificaciones programadas a una hora exacta (tracking-dbos/app/programadas)
const progSnap = await ROOT.collection('programadas').where('enviada', '==', false).get();
const progs = progSnap.docs.map(d => ({ _ref: d.ref, ...d.data() }))
  .filter(n => !n.enviada && n.cuando && Date.parse(n.cuando) <= now.getTime() + 60e3 && Date.parse(n.cuando) > now.getTime() - 3 * 3600e3);

for (const dev of devs) {
  const id = dev._id;
  for (const n of progs) await enviar(dev, `prog-${n._ref.id}-${id}`, n.titulo || 'Recordatorio', n.cuerpo || '', 'prog-' + n._ref.id);

  if (MODO === 'prueba') {
    await enviar(dev, null, 'Tracker ✓', `Notificaciones funcionando · ${abiertas.length} actividades activas`, 'prueba');
    continue;
  }

  const horaResumen = Number(dev.horaResumen ?? 8);

  // Resumen diario
  if (acts.length && dev.resumen !== false && HORA >= horaResumen && HORA <= horaResumen + 2) {
    const activasHoy = abiertas.filter(a => a.inicio <= HOY && fin(a) >= HOY);
    const entregan = abiertas.filter(a => fin(a) === HOY);
    const atrasadas = abiertas.filter(a => fin(a) < HOY);
    const partes = [`${activasHoy.length} activas`];
    if (entregan.length) partes.push(`${entregan.length} entregan hoy`);
    if (atrasadas.length) partes.push(`${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}`);
    const lista = (entregan.length ? entregan : activasHoy).slice(0, 3).map(a => a.titulo).join(', ');
    await enviar(dev, `resumen-${HOY}-${id}`, 'Tu día', partes.join(' · ') + (lista ? `\n${lista}` : ''), 'resumen');
  }

  // Rutinas
  if (dev.rutinas !== false) for (const a of rutAvisos) await enviar(dev, `${a.key}-${id}`, a.title, a.body, a.key);

  // Recordatorios individuales (se revisan una vez por hora)
  if (acts.length && HORARIA && dev.recordatorios !== false && HORA >= horaResumen && HORA <= 21) {
    for (const a of abiertas) {
      if (a.inicio === HOY && fin(a) !== HOY) await enviar(dev, `ini-${a.id}-${HOY}-${id}`, 'Empieza hoy', a.titulo);
      if (fin(a) === HOY) await enviar(dev, `fin-${a.id}-${HOY}-${id}`, 'Entrega hoy', a.titulo);
      for (const e of etapas(a)) {
        if (!e.completada && e.fecha === HOY) await enviar(dev, `et-${a.id}-${e.id}-${HOY}-${id}`, `Avance para hoy · ${a.titulo}`, e.titulo);
      }
    }
    if (HORA >= 18) {
      for (const a of abiertas.filter(a => fin(a) === MANANA)) {
        await enviar(dev, `man-${a.id}-${HOY}-${id}`, 'Entrega mañana', `${a.titulo} · ${corto(MANANA)}`);
      }
    }
  }
}

for (const n of progs) await n._ref.set({ enviada: true }, { merge: true });
if (Object.keys(pend).length) await diaRef.set(pend, { merge: true });

// Limpieza: tokens inválidos y registros de envíos de más de 7 días
for (const id of malos) await ROOT.collection('dispositivos').doc(id).delete();
let borrados = 0;
if (HORARIA && HORA === 3) {   // limpieza una vez al día
  const limite = parts(new Date(now.getTime() - 7 * 24 * 3600e3)), lim = `${limite.year}-${limite.month}-${limite.day}`;
  for (const c of ['enviados', 'enviadosDia']) {
    const q = c === 'enviados' ? ROOT.collection(c).limit(400) : ROOT.collection(c).where(admin.firestore.FieldPath.documentId(), '<', lim);
    const viejos = await q.get(); const batch = db.batch();
    viejos.docs.forEach(d => batch.delete(d.ref)); if (!viejos.empty) await batch.commit(); borrados += viejos.size;
  }
}
console.log(`Listo · ${malos.length} tokens eliminados · ${borrados} registros viejos borrados`);
