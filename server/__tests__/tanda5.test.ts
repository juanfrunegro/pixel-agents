import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { esOficinaLibre, nombreLibre } from '../../core/src/salasComunes.js';
import {
  asignarOficina,
  guardarOcupacion,
  leerOcupacion,
  lugarDeSala,
  LUGARES,
  normalizarOcupacion,
  ocupacionDelPlano,
  ocupacionInicial,
} from '../src/personal/ocupacion.js';
import {
  asignacion,
  generarLayout,
  proyectosDisponibles,
  salasConOcupacion,
  salasDesde,
} from '../src/personal/oficina.js';
import { htmlOrganigrama } from '../src/personal/organigrama.js';
import { cambiarVozSesion, mensajeInfo, setReglasExtra } from '../src/personal/personal.js';
import {
  carpetaOverrideVoz,
  escribirOverrideVoz,
  leerOverrideVoz,
  limpiarVozVieja,
  sesionValida,
  vozActiva,
  vozDicha,
} from '../src/personal/senales.js';
import { cargarSkins, mensajeSkins } from '../src/personal/skins.js';

const ORCA = [
  {
    nombre: 'ERP',
    ruta: '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\Claude\\Projects\\ERP',
  },
  { nombre: 'Centro de control', ruta: 'C:\\Users\\juanf\\Documents\\Chaina\\Centro de control' },
  { nombre: 'brain', ruta: 'C:\\Users\\juanf\\.claude\\brain' },
  { nombre: 'Poker_App', ruta: 'C:/Users/juanf/Documents/IA Tools/Poker_App' },
  {
    nombre: 'Finanzas_personales',
    ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Finanzas_personales',
  },
  { nombre: 'Analisis QF', ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Analisis QF' },
  { nombre: 'Trading Bot', ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Trading Bot' },
  { nombre: 'Calendar.manager', ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Calendar.manager' },
];

const plano = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'webview-ui', 'public', 'assets', 'default-layout-1.json'),
    'utf8',
  ),
) as Record<string, unknown>;

afterEach(() => setReglasExtra([]));

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-oficinas-'));

