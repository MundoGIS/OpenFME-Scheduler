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

// Crea un nuevo objeto de servicio
const svc = new Service({
  name: 'OpenFME-Scheduler',
  description: 'Scheduler for FME Server jobs',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max-old-space-size=8192'
  ]
});

// Define eventos para el servicio
svc.on('uninstall', function() {
  console.log('Service uninstalled successfully.');
});

// Desinstala el servicio
svc.uninstall();
