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

The project includes a deployment script that automates this step:

```powershell
npm run deploy:local
```

By default this copies `release\win-unpacked\` to `D:\Finance Flow Product`. You can override the target:

```powershell
npm run deploy:local -- --target="E:\MyApp"
```

The script preserves any existing `data` directory so your database is not overwritten during updates. It also preserves the product-folder `AGENTS.md` (your finance report agent prompt) — both are moved aside with `renameSync` before the target is replaced, then moved back after the copy.

## What gets packaged

The packaged app contains extension bundles in two places:

| Location | Contents | Purpose |
|---|---|---|
| `resources\app.asar` | All JS bundles (`dashboard.js`, `salary-history.js`, chunks) | Compressed archive inside the main app package |
| `resources\dist\extensions\` | All JS bundles + CSS files (`dashboard.css`, `salary-history.css`) | Loose files served at runtime by the `finance-shell://` protocol handler |

Both JS and CSS files are served by the custom `finance-shell://` protocol handler registered in `src/main/services/panel-protocol.ts`. The handler reads loose files from `resources\dist\extensions\` in production, or from `dist\extensions\` during development.

## CSS and token definitions

Each extension panel loads its stylesheet before its JavaScript bundle:

1. `panel-bootstrap.ts` injects `<link rel="stylesheet" href="finance-shell://extensions/{extensionId}.css">`
2. The protocol handler serves the CSS file from `resources\dist\extensions\`
3. The CSS file contains `:root` custom property definitions (design tokens) that cascade into the panel's Shadow DOM
4. The JS bundle then loads and components render with the tokens already defined

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

Build a new package from the development workspace, then run the deployment script again:

```powershell
npm run package:local
npm run deploy:local
```

The script preserves the deployed product's `data` directory automatically. Never replace or delete `<product-folder>\data` during an update. Make a database backup first.

## What changed in the extension serving setup

The extension loading mechanism was updated to support CSS files alongside JS bundles.

**Previous behavior:** The app only served JS bundles via the `finance-shell://` protocol. CSS was not loaded at all, so extension token definitions (`--ff-font-sm`, `--ff-font-base`, etc.) were undefined and all font sizes fell back to 16px.

**Current behavior:** Each extension panel now loads its stylesheet before its JavaScript:

1. `panel-bootstrap.ts` injects `<link rel="stylesheet" href="finance-shell://extensions/{extensionId}.css">`
2. `panel-protocol.ts` serves the CSS file from `resources\dist\extensions\` in production, or `dist\extensions\` during development
3. The CSS file defines `:root` custom properties that cascade into the panel's Shadow DOM
4. The JS bundle loads after the CSS, so components render with tokens already defined

**`panel-protocol.ts` changes:**

- **Path resolution:** Added `DEV_EXTENSIONS_DIR` and `PROD_EXTENSIONS_DIR` so the protocol handler finds files correctly in both development and production environments.
- **CSS fallback removed:** Each extension now has its own CSS file (`dashboard.css`, `salary-history.css`), so the hardcoded fallback to a shared token file is no longer needed.

## Scope

This is a local directory deployment, not an installer. It does not yet provide automatic updates, database encryption, or in-app backup/restore.
