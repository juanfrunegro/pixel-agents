/**
 * Personal (copia de juanfrunegro): filtro por sistema. Windows y WSL comparten la oficina; con "Windows" elegido los
 * agentes de WSL se ven apagados (sin color, medio transparentes, sin etiquetas) y al revés. Solo visual. La elección
 * se recuerda en este navegador.
 */
import { useSyncExternalStore } from 'react';

import { esWsl } from './personal.js';

export type Sistema = 'todos' | 'windows' | 'wsl';

const CLAVE = 'pixel-agents.filtroSistema';
/** Opacidad de los agentes apagados por el filtro. */
export const ALFA_APAGADO = 0.45;

function leer(): Sistema {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE) : null;
    return v === 'windows' || v === 'wsl' ? v : 'todos';
  } catch {
    return 'todos';
  }
}

let actual: Sistema = leer();
const oyentes = new Set<() => void>();

export function filtroSistema(): Sistema {
  return actual;
}

export function setFiltroSistema(s: Sistema): void {
  actual = s;
  try {
    localStorage.setItem(CLAVE, s);
  } catch {
    /* sin almacenamiento (ventana privada): vale solo por ahora */
  }
  oyentes.forEach((f) => f());
}

export function useFiltroSistema(): Sistema {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => actual,
  );
}

/** El personaje es del otro sistema que el elegido: se dibuja apagado. */
export function apagadoPorFiltro(charId: number, filtro: Sistema = actual): boolean {
  if (filtro === 'todos') return false;
  return esWsl(charId) !== (filtro === 'wsl');
}
