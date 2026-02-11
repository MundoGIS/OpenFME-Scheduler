/*
This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

Copyright (C) 2025 MundoGIS.
All rights reserved.

Developed by MundoGIS for the OpenFME-Scheduler project.
For inquiries, contact: abel.gonzalez@mundogis.se
*/

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { logEvent } = require('../utils/logger');

const fmeScriptsPath = process.env.FME_SCRIPTS_PATH || path.join(__dirname, '..', 'fme_scripts');
const jobsFilePath = process.env.JOBS_FILE_PATH || path.join(__dirname, '..', 'data', 'jobs.json');
const scriptsMetaPath = path.join(__dirname, '..', 'data', 'scripts.json');
const logsPath = path.join(__dirname, '..', 'logs');
const defaultLogFile = 'scheduler.log';

function readScriptsMeta() {
    try {
        if (!fs.existsSync(scriptsMetaPath)) return {};
        return JSON.parse(fs.readFileSync(scriptsMetaPath, 'utf8'));
    } catch (error) {
        logEvent(`FEL vid läsning av scripts.json: ${error.message}`);
        return {};
    }
}

function writeScriptsMeta(meta) {
    try {
        fs.writeFileSync(scriptsMetaPath, JSON.stringify(meta, null, 2));
    } catch (error) {
        logEvent(`FEL vid skrivning av scripts.json: ${error.message}`);
    }
}

