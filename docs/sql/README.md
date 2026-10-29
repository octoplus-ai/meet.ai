# Instalación SQL de Zoom RTMS

Estos archivos se prepararon sin acceder a producción. Usan únicamente catálogos de PostgreSQL para revisar el esquema; no consultan usuarios, reuniones, transcripciones, tokens ni grabaciones. La instalación no inicia capturas ni cambia filas existentes.

| Archivo | Uso en el SQL Editor privado del proyecto correcto |
| --- | --- |
| `20261029_zoom_rtms.preflight.sql` | Lectura del esquema y bloqueo ante incompatibilidades conocidas. |
| `20261029_zoom_rtms.install.sql` | Migración completa con guard previo, verificaciones posteriores y **ROLLBACK final por defecto**. |
| `20261029_zoom_rtms.verify.sql` | Verificación de las 7 tablas privadas y 17 RPCs después de confirmar la instalación. |

Los tres archivos contienen el SHA-256 de `migrations/20261029_zoom_rtms.sql` normalizado a saltos de línea LF, para que el resultado sea igual en Windows y Linux. La migración original ya tiene `BEGIN/COMMIT`: no pegarla dentro de otra transacción ni agregarla por separado al archivo preparado. El generador quita únicamente ese envoltorio e incluye el cuerpo completo una sola vez.

## Antes de instalar

1. Confirmar el proyecto por la interfaz de Supabase y la identidad de la conexión SQL. `current_database()` por sí solo no identifica un proyecto Supabase, porque varios usan el nombre `postgres`. Usar el administrador privado del proyecto; no una clave del navegador ni una llamada REST de servicio.
2. Mantener `ZOOM_RTMS_ENABLED` y `ZOOM_RTMS_ROUTING` desactivados. Revisar la disponibilidad del respaldo/PITR existente en Supabase; no descargar datos ni cambiar la política de respaldos como parte de este procedimiento.
3. Ejecutar **todo** `20261029_zoom_rtms.preflight.sql`. Si el editor muestra sólo el último resultado, ejecutar por separado sus consultas de catálogo de lectura para inspeccionar los resultados. La transacción es de sólo lectura, con límite de 15 segundos por sentencia y 3 segundos para locks.
4. Debe aparecer `RTMS_BASE_SCHEMA_PREFLIGHT_OK`. Las tablas y funciones Zoom previas deben estar ausentes. Si existen, detener esta primera instalación y comparar su definición: `CREATE TABLE IF NOT EXISTS` no corrige un esquema parcial. No eliminarlas ni reemplazarlas a ciegas.

El guard revisa tipos mínimos, columnas generadas, roles, claves únicas válidas inmediatas y campos obligatorios que las inserciones omiten. Usa los tipos observados en el preflight de producción: `meetings.duration_min INTEGER`, `reports.read_score INTEGER` y `reports.transcript JSONB`. Los tipos `varchar` compatibles pueden pasar el guard; sus límites y restricciones **requieren revisión** en el resultado. No modifica tipos, agrega columnas ni repara restricciones automáticamente.

Revisar concretamente:

| Área | Compatibilidad necesaria |
| --- | --- |
| Identidad | `app_users.id` y `meetings.id`: UUID con clave única válida, no parcial ni diferible. `app_users.auto_join`: boolean. |
| Inserciones | `meetings.id` debe generarse por defecto. Todo campo adicional `NOT NULL` omitido necesita un default. Lo mismo aplica a `reports.id` y a otros campos de reports omitidos. |
| Estado | CHECKs de `meetings.status` deben admitir `scheduled`, `joining`, `recording`, `processing`, `error`, `done` y `skipped`; `in_call` también se consulta para evitar duplicados con el bot actual. |
| Plataforma | CHECKs de `source` deben admitir `Zoom`; los de `capture_mode`, `zoom_rtms`. No borrar valores de Meet/Teams existentes. |
| Horarios | `start_time`, `end_time`, `status_synced_at`: `timestamptz`. `end_time` puede omitirse al abrir una sesión; no puede imponer un `NOT NULL` sin default compatible. Las restricciones de duración/orden temporal deben admitir reuniones sin fin conocido. |
| Metadatos | `stage_info`: JSONB con objetos y claves nuevas, incluidas `rtmsSessionId`, `manualIntent`, `deletion` y datos de disponibilidad de medios. Revisar sus CHECKs y defaults. |
| Medios/errores | Campos URL y error deben aceptar referencias `r2:private/...` y códigos RTMS; no deben exigir exclusivamente `https://`. `duration_min` conserva minutos redondeados en INTEGER; `stage_info.recordingDurationSec` conserva la duración medida a precisión de milisegundos. Revisar límites de `varchar`. |
| Calendario | `calendar_event_id` puede recibir el sufijo `#rtms:` más UUID al conservar una sesión anterior. Revisar largo y unicidad; un índice global sobre `meeting_url` podría impedir reuniones recurrentes. |
| Informe | `reports.meeting_id`: índice único válido, no parcial ni diferible para `ON CONFLICT(meeting_id)`. `transcript` JSONB guarda un scalar string, compatible con los consumidores existentes; no se convierte en array. `read_score` INTEGER se redondea explícitamente; `scores` JSONB conserva las métricas completas. Revisar FKs, `report_version`, defaults y todos los CHECKs de reports. |
| Efectos existentes | Revisar triggers, índices únicos adicionales y RLS de las tres tablas. El SQL muestra definiciones de triggers, no sus cuerpos: inspeccionar cada función relevante antes de seguir. Verificar permisos del administrador y del `service_role`; no ampliarlos automáticamente. |

