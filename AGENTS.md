# Guia para agentes IA

Este repositorio mezcla conocimiento empresarial, documentos internos, salidas automaticas y futuros proyectos de software. Antes de actuar, identifica siempre que tipo de material estas tocando.

## Prioridad de fuentes

1. `03_documentacion_curada/INDICE.md`: mapa actual de la documentacion empresarial.
2. `02_conocimiento/obsidian/00 Inicio.md`: sintesis navegable del funcionamiento de Pulycort.
3. `04_analisis_y_entregables/informes/`: informes ya elaborados.
4. `04_analisis_y_entregables/outputs/`: salidas brutas, transcripciones, capturas y logs.
5. `01_entrada/`: documentos recibidos sin procesar.

Si dos fuentes discrepan, conserva la discrepancia y anade una tarea o pregunta abierta en `00_gestion/TAREAS.md`.

## Reglas de trabajo

- No borrar fuentes originales ni versiones previas sin confirmacion explicita.
- Distinguir entre hecho documentado, inferencia y propuesta.
- Mantener los proyectos de software dentro de `05_proyectos/`, con README propio.
- No mezclar logs, audios, capturas o salidas brutas con documentacion curada.
- Cuando generes un informe, explica sus fuentes y dejalo en `04_analisis_y_entregables/informes/`.
- Cuando incorpores documentacion nueva, actualiza `03_documentacion_curada/INDICE.md` o crea una nota pendiente si falta revisar.

## Apps y proyectos de software

- Antes de crear o arrancar una app, revisar que puertos locales estan ocupados para no pisar servicios, prototipos o herramientas ya activos.
- Cada app debe documentar en su README el puerto local sugerido, comandos de arranque, dependencias y cualquier variable de entorno necesaria.
- Si una funcionalidad puede servir a varias apps, extraerla a un modulo, paquete o carpeta compartida dentro de `05_proyectos/` antes de duplicarla.
- Mantener separadas las apps, las librerias compartidas y las pruebas o prototipos temporales para que el repositorio pueda crecer sin mezclas dificiles de mantener.
- Al iniciar una app nueva, revisar si existen utilidades, conectores, modelos de datos, componentes UI o scripts reutilizables en otros proyectos del repositorio.
- Reestructurar `05_proyectos/` de forma incremental conforme crezca el numero de apps, priorizando nombres claros, README propios y limites explicitos entre proyectos.

## Levantar apps (rapido, desde cualquier PC)

No arranques los servidores a mano paso a paso (nada de abrir varias terminales,
`cd backend`, `npm install` "por si acaso", etc.). Cada app que se levanta a
menudo tiene un lanzador unico e idempotente. Usalo: es mas rapido y evita pisar
puertos o reinstalar sin necesidad.

### Fabric (backend NestJS :3000 + frontend Angular :4200)

Lanzador: `05_proyectos/fabric/fabric.ps1` (wrapper `fabric.cmd`). Autolocalizado
(funciona desde cualquier carpeta y cualquier PC), no relanza si ya corre,
instala dependencias solo si falta `node_modules` y deja los servidores en
segundo plano (logs en `05_proyectos/fabric/.logs/`).

```powershell
# desde la raiz del repo
powershell -NoProfile -ExecutionPolicy Bypass -File "05_proyectos\fabric\fabric.ps1" up
#   up            arranca backend + frontend (por defecto)
#   restart backend   reinicia solo el backend (lo mas pedido)
#   restart           reinicia todo;  stop / status / logs
#   backend | frontend   arranca solo uno
# objetivo en restart/stop/logs: all (def.) | backend(be) | frontend(fe)
```

Para humanos / cmd: `05_proyectos\fabric\fabric.cmd up`. (Tambien hay skill `/fabric`.)

El `status` final avisa si la BD real (el host de `DATABASE_URL` del `.env`) es
alcanzable. Si dice **NO alcanzable**, este PC no esta en la red de la fabrica: el
modo **Real** dara HTTP 500 y hay que usar el switch **Demo**. Eso NO es un bug
del backend; es red.

## Contexto de negocio

Pulycort trabaja piedra natural/marmol y necesita ordenar datos maestros, operaciones de produccion, trazabilidad de bloque-tabla-losa, acabados, tarifas, clientes/proveedores y su relacion con Odoo.

Una linea importante de trabajo sera conectar datos del software de maquinas de produccion con Odoo para saber que bloque, tabla o losa esta asociado a cada pedido, lote, operacion y estado.
