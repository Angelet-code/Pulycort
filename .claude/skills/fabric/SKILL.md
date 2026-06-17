---
name: fabric
description: Levantar, parar, reiniciar o ver el estado de Fabric (backend NestJS :3000 + frontend Angular :4200) de forma rápida. Úsala cuando el usuario pida arrancar/levantar Fabric, reiniciar el backend o el frontend de Fabric, pararlo, o saber qué está corriendo. No reinstala ni reconstruye salvo que falte node_modules.
---

# Fabric — arranque rápido

Fabric se levanta con UN solo script, `05_proyectos/fabric/fabric.ps1` (wrapper
`fabric.cmd`). NO arranques los servidores a mano (nada de `cd backend; npm run
start:dev` por separado, ni `npm install` "por si acaso"): el script ya es
idempotente, instala dependencias solo si faltan, no reconstruye y deja los
servidores en segundo plano.

## Cómo ejecutarlo

Desde la raíz del repo, con la herramienta de PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "05_proyectos\fabric\fabric.ps1" <comando> [objetivo]
```

(equivalente para humanos / cmd: `05_proyectos\fabric\fabric.cmd <comando> [objetivo]`)

## Comandos (mapea la intención del usuario)

| El usuario pide…                         | Comando                          |
|------------------------------------------|----------------------------------|
| "levanta / arranca Fabric"               | `up`                             |
| "reinicia el backend"                    | `restart backend`                |
| "reinicia el frontend"                   | `restart frontend`               |
| "reinicia Fabric" (todo)                 | `restart`                        |
| "para / apaga Fabric"                    | `stop`  (o `stop backend`)       |
| "¿qué está corriendo? / estado"          | `status`                         |
| "enséñame los logs / por qué falla"      | `logs`  (o `logs backend`)       |
| "arranca solo el backend / frontend"     | `backend` / `frontend`           |

Objetivo (2º argumento, solo en restart/stop/logs): `all` (def.) · `backend`/`be` · `frontend`/`fe`.

## Qué reporta y qué NO es un bug

El script termina con un `status` que incluye la **alcanzabilidad de la BD real**
(el host de `DATABASE_URL`, que el script lee del `.env`). Si dice **"NO
alcanzable"**, este PC no está en la red de la fábrica: el modo **Real** dará HTTP
500 y hay que usar el switch **Demo** de la barra superior. **Eso NO es un fallo
del código** — no te pongas a depurar el backend por esos 500; es red. El modo
Demo funciona en cualquier PC sin backend.

Puertos: backend **3000**, frontend **4200**. URLs: http://127.0.0.1:3000 y
http://127.0.0.1:4200. Logs en `05_proyectos/fabric/.logs/`.
