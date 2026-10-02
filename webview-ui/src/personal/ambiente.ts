/**
 * Personal (copia de juanfrunegro): comportamiento extra de los personajes, un paso por cuadro desde
 * OfficeState.update().
 * - Dormido (sin tokens): vuelve a su silla y se queda quieto, sin teclear ni pasear.
 */
import type { OfficeState } from '../office/engine/officeState.js';
import { CharacterState } from '../office/types.js';
import { dormidoDe } from './personal.js';

export function tickPersonal(os: OfficeState, ahora = Date.now()): void {
  for (const ch of os.characters.values()) {
    if (ch.matrixEffect || ch.isSubagent) continue;
    if (!dormidoDe(ch.id, ahora)) continue;
    if (ch.state === CharacterState.TYPE) {
      ch.seatTimer = Math.max(ch.seatTimer, 1); // sigue sentado mientras duerma
      ch.frame = 0;
      ch.frameTimer = 0;
    } else if (ch.state === CharacterState.IDLE && ch.seatId) {
      os.sendToSeat(ch.id);
    }
  }
}
