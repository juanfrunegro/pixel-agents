/**
 * Personal (copia de juanfrunegro): estado y cálculos de la pantalla dividida (Windows a la izquierda, WSL a la
 * derecha). Sin DOM, para poder testearlo: el dibujo está en VistaDividida.tsx.
 */
import { useSyncExternalStore } from 'react';

import { TILE_SIZE } from '../office/types.js';

export type Lado = 'windows' | 'wsl';

// ── Activada o no (recordada en este navegador) ─────────────────

const CLAVE = 'pixel-agents.pantallaDividida';
let activa = leer();
const oyentes = new Set<() => void>();

function leer(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function pantallaDividida(): boolean {
  return activa;
}

export function setPantallaDividida(valor: boolean): void {
  activa = valor;
  try {
    localStorage.setItem(CLAVE, valor ? '1' : '0');
  } catch {
    /* sin almacenamiento (ventana privada): vale solo por ahora */
  }
  oyentes.forEach((f) => f());
}

export function usePantallaDividida(): boolean {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => activa,
  );
}

// ── Qué muestra cada mitad ──────────────────────────────────────

export interface Ocupante {
  lado: Lado;
  sala: string | null;
}

/**
 * Salas de cada lado: las que tienen agentes de ese lado. Si WSL no tiene a nadie, muestra la sala del ERP (que vive
 * en WSL); si Windows no tiene a nadie, todas las demás. Una sala con agentes de los dos lados aparece en las dos
 * mitades, cada una con los suyos.
 */
export function salasPorLado(
  ocupantes: Ocupante[],
  todas: string[],
  salaWslPorDefecto = 'ERP',
): Record<Lado, string[]> {
  const de = (lado: Lado) => [
    ...new Set(ocupantes.filter((o) => o.lado === lado && o.sala).map((o) => o.sala as string)),
  ];
  let wsl = de('wsl');
  if (!wsl.length && todas.includes(salaWslPorDefecto)) wsl = [salaWslPorDefecto];
  let windows = de('windows');
  if (!windows.length) windows = todas.filter((s) => !wsl.includes(s));
  const orden = (xs: string[]) => todas.filter((s) => xs.includes(s));
  return { windows: orden(windows), wsl: orden(wsl) };
}

export interface Caja {
  col0: number;
  row0: number;
  col1: number;
  row1: number;
}

/** Rectángulo (en tiles) que cubre esas salas, con un tile de aire y la fila de decoración de pared de arriba. */
export function cajaDeSalas(
  salas: string[],
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
): Caja {
  const quiero = new Set(salas);
  let caja: Caja | null = null;
  if (areaTiles && quiero.size) {
    for (let i = 0; i < areaTiles.length; i++) {
      const a = areaTiles[i];
      if (!a || !quiero.has(a)) continue;
      const c = i % cols;
      const r = Math.floor(i / cols);
      caja = caja
        ? {
            col0: Math.min(caja.col0, c),
            row0: Math.min(caja.row0, r),
            col1: Math.max(caja.col1, c),
            row1: Math.max(caja.row1, r),
          }
        : { col0: c, row0: r, col1: c, row1: r };
    }
  }
  if (!caja) return { col0: 0, row0: 0, col1: cols - 1, row1: rows - 1 };
  return {
    col0: Math.max(0, caja.col0 - 1),
    row0: Math.max(0, caja.row0 - 3), // pared + decoración colgada
    col1: Math.min(cols - 1, caja.col1 + 1),
    row1: Math.min(rows - 1, caja.row1 + 1),
  };
}

/**
 * Zoom (entero, para que el pixel art no se deforme) y paneo para que la caja entre centrada en una vista de
 * `ancho` x `alto` píxeles de pantalla. El paneo es el mismo que usa el renderer (centro del mapa + pan).
 */
export function encuadre(
  caja: Caja,
  ancho: number,
  alto: number,
  cols: number,
  rows: number,
): { zoom: number; panX: number; panY: number } {
  const w = (caja.col1 - caja.col0 + 1) * TILE_SIZE;
  const h = (caja.row1 - caja.row0 + 1) * TILE_SIZE;
  const zoom = Math.max(1, Math.floor(Math.min(ancho / w, alto / h)));
  const cx = ((caja.col0 + caja.col1 + 1) / 2) * TILE_SIZE;
  const cy = ((caja.row0 + caja.row1 + 1) / 2) * TILE_SIZE;
  return {
    zoom,
    panX: (cols * TILE_SIZE * zoom) / 2 - cx * zoom,
    panY: (rows * TILE_SIZE * zoom) / 2 - cy * zoom,
  };
}
