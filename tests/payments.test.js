const { spawn } = require('child_process');
const http = require('http');

const PORT = 4100;
const projectDir = 'c:/Users/Lucy/Desktop/base de datos';

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const bodyText = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: bodyText ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyText)
      } : {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    if (bodyText) req.write(bodyText);
    req.end();
  });
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => process.stderr.write(chunk));

  await wait(1500);

  try {
    const documentoPrueba = `doc-${Date.now()}`;

    const clienteRes = await request('POST', '/api/clientes', {
      nombre: 'Usuario de prueba',
      documento: documentoPrueba,
      telefono: '3001234567',
      direccion: 'Calle prueba 123'
    });

    if (clienteRes.statusCode !== 200) {
      console.error('No se pudo crear el cliente de prueba:', clienteRes.statusCode, clienteRes.body);
      process.exit(1);
    }

    const clienteBody = JSON.parse(clienteRes.body);
    const clienteId = clienteBody.id;

    const prestamoRes = await request('POST', '/api/prestamos', {
      cliente_id: clienteId,
      monto: 1000,
      fecha_limite: '2026-11-30'
    });

    if (prestamoRes.statusCode !== 200) {
      console.error('No se pudo crear el préstamo de prueba:', prestamoRes.statusCode, prestamoRes.body);
      process.exit(1);
    }

    const prestamoBody = JSON.parse(prestamoRes.body);
    const prestamoId = prestamoBody.id;

    const pagoRes = await request('POST', '/api/pagos', {
      prestamo_id: prestamoId,
      monto: 200,
      metodo_pago: 'efectivo',
      observacion: 'prueba'
    });

    if (pagoRes.statusCode !== 201) {
      console.error('La ruta /api/pagos falló:', pagoRes.statusCode, pagoRes.body);
      process.exit(1);
    }

    const body = JSON.parse(pagoRes.body);
    if (Number(body.saldo_actual) !== 1000) {
      console.error('El saldo no se actualizó como se esperaba:', body);
      process.exit(1);
    }

    console.log('El flujo completo de cliente, préstamo y pago funciona correctamente.');
  } finally {
    server.kill('SIGTERM');
  }
})();
