import { describe, expect, it } from 'vitest';

import { CharacterState } from '../src/office/types.js';
import {
  _cantidadOyentes,
  alDibujar,
  avisarDibujado,
  type ClavePiso,
  FPS_LIBRE,
  FPS_MOVIMIENTO,
  FPS_REPOSO,
  fpsObjetivo,
  INTERACCION_MS,
  mismaClave,
  tocaDibujar,
} from '../src/personal/rendimiento.js';

const quieto = { state: CharacterState.TYPE, matrixEffect: null };
const caminando = { state: CharacterState.WALK, matrixEffect: null };
const base = { editando: false, camaraMoviendose: false, msDesdeInteraccion: 60_000 };

describe('cuadros por segundo según la escena', () => {
  it('en reposo (tipeando, sentados) dibuja a 10 fps', () => {
    expect(fpsObjetivo({ ...base, personajes: [quieto, quieto] })).toBe(FPS_REPOSO);
  });

  it('si alguien camina, aparece/desaparece o se movió el mouse hace poco, 30 fps', () => {
    expect(fpsObjetivo({ ...base, personajes: [quieto, caminando] })).toBe(FPS_MOVIMIENTO);
    expect(
      fpsObjetivo({ ...base, personajes: [{ state: CharacterState.IDLE, matrixEffect: 'spawn' }] }),
    ).toBe(FPS_MOVIMIENTO);
    expect(fpsObjetivo({ ...base, personajes: [], msDesdeInteraccion: INTERACCION_MS - 1 })).toBe(
      FPS_MOVIMIENTO,
    );
    expect(fpsObjetivo({ ...base, personajes: [], mascotas: [{ state: 'follow' }] })).toBe(
      FPS_MOVIMIENTO,
    );
  });

  it('cámara en movimiento o editor: sin tope', () => {
    expect(fpsObjetivo({ ...base, camaraMoviendose: true, personajes: [] })).toBe(FPS_LIBRE);
    expect(fpsObjetivo({ ...base, editando: true, personajes: [] })).toBe(FPS_LIBRE);
  });

  it('con un monitor de 60 Hz, 10 fps dibuja uno de cada 6 cuadros y 30 fps uno de cada 2', () => {
    const contar = (fps: number) => {
      let ultimo = 0;
      let n = 0;
      for (let i = 1; i <= 60; i++) {
        const t = i * (1000 / 60);
        if (tocaDibujar(t, ultimo, fps)) {
          ultimo = t;
          n++;
        }
      }
      return n;
    };
    expect(contar(FPS_REPOSO)).toBe(10);
    expect(contar(FPS_MOVIMIENTO)).toBe(30);
    expect(contar(FPS_LIBRE)).toBe(60);
  });
});

describe('aviso de cuadro dibujado', () => {
  it('avisa a los oyentes y deja de avisar al desuscribirse (sin acumular)', () => {
    let n = 0;
    const antes = _cantidadOyentes();
    const salir = alDibujar(() => n++);
    avisarDibujado();
    avisarDibujado();
    salir();
    avisarDibujado();
    expect(n).toBe(2);
    expect(_cantidadOyentes()).toBe(antes);
  });
});

describe('piso cacheado', () => {
  const clave = (o: Partial<ClavePiso> = {}): ClavePiso => ({
    tileMap: 'T',
    tileColors: 'C',
    carpetTiles: 'A',
    zoom: 2,
    cols: 10,
    rows: 5,
    spritesListos: 'truetrue',
    ...o,
  });

  it('se rehace si cambia el plano, los colores, el zoom o terminan de cargar los sprites', () => {
    expect(mismaClave(clave(), clave())).toBe(true);
    expect(mismaClave(null, clave())).toBe(false);
    expect(mismaClave(clave(), clave({ tileMap: 'otro' }))).toBe(false);
    expect(mismaClave(clave(), clave({ tileColors: 'otro' }))).toBe(false);
    expect(mismaClave(clave(), clave({ zoom: 3 }))).toBe(false);
    expect(mismaClave(clave(), clave({ spritesListos: 'falsetrue' }))).toBe(false);
  });
});
