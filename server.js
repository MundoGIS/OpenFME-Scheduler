/*
This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

Copyright (C) 2025 MundoGIS.
All rights reserved.

Developed by MundoGIS for the OpenFME-Scheduler project.
For inquiries, contact: abel.gonzalez@mundogis.se
*/

const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { exec } = require('child_process');
const multer = require('multer');

// Importar la función de logging centralizada
const { logEvent } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3100;

// Definición de rutas y el objeto para las tareas activas
const jobsFilePath = path.join(__dirname, 'data', 'jobs.json');
const fmeScriptsPath = path.join(__dirname, 'fme_scripts');
const activeCronJobs = {};

// --- Configuración de Multer para la subida de archivos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Asegurarse de que el directorio de scripts exista
        if (!fs.existsSync(fmeScriptsPath)) {
            fs.mkdirSync(fmeScriptsPath, { recursive: true });
        }
        cb(null, fmeScriptsPath);
    },
    filename: function (req, file, cb) {
        // Usa el nombre original del archivo.
        cb(null, file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.fmw') {
        cb(null, true); // Aceptar el archivo si es .fmw
    } else {
        cb(new Error('Solo se permiten archivos .fmw'), false); // Rechazar otros
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });


// --- FUNCIONES PRINCIPALES DEL PLANIFICADOR (EL MOTOR) ---

/**
 * Lee y parsea el archivo jobs.json de forma segura.
 * @returns {Array} Un array de objetos de trabajo.
 */
function getScheduledJobs() {
    if (!fs.existsSync(jobsFilePath)) {
        return [];
    }
    try {
        const data = fs.readFileSync(jobsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logEvent(`ERROR: No se pudo leer o parsear jobs.json: ${error.message}`);
        return [];
    }
}

/**
 * Ejecuta un script FME usando la línea de comandos.
 * @param {string} scriptName - El nombre del archivo .fmw a ejecutar.
 */
function runFmeScript(scriptName) {
    // IMPORTANTE: Asegúrate de que 'fme.exe' esté en tu PATH del sistema,
    // o proporciona la ruta completa, ej: 'C:\\Program Files\\FME\\fme.exe'
    const fmeExecutable = 'fme.exe';
    const scriptPath = path.join(fmeScriptsPath, scriptName);

    if (!fs.existsSync(scriptPath)) {
        logEvent(`ERROR: Script no encontrado al intentar ejecutar: ${scriptName}`);
        return;
    }

    const command = `"${fmeExecutable}" "${scriptPath}"`;
    logEvent(`Ejecutando FME: ${command}`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            logEvent(`ERROR ejecutando ${scriptName}: ${error.message}`);
            // Aquí podrías añadir lógica para notificar el error (ej. enviar un email)
        } else {
            logEvent(`FME ejecutado correctamente: ${scriptName}`);
            if (stdout) logEvent(`STDOUT: ${stdout.trim()}`);
            if (stderr) logEvent(`STDERR: ${stderr.trim()}`);
        }
    });
}

/**
 * Programa una tarea individual usando node-cron y la guarda en memoria.
 * @param {object} job - El objeto del trabajo a programar.
 */
function scheduleJob(job) {
    if (!job || !job.cronPattern || !job.scriptName) {
        logEvent(`WARN: Intento de programar un trabajo inválido: ${JSON.stringify(job)}`);
        return;
    }

    if (!cron.validate(job.cronPattern)) {
        logEvent(`ERROR: Patrón Cron inválido para el trabajo ${job.id}: "${job.cronPattern}".`);
        return;
    }

    // Detener cualquier tarea existente con el mismo ID antes de reprogramar
    if (activeCronJobs[job.id]) {
        activeCronJobs[job.id].stop();
    }

    logEvent(`Programando trabajo '${job.scriptName}' con ID ${job.id} y patrón: ${job.cronPattern}`);

    const task = cron.schedule(job.cronPattern, () => {
        logEvent(`Activando trabajo programado: ${job.scriptName} (ID: ${job.id})`);
        runFmeScript(job.scriptName);
        
        // Si no es recurrente, la tarea se detiene a sí misma después de la primera ejecución
        if (!job.isRecurrent) {
            task.stop();
            delete activeCronJobs[job.id];
            logEvent(`Tarea única ${job.id} ejecutada y detenida.`);
        }
    });

    activeCronJobs[job.id] = task;
}

/**
 * Carga todos los trabajos desde jobs.json y los programa al iniciar el servidor.
 */
function initializeScheduler() {
    logEvent("--- Inicializando Planificador de Tareas ---");
    const jobs = getScheduledJobs();
    const now = new Date();
    
    jobs.forEach(job => {
        const runTime = new Date(job.runTime);
        // Solo reprogramar trabajos recurrentes o trabajos únicos que aún no han pasado
        if (job.isRecurrent || runTime > now) {
            scheduleJob(job);
        } else {
            logEvent(`INFO: El trabajo único ${job.id} (${job.scriptName}) ya ha pasado. No se reprogramará.`);
        }
    });
    logEvent(`Inicialización completada. ${Object.keys(activeCronJobs).length} trabajos activos.`);
}


// --- Configuración de Express ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


// --- Rutas ---
// Se le pasan 'upload', 'activeCronJobs' y 'scheduleJob' al router
const schedulerRoutes = require('./routes/scheduler')(upload, activeCronJobs, scheduleJob, runFmeScript); 
app.use('/api', schedulerRoutes);

// Ruta para la página principal
app.get('/', (req, res) => {
    const jobs = getScheduledJobs();
    res.render('index', { title: 'OpenFME-Scheduler', jobs });
});

// Ruta para ejecutar un script manualmente
app.post('/api/run-script', (req, res) => {
    const { scriptName } = req.body;

    if (!scriptName) {
        return res.status(400).json({ error: 'El nombre del script es obligatorio.' });
    }

    logEvent(`Solicitud para ejecutar manualmente el script: ${scriptName}`);
    runFmeScript(scriptName);

    res.json({ message: `El script ${scriptName} se está ejecutando.` });
});

// --- Iniciar Servidor y Planificador ---
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    logEvent("--- Servidor Iniciado ---");
    
    // Asegurarse de que los directorios necesarios existen
    if (!fs.existsSync(fmeScriptsPath)) fs.mkdirSync(fmeScriptsPath, { recursive: true });
    if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    
    // Iniciar el planificador después de que el servidor esté listo
    initializeScheduler();
});