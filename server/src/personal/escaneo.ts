/**
 * Personal (copia de juanfrunegro): el escaneo global (cada 3 s) hacía un `statSync` de TODOS los transcripts
 * de ~/.claude/projects, también los de WSL por \\wsl.localhost, aunque hiciera días que no se tocaban. Era casi
 * todo el CPU del server en reposo (~6 %) y bloqueaba el event loop.
 *
 * Un transcript dormido se vuelve a mirar según cuánto hace que no cambia:
 * - más de 1 día → cada 60 s; más de 1 hora → cada 20 s; menos → en cada escaneo, como el original.
 * Un archivo nuevo no está en el mapa y se mira enseguida, así que las sesiones nuevas aparecen igual de rápido.
 * Una sesión vieja que se retoma (`--resume`) aparece con hasta 60 s de demora.
 */

const HORA_MS = 60 * 60_000;
const DIA_MS = 24 * HORA_MS;

/** Archivo → momento a partir del cual se vuelve a mirar. */
const proximaMirada = new Map<string, number>();

export function esperaParaDormido(edadMs: number): number {
  if (edadMs > DIA_MS) return 60_000;
  if (edadMs > HORA_MS) return 20_000;
  return 0;
}

/** true si todavía no toca volver a mirar este archivo dormido. */
export function saltearDormido(file: string, ahora = Date.now()): boolean {
  const t = proximaMirada.get(file);
  return t !== undefined && ahora < t;
}

/** Anota un archivo que se miró y no se adoptó (chico o viejo). */
export function anotarDormido(file: string, mtimeMs: number, ahora = Date.now()): void {
  const espera = esperaParaDormido(ahora - mtimeMs);
  if (espera > 0) proximaMirada.set(file, ahora + espera);
  else proximaMirada.delete(file);
}

/** Saca del mapa lo que ya no existe (borrado o movido), para que no crezca para siempre. */
export function olvidarNoVistos(vistos: Set<string>): void {
  for (const f of proximaMirada.keys()) if (!vistos.has(f)) proximaMirada.delete(f);
}

export function _cantidadDormidos(): number {
  return proximaMirada.size;
}

export function _reiniciarDormidos(): void {
  proximaMirada.clear();
}
