var CONFIG = {
  sheets: {
    workers: 'TRABAJADORES',
    permissions: 'PERMISOS',
    residents: 'RESIDENTES'
  },
  permissionTypes: {
    '1': 'Médico (citas, controles, exámenes o procedimientos de salud)',
    '2': 'Licencia por luto (fallecimiento de un familiar)',
    '3': 'Diligencia legal obligatoria (citaciones exigidas por una autoridad; no aplica trámites bancarios, Licencia de conducción, personal, etc)',
    '4': 'Permiso personal',
    '5': 'Licencia no remunerada (ausencia sin pago, por uno o varios días)',
    '6': 'Día Compensatorio Remunerado (por Trabajar 3 fines de semana consecutivos)',
    '7': 'Día libre por horas extra laboradas',
    '8': 'Otro (cuando no encaja en las opciones anteriores)'
  },
  hourlyTypes: ['1', '3', '4', '8'],
  multiDayTypes: ['2', '5', '6', '7'],
  approvalValues: ['pendiente', 'autorizado', 'no autorizado']
};

var WORKERS_HEADERS = [
  'Nombre Completo',
  'Cargo',
  'Salario por hora/día'
];

var PERMISSIONS_HEADERS = [
  'Marca Temporal',
  'Nombre',
  'Cargo',
  'WhatsApp',
  'Residente a Cargo',
  'Tipo de Permiso',
  'Motivo',
  'Fecha del Permiso (General)',
  'Fecha de Regreso a Labores',
  'Duración del Permiso en Horas',
  'NICOLAS ESCANDON AUTORIZACION',
  'ANDREA FRANCO - AUTORIZACION',
  'ESTADO',
  'COSTO DEL PERMISO',
  'NOTIFICAR AL PERSONA'
];

var RESIDENTS_HEADERS = [
  'Nombre del Residente'
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Gestión de permisos laborales')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInitialData() {
  ensureSheetsStructure_();

  // La app toma los catálogos directamente desde la hoja para evitar mantener listas duplicadas.
  var workers = getWorkersCatalog_();
  var residents = getResidentsCatalog_();

  return {
    today: formatDateForInput_(new Date()),
    workers: workers,
    residents: ['No aplica'].concat(residents),
    permissionTypes: Object.keys(CONFIG.permissionTypes).map(function (id) {
      return {
        id: id,
        label: id + '. ' + CONFIG.permissionTypes[id]
      };
    }),
    hourlyTypes: CONFIG.hourlyTypes,
    multiDayTypes: CONFIG.multiDayTypes
  };
}

function submitPermission(payload) {
  ensureSheetsStructure_();

  var normalized = normalizeSubmission_(payload || {});
  var worker = getWorkerByName_(normalized.name);

  if (!worker) {
    throw new Error('No fue posible encontrar el colaborador seleccionado en la hoja TRABAJADORES.');
  }

  var computed = buildComputedPermission_(normalized, worker);
  var contactPhone = sanitizePhone_(normalized.whatsapp);
  var row = [
    new Date(),
    worker.name,
    worker.role,
    contactPhone,
    normalized.resident,
    CONFIG.permissionTypes[normalized.permissionType],
    computed.reason,
    computed.permissionDateLabel,
    computed.returnDateLabel,
    computed.durationHours,
    'pendiente',
    'pendiente',
    computed.status,
    computed.cost,
    buildWhatsAppLink_({
      name: worker.name,
      whatsapp: contactPhone
    }, computed)
  ];

  var sheet = getOrCreateSheet_(CONFIG.sheets.permissions, PERMISSIONS_HEADERS);
  sheet.appendRow(row);

  return {
    ok: true,
    message: 'La solicitud fue registrada correctamente.',
    summary: {
      worker: worker.name,
      type: CONFIG.permissionTypes[normalized.permissionType],
      status: computed.status,
      durationHours: computed.durationHours,
      cost: computed.cost
    }
  };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Permisos')
    .addItem('Preparar hojas', 'ensureSheetsStructure')
    .addToUi();
}

