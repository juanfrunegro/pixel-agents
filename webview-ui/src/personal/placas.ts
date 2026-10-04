/**
 * Personal (copia de juanfrunegro): oficina por niveles. Una placa en el frente de los escritorios con dueño por rol
 * (server/src/personal/oficina.ts, `escritorioDeRol`): el del CEO en el Brain ("CEO · Juan") y el del manager en cada
 * oficina de proyecto ("Rulo", el nombre de `manager-<proyecto>` en nombres.json; "Manager" tenue si ese proyecto no
 * tiene). Va en el tercio izquierdo del frente del escritorio, para que no la tape quien se sienta (en el del medio).
 * Los escritorios se buscan una vez por plano (setPlacas, desde ambiente.ts) y se dibujan cada cuadro (renderPlacas).
 */
import { personaDe } from '../../../core/src/aspectoPersonal.js';
import type { PlacedFurniture } from '../office/types.js';
import { TILE_SIZE } from '../office/types.js';
import { CARTEL_BORDE, CARTEL_FONDO, CARTEL_TEXTO, PLACA_ALERTA, PLACA_CEO } from './colores.js';
import { nombres } from './personal.js';

export interface Placa {
  col: number;
  row: number;
  rol: 'ceo' | 'manager';
  /** Sala del escritorio (el proyecto, para el manager). */
  sala: string | null;
}

/** Alto del escritorio en tiles (DESK_FRONT es de 3×2). */
const ALTO_ESCRITORIO = 2;

let placas: Placa[] = [];
let de: unknown = null;

/** Los escritorios del CEO y de los managers del plano. Se recalcula solo si cambió el plano. */
export function setPlacas(
  furniture: PlacedFurniture[],
  salaDe: (col: number, row: number) => string | null,
): Placa[] {
  if (de === furniture) return placas;
  const out: Placa[] = [];
  for (const f of furniture) {
    const rol = f.uid.endsWith('-ceo-escritorio')
      ? 'ceo'
      : f.uid.endsWith('-manager-escritorio')
        ? 'manager'
        : null;
    if (rol) out.push({ col: f.col, row: f.row, rol, sala: salaDe(f.col, f.row) });
  }
  placas = out;
  de = furniture;
  return out;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** El tipo de agente del manager de una sala ("ERP" → "manager-erp"). */
export function tipoManagerDe(sala: string): string {
  return `manager-${slug(sala)}`;
}

/** Texto de la placa y si el puesto tiene dueño (sin manager definido para ese proyecto, se dibuja tenue). */
export function textoPlaca(p: Placa): { texto: string; conDueno: boolean } {
  const n = nombres();
  if (p.rol === 'ceo') return { texto: `CEO · ${n.ceo}`, conDueno: true };
  const nombre = p.sala ? n.agentes[tipoManagerDe(p.sala)] : undefined;
  return nombre
    ? { texto: personaDe(nombre), conDueno: true }
    : { texto: 'Manager', conDueno: false };
}

/** Medio ciclo del parpadeo del semáforo (ms). */
export const PARPADEO_MS = 500;

/**
 * `colorDe` da el color de la sala (el del cartel de la pared): es el filete de arriba de la placa del manager; la del
 * CEO va en dorado. `parpadea` (semáforo, informes.ts): la placa titila en rojo mientras espera una decisión del CEO.
 */
export function renderPlacas(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  colorDe: (sala: string | null) => string | undefined = () => undefined,
  parpadea: (p: Placa) => boolean = () => false,
  ahora = performance.now(),
): void {
  if (placas.length === 0) return;
  const s = TILE_SIZE * zoom;
  const fuente = Math.max(Math.round(7 * zoom), 11);
  const borde = Math.max(1, Math.round(zoom / 2));
  ctx.save();
  ctx.font = `${fuente}px 'FS Pixel Sans'`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const prendida = Math.floor(ahora / PARPADEO_MS) % 2 === 0;
  for (const p of placas) {
    const { texto, conDueno } = textoPlaca(p);
    const ancho = Math.round(Math.max(ctx.measureText(texto).width + fuente, s * 1.2));
    const alto = Math.round(fuente * 1.45);
    const cx = Math.round(offsetX + (p.col + 0.5) * s);
    const y = Math.round(offsetY + (p.row + ALTO_ESCRITORIO) * s - alto - borde);
    const x = Math.round(cx - ancho / 2);
    ctx.globalAlpha = conDueno ? 0.95 : 0.5;
    ctx.fillStyle = CARTEL_FONDO;
    ctx.fillRect(x, y, ancho, alto);
    ctx.fillStyle = CARTEL_BORDE;
    ctx.fillRect(x, y + alto - borde, ancho, borde);
    // Filete de arriba, más grueso: dorado el del CEO, el color de la sala el del manager.
    ctx.fillStyle = p.rol === 'ceo' ? PLACA_CEO : (colorDe(p.sala) ?? CARTEL_BORDE);
    ctx.fillRect(x, y, ancho, borde * 2);
    ctx.fillStyle = CARTEL_TEXTO;
    ctx.fillText(texto, cx, y + alto / 2 + borde / 2);
    if (prendida && parpadea(p)) {
      // Semáforo: marco rojo alrededor de la placa, a pleno aunque la placa esté tenue.
      const m = borde * 2;
      ctx.globalAlpha = 1;
      ctx.fillStyle = PLACA_ALERTA;
      ctx.fillRect(x - m, y - m, ancho + 2 * m, m);
      ctx.fillRect(x - m, y + alto, ancho + 2 * m, m);
      ctx.fillRect(x - m, y, m, alto);
      ctx.fillRect(x + ancho, y, m, alto);
    }
  }
  ctx.restore();
}

/** Las placas del último plano (para el clic en el escritorio, informes.ts). */
export function placasDelPlano(): readonly Placa[] {
  return placas;
}

/** Solo para tests. */
export function _reiniciarPlacas(): void {
  placas = [];
  de = null;
}
