const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const serviceName = 'OpenFME-Scheduler';
const serviceId = 'se.mundogis.openfme-scheduler';

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw new Error(`Could not run ${command}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with code ${result.status}.`);
    }
}

function runIfPresent(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw new Error(`Could not run ${command}: ${result.error.message}`);
    }
}

function getLinuxServicePath() {
    return path.join(os.homedir(), '.config', 'systemd', 'user', 'openfme-scheduler.service');
}

function quoteSystemdArgument(value) {
    return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

function getMacServicePath() {
    return path.join(os.homedir(), 'Library', 'LaunchAgents', `${serviceId}.plist`);
}

function createLinuxService(projectPath) {
    const servicePath = getLinuxServicePath();
    fs.mkdirSync(path.dirname(servicePath), { recursive: true });
    fs.writeFileSync(servicePath, `[Unit]
Description=${serviceName}
After=network.target

[Service]
Type=simple
WorkingDirectory=${projectPath}
ExecStart=${quoteSystemdArgument(process.execPath)} ${quoteSystemdArgument(path.join(projectPath, 'server.js'))}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`, 'utf8');
    run('systemctl', ['--user', 'daemon-reload']);
    run('systemctl', ['--user', 'enable', '--now', 'openfme-scheduler.service']);
    console.log(`Installed and started ${serviceName} as a systemd user service.`);
}

function createMacService(projectPath) {
    const servicePath = getMacServicePath();
    const userId = process.getuid();
    fs.mkdirSync(path.dirname(servicePath), { recursive: true });
    fs.writeFileSync(servicePath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${serviceId}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(projectPath, 'server.js')}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectPath}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(projectPath, 'logs', 'service.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(projectPath, 'logs', 'service-error.log')}</string>
</dict>
</plist>
`, 'utf8');
    runIfPresent('launchctl', ['bootout', `gui/${userId}`, servicePath]);
    run('launchctl', ['bootstrap', `gui/${userId}`, servicePath]);
    console.log(`Installed and started ${serviceName} as a launchd agent.`);
}

function installService(options = {}) {
    const projectPath = path.resolve(options.projectPath || path.join(__dirname, '..'));
    if (process.platform === 'win32') {
        const Service = require('node-windows').Service;
        const service = new Service({
            name: serviceName,
            description: 'Scheduler for FME Server jobs',
            script: path.join(projectPath, 'server.js'),
            nodeOptions: ['--max-old-space-size=8192'],
            logpath: path.join(projectPath, 'logs')
        });
        if (options.username && options.password) {
            const [domain, user] = options.username.includes('\\') ? options.username.split('\\') : [null, options.username];
            service.logOnAs(domain, user, options.password);
        }
        service.on('install', () => service.start());
        service.install();
        return;
    }
    if (process.platform === 'linux') return createLinuxService(projectPath);
    if (process.platform === 'darwin') return createMacService(projectPath);
    throw new Error(`Unsupported platform: ${process.platform}.`);
}

function uninstallService() {
    if (process.platform === 'win32') {
        const Service = require('node-windows').Service;
        const service = new Service({ name: serviceName, script: path.join(__dirname, '..', 'server.js') });
        service.on('uninstall', () => console.log('Service uninstalled successfully.'));
        service.uninstall();
        return;
    }
    if (process.platform === 'linux') {
        const servicePath = getLinuxServicePath();
        runIfPresent('systemctl', ['--user', 'disable', '--now', 'openfme-scheduler.service']);
        fs.rmSync(servicePath, { force: true });
        run('systemctl', ['--user', 'daemon-reload']);
        console.log(`Uninstalled ${serviceName} systemd user service.`);
        return;
    }
    if (process.platform === 'darwin') {
        const servicePath = getMacServicePath();
        runIfPresent('launchctl', ['bootout', `gui/${process.getuid()}`, servicePath]);
        fs.rmSync(servicePath, { force: true });
        console.log(`Uninstalled ${serviceName} launchd agent.`);
        return;
    }
    throw new Error(`Unsupported platform: ${process.platform}.`);
}

module.exports = { installService, uninstallService };