function ensureSheetsStructure() {
  ensureSheetsStructure_();
}

function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.sheets.permissions || e.range.getRow() < 2) {
    return;
  }

  var headers = getHeaderMap_(sheet, PERMISSIONS_HEADERS);
  var authCols = [
    headers['NICOLAS ESCANDON AUTORIZACION'],
    headers['ANDREA FRANCO - AUTORIZACION']
  ];

  if (authCols.indexOf(e.range.getColumn()) === -1) {
    return;
  }

  refreshPermissionRow_(sheet, e.range.getRow(), headers);
}

function ensureSheetsStructure_() {
  var workersSheet = getOrCreateSheet_(CONFIG.sheets.workers, WORKERS_HEADERS);
  var permissionsSheet = getOrCreateSheet_(CONFIG.sheets.permissions, PERMISSIONS_HEADERS);
  var residentsSheet = getOrCreateSheet_(CONFIG.sheets.residents, RESIDENTS_HEADERS);

  applyHeaderStyle_(workersSheet, WORKERS_HEADERS.length);
  applyHeaderStyle_(permissionsSheet, PERMISSIONS_HEADERS.length);
  applyHeaderStyle_(residentsSheet, RESIDENTS_HEADERS.length);
  applyPermissionsValidation_(permissionsSheet);
}

function getWorkersCatalog_() {
  var sheet = getOrCreateSheet_(CONFIG.sheets.workers, WORKERS_HEADERS);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, WORKERS_HEADERS.length).getValues();

  return values
    .map(function (row) {
      return {
        name: sanitizeText_(row[0]),
        role: sanitizeText_(row[1]),
        salaryRaw: sanitizeText_(row[2])
      };
    })
    .filter(function (worker) {
      return worker.name;
    });
}

function getWorkerByName_(name) {
  var normalizedName = normalizeKey_(name);
  var workers = getWorkersCatalog_();

  for (var i = 0; i < workers.length; i += 1) {
    if (normalizeKey_(workers[i].name) === normalizedName) {
      return workers[i];
    }
  }

  return null;
}

function getResidentsCatalog_() {
  var sheet = getOrCreateSheet_(CONFIG.sheets.residents, RESIDENTS_HEADERS);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, RESIDENTS_HEADERS.length).getValues()
    .map(function (row) {
      return sanitizeText_(row[0]);
    })
    .filter(function (value) {
      return value;
    })
    .filter(unique_);
}

function normalizeSubmission_(payload) {
  return {
    name: sanitizeText_(payload.name),
    whatsapp: sanitizeText_(payload.whatsapp),
    resident: sanitizeText_(payload.resident) || 'No aplica',
    permissionType: sanitizeText_(payload.permissionType),
    durationMode: sanitizeText_(payload.durationMode),
    reason: sanitizeText_(payload.reason),
    singleDate: sanitizeText_(payload.singleDate),
    startDate: sanitizeText_(payload.startDate),
    returnDate: sanitizeText_(payload.returnDate),
    estimatedHours: parseNumber_(payload.estimatedHours),
    startTime: sanitizeText_(payload.startTime)
  };
}

function buildComputedPermission_(data, worker) {
  validateSubmission_(data);

  // Los tipos 1, 3, 4 y 8 siguen flujo por horas; los demás se calculan por jornada.
  if (CONFIG.hourlyTypes.indexOf(data.permissionType) !== -1) {
    return buildHourlyPermission_(data, worker);
  }

  return buildDayBasedPermission_(data, worker);
}

function validateSubmission_(data) {
  if (!data.name) {
    throw new Error('Selecciona un colaborador.');
  }

  if (!sanitizePhone_(data.whatsapp)) {
    throw new Error('Debes ingresar un número de WhatsApp válido.');
  }

  if (!CONFIG.permissionTypes[data.permissionType]) {
    throw new Error('Selecciona un tipo de permiso válido.');
  }

  if (!data.reason) {
    throw new Error('El motivo es obligatorio.');
  }

  if (data.reason.length < 12) {
    throw new Error('El motivo debe ser claro y específico.');
  }

  if (/^\s*personal\s*$/i.test(data.reason)) {
    throw new Error('El motivo no puede ser solamente "personal".');
  }

  if (containsSensitiveData_(data.reason)) {
    throw new Error('El motivo no debe incluir datos sensibles como documentos, cuentas o correos.');
  }
}

