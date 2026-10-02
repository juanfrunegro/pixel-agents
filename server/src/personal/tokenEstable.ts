/**
 * Personal (copia de juanfrunegro): token de la oficina estable entre reinicios.
 *
 * El original crea un token nuevo en cada arranque. La pestaña que Juan deja abierta en la segunda pantalla
 * se reconecta sola al volver el server, pero con el token viejo: queda sin permisos y Recargar, Apagar,
 * asignar oficinas, etc. se ignoraban. Ahora el token vive en `~/.pixel-agents/token` (solo el usuario lo
 * lee, igual que server.json, que ya lo guardaba) y se reutiliza. La primera vez se hereda el de server.json
 * si hay uno válido, así las pestañas abiertas antes de este cambio siguen sirviendo.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Token de `archivo` (texto plano) o, con `deServerJson`, el de un server.json de un server standalone. */
function leer(archivo: string, deServerJson = false): string | null {
  try {
    const crudo = fs.readFileSync(archivo, 'utf8').trim();
    let valor: unknown = crudo;
    if (deServerJson) {
      const config = JSON.parse(crudo) as Record<string, unknown>;
      // Solo el de una oficina standalone: el de un server embebido (VS Code) es de otra superficie.
      valor = config.servesSpa === true ? config.token : null;
    }
    return typeof valor === 'string' && FORMATO.test(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Token guardado en `dir/token`; si no hay, el de `dir/server.json` o uno nuevo (y lo guarda). */
export function tokenEstable(dir: string): string {
  const archivo = path.join(dir, 'token');
  const guardado = leer(archivo);
  if (guardado) return guardado;
  const token = leer(path.join(dir, 'server.json'), true) ?? crypto.randomUUID();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${archivo}.tmp`;
    fs.writeFileSync(tmp, token, { mode: 0o600 });
    fs.renameSync(tmp, archivo);
  } catch (e) {
    console.error(`[Pixel Agents] No se pudo guardar el token estable: ${e}`);
  }
  return token;
}