// La función ahora también recibe 'runFmeScript' desde server.js
module.exports = function (upload, activeCronJobs, scheduleJob, runFmeScript) {

    // --- GET /api/scripts y GET /api/jobs ---
    router.get('/scripts', (req, res) => {
        try {
            if (!fs.existsSync(fmeScriptsPath)) return res.json([]);
            const files = fs.readdirSync(fmeScriptsPath);
            const fmeFiles = files.filter(file => path.extname(file).toLowerCase() === '.fmw');
            const meta = readScriptsMeta();
            const scripts = fmeFiles.map(name => ({
                name,
                description: meta[name]?.description || ''
            }));
            res.json(scripts);
        } catch (error) {
            console.error('Error reading FME scripts directory:', error);
            res.status(500).json({ error: 'Could not read script list.' });
        }
    });

    // --- PATCH /api/scripts/:filename ---
    router.patch('/scripts/:filename', (req, res) => {
        const filename = req.params.filename;
        const { description } = req.body;

        if (!filename || path.extname(filename).toLowerCase() !== '.fmw') {
            return res.status(400).json({ error: 'Invalid filename. Only .fmw is allowed.' });
        }

        const sanitizedName = path.basename(filename);
        const scriptPath = path.join(fmeScriptsPath, sanitizedName);

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'Script not found.' });
        }

        const meta = readScriptsMeta();
        meta[sanitizedName] = { description: (description || '').trim() };
        writeScriptsMeta(meta);
        logEvent(`Beskrivning uppdaterad för skript: ${sanitizedName}`);
        res.json({ message: 'Description updated.' });
    });

    // --- GET /api/scripts/:filename/download ---
    router.get('/scripts/:filename/download', (req, res) => {
        const filename = req.params.filename;
        if (!filename || path.extname(filename).toLowerCase() !== '.fmw') {
            return res.status(400).json({ error: 'Invalid filename. Only .fmw is allowed.' });
        }

        const sanitizedName = path.basename(filename);
        const scriptPath = path.join(fmeScriptsPath, sanitizedName);

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'Script not found.' });
        }

        res.download(scriptPath, sanitizedName);
    });

    // --- DELETE /api/scripts/:filename ---
    router.delete('/scripts/:filename', (req, res) => {
        const filename = req.params.filename;
        if (!filename || path.extname(filename).toLowerCase() !== '.fmw') {
            return res.status(400).json({ error: 'Invalid filename. Only .fmw is allowed.' });
        }

        const sanitizedName = path.basename(filename);
        const scriptPath = path.join(fmeScriptsPath, sanitizedName);

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'Script not found.' });
        }

        try {
            // Blockera borttagning om skriptet är schemalagt
            let jobs = [];
            if (fs.existsSync(jobsFilePath)) {
                jobs = JSON.parse(fs.readFileSync(jobsFilePath, 'utf8'));
            }
            const isInUse = jobs.some(job => job.scriptName === sanitizedName);
            if (isInUse) {
                return res.status(409).json({ error: 'Script is used by scheduled jobs and cannot be deleted.' });
            }

            fs.unlinkSync(scriptPath);
            const meta = readScriptsMeta();
            if (meta[sanitizedName]) {
                delete meta[sanitizedName];
                writeScriptsMeta(meta);
            }
            logEvent(`FME-skript borttaget: ${sanitizedName}`);
            res.json({ message: 'Script deleted.' });
        } catch (error) {
            logEvent(`FEL vid borttagning av skript: ${error.message}`);
            res.status(500).json({ error: 'Could not delete script.' });
        }
    });

    router.get('/jobs', (req, res) => {
        try {
            if (!fs.existsSync(jobsFilePath)) return res.json([]);
            const data = fs.readFileSync(jobsFilePath, 'utf8');
            res.json(JSON.parse(data));
        } catch (error) {
            console.error('Error reading jobs.json:', error);
            res.status(500).json({ error: 'Could not read job list.' });
        }
    });

    // --- POST /api/schedule --- (CON LÓGICA DE HORA Y PRIMERA EJECUCIÓN CORREGIDA)
    router.post('/schedule', upload.single('fmeFile'), (req, res) => {
        let scriptNameToSchedule;
        if (req.file) {
            scriptNameToSchedule = req.file.filename;
        } else if (req.body.scriptName) {
            scriptNameToSchedule = req.body.scriptName;
        } else {
            return res.status(400).json({ error: 'You must select an existing script or upload a new one.' });
        }

        const { runTime, recurrenceType, daysOfWeek, dayOfMonth, recurrenceTime, scriptDescription } = req.body;

        if (scriptDescription && scriptNameToSchedule) {
            const meta = readScriptsMeta();
            meta[scriptNameToSchedule] = { description: scriptDescription.trim() };
            writeScriptsMeta(meta);
        }

        if (recurrenceType !== 'ondemand') {
            if (!runTime || isNaN(new Date(runTime))) {
                return res.status(400).json({ error: 'Start time is required and must be a valid date.' });
            }
        }

        const runTimeDate = runTime ? new Date(runTime) : null;
        let cronMinutes, cronHours;

        if ((recurrenceType === 'daily' || recurrenceType === 'weekly' || recurrenceType === 'monthly') && recurrenceTime) {
            [cronHours, cronMinutes] = recurrenceTime.split(':').map(Number);
        } else if (runTimeDate) {
            cronMinutes = runTimeDate.getMinutes();
            cronHours = runTimeDate.getHours();
        }

        let cronPattern;
        let isRecurrent = true;
        // **CORREGIDO**: Guardar la hora de repetición en los detalles
        let recurrenceDetails = { type: recurrenceType, time: recurrenceTime || `${String(cronHours).padStart(2, '0')}:${String(cronMinutes).padStart(2, '0')}` };

        switch (recurrenceType) {
            case 'daily':
                cronPattern = `${cronMinutes} ${cronHours} * * *`;
                break;
            case 'weekly':
                if (!daysOfWeek || daysOfWeek.length === 0) {
                    return res.status(400).json({ error: 'At least one day must be selected for weekly scheduling.' });
                }
                let daysArray;
                if (Array.isArray(daysOfWeek)) {
                    daysArray = daysOfWeek.map(Number);
                } else if (typeof daysOfWeek === 'string') {
                    daysArray = daysOfWeek.split(',').map(Number);
                } else {
                    daysArray = [];
                }
                cronPattern = `${cronMinutes} ${cronHours} * * ${daysArray.join(',')}`;
                recurrenceDetails.daysOfWeek = daysArray;
                break;
            case 'once':
            default:
                isRecurrent = false;
                delete recurrenceDetails.time; // No necesita hora de repetición si es una sola vez
                recurrenceDetails.type = 'once';
                cronPattern = `${runTimeDate.getMinutes()} ${runTimeDate.getHours()} ${runTimeDate.getDate()} ${runTimeDate.getMonth() + 1} *`;
                break;
            case 'ondemand':
                isRecurrent = false;
                delete recurrenceDetails.time;
                recurrenceDetails.type = 'ondemand';
                cronPattern = null;
                break;
        }

        const newJob = {
            id: `job_${Date.now()}`,
            scriptName: scriptNameToSchedule,
            runTime: runTime || null,
            isRecurrent: isRecurrent,
            cronPattern,
            status: 'scheduled',
            recurrence: recurrenceDetails,
            createdAt: new Date().toISOString()
        };

        try {
            let jobs = [];
            if (fs.existsSync(jobsFilePath)) {
                jobs = JSON.parse(fs.readFileSync(jobsFilePath, 'utf8'));
            }
            jobs.push(newJob);
            fs.writeFileSync(jobsFilePath, JSON.stringify(jobs, null, 2));
            logEvent(`Jobb ${newJob.id} sparades i jobs.json.`);

            // --- LÓGICA DE PROGRAMACIÓN HÍBRIDA ---
            const now = new Date();
            const firstRunDelay = runTimeDate ? runTimeDate.getTime() - now.getTime() : null;

            // Programar siempre la primera ejecución si es en el futuro
            if (firstRunDelay !== null && firstRunDelay > 0) {
                setTimeout(() => {
                    logEvent(`Aktiverar FÖRSTA KÖRNING (unik) för: ${newJob.scriptName} (ID: ${newJob.id})`);
                    const result = runFmeScript(newJob.scriptName);
                    if (!result || result.ok === false) {
                        logEvent(`WARN: No se pudo iniciar ${newJob.scriptName} en primera ejecución.`);
                    }
                }, firstRunDelay);
                logEvent(`Första körningen för ${newJob.id} är schemalagd om ${firstRunDelay} ms.`);
            } else if (firstRunDelay !== null) {
                logEvent(`WARN: La fecha de inicio para ${newJob.id} ya ha pasado. La primera ejecución se omitirá.`);
            }

            // Si el trabajo es recurrente, programar el patrón cron para las repeticiones futuras
            if (isRecurrent) {
                scheduleJob(newJob);
            }

            res.status(201).json({ message: 'Job has been scheduled and activated.', job: newJob });

        } catch (error) {
            logEvent(`FEL vid sparning av jobb: ${error.message}`);
            console.error('Fel vid sparning av jobb:', error);
            res.status(500).json({ error: 'Could not save the job.' });
        }
    });

    // --- DELETE /jobs/:id ---
    router.delete('/jobs/:id', (req, res) => {
        const jobIdToDelete = req.params.id;
        logEvent(`Begäran om att ta bort jobb med ID: ${jobIdToDelete}`);
        if (!jobIdToDelete) {
            return res.status(400).json({ error: 'Job ID is required.' });
        }
        try {
            let jobs = [];
            if (fs.existsSync(jobsFilePath)) {
                jobs = JSON.parse(fs.readFileSync(jobsFilePath, 'utf8'));
            }
            const initialJobsCount = jobs.length;
            const updatedJobs = jobs.filter(job => job.id !== jobIdToDelete);
            if (updatedJobs.length === initialJobsCount) {
                return res.status(404).json({ error: 'Job not found.' });
            }
            fs.writeFileSync(jobsFilePath, JSON.stringify(updatedJobs, null, 2));
            if (activeCronJobs && activeCronJobs[jobIdToDelete]) {
                activeCronJobs[jobIdToDelete].stop();
                delete activeCronJobs[jobIdToDelete];
                logEvent(`Aktiv cron-uppgift ${jobIdToDelete} stoppad och borttagen.`);
            }
            logEvent(`Jobb ${jobIdToDelete} borttaget.`);
            res.json({ message: 'Job deleted.' });
        } catch (error) {
            logEvent(`FEL vid borttagning av jobb: ${error.message}`);
            res.status(500).json({ error: 'Could not delete the job.' });
        }
    });

    // --- Rutas para leer logs ---
    router.get('/logs/list', (req, res) => {
        try {
            if (!fs.existsSync(logsPath)) return res.json([]);
            const files = fs.readdirSync(logsPath);
            const logFiles = files.filter(f => f.endsWith('.log'));
            logFiles.sort((a, b) => {
                if (a === defaultLogFile) return -1;
                if (b === defaultLogFile) return 1;
                return a.localeCompare(b);
            });
            res.json(logFiles);
        } catch (error) {
            res.status(500).json([]);
        }
    });
    // --- DELETE /api/logs/clean ---
    router.delete('/logs/clean', (req, res) => {
        try {
            if (!fs.existsSync(logsPath)) return res.json({ message: 'No log files to delete.' });
            const files = fs.readdirSync(logsPath).filter(f => f.endsWith('.log'));
            const failed = [];

            files.forEach(file => {
                const filePath = path.join(logsPath, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    try {
                        fs.truncateSync(filePath, 0);
                    } catch (innerError) {
                        failed.push(file);
                    }
                }
            });

            logEvent('Log files cleaned.');
            if (failed.length > 0) {
                return res.json({ message: `Some log files could not be deleted and were not cleared: ${failed.join(', ')}` });
            }
            res.json({ message: 'Log files deleted.' });
        } catch (error) {
            logEvent(`FEL vid rensning av loggar: ${error.message}`);
            res.status(500).json({ error: 'Could not clean logs.' });
        }
    });
    router.get('/logs/:filename', (req, res) => {
        const filename = req.params.filename;
        if (!filename.match(/^[\w\-\.]+\.log$/)) {
            return res.status(400).send('Invalid filename.');
        }
        const filePath = path.join(logsPath, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Log file not found.');
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        fs.createReadStream(filePath).pipe(res);
    });

    return router;
};