function buildHourlyPermission_(data, worker) {
  if (!data.singleDate) {
    throw new Error('Debes indicar la fecha del permiso.');
  }

  if (!data.startTime) {
    throw new Error('Debes indicar la hora de inicio.');
  }

  if (!data.estimatedHours || data.estimatedHours <= 0) {
    throw new Error('Debes indicar las horas estimadas de ausencia.');
  }

  if (data.estimatedHours > 3) {
    throw new Error('Los permisos por horas no pueden superar 3 horas.');
  }

  var permissionDate = parseInputDate_(data.singleDate);
  validateTodayOrFuture_(permissionDate, 'La fecha del permiso no puede estar en el pasado.');

  if (isHolidayInColombia_(permissionDate) || permissionDate.getDay() === 0) {
    throw new Error('No es posible registrar permisos por horas en domingos o festivos.');
  }

  var startMinutes = parseTimeToMinutes_(data.startTime);
  var endMinutes = startMinutes + Math.round(data.estimatedHours * 60);
  if (endMinutes <= startMinutes) {
    throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
  }

  var overlapMinutes = getWorkingOverlapMinutes_(permissionDate, startMinutes, endMinutes);
  if (overlapMinutes <= 0) {
    throw new Error('El horario solicitado no cruza con la jornada laboral de ese día.');
  }

  var durationHours = roundToTwo_(overlapMinutes / 60);
  var computedEndTime = formatMinutesAsTime_(endMinutes);

  var returnDate = permissionDate;
  var cost = isUnpaidLeave_(data.permissionType) ? 0 : calculateCost_(worker.salaryRaw, [{
    date: permissionDate,
    hours: durationHours
  }]);
  var status = computeStatus_('pendiente', 'pendiente');

  return {
    permissionDateLabel: formatDateDisplay_(permissionDate),
    returnDateLabel: formatDateDisplay_(returnDate),
    durationHours: durationHours,
    cost: cost,
    status: status,
    dateRangeText: formatDateDisplay_(permissionDate),
    returnDate: returnDate,
    reason: buildHourlyReason_(data.reason, data.startTime, computedEndTime, durationHours)
  };
}

