# ADR-0007: Local Product Deployment Profile

**Status:** Accepted  
**Date:** 2026-08-15  
**Context:** Protecting real Salary History data while allowing continued development.

## Context

The application currently assigns the same Electron application name to unpackaged development launches and packaged launches. Both modes therefore resolve `userData` to the same Windows folder and open the same `finance.db` file. A migration or experimental write from the development project can consequently affect the user's real payslip data.

The project needs a local Windows deployment that can be launched by double-clicking an executable, with its data visibly separated from the source workspace. The deployment must include the bundled extensions and retain the existing secure extension-loading model.

## Decision

Use two runtime profiles:

- **Product:** a packaged Windows directory build. Its executable is `Finance Flow AI.exe`, and its Electron `userData` directory is `<directory-containing-the-executable>\\data`. The SQLite file is therefore `<product-directory>\\data\\finance.db`.
- **Development:** an unpackaged launch from the source workspace. It is named `Finance Flow AI Dev`, so Electron uses a separate default Windows data directory, `%APPDATA%\\Finance Flow AI Dev`.

The product build is produced with `electron-builder` using the Windows `dir` target. This makes a self-contained folder that the user can place at a chosen local location without requiring an installer. Extension manifests are copied as application resources; the already-built extension bundles remain in the packaged `dist` directory.

## Rationale

Keeping production data next to the deployed executable makes the boundary visible and portable for a single-user local deployment. Giving development a distinct application name prevents accidental database sharing without requiring developers to set environment variables or remember a special command.

The `dir` packaging target is intentionally chosen over an installer for this milestone: it directly satisfies local deployment and makes the generated executable easy to inspect and move. Installer creation, signing, automatic updates, encryption, and in-app backup/restore remain separate future work.

## Consequences

### Positive

- Development code cannot open or modify the product database by default.
- Real data is in a predictable product-local `data` folder.
- The user launches the stable app from an `.exe`, without `npm`, source code, or developer scripts.
- Packaged extension manifests are available from Electron's resource directory, while extension bundles still use the existing custom protocol and CSP.

### Costs and safeguards

- Replacing the whole deployed folder can overwrite its `data` directory. Product updates must preserve `data\\finance.db`; a backup is required before replacement.
- This milestone does not create automatic backups or an installer. It creates a local directory package only.
- Existing real data is not copied automatically. The user must choose the backed-up database to copy into the new product `data` folder after the package has been verified.

## Alternatives considered

- **Keep a second source-folder copy.** Rejected: source copies still shared the default Electron `userData` folder, so they did not protect real data.
- **Use an environment variable to select a database for every launch.** Rejected: easy to omit or misconfigure, especially when double-clicking an executable.
- **Use an installed application with data in `%APPDATA%`.** Deferred: appropriate for a future installer/update channel, but less visible for this local, user-managed deployment milestone.

## Revisit triggers

- Add an installer, automatic updates, code signing, or multiple user profiles.
- Add encrypted or scheduled backups and restore UI.
- Support a user-selected data directory in Settings.

## Related

- Vision: `docs/project_vision.md:88-89,171-175,574-584`.
- Runtime entry point: `src/main/main.ts`.
- Extension assets: `src/main/services/panel-protocol.ts`, `src/main/services/extension-loader.ts`.
