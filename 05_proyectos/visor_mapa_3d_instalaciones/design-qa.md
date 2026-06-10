# Design QA

final result: passed

## Reference

- Source image: `01_entrada/Captura de pantalla 2026-06-10 093825.png`
- Product brief: MVP editable for Pulycort facility map, machinery and personnel.
- Business source: `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`

## Checks

- Desktop viewport: 1440 x 920.
- Mobile viewport: 390 x 860.
- Canvas present and sized correctly.
- WebGL pixel check: 5 non-blank samples, 5 unique samples.
- Initial dataset present: 9 zones, 19 machines, 3 people.
- Editable person flow passed: add person, edit name, edit role, list updates.
- Label clutter reduced: area labels plus selected machine/person label.
- Browser console: no errors reported during QA.
- Map calibration added after field feedback: satellite layer now has editable x/z, width/depth, rotation and opacity.
- Camera fog removed.
- Camera rotation changed to middle mouse drag or Ctrl+click drag; normal click remains for selecting and dragging map elements.
- `Alinear base` exposed in the top toolbar and in the calibration panel.
- Default satellite calibration now uses rotation `-17` to correct the angular mismatch reported in the field view.

## Notes

- Building positions are approximations from the Google Maps capture and must be validated during the plant visit.
- Vite reports a large bundle warning because Three.js is included in the MVP bundle. This is acceptable for the local MVP; code splitting can be added later.
- `npm audit` reports moderate Vite advisories. Keep this local until dependencies are updated before any public deployment.