function buildDayBasedPermission_(data, worker) {
  if (!data.durationMode) {
    throw new Error('Selecciona si la licencia es por un solo día o por varios días.');
  }

  if (data.durationMode === 'single') {
    if (!data.singleDate) {
      throw new Error('Debes indicar la fecha del permiso.');
    }

    var singleDate = parseInputDate_(data.singleDate);
    validateTodayOrFuture_(singleDate, 'La fecha del permiso no puede estar en el pasado.');

    var singleHours = getWorkingHoursForDate_(singleDate);
    if (singleHours <= 0) {
      throw new Error('La fecha seleccionada no corresponde a una jornada laboral válida o es festiva.');
    }

    return {
      permissionDateLabel: formatDateDisplay_(singleDate),
      returnDateLabel: formatDateDisplay_(nextWorkday_(singleDate)),
      durationHours: roundToTwo_(singleHours),
      cost: isUnpaidLeave_(data.permissionType) ? 0 : calculateCost_(worker.salaryRaw, [{
        date: singleDate,
        hours: singleHours
      }]),
      status: computeStatus_('pendiente', 'pendiente'),
      dateRangeText: formatDateDisplay_(singleDate),
      returnDate: nextWorkday_(singleDate),
      reason: data.reason
    };
  }

  if (!data.startDate || !data.returnDate) {
    throw new Error('Debes indicar la fecha de inicio y la fecha de regreso.');
  }

  var startDate = parseInputDate_(data.startDate);
  var returnDate = parseInputDate_(data.returnDate);
  validateTodayOrFuture_(startDate, 'La fecha de inicio no puede estar en el pasado.');

  if (returnDate.getTime() <= startDate.getTime()) {
    throw new Error('La fecha de regreso debe ser posterior a la fecha de inicio.');
  }

  var segments = [];
  var cursor = cloneDate_(startDate);
  while (cursor.getTime() < returnDate.getTime()) {
    var hours = getWorkingHoursForDate_(cursor);
    if (hours > 0) {
      segments.push({
        date: cloneDate_(cursor),
        hours: hours
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (!segments.length) {
    throw new Error('El rango seleccionado no contiene días laborales para calcular el permiso.');
  }

  return {
    permissionDateLabel: formatDateDisplay_(startDate),
    returnDateLabel: formatDateDisplay_(returnDate),
    durationHours: roundToTwo_(segments.reduce(function (sum, item) {
      return sum + item.hours;
    }, 0)),
    cost: isUnpaidLeave_(data.permissionType) ? 0 : calculateCost_(worker.salaryRaw, segments),
    status: computeStatus_('pendiente', 'pendiente'),
    dateRangeText: formatDateDisplay_(startDate) + ' al ' + formatDateDisplay_(addDays_(returnDate, -1)),
    returnDate: returnDate,
    reason: data.reason
  };
}

function calculateCost_(salaryRaw, segments) {
  var salary = parseSalary_(salaryRaw);

  if (!segments.length || salary.value <= 0) {
    return 0;
  }

  var total = segments.reduce(function (sum, item) {
    if (salary.unit === 'hour') {
      return sum + (salary.value * item.hours);
    }

    var dayHours = getWorkingHoursForDate_(item.date);
    if (dayHours <= 0) {
      return sum;
    }

    return sum + ((salary.value / dayHours) * item.hours);
  }, 0);

  return roundToTwo_(total);
}

function isUnpaidLeave_(permissionType) {
  return String(permissionType) === '5';
}

function parseSalary_(raw) {
  var text = sanitizeText_(raw).toLowerCase();
  var numericValue = parseLocaleNumber_(text);
  var unit = /dia|día|day/.test(text) ? 'day' : 'hour';

  return {
    value: numericValue > 0 ? numericValue : 0,
    unit: unit
  };
}

function refreshPermissionRow_(sheet, rowIndex, headers) {
  var row = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  var nicolas = sanitizeText_(row[headers['NICOLAS ESCANDON AUTORIZACION'] - 1]).toLowerCase() || 'pendiente';
  var andrea = sanitizeText_(row[headers['ANDREA FRANCO - AUTORIZACION'] - 1]).toLowerCase() || 'pendiente';
  var status = computeStatus_(nicolas, andrea);

  sheet.getRange(rowIndex, headers.ESTADO).setValue(status);

  var worker = {
    name: sanitizeText_(row[headers.Nombre - 1]),
    whatsapp: sanitizePhone_(row[headers.WhatsApp - 1])
  };

  var generalDateText = sanitizeText_(row[headers['Fecha del Permiso (General)'] - 1]);
  var returnDateText = sanitizeText_(row[headers['Fecha de Regreso a Labores'] - 1]);
  var computed = {
    status: status,
    dateRangeText: buildDateRangeTextFromSheet_(generalDateText, returnDateText),
    returnDate: parseLooseSheetDate_(row[headers['Fecha de Regreso a Labores'] - 1]),
    durationHours: parseNumber_(row[headers['Duración del Permiso en Horas'] - 1])
  };

  sheet.getRange(rowIndex, headers['NOTIFICAR AL PERSONA']).setValue(buildWhatsAppLink_(worker, computed));
}

function computeStatus_(nicolas, andrea) {
  var normalizedNicolas = sanitizeText_(nicolas).toLowerCase() || 'pendiente';
  var normalizedAndrea = sanitizeText_(andrea).toLowerCase() || 'pendiente';

  if (normalizedNicolas === 'no autorizado' || normalizedAndrea === 'no autorizado') {
    return 'No autorizado';
  }

  if (normalizedNicolas === 'autorizado' && normalizedAndrea === 'autorizado') {
    return 'Autorizado';
  }

  return 'Pendiente';
}

function buildWhatsAppLink_(worker, computed) {
  if (!worker.whatsapp) {
    return '';
  }

  var phone = sanitizePhone_(worker.whatsapp);
  if (!phone) {
    return '';
  }

  var message = [
    'Hola ' + worker.name + '.',
    'Tu solicitud de permiso está ' + computed.status.toLowerCase() + '.',
    'Fecha o rango: ' + computed.dateRangeText + '.',
    'Duración: ' + computed.durationHours + ' hora(s).'
  ].join(' ');

  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
}

function buildDateRangeTextFromSheet_(generalDateText, returnDateText) {
  if (!generalDateText) {
    return '';
  }

  if (!returnDateText || returnDateText === generalDateText) {
    return generalDateText;
  }

  var generalDate = parseLooseSheetDate_(generalDateText);
  var returnDate = parseLooseSheetDate_(returnDateText);
  if (!generalDate || !returnDate) {
    return generalDateText;
  }

  var lastPermissionDate = addDays_(returnDate, -1);
  if (lastPermissionDate.getTime() <= generalDate.getTime()) {
    return generalDateText;
  }

  return generalDateText + ' al ' + formatDateDisplay_(lastPermissionDate);
}

function applyPermissionsValidation_(sheet) {
  var lastRow = Math.max(sheet.getMaxRows(), 200);
  var headers = getHeaderMap_(sheet, PERMISSIONS_HEADERS);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.approvalValues, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, headers['NICOLAS ESCANDON AUTORIZACION'], lastRow - 1, 1).setDataValidation(rule);
  sheet.getRange(2, headers['ANDREA FRANCO - AUTORIZACION'], lastRow - 1, 1).setDataValidation(rule);
}

function getOrCreateSheet_(name, headers) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  var currentHeaders = [];
  if (sheet.getLastRow() > 0) {
    currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  }

  var needsUpdate = headers.some(function (header, index) {
    return sanitizeText_(currentHeaders[index]) !== header;
  });

  if (sheet.getLastRow() === 0 || needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function applyHeaderStyle_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#dbe7e1')
    .setWrap(true);
  sheet.autoResizeColumns(1, width);
  sheet.setFrozenRows(1);
}

function getHeaderMap_(sheet, headers) {
  var values = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  return values.reduce(function (acc, value, index) {
    acc[String(value)] = index + 1;
    return acc;
  }, {});
}

function validateTodayOrFuture_(dateValue, message) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateValue.getTime() < today.getTime()) {
    throw new Error(message);
  }
}

function getWorkingHoursForDate_(dateValue) {
  if (dateValue.getDay() === 0 || isHolidayInColombia_(dateValue)) {
    return 0;
  }

  var day = dateValue.getDay();
  if (day >= 1 && day <= 4) {
    return 8;
  }
  if (day === 5) {
    return 7;
  }
  if (day === 6) {
    return 5;
  }
  return 0;
}

function getWorkingWindowForDate_(dateValue) {
  if (dateValue.getDay() === 0 || isHolidayInColombia_(dateValue)) {
    return null;
  }

  var day = dateValue.getDay();
  if (day >= 1 && day <= 4) {
    return {
      start: 7 * 60,
      end: 16 * 60
    };
  }
  if (day === 5) {
    return {
      start: 7 * 60,
      end: 15 * 60
    };
  }
  if (day === 6) {
    return {
      start: 7 * 60,
      end: 12 * 60
    };
  }

  return null;
}

function getWorkingOverlapMinutes_(dateValue, requestedStart, requestedEnd) {
  var window = getWorkingWindowForDate_(dateValue);
  if (!window) {
    return 0;
  }

  var overlapStart = Math.max(requestedStart, window.start);
  var overlapEnd = Math.min(requestedEnd, window.end);
  return Math.max(0, overlapEnd - overlapStart);
}

function nextWorkday_(dateValue) {
  var nextDate = cloneDate_(dateValue);
  nextDate.setDate(nextDate.getDate() + 1);

  while (getWorkingHoursForDate_(nextDate) === 0) {
    nextDate.setDate(nextDate.getDate() + 1);
  }

  return nextDate;
}

function parseInputDate_(value) {
  var parts = String(value).split('-');
  if (parts.length !== 3) {
    throw new Error('La fecha debe estar en formato válido.');
  }

  var dateValue = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  dateValue.setHours(0, 0, 0, 0);
  return dateValue;
}

function parseLooseSheetDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }

  var sanitized = sanitizeText_(value);
  if (!sanitized) {
    return null;
  }

  var match = sanitized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function parseTimeToMinutes_(value) {
  var match = String(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error('El horario debe estar en formato HH:MM.');
  }

  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error('El horario ingresado no es válido.');
  }

  return (hours * 60) + minutes;
}

