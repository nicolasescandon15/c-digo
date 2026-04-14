# Web App de permisos laborales

Proyecto nuevo y aislado para Google Apps Script, sin tocar los archivos existentes del directorio raíz.

## Archivos

- `Code.gs`: backend de Apps Script con validaciones, cálculos, autocompletado y actualización automática del estado.
- `index.html`: formulario responsive para escritorio y celular.
- `appsscript.json`: configuración base del proyecto Apps Script.

## Qué hace

- Lee los colaboradores desde la hoja `TRABAJADORES`.
- Lee los residentes desde la hoja `RESIDENTES`.
- Registra solicitudes en la hoja `PERMISOS`.
- Autocompleta el cargo y permite ingresar el WhatsApp manualmente.
- Valida fechas, horarios y motivo.
- Calcula automáticamente duración, costo y estado.
- Genera enlace de WhatsApp según el estado actual.
- Actualiza `ESTADO` y `NOTIFICAR AL PERSONA` cuando cambian las autorizaciones.

## Estructura esperada en Google Sheets

### Hoja `TRABAJADORES`

- `Nombre Completo`
- `Cargo`
- `Salario por hora/día`

### Hoja `RESIDENTES`

- `Nombre del Residente`

### Hoja `PERMISOS`

- `Marca Temporal`
- `Nombre`
- `Cargo`
- `WhatsApp`
- `Residente a Cargo`
- `Tipo de Permiso`
- `Motivo`
- `Fecha del Permiso (General)`
- `Fecha de Regreso a Labores`
- `Duración del Permiso en Horas`
- `NICOLAS ESCANDON AUTORIZACION`
- `ANDREA FRANCO - AUTORIZACION`
- `ESTADO`
- `NOTIFICAR AL PERSONA`
- `COSTO DEL PERMISO`

## Despliegue

1. Crea una hoja de cálculo nueva en Google Sheets.
2. Abre `Extensiones > Apps Script`.
3. Copia el contenido de [Code.gs](/Users/nicolasescandon/Documents/New project/permisos-app-gas/Code.gs) y [index.html](/Users/nicolasescandon/Documents/New project/permisos-app-gas/index.html).
4. Crea también el archivo [appsscript.json](/Users/nicolasescandon/Documents/New project/permisos-app-gas/appsscript.json).
5. Guarda el proyecto.
6. Ejecuta una vez `ensureSheetsStructure` para crear encabezados y validaciones.
7. En `Implementar > Nueva implementación`, publica como `Aplicación web`.
8. Ejecutar como: `Tú`.
9. Acceso: el que corresponda a tu operación.

## Nota sobre salarios

La columna `Salario por hora/día` acepta valores como:

- `12000 hora`
- `45000 día`
- `12000`

Si no se especifica unidad, el sistema asume valor por hora.
