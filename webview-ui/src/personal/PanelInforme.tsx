/**
 * Personal (copia de juanfrunegro): el último informe de un manager (clic en su escritorio, o en el del CEO cuando el
 * semáforo titila). Arriba lo que importa para decidir (estado y la decisión que pide); abajo el informe entero.
 */
import { useEffect } from 'react';

import { COLOR_AVISO, COLOR_VELO } from './colores.js';
import { cerrarInforme, useInformes } from './informes.js';
import { nombres } from './personal.js';

const fecha = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString('es-AR', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export function PanelInforme() {
  const { abierto: i } = useInformes();

  useEffect(() => {
    if (!i) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarInforme();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [i]);

  if (!i) return null;
  const quien = nombres().agentes[i.tipo] ?? i.tipo;
  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 69, background: COLOR_VELO }}
        onClick={cerrarInforme}
        aria-hidden="true"
      />
      <div
        className="pixel-panel fixed flex flex-col gap-3 px-10 py-8"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 70,
          width: 'min(760px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
        }}
        role="dialog"
        aria-label={`Informe de ${quien}`}
        data-testid="panel-informe"
      >
        <div className="flex items-center gap-6">
          <span style={{ fontSize: '26px', fontWeight: 'bold' }}>Informe de {quien}</span>
          <button
            style={{
              marginLeft: 'auto',
              fontSize: '18px',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
            onClick={cerrarInforme}
          >
            cerrar
          </button>
        </div>
        <span style={{ fontSize: '16px', opacity: 0.75 }}>
          {[i.titulo, fecha(i.fecha)].filter(Boolean).join(' · ')}
        </span>
        <span style={{ fontSize: '20px' }}>
          <b>Estado:</b> {i.estado || 'sin estado'}
        </span>
        {i.necesitaCeo && (
          <span style={{ fontSize: '20px', color: COLOR_AVISO, whiteSpace: 'pre-wrap' }}>
            <b>Necesita tu decisión:</b> {i.decision || 'escaló el pedido (ver el informe).'}
          </span>
        )}
        <div
          style={{
            fontSize: '16px',
            whiteSpace: 'pre-wrap',

            opacity: 0.9,
            marginTop: 8,
          }}
        >
          {i.texto}
        </div>
      </div>
    </>
  );
}
