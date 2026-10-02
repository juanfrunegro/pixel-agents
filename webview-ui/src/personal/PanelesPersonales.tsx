/**
 * Personal (copia de juanfrunegro), tanda 3: el panel de la pizarra del Brain (pendientes de cada proyecto y quién
 * trabaja ahora) y el menú chico de cada oficina ("Abrir carpeta" / "Abrir en VS Code"). Solo en el navegador.
 */
import { useEffect, useState } from 'react';

import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { COLOR_AVISO, COLOR_SALA_SIN_COLOR, COLOR_VELO } from './colores.js';
import { nombreDe, usePersonal } from './personal.js';
import {
  cargarPizarra,
  cerrarMenuSala,
  cerrarPizarra,
  REFRESCO_MS,
  usePizarra,
} from './pizarra.js';

const ACCIONES: Array<{ id: 'carpeta' | 'vscode'; texto: string }> = [
  { id: 'carpeta', texto: 'Abrir carpeta' },
  { id: 'vscode', texto: 'Abrir en VS Code' },
];

export function PanelesPersonales({
  colores,
}: {
  colores: Array<{ label: string; color: string }> | undefined;
}) {
  const p = usePizarra();
  usePersonal(); // nombres de los agentes
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!isBrowserRuntime) return;
    void cargarPizarra();
    const t = setInterval(() => void cargarPizarra(), REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'proyectoAbierto') return;
        setAviso(msg.error ?? null);
        if (msg.error) setTimeout(() => setAviso(null), 5000);
      }),
    [],
  );

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      cerrarPizarra();
      cerrarMenuSala();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  if (!isBrowserRuntime) return null;
  const color = (sala: string) =>
    colores?.find((a) => a.label === sala)?.color ?? COLOR_SALA_SIN_COLOR;

  return (
    <>
      {p.menu && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 69 }}
            onClick={cerrarMenuSala}
            aria-hidden="true"
          />
          <div
            className="pixel-panel fixed flex flex-col gap-2 px-6 py-4"
            style={{
              left: Math.min(p.menu.x, window.innerWidth - 230),
              top: Math.min(p.menu.y, window.innerHeight - 140),
              zIndex: 70,
              minWidth: 210,
            }}
            role="menu"
            aria-label={`Oficina ${p.menu.sala}`}
            data-testid="menu-oficina"
          >
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: color(p.menu.sala) }}>
              {p.menu.sala}
            </span>
            {ACCIONES.map((a) => (
              <button
                key={a.id}
                role="menuitem"
                className="text-left"
                style={{ fontSize: '18px', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => {
                  transport.send({ type: 'abrirProyecto', sala: p.menu!.sala, accion: a.id });
                  cerrarMenuSala();
                }}
              >
                {a.texto}
              </button>
            ))}
          </div>
        </>
      )}
      {aviso && (
        <div
          className="pixel-panel fixed px-8 py-4"
          style={{
            left: '50%',
            top: 12,
            transform: 'translateX(-50%)',
            zIndex: 71,
            fontSize: '18px',
          }}
          role="status"
        >
          {aviso}
        </div>
      )}
      {p.abierta && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 69, background: COLOR_VELO }}
            onClick={cerrarPizarra}
            aria-hidden="true"
          />
          <div
            className="pixel-panel fixed flex flex-col gap-4 px-10 py-8"
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
            aria-label="Pendientes de cada proyecto"
            data-testid="panel-pizarra"
          >
            <div className="flex items-center gap-6">
              <span style={{ fontSize: '26px', fontWeight: 'bold' }}>
                Pendientes de cada proyecto
              </span>
              <button
                style={{
                  marginLeft: 'auto',
                  fontSize: '18px',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
                onClick={cerrarPizarra}
              >
                cerrar
              </button>
            </div>
            <span style={{ fontSize: '16px', opacity: 0.75 }}>
              Los PENDIENTES.md de cada proyecto, como en el radar. Se actualiza cada minuto.
            </span>
            {p.error && <span style={{ fontSize: '16px', color: COLOR_AVISO }}>{p.error}</span>}
            {p.filas.map((f) => {
              const gente = p.gente.get(f.sala) ?? [];
              return (
                <div
                  key={f.sala}
                  className="flex flex-col gap-1"
                  style={{ borderLeft: `6px solid ${color(f.sala)}`, paddingLeft: 10 }}
                >
                  <div className="flex items-baseline gap-6" style={{ flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: color(f.sala) }}>
                      {f.sala}
                    </span>
                    <span style={{ fontSize: '18px' }}>
                      {f.archivo === null
                        ? 'sin PENDIENTES.md'
                        : `${f.abiertos} ${f.abiertos === 1 ? 'pendiente' : 'pendientes'} · ${f.ideas} ${
                            f.ideas === 1 ? 'idea' : 'ideas'
                          } · ${f.hechos} ${f.hechos === 1 ? 'hecho' : 'hechos'}`}
                    </span>
                  </div>
                  {f.primeros.length > 0 && (
                    <ul style={{ fontSize: '17px', margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
                      {f.primeros.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  )}
                  <span style={{ fontSize: '16px', opacity: 0.8 }}>
                    {gente.length > 0
                      ? `Trabajando ahora: ${gente.map((id) => nombreDe(id)).join(', ')}`
                      : 'Nadie trabajando ahora'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
