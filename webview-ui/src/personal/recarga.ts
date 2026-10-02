/**
 * Personal (copia de juanfrunegro): pedidos al server que esperan respuesta (Recargar) con plazo. Antes, si el server
 * no contestaba (pestaña sin token, server caído o reiniciándose), el botón quedaba en "Recargando…" para siempre.
 */

export type Resultado =
  | { ok: true }
  | { ok: false; motivo: 'plazo' | 'desconectada' | 'permiso' | 'error'; detalle?: string };

/** Texto corto del botón para un resultado fallido. */
export function textoFalla(r: Exclude<Resultado, { ok: true }>): string {
  switch (r.motivo) {
    case 'plazo':
      return 'Sin respuesta';
    case 'desconectada':
      return 'Oficina desconectada';
    case 'permiso':
      return 'Sin permiso';
    default:
      return 'No se pudo';
  }
}

/** Clasifica el `error` que manda el server en `oficinaRecargada`. */
export function resultadoDeError(error: unknown): Resultado {
  if (!error) return { ok: true };
  const detalle = String(error);
  return { ok: false, motivo: /permiso/i.test(detalle) ? 'permiso' : 'error', detalle };
}

/**
 * Envía un pedido y llama a `alTerminar` UNA sola vez: con la respuesta, o con 'plazo' si no llega a tiempo, o con
 * 'desconectada' si no hay conexión. Devuelve una función para cancelar (desmontaje).
 */
export function pedirConPlazo(opts: {
  conectada: boolean;
  enviar: () => void;
  escuchar: (cb: (r: Resultado) => void) => () => void;
  plazoMs: number;
  alTerminar: (r: Resultado) => void;
}): () => void {
  if (!opts.conectada) {
    opts.alTerminar({ ok: false, motivo: 'desconectada' });
    return () => {};
  }
  let listo = false;
  let dejar = (): void => {};
  const terminar = (r: Resultado): void => {
    if (listo) return;
    listo = true;
    clearTimeout(t);
    dejar();
    opts.alTerminar(r);
  };
  const t = setTimeout(() => terminar({ ok: false, motivo: 'plazo' }), opts.plazoMs);
  dejar = opts.escuchar(terminar);
  opts.enviar();
  return () => {
    listo = true;
    clearTimeout(t);
    dejar();
  };
}
