/**
 * Personal (copia de juanfrunegro): qué proyecto ocupa cada oficina. El plano tiene una cantidad fija de oficinas de
 * proyecto (LUGARES, más "Otros" al final, que no se asigna); Juan elige qué proyecto va en cada una desde el menú de
 * la oficina, o la deja vacía ("Libre"). Así decide con qué proyectos trabaja en paralelo: un proyecto nuevo de Orca no
 * aparece solo, se asigna a mano, y los agentes de un proyecto sin oficina van a "Otros".
 *
 * Se guarda en ~/.pixel-agents/oficinas.json (no en el plano), así sobrevive a reinicios y al botón Recargar.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { esOficinaLibre, esSalaComun, nombreLibre } from '../../../core/src/salasComunes.js';

/** Oficinas de proyecto asignables (sin contar "Otros" ni el Brain, que van fijos). */
export const LUGARES = 6;

/** null = oficina libre. */
export type Ocupacion = Array<string | null>;

export function rutaOcupacion(): string {
  return path.join(os.homedir() || '.', '.pixel-agents', 'oficinas.json');
}

/** Proyectos que pueden tener oficina: todos menos el Brain (fijo en el centro) y "Otros" (fijo, el último). */
export function asignables(nombres: string[]): string[] {
  return [...new Set(nombres.filter((n) => n && n !== 'Brain' && n !== 'Otros'))];
}

/** Primera vez: las primeras LUGARES salas de Orca, en el orden de siempre (el plano que ya había). */
export function ocupacionInicial(disponibles: string[]): Ocupacion {
  const o: Ocupacion = asignables(disponibles).slice(0, LUGARES);
  while (o.length < LUGARES) o.push(null);
  return o;
}

/** Normaliza lo leído del archivo: siempre LUGARES lugares, solo textos, sin repetidos. null si no sirve. */
export function normalizarOcupacion(crudo: unknown): Ocupacion | null {
  const lugares = (crudo as { lugares?: unknown } | null)?.lugares;
  if (!Array.isArray(lugares)) return null;
  const vistos = new Set<string>();
  const o: Ocupacion = [];
  for (let i = 0; i < LUGARES; i++) {
    const v = lugares[i];
    if (typeof v === 'string' && v.trim() && !vistos.has(v.trim()) && !esOficinaLibre(v.trim())) {
      vistos.add(v.trim());
      o.push(v.trim());
    } else {
      o.push(null);
    }
  }
  return o;
}

/**
 * Las oficinas tal como están en un plano ya generado (sus áreas en orden: oficinas de proyecto, sin las compartidas,
 * el Brain ni "Otros"). Sirve para que la primera vez se respete el plano que Juan ya tenía. null si no hay oficinas.
 */
export function ocupacionDelPlano(areas: string[]): Ocupacion | null {
  const ofi = areas.filter((a) => a !== 'Brain' && a !== 'Otros' && !esSalaComun(a));
  if (ofi.length === 0) return null;
  return normalizarOcupacion({ lugares: ofi.map((a) => (esOficinaLibre(a) ? null : a)) });
}

/**
 * Qué proyecto ocupa cada oficina: lo guardado; si todavía no hay nada guardado, lo que muestra el plano actual
 * (`delPlano`); y si tampoco, las primeras salas de Orca.
 */
export function leerOcupacion(
  disponibles: string[],
  ruta = rutaOcupacion(),
  delPlano: () => Ocupacion | null = () => null,
): Ocupacion {
  try {
    const o = normalizarOcupacion(JSON.parse(fs.readFileSync(ruta, 'utf8')));
    if (o) return o;
  } catch {
    /* sin archivo o roto: la del plano o la de siempre */
  }
  return delPlano() ?? ocupacionInicial(disponibles);
}

export function guardarOcupacion(o: Ocupacion, ruta = rutaOcupacion()): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ lugares: o }, null, 2), 'utf8');
  fs.renameSync(tmp, ruta);
}

/** Nombre de la sala de cada lugar: el proyecto, o "Libre N". */
export function salaDelLugar(o: Ocupacion, i: number): string {
  return o[i] ?? nombreLibre(i);
}

/** Lugar de una oficina por el nombre que muestra el plano ("Chaina", "Libre 3"). -1 si no es una oficina asignable. */
export function lugarDeSala(o: Ocupacion, sala: string): number {
  for (let i = 0; i < o.length; i++) if (salaDelLugar(o, i) === sala) return i;
  return -1;
}

/**
 * Pone `proyecto` en la oficina `sala` (null = dejarla libre). Si el proyecto ya estaba en otra oficina, las dos se
 * intercambian (lo que había en esta pasa a aquella). Valida contra la lista de proyectos de Orca: nunca guarda algo
 * que no sea un proyecto conocido. Devuelve la ocupación nueva o el error para mostrar.
 */
export function asignarOficina(
  o: Ocupacion,
  sala: unknown,
  proyecto: unknown,
  disponibles: string[],
): { ocupacion: Ocupacion } | { error: string } {
  if (typeof sala !== 'string') return { error: 'Pedido inválido.' };
  const i = lugarDeSala(o, sala);
  if (i < 0) return { error: `${sala} no es una oficina que se pueda asignar.` };
  if (proyecto === null) {
    const n = [...o];
    n[i] = null;
    return { ocupacion: n };
  }
  if (typeof proyecto !== 'string' || !asignables(disponibles).includes(proyecto)) {
    return { error: 'Ese proyecto no está en Orca.' };
  }
  const n = [...o];
  const antes = n.indexOf(proyecto);
  if (antes === i) return { ocupacion: n };
  if (antes >= 0) n[antes] = n[i];
  n[i] = proyecto;
  return { ocupacion: n };
}
