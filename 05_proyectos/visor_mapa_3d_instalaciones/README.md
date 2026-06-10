# Visor mapa 3D de instalaciones

## Objetivo

MVP editable para trabajar sobre un mapa 3D de las instalaciones de Pulycort: zonas, maquinaria, personal, roles, estado y notas de campo.

## Alcance actual

- Escena 3D basada en la captura de Google Maps recibida en `01_entrada/`.
- Zonas iniciales aproximadas: naves, patios de bloques/tablas, entrada, carga y carretera.
- Catalogo inicial de maquinaria desde `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`.
- Alta y edicion de maquinaria, personal y zonas.
- Movimiento de elementos sobre el plano mediante arrastre o campos numericos.
- Calibracion editable del plano satelite: posicion, escala, rotacion y opacidad.
- Boton visible `Alinear base` para recalibrar plano, naves y contenidos asignados.
- La calibracion base rota el plano satelite -17 grados para corregir el desfase angular con los cubos 3D.
- Navegacion 3D ajustada para trabajo de campo: click normal selecciona/arrastra; rueda del raton pulsada o Ctrl+click rota camara.
- Guardado local en navegador, importacion y exportacion JSON.

## Fuentes

- Captura: `01_entrada/Captura de pantalla 2026-06-10 093825.png`.
- Sintesis de maquinaria y produccion: `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`.
- Indice documental: `03_documentacion_curada/INDICE.md`.

## Uso

```bash
npm install
npm run dev
```

Despues abre la URL local que indique Vite.

Para una visita o una demo sin watcher:

```bash
npm run build
npm run serve
```

## Estado

MVP de campo. Las coordenadas y ubicaciones son aproximaciones de trabajo, pendientes de validar durante visita a planta.

El boton `Alinear base` restaura la calibracion satelite y recoloca las zonas base, moviendo con ellas maquinaria y personal asignados. No borra elementos nuevos.
