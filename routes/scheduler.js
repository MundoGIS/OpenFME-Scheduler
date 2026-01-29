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

const fmeScriptsPath = path.join(__dirname, '..', 'fme_scripts');
const jobsFilePath = path.join(__dirname, '..', 'data', 'jobs.json');
const logsPath = path.join(__dirname, '..', 'logs');

// La función ahora también recibe 'runFmeScript' desde server.js
module.exports = function (upload, activeCronJobs, scheduleJob, runFmeScript) {

    // --- GET /api/scripts y GET /api/jobs ---
    router.get('/scripts', (req, res) => {
        try {
            if (!fs.existsSync(fmeScriptsPath)) return res.json([]);
            const files = fs.readdirSync(fmeScriptsPath);
            const fmeFiles = files.filter(file => path.extname(file).toLowerCase() === '.fmw');
            res.json(fmeFiles);
        } catch (error) {
            console.error('Fel vid läsning av FME-skriptkatalogen:', error);
            res.status(500).json({ error: 'Kunde inte läsa listan över skript.' });
        }
    });

    router.get('/jobs', (req, res) => {
        try {
            if (!fs.existsSync(jobsFilePath)) return res.json([]);
            const data = fs.readFileSync(jobsFilePath, 'utf8');
            res.json(JSON.parse(data));
        } catch (error) {
            console.error('Fel vid läsning av jobs.json:', error);
            res.status(500).json({ error: 'Kunde inte läsa listan över jobb.' });
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
            return res.status(400).json({ error: 'Du måste välja ett befintligt skript eller ladda upp ett nytt.' });
        }

        const { runTime, recurrenceType, daysOfWeek, dayOfMonth, recurrenceTime } = req.body;

        if (!runTime || isNaN(new Date(runTime))) {
            return res.status(400).json({ error: 'Starttid är obligatorisk och måste vara ett giltigt datum.' });
        }

        const runTimeDate = new Date(runTime);
        let cronMinutes, cronHours;

        if ((recurrenceType === 'daily' || recurrenceType === 'weekly' || recurrenceType === 'monthly') && recurrenceTime) {
            [cronHours, cronMinutes] = recurrenceTime.split(':').map(Number);
        } else {
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
                    return res.status(400).json({ error: 'Minst en dag måste väljas för veckovis schemaläggning.' });
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
        }

        const newJob = {
            id: `job_${Date.now()}`,
            scriptName: scriptNameToSchedule,
            runTime,
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
            const firstRunDelay = runTimeDate.getTime() - now.getTime();

            // Programar siempre la primera ejecución si es en el futuro
            if (firstRunDelay > 0) {
                setTimeout(() => {
                    logEvent(`Aktiverar FÖRSTA KÖRNING (unik) för: ${newJob.scriptName} (ID: ${newJob.id})`);
                    runFmeScript(newJob.scriptName);
                }, firstRunDelay);
                logEvent(`Första körningen för ${newJob.id} är schemalagd om ${firstRunDelay} ms.`);
            } else {
                logEvent(`WARN: La fecha de inicio para ${newJob.id} ya ha pasado. La primera ejecución se omitirá.`);
            }

            // Si el trabajo es recurrente, programar el patrón cron para las repeticiones futuras
            if (isRecurrent) {
                scheduleJob(newJob);
            }

            res.status(201).json({ message: 'Jobbet har schemalagts och aktiverats.', job: newJob });

        } catch (error) {
            logEvent(`FEL vid sparning av jobb: ${error.message}`);
            console.error('Fel vid sparning av jobb:', error);
            res.status(500).json({ error: 'Kunde inte spara jobbet.' });
        }
    });

    // --- DELETE /jobs/:id ---
    router.delete('/jobs/:id', (req, res) => {
        const jobIdToDelete = req.params.id;
        logEvent(`Begäran om att ta bort jobb med ID: ${jobIdToDelete}`);
        if (!jobIdToDelete) {
            return res.status(400).json({ error: 'Jobb-ID saknas.' });
        }
        try {
            let jobs = [];
            if (fs.existsSync(jobsFilePath)) {
                jobs = JSON.parse(fs.readFileSync(jobsFilePath, 'utf8'));
            }
            const initialJobsCount = jobs.length;
            const updatedJobs = jobs.filter(job => job.id !== jobIdToDelete);
            if (updatedJobs.length === initialJobsCount) {
                return res.status(404).json({ error: 'Jobbet hittades inte.' });
            }
            fs.writeFileSync(jobsFilePath, JSON.stringify(updatedJobs, null, 2));
            if (activeCronJobs && activeCronJobs[jobIdToDelete]) {
                activeCronJobs[jobIdToDelete].stop();
                delete activeCronJobs[jobIdToDelete];
                logEvent(`Aktiv cron-uppgift ${jobIdToDelete} stoppad och borttagen.`);
            }
            logEvent(`Jobb ${jobIdToDelete} borttaget.`);
            res.json({ message: 'Jobbet har tagits bort.' });
        } catch (error) {
            logEvent(`FEL vid borttagning av jobb: ${error.message}`);
            res.status(500).json({ error: 'Kunde inte ta bort jobbet.' });
        }
    });

    // --- Rutas para leer logs ---
    router.get('/logs/list', (req, res) => {
        try {
            if (!fs.existsSync(logsPath)) return res.json([]);
            const files = fs.readdirSync(logsPath);
            const logFiles = files.filter(f => f.endsWith('.log'));
            res.json(logFiles);
        } catch (error) {
            res.status(500).json([]);
        }
    });
    router.get('/logs/:filename', (req, res) => {
        const filename = req.params.filename;
        if (!filename.match(/^[\w\-\.]+\.log$/)) {
            return res.status(400).send('Ogiltigt filnamn.');
        }
        const filePath = path.join(logsPath, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Loggfilen hittades inte.');
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        fs.createReadStream(filePath).pipe(res);
    });

    return router;
};

