// Sincroniza el Task Tracker de Notion (JOHN DEERE AUTOMATION) → Firestore
// Solo las tareas con STATUS = "HOY". Aparecen en la app como categoría Trabajo (azul).
// - Si la tarea ya no está en "HOY", se quita de la app.
// - Si en la app la marcas como Completada, aquí se cambia a "Done" en Notion.
import admin from 'firebase-admin';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DB_ID || '68baf48f9c2943ff973d460a3615664b';
const STATUS_PROP = 'STATUS', STATUS_HOY = 'HOY', STATUS_DONE = 'Done';
const TZ = process.env.TZ_APP || 'America/Chihuahua';
if (!NOTION_TOKEN) { console.error('Falta el secreto NOTION_TOKEN'); process.exit(1); }
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Falta el secreto FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const COL = admin.firestore().collection('tracking-dbos').doc('app').collection('actividades');

const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
const HOY = `${p.year}-${p.month}-${p.day}`;

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

// 1) Tareas completadas en la app → Done en Notion
const done = await COL.where('fuente', '==', 'notion').where('estado', '==', 'Completada').get();
for (const d of done.docs) {
  const pid = d.data().notionId;
  if (!pid || d.data().notionDone) continue;
  try {
    await notion('pages/' + pid, 'PATCH', { properties: { [STATUS_PROP]: { status: { name: STATUS_DONE } } } });
    await d.ref.set({ notionDone: true }, { merge: true });
    console.log('✓ Done en Notion:', d.data().titulo);
  } catch (e) { console.warn('No se pudo marcar Done:', d.data().titulo, e.message); }
}

// 2) Leer las de "HOY"
let pages = [], cursor;
do {
  const r = await notion(`databases/${DB_ID}/query`, 'POST', {
    filter: { property: STATUS_PROP, status: { equals: STATUS_HOY } },
    start_cursor: cursor, page_size: 100,
  });
  pages = pages.concat(r.results); cursor = r.has_more ? r.next_cursor : undefined;
} while (cursor);
console.log(`${pages.length} tareas en HOY`);

// 3) Escribir en Firestore
const keep = new Set();
for (const pg of pages) {
  const pr = pg.properties || {};
  const titleProp = Object.values(pr).find(x => x.type === 'title');
  const titulo = plain(titleProp?.title) || '(sin título)';
  const fecha = Object.values(pr).find(x => x.type === 'date')?.date;
  const desc = Object.values(pr).find(x => x.type === 'rich_text');
  let ini = fecha?.start?.slice(0, 10) || HOY, fin = (fecha?.end || fecha?.start || '').slice(0, 10) || ini;
  // Si sigue en "HOY" pero la fecha ya pasó, se muestra en el día de hoy
  if (fin < HOY) { ini = HOY; fin = HOY }
  else if (ini > fin) ini = fin;
  const id = 'N' + pg.id.replace(/-/g, '');
  keep.add(id);
  const ref = COL.doc(id), snap = await ref.get(), prev = snap.exists ? snap.data() : {};
  const data = {
    id, titulo, inicio: ini, fin, notas: plain(desc?.rich_text),
    categoria: 'trabajo', tipo: prev.tipo || 'simple',
    estado: prev.estado || 'Pendiente',          // el estado lo controlas desde la app
    fuente: 'notion', notionId: pg.id, notionUrl: pg.url,
    actualizado: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!snap.exists) { data.etapas = []; data.notionDone = false }
  await ref.set(data, { merge: true });
}

// 4) Quitar las que ya no están en "HOY"
const all = await COL.where('fuente', '==', 'notion').get();
let removed = 0;
for (const d of all.docs) if (!keep.has(d.id)) { await d.ref.delete(); removed++ }
console.log(`Listo · ${keep.size} sincronizadas · ${removed} quitadas`);
