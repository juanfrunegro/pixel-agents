// Personal (copia de juanfrunegro): genera los muebles propios dibujados en código (png + manifest.json) en
// webview-ui/public/assets/furniture/<ID>/. Uso: node scripts/personal/muebles.mjs
// Paleta tomada de los muebles del original (madera b38857/885c47/532e3d, contorno negro) para que combinen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

const { PNG } = pngjs;
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(RAIZ, 'webview-ui', 'public', 'assets', 'furniture');

const C = {
  negro: '#000000',
  madera: '#b38857',
  maderaClara: '#cfa86d',
  maderaBrillo: '#e3bf88',
  maderaOscura: '#885c47',
  bordo: '#532e3d',
  luz: '#eaf6f8',
  luzMedia: '#c9e6ee',
  luzSombra: '#9fc6d2',
  papel: '#efebe8',
  gris: '#4a4e4d',
  rojo: '#e05a5a',
  naranja: '#f0a040',
  amarillo: '#f2d24b',
  verde: '#5fbf6a',
  celeste: '#4fa8e0',
  violeta: '#9b6fd6',
  rosa: '#e07ab8',
  cuero: '#2f6b52',
  cueroOscuro: '#1f4a39',
  cueroBrillo: '#4f9677',
  dorado: '#e8c547',
  doradoOscuro: '#b8932a',
  pantalla: '#f3e3b5',
  pantallaSombra: '#d9bf86',
  marmol: '#ece7df',
  marmolVeta: '#cfc8bd',
  acero: '#c9ced6',
  aceroOscuro: '#8d939e',
  vidrio: '#2a3440',
  vinoVerde: '#2e6b3a',
  ambar: '#c27c2c',
  tinto: '#7a1f2b',
  gin: '#3c7fb0',
  claro: '#d8e8ec',
};

/** Lienzo de w×h píxeles transparentes con helpers de dibujo. */
function lienzo(w, h) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  const px = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    // #rrggbb o #rrggbbaa (con transparencia).
    const n = parseInt(color.slice(1, 7), 16);
    const i = (y * w + x) * 4;
    png.data[i] = (n >> 16) & 255;
    png.data[i + 1] = (n >> 8) & 255;
    png.data[i + 2] = n & 255;
    png.data[i + 3] = color.length > 7 ? parseInt(color.slice(7, 9), 16) : 255;
  };
  const rect = (x, y, rw, rh, color) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) px(i, j, color);
  };
  /** Rectángulo con contorno de 1 px. */
  const caja = (x, y, rw, rh, relleno, borde = C.negro) => {
    rect(x, y, rw, rh, borde);
    rect(x + 1, y + 1, rw - 2, rh - 2, relleno);
  };
  return { png, px, rect, caja };
}

