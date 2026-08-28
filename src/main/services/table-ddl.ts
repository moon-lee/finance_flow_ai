import type Database from 'better-sqlite3';
import type { ColumnManifest, TableManifest } from './shared-data-tables';

const SQLITE_TYPE: Record<ColumnManifest['type'], string> = {
  integer: 'INTEGER',
  real: 'REAL',
  text: 'TEXT',
  date: 'TEXT',
  datetime: 'TEXT',
  boolean: 'INTEGER'
};

export function columnSql(column: ColumnManifest): string {
  const parts = [column.name, SQLITE_TYPE[column.type]];
  if (column.nullable === false) parts.push('NOT NULL');
  if (column.default !== undefined && column.default !== null) {
    const lit = typeof column.default === 'string' ? `'${column.default}'` : String(column.default);
    parts.push(`DEFAULT ${lit}`);
  }
  return parts.join(' ');
}

export function buildCreateTableSql(table: TableManifest): string {
  if (!/^[a-z0-9_]+$/.test(table.name) || !table.name.includes('_')) throw new Error(`invalid table name: "${table.name}"`);
  const columns = [
    'id INTEGER PRIMARY KEY AUTOINCREMENT',
    ...table.columns.map(columnSql),
    "created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))"
  ];
  return `CREATE TABLE IF NOT EXISTS ${table.name} (${columns.join(', ')});`;
}

export function createExtensionTables(db: Database.Database, tables: readonly TableManifest[]): void {
  for (const table of tables) {
    db.exec(buildCreateTableSql(table));
  }
}
