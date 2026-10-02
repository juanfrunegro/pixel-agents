/**
 * Personal (copia de juanfrunegro), tanda 5: lógica del interruptor del aviso por voz (sala de comunicaciones y ficha),
 * sin React ni navegador para poder probarla. La pantalla está en Comunicaciones.tsx.
 */
import type { Character } from '../office/types.js';

/** Valor que manda el interruptor al tocarlo: si hoy avisa, lo apaga; si no, lo prende. */
export function siguienteVoz(activa: boolean): 'on' | 'off' {
  return activa ? 'off' : 'on';
}

/** Texto chico debajo del interruptor: de dónde sale lo que muestra. */
export function origenVoz(pedida: boolean, override: 'on' | 'off' | null): string {
  if (override === 'on')
    return pedida ? 'prendido por vos (también lo pidió el prompt)' : 'prendido por vos';
  if (override === 'off')
    return pedida ? 'apagado por vos (el prompt lo pedía)' : 'apagado por vos';
  return pedida ? 'lo pidió el prompt' : 'no lo pidió el prompt';
}

/**
 * Sesiones principales (sin sub-agentes), por proyecto y en orden de llegada. Orden fijo a propósito: si las que avisan
 * subieran arriba, la fila saltaría de lugar justo al tocar su interruptor.
 */
export function sesionesParaPanel(chars: Iterable<Character>): Character[] {
  return [...chars]
    .filter((c) => !c.isSubagent && c.matrixEffect !== 'despawn')
    .sort((a, b) => (a.folderName ?? '').localeCompare(b.folderName ?? '') || a.id - b.id);
}
