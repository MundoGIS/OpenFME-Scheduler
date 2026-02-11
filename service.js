/*
This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

Copyright (C) 2025 MundoGIS.
All rights reserved.

Developed by MundoGIS for the OpenFME-Scheduler project.
For inquiries, contact: abel.gonzalez@mundogis.se
*/

const path = require('path');
const Service = require('node-windows').Service;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  args.forEach(arg => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    parsed[key] = rest.join('=');
  });
  return parsed;
}

function stripQuotes(value) {
  if (!value) return value;
  return value.replace(/^"|"$/g, '');
}

function parseAccount(account) {
  if (!account) return { domain: null, user: null };
  if (account.includes('\\')) {
    const [domain, user] = account.split('\\');
    return { domain, user };
  }
  return { domain: null, user: account };
}

const args = parseArgs();
const serviceAccount = stripQuotes(args.username) || null;
const servicePassword = stripQuotes(args.password) || null;
const scriptPath = path.join(__dirname, 'server.js');
const logPath = path.join(__dirname, 'logs');

// Crea un nuevo objeto de servicio
const svc = new Service({
  name: 'OpenFME-Scheduler',
  description: 'Scheduler for FME Server jobs',
  script: scriptPath,
  nodeOptions: [
    '--harmony', // Si tienes otras opciones, inclúyelas aquí
    '--max-old-space-size=8192' // Agregar el límite de memoria
  ],
  logpath: logPath
});

if (serviceAccount && servicePassword) {
  const { domain, user } = parseAccount(serviceAccount);
  if (user) {
    svc.logOnAs(domain, user, servicePassword);
  }
}

// Define eventos para el servicio
svc.on('install', function() {
  svc.start();
});

// Instala el servicio
svc.install();

