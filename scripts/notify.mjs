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
const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
const now = new Date();
const p = parts(now);
const HOY = `${p.year}-${p.month}-${p.day}`;
const HORA = Number(p.hour);
const t = parts(new Date(now.getTime() + 24 * 3600e3));
const MANANA = `${t.year}-${t.month}-${t.day}`;
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corto = s => { const [, m, d] = s.split('-').map(Number); return `${d} ${MES3[m - 1]}`; };
console.log(`Hoy ${HOY} ${HORA}:00 (${TZ}) · modo ${MODO}`);

// ---- Datos
const acts = (await ROOT.collection('actividades').get()).docs.map(d => d.data()).filter(a => a.id && a.inicio);
const devs = (await ROOT.collection('dispositivos').get()).docs.map(d => ({ _id: d.id, ...d.data() })).filter(d => d.token);
console.log(`${acts.length} actividades · ${devs.length} dispositivos`);
if (!devs.length) process.exit(0);

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
const enviados = ROOT.collection('enviados');
async function yaEnviado(key) { return (await enviados.doc(key).get()).exists; }
async function marcar(key) { await enviados.doc(key).set({ fecha: HOY, en: admin.firestore.FieldValue.serverTimestamp() }); }

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

for (const dev of devs) {
  const id = dev._id;

  if (MODO === 'prueba') {
    await enviar(dev, null, 'Tracker ✓', `Notificaciones funcionando · ${abiertas.length} actividades activas`, 'prueba');
    continue;
  }

  const horaResumen = Number(dev.horaResumen ?? 8);

  // Resumen diario
  if (dev.resumen !== false && HORA >= horaResumen && HORA <= horaResumen + 2) {
    const activasHoy = abiertas.filter(a => a.inicio <= HOY && fin(a) >= HOY);
    const entregan = abiertas.filter(a => fin(a) === HOY);
    const atrasadas = abiertas.filter(a => fin(a) < HOY);
    const partes = [`${activasHoy.length} activas`];
    if (entregan.length) partes.push(`${entregan.length} entregan hoy`);
    if (atrasadas.length) partes.push(`${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}`);
    const lista = (entregan.length ? entregan : activasHoy).slice(0, 3).map(a => a.titulo).join(', ');
    await enviar(dev, `resumen-${HOY}-${id}`, 'Tu día', partes.join(' · ') + (lista ? `\n${lista}` : ''), 'resumen');
  }

  // Recordatorios individuales
  if (dev.recordatorios !== false && HORA >= horaResumen && HORA <= 21) {
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

// Limpieza: tokens inválidos y registros de envíos de más de 7 días
for (const id of malos) await ROOT.collection('dispositivos').doc(id).delete();
const limite = parts(new Date(now.getTime() - 7 * 24 * 3600e3));
const viejos = await enviados.where('fecha', '<', `${limite.year}-${limite.month}-${limite.day}`).get();
const batch = db.batch();
viejos.docs.forEach(d => batch.delete(d.ref));
if (!viejos.empty) await batch.commit();
console.log(`Listo · ${malos.length} tokens eliminados · ${viejos.size} registros viejos borrados`);
