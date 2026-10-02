/**
 * Personal (copia de juanfrunegro): qué casos avisan por voz a las sesiones con la voz activada (fila "Avisar por voz
 * cuando:" de la sala de comunicaciones). El servidor la guarda en ~/.pixel-agents/voz/config.json, que leen los hooks
 * de voz de Windows y WSL (~/.claude/hooks/voz_comun.py).
 */
import { useSyncExternalStore } from 'react';

export const CASOS_VOZ = [
  { caso: 'pregunta', texto: 'Pregunta' },
  { caso: 'permiso', texto: 'Permiso' },
  { caso: 'fin_pregunta', texto: 'Termina con pregunta' },
  { caso: 'esperando', texto: 'Te espera' },
] as const;
export type CasoVoz = (typeof CASOS_VOZ)[number]['caso'];
export type ConfigVoz = Record<CasoVoz, boolean>;

let config: ConfigVoz | null = null;
let version = 0;
const oyentes = new Set<() => void>();

/** Mensaje configVoz del servidor (null hasta que llega). */
export function setConfigVoz(casos: Partial<Record<string, unknown>> | null | undefined): void {
  const c = {} as ConfigVoz;
  for (const { caso } of CASOS_VOZ) c[caso] = casos?.[caso] !== false;
  config = c;
  version++;
  oyentes.forEach((f) => f());
}

export function configVozActual(): ConfigVoz | null {
  return config;
}

export function useConfigVoz(): ConfigVoz | null {
  useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => version,
  );
  return config;
}
