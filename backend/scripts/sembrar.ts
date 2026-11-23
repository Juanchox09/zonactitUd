/**
 * Carga o actualiza titulares desde un archivo JSON (arreglo de objetos con el formato Titular).
 *   npm run db:seed                       → data/titulares-demo.json
 *   npm run db:seed -- ruta/archivo.json  → otro archivo (p. ej. una exportación del sistema académico)
 * Los registros se identifican por código de carnet: si ya existen, se actualizan.
 */
import { readFileSync } from 'node:fs';
import { leerConfiguracion } from '../src/config.ts';
import { abrirBaseDatos } from '../src/db.ts';
import { prepararTitular, RepositorioTitulares } from '../src/repositorio.ts';

const ruta = process.argv[2] ?? 'data/titulares-demo.json';
const config = leerConfiguracion();

try {
  const datos: unknown = JSON.parse(readFileSync(ruta, 'utf8'));
  if (!Array.isArray(datos)) throw new Error('El archivo debe contener un arreglo JSON.');
  const titulares = datos.map(prepararTitular);

  const db = abrirBaseDatos(config.rutaBaseDatos);
  const repositorio = new RepositorioTitulares(db);
  repositorio.guardarVarios(titulares);
  console.log(`✔ ${titulares.length} titulares cargados desde ${ruta}. Total en ${config.rutaBaseDatos}: ${repositorio.contar()}.`);
  db.close();
} catch (error) {
  console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