function guardar(id, png, manifest) {
  const dir = path.join(DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(png));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ id, ...manifest, width: png.width, height: png.height }, null, 2)}\n`,
  );
  console.log(`${id} ${png.width}x${png.height}`);
}

// ── Sala de Diseño ────────────────────────────────────────────────

/** Mesa de luz (2×2): tablero que se ilumina con muestras de color y un boceto encima. */
function mesaLuz() {
  const { png, px, rect, caja } = lienzo(32, 32);
  // Tablero iluminado, visto desde arriba y adelante.
  caja(0, 4, 32, 19, C.luzMedia);
  rect(1, 5, 30, 1, C.luz);
  rect(2, 6, 28, 15, C.luz);
  rect(1, 21, 30, 1, C.luzSombra);
  // Boceto (hoja con un trazo) y muestras de color en abanico.
  caja(3, 7, 11, 12, C.papel, C.gris);
  for (const [x, y] of [
    [5, 15],
    [6, 14],
    [7, 12],
    [8, 11],
    [9, 11],
    [10, 12],
    [11, 10],
  ])
    px(x, y, C.celeste);
  rect(5, 9, 4, 1, C.gris);
  const muestras = [C.rojo, C.naranja, C.amarillo, C.verde, C.celeste, C.violeta, C.rosa];
  muestras.forEach((color, k) => caja(16 + (k % 4) * 3, 8 + Math.floor(k / 4) * 6, 4, 5, color));
  // Canto de madera y patas.
  caja(0, 22, 32, 4, C.madera);
  rect(1, 23, 30, 1, C.maderaClara);
  rect(1, 26, 3, 6, C.maderaOscura);
  rect(28, 26, 3, 6, C.maderaOscura);
  rect(1, 31, 3, 1, C.bordo);
  rect(28, 31, 3, 1, C.bordo);
  guardar('MESA_LUZ', png, {
    name: 'Mesa de luz',
    category: 'desks',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    footprintW: 2,
    footprintH: 2,
  });
}

/** Mural (3×2, en la pared): manchas de color y una paleta de pintor. */
function mural() {
  const { png, px, rect, caja } = lienzo(48, 32);
  caja(1, 3, 46, 26, C.papel, C.bordo);
  rect(2, 4, 44, 1, C.maderaClara);
  // Ondas de color de izquierda a derecha.
  const bandas = [C.violeta, C.celeste, C.verde, C.amarillo, C.naranja, C.rojo, C.rosa];
  for (let x = 3; x < 45; x++) {
    const onda = Math.round(3 * Math.sin(x / 4));
    bandas.forEach((color, k) => {
      const y = 7 + k * 2 + onda;
      px(x, y, color);
      px(x, y + 1, color);
    });
  }
  // Paleta de pintor abajo a la derecha.
  caja(31, 19, 13, 8, C.maderaClara, C.maderaOscura);
  for (const [x, color] of [
    [33, C.rojo],
    [36, C.amarillo],
    [39, C.celeste],
  ])
    rect(x, 21, 2, 2, color);
  px(41, 24, C.maderaOscura);
  px(42, 24, C.maderaOscura);
  guardar('MURAL', png, {
    name: 'Mural',
    category: 'wall',
    type: 'asset',
    canPlaceOnWalls: true,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    footprintW: 3,
    footprintH: 2,
  });
}

// ── Oficina del CEO (Brain) ───────────────────────────────────────

/**
 * Sillón del CEO (1×1, de espaldas: el CEO mira a su escritorio): respaldo alto de cuero verde con alas, tachas doradas
 * en el borde y patas de madera con punta de bronce. Es una silla (category chairs, orientation back) para que siga siendo
 * el asiento reservado del CEO.
 */
function sillonCeo() {
  const { png, px, rect, caja } = lienzo(16, 16);
  // Alas a los costados del respaldo.
  caja(0, 3, 16, 9, C.cueroOscuro);
  // Respaldo alto, con el borde de arriba redondeado.
  caja(2, 0, 12, 12, C.cuero);
  px(2, 0, '#00000000');
  px(13, 0, '#00000000');
  rect(3, 1, 10, 1, C.cueroBrillo);
  rect(3, 2, 1, 8, C.cueroBrillo);
  // Tachas doradas siguiendo el borde.
  for (let x = 4; x <= 11; x += 2) px(x, 2, C.dorado);
  for (let y = 4; y <= 9; y += 2) {
    px(3, y, C.dorado);
    px(12, y, C.dorado);
  }
  // Asiento (se asoma abajo del respaldo) con ribete dorado.
  caja(1, 11, 14, 3, C.cueroOscuro);
  rect(2, 12, 12, 1, C.cuero);
  rect(2, 11, 12, 1, C.doradoOscuro);
  // Patas de madera con punta de bronce.
  rect(2, 14, 2, 2, C.maderaOscura);
  rect(12, 14, 2, 2, C.maderaOscura);
  px(2, 15, C.dorado);
  px(13, 15, C.dorado);
  guardar('CEO_CHAIR', png, {
    name: 'Sillón del CEO',
    category: 'chairs',
    type: 'asset',
    orientation: 'back',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    footprintW: 1,
    footprintH: 1,
  });
}

/** Lámpara de pie (1×2, ocupa solo la fila de abajo): pantalla de tela con luz cálida, caño de bronce y base. */
function lampara() {
  const { png, px, rect, caja } = lienzo(16, 32);
  // Halo de luz alrededor de la pantalla.
  for (let y = 1; y < 14; y++)
    for (let x = 1; x < 15; x++) {
      const d = Math.hypot(x - 7.5, y - 7);
      if (d < 7) px(x, y, d < 4.5 ? '#fff2c040' : '#fff2c020');
    }
  // Pantalla: trapecio, más angosta arriba.
  for (let y = 3; y <= 10; y++) {
    const medio = 2 + Math.floor((y - 3) / 2);
    rect(8 - medio, y, medio * 2, 1, C.pantalla);
    px(8 - medio - 1, y, C.negro);
    px(8 + medio, y, C.negro);
  }
  rect(5, 2, 6, 1, C.negro);
  rect(2, 11, 12, 1, C.negro);
  rect(3, 10, 10, 1, C.pantallaSombra);
  rect(6, 4, 1, 5, '#fffaf0');
  // Caño de bronce.
  rect(7, 12, 2, 16, C.doradoOscuro);
  rect(7, 12, 1, 16, C.dorado);
  // Base.
  caja(4, 27, 8, 3, C.gris);
  rect(5, 27, 6, 1, C.aceroOscuro);
  rect(3, 30, 10, 1, '#00000040');
  guardar('LAMPARA', png, {
    name: 'Lámpara de pie',
    category: 'decor',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: 1,
    footprintW: 1,
    footprintH: 2,
  });
}

/**
 * Minibar (2×2): arriba, un estante de madera con botellas y copas contra la pared; abajo, la barra con mesada de
 * mármol, un cajón con tiradores dorados y una heladerita con puerta de vidrio.
 */
function minibar() {
  const { png, px, rect, caja } = lienzo(32, 32);
  // Estante: marco de madera con fondo bordó y dos repisas.
  caja(1, 0, 30, 14, C.bordo, C.negro);
  rect(2, 1, 28, 1, C.maderaOscura);
  rect(2, 7, 28, 1, C.madera);
  rect(2, 12, 28, 1, C.madera);
  // Botellas (cuerpo + cuello) en las dos repisas.
  const botella = (x, yBase, color, alta = 5) => {
    rect(x, yBase - alta, 2, alta, color);
    px(x, yBase - alta - 1, color);
    px(x, yBase - alta - 2, C.negro);
    px(x + 1, yBase - alta + 1, '#ffffff60');
  };
  [
    [3, C.vinoVerde],
    [6, C.tinto],
    [9, C.ambar],
    [12, C.gin],
    [15, C.claro],
  ].forEach(([x, color]) => botella(x, 7, color, 4));
  [
    [19, C.ambar],
    [22, C.vinoVerde],
    [25, C.tinto],
  ].forEach(([x, color]) => botella(x, 7, color, 4));
  // Copas en la repisa de abajo.
  for (const x of [4, 8, 12, 16]) {
    rect(x, 9, 3, 2, C.claro);
    px(x + 1, 11, C.claro);
    px(x + 1, 9, '#ffffff');
  }
  botella(22, 12, C.ambar, 3);
  botella(26, 12, C.tinto, 3);
  // Mesada de mármol con canto dorado.
  caja(0, 14, 32, 4, C.marmol);
  rect(3, 15, 6, 1, C.marmolVeta);
  rect(17, 16, 8, 1, C.marmolVeta);
  rect(1, 17, 30, 1, C.doradoOscuro);
  // Cuerpo de la barra: madera oscura con un cajón y tiradores dorados.
  caja(0, 18, 32, 13, C.maderaOscura);
  rect(1, 19, 30, 1, C.madera);
  caja(2, 20, 14, 10, C.madera, C.bordo);
  rect(3, 21, 12, 1, C.maderaClara);
  rect(8, 24, 2, 1, C.dorado);
  // Heladerita: acero con puerta de vidrio y latitas adentro.
  caja(17, 19, 13, 12, C.acero, C.negro);
  caja(18, 20, 10, 9, C.vidrio, C.aceroOscuro);
  for (const [x, color] of [
    [19, C.rojo],
    [21, C.verde],
    [23, C.celeste],
    [25, C.amarillo],
  ])
    rect(x, 26, 1, 2, color);
  rect(19, 23, 8, 1, C.aceroOscuro);
  rect(28, 22, 1, 4, C.aceroOscuro);
  px(19, 21, '#ffffff50');
  // Sombra en el piso.
  rect(0, 31, 32, 1, '#00000040');
  guardar('MINIBAR', png, {
    name: 'Minibar',
    category: 'misc',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: 1,
    footprintW: 2,
    footprintH: 2,
  });
}

// ── Reuniones ─────────────────────────────────────────────────────

/** Tele de videollamada (3×2, en la pared): pantalla con cuatro caras en grilla, cámara arriba y luz de encendido. */
function tele() {
  const { png, px, rect, caja } = lienzo(48, 32);
  // Marco negro y pantalla.
  caja(1, 3, 46, 25, C.vidrio, C.negro);
  rect(2, 4, 44, 1, '#3a4654');
  // Cámara arriba al centro.
  rect(22, 1, 4, 2, C.negro);
  px(23, 2, C.verde);
  // Cuatro participantes: fondo de color, cabeza y hombros.
  const piel = ['#f1c27d', '#c68642', '#e0ac69', '#8d5524'];
  const pelo = ['#3b2a1a', '#1c1c1c', '#a0522d', '#2b1d0e'];
  const fondo = ['#3f5a7a', '#5a3f6e', '#3f6e5a', '#6e5a3f'];
  [
    [3, 5],
    [24, 5],
    [3, 16],
    [24, 16],
  ].forEach(([x, y], k) => {
    rect(x, y, 21, 10, fondo[k]);
    rect(x + 8, y + 2, 5, 5, piel[k]);
    rect(x + 8, y + 2, 5, 2, pelo[k]);
    rect(x + 6, y + 7, 9, 3, C.papel);
    if (k === 1) rect(x, y, 21, 1, C.verde); // el que habla
  });
  // Barra de la llamada abajo: micrófono, cámara y colgar.
  rect(18, 26, 12, 1, '#00000080');
  px(20, 26, C.papel);
  px(24, 26, C.papel);
  rect(27, 26, 2, 1, C.rojo);
  // Luz de encendido.
  px(44, 27, C.verde);
  guardar('TELE', png, {
    name: 'Tele de videollamada',
    category: 'wall',
    type: 'asset',
    canPlaceOnWalls: true,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    footprintW: 3,
    footprintH: 2,
  });
}

// ── Cafetería ─────────────────────────────────────────────────────

/**
 * Barra de café (4×2): mesada de madera clara con la cafetera espresso (acero y manómetro), el molinillo, tazas
 * apiladas y una campana con medialunas; adelante, el frente de madera con una pizarrita del menú.
 */
function barraCafe() {
  const { png, px, rect, caja } = lienzo(64, 32);
  // Mesada.
  caja(0, 14, 64, 5, C.maderaClara);
  rect(1, 15, 62, 1, C.maderaBrillo);
  rect(1, 18, 62, 1, C.maderaOscura);
  // Cafetera espresso: cuerpo de acero, manómetro, dos grupos con portafiltro y una taza abajo.
  caja(4, 2, 18, 13, C.acero);
  rect(5, 3, 16, 1, '#ffffff');
  rect(5, 4, 1, 9, '#ffffff');
  caja(11, 4, 5, 5, C.papel, C.aceroOscuro);
  px(13, 6, C.rojo);
  px(14, 5, C.rojo);
  for (const x of [7, 17]) {
    rect(x, 10, 3, 2, C.aceroOscuro);
    rect(x - 1, 12, 5, 1, C.negro);
  }
  rect(7, 13, 3, 2, C.papel);
  px(10, 13, C.papel);
  // Vapor.
  for (const [x, y] of [
    [8, 0],
    [9, 1],
    [18, 0],
  ])
    px(x, y, '#ffffffa0');
  // Molinillo: tolva de vidrio con granos y base negra.
  caja(25, 3, 6, 6, C.vidrio, C.negro);
  rect(26, 6, 4, 2, C.maderaOscura);
  caja(25, 9, 6, 6, C.gris, C.negro);
  // Tazas apiladas.
  for (const [x, y] of [
    [34, 10],
    [38, 10],
    [36, 7],
  ]) {
    caja(x, y, 4, 4, C.papel, C.gris);
    px(x + 4, y + 1, C.gris);
  }
  // Campana de vidrio con medialunas.
  caja(45, 5, 14, 9, '#d8e8ec80', C.aceroOscuro);
  px(51, 4, C.aceroOscuro);
  px(52, 4, C.aceroOscuro);
  for (const x of [47, 52]) {
    rect(x, 10, 5, 3, C.naranja);
    rect(x + 1, 10, 3, 1, C.amarillo);
  }
  rect(45, 13, 14, 1, C.acero);
  // Frente de la barra: madera oscura con paneles y una pizarrita del menú.
  caja(0, 19, 64, 12, C.maderaOscura);
  rect(1, 20, 62, 1, C.madera);
  for (const x of [3, 41]) caja(x, 22, 20, 7, C.madera, C.bordo);
  caja(25, 21, 14, 9, C.gris, C.madera);
  rect(27, 23, 6, 1, C.papel);
  rect(27, 25, 9, 1, C.papel);
  rect(27, 27, 5, 1, C.papel);
  px(35, 23, C.dorado);
  // Sombra en el piso.
  rect(0, 31, 64, 1, '#00000040');
  guardar('BARRA_CAFE', png, {
    name: 'Barra de café',
    category: 'misc',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: 1,
    footprintW: 4,
    footprintH: 2,
  });
}

mesaLuz();
mural();
sillonCeo();
lampara();
minibar();
tele();
barraCafe();
