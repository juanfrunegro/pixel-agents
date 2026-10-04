/**
 * Personal (copia de juanfrunegro): el último informe de un manager (clic en su escritorio, o en el del CEO cuando el
 * semáforo titila). Arriba el estado (con su color) y la decisión que pide; abajo el resto, una sección por etiqueta
 * del informe (seccionesDe), con las viñetas como lista y lo que va entre `comillas` resaltado.
 */
import { type ReactNode, useEffect } from 'react';

import {
  COLOR_AVISO,
  COLOR_VELO,
  INFORME_CODIGO_FONDO,
  INFORME_CODIGO_TEXTO,
  INFORME_OK,
  INFORME_TITULO,
  PLACA_ALERTA,
} from './colores.js';
import { cerrarInforme, seccionesDe, tonoEstado, useInformes } from './informes.js';
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

const COLOR_ESTADO = {
  ok: INFORME_OK,
  cambios: COLOR_AVISO,
  mal: PLACA_ALERTA,
  nada: INFORME_TITULO,
};

/** Texto con lo que va entre `comillas invertidas` resaltado (rutas, funciones, comandos). */
function conCodigo(t: string): ReactNode[] {
  return t.split(/(`[^`]+`)/).map((parte, k) =>
    parte.startsWith('`') && parte.endsWith('`') && parte.length > 2 ? (
      <span
        key={k}
        style={{
          color: INFORME_CODIGO_TEXTO,
          background: INFORME_CODIGO_FONDO,
          padding: '0 4px',
          overflowWrap: 'anywhere',
        }}
      >
        {parte.slice(1, -1)}
      </span>
    ) : (
      parte
    ),
  );
}

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
  const colorEstado = COLOR_ESTADO[tonoEstado(i.estado)];
  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 69, background: COLOR_VELO }}
        onClick={cerrarInforme}
        aria-hidden="true"
      />
      <div
        className="pixel-panel fixed flex flex-col gap-6 px-10 py-8"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 70,
          width: 'min(900px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          lineHeight: 1.45,
        }}
        role="dialog"
        aria-label={`Informe de ${quien}`}
        data-testid="panel-informe"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-6">
            <span style={{ fontSize: '30px', fontWeight: 'bold' }}>Informe de {quien}</span>
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
          {i.titulo && <span style={{ fontSize: '22px' }}>{conCodigo(i.titulo)}</span>}
          {i.fecha > 0 && (
            <span style={{ fontSize: '16px', color: INFORME_TITULO }}>{fecha(i.fecha)}</span>
          )}
        </div>

        <div className="flex items-start gap-3" style={{ fontSize: '22px' }}>
          <span
            style={{
              border: `2px solid ${colorEstado}`,
              color: colorEstado,
              padding: '0 8px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
            }}
          >
            {(i.estado.match(/^[A-ZÁÉÍÓÚ ]+\b/)?.[0] ?? i.estado).trim() || 'SIN ESTADO'}
          </span>
          <span style={{ opacity: 0.85 }}>
            {i.estado.replace(/^[A-ZÁÉÍÓÚ ]+\b/, '').replace(/^\s*\(|\)\s*$/g, '')}
          </span>
        </div>

        {i.necesitaCeo && (
          <div
            className="flex flex-col gap-1"
            style={{ borderLeft: `4px solid ${COLOR_AVISO}`, paddingLeft: 12 }}
          >
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: COLOR_AVISO }}>
              Necesita tu decisión
            </span>
            <span style={{ fontSize: '22px', whiteSpace: 'pre-wrap' }}>
              {conCodigo(i.decision || 'Escaló el pedido: mirá el informe.')}
            </span>
          </div>
        )}

        {seccionesDe(i.texto).map((s, k) => (
          <section key={k} className="flex flex-col gap-1">
            {s.titulo && (
              <span style={{ fontSize: '19px', fontWeight: 'bold', color: INFORME_TITULO }}>
                {s.titulo}
              </span>
            )}
            {s.parrafos.map((p, j) => (
              <p key={j} style={{ fontSize: '21px', margin: 0 }}>
                {conCodigo(p)}
              </p>
            ))}
            {s.vinetas.length > 0 && (
              <ul
                className="flex flex-col gap-1"
                style={{ fontSize: '21px', margin: 0, paddingLeft: 22, listStyle: 'disc' }}
              >
                {s.vinetas.map((v, j) => (
                  <li key={j}>{conCodigo(v)}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
