/**
 * Personal (copia de juanfrunegro): botones "Recargar", filtro "Todos | Windows | WSL", "Organigrama", "Hoy" (resumen del
 * día) y "Apagar" de la barra de abajo, y el cupo de cada cuenta (solo en el navegador). Recargar vuelve a armar las salas con los proyectos de Orca sin reiniciar el servidor y recarga la
 * página. Apagar pide confirmación con un segundo clic y apaga el servidor; se vuelve a abrir solo con el próximo
 * agente.
 */
import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { COLOR_AVISO, COLOR_WINDOWS, COLOR_WSL } from './colores.js';
import { setFiltroSistema, type Sistema, useFiltroSistema } from './filtro.js';
import { type Cuenta, cupoPorCuenta, textoCupo, usePersonal } from './personal.js';

const CUENTAS: Array<{ id: Cuenta; texto: string; color: string }> = [
  { id: 'windows', texto: 'Windows', color: COLOR_WINDOWS },
  { id: 'wsl', texto: 'WSL', color: COLOR_WSL },
];

/**
 * Cupo de cada cuenta. Claude Code no dice cuánto queda (solo avisa cuando se acabó), así que no hay barra: OK, o sin
 * cupo hasta la hora de vuelta. Se recalcula cada 30 s para que vuelva a OK solo.
 */
function Cupos() {
  usePersonal();
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const cupo = cupoPorCuenta();
  return (
    <span
      className="flex items-center gap-8 px-6 text-lg"
      style={{ whiteSpace: 'nowrap' }}
      data-testid="cupos"
      title="Cupo de cada cuenta: Claude Code solo avisa cuando se acaba, no cuánto queda"
    >
      {CUENTAS.map((c) => (
        <span key={c.id} style={{ color: cupo[c.id].sinCupo ? COLOR_AVISO : undefined }}>
          <span style={{ color: c.color, fontWeight: 'bold' }}>{c.texto}:</span>{' '}
          {textoCupo(cupo[c.id])}
        </span>
      ))}
    </span>
  );
}

const SISTEMAS: Array<{ id: Sistema; texto: string; title: string }> = [
  { id: 'todos', texto: 'Todos', title: 'Ver todos los agentes con su color' },
  { id: 'windows', texto: 'Windows', title: 'Resaltar los de Windows (los de WSL se apagan)' },
  { id: 'wsl', texto: 'WSL', title: 'Resaltar los de WSL (los de Windows se apagan)' },
];

export function BotonesPersonales() {
  const [confirmar, setConfirmar] = useState(false);
  const [apagado, setApagado] = useState(false);
  const [recarga, setRecarga] = useState<'no' | 'pidiendo' | 'error'>('no');
  const filtro = useFiltroSistema();
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'oficinaRecargada') return;
        if (msg.error) {
          console.error('[Pixel Agents] Recargar:', msg.error);
          setRecarga('error');
          setTimeout(() => setRecarga('no'), 4000);
        } else {
          window.location.reload(); // plano y salas nuevos: la página los pide de nuevo al conectar
        }
      }),
    [],
  );
  if (!isBrowserRuntime) return null;
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  if (apagado) {
    return (
      <span className="pixel-panel px-8 py-4" style={{ fontSize: '18px' }}>
        Pixel apagado. Se vuelve a abrir solo cuando arranque un agente.
      </span>
    );
  }
  return (
    <>
      <Button
        onClick={() => {
          setRecarga('pidiendo');
          transport.send({ type: 'recargarOficina' });
        }}
        title="Vuelve a armar las salas con tus proyectos de Orca, sin apagar Pixel"
      >
        {recarga === 'pidiendo' ? 'Recargando…' : recarga === 'error' ? 'No se pudo' : 'Recargar'}
      </Button>
      {SISTEMAS.map((s) => (
        <Button
          key={s.id}
          variant={filtro === s.id ? 'active' : 'default'}
          onClick={() => setFiltroSistema(s.id)}
          title={s.title}
        >
          {s.texto}
        </Button>
      ))}
      <Button
        onClick={() =>
          window.open(`/organigrama?token=${encodeURIComponent(token)}`, '_blank', 'noopener')
        }
        title="Ver el organigrama de agentes"
      >
        Organigrama
      </Button>
      <Button
        onClick={() => window.open(`/hoy?token=${encodeURIComponent(token)}`, '_blank', 'noopener')}
        title="Cuánto trabajó hoy cada proyecto y cada agente, y cuánto costó"
      >
        Hoy
      </Button>
      <Button
        variant={confirmar ? 'active' : 'default'}
        onClick={() => {
          if (!confirmar) {
            setConfirmar(true);
            setTimeout(() => setConfirmar(false), 4000);
            return;
          }
          transport.send({ type: 'shutdownServer' });
          setApagado(true);
        }}
        title="Apaga Pixel Agents para que no gaste memoria"
      >
        {confirmar ? '¿Apagar? (clic de nuevo)' : 'Apagar'}
      </Button>
      <Cupos />
    </>
  );
}
