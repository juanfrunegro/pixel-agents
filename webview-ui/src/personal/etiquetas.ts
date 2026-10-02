/**
 * Personal (copia de juanfrunegro): que las tarjetas flotantes de los agentes (nombre y actividad) no se pisen cuando
 * hay varios juntos. Los de más abajo se quedan en su lugar; el que choca con otra tarjeta sube una altura de tarjeta,
 * hasta MAX_SUBIDAS veces. Sin DOM: ToolOverlay.tsx le pasa las posiciones en pantalla.
 */

/** Llegó a la cafetería y descansa: su tarjeta se oculta (salvo al pasar el mouse o tocarlo). */
export function enCafeteria(ch: {
  tileCol: number;
  tileRow: number;
  destino?: { seatCol: number; seatRow: number; descanso?: boolean };
}): boolean {
  const d = ch.destino;
  return !!d?.descanso && ch.tileCol === d.seatCol && ch.tileRow === d.seatRow;
}

/** Tamaño aproximado de una tarjeta en px de pantalla (nombre + actividad). */
export const ANCHO_TARJETA = 120;
export const ALTO_TARJETA = 50;
const MAX_SUBIDAS = 2;

/** Cuánto subir (px) la tarjeta de cada id para que no se superponga con otra. */
export function separarEtiquetas(
  items: Array<{ id: number; x: number; y: number }>,
  ancho = ANCHO_TARJETA,
  alto = ALTO_TARJETA,
): Map<number, number> {
  const subida = new Map<number, number>();
  const puestas: Array<{ x: number; y: number }> = [];
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of orden) {
    let dy = 0;
    for (let n = 0; n < MAX_SUBIDAS; n++) {
      const y = it.y - dy;
      if (!puestas.some((p) => Math.abs(p.x - it.x) < ancho && Math.abs(p.y - y) < alto)) break;
      dy += alto;
    }
    puestas.push({ x: it.x, y: it.y - dy });
    subida.set(it.id, dy);
  }
  return subida;
}
