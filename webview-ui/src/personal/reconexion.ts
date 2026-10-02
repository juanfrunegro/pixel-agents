/**
 * Personal (copia de juanfrunegro): qué hace la pestaña cuando el server se cae y vuelve.
 *
 * - Caída corta (menos de MS_APAGADA): el cartel original "Reconnecting…".
 * - Caída larga: "Oficina apagada" con el botón "Prender" (pixel-agents://prender levanta el server sin abrir otra
 *   pestaña) y reintentos seguidos durante un rato.
 * - Al volver después de haber estado conectada, la página se recarga: el server nuevo tiene otro estado (agentes,
 *   plano) y el original no lo vuelve a pedir en una reconexión. El token es estable (server/src/personal/tokenEstable.ts),
 *   así que la pestaña recargada sigue teniendo permisos.
 */
import type { TransportState } from '../transport/types.js';

/** Cuánto tiene que durar la caída para mostrar "Oficina apagada" en vez de "Reconnecting…". */
export const MS_APAGADA = 4000;
/** Después de "Prender": reintentar cada tanto, durante este rato. */
export const PRENDER_CADA_MS = 2000;
export const PRENDER_DURANTE_MS = 90_000;

/** Protocolo registrado en Windows (HKCU\Software\Classes\pixel-agents) que corre el hook con --abrir. */
export const URL_PRENDER = 'pixel-agents://prender';

/** ¿Hay que recargar la página? Solo al volver a conectar después de haber estado conectada. */
export function debeRecargar(
  anterior: TransportState,
  ahora: TransportState,
  yaEstuvoConectada: boolean,
): boolean {
  return yaEstuvoConectada && anterior !== 'connected' && ahora === 'connected';
}

/** Texto del cartel según el estado y cuánto lleva caída. null = no mostrar nada. */
export function cartel(
  estado: TransportState,
  caidaDesde: number | null,
  ahora: number,
): 'conectando' | 'reconectando' | 'apagada' | null {
  if (estado === 'connected') return null;
  if (estado === 'connecting') return 'conectando';
  if (caidaDesde !== null && ahora - caidaDesde >= MS_APAGADA) return 'apagada';
  return 'reconectando';
}