describe('tanda 5: oficinas fijas con proyecto elegible', () => {
  const disponibles = proyectosDisponibles(ORCA);

  it('los proyectos asignables son los de Orca menos el Brain (fijo en el centro) y "Otros"', () => {
    expect(disponibles).toEqual([
      'Chaina',
      'Poker',
      'Finanzas',
      'ERP',
      'Calendar.manager',
      'QF',
      'Trading Bot',
    ]);
  });

  it('la primera vez las oficinas quedan como el plano de siempre: las primeras 6 salas de Orca', () => {
    const o = ocupacionInicial(disponibles);
    expect(o).toHaveLength(LUGARES);
    expect(o).toEqual(['Chaina', 'Poker', 'Finanzas', 'ERP', 'Calendar.manager', 'QF']);
    expect(ocupacionInicial(['Chaina'])).toEqual(['Chaina', null, null, null, null, null]);
  });

  it('lo guardado se lee igual, y un archivo roto o raro se normaliza sin romper', () => {
    const dir = tmp();
    const ruta = path.join(dir, 'oficinas.json');
    expect(leerOcupacion(disponibles, ruta)).toEqual(ocupacionInicial(disponibles));
    guardarOcupacion(['ERP', null, 'Poker', null, null, 'QF'], ruta);
    expect(leerOcupacion(disponibles, ruta)).toEqual(['ERP', null, 'Poker', null, null, 'QF']);
    fs.writeFileSync(ruta, '{roto');
    expect(leerOcupacion(disponibles, ruta)).toEqual(ocupacionInicial(disponibles));
    expect(normalizarOcupacion({ lugares: ['ERP', 'ERP', 3, 'Libre 2', ' QF '] })).toEqual([
      'ERP',
      null,
      null,
      null,
      'QF',
      null,
    ]);
    expect(normalizarOcupacion({})).toBeNull();
  });

  it('asignar: pone el proyecto, intercambia si ya tenía oficina, deja libre y rechaza lo que no es de Orca', () => {
    const o = ['Chaina', 'Poker', 'Finanzas', 'ERP', null, 'QF'];
    // Una oficina libre se nombra por su lugar.
    expect(lugarDeSala(o, 'Libre 5')).toBe(4);
    expect(lugarDeSala(o, 'Libre 1')).toBe(-1);
    expect(asignarOficina(o, 'Libre 5', 'Trading Bot', disponibles)).toEqual({
      ocupacion: ['Chaina', 'Poker', 'Finanzas', 'ERP', 'Trading Bot', 'QF'],
    });
    // ERP ya estaba en otra: se intercambian.
    expect(asignarOficina(o, 'Chaina', 'ERP', disponibles)).toEqual({
      ocupacion: ['ERP', 'Poker', 'Finanzas', 'Chaina', null, 'QF'],
    });
    // A un lugar libre: el lugar viejo queda libre.
    expect(asignarOficina(o, 'Libre 5', 'Poker', disponibles)).toEqual({
      ocupacion: ['Chaina', null, 'Finanzas', 'ERP', 'Poker', 'QF'],
    });
    expect(asignarOficina(o, 'Poker', null, disponibles)).toEqual({
      ocupacion: ['Chaina', null, 'Finanzas', 'ERP', null, 'QF'],
    });
    expect(asignarOficina(o, 'Poker', 'Brain', disponibles)).toEqual({
      error: 'Ese proyecto no está en Orca.',
    });
    expect(asignarOficina(o, 'Poker', '../../etc', disponibles)).toHaveProperty('error');
    expect(asignarOficina(o, 'Otros', 'Trading Bot', disponibles)).toHaveProperty('error');
    expect(asignarOficina(o, 'Diseño', 'Trading Bot', disponibles)).toHaveProperty('error');
    expect(asignarOficina(o, 42, 'Trading Bot', disponibles)).toHaveProperty('error');
  });

  it('el plano tiene siempre las mismas oficinas en el mismo lugar, con o sin proyectos', () => {
    const deOrca = salasDesde(ORCA).salas;
    const lleno = generarLayout(plano, salasConOcupacion(ocupacionInicial(disponibles), deOrca));
    const conLibres = generarLayout(
      plano,
      salasConOcupacion(['Chaina', null, 'Finanzas', null, null, 'Trading Bot'], deOrca),
    );
    expect([conLibres.cols, conLibres.rows]).toEqual([lleno.cols, lleno.rows]);
    expect(conLibres.tiles).toEqual(lleno.tiles);
    const areas = new Set((conLibres.areaTiles as Array<string | null>).filter(Boolean));
    expect(areas.has('Libre 2')).toBe(true);
    expect(areas.has('Libre 4')).toBe(true);
    expect(areas.has('Trading Bot')).toBe(true);
    expect(areas.has('Poker')).toBe(false);
    expect(areas.has('Otros')).toBe(true);
    expect(areas.has('Brain')).toBe(true);
    // Mismo lugar: el tile de la oficina 6 es de Trading Bot donde antes era de QF.
    const i = (lleno.areaTiles as Array<string | null>).indexOf('QF');
    expect((conLibres.areaTiles as Array<string | null>)[i]).toBe('Trading Bot');
    // La mesa contable sigue a Finanzas.
    const contable = (l: Record<string, unknown>) =>
      (l.furniture as Array<{ uid: string; type: string }>).filter((f) =>
        f.uid.startsWith('finanzas-'),
      ).length;
    expect(contable(conLibres)).toBe(contable(lleno));
  });

  it('los agentes de un proyecto sin oficina van a "Otros"; nadie va a una oficina libre', () => {
    const { salas: deOrca, reglas } = salasDesde(ORCA);
    const salas = salasConOcupacion(
      ['Chaina', null, 'Finanzas', null, null, 'Trading Bot'],
      deOrca,
    );
    const a = asignacion(salas, reglas);
    expect(a.Chaina).toEqual(['Chaina']);
    expect(a.Poker).toEqual(['Otros']);
    expect(a.ERP).toEqual(['Otros']);
    expect(a['Trading Bot']).toEqual(['Trading Bot']);
    expect(a.Brain).toEqual(['Brain']);
    expect(
      Object.values(a)
        .flat()
        .some((s) => esOficinaLibre(s)),
    ).toBe(false);
  });

  it('la primera vez respeta el plano que ya había (sus oficinas en orden, libres incluidas)', () => {
    const areas = [
      'Chaina',
      'Poker',
      'Diseño',
      'Finanzas',
      'ERP',
      'Biblioteca',
      'Brain',
      'Reuniones',
      'QF',
      'Libre 6',
      'Cafetería',
      'Presentaciones',
      'Otros',
    ];
    expect(ocupacionDelPlano(areas)).toEqual(['Chaina', 'Poker', 'Finanzas', 'ERP', 'QF', null]);
    expect(ocupacionDelPlano(['Brain', 'Diseño', 'Otros'])).toBeNull();
    const dir = tmp();
    const ruta = path.join(dir, 'oficinas.json');
    expect(leerOcupacion(disponibles, ruta, () => ocupacionDelPlano(areas))).toEqual([
      'Chaina',
      'Poker',
      'Finanzas',
      'ERP',
      'QF',
      null,
    ]);
    // Lo guardado manda sobre el plano.
    guardarOcupacion(['ERP', null, null, null, null, null], ruta);
    expect(leerOcupacion(disponibles, ruta, () => ocupacionDelPlano(areas))[0]).toBe('ERP');
  });

  it('nombres de oficina libre', () => {
    expect(nombreLibre(0)).toBe('Libre 1');
    expect(esOficinaLibre('Libre 3')).toBe(true);
    expect(esOficinaLibre('Libreria')).toBe(false);
    expect(esOficinaLibre('Chaina')).toBe(false);
    expect(esOficinaLibre(null)).toBe(false);
  });
});

