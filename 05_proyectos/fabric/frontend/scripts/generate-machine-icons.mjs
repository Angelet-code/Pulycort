import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const outputDir = join(projectRoot, 'public', 'machine-icons');

const machines = [
  [1, '01-reforzadora-de-bloques', 'Reforzadora de bloques', 'reforzadora', 'm3', 'bloque', '#d8c8a8'],
  [2, '02-monohilo', 'Monohilo', 'monohilo', 'm3', 'bloque', '#ff5f7d'],
  [3, '03-telar-1', 'Telar 1', 'telar', 'm3', 'bloque', '#4b9fff'],
  [4, '04-telar-2', 'Telar 2', 'telar', 'm3', 'bloque', '#35d99d'],
  [5, '05-telar-3', 'Telar 3', 'telar', 'm3', 'bloque', '#98a8ff'],
  [6, '06-telar-4', 'Telar 4', 'telar', 'm3', 'bloque', '#4fc9de'],
  [7, '07-telar-externo', 'Telar externo', 'telar', 'm3', 'bloque', '#f3c86a'],
  [8, '08-cortabloques', 'Cortabloques', 'cortabloques', 'm2', 'bloque', '#a3e635'],
  [9, '09-reforzadora-1', 'Reforzadora 1', 'reforzadora', 'm2', 'tabla', '#c797ff'],
  [10, '10-reforzadora-2-sei', 'Reforzadora 2 SEI', 'reforzadora', 'm2', 'tabla', '#7bd4a4'],
  [11, '11-pulidora-de-tabla-simec', 'Pulidora de tabla SIMEC', 'pulidora', 'm2', 'tabla', '#63d2ff'],
  [12, '12-disco-puente-1-terzago', 'Disco puente 1 Terzago', 'disco-puente', 'm2', 'losa', '#ff7a5c'],
  [13, '13-disco-puente-2-gomez', 'Disco puente 2 Gomez', 'disco-puente', 'm2', 'losa', '#f3c86a'],
  [14, '14-disco-puente-3-canigo', 'Disco puente 3 Canigo', 'disco-puente', 'm2', 'losa', '#4fc9de'],
  [15, '15-control-numerico-donatoni', 'Control numerico Donatoni', 'control-numerico', 'm2', 'losa', '#73a7ff'],
  [16, '16-pulidora-de-losa', 'Pulidora de losa', 'pulidora', 'm2', 'losa', '#ff8fc1'],
  [17, '17-biseladora', 'Biseladora', 'biseladora', 'm2', 'losa', '#f59e0b'],
  [18, '18-recuperadora', 'Recuperadora', 'recuperadora', 'm2', 'losa', '#38bdf8'],
  [19, '19-taller', 'Taller', 'taller', 'm2', 'losa', '#c4b5fd']
].map(([code, slug, name, family, unit, phase, color]) => ({
  code,
  slug,
  name,
  family,
  unit,
  phase,
  color
}));

const familyLabels = {
  'biseladora': 'biseladora',
  'control-numerico': 'control numerico',
  'cortabloques': 'cortabloques',
  'disco-puente': 'disco puente',
  'monohilo': 'monohilo',
  'pulidora': 'pulidora',
  'recuperadora': 'recuperadora',
  'reforzadora': 'reforzadora',
  'taller': 'taller',
  'telar': 'telar'
};

const templates = {
  'biseladora': biseladoraTemplate,
  'control-numerico': controlNumericoTemplate,
  'cortabloques': cortabloquesTemplate,
  'disco-puente': discoPuenteTemplate,
  'monohilo': monohiloTemplate,
  'pulidora': pulidoraTemplate,
  'recuperadora': recuperadoraTemplate,
  'reforzadora': reforzadoraTemplate,
  'taller': tallerTemplate,
  'telar': telarTemplate
};

mkdirSync(outputDir, { recursive: true });

for (const machine of machines) {
  writeFileSync(join(outputDir, `${machine.slug}.svg`), makeSvg(machine));
}

