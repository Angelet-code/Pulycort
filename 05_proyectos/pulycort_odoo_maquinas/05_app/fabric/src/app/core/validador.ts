import { LecturaTelar } from './models';
import { formatFechaHoraAnio } from './format';
import { ALTURA_BASTIDOR_REPOSO_MM } from './dominio';

/**
 * Validador de calidad de datos ("salud del dato").
 *
 * En el sistema antiguo los telares 1, 3 y 4 emiten lecturas corruptas
 * (fechas imposibles, incidencias sin mapear, saltos de altura...). En vez de
 * ocultarlas o dejar que rompan los KPIs, Fabric las marca como sospechosas,
 * las excluye de los cálculos y las enseña en cuarentena con su motivo.
 *
 * Las reglas trabajan sobre la secuencia en orden de recepción y comparan la
 * fecha declarada por la máquina con el sello de recepción del servidor, que
 * sí es fiable.
 */

const TOLERANCIA_FECHA_MS = 15 * 60_000;
const VELOCIDAD_MAX_MM_H = 310;
const SUBIDA_TOLERADA_MM = 30;
const GOLPES_MIN = 700;
const GOLPES_MAX = 1000;
const POTENCIA_MAX_KW = 76;

/** Marca in situ `sospechosa` y `motivosSospecha` de cada lectura. */
export function validarLecturas(lecturas: LecturaTelar[]): void {
  let previaValida: LecturaTelar | null = null;

  for (const lectura of lecturas) {
    const motivos: string[] = [];

    const declarada = new Date(lectura.fechaHora).getTime();
    const recibida = new Date(lectura.recibidaEn).getTime();
    if (Number.isNaN(declarada) || Math.abs(declarada - recibida) > TOLERANCIA_FECHA_MS) {
      motivos.push(
        `Fecha declarada imposible (${formatFechaHoraAnio(lectura.fechaHora)}) frente a la recepción (${formatFechaHoraAnio(lectura.recibidaEn)})`
      );
    }

    if (lectura.incidencia === 'desconocida') {
      motivos.push('Incidencia sin mapear ("Sin nombre")');
    }

    if (lectura.potenciaKw > POTENCIA_MAX_KW || lectura.potenciaKw < 0) {
      motivos.push(`Potencia fuera de rango (${lectura.potenciaKw} kW)`);
    } else if (lectura.potenciaKw > 5) {
      const esperado = lectura.potenciaKw * 2;
      if (Math.abs(lectura.amperios - esperado) > esperado * 0.35) {
        motivos.push(
          `Amperios desacoplados de la potencia (${lectura.amperios} A con ${lectura.potenciaKw} kW)`
        );
      }
    } else if (lectura.amperios > lectura.potenciaKw * 2 + 8) {
      // Con potencia casi nula tampoco puede haber corriente: sensor roto.
      motivos.push(
        `Amperios sin potencia que los justifique (${lectura.amperios} A con ${lectura.potenciaKw} kW)`
      );
    }

    if (
      lectura.golpesPorMinuto !== 0 &&
      (lectura.golpesPorMinuto < GOLPES_MIN || lectura.golpesPorMinuto > GOLPES_MAX)
    ) {
      motivos.push(`Golpes fuera de rango (${lectura.golpesPorMinuto} golpes/min)`);
    }

    // El bastidor tiene un tope físico: por encima del reposo es imposible.
    if (lectura.alturaActualMm > ALTURA_BASTIDOR_REPOSO_MM + 100) {
      motivos.push(
        `Altura por encima del tope físico del bastidor (${Math.round(lectura.alturaActualMm)} mm)`
      );
    }

    // En reposo (sin bloque) la altura debe mantenerse estable.
    if (
      previaValida &&
      lectura.bloque === null &&
      previaValida.bloque === null &&
      Math.abs(lectura.alturaActualMm - previaValida.alturaActualMm) > 50
    ) {
      motivos.push(
        `La altura cambia ${Math.round(Math.abs(lectura.alturaActualMm - previaValida.alturaActualMm))} mm con el bastidor en reposo`
      );
    }

    // Coherencia física de la altura frente a la última lectura fiable
    // del mismo bloque: el bastidor nunca sube y no puede bajar más rápido
    // que la velocidad máxima del catálogo.
    if (
      previaValida &&
      lectura.bloque !== null &&
      previaValida.bloque === lectura.bloque
    ) {
      const deltaAltura = lectura.alturaActualMm - previaValida.alturaActualMm;
      const deltaHoras =
        (recibida - new Date(previaValida.recibidaEn).getTime()) / 3_600_000;
      if (deltaAltura > SUBIDA_TOLERADA_MM) {
        motivos.push(`La altura del bastidor sube ${Math.round(deltaAltura)} mm en pleno corte`);
      } else if (
        deltaHoras > 0 &&
        -deltaAltura > VELOCIDAD_MAX_MM_H * deltaHoras * 1.5 + SUBIDA_TOLERADA_MM
      ) {
        motivos.push(
          `Descenso físicamente imposible (${Math.round(-deltaAltura)} mm en ${Math.round(deltaHoras * 60)} min)`
        );
      }
    }

    lectura.sospechosa = motivos.length > 0;
    lectura.motivosSospecha = motivos;
    if (!lectura.sospechosa) {
      previaValida = lectura;
    }
  }
}
