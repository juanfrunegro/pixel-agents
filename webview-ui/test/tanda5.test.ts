import { describe, expect, it } from 'vitest';

import { esOficinaLibre } from '../../core/src/salasComunes.js';
import { NOMBRES_CON_SKIN, skinDeNombre } from '../../core/src/skinsMarvel.js';
import type { Character } from '../src/office/types.js';
import {
  alMensaje,
  elegirDescartable,
  nombreDe,
  registrarSub,
  vozDe,
  vozOverrideDe,
  vozPedidaDe,
} from '../src/personal/personal.js';
import {
  cerrarComunicaciones,
  clicPersonal,
  enComunicaciones,
  estadoPizarra,
  oficinaEn,
  opcionesAsignar,
} from '../src/personal/pizarra.js';
import { setSkins, skinDe, spritesDeSkin } from '../src/personal/skins.js';
import { origenVoz, sesionesParaPanel, siguienteVoz } from '../src/personal/voz.js';

describe('tanda 5: oficinas con proyecto elegible', () => {
  const oficinas = [
    { sala: 'Chaina', proyecto: 'Chaina' },
    { sala: 'Libre 2', proyecto: null },
    { sala: 'ERP', proyecto: 'ERP' },
  ];
  const disponibles = ['Chaina', 'ERP', 'Poker', 'Trading Bot'];

  it('"Asignar proyecto" ofrece los de Orca menos el que ya tiene, primero los que no tienen oficina', () => {
    expect(opcionesAsignar('Chaina', oficinas, disponibles)).toEqual([
      { proyecto: 'Poker', intercambia: false },
      { proyecto: 'Trading Bot', intercambia: false },
      { proyecto: 'ERP', intercambia: true },
    ]);
    expect(opcionesAsignar('Libre 2', oficinas, disponibles).map((o) => o.proyecto)).toEqual([
      'Poker',
      'Trading Bot',
      'Chaina',
      'ERP',
    ]);
  });

  it('una oficina libre también abre su menú; las compartidas y "Otros" no', () => {
    // 3 columnas: [Libre 2, Otros, Diseño] en la fila 1; la fila 0 es la pared.
    const areas = [null, null, null, 'Libre 2', 'Otros', 'Diseño'];
    expect(oficinaEn(areas, 3, 0, 1)).toBe('Libre 2');
    expect(oficinaEn(areas, 3, 0, 0)).toBe('Libre 2'); // el nombre en la pared
    expect(oficinaEn(areas, 3, 1, 1)).toBeNull();
    expect(oficinaEn(areas, 3, 2, 1)).toBeNull();
    expect(esOficinaLibre('Libre 2')).toBe(true);
  });
});

describe('tanda 5: sala de comunicaciones y aviso por voz', () => {
  it('clic en Presentaciones abre la sala de comunicaciones (piso o nombre en la pared)', () => {
    const areas = [null, null, 'Presentaciones', 'Chaina'];
    expect(enComunicaciones(areas, 2, 0, 1)).toBe(true);
    expect(enComunicaciones(areas, 2, 0, 0)).toBe(true);
    expect(enComunicaciones(areas, 2, 1, 1)).toBe(false);
    expect(clicPersonal({ cols: 2, areaTiles: areas }, { col: 0, row: 1 }, 10, 10)).toBe(true);
    expect(estadoPizarra().comunicaciones).toBe(true);
    expect(estadoPizarra().menu).toBeNull();
    cerrarComunicaciones();
    expect(estadoPizarra().comunicaciones).toBe(false);
  });

  it('el interruptor manda sobre el prompt; sin interruptor sigue al prompt', () => {
    alMensaje({ type: 'agentInfo', id: 701, voz: true, vozOverride: null, vozActiva: true });
    expect([vozDe(701), vozPedidaDe(701), vozOverrideDe(701)]).toEqual([true, true, null]);
    alMensaje({ type: 'agentInfo', id: 701, voz: true, vozOverride: 'off', vozActiva: false });
    expect([vozDe(701), vozPedidaDe(701), vozOverrideDe(701)]).toEqual([false, true, 'off']);
    alMensaje({ type: 'agentInfo', id: 702, voz: false, vozOverride: 'on', vozActiva: true });
    expect([vozDe(702), vozPedidaDe(702)]).toEqual([true, false]);
    // Un servidor viejo (sin vozActiva): sigue a la marca del prompt.
    alMensaje({ type: 'agentInfo', id: 703, voz: true });
    expect(vozDe(703)).toBe(true);
    // Un valor raro no se toma como interruptor.
    alMensaje({ type: 'agentInfo', id: 704, voz: false, vozOverride: 'quizas', vozActiva: false });
    expect(vozOverrideDe(704)).toBeNull();
  });

  it('tocar el interruptor lo da vuelta, y el texto dice de dónde sale', () => {
    expect(siguienteVoz(true)).toBe('off');
    expect(siguienteVoz(false)).toBe('on');
    expect(origenVoz(true, null)).toBe('lo pidió el prompt');
    expect(origenVoz(false, null)).toBe('no lo pidió el prompt');
    expect(origenVoz(true, 'off')).toContain('apagado por vos');
    expect(origenVoz(false, 'on')).toBe('prendido por vos');
  });

  it('el panel lista solo sesiones principales, en orden fijo (por proyecto y llegada)', () => {
    const c = (id: number, o: Partial<Character> = {}) =>
      ({ id, isSubagent: false, folderName: 'ERP', ...o }) as Character;
    const lista = sesionesParaPanel([
      c(5, { folderName: 'Poker' }),
      c(2),
      c(3, { isSubagent: true }),
      c(4, { matrixEffect: 'despawn' }),
      c(1),
    ]);
    expect(lista.map((x) => x.id)).toEqual([1, 2, 5]);
  });
});

