/**
 * Personal (copia de juanfrunegro): ficha del agente seleccionado (clic en un personaje). Muestra nombre de fantasía
 * (editable), nombre interno, proyecto, modelo, esfuerzo, objetivo, estado, tiempo, costo, quién lo lanzó y sus últimas
 * acciones (para chusmear qué estuvo haciendo sin abrir la terminal).
 */
import { useEffect, useState } from 'react';

import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { transport } from '../transport/index.js';
import { COLOR_WINDOWS, COLOR_WSL } from './colores.js';
import { InterruptorVoz } from './Comunicaciones.js';
import {
  claveDe,
  colorModelo,
  costoDe,
  deployDe,
  despiertaA,
  dormidoDe,
  esDescartable,
  esWsl,
  etiquetaModelo,
  historialDe,
  humoDe,
  inicioDe,
  metaDe,
  modeloDe,
  nombreDe,
  padreDe,
  presentandoDe,
  usePersonal,
  vozDe,
} from './personal.js';
import { skinDe } from './skins.js';

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

/** "ahora", "hace 40 s", "hace 3 min", "hace 2 h" */
function hace(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 5) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

/** Cuántas acciones muestra la ficha. */
const ACCIONES_EN_FICHA = 6;

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
  const skin = skinDe(ch);
  const clave = claveDe(id);
  const pasos = historialDe(id);
  const interno = ch.agentName ? 'compañero de equipo' : meta ? meta.t : 'sesión principal (CEO)';
  const proyecto = ch.folderName || chPadre?.folderName || '—';
  const vuelve = despiertaA(id);
  const estado = dormidoDe(id)
    ? `dormido, sin tokens${vuelve ? ` (vuelve ${vuelve.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})` : ''}`
    : ch.bubbleType === 'permission'
      ? 'Esperando tu permiso'
      : presentandoDe(id)
        ? 'presentando: terminó y te avisó por voz'
        : ch.isActive
          ? 'trabajando'
          : 'en pausa';
  const avisos = [
    deployDe(id) && 'deployando',
    humoDe(id) && 'varios errores seguidos',
    vozDe(id) && 'te va a avisar por voz al terminar',
  ].filter(Boolean);

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
        {skin && (
          // tanda 5: skin de Marvel (solo estética): el primer cuadro mirando de frente, al doble
          <span
            title={`Skin de ${skin}`}
            data-testid="ficha-skin"
            style={{
              width: 32,
              height: 64,
              display: 'inline-block',
              backgroundImage: `url(./assets/marvel/${skin}.png)`,
              backgroundSize: '224px 192px',
              backgroundPosition: '0 0',
              imageRendering: 'pixelated',
            }}
          />
        )}
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
      <Fila etiqueta="Dónde corre">
        <span style={{ color: esWsl(id) ? COLOR_WSL : COLOR_WINDOWS, fontWeight: 'bold' }}>
          {esWsl(id) ? 'WSL · cuenta Max' : 'Windows · cuenta Pro'}
        </span>
      </Fila>
      <Fila etiqueta="Modelo">
        {etiquetaModelo(modelo)}
        {meta?.m === 'hereda' ? ' (del que lo lanzó)' : ''}
        {meta?.e ? ` · esfuerzo ${meta.e}` : ''}
      </Fila>
      {sub?.label && <Fila etiqueta="Objetivo">{sub.label}</Fila>}
      <Fila etiqueta="Estado">{estado}</Fila>
      {avisos.length > 0 && <Fila etiqueta="Ojo">{avisos.join(' · ')}</Fila>}
      {padre === null && !ch.isSubagent && (
        <Fila etiqueta="Voz">
          <InterruptorVoz id={id} />
        </Fila>
      )}
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
      {pasos.length > 0 && (
        <div className="flex flex-col gap-2" style={{ marginTop: 4 }} data-testid="ficha-historial">
          <span style={{ fontSize: '18px', opacity: 0.65 }}>Últimas acciones</span>
          {pasos.slice(0, ACCIONES_EN_FICHA).map((p, i) => (
            <div
              key={`${p.t}-${i}`}
              className="flex gap-6"
              style={{ fontSize: '16px', lineHeight: 1.1, opacity: i === 0 ? 1 : 0.8 }}
            >
              <span style={{ opacity: 0.6, minWidth: 74 }}>{hace(p.t)}</span>
              <span
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ maxWidth: 270 }}
              >
                {p.texto}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
