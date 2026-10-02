/**
 * Personal (copia de juanfrunegro): ficha del agente seleccionado (clic en un personaje). Muestra nombre de fantasía
 * (editable), nombre interno, proyecto, modelo, esfuerzo, objetivo, estado, tiempo, costo y quién lo lanzó.
 */
import { useEffect, useState } from 'react';

import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { transport } from '../transport/index.js';
import {
  claveDe,
  colorModelo,
  costoDe,
  despiertaA,
  dormidoDe,
  esDescartable,
  etiquetaModelo,
  inicioDe,
  metaDe,
  modeloDe,
  nombreDe,
  padreDe,
  usePersonal,
} from './personal.js';

interface Props {
  officeState: OfficeState;
  subagentCharacters: SubagentCharacter[];
}

function duracion(desde: number | undefined): string {
  if (!desde) return '—';
  const s = Math.max(0, Math.round((Date.now() - desde) / 1000));
  return s < 60
    ? `${s} s`
    : s < 3600
      ? `${Math.floor(s / 60)} min ${s % 60} s`
      : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-6" style={{ fontSize: '18px', lineHeight: 1.15 }}>
      <span style={{ opacity: 0.65, minWidth: 92 }}>{etiqueta}</span>
      <span className="overflow-hidden text-ellipsis" style={{ maxWidth: 260 }}>
        {children}
      </span>
    </div>
  );
}

export function FichaAgente({ officeState, subagentCharacters }: Props) {
  usePersonal();
  const [, setTick] = useState(0);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const id = officeState.selectedAgentId;
  const ch = id !== null ? officeState.characters.get(id) : undefined;
  useEffect(() => setEditando(false), [id]);
  if (id === null || !ch) return null;

  const meta = metaDe(id);
  const padre = padreDe(id);
  const chPadre = padre !== null ? officeState.characters.get(padre) : undefined;
  const sub = subagentCharacters.find((s) => s.id === id);
  const modelo = modeloDe(id);
  const costo = costoDe(id);
  const nombre = ch.agentName || nombreDe(id);
  const clave = claveDe(id);
  const interno = ch.agentName ? 'compañero de equipo' : meta ? meta.t : 'sesión principal (CEO)';
  const proyecto = ch.folderName || chPadre?.folderName || '—';
  const vuelve = despiertaA(id);
  const estado = dormidoDe(id)
    ? `dormido, sin tokens${vuelve ? ` (vuelve ${vuelve.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})` : ''}`
    : ch.bubbleType === 'permission'
      ? 'espera tu permiso'
      : ch.isActive
        ? 'trabajando'
        : 'en pausa';

  const guardar = () => {
    transport.send({ type: 'renameAgent', clave, nombre: borrador });
    setEditando(false);
  };

  return (
    <div
      className="pixel-panel absolute flex flex-col gap-4 px-10 py-8"
      style={{ right: 12, top: 12, zIndex: 60, minWidth: 300, maxWidth: 380 }}
      data-testid="ficha-agente"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-6">
        <span
          style={{
            width: 12,
            height: 12,
            background: colorModelo(modelo),
            display: 'inline-block',
          }}
        />
        {editando ? (
          <input
            autoFocus
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape') setEditando(false);
            }}
            style={{
              fontSize: '22px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid currentColor',
              width: 220,
            }}
            aria-label="Nombre de fantasía"
          />
        ) : (
          <span style={{ fontSize: '24px', fontWeight: 'bold', color: colorModelo(modelo) }}>
            {nombre}
          </span>
        )}
        {!ch.agentName && (
          <button
            style={{
              fontSize: '16px',
              marginLeft: 'auto',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
            onClick={() => (editando ? guardar() : (setBorrador(nombre), setEditando(true)))}
            title={
              esDescartable(id)
                ? 'Le da nombre fijo a este tipo de agente'
                : 'Cambia el nombre de este tipo de agente'
            }
          >
            {editando ? 'guardar' : 'editar nombre'}
          </button>
        )}
      </div>
      <Fila etiqueta="Interno">{interno}</Fila>
      <Fila etiqueta="Proyecto">{proyecto}</Fila>
      <Fila etiqueta="Modelo">
        {etiquetaModelo(modelo)}
        {meta?.m === 'hereda' ? ' (del que lo lanzó)' : ''}
        {meta?.e ? ` · esfuerzo ${meta.e}` : ''}
      </Fila>
      {sub?.label && <Fila etiqueta="Objetivo">{sub.label}</Fila>}
      <Fila etiqueta="Estado">{estado}</Fila>
      <Fila etiqueta="En la oficina">{duracion(inicioDe(id))}</Fila>
      {costo !== undefined && (
        <Fila etiqueta="Costo">US$ {costo.toFixed(2)} (equivalente API)</Fila>
      )}
      {padre !== null && (
        <Fila etiqueta="Lo lanzó">
          {nombreDe(padre)}
          {chPadre?.folderName ? ` · ${chPadre.folderName}` : ''}
        </Fila>
      )}
    </div>
  );
}
