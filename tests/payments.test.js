const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4100;
const projectDir = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prestamos-test-'));

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

function fechaColombia(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha);
  const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

(async () => {
  if (fechaColombia(new Date('2026-10-23T04:59:59.999Z')) !== '2026-10-22'
    || fechaColombia(new Date('2026-10-23T05:00:00.000Z')) !== '2026-10-23') {
    throw new Error('La fecha debe cambiar a medianoche de Colombia (GMT-5).');
  }

  const server = spawn(process.execPath, [path.join(projectDir, 'server.js')], {
    cwd: tempDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      WHATSAPP_ACCESS_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_ALERT_TO: '',
      WHATSAPP_TEMPLATE_NAME: '',
      WHATSAPP_TEMPLATE_LANGUAGE: ''
    },
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
      direccion: 'Calle prueba 123',
      direccion_trabajo: 'Carrera 10 #20-30'
    });

    if (clienteRes.statusCode !== 200) {
      console.error('No se pudo crear el cliente de prueba:', clienteRes.statusCode, clienteRes.body);
      process.exit(1);
    }

    const clienteBody = JSON.parse(clienteRes.body);
    const clienteId = clienteBody.id;
    const listaClientes = await request('GET', '/api/clientes');
    const clienteGuardado = JSON.parse(listaClientes.body).find(cliente => cliente.id === clienteId);
    if (clienteGuardado.direccion_trabajo !== 'Carrera 10 #20-30') {
      throw new Error(`La dirección de trabajo no se conservó: ${listaClientes.body}`);
    }

    const prestamoRes = await request('POST', '/api/prestamos', {
      cliente_id: clienteId,
      monto: 1000,
      frecuencia_pago: 'Semanal',
      numero_cuotas: 4
    });

    if (prestamoRes.statusCode !== 201) {
      console.error('No se pudo crear el préstamo de prueba:', prestamoRes.statusCode, prestamoRes.body);
      process.exit(1);
    }

    const prestamoBody = JSON.parse(prestamoRes.body);
    const prestamoId = prestamoBody.id;
    const fechaEsperada = new Date(`${fechaColombia()}T00:00:00Z`);
    fechaEsperada.setUTCDate(fechaEsperada.getUTCDate() + 28);
    if (prestamoBody.valor_cuota !== 300
      || prestamoBody.fecha_prestamo !== fechaColombia()
      || prestamoBody.fecha_limite !== fechaEsperada.toISOString().split('T')[0]) {
      throw new Error(`El resumen de cuotas no coincide con la frecuencia semanal: ${prestamoRes.body}`);
    }

    const prestamoInvalido = await request('POST', '/api/prestamos', {
      cliente_id: clienteId,
      monto: 1000,
      frecuencia_pago: 'Semanal',
      numero_cuotas: 0
    });
    if (prestamoInvalido.statusCode !== 400) {
      throw new Error(`Se esperaba rechazar el número de cuotas inválido: ${prestamoInvalido.body}`);
    }

    const listaPrestamos = await request('GET', '/api/prestamos');
    const prestamoGuardado = JSON.parse(listaPrestamos.body).find(prestamo => prestamo.id === prestamoId);
    if (prestamoGuardado.frecuencia_pago !== 'Semanal' || prestamoGuardado.numero_cuotas !== 4) {
      throw new Error(`La modalidad y el número de cuotas no se conservaron: ${listaPrestamos.body}`);
    }

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
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})();
