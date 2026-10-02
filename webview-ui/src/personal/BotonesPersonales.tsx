/**
 * Personal (copia de juanfrunegro): botones "Recargar", "Organigrama" y "Apagar" de la barra de abajo (solo en el
 * navegador). Recargar vuelve a armar las salas con los proyectos de Orca sin reiniciar el servidor y recarga la
 * página. Apagar pide confirmación con un segundo clic y apaga el servidor; se vuelve a abrir solo con el próximo
 * agente.
 */
import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';

export function BotonesPersonales() {
  const [confirmar, setConfirmar] = useState(false);
  const [apagado, setApagado] = useState(false);
  const [recarga, setRecarga] = useState<'no' | 'pidiendo' | 'error'>('no');
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
      <Button
        onClick={() =>
          window.open(`/organigrama?token=${encodeURIComponent(token)}`, '_blank', 'noopener')
        }
        title="Ver el organigrama de agentes"
      >
        Organigrama
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
    </>
  );
}
