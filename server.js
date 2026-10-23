const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("prestamos.db");

// Habilitar claves foráneas para borrado en cascada
db.pragma("foreign_keys = ON");

// Logger de consola para monitorear solicitudes de Ngrok
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Middleware CORS manual
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Bypass-Tunnel-Reminder");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function fechaHoyColombia() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${valores.year}-${valores.month}-${valores.day}`;
}

// --- TABLAS ---
function tableHasColumn(tableName, columnName) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some(column => column.name === columnName);
}


db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        documento TEXT UNIQUE NOT NULL,
        telefono TEXT,
        direccion TEXT,
        fecha_registro TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prestamos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL,
        monto REAL NOT NULL,
        porcentaje REAL NOT NULL,
        interes REAL NOT NULL,
        total REAL NOT NULL,
        saldo_actual REAL NOT NULL DEFAULT 0,
        fecha_prestamo TEXT NOT NULL,
        fecha_limite TEXT,
        frecuencia_pago TEXT NOT NULL DEFAULT 'Sin definir',
        numero_cuotas INTEGER NOT NULL DEFAULT 1,
        estado TEXT CHECK(estado IN ('Pendiente', 'Pagado')) NOT NULL,
        fecha_actualizacion TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prestamo_id INTEGER NOT NULL,
        monto REAL NOT NULL,
        fecha_pago TEXT NOT NULL,
        metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
        observacion TEXT DEFAULT '',
        FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE
    );
`);

if (!tableHasColumn("prestamos", "saldo_actual")) {
    db.exec("ALTER TABLE prestamos ADD COLUMN saldo_actual REAL NOT NULL DEFAULT 0");
}

if (!tableHasColumn("prestamos", "fecha_actualizacion")) {
    db.exec("ALTER TABLE prestamos ADD COLUMN fecha_actualizacion TEXT");
}

if (!tableHasColumn("prestamos", "frecuencia_pago")) {
    db.exec("ALTER TABLE prestamos ADD COLUMN frecuencia_pago TEXT NOT NULL DEFAULT 'Sin definir'");
}

if (!tableHasColumn("prestamos", "numero_cuotas")) {
    db.exec("ALTER TABLE prestamos ADD COLUMN numero_cuotas INTEGER NOT NULL DEFAULT 1");
}

db.prepare("UPDATE prestamos SET saldo_actual = CASE WHEN estado = 'Pagado' THEN 0 ELSE total END WHERE saldo_actual IS NULL OR saldo_actual = 0").run();

if (!tableHasColumn("pagos", "prestamo_id")) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prestamo_id INTEGER NOT NULL,
            monto REAL NOT NULL,
            fecha_pago TEXT NOT NULL,
            metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
            observacion TEXT DEFAULT '',
            FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE
        );
    `);
}


const actualizarEstadoPrestamo = (prestamoId) => {
    const prestamo = db.prepare("SELECT total, saldo_actual FROM prestamos WHERE id = ?").get(prestamoId);
    if (!prestamo) return;

    const saldo = Number(prestamo.saldo_actual || 0);
    const estado = saldo <= 0 ? "Pagado" : "Pendiente";
    db.prepare("UPDATE prestamos SET estado = ?, fecha_actualizacion = ? WHERE id = ?").run(estado, fechaHoyColombia(), prestamoId);
};

