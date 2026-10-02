/**
 * Personal (copia de juanfrunegro), tanda 5: sala de comunicaciones. Clic en Presentaciones abre un panel con cada
 * sesión abierta (Windows y WSL) y su interruptor del aviso por voz; el mismo interruptor está en la ficha del agente.
 *
 * Prendido = al terminar el turno te avisa por voz. Arranca como lo pidió el prompt ("avisame cuando termines" → marca
 * del hook); si lo tocás, manda tu elección sobre el prompt (el servidor escribe ~/.pixel-agents/voz/<sesión>.override
 * y los hooks de voz de Windows y WSL lo leen). "Seguir al prompt" borra tu elección.
 */
import type { OfficeState } from '../office/engine/officeState.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import {
  COLOR_PERILLA,
  COLOR_VELO,
  COLOR_VOZ_OFF,
  COLOR_VOZ_ON,
  COLOR_WINDOWS,
  COLOR_WSL,
} from './colores.js';
import { esWsl, nombreDe, usePersonal, vozDe, vozOverrideDe, vozPedidaDe } from './personal.js';
import { cerrarComunicaciones, usePizarra } from './pizarra.js';
import { origenVoz, sesionesParaPanel, siguienteVoz } from './voz.js';

export function InterruptorVoz({ id, compacto = false }: { id: number; compacto?: boolean }) {
  usePersonal();
  const activa = vozDe(id);
  const override = vozOverrideDe(id);
  const pedida = vozPedidaDe(id);
  const cambiar = (valor: 'on' | 'off' | null) =>
    transport.send({ type: 'setVozSesion', id, valor });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-6">
        <button
          role="switch"
          aria-checked={activa}
          aria-label="Aviso por voz al terminar"
          data-testid={`voz-${id}`}
          onClick={() => cambiar(siguienteVoz(activa))}
          style={{
            width: 44,
            height: 22,
            borderRadius: 0,
            padding: 2,
            cursor: 'pointer',
            background: activa ? COLOR_VOZ_ON : COLOR_VOZ_OFF,
            display: 'flex',
            justifyContent: activa ? 'flex-end' : 'flex-start',
          }}
        >
          <span style={{ width: 18, height: 18, background: COLOR_PERILLA, display: 'block' }} />
        </button>
        <span style={{ fontSize: '17px' }}>
          {activa ? 'Te avisa por voz' : 'Sin aviso por voz'}
        </span>
      </div>
      {!compacto && (
        <span style={{ fontSize: '15px', opacity: 0.7 }}>
          {origenVoz(pedida, override)}
          {override !== null && (
            <>
              {' · '}
              <button
                style={{ textDecoration: 'underline', cursor: 'pointer', fontSize: '15px' }}
                onClick={() => cambiar(null)}
              >
                seguir al prompt
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

export function PanelComunicaciones({ officeState }: { officeState: OfficeState }) {
  const p = usePizarra();
  usePersonal();
  if (!isBrowserRuntime || !p.comunicaciones) return null;
  const sesiones = sesionesParaPanel(officeState.characters.values());
  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 69, background: COLOR_VELO }}
        onClick={cerrarComunicaciones}
        aria-hidden="true"
      />
      <div
        className="pixel-panel fixed flex flex-col gap-4 px-10 py-8"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 70,
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
        }}
        role="dialog"
        aria-label="Sala de comunicaciones"
        data-testid="panel-comunicaciones"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-6">
          <span style={{ fontSize: '26px', fontWeight: 'bold' }}>Sala de comunicaciones</span>
          <button
            style={{
              marginLeft: 'auto',
              fontSize: '18px',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
            onClick={cerrarComunicaciones}
          >
            cerrar
          </button>
        </div>
        <span style={{ fontSize: '16px', opacity: 0.75 }}>
          Quién te avisa por voz cuando termina. Si en el prompt pediste &quot;avisame cuando
          termines&quot; aparece prendido; lo que elijas acá manda sobre el prompt.
        </span>
        {sesiones.length === 0 && (
          <span style={{ fontSize: '18px', opacity: 0.7 }}>No hay sesiones abiertas.</span>
        )}
        {sesiones.map((c) => {
          const wsl = esWsl(c.id);
          return (
            <div
              key={c.id}
              className="flex items-center gap-8"
              style={{
                borderLeft: `6px solid ${wsl ? COLOR_WSL : COLOR_WINDOWS}`,
                paddingLeft: 10,
              }}
            >
              <div className="flex flex-col" style={{ minWidth: 170 }}>
                <span style={{ fontSize: '20px', fontWeight: 'bold' }}>
                  {c.agentName || nombreDe(c.id)}
                </span>
                <span style={{ fontSize: '15px', opacity: 0.75 }}>
                  {c.folderName || '—'} · {wsl ? 'WSL' : 'Windows'}
                  {vozPedidaDe(c.id) && ' · marcada por prompt'}
                </span>
              </div>
              <InterruptorVoz id={c.id} />
            </div>
          );
        })}
      </div>
    </>
  );
}
