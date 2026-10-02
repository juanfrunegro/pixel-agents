import { MAX_DELTA_TIME_SEC } from '../../constants.js';
import { avisarDibujado, tocaDibujar } from '../../personal/rendimiento.js';

/** @internal */
export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
  /** personal: cuadros por segundo deseados para el próximo cuadro (0 = sin tope). Ver personal/rendimiento.ts. */
  fps?: () => number;
}

export function startGameLoop(canvas: HTMLCanvasElement, callbacks: GameLoopCallbacks): () => void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  let lastTime = 0;
  let rafId = 0;
  let stopped = false;

  const frame = (time: number) => {
    if (stopped) return;
    rafId = requestAnimationFrame(frame);
    // personal: no dibujar más seguido de lo que hace falta (en reposo 10 fps en vez de 60–144)
    if (!tocaDibujar(time, lastTime, callbacks.fps?.() ?? 0)) return;
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC);
    lastTime = time;

    callbacks.update(dt);

    ctx.imageSmoothingEnabled = false;
    callbacks.render(ctx);
    avisarDibujado();
  };

  rafId = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}
