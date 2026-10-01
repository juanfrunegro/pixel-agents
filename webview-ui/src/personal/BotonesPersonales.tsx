/**
 * Personal (copia de juanfrunegro): botones "Organigrama" y "Apagar" de la barra de abajo (solo en el navegador).
 * Apagar pide confirmación con un segundo clic y apaga el servidor; se vuelve a abrir solo con el próximo agente.
 */
import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';

export function BotonesPersonales() {
  const [confirmar, setConfirmar] = useState(false);
  const [apagado, setApagado] = useState(false);
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
