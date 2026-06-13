"use strict";

// src/app/core/materiales.ts
var MATERIALES = [
  { id: "pietra-grey", nombre: "PIETRA GREY", color: "#5d6470", colorBorde: "#828a98", dureza: 4 },
  { id: "marfil", nombre: "MARFIL", color: "#e8dcc0", colorBorde: "#cdbf9d", dureza: 2 },
  { id: "travertino", nombre: "TRAVERTINO", color: "#cdb89a", colorBorde: "#b29a77", dureza: 1 },
  { id: "negro-marquina", nombre: "NEGRO MARQUINA", color: "#1c1e24", colorBorde: "#4d505a", dureza: 4 },
  { id: "blanco-carrara", nombre: "BLANCO CARRARA", color: "#e9ecef", colorBorde: "#c2c9d1", dureza: 3 },
  { id: "rojo-alicante", nombre: "ROJO ALICANTE", color: "#9e3b3b", colorBorde: "#bd5d5d", dureza: 3 },
  { id: "crema", nombre: "CREMA ZARCI", color: "#ddd0b4", colorBorde: "#bfb194", dureza: 2 },
  { id: "emperador", nombre: "EMPERADOR BU\xD1OL", color: "#6d4c35", colorBorde: "#8d6a50", dureza: 3 },
  { id: "verde-india", nombre: "VERDE INDIA", color: "#4c6b5c", colorBorde: "#6c8d7c", dureza: 4 }
];
var POR_ID = new Map(MATERIALES.map((material) => [material.id, material]));

// src/app/core/dominio.ts
var ESPESOR_TABLA_CM = 2;
var KERF_FLEJE_CM = 0.8;