describe('tanda 5: interruptor del aviso por voz', () => {
  it('el interruptor manda sobre el prompt; sin interruptor, sigue al prompt', () => {
    expect(vozActiva(true, null)).toBe(true);
    expect(vozActiva(false, null)).toBe(false);
    expect(vozActiva(true, 'off')).toBe(false);
    expect(vozActiva(false, 'on')).toBe(true);
  });

  it('escribe, lee y borra el archivo; rechaza sesiones que se saldrían de la carpeta', () => {
    const dir = tmp();
    expect(leerOverrideVoz('abc-123', dir)).toBeNull();
    expect(escribirOverrideVoz('abc-123', 'off', dir)).toBe(true);
    expect(leerOverrideVoz('abc-123', dir)).toBe('off');
    expect(fs.readFileSync(path.join(dir, 'abc-123.override'), 'utf8')).toBe('off');
    expect(escribirOverrideVoz('abc-123', null, dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'abc-123.override'))).toBe(false);
    for (const malo of ['../x', 'a/b', 'a\\b', '', 'x'.repeat(81), 42, null]) {
      expect(sesionValida(malo)).toBe(false);
      expect(escribirOverrideVoz(malo, 'on', dir)).toBe(false);
    }
    expect(escribirOverrideVoz('abc', 'quizas', dir)).toBe(false);
    fs.writeFileSync(path.join(dir, 'raro.override'), 'tal vez');
    expect(leerOverrideVoz('raro', dir)).toBeNull();
    expect(fs.readdirSync(dir)).toEqual(['raro.override']);
  });

  it('"dicho" y la limpieza de archivos viejos', () => {
    const dir = tmp();
    expect(vozDicha('s1', dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 's1.dicho'), '1');
    expect(vozDicha('s1', dir)).toBeGreaterThan(0);
    fs.writeFileSync(path.join(dir, 'viejo.override'), 'on');
    fs.writeFileSync(path.join(dir, 'otro.speak'), '1');
    const hace5Dias = Date.now() / 1000 - 5 * 86400;
    fs.utimesSync(path.join(dir, 'viejo.override'), hace5Dias, hace5Dias);
    expect(limpiarVozVieja(3, dir)).toBe(1);
    expect(fs.readdirSync(dir).sort()).toEqual(['otro.speak', 's1.dicho']);
  });

  it('setVozSesion: solo agentes que existen; escribe el interruptor y avisa a los clientes', () => {
    const dir = tmp();
    const sid = `pixqa-prueba-${process.pid}`;
    const jsonl = path.join(dir, `${sid}.jsonl`);
    fs.writeFileSync(jsonl, '');
    const enviados: Array<Record<string, unknown>> = [];
    const agent = { jsonlFile: jsonl } as never;
    const store = {
      get: (id: number) => (id === 7 ? agent : undefined),
      broadcast: (m: Record<string, unknown>) => enviados.push(m),
    } as never;
    try {
      expect(cambiarVozSesion(store, 99, 'on')).toBe(false);
      expect(cambiarVozSesion(store, '7', 'on')).toBe(false);
      expect(cambiarVozSesion(store, 7, 'quizas')).toBe(false);
      expect(cambiarVozSesion(store, 7, 'on')).toBe(true);
      expect(leerOverrideVoz(sid)).toBe('on');
      expect(enviados.at(-1)).toMatchObject({
        type: 'agentInfo',
        id: 7,
        vozOverride: 'on',
        vozActiva: true,
      });
      expect(cambiarVozSesion(store, 7, null)).toBe(true);
      expect(leerOverrideVoz(sid)).toBeNull();
      expect(mensajeInfo(7, agent)).toBeNull(); // sin nada que mostrar
    } finally {
      fs.rmSync(path.join(carpetaOverrideVoz(), `${sid}.override`), { force: true });
    }
  });
});

