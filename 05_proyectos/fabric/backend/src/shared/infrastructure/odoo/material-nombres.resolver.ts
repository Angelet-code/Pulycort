import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';

/** Cada cuánto se vacía la caché de nombres para que un alta tardía se resuelva. */
const TTL_CATALOGOS_MS = 5 * 60_000;

/**
 * Texto del nombre de un producto de Odoo. `product_template.name` es jsonb
 * traducido ({en_US, es_ES}); preferimos español. Tolera el caso de un name
 * guardado como texto plano por si cambia el despliegue de Odoo.
 */
export function textoNombre(name: Prisma.JsonValue | null | undefined): string | null {
  if (name == null) {
    return null;
  }
  if (typeof name === 'string') {
    return name;
  }
  if (typeof name === 'object' && !Array.isArray(name)) {
    const traducciones = name as Record<string, unknown>;
    const valor =
      traducciones['es_ES'] ??
      traducciones['en_US'] ??
      Object.values(traducciones)[0];
    return typeof valor === 'string' ? valor : null;
  }
  return null;
}

/**
 * Normaliza el nombre de material quitando el prefijo de forma del producto, para
 * quedarse solo con la piedra: "M3 BLOQUE MARFIL" → "MARFIL" (bloques) y, en el
 * inventario de tablas/losas, "M2 TABLA TRAVERTINOS" → "TRAVERTINOS" /
 * "M2 LOSA MARRON" → "MARRON". Así una misma piedra casa entre formas (mismo
 * nombre, mismo color de punto) y el alta antigua (por `product_id` de telar, ya
 * sin prefijo) coincide con la nueva. Es solo presentación.
 */
export function limpiarNombreMaterial(nombre: string | null): string | null {
  if (nombre === null) {
    return null;
  }
  const limpio = nombre
    .replace(/^M[23]\s+(BLOQUE|TABLA|LOSA)\s+/i, '')
    .trim();
  return limpio === '' ? null : limpio;
}

/**
 * Etiqueta de material para mostrar/filtrar: el nombre resuelto o, si no hay
 * fila en `product_template`, "Material {id}". Única fuente del fallback (la
 * usan el catálogo, el filtro y cada fila), para que el frontend no lo recomponga.
 */
export function etiquetaMaterial(id: number, nombres: Map<number, string>): string {
  return nombres.get(id) ?? `Material ${id}`;
}

/**
 * Resuelve el nombre legible del material de un id de producto de Odoo. Mira
 * `product_template` y, para los ids que son una variante (`product_product`),
 * su plantilla por `product_tmpl_id`. Normaliza el nombre (sin "M3 BLOQUE").
 *
 * Lo comparten los inventarios de **bloques** (`stock_lot.product_id` /
 * `lot_block_creation.product_id`) y de **tablas** (`stock_lot.product_id` de los
 * lotes `tables`/`slabs`): la resolución de nombre es idéntica, así que vive aquí
 * en vez de duplicarse. Cada repositorio tiene su propia instancia (su caché):
 * caché negativa para los ids sin fila y TTL para que un alta tardía acabe
 * resolviéndose sin reiniciar el proceso.
 */
export class MaterialNombresResolver {
  private readonly cache = new Map<number, string | null>();
  private cacheEn = 0;

  constructor(private readonly prisma: PrismaService) {}

  async resolver(ids: number[]): Promise<Map<number, string>> {
    if (Date.now() - this.cacheEn > TTL_CATALOGOS_MS) {
      this.cache.clear();
      this.cacheEn = Date.now();
    }
    const unicos = [...new Set(ids)];
    const faltan = unicos.filter((id) => !this.cache.has(id));
    if (faltan.length > 0) {
      const productos = await this.prisma.productTemplate.findMany({
        where: { id: { in: faltan } },
        select: { id: true, name: true },
      });
      for (const producto of productos) {
        this.cache.set(
          producto.id,
          limpiarNombreMaterial(textoNombre(producto.name)),
        );
      }
      // Algunos ids son variantes (`product_product.id`), no plantillas: se
      // resuelven por su `product_tmpl_id`.
      const faltanComoPlantilla = faltan.filter((id) => !this.cache.has(id));
      if (faltanComoPlantilla.length > 0) {
        const variantes = await this.prisma.productProduct.findMany({
          where: { id: { in: faltanComoPlantilla } },
          select: { id: true, productTmplId: true },
        });
        const plantillaIds = [
          ...new Set(variantes.map((variante) => variante.productTmplId)),
        ];
        const plantillas = await this.prisma.productTemplate.findMany({
          where: { id: { in: plantillaIds } },
          select: { id: true, name: true },
        });
        const nombrePorPlantilla = new Map(
          plantillas.map((producto) => [
            producto.id,
            limpiarNombreMaterial(textoNombre(producto.name)),
          ]),
        );
        for (const variante of variantes) {
          const nombre = nombrePorPlantilla.get(variante.productTmplId) ?? null;
          if (nombre !== null) {
            this.cache.set(variante.id, nombre);
          }
        }
      }
      // Caché negativa: los ids sin fila se marcan null para no reconsultarlos.
      for (const id of faltan) {
        if (!this.cache.has(id)) {
          this.cache.set(id, null);
        }
      }
    }
    const mapa = new Map<number, string>();
    for (const id of unicos) {
      const nombre = this.cache.get(id);
      if (nombre != null) {
        mapa.set(id, nombre);
      }
    }
    return mapa;
  }
}
