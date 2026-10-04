/**
 * Personal (copia de juanfrunegro): una sesión de Claude Code que se cierra escribe al final de su transcript un
 * registro `{"type":"cost-state",…}`. Sin los hooks de Pixel (están apagados a propósito) no llega SessionEnd, así que
 * la oficina no se enteraba del cierre: el personaje quedaba "sin uso" para siempre y se iba a la Cafetería (los
 * fantasmas del 4/10: tres sesiones del ERP ya cerradas).
 *
 * `sesionTerminada` mira solo la última línea completa del archivo (lee los últimos bytes, los transcripts pesan
 * varios MB y algunos están en \\wsl.localhost). Una línea a medio escribir cuenta como "no terminada".
 *
 * Si la sesión se retoma (`--resume`), Claude agrega líneas después del cost-state y deja de estar terminada, así que
 * el escaneo la vuelve a adoptar. Contra: una sesión retomada que todavía no escribió nada queda oculta hasta que se
 * mueva.
 */
import * as fs from 'fs';

const COLA_BYTES = 16 * 1024;

/** Archivo → resultado para ese mtime y tamaño (para no releer la cola en cada escaneo). */
const cache = new Map<string, { mtimeMs: number; size: number; terminada: boolean }>();

/** Última línea completa (terminada en \n) del texto, o null si no hay. */
export function ultimaLinea(texto: string): string | null {
  const fin = texto.lastIndexOf('\n');
  if (fin < 0) return null;
  const sinFinal = texto.slice(0, fin).replace(/\r$/, '');
  const ini = sinFinal.lastIndexOf('\n');
  const linea = sinFinal.slice(ini + 1).trim();
  return linea || null;
}

/** true si la última línea completa es el registro que Claude Code escribe al cerrar la sesión. */
export function esCierre(linea: string | null): boolean {
  if (!linea) return false;
  try {
    return (JSON.parse(linea) as { type?: unknown }).type === 'cost-state';
  } catch {
    return false;
  }
}

export function sesionTerminada(file: string): boolean {
  let fd: number | undefined;
  try {
    const st = fs.statSync(file);
    const previo = cache.get(file);
    if (previo && previo.mtimeMs === st.mtimeMs && previo.size === st.size) return previo.terminada;
    const largo = Math.min(COLA_BYTES, st.size);
    const buf = Buffer.alloc(largo);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, largo, st.size - largo);
    const terminada = esCierre(ultimaLinea(buf.toString('utf8')));
    cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, terminada });
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    return terminada;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function _reiniciarTerminadas(): void {
  cache.clear();
}
