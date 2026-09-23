const CONFIG = {
  multiplicadorStock: 2,
  diasReposicionFallback: 30,
  topProductos: 5,
  zonaHoraria: "America/Mexico_City",
};

function obtenerReposicion(texto) {
  const normalizado =
    typeof texto === "string" ? texto.trim().toLowerCase() : "";

  if (normalizado === "ships overnight") {
    return { leadTimeDays: 1, usoFallback: false };
  }

  const coincidencia = normalizado.match(
    /^ships in (\d+)(?:-(\d+))? (business days?|days?|weeks?|months?)$/,
  );

  if (coincidencia) {
    const inicio = Number(coincidencia[1]);
    const cantidad = Number(coincidencia[2] ?? coincidencia[1]);
    const unidad = coincidencia[3];

    // Aproximamos días hábiles a calendario, sin considerar festivos.
    const factor = unidad.startsWith("business day")
      ? 7 / 5
      : unidad.startsWith("week")
        ? 7
        : unidad.startsWith("month")
          ? 30
          : 1;

    const dias = Math.ceil(cantidad * factor);

    if (inicio > 0 && cantidad >= inicio && Number.isSafeInteger(dias)) {
      return { leadTimeDays: dias, usoFallback: false };
    }
  }

  return {
    leadTimeDays: CONFIG.diasReposicionFallback,
    usoFallback: true,
  };
}

function construirMensaje(totalAnalizados, productosOrdenados) {
  const prioritarios = productosOrdenados.slice(0, CONFIG.topProductos);
  const adicionales = productosOrdenados.length - prioritarios.length;

  const fecha = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeZone: CONFIG.zonaHoraria,
  }).format(new Date());

  const encabezado = [
    `REABASTECIMIENTO — ${fecha}`,
    "",
    `Se revisaron ${totalAnalizados} productos.`,
    `${productosOrdenados.length} requieren atención según el umbral de inventario.`,
  ];

  if (prioritarios.length === 0) {
    return [
      ...encabezado,
      "",
      "Sin alertas de stock bajo en esta revisión.",
      "Próxima acción: mantener la revisión diaria.",
    ].join("\n");
  }

  const detalle = prioritarios.map((producto, indice) => {
    const estado = producto.stock === 0 ? " — AGOTADO" : "";
    const reposicion = producto.usoFallback
      ? `${producto.leadTimeDays} días (supuesto; confirmar plazo)`
      : `${producto.leadTimeDays} días aprox.`;

    return [
      `${indice + 1}. ${producto.title}${estado}`,
      `Referencia: ${producto.id}`,
      `Stock: ${producto.stock} | Pedido mínimo: ${producto.minimumOrderQuantity}`,
      `Reposición estimada: ${reposicion}`,
    ].join("\n");
  });

  return [
    ...encabezado,
    "",
    `⚠️ PRIORIDAD PARA HOY: ${prioritarios.length} productos`,
    "",
    detalle.join("\n\n"),
    "",
    "👉 Revisar hoy el pedido de estas referencias y confirmar disponibilidad y plazo con el proveedor.",
    "",
    `${adicionales} productos adicionales con stock bajo quedan pendientes de revisión.`,
    "Plazos estimados a partir de la información de envío.",
  ].join("\n");
}

async function enviarMensaje(mensaje) {
  const url = process.env.WEBHOOK_URL;

  if (!url) {
    throw new Error("Falta configurar la variable de entorno WEBHOOK_URL.");
  }

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: mensaje,
    signal: AbortSignal.timeout(15000),
  });

  if (!respuesta.ok) {
    throw new Error(`Error al enviar el mensaje: HTTP ${respuesta.status}`);
  }

  console.log("Mensaje enviado correctamente al webhook.");
}

async function main() {
  const respuesta = await fetch("https://dummyjson.com/products?limit=0", {
    signal: AbortSignal.timeout(15000),
  });

  if (!respuesta.ok) {
    throw new Error(`Error al consultar el catálogo: HTTP ${respuesta.status}`);
  }

  const catalogo = await respuesta.json();

  if (!Array.isArray(catalogo.products)) {
    throw new Error("La respuesta no contiene un arreglo de productos.");
  }

  const { products, total } = catalogo;

  if (products.length !== total) {
    throw new Error(
      `Catálogo incompleto: se recibieron ${products.length} de ${total} productos.`,
    );
  }

  // Detenemos el proceso si los datos no permiten evaluar el inventario.
  for (const producto of products) {
    if (
      !Number.isFinite(producto.stock) ||
      producto.stock < 0 ||
      !Number.isFinite(producto.minimumOrderQuantity) ||
      producto.minimumOrderQuantity <= 0
    ) {
      throw new Error(
        `Datos de inventario inválidos en producto ${producto.id}.`,
      );
    }
  }

  const productosStockBajo = products.filter((producto) => {
    const umbralStock =
      producto.minimumOrderQuantity * CONFIG.multiplicadorStock;

    return producto.stock <= umbralStock;
  });

  const productosConUrgencia = productosStockBajo.map((producto) => {
    const reposicion = obtenerReposicion(producto.shippingInformation);

    return {
      ...producto,
      ...reposicion,
      urgencyScore:
        reposicion.leadTimeDays *
        (producto.minimumOrderQuantity / Math.max(producto.stock, 1)),
    };
  });

  const productosOrdenados = [...productosConUrgencia].sort((a, b) => {
    const agotadosPrimero = Number(b.stock === 0) - Number(a.stock === 0);

    return agotadosPrimero || b.urgencyScore - a.urgencyScore || a.id - b.id;
  });

  const prioritarios = productosOrdenados.slice(0, CONFIG.topProductos);

  console.log("Productos analizados:", products.length);
  console.log("Productos con stock bajo:", productosStockBajo.length);
  console.log("Productos seleccionados:", prioritarios.length);

  console.table(
    prioritarios.map((producto) => ({
      id: producto.id,
      producto: producto.title,
      stock: producto.stock,
      diasEstimados: producto.leadTimeDays,
      puntuacion: Number(producto.urgencyScore.toFixed(2)),
      usoFallback: producto.usoFallback,
    })),
  );

  const productosConFallback = productosOrdenados.filter(
    (producto) => producto.usoFallback,
  );

  if (productosConFallback.length > 0) {
    console.warn(
      "Confirmar plazo de los productos:",
      productosConFallback.map((producto) => producto.id).join(", "),
    );
  }

  const mensaje = construirMensaje(products.length, productosOrdenados);
  console.log("\n" + mensaje);
  await enviarMensaje(mensaje);
}

main().catch((error) => {
  console.error("No se pudo completar la revisión:", error.message);
  process.exitCode = 1;
});
