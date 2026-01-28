# OpenFME-Scheduler

OpenFME-Scheduler is an open-source application designed to manage and schedule the execution of FME scripts. It provides a user-friendly interface and robust backend to automate workflows using `.fmw` scripts.

## Prerequisites
- **Node.js** (version 16 or higher recommended)
- **npm** (comes with Node.js)
- **FME Desktop** installed and `fme.exe` available in your system PATH

## Features

- **FME Script Management**:
  - Upload and manage `.fmw` scripts.
  - Select scripts from an existing list or upload new ones.

- **Task Scheduling**:
  - Schedule scripts to run once, daily, weekly, or monthly.
  - Uses `node-cron` for reliable task scheduling.

- **User Interface**:
  - Web-based interface for managing scheduled jobs.
  - View and manage logs directly from the browser.

- **Logging and Monitoring**:
  - Logs all events and errors for easy debugging.
  - Provides a log viewer in the web interface.

- **REST API**:
  - Exposes endpoints for managing scripts, jobs, and logs.

## Installation

1. **Install Node.js**
   - Download and install Node.js from [nodejs.org](https://nodejs.org/).
   - Verify installation by running:
     ```sh
     node -v
     npm -v
     ```

2. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/OpenFME-Scheduler.git
   cd OpenFME-Scheduler
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the application:**
   ```bash
   node server.js
   ```

5. **Open your browser and navigate to:**
   ```
   http://localhost:3100
   ```

## Running as a Windows Service
- To install the application as a Windows service, run:
  ```sh
  node service.js
  ```
- To uninstall the Windows service, run:
  ```sh
  node uninstall.js
  ```

## Usage

- **Add a Job**:
  - Select or upload an FME script.
  - Specify the schedule (date, time, and frequency).

- **View Scheduled Jobs**:
  - Check the list of all scheduled jobs.
  - Remove or modify jobs as needed.

- **View Logs**:
  - Use the log viewer to monitor execution logs.

## Notes
- Make sure `fme.exe` is available in your system PATH or update the path in `server.js`.
- The application is designed for Windows environments.

## License

This project is licensed under the Mozilla Public License, v. 2.0. See the [LICENSE](LICENSE) file for details.

## Contact

Developed by MundoGIS for the OpenFME-Scheduler project.
For inquiries, contact: abel.gonzalez@mundogis.se