import { useEffect, useRef, useState } from 'react';

import {
  cartel,
  debeRecargar,
  MS_APAGADA,
  PRENDER_CADA_MS,
  PRENDER_DURANTE_MS,
  URL_PRENDER,
} from '../personal/reconexion.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import type { TransportState } from '../transport/types.js';
import { Button } from './ui/Button.js';

const LABELS = {
  conectando: 'Connecting…',
  reconectando: 'Reconnecting…',
} as const;

/** Personal: el transporte del navegador sabe reintentar ya (WebSocketTransport.retryNow). */
function reintentarYa(): void {
  const t = transport as { retryNow?: () => void };
  t.retryNow?.();
}

/**
 * Standalone connection status badge. Renders nothing while connected (the happy
 * path, and always in VS Code where the transport is permanently connected), so
 * it is invisible unless the WebSocket drops in standalone mode. Modeled on
 * VersionIndicator's absolute-overlay + pixel-panel convention.
 *
 * Personal: si la caída dura, "Oficina apagada" con "Prender"; al volver, la página se recarga (personal/reconexion.ts).
 */
export function ConnectionIndicator() {
  const [state, setState] = useState<TransportState>(transport.state);
  const [caidaDesde, setCaidaDesde] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [prendiendo, setPrendiendo] = useState(false);
  const yaConectada = useRef(transport.state === 'connected');
  const anterior = useRef<TransportState>(transport.state);

  useEffect(() => {
    // Re-read on mount in case the state changed before this subscribed.
    setState(transport.state);
    return transport.onStateChange(setState);
  }, []);

  useEffect(() => {
    const previo = anterior.current;
    anterior.current = state;
    if (isBrowserRuntime && debeRecargar(previo, state, yaConectada.current)) {
      window.location.reload();
      return;
    }
    if (state === 'connected') {
      yaConectada.current = true;
      setCaidaDesde(null);
      setPrendiendo(false);
    } else if (state === 'reconnecting') {
      setCaidaDesde((d) => d ?? Date.now());
    }
  }, [state]);

  // Mientras está caída, un reloj para pasar de "Reconnecting…" a "Oficina apagada".
  useEffect(() => {
    if (caidaDesde === null) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [caidaDesde]);

  // Después de "Prender": reintentar seguido un rato (el server tarda unos segundos en levantar).
  useEffect(() => {
    if (!prendiendo) return;
    const cada = setInterval(reintentarYa, PRENDER_CADA_MS);
    const fin = setTimeout(() => setPrendiendo(false), PRENDER_DURANTE_MS);
    return () => {
      clearInterval(cada);
      clearTimeout(fin);
    };
  }, [prendiendo]);

  const tipo = cartel(state, caidaDesde, Math.max(ahora, caidaDesde ?? 0));
  if (tipo === null) return null;

  if (tipo === 'apagada') {
    return (
      <div
        className="absolute top-8 left-1/2 -translate-x-1/2 z-20 pixel-panel py-6 px-12 flex items-center gap-10 text-sm"
        data-testid="oficina-apagada"
        title={`Sin conexión con el server hace más de ${MS_APAGADA / 1000} s. Se reconecta sola cuando vuelva.`}
      >
        <span className="w-8 h-8 rounded-full inline-block shrink-0 bg-status-error" />
        <span>{prendiendo ? 'Prendiendo la oficina…' : 'Oficina apagada'}</span>
        {isBrowserRuntime && !prendiendo && (
          <Button
            size="sm"
            onClick={() => {
              // El protocolo levanta el server sin abrir otra pestaña; esta se reconecta sola.
              window.location.href = URL_PRENDER;
              setPrendiendo(true);
              reintentarYa();
            }}
            title="Levanta Pixel Agents (la primera vez Chrome pregunta si abrir la aplicación)"
          >
            Prender
          </Button>
        )}
      </div>
    );
  }

  const dotClass = tipo === 'conectando' ? 'bg-status-permission' : 'bg-status-error';
  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 pixel-panel py-6 px-12 flex items-center gap-8 text-sm">
      <span className={`w-8 h-8 rounded-full inline-block shrink-0 ${dotClass} pixel-pulse`} />
      {LABELS[tipo]}
    </div>
  );
}