describe('tanda 5: skins de Marvel', () => {
  it('la skin sale del nombre, sin importar mayúsculas, guiones ni el puesto', () => {
    expect(skinDeNombre('Hulk')).toBe('hulk');
    expect(skinDeNombre('hulk · bugs')).toBe('hulk');
    expect(skinDeNombre('Spider-Man')).toBe('spiderman');
    expect(skinDeNombre('spiderman')).toBe('spiderman');
    expect(skinDeNombre('Spider Man · diseño')).toBe('spiderman');
    expect(skinDeNombre('Iron Man')).toBe('ironman');
    expect(skinDeNombre('THOR')).toBe('thor');
    expect(skinDeNombre('Deadpool')).toBe('deadpool');
    expect(skinDeNombre('Pepe · bugs')).toBeNull();
    expect(skinDeNombre('Black Widow')).toBeNull();
    expect(skinDeNombre('')).toBeNull();
  });

  it('a los descartables les tocan primero los cinco con skin, sin repetir mientras vivan', () => {
    const lista = ['Spider-Man', 'Iron Man', 'Thor', 'Hulk', 'Black Widow', 'Loki', 'Deadpool'];
    expect(elegirDescartable(lista, new Set(), 3)).toBe(NOMBRES_CON_SKIN[0]);
    expect(elegirDescartable(lista, new Set(NOMBRES_CON_SKIN), 0)).toBe('Black Widow');
    expect(elegirDescartable(lista, new Set([...NOMBRES_CON_SKIN, 'Black Widow']), 4)).toBe('Loki');
    expect(elegirDescartable(lista, new Set(lista), 1)).toBe('Iron Man'); // todos ocupados: repite

    alMensaje({ type: 'agentNamesLoaded', ceo: 'Juan', agentes: {}, descartables: lista });
    const ids = [-801, -802, -803, -804, -805, -806];
    ids.forEach((id, i) => registrarSub(id, 800, `tool-skin-${i}`));
    const nombres = ids.map((id) => nombreDe(id));
    expect(nombres.slice(0, 5)).toEqual([...NOMBRES_CON_SKIN]);
    expect(nombres[5]).toBe('Black Widow');
    expect(nombreDe(-801)).toBe('Hulk'); // fijo: no cambia en cada cuadro
  });

  it('un personaje con nombre de skin se dibuja con su skin; los demás, con su personaje', () => {
    const frame = Array.from({ length: 32 }, () => Array.from({ length: 16 }, () => ''));
    const hoja = {
      down: Array(7).fill(frame),
      up: Array(7).fill(frame),
      right: Array(7).fill(frame),
    };
    setSkins({ hulk: hoja, roto: { down: [] } });
    expect(skinDe({ id: 1, agentName: 'Hulk' })).toBe('hulk');
    expect(spritesDeSkin({ id: 1, agentName: 'Hulk' })?.walk).toBeDefined();
    expect(spritesDeSkin({ id: 1, agentName: 'Thor' })).toBeNull(); // skin que no llegó: personaje normal
    expect(spritesDeSkin({ id: 1, agentName: 'Pepe' })).toBeNull();
    setSkins(null);
    expect(spritesDeSkin({ id: 1, agentName: 'Hulk' })).toBeNull();
  });
});

describe('tanda 5: externos de Marvel en el organigrama', () => {
  it('publica en localStorage las skins que hay en la oficina, sin escribir de más', async () => {
    const { publicarMarvelActivos } = await import('../src/personal/skins.js');
    const guardado: Record<string, string> = {};
    let escrituras = 0;
    const anterior = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: (k: string, v: string) => {
        escrituras++;
        guardado[k] = v;
      },
    };
    try {
      const chars = [
        { id: 901, agentName: 'Hulk · bugs' },
        { id: 902, agentName: 'Thor' },
        { id: 903, agentName: 'Pepe' },
        { id: 904, agentName: 'Deadpool', matrixEffect: 'despawn' as const },
      ];
      publicarMarvelActivos(chars as never, 1_000_000);
      expect(JSON.parse(guardado['pixel.marvelActivos'])).toEqual({
        ids: ['hulk', 'thor'],
        t: 1_000_000,
      });
      publicarMarvelActivos(chars as never, 1_001_000); // menos de 2 s: no hace nada
      publicarMarvelActivos(chars as never, 1_003_000); // igual y menos de 10 s: no escribe
      expect(escrituras).toBe(1);
      publicarMarvelActivos(chars as never, 1_011_000); // refresca la marca de tiempo
      expect(escrituras).toBe(2);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = anterior;
    }
  });
});