describe('tanda 5: skins de Marvel', () => {
  it('carga las cinco skins con el formato de los personajes (3 direcciones × 7 cuadros de 16×32)', () => {
    const skins = cargarSkins(path.join(__dirname, '..', '..', 'webview-ui', 'public'));
    expect(Object.keys(skins).sort()).toEqual(['deadpool', 'hulk', 'ironman', 'spiderman', 'thor']);
    for (const s of Object.values(skins)) {
      for (const dir of [s.down, s.up, s.right]) {
        expect(dir).toHaveLength(7);
        expect(dir[0]).toHaveLength(32);
        expect(dir[0][0]).toHaveLength(16);
      }
    }
    expect(mensajeSkins()).toMatchObject({ type: 'skinsPersonalesLoaded' });
    expect(cargarSkins(tmp())).toEqual({});
    expect(mensajeSkins()).toBeNull();
  });

  it('en el organigrama, una persona que se llama como un personaje con skin lleva su skin', () => {
    const html = htmlOrganigrama({
      nombres: {
        ceo: 'Juan',
        agentes: { 'buscador-de-bugs': 'Hulk · bugs', verificador: 'Pepe · verificador' },
        descartables: [],
        roles: { Juan: 'CEO', Hulk: 'Revisa código', Pepe: 'Verifica' },
      },
      defs: new Map(),
      uso: new Map(),
    } as never);
    expect(html).toContain('/assets/marvel/hulk.png');
    expect(html).toContain('/assets/characters/char_');
    expect(html).not.toContain('/assets/marvel/pepe');
  });

  it('el organigrama muestra siempre a los cinco externos de Marvel con su skin y puesto', () => {
    const html = htmlOrganigrama({
      nombres: { ceo: 'Juan', agentes: {}, descartables: [], roles: { Juan: 'CEO' } },
      defs: new Map(),
      uso: new Map(),
    } as never);
    expect(html).toContain('Externos · tercerizados');
    for (const id of ['hulk', 'spiderman', 'ironman', 'thor', 'deadpool']) {
      expect(html).toContain(`data-skin="${id}"`);
      expect(html).toContain(`/assets/marvel/${id}.png`);
    }
    expect(html).toContain('Deploys con martillo');
    expect(html).toContain("localStorage.getItem('pixel.marvelActivos')");
  });
});