// --- RUTAS DE CLIENTES ---
app.get("/api/clientes", (req, res) => {
    try {
        const clientes = db.prepare("SELECT * FROM clientes ORDER BY id DESC").all();
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/clientes", (req, res) => {
    try {
        const { nombre, documento, telefono, direccion } = req.body;
        if (!nombre || !documento) return res.status(400).json({ error: "Nombre y documento requeridos" });
        const fecha = fechaHoyColombia();
        const resDb = db.prepare("INSERT INTO clientes (nombre, documento, telefono, direccion, fecha_registro) VALUES (?, ?, ?, ?, ?)").run(nombre, documento, telefono || "", direccion || "", fecha);
        res.json({ mensaje: "Cliente registrado", id: resDb.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function borrarClienteDB(id) {
    db.prepare("DELETE FROM prestamos WHERE cliente_id = ?").run(id);
    return db.prepare("DELETE FROM clientes WHERE id = ?").run(id);
}

app.delete("/api/clientes/:id", (req, res) => {
    try {
        const resultado = borrarClienteDB(req.params.id);
        if (resultado.changes === 0) return res.status(404).json({ error: "Cliente no encontrado" });
        res.json({ mensaje: "Cliente eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/clientes/:id/eliminar", (req, res) => {
    try {
        const resultado = borrarClienteDB(req.params.id);
        if (resultado.changes === 0) return res.status(404).json({ error: "Cliente no encontrado" });
        res.json({ mensaje: "Cliente eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS DE PRÉSTAMOS ---
const frecuenciasPago = new Set(["Diario", "Semanal", "Quincenal", "Mensual"]);

function calcularFechaCobro(fechaInicio, frecuencia, numeroCuota) {
    const [anio, mes, dia] = fechaInicio.split("-").map(Number);

    if (frecuencia === "Mensual") {
        const mesObjetivo = mes - 1 + numeroCuota;
        const ultimoDia = new Date(Date.UTC(anio, mesObjetivo + 1, 0)).getUTCDate();
        return new Date(Date.UTC(anio, mesObjetivo, Math.min(dia, ultimoDia))).toISOString().split("T")[0];
    }

    const diasPorFrecuencia = { Diario: 1, Semanal: 7, Quincenal: 14 };
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    fecha.setUTCDate(fecha.getUTCDate() + diasPorFrecuencia[frecuencia] * numeroCuota);
    return fecha.toISOString().split("T")[0];
}

app.get("/api/prestamos", (req, res) => {
    try {
        const prestamos = db.prepare(`
            SELECT p.id, p.cliente_id, c.nombre AS cliente, c.telefono, p.monto, p.porcentaje, p.interes, p.total, p.saldo_actual, p.fecha_prestamo, p.fecha_limite, p.frecuencia_pago, p.numero_cuotas, p.estado,
                   (p.total - p.saldo_actual) AS pagado
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            ORDER BY p.id DESC
        `).all();
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/prestamos", (req, res) => {
    try {
        const { cliente_id, monto, frecuencia_pago, numero_cuotas } = req.body;
        if (!cliente_id || monto === undefined || !frecuencia_pago || numero_cuotas === undefined) {
            return res.status(400).json({ error: "Cliente, monto, frecuencia de pago y número de cuotas son requeridos" });
        }

        const clienteExiste = db.prepare("SELECT id FROM clientes WHERE id = ?").get(cliente_id);
        if (!clienteExiste) return res.status(404).json({ error: "Cliente no encontrado" });

        const montoNumber = Number(monto);
        if (!Number.isFinite(montoNumber) || montoNumber <= 0) return res.status(400).json({ error: "El monto debe ser mayor a cero" });
        if (!frecuenciasPago.has(frecuencia_pago)) {
            return res.status(400).json({ error: "La frecuencia de pago no es válida" });
        }

        const numeroCuotas = Number(numero_cuotas);
        if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1 || numeroCuotas > 120) {
            return res.status(400).json({ error: "El número de cuotas debe ser un entero entre 1 y 120" });
        }

        const interes = montoNumber * 0.20;
        const total = montoNumber + interes;
        const fecha = fechaHoyColombia();
        const fechaLimite = calcularFechaCobro(fecha, frecuencia_pago, numeroCuotas);
        const resDb = db.prepare("INSERT INTO prestamos (cliente_id, monto, porcentaje, interes, total, saldo_actual, fecha_prestamo, fecha_limite, frecuencia_pago, numero_cuotas, estado, fecha_actualizacion) VALUES (?, ?, 20, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)").run(cliente_id, montoNumber, interes, total, total, fecha, fechaLimite, frecuencia_pago, numeroCuotas, fecha);
        res.json({
            mensaje: "Préstamo registrado",
            id: resDb.lastInsertRowid,
            total,
            saldo_actual: total,
            valor_cuota: total / numeroCuotas,
            fecha_prestamo: fecha,
            fecha_limite: fechaLimite
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/pagos/:prestamo_id", (req, res) => {
    try {
        const pagos = db.prepare("SELECT * FROM pagos WHERE prestamo_id = ? ORDER BY fecha_pago DESC, id DESC").all(req.params.prestamo_id);
        res.json(pagos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/pagos", (req, res) => {
    try {
        const { prestamo_id, monto, metodo_pago, observacion } = req.body;

        if (!prestamo_id || !monto) {
            return res.status(400).json({ error: "prestamo_id y monto son requeridos" });
        }

        const prestamo = db.prepare("SELECT * FROM prestamos WHERE id = ?").get(prestamo_id);
        if (!prestamo) {
            return res.status(404).json({ error: "Préstamo no encontrado" });
        }

        const montoPago = Number(monto);
        if (Number.isNaN(montoPago) || montoPago <= 0) {
            return res.status(400).json({ error: "El monto del pago debe ser mayor a cero" });
        }

        const saldoActual = Number(prestamo.saldo_actual || 0);
        if (montoPago > saldoActual) {
            return res.status(400).json({ error: "El pago excede el saldo pendiente del préstamo" });
        }

        const fecha = fechaHoyColombia();
        const pagoResult = db.prepare("INSERT INTO pagos (prestamo_id, monto, fecha_pago, metodo_pago, observacion) VALUES (?, ?, ?, ?, ?)").run(prestamo_id, montoPago, fecha, metodo_pago || "efectivo", observacion || "");

        const nuevoSaldo = saldoActual - montoPago;
        db.prepare("UPDATE prestamos SET saldo_actual = ?, estado = ?, fecha_actualizacion = ? WHERE id = ?").run(nuevoSaldo, nuevoSaldo <= 0 ? "Pagado" : "Pendiente", fecha, prestamo_id);

        const pago = db.prepare("SELECT * FROM pagos WHERE id = ?").get(pagoResult.lastInsertRowid);

        res.status(201).json({ mensaje: "Pago registrado", pago, saldo_actual: nuevoSaldo, estado: nuevoSaldo <= 0 ? "Pagado" : "Pendiente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put("/api/prestamos/:id/pagar", (req, res) => {
    try {
        const prestamo = db.prepare("SELECT total, saldo_actual FROM prestamos WHERE id = ?").get(req.params.id);
        if (!prestamo) {
            return res.status(404).json({ error: "Préstamo no encontrado" });
        }

        const fecha = fechaHoyColombia();
        const saldoActual = Number(prestamo.saldo_actual || 0);
        const montoPago = saldoActual > 0 ? saldoActual : 0;

        if (montoPago > 0) {
            db.prepare("INSERT INTO pagos (prestamo_id, monto, fecha_pago, metodo_pago, observacion) VALUES (?, ?, ?, 'manual', 'Pago total del préstamo')").run(req.params.id, montoPago, fecha);
        }

        db.prepare("UPDATE prestamos SET saldo_actual = 0, estado = 'Pagado', fecha_actualizacion = ? WHERE id = ?").run(fecha, req.params.id);
        res.json({ mensaje: "Préstamo pagado", saldo_actual: 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/api/prestamos/:id", (req, res) => {
    try {
        db.prepare("DELETE FROM prestamos WHERE id = ?").run(req.params.id);
        res.json({ mensaje: "Préstamo eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/resumen", (req, res) => {
    try {
        const hoy = fechaHoyColombia();
        const resumen = db.prepare(`
            SELECT
                COALESCE(SUM(monto), 0) AS dinero_prestado,
                COALESCE(SUM(interes), 0) AS intereses_generados,
                COALESCE(SUM(CASE WHEN estado = 'Pendiente' THEN saldo_actual ELSE 0 END), 0) AS dinero_por_cobrar,
                COALESCE(COUNT(CASE WHEN estado = 'Pendiente' AND fecha_limite < ? AND saldo_actual > 0 THEN 1 END), 0) AS prestamos_vencidos
            FROM prestamos
        `).get(hoy);
        res.json(resumen);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ESCUCHAR EN 0.0.0.0
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});