function formatMinutesAsTime_(minutes) {
  var normalized = Math.max(0, Math.round(minutes));
  var hours = Math.floor(normalized / 60);
  var remainder = normalized % 60;

  return padTwo_(hours) + ':' + padTwo_(remainder);
}

function formatDateDisplay_(dateValue) {
  return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function formatDateForInput_(dateValue) {
  return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function sanitizePhone_(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function sanitizeText_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeKey_(value) {
  return sanitizeText_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseNumber_(value) {
  if (typeof value === 'number') {
    return value;
  }

  var normalized = String(value || '').replace(/\s+/g, '').replace(',', '.');
  var parsed = Number(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function parseLocaleNumber_(value) {
  if (typeof value === 'number') {
    return value;
  }

  var cleaned = String(value || '').replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) {
    return 0;
  }

  var hasComma = cleaned.indexOf(',') !== -1;
  var hasDot = cleaned.indexOf('.') !== -1;

  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }

  var parsed = Number(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function containsSensitiveData_(text) {
  return /(\b\d{6,}\b)|(@)|(\bcuenta\b)|(\btarjeta\b)|(\bcedula\b)|(\bcédula\b)/i.test(text);
}

function roundToTwo_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function padTwo_(value) {
  return value < 10 ? '0' + value : String(value);
}

function unique_(value, index, list) {
  return list.indexOf(value) === index;
}

function cloneDate_(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function addDays_(dateValue, days) {
  var nextDate = cloneDate_(dateValue);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function buildHourlyReason_(baseReason, startTime, endTime, durationHours) {
  return baseReason + ' Horario solicitado: ' + startTime + ' a ' + endTime + '. Horas laborales contadas: ' + durationHours + '.';
}

function isHolidayInColombia_(dateValue) {
  var key = formatDateForInput_(dateValue);
  var holidays = getColombianHolidayKeys_(dateValue.getFullYear());
  return holidays.indexOf(key) !== -1;
}

function getColombianHolidayKeys_(year) {
  var easter = getEasterSunday_(year);
  var holidays = [
    new Date(year, 0, 1),
    moveToMonday_(new Date(year, 0, 6)),
    moveToMonday_(new Date(year, 2, 19)),
    addDays_(easter, -3),
    addDays_(easter, -2),
    new Date(year, 4, 1),
    moveToMonday_(new Date(year, 5, 29)),
    moveToMonday_(new Date(year, 6, 20)),
    new Date(year, 7, 7),
    moveToMonday_(new Date(year, 7, 15)),
    moveToMonday_(new Date(year, 9, 12)),
    moveToMonday_(new Date(year, 10, 1)),
    moveToMonday_(new Date(year, 10, 11)),
    new Date(year, 11, 8),
    new Date(year, 11, 25),
    addDays_(easter, 43),
    addDays_(easter, 64),
    addDays_(easter, 71)
  ];

  return holidays.map(function (holiday) {
    return formatDateForInput_(holiday);
  }).filter(unique_);
}

function moveToMonday_(dateValue) {
  var moved = cloneDate_(dateValue);
  while (moved.getDay() !== 1) {
    moved.setDate(moved.getDate() + 1);
  }
  return moved;
}

function getEasterSunday_(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}
