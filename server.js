require('dotenv').config(); // Cargar variables de entorno desde .env

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
const { spawn } = require('child_process');
const multer = require('multer');

// Importar la función de logging centralizada
const { logEvent } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3100;

// Reemplazar rutas y credenciales con variables de entorno
const fmeExecutable = process.env.FME_EXECUTABLE_PATH || 'fme.exe';
const fmeScriptsPath = process.env.FME_SCRIPTS_PATH || path.join(__dirname, 'fme_scripts');
const jobsFilePath = process.env.JOBS_FILE_PATH || path.join(__dirname, 'data', 'jobs.json');
const runningFilePath = process.env.RUNNING_FILE_PATH || path.join(__dirname, 'data', 'running.json');

// Cambiar el log predeterminado al archivo logs/scheduler.log
const defaultLogPath = path.join(__dirname, 'logs', 'scheduler.log');

// Definición de rutas y el objeto para las tareas activas
const activeCronJobs = {};

// --- Running scripts state ---
function readRunning() {
    try {
        if (!fs.existsSync(runningFilePath)) return {};
        return JSON.parse(fs.readFileSync(runningFilePath, 'utf8'));
    } catch (error) {
        logEvent(`ERROR: Could not read running.json: ${error.message}`);
        return {};
    }
}

function writeRunning(data) {
    try {
        fs.writeFileSync(runningFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
        logEvent(`ERROR: Could not write running.json: ${error.message}`);
    }
}

function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

function cleanupRunning() {
    const running = readRunning();
    let changed = false;
    Object.keys(running).forEach(scriptName => {
        const entry = running[scriptName];
        if (!entry || !entry.pid || !isProcessAlive(entry.pid)) {
            delete running[scriptName];
            changed = true;
        }
    });
    if (changed) writeRunning(running);
    return running;
}

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
        logEvent(`ERROR: Could not read or parse jobs.json: ${error.message}`);
        return [];
    }
}

/**
 * Ejecuta un script FME usando la línea de comandos.
 * @param {string} scriptName - El nombre del archivo .fmw a ejecutar.
 */
