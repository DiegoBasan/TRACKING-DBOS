# TRACKING-DBOS · Tracker de actividades

App web instalable (PWA) para seguir actividades:

- **Calendario mensual** con barras de varios días y panel del día.
- **Lista** con búsqueda y filtros (En curso, Pendientes, Con avances, Atrasadas, Completadas).
- **Actividades con avances**: se ven como un tracker de envío (✓ completado · ◉ actual · ● pendiente) con línea de tiempo en el detalle.
- **Firebase Firestore** (proyecto `diagram-diapp`, colección `tracking-dbos`) en tiempo real y con caché sin internet.
- **Notificaciones push** (Firebase Cloud Messaging) enviadas por GitHub Actions cada hora.

App: https://diegobasan.github.io/TRACKING-DBOS/

---

## 1. GitHub Pages
Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save.

## 2. Firestore
Ya usa la config de `diagram-diapp`. Estructura:

```
tracking-dbos/app                      { vapidKey }
tracking-dbos/app/actividades/{id}     { id, titulo, inicio, fin, responsable, estado, tipo, notas,
                                         etapas: [{ id, titulo, fecha, completada, completadaEn }] }
tracking-dbos/app/dispositivos/{id}    { token, resumen, horaResumen, recordatorios, … }
tracking-dbos/app/enviados/{key}       registro para no repetir avisos
```

Si las reglas de Firestore estaban en *modo prueba* y ya vencieron, en Firestore → Reglas agrega:

```
match /tracking-dbos/{doc=**} {
  allow read, write: if true;
}
```

## 3. Notificaciones (una sola vez)

**a) Clave VAPID** — Firebase Console → ⚙︎ Configuración del proyecto → **Cloud Messaging** →
*Configuración web* → *Certificados de push web* → **Generar par de claves**. Copia la clave.

**b) Cuenta de servicio** — Configuración del proyecto → **Cuentas de servicio** →
**Generar nueva clave privada** (descarga un `.json`).

**c) Secreto en GitHub** — en este repo: Settings → Secrets and variables → Actions →
**New repository secret** → nombre `FIREBASE_SERVICE_ACCOUNT`, valor: el contenido completo del `.json`.

**d) En el iPhone** — abre la app en Safari → Compartir → **Agregar a pantalla de inicio** →
ábrela desde el ícono → ⚙︎ Ajustes → **Activar notificaciones** (la clave VAPID ya está en el código).

**e) Probar** — pestaña **Actions** → *Notificaciones* → **Run workflow** → modo `prueba`.

### Qué avisa
- **Resumen diario** a la hora que elijas (activas, entregas de hoy, atrasadas).
- **Recordatorios**: actividades que empiezan o se entregan hoy, avances con meta hoy y, a partir de las 18:00, entregas de mañana.
- Zona horaria: `America/Chihuahua`. Nada se repite el mismo día.

> GitHub pausa los cron de repos públicos tras 60 días sin commits; si dejan de llegar, reactívalo en Actions.

## Widget de iPhone (Scriptable)
1. Instala **Scriptable** (App Store) → **+** → pega el contenido de [`widget/tracker-widget.js`](widget/tracker-widget.js) → nómbralo `Tracker`.
2. Ejecútalo una vez dentro de Scriptable para ver la vista previa.
3. En la pantalla de inicio: mantén presionado → **+** → Scriptable → tamaño **mediano** → edita el widget → Script: `Tracker`.

**Versión calendario:** [`widget/tracker-widget-calendario.js`](widget/tracker-widget-calendario.js) — mismo estilo que la app (celdas redondeadas y barras de colores). Funciona en tamaño **mediano** y **grande**. *Parameter* del widget (separado por comas): `2` o `3` = solo esas semanas · `oscuro` / `claro` = tema (vacío = automático). Ej.: `2,oscuro`.

Lee Firestore directo (API REST, solo lectura) y usa las mismas categorías de [`categorias.js`](categorias.js).
Si no hay internet muestra lo último guardado. Tocarlo abre la app.
