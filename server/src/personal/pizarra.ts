/**
 * Personal (copia de juanfrunegro): pizarra del Brain con los pendientes de cada proyecto. Misma fuente y mismo criterio
 * que el radar (~/.claude/tools/radar/radar.mjs, leerPendientes): el PENDIENTES.md (o docs/PENDIENTES.md) de la carpeta
 * de cada proyecto, con "- [ ]" abiertos, "- [x]" hechos y lo que va bajo un título "Ideas". Solo lectura. Los
 * proyectos son los de Orca, los mismos que arman las salas.
 */
import * as fs from 'fs';
import * as path from 'path';

import { type ProyectoOrca, proyectosPorSala } from './oficina.js';

export interface Pendientes {
  archivo: string;
  abiertos: string[];
  ideas: string[];
  hechos: number;
}

/** Copia de leerPendientes del radar (mismo formato, mismo resultado). */
export function leerPendientes(raiz: string): Pendientes | null {
  const f = ['PENDIENTES.md', path.join('docs', 'PENDIENTES.md')]
    .map((p) => path.join(raiz, p))
    .find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
  if (!f) return null;
  let texto: string;
  try {
    texto = fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
  return parsearPendientes(texto, path.relative(raiz, f).replace(/\\/g, '/'));
}

export function parsearPendientes(texto: string, archivo = 'PENDIENTES.md'): Pendientes {
  const abiertos: string[] = [];
  const ideas: string[] = [];
  let enIdeas = false;
  for (const l of texto.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(l)) enIdeas = /^#{1,6}\s+ideas\b/i.test(l);
    const m = /^\s*[-*]\s+\[ \]\s+(.*)$/.exec(l);
    if (m) (enIdeas ? ideas : abiertos).push(m[1].replace(/\*\*/g, '').trim());
    else if (enIdeas && /^\s*[-*]\s+(?!\[x\])/i.test(l))
      ideas.push(
        l
          .replace(/^\s*[-*]\s+/, '')
          .replace(/\*\*/g, '')
          .trim(),
      );
  }
  const hechos = (texto.match(/^\s*[-*]\s+\[x\]/gim) ?? []).length;
  return { archivo, abiertos, ideas, hechos };
}

export interface FilaPizarra {
  sala: string;
  archivo: string | null;
  abiertos: number;
  ideas: number;
  hechos: number;
  /** Los primeros 3 pendientes abiertos (para el panel). */
  primeros: string[];
}

/** Título corto de un pendiente: hasta el primer ". " o " (", y como mucho 120 caracteres. */
export function tituloCorto(s: string): string {
  const corte = /\s\(|\.\s/.exec(s);
  const t = (corte && corte.index > 12 ? s.slice(0, corte.index) : s).trim();
  return t.length > 120 ? t.slice(0, 119).trimEnd() + '…' : t;
}

export function filasPizarra(
  proyectos: Map<string, ProyectoOrca> = proyectosPorSala(),
  leer: (raiz: string) => Pendientes | null = leerPendientes,
): FilaPizarra[] {
  const filas: FilaPizarra[] = [];
  for (const [sala, p] of proyectos) {
    const pend = leer(p.ruta);
    filas.push({
      sala,
      archivo: pend?.archivo ?? null,
      abiertos: pend?.abiertos.length ?? 0,
      ideas: pend?.ideas.length ?? 0,
      hechos: pend?.hechos ?? 0,
      primeros: (pend?.abiertos ?? []).slice(0, 3).map(tituloCorto),
    });
  }
  return filas;
}

// Leer por \\wsl.localhost tarda: la pizarra se rehace como mucho una vez por minuto.
const VIGENCIA_MS = 60_000;
let cache: { hecho: number; filas: FilaPizarra[] } | null = null;

export function pizarra(ahora = Date.now()): FilaPizarra[] {
  if (!cache || ahora - cache.hecho > VIGENCIA_MS) cache = { hecho: ahora, filas: filasPizarra() };
  return cache.filas;
}
