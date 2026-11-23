// Genera imágenes QR de prueba en ./demo-qr para probar el escáner
// ("Subir foto del QR" en la app, o mostrándolas en otra pantalla frente a la cámara).
//
// Formato del carné UTP (api-estudiante-mock/API_Estado_Estudiante.pdf, sección 6): Base64 de "<cedula>@utp.ac.pa".
// Usa los estudiantes del modo demostración (src/services/datos-demo.json), que son los mismos que se cargan
// en MySQL al iniciar. Para los que agregues en MySQL:
//   docker compose run --rm -v ./frontend/demo-qr:/salida mock-utp python generar_qr.py
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const estudiantes = JSON.parse(await readFile(new URL('../src/services/datos-demo.json', import.meta.url), 'utf8'));
const destino = fileURLToPath(new URL('../demo-qr/', import.meta.url));
await mkdir(destino, { recursive: true });

const carnes = [
  ...estudiantes.map((e) => [`utp-${e.estado.toLowerCase()}-${e.cedula}`, e.cedula, e.nombre]),
  ['utp-no-registrado-8-999-999', '8-999-999', 'no existe en la UTP'],
  ['utp-sin-servicio-8-500-500', '8-500-500', 'simula el sistema de matrícula caído'],
];

for (const [nombre, cedula, quien] of carnes) {
  const token = Buffer.from(`${cedula}@utp.ac.pa`).toString('base64');
  await QRCode.toFile(join(destino, `${nombre}.png`), token, { width: 360, margin: 2 });
  console.log(`✔ demo-qr/${nombre}.png  (${quien})`);
}

await QRCode.toFile(join(destino, 'qr-ajeno.png'), 'https://www.altaplazamall.com', { width: 360, margin: 2 });
console.log('✔ demo-qr/qr-ajeno.png  (QR que no es de un carné UTP)');