// src/app/core/mock/simulacion.ts
var TELAR_IDS = [1, 2, 3, 4];
var OPERARIOS_MANANA = [
  "RAMON BLANCO RODRIGUEZ",
  "JUAN MARTINEZ MANZANERA"
];
var OPERARIOS_TARDE = [
  "VOLODYMYR SLYPCHENKO",
  "EDELMIRO MARTINEZ JIMENEZ"
];
var DIAS_HISTORICO = 31;
var DIAS_FUTURO = 4;
var INTERVALO_LECTURA_MS = 10 * 6e4;
var ALTURA_BASTIDOR_REPOSO_MM = 2150;
var TASA_CORRUPCION = { 1: 0.03, 2: 0, 3: 0.05, 4: 0.08 };
function crearRng(seed) {
  let estado = seed >>> 0;
  return () => {
    estado = estado + 1831565813 | 0;
    let t = Math.imul(estado ^ estado >>> 15, 1 | estado);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function entre(rng, min, max) {
  return min + rng() * (max - min);
}
function enteroEntre(rng, min, max) {
  return Math.floor(entre(rng, min, max + 1));
}
function redondeaA(valor, multiplo) {
  return Math.round(valor / multiplo) * multiplo;
}
function turnoDe(epochMs) {
  const hora = new Date(epochMs).getHours();
  if (hora >= 6 && hora < 14) {
    return "manana";
  }
  if (hora >= 14 && hora < 22) {
    return "tarde";
  }
  return "noche";
}
function operariosDe(epochMs) {
  const turno = turnoDe(epochMs);
  if (turno === "manana") {
    return OPERARIOS_MANANA;
  }
  if (turno === "tarde") {
    return OPERARIOS_TARDE;
  }
  return [null, null];
}
function msMarchaHasta(ciclo, t) {
  const fin = Math.min(t, ciclo.finCorte);
  if (fin <= ciclo.inicioCorte) {
    return 0;
  }
  let marcha = fin - ciclo.inicioCorte;
  for (const paro of ciclo.paros) {
    const solapaDesde = Math.max(paro.desde, ciclo.inicioCorte);
    const solapaHasta = Math.min(paro.hasta, fin);
    if (solapaHasta > solapaDesde) {
      marcha -= solapaHasta - solapaDesde;
    }
  }
  return Math.max(0, marcha);
}
function alturaEn(ciclo, t) {
  const horasMarcha = msMarchaHasta(ciclo, t) / 36e5;
  return Math.max(0, ciclo.alturaInicialMm - ciclo.velocidadMmH * horasMarcha);
}
function paroActivoEn(ciclo, t) {
  if (t < ciclo.inicioCorte || t >= ciclo.finCorte) {
    return null;
  }
  return ciclo.paros.find((paro) => t >= paro.desde && t < paro.hasta) ?? null;
}
function cicloEn(ciclos, telarId, t) {
  return ciclos.find((c) => c.telarId === telarId && t >= c.colocacion && t < c.salida) ?? null;
}
function generarMedidas(rng) {
  const proveedor = {
    largoCm: redondeaA(entre(rng, 190, 320), 5),
    altoCm: redondeaA(entre(rng, 90, 200), 5),
    gruesoCm: redondeaA(entre(rng, 60, 180), 5)
  };
  const fabrica = {
    largoCm: proveedor.largoCm + enteroEntre(rng, -6, 2),
    altoCm: proveedor.altoCm + enteroEntre(rng, -5, 2),
    gruesoCm: proveedor.gruesoCm + enteroEntre(rng, -4, 2)
  };
  return { proveedor, fabrica };
}
function tablasPrevistas(medidasFabrica) {
  return Math.max(1, Math.floor(medidasFabrica.gruesoCm / (ESPESOR_TABLA_CM + KERF_FLEJE_CM)));
}
function generarResumenPaquetes(rng, medidas) {
  const numTablas = Math.max(1, tablasPrevistas(medidas) + enteroEntre(rng, -3, 1));
  const largoTablaM = (medidas.largoCm - enteroEntre(rng, 8, 18)) / 100;
  const altoTablaM = (medidas.altoCm - enteroEntre(rng, 10, 22)) / 100;
  const metrosCuadrados = numTablas * largoTablaM * altoTablaM;
  return {
    numPaquetes: Math.max(1, Math.ceil(numTablas / 12)),
    numTablas,
    largoTablaM: Math.round(largoTablaM * 100) / 100,
    altoTablaM: Math.round(altoTablaM * 100) / 100,
    gruesoTablaM: ESPESOR_TABLA_CM / 100,
    metrosCuadrados: Math.round(metrosCuadrados * 10) / 10
  };
}
function velocidadPorDureza(rng, dureza) {
  const rangos = {
    1: [260, 310],
    2: [160, 190],
    3: [140, 165],
    4: [105, 135],
    5: [90, 115]
  };
  const [min, max] = rangos[dureza] ?? [130, 160];
  return redondeaA(entre(rng, min, max), 5);
}
function generarParos(ctx, telarId, inicioCorte, msCortePuro) {
  const { rng, ahora } = ctx;
  const numParos = enteroEntre(rng, 2, 5);
  const paros = [];
  const offsets = Array.from({ length: numParos }, () => entre(rng, 0.06, 0.88) * msCortePuro).sort(
    (a, b) => a - b
  );
  let acumulado = 0;
  let ultimoFin = 0;
  for (const offset of offsets) {
    if (offset <= ultimoFin + 20 * 6e4) {
      continue;
    }
    const esRotura = rng() < 0.15;
    const duracionMin = esRotura ? entre(rng, 45, 150) : entre(rng, 10, 75);
    const desde = inicioCorte + offset + acumulado;
    const hasta = desde + duracionMin * 6e4;
    paros.push({ desde, hasta, causa: esRotura ? "rotura-fleje" : "paro" });
    acumulado += hasta - desde;
    ultimoFin = offset;
  }
  if (telarId === 3) {
    const finCorteEstimado = inicioCorte + msCortePuro + acumulado;
    if (inicioCorte < ahora && finCorteEstimado > ahora) {
      const desde = ahora - 18 * 6e4;
      const hasta = ahora + 57 * 6e4;
      const limpio = paros.filter((paro) => paro.hasta < desde - 10 * 6e4 || paro.desde > hasta);
      limpio.push({ desde, hasta, causa: "rotura-fleje" });
      limpio.sort((a, b) => a.desde - b.desde);
      return limpio;
    }
  }
  return paros;
}
function generarCiclosTelar(ctx, telarId) {
  const { rng, ahora } = ctx;
  const inicioVentana = ahora - DIAS_HISTORICO * 864e5;
  const finVentana = ahora + DIAS_FUTURO * 864e5;
  const ciclos = [];
  let cursor = inicioVentana + entre(rng, 0, 8) * 36e5;
  let contador = 0;
  while (cursor < finVentana) {
    const { proveedor, fabrica } = generarMedidas(rng);
    const material = MATERIALES[enteroEntre(rng, 0, MATERIALES.length - 1)];
    const bloque = {
      numero: ctx.siguienteNumeroBloque(),
      materialId: material.id,
      medidasProveedor: proveedor,
      medidasFabrica: fabrica
    };
    const colocacion = cursor;
    const inicioCorte = colocacion + entre(rng, 0.6, 1.8) * 36e5;
    const alturaInicialMm = fabrica.altoCm * 10 + enteroEntre(rng, 30, 80);
    const velocidadMmH = velocidadPorDureza(rng, material.dureza);
    const msCortePuro = alturaInicialMm / velocidadMmH * 36e5;
    const paros = generarParos(ctx, telarId, inicioCorte, msCortePuro);
    const msParos = paros.reduce((suma, paro) => suma + (paro.hasta - paro.desde), 0);
    const finCorte = inicioCorte + msCortePuro + msParos;
    const salida = finCorte + entre(rng, 0.5, 2) * 36e5;
    const paquetesEn = salida + entre(rng, 0.5, 1.5) * 36e5;
    ciclos.push({
      id: `c-${telarId}-${contador}`,
      telarId,
      bloque,
      colocacion,
      inicioCorte,
      finCorte,
      salida,
      paquetesEn,
      alturaInicialMm,
      velocidadMmH,
      golpesBase: enteroEntre(rng, 825, 905),
      // Máx. 138+7 de ruido = 145 A → 73 kW, bajo el tope real de 76 kW.
      amperiosBase: enteroEntre(rng, 92, 138),
      paros,
      resumenPaquetes: generarResumenPaquetes(rng, fabrica)
    });
    let gapHoras = entre(rng, 1, 4);
    if (telarId === 4 && salida <= ahora && salida > ahora - 5 * 36e5) {
      gapHoras = Math.max(gapHoras, (ahora + 100 * 6e4 - salida) / 36e5);
    }
    cursor = salida + gapHoras * 36e5;
    contador += 1;
  }
  return ciclos;
}
function corromperLectura(rng, lectura) {
  const tipo = enteroEntre(rng, 0, 5);
  switch (tipo) {
    case 0: {
      const fecha = new Date(lectura.fechaHora);
      fecha.setFullYear(2014);
      lectura.fechaHora = fecha.toISOString();
      break;
    }
    case 1: {
      const fecha = new Date(lectura.fechaHora);
      fecha.setFullYear(2099);
      lectura.fechaHora = fecha.toISOString();
      break;
    }
    case 2:
      lectura.incidencia = "desconocida";
      break;
    case 3:
      lectura.alturaActualMm += enteroEntre(rng, 600, 1500);
      break;
    case 4:
      lectura.golpesPorMinuto = rng() < 0.5 ? 9999 : enteroEntre(rng, 1100, 1400);
      break;
    default:
      lectura.amperios = lectura.potenciaKw * 5 + enteroEntre(rng, 10, 40);
      break;
  }
}
function lecturaBase(telarId, t, indice) {
  const [operario1, operario2] = operariosDe(t);
  const iso = new Date(t).toISOString();
  return {
    id: `l-${telarId}-${indice}`,
    telarId,
    fechaHora: iso,
    recibidaEn: iso,
    operario1,
    operario2,
    sospechosa: false,
    motivosSospecha: []
  };
}
function generarLecturasTelar(ctx, telarId, ciclos) {
  const { rng, ahora } = ctx;
  const inicioVentana = ahora - DIAS_HISTORICO * 864e5;
  const finVentana = ahora + DIAS_FUTURO * 864e5;
  const lecturas = [];
  const tasaCorrupcion = TASA_CORRUPCION[telarId] ?? 0;
  let indice = 0;
  let derivaGolpes = 0;
  for (let t = inicioVentana; t <= finVentana; t += INTERVALO_LECTURA_MS) {
    const jitter = entre(rng, -8e4, 8e4);
    const tLectura = t + jitter;
    const ciclo = cicloEn(ciclos, telarId, tLectura);
    const base = lecturaBase(telarId, tLectura, indice);
    indice += 1;
    let lectura;
    if (!ciclo) {
      lectura = {
        ...base,
        bloque: null,
        incidencia: "cambio-bloque",
        potenciaKw: 0,
        amperios: 0,
        golpesPorMinuto: 0,
        velocidadMmH: 0,
        alturaActualMm: ALTURA_BASTIDOR_REPOSO_MM
      };
    } else {
      const altura = Math.round(alturaEn(ciclo, tLectura));
      const cortando = tLectura >= ciclo.inicioCorte && tLectura < ciclo.finCorte;
      const paro = paroActivoEn(ciclo, tLectura);
      if (!cortando || paro) {
        const causa = paro ? paro.causa : "cambio-bloque";
        const residual = rng() < 0.4 ? enteroEntre(rng, 5, 25) : 0;
        lectura = {
          ...base,
          bloque: ciclo.bloque.numero,
          incidencia: causa,
          potenciaKw: Math.round(residual / 2),
          amperios: residual,
          golpesPorMinuto: 0,
          velocidadMmH: 0,
          alturaActualMm: altura
        };
      } else {
        derivaGolpes = Math.max(-40, Math.min(40, derivaGolpes + entre(rng, -9, 9)));
        const golpes = Math.round(ciclo.golpesBase + derivaGolpes + entre(rng, -6, 6));
        const amperios = Math.round(ciclo.amperiosBase + entre(rng, -7, 7));
        lectura = {
          ...base,
          bloque: ciclo.bloque.numero,
          incidencia: "marcha",
          potenciaKw: Math.round(amperios / 2),
          amperios,
          golpesPorMinuto: golpes,
          velocidadMmH: ciclo.velocidadMmH,
          alturaActualMm: altura
        };
      }
    }
    if (tasaCorrupcion > 0 && rng() < tasaCorrupcion) {
      corromperLectura(rng, lectura);
    }
    lecturas.push(lectura);
  }
  return lecturas;
}
function generarEventos(ctx, ciclos) {
  const { rng } = ctx;
  const eventos = [];
  let indice = 0;
  const crear = (ciclo, tipo, t, paquetes = null) => {
    const [operario1, operario2] = operariosDe(t);
    eventos.push({
      id: `e-${indice++}`,
      telarId: ciclo.telarId,
      fechaHora: new Date(t).toISOString(),
      tipo,
      bloque: ciclo.bloque.numero,
      materialId: ciclo.bloque.materialId,
      paquetes,
      operario1: operario1 ?? OPERARIOS_MANANA[0],
      operario2: operario2 ?? OPERARIOS_MANANA[1]
    });
  };
  for (const ciclo of ciclos) {
    crear(ciclo, "colocacion", ciclo.colocacion);
    const numAserrados = enteroEntre(rng, 2, 5);
    for (let i = 1; i <= numAserrados; i++) {
      const t = ciclo.inicioCorte + (ciclo.finCorte - ciclo.inicioCorte) * i / (numAserrados + 1);
      crear(ciclo, "aserrado", t + entre(rng, -20, 20) * 6e4);
    }
    crear(ciclo, "salida", ciclo.salida);
    crear(ciclo, "paquetes", ciclo.paquetesEn, ciclo.resumenPaquetes);
  }
  eventos.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  return eventos;
}
function generarMundo(seed = 20260611, ahora = Date.now()) {
  const rng = crearRng(seed);
  let numeroBloque = 46950 + Math.floor(rng() * 40);
  const ctx = {
    rng,
    ahora,
    siguienteNumeroBloque: () => {
      numeroBloque += enteroEntre(rng, 1, 4);
      return numeroBloque;
    }
  };
  const ciclos = [];
  const lecturasPorTelar = /* @__PURE__ */ new Map();
  for (const telarId of TELAR_IDS) {
    const ciclosTelar = generarCiclosTelar(ctx, telarId);
    ciclos.push(...ciclosTelar);
    lecturasPorTelar.set(telarId, generarLecturasTelar(ctx, telarId, ciclosTelar));
  }
  return {
    ahoraGeneracion: ahora,
    ciclos,
    lecturasPorTelar,
    eventos: generarEventos(ctx, ciclos)
  };
}

// harness-verif.mts
var MIN = 6e4;
function analiza(ahora, etiqueta) {
  const mundo = generarMundo(void 0, ahora);
  console.log(`
===== ${etiqueta} (ahora=${new Date(ahora).toISOString()}) =====`);
  const c3 = mundo.ciclos.find((c) => c.telarId === 3 && ahora >= c.colocacion && ahora < c.salida) ?? null;
  if (!c3) {
    console.log("Telar 3: SIN ciclo activo en ahora");
  } else {
    const enCorte = ahora >= c3.inicioCorte && ahora < c3.finCorte;
    console.log(`Telar 3 ciclo ${c3.id}: inicioCorte=${((c3.inicioCorte - ahora) / MIN).toFixed(1)}min, finCorte=${((c3.finCorte - ahora) / MIN).toFixed(1)}min (rel. ahora), enCorte=${enCorte}`);
    const paroAhora = paroActivoEn(c3, ahora);
    console.log(`  paroActivoEn(ahora): ${paroAhora ? paroAhora.causa + " [" + ((paroAhora.desde - ahora) / MIN).toFixed(1) + ", " + ((paroAhora.hasta - ahora) / MIN).toFixed(1) + "] min" : "NINGUNO"}`);
    for (const p of c3.paros) {
      const dentro = p.desde >= c3.inicioCorte && p.hasta <= c3.finCorte;
      console.log(`  paro ${p.causa}: [${((p.desde - ahora) / MIN).toFixed(1)}, ${((p.hasta - ahora) / MIN).toFixed(1)}] min rel ahora \u2014 dentro de [inicioCorte,finCorte]=${dentro}`);
    }
    const demo = c3.paros.find((p) => Math.abs(p.desde - (ahora - 18 * MIN)) < 1 && Math.abs(p.hasta - (ahora + 57 * MIN)) < 1);
    console.log(`  rotura demo [-18,+57] presente: ${!!demo}`);
    if (demo) {
      console.log(`  finCorte >= fin rotura demo: ${c3.finCorte >= demo.hasta} (margen ${((c3.finCorte - demo.hasta) / MIN).toFixed(1)} min)`);
    }
    const alturaFin = alturaEn(c3, c3.finCorte);
    console.log(`  alturaEn(finCorte)=${alturaFin.toFixed(2)} mm`);
  }
  let violacionesParo = 0;
  let violacionesAltura = 0;
  for (const c of mundo.ciclos) {
    for (const p of c.paros) {
      if (p.desde < c.inicioCorte || p.hasta > c.finCorte) {
        violacionesParo++;
        console.log(`  [VIOLACION paro fuera] ${c.id} paro ${p.causa} [${new Date(p.desde).toISOString()}, ${new Date(p.hasta).toISOString()}] corte [${new Date(c.inicioCorte).toISOString()}, ${new Date(c.finCorte).toISOString()}]`);
      }
    }
    for (let t = c.inicioCorte; t < c.finCorte; t += 5 * MIN) {
      if (alturaEn(c, t) <= 0 && !paroActivoEn(c, t)) {
        violacionesAltura++;
        console.log(`  [VIOLACION altura-0-en-marcha] ${c.id} t=${((t - ahora) / MIN).toFixed(0)}min rel ahora`);
        break;
      }
    }
  }
  console.log(`Violaciones paro-fuera-de-corte: ${violacionesParo}; ciclos con marcha a altura 0: ${violacionesAltura}`);
  let lecturasMarchaAltura0 = 0;
  for (const id of TELAR_IDS) {
    for (const l of mundo.lecturasPorTelar.get(id) ?? []) {
      if (l.incidencia === "marcha" && l.alturaActualMm <= 0) {
        lecturasMarchaAltura0++;
      }
    }
  }
  console.log(`Lecturas 'marcha' con altura<=0 emitidas: ${lecturasMarchaAltura0}`);
}
analiza(Date.now(), "ahora real");
analiza(Date.UTC(2026, 5, 11, 9, 30), "anclaje fijo A");
analiza(Date.UTC(2025, 0, 3, 22, 15), "anclaje fijo B");
analiza(Date.UTC(2026, 11, 31, 4, 0), "anclaje fijo C");
