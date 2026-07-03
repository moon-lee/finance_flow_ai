import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.gitnexus/**',
      // `extensions/` contains per-extension packages, each with their own
      // workspace; not in scope for the core ESLint config (extensions like
      // `salary-history/src/main.ts` raise "not found by the project service"
      // because they are excluded from the root tsconfig). Lint extensions
      // from within their own workspaces.
      'extensions/**',
      // `scripts/` is build tooling that runs under Node ESM, not under
      // Electron's bundled renderer/main/host processes. Global `console`
      // is provided by Node and should not trip `no-undef`.
      'scripts/**'
    ]
  }
);
