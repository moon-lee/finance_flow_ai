# Local Product Deployment

## Purpose

Use the packaged **Finance Flow AI** application for real payslip records. Use the `D:\finance_flow_ai` workspace only for development and testing.

ADR-0007 guarantees that these two modes do not share a database by default.

## Build a local product folder

From the development workspace, run:

```powershell
npm run package:local
```

This produces a self-contained Windows application folder at:

```text
release\win-unpacked\
```

The application to launch is:

```text
release\win-unpacked\Finance Flow AI.exe
```

Copy the complete `win-unpacked` folder to a stable location such as `D:\Finance Flow Product`. Do not copy only the `.exe`; its neighbouring `resources` files are required.

## Data locations

| Mode | Database location | Use |
|---|---|---|
| Packaged product | `<product-folder>\data\finance.db` | Real payslips |
| Development (`npm run dev` or `npm start`) | `%APPDATA%\Finance Flow AI Dev\finance.db` | Test data only |

The product creates its `data` directory and empty database on first launch.

## Move existing records safely

1. Close every Finance Flow AI window.
2. Make a backup copy of the existing database from `%APPDATA%\Finance Flow AI\finance.db`. If `finance.db-wal` and `finance.db-shm` exist, copy those too while the app is closed.
3. Start the packaged product once, then close it. This creates `<product-folder>\data`.
4. Copy the backed-up `finance.db` into `<product-folder>\data\finance.db`, replacing the empty database created in step 3. Copy the `-wal` and `-shm` sidecar files too if they were included in the backup.
5. Start `<product-folder>\Finance Flow AI.exe` and confirm that your existing payslips appear.

Do not delete the original backup until the product application has opened and its records have been checked.

## Updating the deployed app

Build a new package from the development workspace, but preserve the deployed product's `data` directory. Never replace or delete `<product-folder>\data` during an update. Make a database backup first.

## Scope

This is a local directory deployment, not an installer. It does not yet provide automatic updates, database encryption, or in-app backup/restore.
