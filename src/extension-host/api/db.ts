/**
 * Phase 3 db stub. Returns shape-correct empty queryables. Phase 4 will
 * wire these to the Main process via RPC and to better-sqlite3 via the
 * Core's namespace-enforcing DAO.
 */

interface QueryChain {
  find(filter?: unknown): Promise<unknown[]>;
  findOne(filter?: unknown): Promise<unknown | null>;
  insert(record: unknown): Promise<{ id: number | string }>;
  update(filter: unknown, patch: unknown): Promise<{ updated: number }>;
  delete(filter: unknown): Promise<{ deleted: number }>;
}

function stubChain(): QueryChain {
  const chain: QueryChain = {
    async find() { return []; },
    async findOne() { return null; },
    async insert() { return { id: 0 }; },
    async update() { return { updated: 0 }; },
    async delete() { return { deleted: 0 }; }
  };
  return chain;
}

export function table(name: string): QueryChain {
  // Phase 3: log the call so the extension author can see the wiring fired.
  console.log(`[finance.db] table("${name}") called (Phase 3 stub — no data returned)`);
  return stubChain();
}
