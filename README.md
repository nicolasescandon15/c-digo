# Registro de asistencia diaria

## 1. Frontend

1. Abre [index.html](/Users/nicolasescandon/Documents/New project/index.html).
2. Reemplaza `PEGAR_AQUI_URL_DE_GOOGLE_APPS_SCRIPT` por la URL del Web App publicada desde Google Apps Script.
3. Si quieres, ajusta el array `trabajadoresDisponibles` con los nombres reales.

## 2. Google Sheets + Apps Script

1. Crea una hoja de cálculo en Google Sheets.
2. En esa hoja abre `Extensiones > Apps Script`.
3. Pega el contenido de [Code.gs](/Users/nicolasescandon/Documents/New project/Code.gs).
4. Guarda el proyecto.

## 3. Deploy del Web App

1. En Apps Script entra a `Implementar > Nueva implementación`.
2. Tipo: `Aplicación web`.
3. Ejecutar como: `Tú`.
4. Quién tiene acceso: `Cualquiera`.
5. Copia la URL generada y pégala en `index.html`.

## 4. Estructura guardada

Cada trabajador se guarda en una fila independiente con estas columnas:

- Orden de compra
- Obra
- Fecha
- Trabajador
- Hora de llegada
- Fecha de registro
