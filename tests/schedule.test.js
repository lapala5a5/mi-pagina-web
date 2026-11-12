const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class InputElement {
    constructor() {
        this.dataset = {};
    }
}

function crearElemento() {
    return {
        children: [],
        dataset: {},
        value: "",
        textContent: "",
        append(...hijos) {
            this.children.push(...hijos);
        },
        replaceChildren(...hijos) {
            this.children = hijos;
        },
        setCustomValidity() {}
    };
}

const elementos = new Map([
    ["pres-monto", { value: "100" }],
    ["pres-porcentaje", { value: "20" }],
    ["pres-frecuencia", { value: "Semanal" }],
    ["pres-cuotas", { value: "3" }],
    ["pres-fecha-inicio", { value: "2026-10-31", setCustomValidity() {} }],
    ["pres-calendario", crearElemento()],
    ["pres-fecha-resumen", crearElemento()],
    ["pres-total", crearElemento()],
    ["pres-porcentaje-etiqueta", crearElemento()],
    ["pres-valor-cuota", crearElemento()]
]);
const contexto = {
    document: {
        addEventListener() {},
        getElementById(id) {
            return elementos.get(id);
        },
        createElement: crearElemento
    },
    HTMLInputElement: InputElement,
    URLSearchParams,
    window: {}
};
const codigoApp = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
vm.runInNewContext(codigoApp, contexto);

function fechasDesdeRegistro(fechaRegistro, frecuencia, cuotas) {
    return Array.from({ length: cuotas }, (_, indice) =>
        contexto.fechaCobro(fechaRegistro, frecuencia, indice)
    );
}

assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Diario", 3), [
    "2026-10-31",
    "2026-11-01",
    "2026-11-02"
]);
assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Semanal", 3), [
    "2026-10-31",
    "2026-11-07",
    "2026-11-14"
]);
assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Quincenal", 3), [
    "2026-10-31",
    "2026-11-15",
    "2026-11-30"
]);
assert.deepEqual(fechasDesdeRegistro("2026-10-31", "Mensual", 3), [
    "2026-10-31",
    "2026-11-30",
    "2026-12-31"
]);
assert.equal(contexto.fechaCobro("2026-01-31", "Quincenal", 1), "2026-02-15");
assert.equal(contexto.fechaCobro("2026-01-31", "Quincenal", 2), "2026-03-02");

contexto.actualizarTotalPrestamo();
const filasCalendario = elementos.get("pres-calendario").children;
assert.equal(filasCalendario.length, 3, "Debe mostrar una fila por cada cuota.");
assert.equal(filasCalendario[0].children[0].children[1].value, "2026-10-31");
assert.equal(filasCalendario[1].children[0].children[1].value, "2026-11-07");
assert.equal(filasCalendario[2].children[0].children[1].value, "2026-11-14");

contexto.actualizarFechaCuota({
    target: Object.assign(new InputElement(), {
        dataset: { cuotaIndex: "0" },
        value: "2026-10-25"
    })
});
assert.equal(elementos.get("pres-fecha-inicio").value, "2026-10-25");
assert.deepEqual(
    elementos.get("pres-calendario").children.map(fila => fila.children[0].children[1].value),
    ["2026-10-25", "2026-11-01", "2026-11-08"]
);

elementos.get("pres-fecha-inicio").value = "2026-10-20";
contexto.actualizarCalendarioAutomatico();
assert.deepEqual(
    elementos.get("pres-calendario").children.map(fila => fila.children[0].children[1].value),
    ["2026-10-20", "2026-10-27", "2026-11-03"]
);

console.log("El calendario permite editar la fecha de inicio y recalcula sus cuotas.");
