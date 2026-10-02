/**
 * Personal (copia de juanfrunegro), tanda 3: el panel de la pizarra del Brain (pendientes de cada proyecto y quién
 * trabaja ahora) y el menú chico de cada oficina ("Abrir carpeta" / "Abrir en VS Code" y, tanda 5, "Asignar proyecto ▸"
 * / "Dejar vacía"). Solo en el navegador.
 */
import { useEffect, useState } from 'react';

import { esOficinaLibre } from '../../../core/src/salasComunes.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { COLOR_AVISO, COLOR_SALA_SIN_COLOR, COLOR_VELO } from './colores.js';
import { nombreDe, usePersonal } from './personal.js';
import {
  cargarPizarra,
  cerrarComunicaciones,
  cerrarMenuSala,
  cerrarPizarra,
  opcionesAsignar,
  ORIGEN_TEXTO,
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
  const [asignando, setAsignando] = useState(false);
  /** "Otra carpeta…": null = cerrado; texto = lo que va escribiendo. */
  const [otra, setOtra] = useState<string | null>(null);

  useEffect(() => {
    if (!isBrowserRuntime) return;
    void cargarPizarra();
    const t = setInterval(() => void cargarPizarra(), REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'proyectoAbierto' && msg.type !== 'oficinaAsignada') return;
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
      cerrarComunicaciones();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // Cada vez que se abre (o cierra) el menú de una oficina, arranca sin la lista de proyectos desplegada.
  const menu = p.menu;
  useEffect(() => {
    setAsignando(false);
    setOtra(null);
  }, [menu]);

  if (!isBrowserRuntime) return null;
  const color = (sala: string) =>
    colores?.find((a) => a.label === sala)?.color ?? COLOR_SALA_SIN_COLOR;
  const cerrarMenu = () => {
    setAsignando(false);
    setOtra(null);
    cerrarMenuSala();
  };
  const asignar = (proyecto: string | null) => {
    transport.send({ type: 'asignarOficina', sala: p.menu!.sala, proyecto });
    cerrarMenu();
  };
  const asignarCarpeta = () => {
    const ruta = (otra ?? '').trim();
    if (!ruta) return;
    transport.send({ type: 'asignarOficina', sala: p.menu!.sala, proyecto: null, carpeta: ruta });
    cerrarMenu();
  };
  const libre = !!p.menu && esOficinaLibre(p.menu.sala);
  const opciones = p.menu
    ? opcionesAsignar(p.menu.sala, p.oficinas, p.disponibles, p.candidatos)
    : [];
  const asignable = !!p.menu && p.oficinas.some((o) => o.sala === p.menu!.sala);
  const estilo = { fontSize: '18px', cursor: 'pointer', textDecoration: 'underline' } as const;

  return (
    <>
      {p.menu && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 69 }}
            onClick={cerrarMenu}
            aria-hidden="true"
          />
          <div
            className="pixel-panel fixed flex flex-col gap-2 px-6 py-4"
            style={{
              left: Math.min(p.menu.x, window.innerWidth - 270),
              // Abajo de la pantalla el menú crece hacia arriba (si no, la barra de botones lo tapa).
              ...(p.menu.y > window.innerHeight / 2
                ? { bottom: Math.max(8, window.innerHeight - p.menu.y) }
                : { top: Math.max(8, p.menu.y) }),
              zIndex: 70,
              minWidth: 230,
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
            }}
            role="menu"
            aria-label={`Oficina ${p.menu.sala}`}
            data-testid="menu-oficina"
          >
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: color(p.menu.sala) }}>
              {libre ? 'Oficina libre' : p.menu.sala}
            </span>
            {!libre &&
              ACCIONES.map((a) => (
                <button
                  key={a.id}
                  role="menuitem"
                  className="text-left"
                  style={estilo}
                  onClick={() => {
                    transport.send({ type: 'abrirProyecto', sala: p.menu!.sala, accion: a.id });
                    cerrarMenu();
                  }}
                >
                  {a.texto}
                </button>
              ))}
            {asignable && !asignando && (
              <button
                role="menuitem"
                className="text-left"
                style={estilo}
                onClick={() => {
                  setAsignando(true);
                  // La lista se vuelve a leer ahora: un proyecto recién agregado a Orca o una carpeta nueva aparecen.
                  transport.send({ type: 'pedirOficinas' });
                }}
                data-testid="asignar-proyecto"
              >
                {libre ? 'Asignar proyecto ▸' : 'Cambiar proyecto ▸'}
              </button>
            )}
            {asignable && asignando && (
              <div className="flex flex-col gap-1" style={{ paddingLeft: 8 }}>
                {opciones.length === 0 && (
                  <span style={{ fontSize: '16px', opacity: 0.7 }}>
                    No hay otros proyectos ni carpetas.
                  </span>
                )}
                {opciones.map((o) => (
                  <button
                    key={o.proyecto}
                    role="menuitem"
                    className="text-left"
                    style={{ ...estilo, color: color(o.proyecto) }}
                    onClick={() => asignar(o.proyecto)}
                    title={
                      [o.ruta, o.intercambia ? 'Ya tiene oficina: las dos se intercambian' : '']
                        .filter(Boolean)
                        .join('\n') || undefined
                    }
                  >
                    {o.proyecto}
                    {(o.origen || o.intercambia) && (
                      <span style={{ fontSize: '15px', opacity: 0.6, textDecoration: 'none' }}>
                        {' '}
                        {[o.origen && ORIGEN_TEXTO[o.origen], o.intercambia && 'intercambia']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </button>
                ))}
                {otra === null ? (
                  <button
                    role="menuitem"
                    className="text-left"
                    style={{ ...estilo, opacity: 0.8 }}
                    onClick={() => setOtra('')}
                    data-testid="otra-carpeta"
                  >
                    Otra carpeta…
                  </button>
                ) : (
                  <form
                    className="flex flex-col gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      asignarCarpeta();
                    }}
                  >
                    <input
                      autoFocus
                      value={otra}
                      onChange={(e) => setOtra(e.target.value)}
                      placeholder="C:\Users\juanf\Documents\..."
                      aria-label="Ruta de la carpeta"
                      data-testid="otra-carpeta-ruta"
                      style={{
                        fontSize: '16px',
                        padding: '2px 6px',
                        minWidth: 300,
                        background: 'var(--color-bg-dark)',
                        color: 'var(--color-text)',
                        border: '2px solid var(--color-border)',
                      }}
                    />
                    <button
                      type="submit"
                      className="text-left"
                      style={estilo}
                      disabled={!otra.trim()}
                    >
                      Poner esta carpeta
                    </button>
                  </form>
                )}
              </div>
            )}
            {asignable && !libre && (
              <button
                role="menuitem"
                className="text-left"
                style={{ ...estilo, opacity: 0.8 }}
                onClick={() => asignar(null)}
              >
                Dejar vacía
              </button>
            )}
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
