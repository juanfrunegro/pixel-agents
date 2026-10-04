/**
 * Personal: los tests nunca tocan el home real. Algunos redirigen solo HOME, pero en Windows os.homedir() sale de
 * USERPROFILE: escribían en el ~/.pixel-agents/config.json de verdad (el 4/10 le cambiaron standalone.showAreas).
 * Antes de cada archivo de tests, HOME y USERPROFILE apuntan a una carpeta temporal propia.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
