/*
    This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
    If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

    Copyright (C) 2025 MundoGIS.
    All rights reserved.

    Developed by MundoGIS for the OpenFME-Scheduler project.
    For inquiries, contact: abel.gonzalez@mundogis.se
    */

async function deleteJob(jobId) {
    if (!jobId) {
        console.error('deleteJob: No job ID provided.');
        return;
    }
    if (!confirm(`Are you sure you want to delete job ${jobId}? This action cannot be undone.`)) {
        return;
    }
    try {
        const response = await fetch(`/api/jobs/${jobId}`, {
            method: 'DELETE',
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Could not delete the job.');
        }
        alert(result.message || 'Job has been deleted.');
        // Update both job list and log list
        window.fetchJobs();
        window.fetchLogList();
    } catch (error) {
        console.error('Error deleting job:', error);
        alert(error.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Referenser till DOM-element ---
    const scriptSelect = document.getElementById('scriptName');
    const jobsTableBody = document.getElementById('jobs-table-body');
    const scheduleForm = document.getElementById('schedule-form');
    const fileInput = document.getElementById('fmeFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const recurrenceTypeSelect = document.getElementById('recurrenceType');
    const recurrenceOptionsDiv = document.getElementById('recurrenceOptions'); // Contenedor principal
    const recurrenceTimeOptionsDiv = document.getElementById('recurrenceTimeOptions');
    const weeklyOptionsDiv = document.getElementById('weeklyOptions');
    const monthlyOptionsDiv = document.getElementById('monthlyOptions');
    const logContent = document.getElementById('log-content');
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    const logFileSelect = document.getElementById('log-file-select');

    // --- Logik för formulär-interaktioner ---
    if (fileInput && fileNameDisplay) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                fileNameDisplay.textContent = fileInput.files[0].name;
                scriptSelect.selectedIndex = 0;
            } else {
                fileNameDisplay.textContent = 'No file selected.';
            }
        });
    }
    if (scriptSelect) {
        scriptSelect.addEventListener('change', () => {
            if (scriptSelect.value !== '') {
                fileInput.value = '';
                if (fileNameDisplay) fileNameDisplay.textContent = 'No file selected.';
            }
        });
    }
    // Visar/döljer de avancerade schemaläggningsalternativen
    if (recurrenceTypeSelect) {
        recurrenceTypeSelect.addEventListener('change', () => {
            const type = recurrenceTypeSelect.value;
            if (type === 'daily' || type === 'weekly' || type === 'monthly') {
                recurrenceOptionsDiv.style.display = 'block';
                recurrenceTimeOptionsDiv.style.display = 'block';
                weeklyOptionsDiv.style.display = type === 'weekly' ? 'block' : 'none';
                monthlyOptionsDiv.style.display = type === 'monthly' ? 'block' : 'none';
            } else {
                recurrenceOptionsDiv.style.display = 'none';
            }
        });
    }

    // --- Funktioner för att hämta data från API ---
    async function fetchScripts() {
        try {
            const response = await fetch('/api/scripts');
            if (!response.ok) throw new Error('Network error.');
            const scripts = await response.json();
            scriptSelect.innerHTML = '<option value="">-- Select an existing script --</option>';
            scripts.forEach(script => {
                const option = document.createElement('option');
                option.value = script;
                option.textContent = script;
                scriptSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading FME scripts:', error);
            scriptSelect.innerHTML = '<option value="">Error loading scripts</option>';
        }
    }

    // Uppdaterad funktion för att ladda och visa schemalagda jobb
    window.fetchJobs = async function() {
        try {
            const response = await fetch('/api/jobs');
            if (!response.ok) throw new Error('Network error.');
            const jobs = await response.json();

            jobsTableBody.innerHTML = '';
            if (jobs.length === 0) {
                jobsTableBody.innerHTML = '<tr><td colspan="5" class="has-text-centered">No jobs scheduled.</td></tr>';
                return;
            }
            
            jobs.forEach(job => {
                const runTime = new Date(job.runTime);
                const row = document.createElement('tr');
                let recurrenceText = 'Once';
                if (job.isRecurrent && job.recurrence) {
                    let timeText = job.recurrence.time ? ` at ${job.recurrence.time}` : '';
                    switch(job.recurrence.type) {
                        case 'daily':
                            recurrenceText = `Daily${timeText}`;
                            break;
                        case 'weekly':
                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            const selectedDayNames = job.recurrence.daysOfWeek?.map(d => dayNames[d]).join(', ') || 'Selected days';
                            recurrenceText = `Weekly (${selectedDayNames})${timeText}`;
                            break;
                        case 'monthly':
                            recurrenceText = `Monthly (day ${job.recurrence.dayOfMonth})${timeText}`;
                            break;
                    }
                }

                row.innerHTML = `
                    <td>${job.scriptName}</td>
                    <td>${runTime.toLocaleString('en-GB')}</td>
                    <td>${recurrenceText}</td>
                    <td><span class="tag is-info">${job.status || 'Scheduled'}</span></td>
                    <td>
                        <button class="button is-primary is-small run-script-btn" data-script="${job.scriptName}">
                            <span class="icon is-small"><i class="fas fa-play"></i></span>
                            <span>Run</span>
                        </button>
                        <button class="button is-danger is-small" onclick="deleteJob('${job.id}')">
                            <span class="icon is-small"><i class="fas fa-trash"></i></span>
                            <span>Delete</span>
                        </button>
                    </td>
                `;
                jobsTableBody.appendChild(row);
            });

            // Add event listener for run-script-btn
            jobsTableBody.querySelectorAll('.run-script-btn').forEach(btn => {
                btn.addEventListener('click', async (event) => {
                    const scriptName = event.currentTarget.dataset.script;
                    try {
                        const response = await fetch('/api/run-script', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scriptName })
                        });
                        const result = await response.json();
                        alert(result.message || 'Script executed.');
                    } catch (error) {
                        alert('Error executing script: ' + error);
                    }
                });
            });
        } catch (error) {
            console.error('Error loading jobs:', error);
            jobsTableBody.innerHTML = '<tr><td colspan="5" class="has-text-centered">Error loading job list.</td></tr>';
        }
    }

    // Funktioner för att hämta loggar
    window.fetchLogList = async function() {
        if (!logFileSelect) return;
        try {
            const response = await fetch('/api/logs/list');
            if (!response.ok) throw new Error('Network error');
            const logFiles = await response.json();
            logFileSelect.innerHTML = '';
            if (logFiles.length > 0) {
                logFiles.forEach(filename => {
                    const option = document.createElement('option');
                    option.value = filename;
                    option.textContent = filename;
                    logFileSelect.appendChild(option);
                });
                fetchLogs(logFiles[0]);
            } else {
                logFileSelect.innerHTML = '<option value="">No logs available</option>';
                logContent.textContent = 'No logs to display.';
            }
        } catch (error) {
            console.error('Error loading log list:', error);
            logFileSelect.innerHTML = '<option value="">Error loading</option>';
        }
    }

    async function fetchLogs(filename) {
        if (!logContent || !filename) {
            if (logContent) logContent.textContent = 'Please select a log file.';
            return;
        }
        logContent.textContent = `Loading ${filename}...`;
        try {
            const response = await fetch(`/api/logs/${filename}`);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const text = await response.text();
            const lines = text.split('\n');
            const lastLines = lines.slice(-200).join('\n');
            logContent.textContent = lastLines || 'Log file is empty.';
            logContent.parentElement.scrollTop = logContent.parentElement.scrollHeight;
        } catch (error) {
            console.error(`Error loading log file ${filename}:`, error);
            logContent.textContent = `Error loading ${filename}.`;
        }
    }
    
    // Hantera formulärinskickning (Uppdaterad för avancerad schemaläggning)
    scheduleForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(scheduleForm);
        
  
        const recurrenceType = formData.get('recurrenceType');
        if (recurrenceType === 'weekly') {
            const days = Array.from(document.querySelectorAll('#weeklyOptions input:checked')).map(cb => cb.value);
            if (days.length === 0) {
                alert('Please select at least one day for weekly scheduling.');
                return;
            }
            formData.append('daysOfWeek', days.join(','));
        }

        const selectedScript = formData.get('scriptName');
        const uploadedFile = formData.get('fmeFile');
        if (!selectedScript && (!uploadedFile || uploadedFile.size === 0)) {
            alert('Please select an existing script or upload a new .fmw file.');
            return;
        }

        try {
            const response = await fetch('/api/schedule', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) { throw new Error(result.error || 'Error scheduling the job.'); }
            alert(result.message || 'Job has been scheduled.');
            scheduleForm.reset();
            recurrenceOptionsDiv.style.display = 'none';
            if (fileNameDisplay) fileNameDisplay.textContent = 'No file selected.';

            fetchJobs();
            fetchScripts();
            fetchLogList();
        } catch (error) {
            console.error('Form error:', error);
            alert(error.message);
        }
    });

    // Event listeners för logg-sektionen
    if (logFileSelect) { logFileSelect.addEventListener('change', () => fetchLogs(logFileSelect.value)); }
    if (refreshLogsBtn) { refreshLogsBtn.addEventListener('click', fetchLogList); }

    // Initiering
    fetchScripts();
    fetchJobs();
    fetchLogList();
});

