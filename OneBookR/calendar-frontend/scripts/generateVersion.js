/**
 * ✅ GENERATE VERSION SCRIPT
 * Körs efter build för att skapa version.json
 * Detta möjliggör version-check för cache-busting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

const versionData = {
  version: packageJson.version,
  timestamp: new Date().toISOString(),
  buildTime: new Date().getTime()
};

const distPath = path.join(__dirname, '../dist');
const versionPath = path.join(distPath, 'version.json');

// Skapa dist-mappen om den inte finns
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// Skriv version.json
fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2));
console.log('✅ Generated version.json:', versionData);
