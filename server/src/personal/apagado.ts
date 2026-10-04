/**
 * Personal (copia de juanfrunegro): cuándo se apaga sola la oficina (botón de la barra de abajo, al lado de Apagar).
 * Se guarda en ~/.pixel-agents/apagado.json y lo lee ~/.claude/hooks/pixel_agents.py, que es el que la apaga:
 * - sin_pestanas: como siempre, solo si no hay ninguna pestaña abierta y pasan 20 min sin actividad de Claude Code.
 * - 30m / 1h / 2h / 4h: tras ese tiempo sin actividad, aunque la pestaña esté abierta (sin pestañas, a los 20 min si
 *   es antes).
 * - nunca: no se apaga sola.
 * Sin archivo o ilegible = sin_pestanas.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const OPCIONES_APAGADO = ['sin_pestanas', '30m', '1h', '2h', '4h', 'nunca'] as const;
export type OpcionApagado = (typeof OPCIONES_APAGADO)[number];

export function carpetaPixel(): string {
  return path.join(os.homedir() || '.', '.pixel-agents');
}

export function esOpcionApagado(v: unknown): v is OpcionApagado {
  return typeof v === 'string' && (OPCIONES_APAGADO as readonly string[]).includes(v);
}

export function leerApagado(carpeta = carpetaPixel()): OpcionApagado {
  try {
    const v = (
      JSON.parse(fs.readFileSync(path.join(carpeta, 'apagado.json'), 'utf8')) as {
        opcion?: unknown;
      }
    ).opcion;
    return esOpcionApagado(v) ? v : 'sin_pestanas';
  } catch {
    return 'sin_pestanas';
  }
}

/** Guarda la opción (escritura atómica). false si no es válida. */
export function escribirApagado(opcion: unknown, carpeta = carpetaPixel()): boolean {
  if (!esOpcionApagado(opcion)) return false;
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, 'apagado.json');
  const tmp = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ opcion }, null, 2), 'utf8');
  fs.renameSync(tmp, archivo);
  return true;
}
