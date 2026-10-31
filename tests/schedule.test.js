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

function fechasDesdeRegistro(fechaRegistro, frecuencia, cuotas) {
    return Array.from({ length: cuotas }, (_, indice) =>
        contexto.fechaCobro(fechaRegistro, frecuencia, indice + 1)
    );
}

assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Diario", 3), [
    "2026-11-01",
    "2026-11-02",
    "2026-11-03"
]);
assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Semanal", 3), [
    "2026-11-07",
    "2026-11-14",
    "2026-11-21"
]);
assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Quincenal", 3), [
    "2026-11-15",
    "2026-11-30",
    "2026-12-15"
]);
assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Mensual", 3), [
    "2026-11-30",
    "2026-12-31",
    "2027-01-31"
]);
assert.equal(contexto.fechaCobro("2026-01-31", "Quincenal", 1), "2026-02-15");
assert.equal(contexto.fechaCobro("2026-01-31", "Quincenal", 2), "2026-03-02");

console.log("El calendario calcula las cuotas desde la fecha de registro del cliente.");