const manifest = {
  generatedFrom: '05_proyectos/fabric/frontend/scripts/generate-machine-icons.mjs',
  sourceCatalog: '05_proyectos/fabric/frontend/src/app/core/catalogo-maquinas.ts',
  rules: [
    'One SVG per official machine code.',
    'Machines in the same family share the same simplified drawing template.',
    'Icons do not show numeric badges; machine identity is carried by filename and manifest.',
    'Machine variants differ by accent color and metadata.'
  ],
  machines: machines.map((machine) => ({
    code: machine.code,
    name: machine.name,
    family: machine.family,
    unit: machine.unit,
    phase: machine.phase,
    color: machine.color,
    file: `${machine.slug}.svg`,
    publicPath: `/machine-icons/${machine.slug}.svg`
  }))
};

writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

writeFileSync(
  join(outputDir, 'README.md'),
  [
    '# Machine icons',
    '',
    'Simplified SVG icon pack for the 19-machine Fabric catalog.',
    '',
    '- Official source: `src/app/core/catalogo-maquinas.ts`.',
    '- Output path served by Angular: `/machine-icons/<file>.svg`.',
    '- The SVGs show only the machine drawing: no visible numeric badge or text.',
    '- Same machine families share the same template; each machine has its own accent color.',
    '- Regenerate from `05_proyectos/fabric/frontend` with `node scripts/generate-machine-icons.mjs`.',
    '',
    'Families sharing a shape:',
    '',
    '- `telar`: codes 3, 4, 5, 6, 7.',
    '- `disco-puente`: codes 12, 13, 14.',
    '- `reforzadora`: codes 1, 9, 10.',
    '- `pulidora`: codes 11, 16.',
    ''
  ].join('\n')
);

console.log(`Generated ${machines.length} simplified SVG machine icons in ${outputDir}`);

