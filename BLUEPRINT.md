# Cadence / Meet AI — Blueprint del clon de Read.ai

> Documento base para clonar **Read.ai** (meeting intelligence) y luego extenderlo a
> **coaching / entrenamiento de empleados**. Combina (a) investigación verificada con
> fuentes citadas y (b) análisis del producto real desde screenshots del usuario
> (cuenta Enterprise). Fecha: 2026-06.

---

## 1. Qué es Read.ai (síntesis verificada)

Plataforma de "meeting intelligence". Un **notetaker (Read Assistant)** se une
automáticamente a **Zoom, Google Meet y Microsoft Teams** (y soporta reuniones
presenciales), graba, transcribe y genera **meeting reports** con: resumen, action
items, Chapters & Topics, transcripción con reacciones/sentimiento en tiempo real, y
playback + highlight reel de 2 min (estos últimos **solo en Enterprise**).

Su **diferenciador** es una capa de métricas propietaria: **Read Score** (promedio de
Sentiment + Engagement) más métricas por participante (Sentiment, Engagement, talk
time, **Bias**, **Charisma**), calculadas con **señales multimodales** (expresiones
faciales, movimientos de cabeza, lenguaje corporal, contacto visual + tono/volumen/
entonación de voz + NLP sobre el transcript).

Encima va el **AI Speaker Coach**: feedback privado por usuario en 3 pilares
(Clarity, Inclusion, Impact).

---

## 2. Catálogo de features

### Meeting Reports (entregable central) — *verificado*
- **Summary** (resumen de puntos clave, decisiones, takeaways). En la UI: toggle
  **Standard / Short**.
- **Transcription 2.0**: transcripción completa con reacciones/sentimiento embebidos.
- **Action Items** auto-generados.
- **Chapters & Topics**: navegación por estructura de la reunión.
- **Deep Dive**: métricas por participante (talk time, Bias, Charisma, etc.).
- **Playback** + **highlight reel 2 min** → *solo Enterprise*.

