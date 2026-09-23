# OpenFME-Scheduler

![OpenFME-Scheduler Logo](https://github.com/MundoGIS/OpenFME-Scheduler/blob/main/public/css/images/OpenFME.png)

OpenFME-Scheduler is an open-source application designed to manage and schedule the execution of FME scripts. It provides a user-friendly interface and robust backend to automate workflows using `.fmw` scripts.

**Current version:** 1.1.0

## Prerequisites

- **Node.js** (version 16 or higher recommended)
- **npm** (comes with Node.js)
- **FME Form/Desktop** installed and available in your system PATH (`fme.exe` on Windows and `fme` on Linux/macOS)

## Features

- **FME Script Management**
  - Upload and manage `.fmw` scripts.
  - Select scripts from an existing list or upload new ones.
  - Add/edit script descriptions.
  - Download scripts and delete unused scripts safely.

- **Task Scheduling**
  - Schedule scripts to run once, daily, weekly, monthly, or **on-demand**.
  - Hybrid scheduling: first run at a specific date/time, then recurring runs.
  - Uses `node-cron` for reliable task scheduling.

- **Manual Control**
  - Run scripts immediately from the UI.
  - Stop running scripts with one click.

- **User Interface**
  - Web-based interface for managing scheduled jobs.
  - View and manage logs directly from the browser.

- **Logging and Monitoring**
  - Logs all events and errors for easy debugging.
  - Log viewer with refresh and clean tools.

- **REST API**
  - Exposes endpoints for managing scripts, jobs, and logs.

---

## Installation

### 1. Install Node.js

Install Node.js 16 or later using the package manager or installer for your operating system. Verify the installation:

```sh
node -v
npm -v
```

See [nodejs.org](https://nodejs.org/) for operating-system-specific installation instructions.

---

### 2. Clone the repository

```bash
git clone https://github.com/MundoGIS/OpenFME-Scheduler.git
cd OpenFME-Scheduler
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the application

```bash
npm start
```

### 5. Open your browser and go to:

```
http://localhost:3100
```

---

## Running as a Service

The service commands select the native service manager for the current platform:

```sh
npm run service:install
```

To uninstall the service:

```sh
npm run service:uninstall
```

### Windows

Windows uses `node-windows`. To install under a specific account, pass its credentials directly:

```sh
node service.js --username=DOMAIN\\username --password=your-password
```

### Linux

Linux uses a per-user `systemd` unit at `~/.config/systemd/user/openfme-scheduler.service`. It runs with the same account that executes the install command and reads the project's `.env` file. To keep the service running after the user logs out, enable lingering once as an administrator:

```sh
loginctl enable-linger "$USER"
```

Inspect the service with:

```sh
systemctl --user status openfme-scheduler
journalctl --user -u openfme-scheduler
```

### macOS

macOS uses a per-user `launchd` agent at `~/Library/LaunchAgents/se.mundogis.openfme-scheduler.plist`. It starts when that user logs in. Service output is written to `logs/service.log` and `logs/service-error.log`.

By following these steps, you can ensure that the OpenFME-Scheduler runs reliably in your environment.

---

### Configuring the .env File

Before installing the OpenFME-Scheduler, you must configure the `.env` file to ensure all paths and settings are correct for your environment.

1. **Open the `.env` File**:
   - Locate the `.env` file in the root of the project.
   - Open it in a text editor of your choice.

2. **Update the Paths**. Use paths for the host operating system:
   - Ensure the paths to `FME_EXECUTABLE_PATH`, `FME_SCRIPTS_PATH`, and `JOBS_FILE_PATH` are correct for your system. For example:
     ```dotenv
     # Windows
     FME_EXECUTABLE_PATH=C:\Program Files\FME\fme.exe
     FME_SCRIPTS_PATH=C:\OpenFME-Scheduler\fme_scripts
     JOBS_FILE_PATH=C:\OpenFME-Scheduler\data\jobs.json

     # Linux or macOS
     # FME_EXECUTABLE_PATH=/opt/fme/fme
     # FME_SCRIPTS_PATH=/opt/openfme-scheduler/fme_scripts
     # JOBS_FILE_PATH=/opt/openfme-scheduler/data/jobs.json
     ```

   `FME_EXECUTABLE_PATH` is optional when `fme.exe` (Windows) or `fme` (Linux/macOS) is already in `PATH`.

3. **Save the File**:
   - After making the changes, save the file.

4. **Proceed with Installation**:
   - Once the `.env` file is configured, you can proceed to install the service by running:
     ```bash
     npm run service:install
     ```

By ensuring the `.env` file is properly configured, you can avoid issues related to incorrect paths or missing configurations.

---

## Usage

- **Add a Job:**
  - Select or upload an FME script.
  - Specify the schedule (date, time, and frequency).

- **View Scheduled Jobs:**
  - Check the list of all scheduled jobs.
  - Remove or modify jobs as needed.

- **View Logs:**
  - Use the log viewer to monitor execution logs.

---

## Notes

- Make sure the FME command is available in your system `PATH`, or set `FME_EXECUTABLE_PATH` in `.env`.
- The application supports Windows, Linux, and macOS. FME workspace compatibility and licensing remain dependent on the FME distribution installed on that host.

---

## Support and Issue Reporting

If you need assistance with installation, service setup, environment configuration, or troubleshooting on Windows, Linux, or macOS, please contact the support team at support@mundogis.se.

We welcome bug reports, feature requests, and deployment feedback. When reporting an issue, please include:

- Operating system and version
- Node.js and npm version
- FME installation details and version
- Relevant environment variables or `.env` configuration
- Steps to reproduce the problem
- Any relevant log output or error messages

This helps us diagnose and resolve issues more quickly and reliably.

---

## License

This project is licensed under the Mozilla Public License, v. 2.0. See the [LICENSE](LICENSE) file for details.

---

## Contact

Developed by MundoGIS for the OpenFME-Scheduler project.

For installation support, technical questions, or feedback, please contact the project support team at support@mundogis.se.

We are happy to assist with installation guidance and to review bug reports, improvement suggestions, and deployment issues.

Best regards,
OpenFME-Scheduler Support