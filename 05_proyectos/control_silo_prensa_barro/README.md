# Control silo prensa barro

## Descripcion

Proyecto para crear una solucion de control remoto del cuadro/pantalla del silo y la prensa de barro desde movil u otro dispositivo.

## Objetivos

- Permitir ver y controlar la pantalla del cuadro de forma remota.
- Dar acceso desde movil u otro dispositivo autorizado.
- Aprovechar la instalacion existente sin modificarla hasta entender su tecnologia y riesgos.
- Documentar fuentes recibidas, requisitos y decisiones tecnicas antes de crear la app.

## Alcance inicial

Hecho documentado:

- La peticion recibida es: "Silo prensa barro: En este caso si que tenemos la instalacion hecha pero no tenemos ni app ni aplicacion para poder gestionarlo via remoto. Objetivo controlar la pantalla del cuadro desde el movil u otro dispositivo."
- Se han recibido 7 fotos del silo/prensa de barro.

Pendiente de validar:

- Tipo de pantalla/cuadro existente y si permite acceso remoto nativo.
- Sistema operativo o HMI usado por la pantalla.
- Si la solucion debe ser VNC, noVNC, VPN, escritorio remoto, web embebida o una app propia como pasarela.
- Red disponible, IPs, credenciales, puertos, permisos y medidas de seguridad.
- Acciones criticas que no deberian poder ejecutarse sin confirmacion.

## Estructura

- `00_contexto/`: informacion de negocio y tecnica pendiente de ordenar.
- `01_requisitos/`: requisitos funcionales y dudas abiertas.
- `02_arquitectura/`: decisiones tecnicas cuando se defina la solucion.
- `03_entrada_recibida/fotos/`: fotos originales recibidas para este proyecto.
- `04_app/`: futura aplicacion.
- `90_referencias/`: manuales, fichas tecnicas o enlaces cuando existan.

## App

Estado: sin codigo todavia.

Puerto local sugerido: `8011`.

Comandos de arranque: pendiente.

Dependencias: pendiente.

Variables de entorno: pendiente.

## Fuentes recibidas

Origen original:

- `01_entrada/Silo y Prensa Barro/`

Ubicacion actual:

- `05_proyectos/control_silo_prensa_barro/03_entrada_recibida/fotos/`