### Vistas del report (desde screenshots) — *parcialmente verificado*
`Notes` · `Transcript` · `Deep Dive` · `Coaching` · `Highlights` · `Chapters`.
Verificadas por fuentes: Deep Dive, Chapters, Coaching, Transcription, Highlights.
**`Ask Read`** (chat Q&A sobre la reunión y across-meetings), **Notes** privadas,
**Key Questions con respuestas propuestas (Accept/Reject)** y **For You** se ven en la
UI pero **no** fueron confirmados por fuente independiente (tratar como "observado en
UI", a clonar igual).

### Tiempo real — *verificado*
Live dashboard durante la reunión: transcripción en vivo, resúmenes (actualizados
~cada minuto) y métricas en vivo (sentiment, engagement, talk time).

---

## 3. Métricas y scoring (definiciones citadas)

| Métrica | Definición oficial | Señales |
|---|---|---|
| **Read Score** | **Promedio** de Sentiment + Engagement. Excepción: Engagement ≥80 amplifica el Sentiment. Umbrales: Good 80+, Avg 70-79, Bad 0-69. | derivado |
| **Engagement** | Cuánta atención/participación hay. Clasificado high/med/low en tiempo real. | facial + verbal + talk time |
| **Sentiment** | Qué tan positiva/negativa es la conversación. positive/neutral/negative. | facial + verbal |
| **Bias** | Qué tan positiva/negativamente **vos reaccionás mientras otros hablan**. | análisis visual: contacto visual, asentir, expresión facial |
| **Charisma** | **Inverso de Bias**: cómo reaccionan los demás hacia vos. Target recomendado **80+**. | análisis visual de los demás |
| **Talking Pace** | Palabras por minuto. Rango recomendado **130–175 WPM**. | transcript + timing |
| **Filler words** | Uso de muletillas ("so", "umm"). Objetivo **< ~4%**. | transcript (NLP) |
| **Non-inclusive terms** | Terminología no inclusiva + interrupciones. | transcript (NLP) |
| **Questions asked** | Nº de preguntas hechas. | transcript (NLP) |
| **Talk time / Participation** | % de tiempo hablado por persona. | diarización |
| **Mic Off / Camera Off** | % de la reunión con mic/cámara apagados. | metadata de plataforma |

> El modelo de engagement analiza expresiones faciales, movimientos de cabeza, lenguaje
> corporal y pitch/volumen/entonación con modelos propietarios.
> **Nota regional:** para usuarios EU/UK, Read **excluye** el componente facial/video del
> Read Score.

### ⚠️ Implicación para el clon
Las métricas faciales (Engagement, Sentiment, Bias, Charisma "visuales") requieren
**visión por computador sobre video** — caro, difícil y con **riesgo de privacidad/
sesgo/regulación** (especialmente para evaluar empleados). **Estrategia recomendada:**
arrancar con métricas **derivables del transcript/audio** (talk time, WPM, filler words,
términos no inclusivos, preguntas, sentiment textual del LLM) y dejar el análisis facial
como fase avanzada opcional y claramente consentida.

---

## 4. Coaching / Speaker Coach (citado)

- Es una **sección privada por usuario** del report (privada incluso si compartís el
  report). Se obtiene con solo agregar Read a la reunión.
- 3 pilares:
  - **Clarity** = talking pace (WPM 130–175) + filler words (<~4%).
  - **Inclusion** = términos no inclusivos + interrupciones.
  - **Impact** = Bias + Charisma (target 80+) + questions asked.
- Da insights accionables + nudges en reunión sobre velocidad y muletillas.
- Modelo "see and say": primero ver la métrica y su rango ideal, luego reproducir los
  momentos.

→ **Este es el núcleo de tu extensión de "training de empleados"**: histórico de
métricas por persona, progreso en el tiempo, objetivos, comparación vs. benchmark.

---

## 5. Planes y precios (2026, citado)

- **Free** — $0, sin tarjeta. 5 transcripts/mes, summaries, transcripción, enterprise
  search ilimitada, meeting coach personalizado, integraciones básicas, 20+ idiomas,
  apps Windows/Mac/Android/iOS.
- **Pro** — $15/mes anual (25% off) o $19.75/mes mensual. Transcripts ilimitados, 100
  créditos de upload/mes, integraciones premium (Notion, Salesforce, HubSpot, Jira,
  Confluence, Zapier, webhooks), reuniones hasta 4 h.
- **Enterprise** — precio **no verificado** (el dato de $22.50/mo fue refutado).
  Confirmado: desbloquea **playback + video highlights**.

## 6. Integraciones (verificado)
Slack, HubSpot, Salesforce, Atlassian (Confluence/Jira), Notion, Asana, Zapier,
Webhooks + conectores de IA (ChatGPT, Claude, **MCP Server**, API) + **Smart Scheduler**
(link que empuja a tus horarios disponibles/productivos).

## 7. Competidores
Otter.ai, Fireflies.ai, Gong, Fathom, tl;dv, Avoma. Diferenciador de Read.ai = la capa
de métricas multimodales (engagement/sentiment/charisma/bias) y el Speaker Coach; la
mayoría de los demás se centran en notas/transcripción/CRM.

---

## 8. Arquitectura para el clon

### Realidad del codebase actual
La app actual (`cadence-app`) es **frontend React + Vite + Tailwind**, datos en
`localStorage`, y un **proxy a la API de Anthropic** (dev: `vite.config.js`; prod:
`api/anthropic.js`). **No** hay backend, base de datos, transcripción ni meeting bot.

### Dos caminos de ingesta
1. **Upload-first (recomendado para empezar):** el usuario sube audio/video o un
   transcript → se transcribe (si hace falta) → el LLM genera report + métricas. No
   requiere bot. Es lo que la UI de Read llama "Upload".
2. **Meeting bot (fase avanzada):** un bot se une a Zoom/Meet/Teams, graba y manda el
   stream. Construirlo nativo es muy costoso; lo estándar es usar **Recall.ai** (API
   única para los 3) o SDKs nativos. Alternativa OSS: proyectos tipo *meetily*.

### Pipeline técnico
```
Audio/Video  ──►  ASR + Diarización  ──►  Transcript con speakers+timestamps
                  (Whisper / Deepgram / AssemblyAI / Gladia)
                                   │
                                   ▼
        LLM (Claude) ──► Summary · Action Items · Key Questions ·
                          Chapters · Highlights · Keywords
                                   │
                                   ▼
        Análisis (código + LLM) ──► talk time · WPM · filler words ·
                          términos no inclusivos · preguntas · sentiment
                                   │
                                   ▼
        Persistencia (DB) ──► Reports, Folders, métricas históricas, RAG
                                   │
                                   ▼
        "Ask Read" = RAG sobre transcripts (embeddings + Claude)
```

### Stack sugerido (incremental, encaja con lo que ya hay)
- **Front:** seguir con React + Vite + Tailwind (ya está). Recharts para gráficos.
- **IA texto:** Claude (`claude-sonnet-4-6` ya en uso) para summary/action items/
  chapters/Q&A/sentiment textual.
- **Transcripción:** Deepgram o AssemblyAI o Gladia (traen diarización). Whisper si se
  quiere self-host.
- **Backend/DB:** Supabase (Postgres + auth + storage + pgvector para RAG) — encaja con
  Vercel y el deploy actual.
- **Meeting bot (fase 3+):** Recall.ai.

---

## 9. Plan por fases (mapeado a nuestra app)

**Fase 0 — Base UI (clonar la cáscara).** Reproducir Reports (lista + filtros), report
detail con tabs Notes/Transcript/Deep Dive/Coaching/Highlights/Chapters, scores
destacados, y "Ask Read". Datos demo en localStorage (ya hay base). *No requiere backend.*

**Fase 1 — IA sobre texto.** Subir/pegar un transcript → Claude genera Summary
(Standard/Short), Action Items, Key Questions + respuestas, Chapters, Keywords,
Highlights. (Aprovecha el proxy Anthropic ya existente.)

**Fase 2 — Métricas derivables del transcript.** talk time, WPM (Talking Pace), filler
words, términos no inclusivos, preguntas, sentiment textual → tabs Deep Dive y Coaching
reales.

**Fase 3 — Persistencia + cuentas.** Supabase: usuarios, reports guardados, folders,
histórico de coaching por empleado (núcleo del training). "Ask Read" con RAG.

**Fase 4 — Transcripción real.** Integrar ASR+diarización para subir audio/video directo.

**Fase 5 — Meeting bot + integraciones.** Recall.ai para auto-join; Slack/CRM/Calendar;
Smart Scheduler.

**Fase 6 — Training de empleados (tu visión).** Dashboards de progreso por persona,
objetivos, planes de mejora, comparación vs. benchmark, módulos de práctica.

---

## 10. Caveats importantes
- Las métricas faciales/emocionales de Read.ai son **metodología auto-descrita del
  vendor**, sin auditoría científica independiente. No asumir validez probada.
- Evaluar empleados con métricas emocionales/faciales conlleva **riesgo legal, de sesgo
  y de privacidad**. Diseñar con consentimiento explícito y, preferentemente, métricas
  objetivas del transcript.
- Pricing y feature-gating cambian seguido (datos 2026).

## Fuentes principales
read.ai/meeting-reports, /meetings, /meeting-tools, /coaching, /integrations,
/plans-pricing; support.read.ai (Sentiment/Engagement/Read Score; How does coaching
work); recall.ai/blog (notetaker, diarización, Meet bot); gladia.io (arquitectura
notetaker); github.com/Zackriya-Solutions/meetily.
