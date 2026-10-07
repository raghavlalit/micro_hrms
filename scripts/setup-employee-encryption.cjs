const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const envPath = path.resolve(__dirname, '../apps/api/.env');
if (!fs.existsSync(envPath)) throw new Error('Set up apps/api/.env first.');
const content = fs.readFileSync(envPath, 'utf8');
if (/^EMPLOYEE_DATA_KEYS=/m.test(content)) {
  console.log('Employee encryption configuration already exists; it was not changed.');
} else {
  const keys = JSON.stringify({ v1: randomBytes(32).toString('base64') });
  fs.appendFileSync(envPath, `\n# Keep these keys backed up securely; required to read protected employee data.\nEMPLOYEE_DATA_KEY_VERSION=v1\nEMPLOYEE_DATA_KEYS='${keys}'\n`);
  console.log('Generated employee encryption keys in the ignored API .env file. Back up this file securely. Key values were not printed.');
}
