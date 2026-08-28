import type * as Canonical from '../../../../src/types/finance';
import type * as Sdk from '../../../../scripts/sdk/types/finance';

// Every SDK type must be assignable to its canonical counterpart.
const _financeApi: Canonical.FinanceApi = null as unknown as Sdk.FinanceApi;
const _tableManifest: Canonical.TableManifest = null as unknown as Sdk.TableManifest;
const _columnManifest: Canonical.ColumnManifest = null as unknown as Sdk.ColumnManifest;
const _columnType: Canonical.ColumnType = null as unknown as Sdk.ColumnType;
