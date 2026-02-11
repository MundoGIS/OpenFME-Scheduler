/*
    This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
    If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

    Copyright (C) 2025 MundoGIS.
    All rights reserved.

    Developed by MundoGIS for the OpenFME-Scheduler project.
    For inquiries, contact: abel.gonzalez@mundogis.se
    */

let infoModal = async (message) => {
    console.log(message);
};
let confirmModal = async () => {
    console.warn('Confirm modal not ready.');
    return false;
};

async function deleteJob(jobId) {
    if (!jobId) {
        console.error('deleteJob: No job ID provided.');
        return;
    }
    const confirmed = await confirmModal(`Are you sure you want to delete job ${jobId}? This action cannot be undone.`);
    if (!confirmed) return;
    try {
        const response = await fetch(`/api/jobs/${jobId}`, {
            method: 'DELETE',
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Could not delete the job.');
        }
        await infoModal(result.message || 'Job has been deleted.', 'Success', 'success');
        window.fetchJobs();
        window.fetchLogList();
    } catch (error) {
        console.error('Error deleting job:', error);
        await infoModal(error.message, 'Error', 'danger');
    }
}

async function deleteScript(scriptName) {
    if (!scriptName) {
        console.error('deleteScript: No script name provided.');
        return;
    }
    const confirmed = await confirmModal(`Are you sure you want to delete script ${scriptName}? This action cannot be undone.`);
    if (!confirmed) return;
    try {
        const response = await fetch(`/api/scripts/${encodeURIComponent(scriptName)}`, {
            method: 'DELETE',
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Could not delete the script.');
        }
        await infoModal(result.message || 'Script has been deleted.', 'Success', 'success');
        window.fetchScripts();
        window.fetchJobs();
    } catch (error) {
        console.error('Error deleting script:', error);
        await infoModal(error.message, 'Error', 'danger');
    }
}

async function saveScriptDescription(scriptName, description) {
    if (!scriptName) {
        console.error('saveScriptDescription: No script name provided.');
        return;
    }
    try {
        const response = await fetch(`/api/scripts/${encodeURIComponent(scriptName)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Could not update description.');
        }
        await infoModal(result.message || 'Description updated.', 'Success', 'success');
        if (typeof window.fetchScripts === 'function') {
            window.fetchScripts();
        }
    } catch (error) {
        console.error('Error updating description:', error);
        await infoModal(error.message, 'Error', 'danger');
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
    const runTimeColumn = document.getElementById('runTimeColumn');
    const runTimeInput = document.getElementById('runTime');
    const runTimeHelp = document.getElementById('runTimeHelp');
    const logContent = document.getElementById('log-content');
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    const logFileSelect = document.getElementById('log-file-select');
    const cleanLogsBtn = document.getElementById('clean-logs-btn');
    const scriptsTableBody = document.getElementById('scripts-table-body');
    const tabs = document.querySelectorAll('.tabs ul li');
    const tabContents = document.querySelectorAll('.tab-content');
    const descriptionModal = document.getElementById('description-modal');
    const descriptionModalClose = document.getElementById('description-modal-close');
    const descriptionCancelBtn = document.getElementById('description-cancel-btn');
    const descriptionSaveBtn = document.getElementById('description-save-btn');
    const descriptionScriptName = document.getElementById('description-script-name');
    const descriptionText = document.getElementById('description-text');
    const appModal = document.getElementById('app-modal');
    const appModalTitle = document.getElementById('app-modal-title');
    const appModalMessage = document.getElementById('app-modal-message');
    const appModalHead = document.getElementById('app-modal-head');
    const appModalIcon = document.getElementById('app-modal-icon');
    const appModalClose = document.getElementById('app-modal-close');
    const appModalOk = document.getElementById('app-modal-ok');
    const appModalCancel = document.getElementById('app-modal-cancel');

    if (tabs.length > 0 && tabContents.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.getAttribute('data-tab');
                tabs.forEach(t => t.classList.remove('is-active'));
                tabContents.forEach(content => {
                    content.style.display = content.id === targetId ? 'block' : 'none';
                    if (content.id === targetId) content.classList.add('is-active');
                    else content.classList.remove('is-active');
                });
                tab.classList.add('is-active');
            });
        });
    }

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
            if (type === 'ondemand') {
                if (runTimeColumn) runTimeColumn.style.display = 'none';
                if (runTimeInput) {
                    runTimeInput.required = false;
                    runTimeInput.value = '';
                }
                if (runTimeHelp) runTimeHelp.textContent = '';
                recurrenceOptionsDiv.style.display = 'none';
                return;
            }
            if (runTimeColumn) runTimeColumn.style.display = '';
            if (runTimeInput) runTimeInput.required = true;
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
    function openDescriptionModal(scriptName, description) {
        if (!descriptionModal) return;
        descriptionScriptName.value = scriptName || '';
        descriptionText.value = description || '';
        descriptionModal.classList.add('is-active');
    }

    function closeDescriptionModal() {
        if (!descriptionModal) return;
        descriptionModal.classList.remove('is-active');
    }

    if (descriptionModalClose) descriptionModalClose.addEventListener('click', closeDescriptionModal);
    if (descriptionCancelBtn) descriptionCancelBtn.addEventListener('click', closeDescriptionModal);
    if (descriptionModal) {
        descriptionModal.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal-background')) {
                closeDescriptionModal();
            }
        });
    }
    if (descriptionSaveBtn) {
        descriptionSaveBtn.addEventListener('click', () => {
            const scriptName = descriptionScriptName.value;
            const description = descriptionText.value;
            saveScriptDescription(scriptName, description);
            closeDescriptionModal();
        });
    }

    function showAppModal({ title, message, confirm = false, type = 'info' }) {
        if (!appModal) return Promise.resolve(false);
        appModalTitle.textContent = title || 'Message';
        appModalMessage.textContent = message || '';
        appModalCancel.style.display = confirm ? 'inline-flex' : 'none';
        if (appModalHead) {
            appModalHead.classList.remove('is-info', 'is-success', 'is-danger', 'is-warning');
            if (type === 'success') appModalHead.classList.add('is-success');
            else if (type === 'danger') appModalHead.classList.add('is-danger');
            else if (type === 'warning') appModalHead.classList.add('is-warning');
            else appModalHead.classList.add('is-info');
        }
        if (appModalIcon) {
            const iconMap = {
                success: 'fas fa-check-circle',
                danger: 'fas fa-exclamation-triangle',
                warning: 'fas fa-exclamation-circle',
                info: 'fas fa-info-circle'
            };
            const iconClass = iconMap[type] || iconMap.info;
            appModalIcon.innerHTML = `<i class="${iconClass}"></i>`;
        }
        appModal.classList.add('is-active');

        return new Promise((resolve) => {
            const cleanup = () => {
                appModal.classList.remove('is-active');
                appModalOk.removeEventListener('click', onOk);
                appModalCancel.removeEventListener('click', onCancel);
                appModalClose.removeEventListener('click', onCancel);
                appModal.removeEventListener('click', onBackground);
            };

            const onOk = () => {
                cleanup();
                resolve(true);
            };
            const onCancel = () => {
                cleanup();
                resolve(false);
            };
            const onBackground = (event) => {
                if (event.target.classList.contains('modal-background')) {
                    onCancel();
                }
            };

            appModalOk.addEventListener('click', onOk);
            appModalCancel.addEventListener('click', onCancel);
            appModalClose.addEventListener('click', onCancel);
            appModal.addEventListener('click', onBackground);
        });
    }

    infoModal = async (message, title = 'Message', type = 'info') => {
        await showAppModal({ title, message, confirm: false, type });
    };

    confirmModal = async (message, title = 'Confirm') => {
        return await showAppModal({ title, message, confirm: true, type: 'warning' });
    };

    window.fetchScripts = async function() {
        try {
            const [scriptsResponse, runningResponse] = await Promise.all([
                fetch('/api/scripts'),
                fetch('/api/running')
            ]);
            if (!scriptsResponse.ok) throw new Error('Network error.');
            const scripts = await scriptsResponse.json();
            const running = runningResponse.ok ? await runningResponse.json() : {};
            scriptSelect.innerHTML = '<option value="">-- Select an existing script --</option>';
            scripts.forEach(script => {
                const option = document.createElement('option');
                option.value = script.name;
                option.textContent = script.name;
                scriptSelect.appendChild(option);
            });

            if (scriptsTableBody) {
                scriptsTableBody.innerHTML = '';
                if (scripts.length === 0) {
                    scriptsTableBody.innerHTML = '<tr><td colspan="2" class="has-text-centered">No scripts available.</td></tr>';
                } else {
                    scripts.forEach(script => {
                        const row = document.createElement('tr');
                        const isRunning = Boolean(running[script.name]);
                        row.innerHTML = `
                            <td>
                                <div><strong>${script.name}</strong></div>
                                <div class="is-size-7 has-text-grey">${script.description || ''}</div>
                                ${isRunning ? '<span class="tag is-warning mt-2">Running</span>' : ''}
                            </td>
                            <td>
                                <button class="button is-info is-small edit-description-btn" data-script="${script.name}" data-description="${script.description || ''}">
                                    <span class="icon is-small"><i class="fas fa-comment"></i></span>
                                    <span>Description</span>
                                </button>
                                ${isRunning ? `
                                <button class="button is-danger is-small stop-script-btn" data-script="${script.name}">
                                    <span class="icon is-small"><i class="fas fa-stop"></i></span>
                                    <span>Stop</span>
                                </button>
                                ` : ''}
                                <button class="button is-link is-small download-script-btn" data-script="${script.name}">
                                    <span class="icon is-small"><i class="fas fa-download"></i></span>
                                    <span>Download</span>
                                </button>
                                <button class="button is-danger is-small delete-script-btn" data-script="${script.name}">
                                    <span class="icon is-small"><i class="fas fa-trash"></i></span>
                                    <span>Delete</span>
                                </button>
                            </td>
                        `;
                        scriptsTableBody.appendChild(row);
                    });

                    scriptsTableBody.querySelectorAll('.edit-description-btn').forEach(btn => {
                        btn.addEventListener('click', (event) => {
                            const scriptName = event.currentTarget.dataset.script;
                            const description = event.currentTarget.dataset.description || '';
                            openDescriptionModal(scriptName, description);
                        });
                    });

                    scriptsTableBody.querySelectorAll('.download-script-btn').forEach(btn => {
                        btn.addEventListener('click', (event) => {
                            const scriptName = event.currentTarget.dataset.script;
                            window.open(`/api/scripts/${encodeURIComponent(scriptName)}/download`, '_blank');
                        });
                    });

                    scriptsTableBody.querySelectorAll('.stop-script-btn').forEach(btn => {
                        btn.addEventListener('click', async (event) => {
                            const scriptName = event.currentTarget.dataset.script;
                            const confirmed = await confirmModal(`Stop running script ${scriptName}?`);
                            if (!confirmed) return;
                            try {
                                const response = await fetch('/api/stop-script', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ scriptName })
                                });
                                const result = await response.json();
                                if (!response.ok) {
                                    throw new Error(result.error || 'Could not stop the script.');
                                }
                                await infoModal(result.message || 'Script stopped.', 'Success', 'success');
                                window.fetchScripts();
                                window.fetchJobs();
                            } catch (error) {
                                await infoModal(error.message || 'Error stopping script.', 'Error', 'danger');
                            }
                        });
                    });

                    scriptsTableBody.querySelectorAll('.delete-script-btn').forEach(btn => {
                        btn.addEventListener('click', (event) => {
                            const scriptName = event.currentTarget.dataset.script;
                            deleteScript(scriptName);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error loading FME scripts:', error);
            scriptSelect.innerHTML = '<option value="">Error loading scripts</option>';
            if (scriptsTableBody) {
                scriptsTableBody.innerHTML = '<tr><td colspan="2" class="has-text-centered">Error loading scripts.</td></tr>';
            }
        }
    }

    // Uppdaterad funktion för att ladda och visa schemalagda jobb
    window.fetchJobs = async function() {
        try {
            const [jobsResponse, runningResponse] = await Promise.all([
                fetch('/api/jobs'),
                fetch('/api/running')
            ]);
            if (!jobsResponse.ok) throw new Error('Network error.');
            const jobs = await jobsResponse.json();
            const running = runningResponse.ok ? await runningResponse.json() : {};

            jobsTableBody.innerHTML = '';
            if (jobs.length === 0) {
                jobsTableBody.innerHTML = '<tr><td colspan="5" class="has-text-centered">No jobs scheduled.</td></tr>';
                return;
            }
            
            jobs.forEach(job => {
                const runTime = job.runTime ? new Date(job.runTime) : null;
                const row = document.createElement('tr');
                const isRunning = Boolean(running[job.scriptName]);
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
                } else if (job.recurrence?.type === 'ondemand') {
                    recurrenceText = 'On-demand';
                }

                const statusText = isRunning ? 'Running' : (job.status || 'Scheduled');
                const statusClass = isRunning ? 'is-warning' : 'is-info';

                row.innerHTML = `
                    <td>${job.scriptName}</td>
                    <td>${runTime ? runTime.toLocaleString('en-GB') : '-'}</td>
                    <td>${recurrenceText}</td>
                    <td><span class="tag ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="button is-primary is-small run-script-btn" data-script="${job.scriptName}" ${isRunning ? 'disabled' : ''}>
                            <span class="icon is-small"><i class="fas fa-play"></i></span>
                            <span>${isRunning ? 'Running' : 'Run'}</span>
                        </button>
                        ${isRunning ? `
                        <button class="button is-danger is-small stop-script-btn" data-script="${job.scriptName}">
                            <span class="icon is-small"><i class="fas fa-stop"></i></span>
                            <span>Stop</span>
                        </button>
                        ` : ''}
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
                        if (!response.ok) {
                            throw new Error(result.error || 'Error executing script.');
                        }
                        await infoModal(result.message || 'Script executed.', 'Success', 'success');
                        window.fetchJobs();
                    } catch (error) {
                        await infoModal('Error executing script: ' + error, 'Error', 'danger');
                    }
                });
            });

            jobsTableBody.querySelectorAll('.stop-script-btn').forEach(btn => {
                btn.addEventListener('click', async (event) => {
                    const scriptName = event.currentTarget.dataset.script;
                    const confirmed = await confirmModal(`Stop running script ${scriptName}?`);
                    if (!confirmed) return;
                    try {
                        const response = await fetch('/api/stop-script', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scriptName })
                        });
                        const result = await response.json();
                        if (!response.ok) {
                            throw new Error(result.error || 'Could not stop the script.');
                        }
                        await infoModal(result.message || 'Script stopped.', 'Success', 'success');
                        window.fetchJobs();
                    } catch (error) {
                        await infoModal(error.message || 'Error stopping script.', 'Error', 'danger');
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
                const generalGroup = document.createElement('optgroup');
                generalGroup.label = 'General';
                const scriptsGroup = document.createElement('optgroup');
                scriptsGroup.label = 'Scripts';

                logFiles.forEach(filename => {
                    const option = document.createElement('option');
                    option.value = filename;
                    option.textContent = filename;
                    if (filename === 'scheduler.log') {
                        generalGroup.appendChild(option);
                    } else {
                        scriptsGroup.appendChild(option);
                    }
                });

                if (generalGroup.children.length > 0) logFileSelect.appendChild(generalGroup);
                if (scriptsGroup.children.length > 0) logFileSelect.appendChild(scriptsGroup);

                const firstOption = logFileSelect.querySelector('option');
                if (firstOption) {
                    fetchLogs(firstOption.value);
                }
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
                await infoModal('Please select at least one day for weekly scheduling.', 'Warning', 'warning');
                return;
            }
            formData.append('daysOfWeek', days.join(','));
        }

        const selectedScript = formData.get('scriptName');
        const uploadedFile = formData.get('fmeFile');
        if (!selectedScript && (!uploadedFile || uploadedFile.size === 0)) {
            await infoModal('Please select an existing script or upload a new .fmw file.', 'Warning', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/schedule', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) { throw new Error(result.error || 'Error scheduling the job.'); }
            await infoModal(result.message || 'Job has been scheduled.', 'Success', 'success');
            scheduleForm.reset();
            recurrenceOptionsDiv.style.display = 'none';
            if (fileNameDisplay) fileNameDisplay.textContent = 'No file selected.';

            fetchJobs();
            fetchScripts();
            fetchLogList();
        } catch (error) {
            console.error('Form error:', error);
            await infoModal(error.message, 'Error', 'danger');
        }
    });

    // Event listeners för logg-sektionen
    if (logFileSelect) { logFileSelect.addEventListener('change', () => fetchLogs(logFileSelect.value)); }
    if (refreshLogsBtn) { refreshLogsBtn.addEventListener('click', fetchLogList); }
    if (cleanLogsBtn) {
        cleanLogsBtn.addEventListener('click', async () => {
            const confirmed = await confirmModal('Are you sure you want to delete all log files?');
            if (!confirmed) return;
            try {
                const response = await fetch('/api/logs/clean', { method: 'DELETE' });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Could not clean logs.');
                }
                await infoModal(result.message || 'Logs cleaned.', 'Success', 'success');
                fetchLogList();
            } catch (error) {
                await infoModal(error.message, 'Error', 'danger');
            }
        });
    }

    // Initiering
    fetchScripts();
    fetchJobs();
    fetchLogList();
});

