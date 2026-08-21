import { readdirSync, copyFileSync, cpSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const TARGET = targetArg ? targetArg.split('=')[1] : 'D:\\Finance Flow Product';
const SOURCE = join(projectRoot, 'release', 'win-unpacked');

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

if (!existsSync(SOURCE)) {
  console.error(`Source folder not found: ${SOURCE}`);
  console.error('Run "npm run package:local" first.');
  process.exit(1);
}

if (existsSync(TARGET)) {
  const backup = `${TARGET}.backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  console.log(`Target exists. Backing up to: ${backup}`);
  try {
    cpSync(TARGET, backup, { recursive: true });
    console.log('Backup complete.');
  } catch (err) {
    console.warn(`Backup failed: ${err.message}`);
  }
  console.log(`Removing existing target: ${TARGET}`);
  rmSync(TARGET, { recursive: true, force: true });
}

console.log(`Copying ${SOURCE} -> ${TARGET}`);
cpSync(SOURCE, TARGET, { recursive: true });

const dataDir = join(TARGET, 'data');
if (existsSync(dataDir)) {
  console.log('Preserved existing data directory.');
} else {
  console.log('No existing data directory found. App will create one on first launch.');
}

console.log(`\nDeployment complete. Launch: ${join(TARGET, 'Finance Flow AI.exe')}`);
