import { cpSync, existsSync, mkdirSync, statSync, rmSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const TARGET = targetArg ? targetArg.split('=')[1] : 'D:\\Finance Flow Product';
const BACK_TARGET = 'D:\\Backup\\Finance Flow Product';
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
  const backup = `${BACK_TARGET}.backup-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}`;

  console.log(`Target exists. Backing up to: ${backup}`);

  try {
    mkdirSync(dirname(backup), { recursive: true });
    cpSync(TARGET, backup, { recursive: true });
    console.log('Backup complete.');
  } catch (err) {
    console.warn(
      `Backup failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  // Preserve existing data
  const dataDir = join(TARGET, 'data');
  const tempDataDir = `${TARGET}.data-temp`;

  if (isDirectory(dataDir)) {
    console.log('Preserving existing data directory...');
    rmSync(tempDataDir, { recursive: true, force: true });
    renameSync(dataDir, tempDataDir);
  }

  console.log(`Removing existing target: ${TARGET}`);
  rmSync(TARGET, { recursive: true, force: true });

  console.log(`Copying ${SOURCE} -> ${TARGET}`);
  cpSync(SOURCE, TARGET, { recursive: true });

  // Restore data
  if (existsSync(tempDataDir)) {
    console.log('Restoring existing data directory...');
    rmSync(join(TARGET, 'data'), { recursive: true, force: true });
    renameSync(tempDataDir, join(TARGET, 'data'));
  }
} else {
  console.log(`Copying ${SOURCE} -> ${TARGET}`);
  cpSync(SOURCE, TARGET, { recursive: true });
}

console.log(`Deployment complete. Launch: ${join(TARGET, 'Finance Flow AI.exe')}`);
