# Control compresor

## Descripcion

Proyecto para crear una app sencilla que permita consultar el estado del compresor de aire y cambiarlo de forma remota.

## Objetivos

- Ver si el compresor esta encendido o apagado.
- Permitir cambiar el estado desde una interfaz remota.
- Preparar una app usable desde movil u otro dispositivo autorizado.
- Mantener trazabilidad basica de la informacion recibida y de las decisiones tecnicas.

## Alcance inicial

Hecho documentado:

- La peticion recibida es: "Compresor: Una aplicacion para poder saber el estado encendido o apagado y poder cambiarlo."
- Se han recibido 4 fotos del compresor.

Pendiente de validar:

- Tipo de cuadro o dispositivo que permite leer/cambiar el estado.
- Si existe PLC, rele, variador, modulo IP, API, Modbus, entrada/salida digital u otro sistema de control.
- Red disponible, IPs, credenciales, restricciones de seguridad y ubicacion fisica.
- Si el cambio remoto debe requerir confirmacion adicional o permiso por usuario.

## Estructura

- `00_contexto/`: informacion de negocio y tecnica pendiente de ordenar.
- `01_requisitos/`: requisitos funcionales y dudas abiertas.
- `02_arquitectura/`: decisiones tecnicas cuando se defina la solucion.
- `03_entrada_recibida/fotos/`: fotos originales recibidas para este proyecto.
- `04_app/`: futura aplicacion.
- `90_referencias/`: manuales, fichas tecnicas o enlaces cuando existan.

## App

Estado: sin codigo todavia.

Puerto local sugerido: `8010`.

Comandos de arranque: pendiente.

Dependencias: pendiente.

Variables de entorno: pendiente.

## Fuentes recibidas

Origen original:

- `01_entrada/Compresor/`

Ubicacion actual:

- `05_proyectos/control_compresor/03_entrada_recibida/fotos/`

