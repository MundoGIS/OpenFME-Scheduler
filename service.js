/*
This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

Copyright (C) 2025 MundoGIS.
All rights reserved.

Developed by MundoGIS for the OpenFME-Scheduler project.
For inquiries, contact: abel.gonzalez@mundogis.se
*/

const { installService } = require('./utils/service-manager');

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

const args = parseArgs();
const serviceAccount = stripQuotes(args.username) || null;
const servicePassword = stripQuotes(args.password) || null;
installService({ username: serviceAccount, password: servicePassword });

