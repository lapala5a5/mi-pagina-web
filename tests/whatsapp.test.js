const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contexto = {
    document: { addEventListener() {} },
    URLSearchParams,
    window: {}
};
const codigoApp = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
vm.runInNewContext(codigoApp, contexto);

const url = contexto.crearEnlaceAlertaWhatsApp({
    nombre: "Ana Pérez",
    documento: "123",
    telefono: "3001234567",
    direccion: "",
    direccion_trabajo: "Carrera 10"
}, {
    monto: "100000",
    frecuencia: "Mensual",
    cuotas: "4",
    valorCuota: "$30.000",
    fechaLimite: "2026-12-24"
});
const enlace = new URL(url);
const mensaje = enlace.searchParams.get("text");

assert.equal(enlace.origin, "https://wa.me");
assert.equal(enlace.pathname, "/573205486261");
assert.match(mensaje, /Nombre: Ana Pérez/);
assert.match(mensaje, /Documento: 123/);
assert.match(mensaje, /Teléfono: 3001234567/);
assert.match(mensaje, /Dirección: No registrado/);
assert.match(mensaje, /Dirección de trabajo: Carrera 10/);
assert.match(mensaje, /Monto del préstamo: \$100\.000/);
assert.match(mensaje, /Interés \(20%\): \$20\.000/);
assert.match(mensaje, /Total a pagar: \$120\.000/);
assert.match(mensaje, /Frecuencia de pago: Mensual/);
assert.match(mensaje, /Número de cuotas: 4/);
assert.match(mensaje, /Valor por cuota: \$30\.000/);
assert.match(mensaje, /Fecha de la última cuota: 2026-12-24/);
const enlaceCalendario = mensaje.match(/https:\/\/calendar\.google\.com\/calendar\/render\?\S+/)?.[0];
assert.ok(enlaceCalendario, "El mensaje debe incluir un enlace para agregar el vencimiento al calendario.");
const calendario = new URL(enlaceCalendario);
assert.equal(calendario.searchParams.get("action"), "TEMPLATE");
assert.equal(calendario.searchParams.get("dates"), "20261224/20261225");
assert.match(calendario.searchParams.get("text"), /Ana Pérez/);
assert.match(calendario.searchParams.get("details"), /Configura una notificación/);
const sinFecha = contexto.crearEnlaceCalendario({ nombre: "Ana Pérez" }, { fechaLimite: "" });
assert.equal(sinFecha, "", "No se debe crear un enlace de alarma si falta una fecha válida.");
assert.equal(url.includes("token"), false);

console.log("El enlace prepara los datos del cliente para enviarlos por WhatsApp.");