function runFmeScript(scriptName) {
    const scriptPath = path.join(fmeScriptsPath, scriptName);

    if (!fs.existsSync(scriptPath)) {
        logEvent(`ERROR: Script not found when attempting to run: ${scriptName}`);
        return { ok: false, error: 'Script not found.' };
    }

    const running = cleanupRunning();
    if (running[scriptName]) {
        logEvent(`WARN: Attempt to run script already running: ${scriptName}`);
        return { ok: false, error: 'Script is already running.' };
    }

    const command = `"${fmeExecutable}" "${scriptPath}"`;
    logEvent(`Executing FME: ${command}`);

    const safeName = path.basename(scriptName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const scriptLogPath = path.join(__dirname, 'logs', `${safeName}.log`);
    const scriptLogStream = fs.createWriteStream(scriptLogPath, { flags: 'a' });

    const writeScriptLog = (type, chunk) => {
        const timestamp = new Date().toISOString();
        const text = chunk.toString();
        const lines = text.split(/\r?\n/);
        lines.forEach(line => {
            if (line.trim() !== '') {
                scriptLogStream.write(`[${timestamp}] [${type}] ${line}\n`);
            }
        });
    };

    scriptLogStream.write(`\n[${new Date().toISOString()}] [START] ${scriptName}\n`);

    const child = spawn(fmeExecutable, [scriptPath], { windowsHide: true });

    child.stdout.on('data', (data) => writeScriptLog('STDOUT', data));
    child.stderr.on('data', (data) => writeScriptLog('STDERR', data));

    child.on('error', (error) => {
        logEvent(`ERROR running ${scriptName}: ${error.message}`);
        writeScriptLog('ERROR', error.message);
    });

    child.on('close', (code, signal) => {
        scriptLogStream.write(`[${new Date().toISOString()}] [END] code=${code} signal=${signal || 'none'}\n`);
        scriptLogStream.end();

        if (code === 0) {
            logEvent(`FME executed successfully: ${scriptName}`);
        } else {
            logEvent(`ERROR running ${scriptName}: exit code ${code}`);
        }

        const current = readRunning();
        if (current[scriptName]) {
            delete current[scriptName];
            writeRunning(current);
        }
    });

    const pid = child.pid;
    const updated = readRunning();
    updated[scriptName] = { pid, startTime: new Date().toISOString() };
    writeRunning(updated);

    return { ok: true, pid };
}

/**
 * Programa una tarea individual usando node-cron y la guarda en memoria.
 * @param {object} job - El objeto del trabajo a programar.
 */
function scheduleJob(job) {
    if (!job || !job.cronPattern || !job.scriptName) {
        logEvent(`WARN: Attempt to schedule invalid job: ${JSON.stringify(job)}`);
        return;
    }

    if (!cron.validate(job.cronPattern)) {
        logEvent(`ERROR: Invalid cron pattern for job ${job.id}: "${job.cronPattern}".`);
        return;
    }

    // Detener cualquier tarea existente con el mismo ID antes de reprogramar
    if (activeCronJobs[job.id]) {
        activeCronJobs[job.id].stop();
    }

    logEvent(`Scheduling job '${job.scriptName}' with ID ${job.id} and pattern: ${job.cronPattern}`);

    const task = cron.schedule(job.cronPattern, () => {
        logEvent(`Activating scheduled job: ${job.scriptName} (ID: ${job.id})`);
        const result = runFmeScript(job.scriptName);
        if (!result || result.ok === false) {
            logEvent(`WARN: Could not start ${job.scriptName} (ID: ${job.id}).`);
        }
        
        // Si no es recurrente, la tarea se detiene a sí misma después de la primera ejecución
        if (!job.isRecurrent) {
            task.stop();
            delete activeCronJobs[job.id];
            logEvent(`One-time task ${job.id} executed and stopped.`);
        }
    });

    activeCronJobs[job.id] = task;
}

/**
 * Carga todos los trabajos desde jobs.json y los programa al iniciar el servidor.
 */
function initializeScheduler() {
    logEvent("--- Initializing Scheduler ---");
    const jobs = getScheduledJobs();
    const now = new Date();
    
    jobs.forEach(job => {
        const runTime = new Date(job.runTime);
        // Solo reprogramar trabajos recurrentes o trabajos únicos que aún no han pasado
        if (job.isRecurrent || runTime > now) {
            scheduleJob(job);
        } else {
            logEvent(`INFO: One-time job ${job.id} (${job.scriptName}) has already passed. It will not be rescheduled.`);
        }
    });
    logEvent(`Initialization complete. ${Object.keys(activeCronJobs).length} active jobs.`);
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
        return res.status(400).json({ error: 'Script name is required.' });
    }

    logEvent(`Request to run script manually: ${scriptName}`);
    const result = runFmeScript(scriptName);
    if (!result.ok) {
        return res.status(409).json({ error: result.error || 'Could not run the script.' });
    }

    res.json({ message: `Script ${scriptName} is running.` });
});

// Estado de ejecución actual
app.get('/api/running', (req, res) => {
    const running = cleanupRunning();
    res.json(running);
});

// Detener un script en ejecución
app.post('/api/stop-script', (req, res) => {
    const { scriptName } = req.body;
    if (!scriptName) {
        return res.status(400).json({ error: 'Script name is required.' });
    }
    const running = cleanupRunning();
    const entry = running[scriptName];
    if (!entry || !entry.pid) {
        return res.status(404).json({ error: 'Script is not running.' });
    }
    try {
        process.kill(entry.pid);
        delete running[scriptName];
        writeRunning(running);
        logEvent(`Script stopped: ${scriptName} (PID: ${entry.pid})`);
        res.json({ message: `Script ${scriptName} was stopped.` });
    } catch (error) {
        logEvent(`ERROR stopping script ${scriptName}: ${error.message}`);
        res.status(500).json({ error: 'Could not stop the script.' });
    }
});

// Asegurarse de que el archivo de log predeterminado se use en el frontend
app.get('/api/logs', (req, res) => {
    fs.readFile(defaultLogPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to read log file.' });
        }
        res.json({ log: data });
    });
});

// --- Iniciar Servidor y Planificador ---
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    logEvent("--- Server Started ---");
    
    // Asegurarse de que los directorios necesarios existen
    if (!fs.existsSync(fmeScriptsPath)) fs.mkdirSync(fmeScriptsPath, { recursive: true });
    if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
    
    cleanupRunning();

    // Iniciar el planificador después de que el servidor esté listo
    initializeScheduler();
});