import { Material } from './models';

/**
 * Catálogo de materiales con su color representativo (círculo de material).
 * Tinta plana elegida a mano para parecerse a la piedra real sobre fondo
 * oscuro. Dureza 1 (blanda) a 5 (dura): condiciona la velocidad de descenso
 * en la SIMULACIÓN (demo). En modo real solo se usan el nombre y el color.
 */
export const MATERIALES: Material[] = [
  { id: 'pietra-grey', nombre: 'PIETRA GREY', color: '#5d6470', colorBorde: '#828a98', dureza: 4 },
  { id: 'marfil', nombre: 'MARFIL', color: '#e8dcc0', colorBorde: '#cdbf9d', dureza: 2 },
  { id: 'travertino', nombre: 'TRAVERTINO', color: '#cdb89a', colorBorde: '#b29a77', dureza: 1 },
  { id: 'negro-marquina', nombre: 'NEGRO MARQUINA', color: '#1c1e24', colorBorde: '#4d505a', dureza: 4 },
  { id: 'blanco-carrara', nombre: 'BLANCO CARRARA', color: '#e9ecef', colorBorde: '#c2c9d1', dureza: 3 },
  { id: 'rojo-alicante', nombre: 'ROJO ALICANTE', color: '#9e3b3b', colorBorde: '#bd5d5d', dureza: 3 },
  { id: 'crema', nombre: 'CREMA ZARCI', color: '#ddd0b4', colorBorde: '#bfb194', dureza: 2 },
  { id: 'emperador', nombre: 'EMPERADOR BUÑOL', color: '#6d4c35', colorBorde: '#8d6a50', dureza: 3 },
  { id: 'verde-india', nombre: 'VERDE INDIA', color: '#4c6b5c', colorBorde: '#6c8d7c', dureza: 4 }
];

const POR_ID = new Map(MATERIALES.map((material) => [material.id, material]));

/**
 * Familias de piedra → color/borde de diseño para el dot y una dureza
 * orientativa. Es SOLO presentación: en modo real ni el color ni la dureza
 * alimentan ningún cálculo (las cifras salen del backend). El único dato
 * real del catálogo es el NOMBRE.
 */
type Familia =
  | 'crema'
  | 'caliza'
  | 'azul'
  | 'amarillo'
  | 'gris'
  | 'rojo'
  | 'rosa'
  | 'travertino'
  | 'negro'
  | 'blanco'
  | 'verde'
  | 'marron'
  | 'oscuro';

const DISENO_FAMILIA: Record<Familia, { color: string; colorBorde: string; dureza: number }> = {
  crema: { color: '#e8dcc0', colorBorde: '#cdbf9d', dureza: 2 },
  caliza: { color: '#e9e4d4', colorBorde: '#c9c2ab', dureza: 2 },
  azul: { color: '#9aa6b8', colorBorde: '#b9c3d2', dureza: 2 },
  amarillo: { color: '#d8c48a', colorBorde: '#c2ac6e', dureza: 2 },
  gris: { color: '#9aa0ab', colorBorde: '#b8bdc7', dureza: 3 },
  rojo: { color: '#9e3b3b', colorBorde: '#bd5d5d', dureza: 3 },
  rosa: { color: '#c08a93', colorBorde: '#d3a6ad', dureza: 3 },
  travertino: { color: '#cdb89a', colorBorde: '#b29a77', dureza: 1 },
  negro: { color: '#1c1e24', colorBorde: '#4d505a', dureza: 4 },
  blanco: { color: '#e9ecef', colorBorde: '#c2c9d1', dureza: 3 },
  verde: { color: '#4c6b5c', colorBorde: '#6c8d7c', dureza: 4 },
  marron: { color: '#6d4c35', colorBorde: '#8d6a50', dureza: 3 },
  oscuro: { color: '#5d6470', colorBorde: '#828a98', dureza: 4 }
};

/**
 * Catálogo real de materiales de Odoo (`product_template`), volcado por
 * consulta directa a la BD PULYCORT el 2026-06-13 y contrastado contra los
 * 7 códigos que Ángel ya había validado (2026-06-12).
 *
 * La clave del Map es el `product_template.id` = el entero `material` que
 * mandan las tablas de máquina (`produccion_mapeada`, `parte_*_mapeada`). El
 * `default_code` de 3 dígitos (100–903) es el "código de material" interno
 * del catálogo, agrupado por familia (1xx cremas, 3xx calizas, 4xx
 * azules/amarillos, 5xx grises/rojos/rosas, 6xx travertinos, 7xx
 * negros/varios, 8xx blancos, 9xx granito/pizarra) — es el sistema "100-903"
 * que aparecía como duda en VERIFICACION.md. El NOMBRE es el real de Odoo;
 * el color/dureza salen de la familia (diseño). Un código que no esté aquí se
 * enseña como "Material {código}" sin inventar nombre.
 */
