var SHEET_NAME = "Asistencia";
var WORKERS_SHEET_NAME = "Trabajadores";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Solicitud invalida.");
    }

    var data = normalizarPayload(JSON.parse(e.postData.contents || "{}"));
    validarDatos(data);

    var sheet = obtenerHoja();
    var filas = data.trabajadores.map(function (item) {
      var resumen = calcularAsistencia(data.horaEntrada, item.horaLlegada);

      return [
        String(data.ordenCompra).trim(),
        formatearTexto(data.obra),
        data.fecha,
        formatearNombre(item.nombre),
        data.horaEntrada,
        item.horaLlegada,
        resumen.estado,
        resumen.retraso,
        new Date()
      ];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);

    return responderJson({
      ok: true,
      message: "Asistencia guardada correctamente"
    });
  } catch (error) {
    return responderJson({
      ok: false,
      message: error.message || "Error al guardar la asistencia"
    });
  }
}


function doGet(e) {
  try {
    var query = limpiarTexto(e.parameter.q || "").toLowerCase();

    var trabajadores = obtenerTrabajadores();

    if (query) {
      trabajadores = trabajadores.filter(function(nombre) {
        return nombre.toLowerCase().includes(query);
      });
    }

    return responderJson({
      ok: true,
      trabajadores: trabajadores,
      message: "Lista de trabajadores cargada"
    });

  } catch (error) {
    return responderJson({
      ok: false,
      message: error.message
    });
  }
}





function normalizarPayload(data) {
  return {
    ordenCompra: limpiarTexto(data.ordenCompra),
    obra: limpiarTexto(data.obra),
    fecha: limpiarTexto(data.fecha),
    horaEntrada: limpiarTexto(data.horaEntrada),
    trabajadores: Array.isArray(data.trabajadores) ? data.trabajadores.map(function (item) {
      return {
        nombre: limpiarTexto(item && item.nombre),
        horaLlegada: limpiarTexto(item && item.horaLlegada)
      };
    }) : []
  };
}


function validarDatos(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Estructura de datos invalida.");
  }

  if (!data.ordenCompra) {
    throw new Error("Falta la orden de compra.");
  }

  if (!data.obra) {
    throw new Error("Falta el nombre de la obra.");
  }

  if (!/^\d+$/.test(String(data.ordenCompra).trim())) {
    throw new Error("La orden de compra solo debe contener numeros.");
  }

  if (!data.fecha) {
    throw new Error("Falta la fecha.");
  }

  if (!data.horaEntrada) {
    throw new Error("Falta la hora de entrada.");
  }

  if (convertirHoraAMinutos(data.horaEntrada) >= 720) {
    throw new Error("La hora de entrada debe estar en formato AM.");
  }

  if (!data.trabajadores || !data.trabajadores.length) {
    throw new Error("No se recibieron trabajadores.");
  }

  if (data.trabajadores.length > 200) {
    throw new Error("Se recibieron demasiados trabajadores en una sola solicitud.");
  }

  var trabajadoresValidos = obtenerMapaTrabajadores();

  data.trabajadores.forEach(function (item, index) {
    if (!item.nombre) {
      throw new Error("Falta el nombre del trabajador en la fila " + (index + 1) + ".");
    }

    if (!item.horaLlegada) {
      throw new Error("Falta la hora de llegada en la fila " + (index + 1) + ".");
    }

    if (!/^\d{2}:\d{2}$/.test(item.horaLlegada)) {
      throw new Error("La hora de llegada no es valida en la fila " + (index + 1) + ".");
    }

    if (!trabajadoresValidos[normalizarClave(item.nombre)]) {
      throw new Error("Trabajador no valido en la fila " + (index + 1) + ".");
    }
  });
}

function obtenerHoja() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Orden de compra",
      "Obra",
      "Fecha",
      "Trabajador",
      "Hora de entrada",
      "Hora de llegada",
      "Estado",
      "Minutos de retraso",
      "Fecha de registro"
    ]);
  }

  return sheet;
}

function obtenerTrabajadores() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(WORKERS_SHEET_NAME);

  if (!sheet) {
    throw new Error('No existe la hoja "' + WORKERS_SHEET_NAME + '".');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map(function (row) {
      return formatearNombre(row[0]);
    })
    .filter(function (nombre) {
      return nombre !== "";
    })
    .filter(function (nombre, index, lista) {
      return lista.indexOf(nombre) === index;
    });
}

function buscarTrabajadores(query) {
  var busqueda = limpiarTexto(query).toLowerCase();

  if (busqueda.length < 2) {
    return [];
  }

  return obtenerTrabajadores()
    .filter(function (nombre) {
      return normalizarClave(nombre).indexOf(busqueda) !== -1;
    })
    .slice(0, 8);
}

function obtenerMapaTrabajadores() {
  return obtenerTrabajadores().reduce(function (acc, nombre) {
    acc[normalizarClave(nombre)] = nombre;
    return acc;
  }, {});
}

function calcularAsistencia(horaEntrada, horaLlegada) {
  var minutosEntrada = convertirHoraAMinutos(horaEntrada);
  var minutosLlegada = convertirHoraAMinutos(horaLlegada);

  if (minutosLlegada <= minutosEntrada) {
    return {
      estado: "A tiempo",
      retraso: 0
    };
  }

  return {
    estado: "Tarde",
    retraso: minutosLlegada - minutosEntrada
  };
}

function convertirHoraAMinutos(hora) {
  if (!/^\d{2}:\d{2}$/.test(String(hora))) {
    throw new Error("Formato de hora invalido.");
  }

  var partes = String(hora).split(":");
  var horas = Number(partes[0]);
  var minutos = Number(partes[1]);

  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    throw new Error("Hora fuera de rango.");
  }

  return (horas * 60) + minutos;
}

function formatearNombre(nombre) {
  return formatearTexto(nombre);
}

function normalizarClave(texto) {
  return limpiarTexto(texto).toLowerCase();
}

function formatearTexto(texto) {
  return limpiarTexto(texto)
    .toLowerCase()
    .split(/\s+/)
    .map(function (palabra) {
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

function limpiarTexto(texto) {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .trim();
}


function responderJson(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
