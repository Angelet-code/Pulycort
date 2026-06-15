# Machine icons

Simplified SVG icon pack for the 19-machine Fabric catalog.

- Official source: `src/app/core/catalogo-maquinas.ts`.
- Output path served by Angular: `/machine-icons/<file>.svg`.
- The SVGs show only the machine drawing: no visible numeric badge or text.
- Same machine families share the same template; each machine has its own accent color.
- Regenerate from `05_proyectos/fabric/frontend` with `node scripts/generate-machine-icons.mjs`.

Families sharing a shape:

- `telar`: codes 3, 4, 5, 6, 7.
- `disco-puente`: codes 12, 13, 14.
- `reforzadora`: codes 1, 9, 10.
- `pulidora`: codes 11, 16.
