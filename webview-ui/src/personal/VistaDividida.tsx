/**
 * Personal (copia de juanfrunegro): pantalla dividida. Dos vistas de la misma oficina, una al lado de la otra:
 * izquierda las salas y agentes de Windows (cuenta Pro), derecha los de WSL (cuenta Max). Cada mitad encuadra sola sus
 * salas. Es solo para mirar: el juego lo sigue moviendo el canvas principal, que queda debajo. Un clic en un agente
 * abre su ficha (y enfoca su terminal, como en la vista normal).
 */
import { useEffect, useRef } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import { renderFrame } from '../office/engine/renderer.js';
import type { Character } from '../office/types.js';
import { COLOR_DIVISOR, COLOR_ETIQUETA_TEXTO, COLOR_WINDOWS, COLOR_WSL } from './colores.js';
import {
  cajaDeSalas,
  encuadre,
  type Lado,
  type Ocupante,
  salasPorLado,
  usePantallaDividida,
} from './division.js';
import { esWsl } from './personal.js';

interface Props {
  officeState: OfficeState;
  onClick: (agentId: number) => void;
}

function salaDe(os: OfficeState, ch: Character): string | null {
  if (ch.seatId) {
    const z = os.seatZone(ch.seatId);
    if (z) return z;
  }
  const l = os.getLayout();
  return l.areaTiles?.[ch.tileRow * l.cols + ch.tileCol] ?? null;
}

const ladoDe = (ch: Character): Lado => (esWsl(ch.id) ? 'wsl' : 'windows');

function Mitad({ officeState: os, lado, onClick }: Props & { lado: Lado }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const vista = useRef({ offsetX: 0, offsetY: 0, zoom: 1 });
  const cuentaRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ajustar = () => {
      const r = cont.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(cont);

    let salas: string[] = [];
    let calculado = 0;
    let raf = 0;
    const cuadro = (t: number) => {
      raf = requestAnimationFrame(cuadro);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const layout = os.getLayout();
      const todos = [...os.characters.values()];
      if (t - calculado > 500) {
        calculado = t;
        const ocupantes: Ocupante[] = todos.map((ch) => ({
          lado: ladoDe(ch),
          sala: salaDe(os, ch),
        }));
        const todas = (layout.areas ?? []).map((a) => a.label);
        salas = salasPorLado(ocupantes, todas)[lado];
        if (cuentaRef.current) {
          const n = todos.filter((ch) => ladoDe(ch) === lado && !ch.isSubagent).length;
          cuentaRef.current.textContent = n === 1 ? '1 sesión' : `${n} sesiones`;
        }
      }
      const caja = cajaDeSalas(salas, layout.areaTiles, layout.cols, layout.rows);
      const { zoom, panX, panY } = encuadre(
        caja,
        canvas.width,
        canvas.height,
        layout.cols,
        layout.rows,
      );
      ctx.imageSmoothingEnabled = false;
      const { offsetX, offsetY } = renderFrame(
        ctx,
        canvas.width,
        canvas.height,
        os.tileMap,
        os.furniture,
        todos.filter((ch) => ladoDe(ch) === lado),
        zoom,
        panX,
        panY,
        undefined,
        undefined,
        layout.tileColors,
        layout.cols,
        layout.rows,
        layout.carpetTiles,
        layout.areas,
        layout.areaTiles,
        true,
        null,
        os.pets,
      );
      vista.current = { offsetX, offsetY, zoom };
    };
    raf = requestAnimationFrame(cuadro);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [os, lado]);

  const color = lado === 'wsl' ? COLOR_WSL : COLOR_WINDOWS;
  return (
    <div ref={contRef} className="relative h-full" style={{ flex: 1, minWidth: 0 }}>
      <canvas
        ref={canvasRef}
        className="block"
        onClick={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const r = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const { offsetX, offsetY, zoom } = vista.current;
          const x = ((e.clientX - r.left) * dpr - offsetX) / zoom;
          const y = ((e.clientY - r.top) * dpr - offsetY) / zoom;
          const id = os.getCharacterAt(x, y);
          const ch = id !== null ? os.characters.get(id) : undefined;
          if (id !== null && ch && ladoDe(ch) === lado) {
            os.selectedAgentId = id;
            onClick(id);
          } else {
            os.selectedAgentId = null;
          }
        }}
      />
      <div
        className="absolute pixel-panel px-8 py-2 pointer-events-none"
        style={{ left: 10, top: 10, borderColor: color, fontSize: '20px' }}
      >
        <span
          style={{
            background: color,
            color: COLOR_ETIQUETA_TEXTO,
            padding: '0 6px',
            marginRight: 8,
          }}
        >
          {lado === 'wsl' ? 'WSL' : 'Windows'}
        </span>
        {lado === 'wsl' ? 'cuenta Max' : 'cuenta Pro'} · <span ref={cuentaRef}>…</span>
      </div>
    </div>
  );
}

export function VistaDividida({ officeState, onClick }: Props) {
  const activa = usePantallaDividida();
  if (!activa) return null;
  return (
    <div
      className="absolute inset-0 flex"
      style={{ zIndex: 15, background: 'var(--color-bg-dark)' }}
      data-testid="pantalla-dividida"
    >
      <Mitad officeState={officeState} lado="windows" onClick={onClick} />
      <div style={{ width: 4, background: COLOR_DIVISOR }} />
      <Mitad officeState={officeState} lado="wsl" onClick={onClick} />
    </div>
  );
}