function makeSvg(machine) {
  const ids = {
    accent: `accent-${machine.slug}`,
    shadow: `shadow-${machine.slug}`
  };
  const template = templates[machine.family];
  if (!template) {
    throw new Error(`Missing SVG template for ${machine.family}`);
  }

  const familyLabel = familyLabels[machine.family];
  const accentLight = mix(machine.color, '#ffffff', 0.22);
  const accentDark = mix(machine.color, '#020617', 0.24);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-labelledby="title-${machine.slug} desc-${machine.slug}">
  <title id="title-${machine.slug}">${escapeXml(machine.name)}</title>
  <desc id="desc-${machine.slug}">Icono SVG simple de ${escapeXml(machine.name)}. Familia ${escapeXml(familyLabel)} con silueta comun y color propio.</desc>
  <defs>
    <linearGradient id="${ids.accent}" x1="48" y1="44" x2="208" y2="212" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${accentLight}"/>
      <stop offset="0.62" stop-color="${machine.color}"/>
      <stop offset="1" stop-color="${accentDark}"/>
    </linearGradient>
    <filter id="${ids.shadow}" x="-22%" y="-22%" width="144%" height="144%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#020617" flood-opacity="0.26"/>
    </filter>
    <style>
      .base{fill:#182235}
      .frame{fill:#26344f}
      .dark{fill:#0f172a}
      .stone{fill:#b9aa86}
      .stone-top{fill:#d1c39e}
      .line{stroke:#e7f0ff;stroke-opacity:.24;stroke-linecap:round;stroke-linejoin:round}
      .accent-stroke{stroke:url(#${ids.accent});stroke-linecap:round;stroke-linejoin:round}
    </style>
  </defs>
  <g filter="url(#${ids.shadow})">
    ${template(ids)}
  </g>
</svg>
`;
}

function telarTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="86" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="44" y="195" width="168" height="14" rx="7"/>
    <rect class="frame" x="50" y="66" width="25" height="132" rx="9"/>
    <rect class="frame" x="181" y="66" width="25" height="132" rx="9"/>
    <rect class="base" x="44" y="54" width="168" height="24" rx="10"/>
    <rect class="dark" x="64" y="91" width="128" height="64" rx="12" stroke="url(#${ids.accent})" stroke-width="7"/>
    <path class="line" d="M92 95v56M128 95v56M164 95v56" stroke-width="4"/>
    <rect class="stone" x="73" y="157" width="110" height="38" rx="7"/>
    <path class="stone-top" d="M82 148h92l9 9H73z"/>
  `;
}

function discoPuenteTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="88" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="40" y="190" width="176" height="17" rx="8.5"/>
    <rect class="frame" x="52" y="84" width="22" height="108" rx="9"/>
    <rect class="frame" x="182" y="84" width="22" height="108" rx="9"/>
    <rect class="base" x="46" y="72" width="164" height="22" rx="10"/>
    <rect x="104" y="92" width="48" height="28" rx="9" fill="url(#${ids.accent})"/>
    <path class="line" d="M128 120v24" stroke-width="8"/>
    <circle cx="128" cy="148" r="28" fill="#e7f0ff"/>
    <circle cx="128" cy="148" r="18" fill="url(#${ids.accent})"/>
    <circle cx="128" cy="148" r="6" class="dark"/>
    <rect class="stone" x="58" y="166" width="140" height="24" rx="7"/>
    <path class="stone-top" d="M67 156h122l9 10H58z"/>
  `;
}

function reforzadoraTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="86" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="39" y="188" width="178" height="17" rx="8.5"/>
    <rect class="frame" x="51" y="84" width="22" height="96" rx="9"/>
    <rect class="frame" x="183" y="84" width="22" height="96" rx="9"/>
    <rect class="base" x="48" y="74" width="160" height="22" rx="10"/>
    <rect x="88" y="101" width="80" height="14" rx="7" fill="url(#${ids.accent})"/>
    <path class="accent-stroke" d="M103 115v18M128 115v18M153 115v18" stroke-width="4"/>
    <path class="stone" d="M65 148h126l13 31H52z"/>
    <path class="stone-top" d="M78 137h100l13 11H65z"/>
    <path class="line" d="M70 193h116" stroke-width="9"/>
  `;
}

function pulidoraTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="88" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="38" y="188" width="180" height="18" rx="9"/>
    <rect class="frame" x="51" y="85" width="21" height="101" rx="9"/>
    <rect class="frame" x="184" y="85" width="21" height="101" rx="9"/>
    <rect class="base" x="48" y="73" width="160" height="22" rx="10"/>
    <path class="line" d="M84 95v43M128 95v43M172 95v43" stroke-width="7"/>
    <circle cx="84" cy="144" r="17" fill="url(#${ids.accent})"/>
    <circle cx="128" cy="144" r="17" fill="url(#${ids.accent})"/>
    <circle cx="172" cy="144" r="17" fill="url(#${ids.accent})"/>
    <rect class="stone" x="58" y="164" width="140" height="24" rx="7"/>
    <path class="stone-top" d="M66 154h124l8 10H58z"/>
  `;
}

function monohiloTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="84" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="42" y="197" width="172" height="13" rx="6.5"/>
    <rect class="frame" x="47" y="60" width="23" height="140" rx="9"/>
    <rect class="frame" x="186" y="60" width="23" height="140" rx="9"/>
    <rect class="base" x="47" y="53" width="162" height="20" rx="9"/>
    <circle cx="67" cy="89" r="23" class="dark" stroke="url(#${ids.accent})" stroke-width="8"/>
    <circle cx="189" cy="162" r="23" class="dark" stroke="url(#${ids.accent})" stroke-width="8"/>
    <path class="accent-stroke" d="M82 104 174 147" stroke-width="4"/>
    <rect class="stone" x="76" y="155" width="86" height="40" rx="8"/>
    <path class="stone-top" d="M84 145h70l8 10H76z"/>
  `;
}

function cortabloquesTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="86" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="39" y="194" width="178" height="15" rx="7.5"/>
    <rect class="frame" x="54" y="75" width="28" height="121" rx="10"/>
    <rect class="base" x="54" y="62" width="116" height="22" rx="10"/>
    <rect x="131" y="78" width="31" height="80" rx="10" fill="url(#${ids.accent})"/>
    <path d="M147 92v92" stroke="#e7f0ff" stroke-opacity=".82" stroke-width="5" stroke-linecap="round"/>
    <rect class="stone" x="75" y="153" width="108" height="40" rx="7"/>
    <path class="stone-top" d="M84 143h90l9 10H75z"/>
    <path class="accent-stroke" d="M148 130l27 58" stroke-width="4"/>
  `;
}

function controlNumericoTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="88" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="39" y="189" width="178" height="17" rx="8.5"/>
    <rect class="frame" x="51" y="84" width="22" height="107" rx="9"/>
    <rect class="frame" x="183" y="84" width="22" height="107" rx="9"/>
    <rect class="base" x="46" y="72" width="164" height="22" rx="10"/>
    <rect x="106" y="91" width="44" height="34" rx="10" fill="url(#${ids.accent})"/>
    <path class="accent-stroke" d="M128 125v35" stroke-width="7"/>
    <circle cx="128" cy="163" r="8" fill="#e7f0ff"/>
    <rect class="stone" x="59" y="154" width="138" height="34" rx="8"/>
    <path class="stone-top" d="M67 143h121l9 11H59z"/>
    <path class="accent-stroke" d="M86 171c23-25 58-25 84 0" fill="none" stroke-width="4"/>
  `;
}

function biseladoraTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="86" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="40" y="190" width="176" height="17" rx="8.5"/>
    <path class="stone" d="M60 164h123l20 26H43z"/>
    <path class="stone-top" d="M73 151h101l9 13H60z"/>
    <rect class="frame" x="56" y="86" width="22" height="82" rx="9"/>
    <rect class="base" x="56" y="74" width="124" height="20" rx="9"/>
    <g transform="rotate(-24 160 135)">
      <rect x="127" y="105" width="64" height="22" rx="10" fill="url(#${ids.accent})"/>
      <path class="line" d="M159 127v24" stroke-width="7"/>
      <circle cx="159" cy="154" r="23" fill="#e7f0ff"/>
      <circle cx="159" cy="154" r="14" fill="url(#${ids.accent})"/>
    </g>
  `;
}

function recuperadoraTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="86" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="39" y="191" width="178" height="16" rx="8"/>
    <path class="stone" d="M64 151l40 5 10 34H53z"/>
    <path class="stone" d="M129 147h60l13 43h-84z"/>
    <path class="stone-top" d="M70 140l32 4 2 12-40-5z"/>
    <path class="stone-top" d="M138 136h44l7 11h-60z"/>
    <path class="accent-stroke" d="M78 115c18-31 66-35 91-9" fill="none" stroke-width="9"/>
    <path d="M161 90l20 19-27 8z" fill="url(#${ids.accent})"/>
    <path class="accent-stroke" d="M177 143c-13 31-58 42-88 19" fill="none" stroke-width="9"/>
    <path d="M99 179l-25-16 25-13z" fill="url(#${ids.accent})"/>
  `;
}

function tallerTemplate(ids) {
  return `
    <ellipse cx="128" cy="219" rx="86" ry="11" fill="#020617" opacity=".2"/>
    <rect class="base" x="44" y="174" width="168" height="23" rx="10"/>
    <rect class="frame" x="59" y="196" width="17" height="23" rx="6"/>
    <rect class="frame" x="180" y="196" width="17" height="23" rx="6"/>
    <rect class="stone" x="62" y="149" width="132" height="25" rx="7"/>
    <path class="stone-top" d="M70 139h116l8 10H62z"/>
    <path d="M84 104h36l11 16-14 17H79l-11-17z" fill="url(#${ids.accent})"/>
    <path class="line" d="M128 73v42M113 73h30" stroke-width="8"/>
    <circle cx="153" cy="115" r="17" class="dark" stroke="url(#${ids.accent})" stroke-width="7"/>
    <path class="accent-stroke" d="M165 127l29 29" stroke-width="9"/>
  `;
}

function mix(hex, targetHex, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  return rgbToHex({
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount)
  });
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value) {
  return value.toString(16).padStart(2, '0');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
