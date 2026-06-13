type MaterialCatalogRecord = {
  code: string;
  name: string;
  family: string;
};

type MaterialVisualInput = {
  code?: string | null;
  name?: string | null;
  family?: string | null;
  fallbackText?: string | null;
};

type MaterialVisual = {
  label: string;
  textureUrl: string;
};

const TEXTURE_BASE = "/material-textures/";

export const MATERIAL_CATALOG: MaterialCatalogRecord[] = [
  { code: "100", name: "MARFIL", family: "1" },
  { code: "101", name: "BEIG SERPIENTE", family: "1" },
  { code: "102", name: "CREMA ZARCI", family: "1" },
  { code: "103", name: "EMPERADOR BUÑOL", family: "1" },
  { code: "104", name: "KOALA", family: "1" },
  { code: "105", name: "LIGHT EMPERADOR", family: "1" },
  { code: "106", name: "ROSA ZARCI", family: "1" },
  { code: "107", name: "ST CROIX", family: "1" },
  { code: "108", name: "SUNNY", family: "1" },
  { code: "200", name: "MARRON IMPERIAL", family: "2" },
  { code: "300", name: "CALIZA", family: "3" },
  { code: "301", name: "CALIZA ALBA", family: "3" },
  { code: "302", name: "CALIZA LYMRA", family: "3" },
  { code: "303", name: "CAPRI MARINA", family: "3" },
  { code: "304", name: "CREMA LORCA", family: "3" },
  { code: "305", name: "CREMA MOKA", family: "3" },
  { code: "400", name: "AMARILLO FOSIL", family: "4" },
  { code: "401", name: "AZUL BATEIG", family: "4" },
  { code: "402", name: "BATEIG BEIG", family: "4" },
  { code: "403", name: "NIWALA YELLOW", family: "4" },
  { code: "404", name: "VINAIXA", family: "4" },
  { code: "500", name: "CREMA NACAR", family: "5" },
  { code: "501", name: "GRIS ARIVAL", family: "5" },
  { code: "502", name: "GRIS BALEAR", family: "5" },
  { code: "503", name: "GRIS CEHEGIN", family: "5" },
  { code: "504", name: "GRIS PULPIS", family: "5" },
  { code: "505", name: "LILAC", family: "5" },
  { code: "506", name: "RAIN FOREST BROWN", family: "5" },
  { code: "507", name: "ROJO ALICANTE", family: "5" },
  { code: "508", name: "ROJO CORALITO", family: "5" },
  { code: "509", name: "ROJO KRISTEL", family: "5" },
  { code: "510", name: "ROJO PLUS", family: "5" },
  { code: "511", name: "ROJO QUIPAR", family: "5" },
  { code: "512", name: "ROSA PORTUGUES", family: "5" },
  { code: "513", name: "ROSA VALENCIA", family: "5" },
  { code: "514", name: "SINAI", family: "5" },
  { code: "515", name: "TUNDRA GREY", family: "5" },
  { code: "516", name: "GRIS ROCHELLE", family: "5" },
  { code: "600", name: "TRAVERTINO", family: "6" },
  { code: "601", name: "TRAVERTINO ALBINO", family: "6" },
  { code: "602", name: "TRAVERTINO AMARILLO", family: "6" },
  { code: "603", name: "TRAVERTINO BIANCO", family: "6" },
  { code: "604", name: "TRAVERTINO MONCADA", family: "6" },
  { code: "605", name: "TRAVERTINO ROMANO", family: "6" },
  { code: "606", name: "TRAVERTINO SILVER", family: "6" },
  { code: "607", name: "TRAVERTINO TURCO", family: "6" },
  { code: "608", name: "TRAVERTINO TITANIUM", family: "6" },
  { code: "609", name: "TRAVERTINO TERUEL", family: "6" },
  { code: "700", name: "GRIS MARENGO", family: "7" },
  { code: "701", name: "GRIS SAN VICENTE", family: "7" },
  { code: "702", name: "MOON GREY", family: "7" },
  { code: "703", name: "NEGRO CALATORAO", family: "7" },
  { code: "704", name: "NEGRO MARQUINA", family: "7" },
  { code: "705", name: "ONIX", family: "7" },
  { code: "706", name: "PIETRA GREY", family: "7" },
  { code: "707", name: "SAHARA NOIR", family: "7" },
  { code: "708", name: "SIERRA ELVIRA", family: "7" },
  { code: "709", name: "VERDE INDIA", family: "7" },
  { code: "800", name: "BLANCO ARGOS / DOLOMITA", family: "8" },
  { code: "801", name: "BLANCO CARRARA", family: "8" },
  { code: "802", name: "BLANCO GIOIA", family: "8" },
  { code: "803", name: "BLANCO IBIZA", family: "8" },
  { code: "804", name: "BLANCO MACAEL", family: "8" },
  { code: "805", name: "BLANCO THASSOS", family: "8" },
  { code: "806", name: "BLANCO VOLAKAS", family: "8" },
  { code: "807", name: "DAINO REALE", family: "8" },
  { code: "808", name: "MARMARA", family: "8" },
  { code: "809", name: "SERPEGIANTE", family: "8" },
  { code: "810", name: "CALACATTA", family: "8" },
  { code: "900", name: "GRANITO", family: "9" },
  { code: "901", name: "NEGRO SUDAFRICA", family: "9" },
  { code: "902", name: "PIZARRA VERDE", family: "9" },
  { code: "903", name: "ROSA PORRIÑO", family: "9" }
];

