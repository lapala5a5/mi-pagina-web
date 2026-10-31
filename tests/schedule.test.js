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

function fechasAnteriores(fechaFinal, frecuencia, cuotas) {
    return Array.from({ length: cuotas }, (_, indice) =>
        contexto.fechaCobro(fechaFinal, frecuencia, indice - (cuotas - 1))
    );
}

assert.deepEqual(fechasAnteriores("2026-10-31", "Diario", 3), [
    "2026-10-29",
    "2026-10-30",
    "2026-10-31"
]);
assert.deepEqual(fechasAnteriores("2026-10-31", "Semanal", 3), [
    "2026-10-17",
    "2026-10-24",
    "2026-10-31"
]);
assert.deepEqual(fechasAnteriores("2026-10-31", "Quincenal", 3), [
    "2026-10-03",
    "2026-10-17",
    "2026-10-31"
]);
assert.deepEqual(fechasAnteriores("2026-10-31", "Mensual", 3), [
    "2026-08-31",
    "2026-09-30",
    "2026-10-31"
]);

console.log("El calendario calcula las cuotas anteriores desde la fecha final elegida.");
