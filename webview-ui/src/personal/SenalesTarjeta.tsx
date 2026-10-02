/**
 * Personal (copia de juanfrunegro): las señales de la tanda 2 dentro de la tarjeta flotante del agente. La tarjeta
 * (DOM) tapa la cabeza del personaje, así que la mano levantada, el humo y el deploy dibujados en el canvas no se verían:
 * acá van como íconos pixelados al costado del nombre. El canvas los sigue dibujando para cuando la tarjeta no está
 * (cafetería, tarjetas apagadas). Qué señales lleva cada agente: senales.ts.
 */
import { MANO, NUBE } from './burbujas.js';
import { COLOR_LUZ_DEPLOY } from './colores.js';
import { type Senal, spriteUrl } from './senales.js';

export function SenalesTarjeta({ senales }: { senales: Senal[] }) {
  if (senales.length === 0) return null;
  return (
    <div className="flex items-center gap-3 shrink-0">
      {senales.map((s) =>
        s.clave === 'deploy' ? (
          <span
            key={s.clave}
            title={s.titulo}
            className="pixel-pulse leading-none"
            style={{ fontSize: '16px', color: COLOR_LUZ_DEPLOY, fontWeight: 'bold' }}
          >
            ▲
          </span>
        ) : (
          <img
            key={s.clave}
            src={spriteUrl(s.clave === 'permiso' ? MANO : NUBE)}
            alt={s.titulo}
            title={s.titulo}
            className={s.clave === 'permiso' ? 'senal-mano' : 'senal-humo'}
            style={{ imageRendering: 'pixelated', height: s.clave === 'permiso' ? 26 : 18 }}
          />
        ),
      )}
    </div>
  );
}
