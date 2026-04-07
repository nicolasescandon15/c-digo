var SHEET_NAME = "Asistencia";
var WORKERS_SHEET_NAME = "Trabajadores";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");
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

function doGet() {
  return responderJson({
    ok: true,
    trabajadores: obtenerTrabajadores(),
    message: "Lista de trabajadores cargada"
  });
}


function validarDatos(data) {
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

  data.trabajadores.forEach(function (item, index) {
    if (!item.nombre) {
      throw new Error("Falta el nombre del trabajador en la fila " + (index + 1) + ".");
    }

    if (!item.horaLlegada) {
      throw new Error("Falta la hora de llegada en la fila " + (index + 1) + ".");
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
      return String(row[0]).trim();
    })
    .filter(function (nombre) {
      return nombre !== "";
    });
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
  var partes = String(hora).split(":");
  var horas = Number(partes[0]);
  var minutos = Number(partes[1]);

  return (horas * 60) + minutos;
}

function formatearNombre(nombre) {
  return formatearTexto(nombre);
}

function formatearTexto(texto) {
  return String(texto)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(function (palabra) {
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}


function responderJson(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
