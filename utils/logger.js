/*
This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

Copyright (C) 2025 MundoGIS.
All rights reserved.

Developed by MundoGIS for the OpenFME-Scheduler project.
For inquiries, contact: abel.gonzalez@mundogis.se
*/

const fs = require('fs'); // 
const path = require('path');

// Asegurarse de que la carpeta 'logs' exista
const logsPath = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath, { recursive: true });
}

const logFile = path.join(logsPath, 'scheduler.log');

/**
 * Escribe un mensaje en el archivo de log con un timestamp.
 * @param {string} message - El mensaje a registrar.
 */
function logEvent(message) {
    try {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        // Usar fs.appendFileSync para asegurar que la escritura sea inmediata
        fs.appendFileSync(logFile, logMessage, 'utf8');
        // También mostrar en la consola para depuración en tiempo real
        console.log(logMessage.trim());
    } catch (error) {
        // Si el logging falla, lo mostramos en la consola para no detener la app
        console.error('CRITICAL: Failed to write to log file.', error);
    }
}

module.exports = { logEvent };