Los catálogos se limitan a estas tablas, roles y objetos Zoom. Si una sección llega a su `LIMIT`, ampliar esa consulta de metadatos antes de aprobar; no asumir que la lista quedó completa. No se necesita recorrer las filas de producción para verificar la presencia de los índices únicos válidos.

## Ensayo y aplicación

1. Tras revisar el preflight, ejecutar **todo** `20261029_zoom_rtms.install.sql` sin editarlo. El resultado esperado es `RTMS_POSTFLIGHT_OK`, seguido del rollback final. Los objetos nuevos no deben persistir; volver a ejecutar el preflight debe seguir pasando. Este ensayo puede tomar locks DDL breves; ante un timeout, no forzar el desbloqueo ni terminar sesiones de grabaciones.
2. Para instalar, usar el mismo archivo revisado y cambiar **sólo la última sentencia** de `rollback;` a `commit;`. Ejecutar el archivo entero en una única operación del editor. No seleccionar fragmentos ni ejecutar la migración original adicionalmente.
3. Ejecutar `20261029_zoom_rtms.verify.sql` en una operación nueva. Debe confirmar las 7 tablas con RLS y sin acceso de `anon`/`authenticated`, 17 funciones `SECURITY DEFINER` con `search_path=public` sólo para el servicio y las colas de borrado sin FKs que puedan cascadar. El `NOTIFY pgrst, 'reload schema'` del archivo de instalación se entrega únicamente si se confirma la transacción.
4. Conservar el resultado y el SHA revisado. Esta verificación de esquema no acredita OAuth, R2, entrega de medios ni una reunión real. Mantener RTMS desactivado hasta completar la configuración y su verificación correspondiente.

## Rollback y resultados ambiguos

- **Durante el ensayo:** el `ROLLBACK` final revierte toda la creación de tablas, índices, funciones y permisos. No hay un script de eliminación posterior.
- **Error antes del COMMIT:** la transacción queda abortada. Si la conexión del editor continúa abierta, ejecutar `ROLLBACK;` para cerrarla; no intentar continuar desde la sentencia fallida. Leer el error, corregir la incompatibilidad en un cambio separado y volver a ejecutar el archivo completo.
- **Timeout o desconexión con COMMIT posiblemente enviado:** no asumir éxito ni fracaso. Ejecutar la consulta de verificación de sólo lectura. Si hay objetos parciales o inesperados, detener la instalación y revisar; no reintentar sin comparar.
- **Después de un COMMIT confirmado:** un `ROLLBACK` nuevo no deshace una transacción anterior. Mantener desactivadas las entradas RTMS y conservar las tablas/colas. No usar `DROP ... CASCADE`, no borrar medios y no restablecer toda la base: podría perderse información existente. Si ya hubo capturas, conservar el procesamiento, las entregas pendientes y los recibos de borrado; cualquier corrección posterior requiere una migración revisada por separado.

PostgreSQL documenta la atomicidad y el alcance de `ROLLBACK` en [Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), y los límites de bloqueo/tiempo en [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html).

## Reproducir los archivos y pruebas locales

Desde `speaker-camera-hotfix`:

```powershell
node docs/sql/prepare-zoom-rtms.mjs
node --test tests/zoom-migration-preflight.test.js
```

El generador no utiliza red, credenciales ni conexiones SQL. Las pruebas usan PostgreSQL local en memoria mediante PGlite: ensayan el esquema base compatible, columnas faltantes, restricciones incompatibles, rollback después de DDL, instalación confirmada y bloqueo de reejecución. No reemplazan la comparación del esquema real de producción.

## Instalación verificada el 29 de octubre de 2026

Aplicada en `OctoMeet AI` (`xewahhatxhmfjlujitfa`, main Production) mediante el SQL Editor autenticado. El preflight pasó y el ensayo transaccional confirmó 7 tablas y 17 RPCs; después del rollback se verificó que quedaban cero objetos Zoom. Se instaló el mismo texto revisado con COMMIT final y una consulta independiente confirmó `RTMS_INSTALLATION_VERIFIED` a las **21:10:23.752543 UTC**, con 7 tablas privadas y 17 RPCs exclusivas del servicio.

SHA-256 LF de la migración aplicada: `4659c69642a7b20ca989011bd46782ad8f5f9ca7cf611960a1a53074ca0cadf2`. No se modificaron los tipos de las tablas base, no se ejecutaron RPCs de negocio ni se iniciaron grabaciones. Las entradas RTMS permanecieron desactivadas; OAuth, almacenamiento, servidor y prueba real requieren su propia validación.