// [product_template.id, default_code, nombre real, familia (diseño)]
const CATALOGO_REAL: ReadonlyArray<readonly [number, string, string, Familia]> = [
  [71, '100', 'MARFIL', 'crema'],
  [95, '102', 'CREMA ZARCI', 'crema'],
  [97, '103', 'EMPERADOR BUÑOL', 'marron'],
  [104, '104', 'KOALA', 'gris'],
  [105, '105', 'LIGHT EMPERADOR', 'marron'],
  [125, '106', 'ROSA ZARCI', 'rosa'],
  [130, '107', 'ST CROIX', 'crema'],
  [77, '108', 'SUNNY', 'crema'],
  [108, '200', 'MARRON IMPERIAL', 'marron'],
  [73, '300', 'CALIZA', 'caliza'],
  [72, '301', 'CALIZA ALBA', 'caliza'],
  [88, '302', 'CALIZA LYMRA', 'caliza'],
  [89, '303', 'CAPRI MARINA', 'crema'],
  [90, '304', 'CREMA LORCA', 'crema'],
  [91, '305', 'CREMA MOKA', 'crema'],
  [93, '306', 'CREMA NOVA', 'crema'],
  [79, '400', 'AMARILLO FOSIL', 'amarillo'],
  [78, '401', 'AZUL BATEIG', 'azul'],
  [80, '402', 'BATEIG BEIG', 'crema'],
  [112, '403', 'NIWALA YELLOW', 'amarillo'],
  [140, '404', 'VINAIXA', 'crema'],
  [92, '500', 'CREMA NACAR', 'crema'],
  [99, '501', 'GRIS ARIVAL', 'gris'],
  [100, '502', 'GRIS BALEAR', 'gris'],
  [101, '503', 'GRIS CEHEGIN', 'gris'],
  [103, '504', 'GRIS PULPIS', 'gris'],
  [106, '505', 'LILAC', 'rosa'],
  [116, '506', 'RAIN FOREST BROWN', 'marron'],
  [117, '507', 'ROJO ALICANTE', 'rojo'],
  [118, '508', 'ROJO CORALITO', 'rojo'],
  [119, '509', 'ROJO KRISTEL', 'rojo'],
  [120, '510', 'ROJO PLUS', 'rojo'],
  [121, '511', 'ROJO QUIPAR', 'rojo'],
  [123, '512', 'ROSA PORTUGUES', 'rosa'],
  [124, '513', 'ROSA VALENCIA', 'rosa'],
  [129, '514', 'SINAI', 'crema'],
  [138, '515', 'TUNDRA GREY', 'gris'],
  [146, '516', 'GRIS ROCHELLE', 'gris'],
  [131, '600', 'TRAVERTINO', 'travertino'],
  [132, '601', 'TRAVERTINO ALBINO', 'travertino'],
  [133, '602', 'TRAVERTINO AMARILLO', 'travertino'],
  [134, '603', 'TRAVERTINO BIANCO', 'travertino'],
  [135, '604', 'TRAVERTINO MONCADA', 'travertino'],
  [136, '605', 'TRAVERTINO ROMANO', 'travertino'],
  [137, '606', 'TRAVERTINO SILVER', 'travertino'],
  [75, '607', 'TRAVERTINO TURCO', 'travertino'],
  [194, '609', 'TRAVERTINO TERUEL', 'travertino'],
  [102, '700', 'GRIS MARENGO', 'oscuro'],
  [94, '701', 'CREMA SAN VICENTE', 'crema'],
  [109, '702', 'MOON GREY', 'gris'],
  [110, '703', 'NEGRO CALATORAO', 'negro'],
  [76, '704', 'NEGRO MARQUINA', 'negro'],
  [113, '705', 'ONIX', 'amarillo'],
  [114, '706', 'PIETRA GREY', 'oscuro'],
  [126, '707', 'SAHARA NOIR', 'negro'],
  [128, '708', 'SIERRA ELVIRA', 'oscuro'],
  [139, '709', 'VERDE INDIA', 'verde'],
  [82, '800', 'BLANCO ARGOS / DOLOMITA', 'blanco'],
  [83, '801', 'BLANCO CARRARA', 'blanco'],
  [84, '802', 'BLANCO GIOIA', 'blanco'],
  [74, '803', 'BLANCO IBIZA', 'blanco'],
  [85, '804', 'BLANCO MACAEL', 'blanco'],
  [86, '805', 'BLANCO THASSOS', 'blanco'],
  [87, '806', 'BLANCO VOLAKAS', 'blanco'],
  [96, '807', 'DAINO REALE', 'crema'],
  [107, '808', 'MARMARA', 'blanco'],
  [127, '809', 'SERPEGIANTE', 'marron'],
  [147, '810', 'CALACATTA', 'blanco'],
  [98, '900', 'GRANITO', 'oscuro'],
  [111, '901', 'NEGRO SUDAFRICA', 'negro'],
  [115, '902', 'PIZARRA VERDE', 'verde'],
  [122, '903', 'ROSA PORRIÑO', 'rosa']
];

const POR_CODIGO_REAL = new Map<string, Material>(
  CATALOGO_REAL.map(([id, , nombre, familia]) => [
    String(id),
    { id: String(id), nombre, ...DISENO_FAMILIA[familia] }
  ])
);

const DESCONOCIDO: Material = {
  id: 'desconocido',
  nombre: 'Material desconocido',
  color: '#3a4253',
  colorBorde: '#5a647a',
  dureza: 3
};

export function materialPorId(id: string | null | undefined): Material {
  if (!id || id === 'desconocido') {
    return DESCONOCIDO;
  }
  const conocido = POR_ID.get(id) ?? POR_CODIGO_REAL.get(id);
  if (conocido) {
    return conocido;
  }
  // Código real sin entrada en el catálogo: se enseña el código tal cual,
  // sin inventar nombre.
  return { ...DESCONOCIDO, id, nombre: `Material ${id}` };
}
