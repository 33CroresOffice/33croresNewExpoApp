#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const clientsDir = path.join(rootDir, 'clients');

function listClients() {
  return fs
    .readdirSync(clientsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);
}

function fail(message) {
  console.error(message);
  console.error('\nAvailable clients:');
  listClients().forEach((id) => console.error(`  - ${id}`));
  process.exit(1);
}

const clientId = process.argv[2];

if (!clientId) {
  fail('Usage: npm run apply-client -- <clientId>');
}

const clientDir = path.join(clientsDir, clientId);
const configPath = path.join(clientDir, 'client.json');

if (!fs.existsSync(configPath)) {
  fail(`Client "${clientId}" not found (expected ${configPath}).`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const required = ['name', 'slug', 'scheme'];
const missing = required.filter((key) => !config[key]);
if (!config.android || !config.android.package) missing.push('android.package');
if (missing.length) {
  fail(`Client "${clientId}" is missing required field(s): ${missing.join(', ')}`);
}

// 1. Point app.config.js at this client.
fs.writeFileSync(
  path.join(rootDir, '.active-client.json'),
  JSON.stringify({ clientId }, null, 2) + '\n'
);
console.log(`Active client set to "${clientId}" (${config.name}).`);

// 2. Rewrite the app's initial route.
if (config.initialRoute) {
  const indexPath = path.join(rootDir, 'app', 'index.tsx');
  const source = fs.readFileSync(indexPath, 'utf8');
  const redirectPattern = /return <Redirect href="[^"]*" \/>;/;
  if (redirectPattern.test(source)) {
    const updated = source.replace(
      redirectPattern,
      `return <Redirect href="${config.initialRoute}" />;`
    );
    fs.writeFileSync(indexPath, updated);
    console.log(`Initial route set to "${config.initialRoute}".`);
  } else {
    console.warn(`Warning: could not find the redirect line in ${indexPath}; initial route was not updated.`);
  }
}

// 3. Regenerate native projects from the client config.
const platforms = process.env.APPLY_CLIENT_PLATFORMS || 'android';
console.log(`\nRunning "npx expo prebuild --clean --platform ${platforms}"...`);
execSync(`npx expo prebuild --clean --platform ${platforms}`, {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log(`\nClient "${clientId}" applied. You can now run:`);
console.log('  npm run android');
console.log('  npm run ios');
