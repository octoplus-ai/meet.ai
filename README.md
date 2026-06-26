# Cadence — Meeting Intelligence (proyecto local)

App de inteligencia de reuniones estilo Read.ai: resume, puntúa, extrae próximos
pasos y tiene un chat que busca entre todas tus reuniones. Lista para correr en tu
compu y editar con Claude Code.

---

## Antes de empezar
Necesitás **Node.js 18 o superior**. Si no lo tenés, instalalo desde
https://nodejs.org (versión LTS). Para verificar, en una terminal:

    node --version

---

## Puesta en marcha (5 pasos)

1. **Descomprimí** esta carpeta donde quieras (por ejemplo en `Documentos`, no en
   `Downloads`).

2. **Abrila en VS Code:** `Archivo → Abrir carpeta…` y elegí la carpeta `cadence-app`.
   (Claude Code trabaja sobre la carpeta completa, no sobre un archivo suelto.)

3. **Poné tu API key:** duplicá el archivo `.env.example`, renombralo a `.env` y
   pegá tu clave de Anthropic adentro. La sacás de
   https://console.anthropic.com/ → *API Keys*.
   > Ojo: el uso de la API se cobra por consumo, aparte de tu suscripción a Claude.

4. **Instalá las dependencias.** Abrí la terminal integrada con `` Ctrl+` `` (o
   `Ver → Terminal`) y corré:

       npm install

5. **Arrancá la app:**

       npm run dev

   Se abre solo en http://localhost:5173. Si no, abrí esa dirección en el navegador.

---

## Vibe coding con Claude Code

Con la app andando, ya podés iterar viendo los cambios al instante:

1. Hacé clic en el ícono **✱ (Spark)** de Claude Code (arriba a la derecha o en la
   barra izquierda).
2. Pedile cambios en español, referenciando el archivo. Por ejemplo:
   - `En @src/App.jsx cambiá el color de marca de violeta a verde esmeralda`
   - `Agregá un botón en cada reunión para exportar el resumen a PDF`
   - `Traducí toda la interfaz al español`
3. Claude te muestra los cambios como **diff**; los aceptás o rechazás.
4. Al guardar, el navegador se refresca solo y ves el resultado.

Consejo: empezá en el modo que pide permiso antes de cada edición hasta agarrarle
la mano.

---

## Publicar online (estilo Vercel)

La app ya viene preparada: en `api/anthropic.js` hay una *serverless function* que
hace de proxy en producción (igual que el proxy de desarrollo), así la IA sigue
funcionando una vez publicada. La forma más simple, sin GitHub:

1. Instalá la CLI de Vercel (una sola vez):

       npm install -g vercel

2. Desde la carpeta `cadence-app`, iniciá sesión y subí un preview:

       vercel

   Te abre el navegador para loguearte y te hace 3-4 preguntas (aceptá los valores
   por defecto). Al terminar te da una URL de preview.

3. Cargá tu API key como variable de entorno (no va en el código):

       vercel env add ANTHROPIC_API_KEY

   Pegá tu clave y elegí los tres entornos cuando pregunte (Production, Preview,
   Development).

4. Publicá la versión final:

       vercel --prod

   Esa URL es tu app online.

> **Alternativa con auto-deploy:** subí la carpeta a un repo de GitHub, entrá a
> vercel.com → *Add New Project* → importá el repo, agregá la variable
> `ANTHROPIC_API_KEY` en *Settings → Environment Variables*, y listo. Cada vez que
> hagas `git push`, Vercel redeploya solo.

### ⚠️ Importante sobre seguridad y costos
Una vez publicada, **cualquiera con el link puede usar la IA y eso consume tu API
key** (se cobra por uso). Antes de compartirla:
- Poné un **límite de gasto** en https://console.anthropic.com/ (*Billing → Limits*).
- Si querés que no sea pública, activá la **protección por contraseña** del
  deployment en Vercel (*Settings → Deployment Protection*).

---

## Cómo está armado

- `src/App.jsx` — toda la aplicación (dashboard, reuniones, chat, alta de reunión).
- `index.html` — carga Tailwind por CDN (sin configuración).
- `vite.config.js` — incluye un mini-proxy `/api/anthropic` que es lo que permite
  usar la IA de forma segura: tu API key queda en el servidor de desarrollo, nunca
  en el navegador.
- Los datos se guardan en `localStorage` del navegador (persisten entre sesiones).
  Para volver a los datos de ejemplo: pestaña *Settings → Reset demo data*.

---

## Si algo falla

- **"Falta ANTHROPIC_API_KEY"** al analizar o chatear → revisá que el archivo se
  llame exactamente `.env` y que tenga tu key. Reiniciá `npm run dev` después de
  editarlo.
- **Pantalla en blanco** → mirá la terminal y la consola del navegador (F12) por
  errores; casi siempre es una dependencia sin instalar (`npm install`).
- **El puerto 5173 está ocupado** → Vite te ofrece otro puerto automáticamente.
