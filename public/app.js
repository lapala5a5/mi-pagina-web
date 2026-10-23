// Cargar todo al iniciar la página
document.addEventListener("DOMContentLoaded", () => {
    cargarClientes();
    cargarPrestamos();
    cargarResumen();

    document.getElementById("form-operacion").addEventListener("submit", registrarOperacion);
    document.querySelectorAll('input[name="tipo-cliente"]').forEach(opcion => {
        opcion.addEventListener("change", actualizarTipoCliente);
    });
    document.getElementById("pres-monto").addEventListener("input", actualizarTotalPrestamo);
    document.getElementById("form-operacion").addEventListener("reset", () => {
        setTimeout(() => {
            actualizarTipoCliente();
            actualizarTotalPrestamo();
        });
    });
    actualizarTipoCliente();
});

// Cabeceras globales para evitar problemas con Ngrok
const HEADERS_BASE = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true"
};

// --- CLIENTES ---

// 1. Obtener y mostrar clientes
async function cargarClientes() {
    try {
        const res = await fetch("/api/clientes", { headers: HEADERS_BASE });
        const clientes = await res.json();

        // Actualizar selector de cliente en el formulario unificado
        const select = document.getElementById("pres-cliente");
        if (select) {
            const clienteSeleccionado = select.value;
            select.replaceChildren(new Option("Seleccione un cliente...", ""));
            clientes.forEach(cliente => {
                select.add(new Option(`${cliente.nombre} (${cliente.documento})`, cliente.id));
            });
            if (clientes.some(cliente => String(cliente.id) === clienteSeleccionado)) {
                select.value = clienteSeleccionado;
            }
            document.getElementById("sin-clientes-aviso").classList.toggle("hidden", clientes.length > 0);
            document.querySelector('input[name="tipo-cliente"][value="existente"]').disabled = clientes.length === 0;
            if (clientes.length === 0) {
                document.querySelector('input[name="tipo-cliente"][value="nuevo"]').checked = true;
                actualizarTipoCliente();
            }
        }

        // Actualizar Tabla de clientes
        const tbody = document.getElementById("tabla-clientes");
        if (tbody) {
            tbody.innerHTML = "";
            if (clientes.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay clientes registrados.</td></tr>`;
                return;
            }

            clientes.forEach(c => {
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50 text-sm">
                        <td class="p-3 font-medium">${c.nombre}</td>
                        <td class="p-3">${c.documento}</td>
                        <td class="p-3">${c.telefono || 'N/A'}</td>
                        <td class="p-3">
                            <button onclick="eliminarCliente(${c.id}, '${c.nombre}')" class="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 font-semibold transition">
                                Eliminar Cliente
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error("Error al cargar clientes:", error);
    }
}

function actualizarTipoCliente() {
    const opcionesCliente = document.querySelectorAll('input[name="tipo-cliente"]');
    const tieneClientes = !opcionesCliente[0].disabled;
    if (!tieneClientes) {
        opcionesCliente[1].checked = true;
    }
    const esNuevo = document.querySelector('input[name="tipo-cliente"]:checked').value === "nuevo";
    document.getElementById("cliente-existente-campo").classList.toggle("hidden", esNuevo);
    document.getElementById("nuevo-cliente-campos").classList.toggle("hidden", !esNuevo);

    const selector = document.getElementById("pres-cliente");
    selector.required = !esNuevo;
    document.getElementById("cli-nombre").required = esNuevo;
    document.getElementById("cli-documento").required = esNuevo;
}

function actualizarTotalPrestamo() {
    const monto = Number(document.getElementById("pres-monto").value) || 0;
    document.getElementById("pres-total").textContent = `$${(monto * 1.2).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
}

// Registrar el cliente (si es nuevo) y su préstamo desde un único formulario.
async function registrarOperacion(e) {
    e.preventDefault();
    const esNuevo = document.querySelector('input[name="tipo-cliente"]:checked').value === "nuevo";
    let clienteId = document.getElementById("pres-cliente").value;
    let clienteCreado = false;

    try {
        if (esNuevo) {
            const clienteRes = await fetch("/api/clientes", {
                method: "POST",
                headers: HEADERS_BASE,
                body: JSON.stringify({
                    nombre: document.getElementById("cli-nombre").value.trim(),
                    documento: document.getElementById("cli-documento").value.trim(),
                    telefono: document.getElementById("cli-telefono").value.trim(),
                    direccion: document.getElementById("cli-direccion").value.trim()
                })
            });
            const clienteData = await clienteRes.json();
            if (!clienteRes.ok) {
                alert("No se pudo registrar el cliente: " + (clienteData.error || "Error desconocido"));
                return;
            }
            clienteId = clienteData.id;
            clienteCreado = true;
        }

        const prestamoRes = await fetch("/api/prestamos", {
            method: "POST",
            headers: HEADERS_BASE,
            body: JSON.stringify({
                cliente_id: clienteId,
                monto: document.getElementById("pres-monto").value,
                fecha_limite: document.getElementById("pres-limite").value
            })
        });
        const prestamoData = await prestamoRes.json();

        if (!prestamoRes.ok) {
            if (clienteCreado) {
                await cargarClientes();
                alert(`El cliente quedó registrado, pero no se pudo crear el préstamo: ${prestamoData.error || "Error desconocido"}`);
            } else {
                alert("No se pudo crear el préstamo: " + (prestamoData.error || "Error desconocido"));
            }
            return;
        }

        document.getElementById("form-operacion").reset();
        await Promise.all([cargarClientes(), cargarPrestamos(), cargarResumen()]);
        alert(clienteCreado ? "Cliente y préstamo registrados correctamente" : "Préstamo registrado correctamente");
    } catch (error) {
        console.error("Error al registrar cliente y préstamo:", error);
        if (clienteCreado) {
            await cargarClientes();
            alert("El cliente quedó registrado, pero hubo un error de conexión al crear el préstamo.");
        } else {
            alert("Error de conexión con el servidor");
        }
    }
}

// 3. Eliminar cliente y todo su historial
async function eliminarCliente(id, nombre) {
    if (!confirm(`¿Estás seguro de eliminar a "${nombre}"? Se borrarán sus datos y TODO su historial de préstamos.`)) {
        return;
    }

    try {
        // Intento 1: Vía POST de respaldo
        let res = await fetch(`/api/clientes/${id}/eliminar`, {
            method: "POST",
            headers: HEADERS_BASE
        });

        // Intento 2: Vía DELETE estándar
        if (!res.ok) {
            res = await fetch(`/api/clientes/${id}`, {
                method: "DELETE",
                headers: HEADERS_BASE
            });
        }

        if (res.ok) {
            cargarClientes();
            cargarPrestamos();
            cargarResumen();
        } else {
            const data = await res.json();
            alert("Error: " + (data.error || "No se pudo eliminar el cliente"));
        }
    } catch (err) {
        console.error("Error al eliminar cliente:", err);
        alert("Error de red al conectar con el servidor.");
    }
}


// --- PRÉSTAMOS ---

// 4. Obtener y mostrar préstamos
async function cargarPrestamos() {
    try {
        const res = await fetch("/api/prestamos", { headers: HEADERS_BASE });
        const prestamos = await res.json();

        const tbody = document.getElementById("tabla-prestamos");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (prestamos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500">No hay préstamos activos.</td></tr>`;
            return;
        }

        prestamos.forEach(p => {
            const estadoColor = p.estado === 'Pagado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            const saldoActual = Number(p.saldo_actual || 0);

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 text-sm">
                    <td class="p-3 font-medium">${p.cliente}</td>
                    <td class="p-3">$${Number(p.monto).toLocaleString()}</td>
                    <td class="p-3 font-semibold text-gray-700">$${saldoActual.toLocaleString()}</td>
                    <td class="p-3 font-bold">$${Number(p.total).toLocaleString()}</td>
                    <td class="p-3">${p.fecha_limite || 'Sin fecha'}</td>
                    <td class="p-3">
                        <span class="px-2 py-1 rounded-full text-xs font-semibold ${estadoColor}">
                            ${p.estado}
                        </span>
                    </td>
                    <td class="p-3 space-x-1">
                        ${p.estado === 'Pendiente' ? `
                            <button onclick="abonarPrestamo(${p.id}, '${p.cliente}', '${p.telefono || ''}')" class="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 font-semibold transition">
                                Abonar
                            </button>
                            <button onclick="marcarPagado(${p.id})" class="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 font-semibold transition">
                                Pagar todo
                            </button>
                        ` : ''}
                        <button onclick="eliminarPrestamo(${p.id})" class="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 font-semibold transition">
                            Borrar
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error al cargar préstamos:", error);
    }
}

// 6. Marcar préstamo como pagado
async function marcarPagado(id) {
    try {
        const res = await fetch(`/api/prestamos/${id}/pagar`, {
            method: "PUT",
            headers: HEADERS_BASE
        });

        const data = await res.json();

        if (res.ok) {
            cargarPrestamos();
            cargarResumen();
            alert(data.mensaje || "Préstamo pagado");
        } else {
            alert("Error: " + (data.error || "No se pudo actualizar el préstamo"));
        }
    } catch (error) {
        console.error("Error al pagar préstamo:", error);
    }
}

async function abonarPrestamo(id, cliente, telefono) {
    const monto = prompt(`Ingrese el monto a abonar para ${cliente}:`);
    if (monto === null || monto === "") return;

    const montoNum = Number(monto);
    if (Number.isNaN(montoNum) || montoNum <= 0) {
        alert("El monto debe ser válido");
        return;
    }

    try {
        const res = await fetch('/api/pagos', {
            method: 'POST',
            headers: HEADERS_BASE,
            body: JSON.stringify({
                prestamo_id: id,
                monto: montoNum,
                metodo_pago: 'efectivo',
                observacion: 'Abono desde el panel'
            })
        });

        const data = await res.json();

        if (res.ok) {
            cargarPrestamos();
            cargarResumen();
            if (telefono) {
                enviarWhatsApp(telefono, cliente, montoNum);
            }
            alert(data.mensaje || 'Pago registrado con éxito');
        } else {
            alert('Error: ' + (data.error || 'No se pudo registrar el pago'));
        }
    } catch (error) {
        console.error('Error al registrar abono:', error);
    }
}

// 7. Eliminar préstamo individual
async function eliminarPrestamo(id) {
    if (!confirm("¿Deseas borrar este registro de préstamo?")) return;

    try {
        const res = await fetch(`/api/prestamos/${id}/eliminar`, {
            method: "POST",
            headers: HEADERS_BASE
        });

        const data = await res.json();

        if (res.ok) {
            cargarPrestamos();
            cargarResumen();
        } else {
            alert("Error al borrar préstamo: " + (data.error || "Error desconocido"));
        }
    } catch (error) {
        console.error("Error al eliminar préstamo:", error);
        alert("Error de red al conectar con el servidor.");
    }
}


// --- RESUMEN DE MÉTRICAS ---

// 8. Cargar contadores y totales
async function cargarResumen() {
    try {
        const res = await fetch("/api/resumen", { headers: HEADERS_BASE });
        const data = await res.json();

        const elemPrestado = document.getElementById("res-prestado");
        const elemIntereses = document.getElementById("res-intereses");
        const elemCobrar = document.getElementById("res-cobrar");
        const elemVencidos = document.getElementById("res-vencidos");

        if (elemPrestado) elemPrestado.textContent = `$${Number(data.dinero_prestado || 0).toLocaleString()}`;
        if (elemIntereses) elemIntereses.textContent = `$${Number(data.intereses_generados || 0).toLocaleString()}`;
        if (elemCobrar) elemCobrar.textContent = `$${Number(data.dinero_por_cobrar || 0).toLocaleString()}`;
        if (elemVencidos) elemVencidos.textContent = data.prestamos_vencidos || 0;
    } catch (error) {
        console.error("Error al cargar resumen:", error);
    }
}// Función para registrar pago y enviar comprobante
async function registrarPago(clienteId, montoPagado, saldoRestante, telefonoCliente, nombreCliente) {
    try {
        const response = await fetch('/api/pagos', {
            method: 'POST',
            headers: { 'Content-Type': 'json' },
            body: JSON.stringify({ clienteId, monto: montoPagado })
        });

        if (response.ok) {
            // 1. Limpiar el formato del número telefónico (Asegurar código de país, ej: Colombia 57)
            let telefonoLimpio = telefonoCliente.replace(/\D/g, ''); 
            if (!telefonoLimpio.startsWith('57')) {
                telefonoLimpio = '57' + telefonoLimpio; // Agrega prefijo si no lo tiene
            }

            // 2. Armar el texto del recibo con Saltos de línea (%0A) y negritas (*)
            const fecha = new Date().toLocaleDateString('es-CO');
            const mensaje = `*COMPROBANTE DE PAGO*%0A%0A` +
                            `*Cliente:* ${encodeURIComponent(nombreCliente)}%0A` +
                            `*Fecha:* ${fecha}%0A` +
                            `*Monto Pagado:* $${montoPagado.toLocaleString()}%0A` +
                            `*Saldo Pendiente:* $${saldoRestante.toLocaleString()}%0A%0A` +
                            `¡Gracias por su pago!`;

            // 3. Crear la URL de WhatsApp
            const urlWhatsApp = `https://wa.me/${telefonoLimpio}?text=${mensaje}`;

            // 4. Abrir WhatsApp automáticamente
            window.open(urlWhatsApp, '_blank');
            
            alert('Pago registrado y comprobante generado.');
        }
    } catch (error) {
        console.error('Error al registrar pago:', error);
    }
}// Ejemplo de renderizado de tarjeta/fila de cliente
function renderizarCliente(cliente) {
    const telefonoLimpio = '57' + cliente.telefono.replace(/\D/g, '');
    const mensajeEstado = `Hola ${encodeURIComponent(cliente.nombre)}, te recordamos que tu saldo actual es de *$${cliente.saldo.toLocaleString()}*.`;
    const urlWa = `https://wa.me/${telefonoLimpio}?text=${mensajeEstado}`;

    return `
        <div class="card-cliente">
            <h3>${cliente.nombre}</h3>
            <p>Saldo: $${cliente.saldo}</p>
            
            <!-- Botón de WhatsApp -->
            <a href="${urlWa}" target="_blank" class="btn-whatsapp">
                📲 Enviar Estado por WhatsApp
            </a>
        </div>
    `;
}
function enviarWhatsApp(telefono, cliente, monto) {
    if (!telefono) {
        alert("Este cliente no tiene un número de teléfono registrado.");
        return;
    }

    // Limpia caracteres no numéricos
    let numeroLimpio = telefono.replace(/\D/g, '');

    // Si el número tiene 10 dígitos (ej. 3001234567 en Colombia), le añade el código de país +57
    if (numeroLimpio.length === 10) {
        numeroLimpio = '57' + numeroLimpio;
    }

    const mensaje = `Hola ${cliente}, te escribo para recordarte tu cuota/préstamo de $${monto}. Quedo atento.`;
    const url = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;

    window.open(url, '_blank');
}