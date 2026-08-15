import { existsSync, mkdirSync, copyFileSync, closeSync, openSync, readSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { initializeDatabase, closeDatabase } from './database-service';
import { getSetting, setSetting, setDatabase as setSettingsDatabase } from './settings-service';

const DB_MAGIC = Buffer.from('SQLite format 3\0', 'ascii');
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function getDatabasePath(userDataPath: string): string {
  return join(userDataPath, 'finance.db');
}

export function exportDatabase(dbPath: string, targetPath: string): void {
  if (!existsSync(dbPath)) throw new Error(`Database not found at ${dbPath}`);

  const targetDir = dirname(targetPath);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  copyFileSync(dbPath, targetPath);

  const wal = `${dbPath}-wal`;
  const shm = `${dbPath}-shm`;
  if (existsSync(wal)) copyFileSync(wal, `${targetPath}-wal`);
  if (existsSync(shm)) copyFileSync(shm, `${targetPath}-shm`);
}

export function importDatabase(dbPath: string, sourcePath: string): void {
  if (!existsSync(sourcePath)) throw new Error(`Backup file not found: ${sourcePath}`);

  validateSqliteFile(sourcePath);

  closeDatabase();

  try {
    copyFileSync(sourcePath, dbPath);

    const dbWal = `${dbPath}-wal`;
    const dbShm = `${dbPath}-shm`;

    if (existsSync(dbWal)) closeSync(openSync(dbWal, 'r'));
    if (existsSync(dbShm)) closeSync(openSync(dbShm, 'r'));

    if (existsSync(dbWal)) unlinkSync(dbWal);
    if (existsSync(dbShm)) unlinkSync(dbShm);
  } catch (err) {
    initializeDatabase(dbPath);
    throw err;
  }

  const fresh = initializeDatabase(dbPath);
  setSettingsDatabase(fresh);
}

export function exportEncrypted(dbPath: string, targetPath: string, password: string): void {
  if (!existsSync(dbPath)) throw new Error(`Database not found at ${dbPath}`);

  const plaintext = Buffer.from(readFileSync(dbPath));
  const salt = randomBytes(SALT_LENGTH);
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const out = Buffer.alloc(8 + 4 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH + encrypted.length);
  let offset = 0;
  out.write('FFBACKUP', offset, 8, 'ascii');
  offset += 8;
  out.writeUInt32BE(1, offset);
  offset += 4;
  salt.copy(out, offset);
  offset += SALT_LENGTH;
  iv.copy(out, offset);
  offset += IV_LENGTH;
  tag.copy(out, offset);
  offset += TAG_LENGTH;
  encrypted.copy(out, offset);

  const targetDir = dirname(targetPath);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetPath, out);
}

export function importEncrypted(dbPath: string, sourcePath: string, password: string): void {
  if (!existsSync(sourcePath)) throw new Error(`Encrypted backup not found: ${sourcePath}`);

  const data = Buffer.from(readFileSync(sourcePath));
  if (data.length < 8 + 4 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('File too short to be a valid encrypted backup.');
  }

  if (data.toString('ascii', 0, 8) !== 'FFBACKUP') {
    throw new Error('Invalid backup file format.');
  }

  const version = data.readUInt32BE(8);
  if (version !== 1) throw new Error(`Unsupported backup version: ${version}`);

  const salt = data.subarray(12, 12 + SALT_LENGTH);
  const iv = data.subarray(12 + SALT_LENGTH, 12 + SALT_LENGTH + IV_LENGTH);
  const tag = data.subarray(12 + SALT_LENGTH + IV_LENGTH, 12 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(12 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error('Incorrect password or corrupted backup file.');
  }

  if (plaintext.length < DB_MAGIC.length || !plaintext.subarray(0, DB_MAGIC.length).equals(DB_MAGIC)) {
    throw new Error('Decrypted data is not a valid SQLite database.');
  }

  closeDatabase();

  try {
    writeFileSync(dbPath, plaintext);

    const wal = `${dbPath}-wal`;
    const shm = `${dbPath}-shm`;
    if (existsSync(wal)) closeSync(openSync(wal, 'r'));
    if (existsSync(shm)) closeSync(openSync(shm, 'r'));
  } catch (err) {
    initializeDatabase(dbPath);
    throw err;
  }

  const fresh = initializeDatabase(dbPath);
  setSettingsDatabase(fresh);
}

function validateSqliteFile(path: string): void {
  const fd = openSync(path, 'r');
  const header = Buffer.alloc(DB_MAGIC.length);
  try {
    readSync(fd, header, 0, DB_MAGIC.length, 0);
  } finally {
    closeSync(fd);
  }

  if (!header.equals(DB_MAGIC)) {
    throw new Error(`Not a valid SQLite database: ${path}`);
  }
}

export function getLastBackupTime(): string | null {
  return getSetting<string>('core.backup.lastBackupTime') ?? null;
}

export function setLastBackupTime(iso: string): void {
  setSetting('core.backup.lastBackupTime', iso);
}