const TEXTURE_BY_CODE: Record<string, string> = {
  "100": "crema-marfil.jpg",
  "605": "travertino-romano.jpg",
  "701": "gris-san-vicente.jpg",
  "704": "negro-marquina.jpg"
};

const TEXTURE_BY_FAMILY: Record<string, string> = {
  "1": "crema-marfil.jpg",
  "2": "marron.jpg",
  "3": "caliza.jpg",
  "4": "amarillo.jpg",
  "5": "crema-marfil.jpg",
  "6": "travertino-romano.jpg",
  "7": "gris-san-vicente.jpg",
  "8": "blanco.jpg",
  "9": "granito.jpg"
};

const TEXTURE_BY_KEYWORD: Array<[string, string]> = [
  ["NEGRO MARQUINA", "negro-marquina.jpg"],
  ["CREMA MARFIL", "crema-marfil.jpg"],
  ["TRAVERTINO ROMANO", "travertino-romano.jpg"],
  ["GRIS SAN VICENTE", "gris-san-vicente.jpg"],
  ["TRAVERTINO", "travertino-romano.jpg"],
  ["NEGRO", "negro-marquina.jpg"],
  ["GRIS", "gris-san-vicente.jpg"],
  ["GREY", "gris-san-vicente.jpg"],
  ["BLANCO", "blanco.jpg"],
  ["CALACATTA", "blanco.jpg"],
  ["ROJO", "rojo.jpg"],
  ["ROSA", "rojo.jpg"],
  ["VERDE", "verde.jpg"],
  ["AMARILLO", "amarillo.jpg"],
  ["YELLOW", "amarillo.jpg"],
  ["CALIZA", "caliza.jpg"],
  ["CREMA", "crema-marfil.jpg"],
  ["MARFIL", "crema-marfil.jpg"],
  ["BEIG", "crema-marfil.jpg"],
  ["MARRON", "marron.jpg"],
  ["BROWN", "marron.jpg"],
  ["EMPERADOR", "marron.jpg"],
  ["GRANITO", "granito.jpg"],
  ["PIZARRA", "granito.jpg"]
];

const catalogByCode = new Map(MATERIAL_CATALOG.map((material) => [material.code, material]));
const catalogByName = new Map(MATERIAL_CATALOG.map((material) => [normalize(material.name), material]));
const catalogByLength = [...MATERIAL_CATALOG].sort((a, b) => b.name.length - a.name.length);

export function resolveMaterialVisual(input: MaterialVisualInput): MaterialVisual {
  const material = materialFromInput(input);
  const searchable = normalize([input.name, material?.name, input.fallbackText].filter(Boolean).join(" "));
  const texture =
    (material?.code ? TEXTURE_BY_CODE[material.code] : undefined) ??
    findTextureByKeyword(searchable) ??
    (material?.family ? TEXTURE_BY_FAMILY[material.family] : undefined) ??
    (input.family ? TEXTURE_BY_FAMILY[input.family] : undefined) ??
    "fallback.jpg";

  return {
    label: input.name ?? material?.name ?? input.fallbackText ?? "Material",
    textureUrl: `${TEXTURE_BASE}${texture}`
  };
}

function materialFromInput(input: MaterialVisualInput): MaterialCatalogRecord | null {
  const code = input.code?.trim();
  if (code && catalogByCode.has(code)) {
    return catalogByCode.get(code) ?? null;
  }

  const name = normalize(input.name ?? "");
  if (name) {
    if (catalogByName.has(name)) {
      return catalogByName.get(name) ?? null;
    }
    if (name === "CREMA MARFIL") {
      return catalogByCode.get("100") ?? null;
    }
  }

  const fallback = normalize(input.fallbackText ?? "");
  if (fallback.includes("CREMA MARFIL")) {
    return catalogByCode.get("100") ?? null;
  }
  return catalogByLength.find((material) => fallback.includes(normalize(material.name))) ?? null;
}

function findTextureByKeyword(value: string): string | undefined {
  return TEXTURE_BY_KEYWORD.find(([keyword]) => value.includes(keyword))?.[1];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
