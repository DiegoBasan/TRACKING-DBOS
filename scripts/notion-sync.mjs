// Sincroniza el Task Tracker de Notion (JOHN DEERE AUTOMATION) → Firestore
// Trae TODAS las tareas (campo notionStatus). La app muestra solo las de "HOY" en modo normal
// y todas en modo "Todo".
// - Completada en la app → "Done" en Notion.
// - Cada tarea va en su Fecha; sin fecha: "HOY" → hoy, las demás → fecha de creación.
// - Para cuidar el plan gratis de Firebase: cada 15 min solo trae lo editado;
//   una vez al día hace sincronización completa (y quita las borradas/archivadas).
import admin from 'firebase-admin';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DB_ID || '68baf48f9c2943ff973d460a3615664b';
const STATUS_PROP = 'STATUS', STATUS_HOY = 'HOY', STATUS_DONE = 'Done';
const TZ = process.env.TZ_APP || 'America/Chihuahua';
const FORCE_FULL = process.env.FULL === '1';
if (!NOTION_TOKEN) { console.error('Falta el secreto NOTION_TOKEN'); process.exit(1); }
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Falta el secreto FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const ROOT = db.collection('tracking-dbos').doc('app');
const COL = ROOT.collection('actividades');

const dayIn = d => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}` };
const HOY = dayIn(new Date());

async function notion(path, method = 'GET', body) {
  const r = await fetch('https://api.notion.com/v1/' + path, {
    method,
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Notion ${r.status}: ${j.message || JSON.stringify(j)}`);
  return j;
}
const plain = rt => (rt || []).map(t => t.plain_text).join('').trim();

// Grupos del STATUS (To-do / In progress / Complete)
const dbInfo = await notion('databases/' + DB_ID);
const st = dbInfo.properties[STATUS_PROP]?.status || { options: [], groups: [] };
const optGroup = {};
for (const g of st.groups || []) for (const id of g.option_ids || []) { const o = st.options.find(x => x.id === id); if (o) optGroup[o.name] = g.name.toLowerCase() }
const isComplete = s => (optGroup[s] || '').includes('complete');
const isProgress = s => s === 'Started' || (optGroup[s] || '').includes('progress');

// 1) Completadas en la app → Done en Notion
const done = await COL.where('fuente', '==', 'notion').where('estado', '==', 'Completada').get();
for (const d of done.docs) {
  const x = d.data();
  if (!x.notionId || x.notionDone) continue;
  try {
    await notion('pages/' + x.notionId, 'PATCH', { properties: { [STATUS_PROP]: { status: { name: STATUS_DONE } } } });
    await d.ref.set({ notionDone: true, notionStatus: STATUS_DONE }, { merge: true });
    console.log('✓ Done en Notion:', x.titulo);
  } catch (e) { console.warn('No se pudo marcar Done:', x.titulo, e.message); }
}

// 2) ¿Completa o incremental?
const cfg = (await ROOT.get()).data() || {};
const full = FORCE_FULL || cfg.notionFullAt !== HOY;
const startedAt = new Date();
const since = cfg.notionSyncAt ? new Date(new Date(cfg.notionSyncAt).getTime() - 5 * 60 * 1000).toISOString() : null;

let pages = [], cursor;
do {
  const body = { page_size: 100, start_cursor: cursor };
  if (!full && since) body.filter = { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } };
  const r = await notion(`databases/${DB_ID}/query`, 'POST', body);
  pages = pages.concat(r.results); cursor = r.has_more ? r.next_cursor : undefined;
} while (cursor);
console.log(`${full ? 'Completa' : 'Incremental'} · ${pages.length} tareas de Notion`);

// Docs actuales de Notion en Firestore (en la completa se leen todos de una vez)
const prevMap = {};
if (full) (await COL.where('fuente', '==', 'notion').get()).docs.forEach(d => prevMap[d.id] = d.data());

// 3) Escribir solo lo que cambió
const keep = new Set();
let writes = 0;
const cmpKeys = ['titulo', 'inicio', 'fin', 'notas', 'estado', 'notionStatus', 'notionUrl', 'notionDone', 'categoria'];
for (const pg of pages) {
  const pr = pg.properties || {};
  const titulo = plain(Object.values(pr).find(x => x.type === 'title')?.title) || '(sin título)';
  const fecha = Object.values(pr).find(x => x.type === 'date')?.date;
  const desc = Object.values(pr).find(x => x.type === 'rich_text');
  const status = pr[STATUS_PROP]?.status?.name || '';
  let ini = fecha?.start?.slice(0, 10) || '', fin = (fecha?.end || fecha?.start || '').slice(0, 10);
  if (!ini) { ini = status === STATUS_HOY ? HOY : dayIn(new Date(pg.created_time)); fin = ini }
  if (!fin || fin < ini) fin = ini;

  const id = 'N' + pg.id.replace(/-/g, '');
  keep.add(id);
  const ref = COL.doc(id);
  let prev = prevMap[id];
  if (!full) { const s = await ref.get(); prev = s.exists ? s.data() : undefined }

  // Estado: mientras el STATUS de Notion no cambie, se respeta lo que hiciste en la app
  let estado;
  if (prev && prev.notionStatus === status && prev.estado) estado = prev.estado;
  else if (isComplete(status)) estado = 'Completada';
  else if (status === STATUS_HOY) estado = prev?.estado && prev.estado !== 'Completada' ? prev.estado : 'Pendiente';
  else estado = isProgress(status) ? 'En curso' : 'Pendiente';

  const data = {
    id, titulo, inicio: ini, fin, notas: plain(desc?.rich_text),
    categoria: 'trabajo', estado,
    fuente: 'notion', notionId: pg.id, notionUrl: pg.url, notionStatus: status,
    notionDone: isComplete(status) ? true : !!(prev?.notionDone && estado === 'Completada'),
  };
  if (prev && cmpKeys.every(k => JSON.stringify(prev[k] ?? '') === JSON.stringify(data[k] ?? ''))) continue;
  if (!prev) { data.tipo = 'simple'; data.etapas = [] }
  data.actualizado = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(data, { merge: true }); writes++;
}

// 4) En la completa: quitar las que ya no existen en Notion (borradas o archivadas)
let removed = 0;
if (full) for (const id in prevMap) if (!keep.has(id)) { await COL.doc(id).delete(); removed++ }

await ROOT.set({ notionSyncAt: startedAt.toISOString(), ...(full ? { notionFullAt: HOY } : {}) }, { merge: true });
console.log(`Listo · ${writes} escritas · ${removed} quitadas`);
