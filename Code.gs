var SHEET_NAME = "Asistencia";
var WORKERS_SHEET_NAME = "Trabajadores";
var WORKS_SHEET_NAME = "obras";
var MINUTOS_JUSTIFICACION_TARDE = 10;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Solicitud invalida.");
    }

    var data = normalizarPayload(JSON.parse(e.postData.contents || "{}"));
    validarDatos(data);

    var sheet = obtenerHoja();
    var startRow = sheet.getLastRow() + 1;
    var filas = data.trabajadores.map(function (item) {
      var resumen = calcularAsistencia(data.horaEntrada, item.horaLlegada);

      return [
        data.obra,
        data.fecha,
        formatearNombre(item.nombre),
        data.horaEntrada,
        item.horaLlegada,
        resumen.estado,
        resumen.retraso,
        new Date()
      ];
    });

    var razones = data.trabajadores.map(function (item) {
      return [item.razonLlegadaTarde || ""];
    });

    sheet.getRange(startRow, 1, filas.length, filas[0].length).setValues(filas);
    sheet.getRange(startRow, 9, razones.length, 1).setValues(razones);

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
    var resource = e && e.parameter ? limpiarTexto(e.parameter.resource || "") : "";
    var query = e && e.parameter ? limpiarTexto(e.parameter.q || "").toLowerCase() : "";

    if (resource === "obras") {
      return responderJson({
        ok: true,
        obras: obtenerObras(),
        message: "Lista de obras cargada"
      });
    }

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
    obra: limpiarTexto(data.obra),
    fecha: limpiarTexto(data.fecha),
    horaEntrada: limpiarTexto(data.horaEntrada),
    trabajadores: Array.isArray(data.trabajadores) ? data.trabajadores.map(function (item) {
      return {
        nombre: limpiarTexto(item && item.nombre),
        horaLlegada: limpiarTexto(item && item.horaLlegada),
        razonLlegadaTarde: limpiarTexto(item && item.razonLlegadaTarde)
      };
    }) : []
  };
}


function validarDatos(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Estructura de datos invalida.");
  }

  if (!data.obra) {
    throw new Error("Falta la obra.");
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

    if ((convertirHoraAMinutos(item.horaLlegada) - convertirHoraAMinutos(data.horaEntrada)) >= MINUTOS_JUSTIFICACION_TARDE && !item.razonLlegadaTarde) {
      throw new Error("Falta la razon de llegada tarde en la fila " + (index + 1) + ".");
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
      "Obra + numero de cotizacion",
      "Fecha",
      "Trabajador",
      "Hora de entrada",
      "Hora de llegada",
      "Estado",
      "Minutos de retraso",
      "Fecha de registro",
      "Razon de llegada tarde"
    ]);
  }

  if (!sheet.getRange(1, 9).getValue()) {
    sheet.getRange(1, 9).setValue("Razon de llegada tarde");
  }

  return sheet;
}

function obtenerObras() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(WORKS_SHEET_NAME);

  if (!sheet) {
    throw new Error('No existe la hoja "' + WORKS_SHEET_NAME + '".');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map(function (row) {
      return limpiarTexto(row[0]);
    })
    .filter(function (obra) {
      return obra !== "";
    })
    .filter(function (obra, index, lista) {
      return lista.indexOf(obra) === index;
    });
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
  var minutosLimite = minutosEntrada + 9;

  if (minutosLlegada <= minutosLimite) {
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

function archivarAsistenciaSemanal() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = obtenerHojaAsistenciaParaArchivo(spreadsheet);

  if (!sourceSheet) {
    Logger.log('No se encontro la hoja "ASISTENCIA".');
    return;
  }

  var lastRow = sourceSheet.getLastRow();
  var lastColumn = sourceSheet.getLastColumn();

  if (lastRow < 2 || lastColumn === 0) {
    Logger.log('La hoja "ASISTENCIA" no tiene datos para archivar.');
    return;
  }

  var data = sourceSheet.getRange(1, 1, lastRow, lastColumn).getValues();
  if (data.length <= 1) {
    Logger.log('La hoja "ASISTENCIA" solo tiene encabezados.');
    return;
  }

  var mondayDate = obtenerLunesDeSemanaActual();
  var baseName = construirNombreHojaSemanal(mondayDate);
  var finalName = obtenerNombreHojaDisponible(spreadsheet, baseName);
  var archiveSheet = spreadsheet.insertSheet(finalName);

  archiveSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  Logger.log('Datos copiados en la hoja: ' + finalName);

  if (lastRow > 1) {
    sourceSheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
    Logger.log('Datos limpiados de la hoja "ASISTENCIA", conservando encabezados.');
  }
}

function configurarTriggerSemanalArchivo() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'archivarAsistenciaSemanal') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('archivarAsistenciaSemanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(20)
    .create();

  Logger.log('Trigger semanal configurado para cada domingo a las 8:00 p.m.');
}

function obtenerHojaAsistenciaParaArchivo(spreadsheet) {
  return spreadsheet.getSheetByName('ASISTENCIA') || spreadsheet.getSheetByName(SHEET_NAME);
}

function obtenerLunesDeSemanaActual() {
  var now = new Date();
  var day = now.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  var monday = new Date(now);

  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  return monday;
}

function construirNombreHojaSemanal(date) {
  var meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre'
  ];

  return 'semana ' + date.getDate() + ' de ' + meses[date.getMonth()];
}

function obtenerNombreHojaDisponible(spreadsheet, baseName) {
  var name = baseName;
  var counter = 1;

  while (spreadsheet.getSheetByName(name)) {
    name = baseName + ' (' + counter + ')';
    counter += 1;
  }

  return name;
}
