/**
 * Personal (copia de juanfrunegro): la pestaña recuerda el token de la oficina.
 *
 * Los permisos (Recargar, Apagar, Organigrama, Hoy, la voz) dependen de `?token=` en la dirección. Si la oficina se
 * abre sin él (dirección escrita a mano, favorito o historial sin el token), todo eso falla con "Falta el token de la
 * oficina". El token es estable entre reinicios (server/src/personal/tokenEstable.ts), así que alcanza con guardarlo
 * la primera vez que la pestaña se abre bien y reponerlo en la dirección cuando falte.
 *
 * Se importa primero en main.tsx: tiene que correr antes de que transport/index.ts lea la dirección.
 */

export const CLAVE_TOKEN = 'pixel-agents.token';

/** Qué hacer con la dirección y lo guardado. Puro, para los tests. */
export function resolverToken(
  search: string,
  guardado: string | null,
): { token: string | null; guardar: string | null; search: string | null } {
  const params = new URLSearchParams(search);
  const enUrl = params.get('token');
  if (enUrl) return { token: enUrl, guardar: enUrl === guardado ? null : enUrl, search: null };
  if (!guardado) return { token: null, guardar: null, search: null };
  params.set('token', guardado);
  return { token: guardado, guardar: null, search: `?${params.toString()}` };
}

export function restaurarToken(): void {
  if (typeof window === 'undefined') return;
  let guardado: string | null = null;
  try {
    guardado = window.localStorage.getItem(CLAVE_TOKEN);
  } catch {
    // sin almacenamiento (modo privado o bloqueado): la pestaña sigue como antes
  }
  const r = resolverToken(window.location.search, guardado);
  if (r.guardar) {
    try {
      window.localStorage.setItem(CLAVE_TOKEN, r.guardar);
    } catch {
      // idem
    }
  }
  if (r.search) {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${r.search}${window.location.hash}`,
    );
  }
}

restaurarToken();
