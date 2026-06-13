import { generarMundo, cicloEn, alturaEn, paroActivoEn, TELAR_IDS } from './src/app/core/mock/simulacion';

const MIN = 60_000;

function analiza(ahora: number, etiqueta: string): void {
  const mundo = generarMundo(undefined as any, ahora);
  console.log(`\n===== ${etiqueta} (ahora=${new Date(ahora).toISOString()}) =====`);

  // 1) Ciclo del telar 3 que cubre "ahora"
  const c3 = mundo.ciclos.find((c) => c.telarId === 3 && ahora >= c.colocacion && ahora < c.salida) ?? null;
  if (!c3) {
    console.log('Telar 3: SIN ciclo activo en ahora');
  } else {
    const enCorte = ahora >= c3.inicioCorte && ahora < c3.finCorte;
    console.log(`Telar 3 ciclo ${c3.id}: inicioCorte=${((c3.inicioCorte - ahora) / MIN).toFixed(1)}min, finCorte=${((c3.finCorte - ahora) / MIN).toFixed(1)}min (rel. ahora), enCorte=${enCorte}`);
    const paroAhora = paroActivoEn(c3, ahora);
    console.log(`  paroActivoEn(ahora): ${paroAhora ? paroAhora.causa + ' [' + ((paroAhora.desde - ahora) / MIN).toFixed(1) + ', ' + ((paroAhora.hasta - ahora) / MIN).toFixed(1) + '] min' : 'NINGUNO'}`);
    for (const p of c3.paros) {
      const dentro = p.desde >= c3.inicioCorte && p.hasta <= c3.finCorte;
      console.log(`  paro ${p.causa}: [${((p.desde - ahora) / MIN).toFixed(1)}, ${((p.hasta - ahora) / MIN).toFixed(1)}] min rel ahora — dentro de [inicioCorte,finCorte]=${dentro}`);
    }
    // ¿hay rotura demo exacta [-18,+57]?
    const demo = c3.paros.find((p) => Math.abs(p.desde - (ahora - 18 * MIN)) < 1 && Math.abs(p.hasta - (ahora + 57 * MIN)) < 1);
    console.log(`  rotura demo [-18,+57] presente: ${!!demo}`);
    if (demo) {
      console.log(`  finCorte >= fin rotura demo: ${c3.finCorte >= demo.hasta} (margen ${((c3.finCorte - demo.hasta) / MIN).toFixed(1)} min)`);
    }
    // altura justo antes de finCorte y comprobación de "marcha con altura 0"
    const alturaFin = alturaEn(c3, c3.finCorte);
    console.log(`  alturaEn(finCorte)=${alturaFin.toFixed(2)} mm`);
  }

  // 2) Invariante global: paros dentro del corte y altura no llega a 0 antes de finCorte
  let violacionesParo = 0;
  let violacionesAltura = 0;
  for (const c of mundo.ciclos) {
    for (const p of c.paros) {
      if (p.desde < c.inicioCorte || p.hasta > c.finCorte) {
        violacionesParo++;
        console.log(`  [VIOLACION paro fuera] ${c.id} paro ${p.causa} [${new Date(p.desde).toISOString()}, ${new Date(p.hasta).toISOString()}] corte [${new Date(c.inicioCorte).toISOString()}, ${new Date(c.finCorte).toISOString()}]`);
      }
    }
    // muestrea cada 5 min: ¿altura 0 mientras cortando y sin paro (= marcha a altura 0)?
    for (let t = c.inicioCorte; t < c.finCorte; t += 5 * MIN) {
      if (alturaEn(c, t) <= 0 && !paroActivoEn(c, t)) {
        violacionesAltura++;
        console.log(`  [VIOLACION altura-0-en-marcha] ${c.id} t=${((t - ahora) / MIN).toFixed(0)}min rel ahora`);
        break;
      }
    }
  }
  console.log(`Violaciones paro-fuera-de-corte: ${violacionesParo}; ciclos con marcha a altura 0: ${violacionesAltura}`);

  // 3) Lecturas 'marcha' con altura 0 realmente emitidas (cualquier telar)
  let lecturasMarchaAltura0 = 0;
  for (const id of TELAR_IDS) {
    for (const l of mundo.lecturasPorTelar.get(id) ?? []) {
      if (l.incidencia === 'marcha' && l.alturaActualMm <= 0) {
        lecturasMarchaAltura0++;
      }
    }
  }
  console.log(`Lecturas 'marcha' con altura<=0 emitidas: ${lecturasMarchaAltura0}`);
}

// El mundo es determinista relativo a "ahora": probamos varios anclajes para confirmarlo.
analiza(Date.now(), 'ahora real');
analiza(Date.UTC(2026, 5, 11, 9, 30), 'anclaje fijo A');
analiza(Date.UTC(2025, 0, 3, 22, 15), 'anclaje fijo B');
analiza(Date.UTC(2026, 11, 31, 4, 0), 'anclaje fijo C');
