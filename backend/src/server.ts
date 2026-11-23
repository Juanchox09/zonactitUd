import { construirApp, serializadoresSinDatosPersonales } from './app.ts';
import { leerConfiguracion } from './config.ts';
import { abrirBaseDatos } from './db.ts';
import { fechaHoy } from './estado.ts';
import { OrigenLocal, type OrigenDatos } from './origen.ts';
import { ClienteUtp, OrigenUtp } from './origen-utp.ts';
import { RepositorioTitulares } from './repositorio.ts';

const config = leerConfiguracion();
const db = abrirBaseDatos(config.rutaBaseDatos);
const repositorio = new RepositorioTitulares(db);
const hoy = () => fechaHoy(config.zonaHoraria);

const origen: OrigenDatos =
  config.origen === 'utp'
    ? new OrigenUtp(new ClienteUtp(config.utp), repositorio, hoy)
    : new OrigenLocal(repositorio, hoy);

const app = await construirApp({
  origen,
  repositorio,
  origenesCors: config.origenesCors,
  limitePorMinuto: config.limitePorMinuto,
  logger: { level: process.env.LOG_LEVEL ?? 'info', serializers: serializadoresSinDatosPersonales },
});

app.log.info(
  config.origen === 'utp'
    ? `Origen: API UTP (${config.utp.urlBase}) para estudiantes; base local para colaboradores y egresados.`
    : 'Origen: base de datos local.',
);
if (config.origen === 'local' && repositorio.contar() === 0) {
  app.log.warn('La base de datos no tiene titulares. Ejecuta "npm run db:seed" para cargar los datos de prueba.');
}

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port: config.puerto, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
