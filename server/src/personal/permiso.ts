/**
 * Personal (copia de juanfrunegro): la "mano levantada" solo cuando de verdad puede haber un pedido de permiso.
 *
 * Sin los hooks de Pixel (en esta máquina no están instalados: los PermissionRequest los recibe coucou), el
 * original adivina: si una herramienta lleva más de 7 s sin resultado, supone que espera permiso. Eso levantaba
 * la mano con cualquier Bash largo (tests, builds, deploys).
 *
 * Claude Code escribe en cada mensaje del transcript el `permissionMode` de la sesión. Con eso:
 * - bypassPermissions / dontAsk / auto → esa sesión no pregunta (o casi nunca): no hay mano por tiempo.
 *   (Las sesiones de Orca y las de WSL del ERP corren en bypassPermissions.)
 * - acceptEdits → Edit/Write/MultiEdit/NotebookEdit no preguntan: no cuentan.
 * - default / plan / desconocido → queda la heurística del original (puede ser un pedido real).
 * Si llegan los hooks de Pixel, el original ya apaga la heurística y usa el PermissionRequest real.
 */
import * as fs from 'fs';

export const MODOS_SIN_PEDIDOS: ReadonlySet<string> = new Set([
  'bypassPermissions',
  'dontAsk',
  'auto',
]);
const EDICIONES = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
/** Cuánto del final del transcript se lee para conocer el modo de una sesión ya empezada. */
const COLA_BYTES = 256 * 1024;

const modos = new Map<string, string>();
/** Archivo → cuándo se leyó su cola sin encontrar el modo (se reintenta pasado REINTENTO_MS). */
const leidos = new Map<string, number>();
export const REINTENTO_MS = 30_000;

/** Se llama con cada registro del transcript. */
export function anotarModoPermiso(jsonlFile: string, record: unknown): void {
  const modo = (record as { permissionMode?: unknown } | null)?.permissionMode;
  if (typeof modo === 'string' && modo) modos.set(jsonlFile, modo);
}

/** Último `permissionMode` que aparece en un texto de transcript (o undefined). */
export function ultimoModo(texto: string): string | undefined {
  const re = /"permissionMode"\s*:\s*"([A-Za-z]+)"/g;
  let m: RegExpExecArray | null;
  let ultimo: string | undefined;
  while ((m = re.exec(texto))) ultimo = m[1];
  return ultimo;
}

/**
 * Modo de la sesión. Si todavía no se vio ninguna línea con el dato, lee la cola del archivo (como mucho una vez cada
 * REINTENTO_MS mientras no aparezca).
 */
export function modoDe(jsonlFile: string, ahora = Date.now()): string | undefined {
  const conocido = modos.get(jsonlFile);
  if (conocido) return conocido;
  const antes = leidos.get(jsonlFile);
  if (antes !== undefined && ahora - antes < REINTENTO_MS) return undefined;
  leidos.set(jsonlFile, ahora);
  try {
    const fd = fs.openSync(jsonlFile, 'r');
    try {
      const tam = fs.fstatSync(fd).size;
      const largo = Math.min(tam, COLA_BYTES);
      const buf = Buffer.alloc(largo);
      fs.readSync(fd, buf, 0, largo, tam - largo);
      const modo = ultimoModo(buf.toString('utf8'));
      if (modo) modos.set(jsonlFile, modo);
      return modo;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/**
 * Herramientas que NO pueden estar esperando permiso en esta sesión (además de las exentas del original), o
 * null si la sesión no hace pedidos y no hay que levantar la mano por tiempo.
 */
export function exentasPara(
  modo: string | undefined,
  base: ReadonlySet<string>,
): ReadonlySet<string> | null {
  if (modo && MODOS_SIN_PEDIDOS.has(modo)) return null;
  if (modo === 'acceptEdits') return new Set([...base, ...EDICIONES]);
  return base;
}

/** Al cerrar una sesión, para que los mapas no crezcan para siempre. */
export function olvidarModo(jsonlFile: string): void {
  modos.delete(jsonlFile);
  leidos.delete(jsonlFile);
}

export function _reiniciarModos(): void {
  modos.clear();
  leidos.clear();
}
