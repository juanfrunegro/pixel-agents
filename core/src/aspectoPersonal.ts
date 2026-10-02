/**
 * Personal (copia de juanfrunegro): personaje fijo de cada persona del organigrama (Pepe, Tomo, Jere…), el mismo en
 * la oficina y en el organigrama. Sin dependencias: lo usan el servidor (avatar del organigrama) y la pantalla.
 */

export interface Aspecto {
  palette: number;
  hueShift: number;
}

/** Persona de un nombre de fantasía: "Pepe · bugs" → "Pepe". */
export function personaDe(nombre: string): string {
  return nombre.split(' · ')[0].trim();
}

/**
 * Personaje de la persona según su orden en `roles` de nombres.json: las primeras usan cada paleta tal cual y las
 * siguientes repiten paleta con otro tono (como el reparto del original, pero fijo). null si no está en la lista.
 */
export function aspectoDePersona(
  persona: string,
  orden: string[],
  paletas: number,
): Aspecto | null {
  const i = orden.indexOf(persona);
  if (i < 0 || paletas < 1) return null;
  const vuelta = Math.floor(i / paletas);
  return { palette: i % paletas, hueShift: vuelta === 0 ? 0 : 45 + ((vuelta * 97 + i * 31) % 271) };
}
