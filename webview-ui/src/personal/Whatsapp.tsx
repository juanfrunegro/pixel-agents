/**
 * Personal (copia de juanfrunegro): interruptor "Avisarme por WhatsApp cuando termine todo" de la ficha de una sesión
 * principal. El servidor avisa una sola vez, cuando la sesión y todos sus sub-agentes terminaron (ver
 * server/src/personal/whatsapp.ts), y después lo apaga solo.
 */
import { transport } from '../transport/index.js';
import { COLOR_PERILLA, COLOR_VOZ_OFF, COLOR_VOZ_ON } from './colores.js';
import { usePersonal, whatsappDe } from './personal.js';

export function InterruptorWhatsapp({ id }: { id: number }) {
  usePersonal();
  const activo = whatsappDe(id);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-6">
        <button
          role="switch"
          aria-checked={activo}
          aria-label="Aviso por WhatsApp cuando termine todo"
          data-testid={`whatsapp-${id}`}
          onClick={() => transport.send({ type: 'setWhatsappSesion', id, valor: !activo })}
          style={{
            width: 44,
            height: 22,
            borderRadius: 0,
            padding: 2,
            cursor: 'pointer',
            background: activo ? COLOR_VOZ_ON : COLOR_VOZ_OFF,
            display: 'flex',
            justifyContent: activo ? 'flex-end' : 'flex-start',
          }}
        >
          <span style={{ width: 18, height: 18, background: COLOR_PERILLA, display: 'block' }} />
        </button>
        <span style={{ fontSize: '17px' }}>
          {activo ? 'Te avisa por WhatsApp' : 'Sin aviso por WhatsApp'}
        </span>
      </div>
      <span style={{ fontSize: '15px', opacity: 0.7 }}>
        Un solo mensaje cuando termine todo, con sus sub-agentes. También se pide en el prompt:
        «avisame por WhatsApp cuando termines».
      </span>
    </div>
  );
}
