/**
 * Personal (copia de juanfrunegro): título de la pestaña con lo que pasa y recuadro "Mirá" con quién necesita
 * atención. Ver atencion.ts.
 */
import { useEffect, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import {
  type Motivo,
  resumenAtencion,
  TEXTO_MOTIVO,
  TITULO_BASE,
  tituloPestana,
} from './atencion.js';
import { COLOR_HUMO_CLARO, COLOR_LUZ_DEPLOY, COLOR_MANO } from './colores.js';
import { deployDe, dormidoDe, enUso, humoDe, nombreDe, usePersonal } from './personal.js';

const COLOR: Record<Motivo, string> = {
  permiso: COLOR_MANO,
  humo: COLOR_HUMO_CLARO,
  deploy: COLOR_LUZ_DEPLOY,
};
const ICONO: Record<Motivo, string> = { permiso: '✋', humo: '💨', deploy: '▲' };
/** El título y el recuadro se recalculan una vez por segundo: no hace falta más para mirarlo de reojo. */
const REFRESCO_MS = 1000;

export function PanelAtencion({ officeState }: { officeState: OfficeState }) {
  usePersonal();
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESCO_MS);
    return () => {
      clearInterval(t);
      document.title = TITULO_BASE;
    };
  }, []);

  const r = resumenAtencion(officeState.characters.values(), {
    enUso: (ch) => enUso(ch),
    dormido: (id) => dormidoDe(id),
    humo: (id) => humoDe(id),
    deploy: (id) => deployDe(id),
  });
  const titulo = tituloPestana(r);
  useEffect(() => {
    if (document.title !== titulo) document.title = titulo;
  }, [titulo]);

  if (r.items.length === 0) return null;

  const enfocar = (id: number) => {
    officeState.selectedAgentId = id;
    officeState.cameraFollowId = id;
  };

  return (
    <div
      className="pixel-panel absolute flex flex-col gap-2 px-8 py-6"
      style={{ left: 60, top: 10, zIndex: 55, maxWidth: 320 }}
      data-testid="atencion"
      onClick={(e) => e.stopPropagation()}
    >
      <span style={{ fontSize: '16px', opacity: 0.65 }}>Mirá</span>
      {r.items.slice(0, 6).map((it) => {
        const ch = officeState.characters.get(it.id);
        const proyecto = ch?.folderName ? ` · ${ch.folderName}` : '';
        return (
          <button
            key={`${it.id}-${it.motivo}`}
            className="flex gap-6 text-left"
            style={{ fontSize: '18px', lineHeight: 1.1, cursor: 'pointer' }}
            onClick={() => enfocar(it.id)}
            title="Centrar la cámara en este agente y abrir su ficha"
          >
            <span style={{ color: COLOR[it.motivo], minWidth: 18 }}>{ICONO[it.motivo]}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {ch?.agentName || nombreDe(it.id)}
              {proyecto} — {TEXTO_MOTIVO[it.motivo]}
            </span>
          </button>
        );
      })}
      {r.items.length > 6 && (
        <span style={{ fontSize: '16px', opacity: 0.65 }}>y {r.items.length - 6} más</span>
      )}
    </div>
  );
}
