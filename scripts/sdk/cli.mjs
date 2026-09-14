#!/usr/bin/env node
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATES = join(__dirname, 'templates');

function slug(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error(`invalid extension id "${id}" — use lowercase letters, digits, hyphens`);
    process.exit(1);
  }
  return id;
}

function render(template, vars) {
  let out = readFileSync(join(TEMPLATES, template), 'utf8');
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

async function cmdInit(idRaw, targetDir) {
  const id = slug(idRaw);
  const display = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const vars = { ID: id, ID_SNAKE: id.replace(/-/g, '_'), DISPLAY_NAME: display, ICON: display[0], DESCRIPTION: `${display} extension`, APP_SDK: join(resolve('.'), 'scripts', 'sdk', 'cli.mjs').replace(/\\/g, '/') };
  const out = join(targetDir ? resolve(targetDir) : process.cwd(), id);
  mkdirSync(join(out, 'src', 'ui'), { recursive: true });
  mkdirSync(join(out, 'src', 'mock'), { recursive: true });
  mkdirSync(join(out, 'src', 'vendor'), { recursive: true });
  mkdirSync(join(out, 'src', 'shared'), { recursive: true });
  mkdirSync(join(out, 'src', 'styles'), { recursive: true });
  writeFileSync(join(out, 'package.json'), render('package.json.template', vars));
  writeFileSync(join(out, 'tsconfig.json'), render('tsconfig.json.template', vars));
  writeFileSync(join(out, 'vite.config.ts'), render('vite.config.ts.template', vars));
  writeFileSync(join(out, 'index.html'), render('index.html.template', vars));
  writeFileSync(join(out, 'README.md'), render('README.md.template', vars));
  writeFileSync(join(out, 'src', 'main.ts'), render('src/main.ts.template', vars));
  writeFileSync(join(out, 'src', 'finance.d.ts'), readFileSync(join(__dirname, 'types', 'finance.d.ts'), 'utf8'));
  writeFileSync(join(out, 'src', 'vendor', 'logger.ts'), render('src/vendor/logger.ts.template', vars));
  writeFileSync(join(out, 'src', 'shared', 'base-logger.ts'), render('src/shared/base-logger.ts.template', vars));
  writeFileSync(join(out, 'src', 'styles', 'ext-tokens.css'), readFileSync(join(__dirname, '..', '..', 'extensions', 'salary-history', 'src', 'styles', 'ext-tokens.css'), 'utf8'));
  writeFileSync(join(out, 'src', 'styles', 'ext-layout.css'), readFileSync(join(__dirname, '..', '..', 'extensions', 'salary-history', 'src', 'styles', 'ext-layout.css'), 'utf8'));
  writeFileSync(join(out, 'src', 'styles', 'shared-styles.ts'), render('src/styles/shared-styles.ts.template', vars));
  writeFileSync(join(out, 'src', 'mock', 'finance-mock.ts'), render('src/mock/finance-mock.ts.template', vars));
  writeFileSync(join(out, 'src', 'ui', 'index.ts'), render('src/ui/index.ts.template', vars));
  writeFileSync(join(out, 'src', 'ui', `${id}-view.ts`), render('src/ui/sample-view.ts.template', vars));
  writeFileSync(join(out, 'src', 'vite-env.d.ts'), render('vite-env.d.ts.template', vars));
  writeFileSync(join(out, 'AGENTS.md'), render('AGENTS.md.template', vars));
  writeFileSync(join(out, '.gitignore'), render('.gitignore.template', vars));
  mkdirSync(join(out, 'assets'), { recursive: true });
  writeFileSync(join(out, 'assets', 'icon.svg'), readFileSync(join(TEMPLATES, 'assets', 'icon.svg'), 'utf8'));
  // git init (best-effort, no fail if git missing)
  try {
    const { execSync } = await import('node:child_process');
    execSync('git init', { cwd: out, stdio: 'ignore' });
    execSync('git add .', { cwd: out, stdio: 'ignore' });
    execSync('git commit -m "init: scaffold {{ID}} 0.1.0"'.replace('{{ID}}', id), { cwd: out, stdio: 'ignore' });
  } catch {}
  console.log(`Created extension project at ${out}`);
  console.log('Preview standalone:');
  console.log(`  cd ${out} && npm install && npm run dev   # http://localhost:5173`);
  console.log('Then build for the real app:');
  console.log(`  node ${vars.APP_SDK} build ${out}`);
}

async function cmdBuild(projectDirRaw) {
  const { build: viteBuild } = await import('vite');
  const { mkdirSync: mk, readFileSync: rf, cpSync, existsSync: ex, cpSync: cp } = await import('node:fs');
  const { join: j, resolve: rs, dirname: dn } = await import('node:path');
  const projectDir = rs(projectDirRaw ?? '.');
  const pkg = JSON.parse(rf(j(projectDir, 'package.json'), 'utf8'));
  const manifest = pkg.financeExtension;
  if (!manifest?.id) {
    console.error(`no financeExtension.id in ${projectDir}/package.json`);
    process.exit(1);
  }
  const id = manifest.id;
  const outDir = j(projectDir, 'build', 'extension');
  mk(outDir, { recursive: true });
  const EXTERNALS = ['finance', 'electron', 'node:path', 'node:url', 'node:fs', 'node:module', 'better-sqlite3'];
  const hostLit = j(__dirname, '..', '..', 'node_modules', 'lit');
  await viteBuild({
    root: projectDir,
    logLevel: 'warn',
    configFile: false,
    resolve: { alias: { lit: hostLit } },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
      lib: { entry: j(projectDir, manifest.main ?? 'src/main.ts'), formats: ['es'], fileName: () => `${id}.js` },
      rollupOptions: { external: EXTERNALS }
    }
  });
  cpSync(j(projectDir, 'package.json'), j(outDir, 'package.json'));
  // Copy declared Activity Bar icon assets (e.g. assets/icon.svg) so the
  // install artifact serves them via finance-shell://extensions/<id>/<asset>.
  // Only validated relative .svg/.png paths are copied; legacy glyphs skip.
  for (const view of manifest?.contributions?.views ?? []) {
    const icon = view?.icon;
    if (typeof icon !== 'string') continue;
    if (!/^(?!.*\.\.)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*\.(?:svg|png)$/.test(icon)) continue;
    try {
      const src = j(projectDir, icon);
      if (!ex(src)) {
        console.warn(`[build] missing icon asset for "${id}": ${src}`);
        continue;
      }
      const dest = j(outDir, icon);
      mk(dn(dest), { recursive: true });
      cp(src, dest);
      console.log(`[build] copied icon asset ${icon}`);
    } catch (err) {
      console.warn(`[build] could not copy icon asset "${icon}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`Built ${id} -> ${outDir}`);
  console.log('Install it in the app: Extensions > Install > pick this folder (or zip it first).');
}

function cmdRefresh(projectDirRaw) {
  const projectDir = resolve(projectDirRaw ?? '.');
  const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
  const manifest = pkg.financeExtension ?? {};
  const typesPath = join(projectDir, 'src', 'finance.d.ts');
  if (!existsSync(typesPath)) {
    console.error(`no src/finance.d.ts found in ${projectDir} — is this a scaffolded project?`);
    process.exit(1);
  }
  writeFileSync(typesPath, readFileSync(join(__dirname, 'types', 'finance.d.ts'), 'utf8'));
  mkdirSync(join(projectDir, 'src', 'shared'), { recursive: true });
  writeFileSync(join(projectDir, 'src', 'vendor', 'logger.ts'), readFileSync(join(TEMPLATES, 'src/vendor/logger.ts.template'), 'utf8'));
  writeFileSync(join(projectDir, 'src', 'shared', 'base-logger.ts'), readFileSync(join(TEMPLATES, 'src/shared/base-logger.ts.template'), 'utf8'));
  writeFileSync(join(projectDir, 'src', 'styles', 'ext-tokens.css'), readFileSync(join(__dirname, '..', '..', 'extensions', 'salary-history', 'src', 'styles', 'ext-tokens.css'), 'utf8'));
  writeFileSync(join(projectDir, 'src', 'styles', 'ext-layout.css'), readFileSync(join(__dirname, '..', '..', 'extensions', 'salary-history', 'src', 'styles', 'ext-layout.css'), 'utf8'));
  const mainTsPath = join(projectDir, manifest.main ?? 'src/main.ts');
  if (!readFileSync(mainTsPath, 'utf8').includes("import './styles/ext-tokens.css'")) {
    const mainTs = readFileSync(mainTsPath, 'utf8');
    writeFileSync(mainTsPath, mainTs.replace("import { ExtensionLogger } from 'finance-logger';\n", "import { ExtensionLogger } from 'finance-logger';\nimport './styles/ext-tokens.css';\n"));
    console.log(`[refresh] injected tokens.css import into ${mainTsPath}`);
  }
  console.log(`Refreshed ${typesPath} + vendor/logger.ts + shared/base-logger.ts + styles/*`);
  console.log('Fix any new type errors the editor shows, rebuild, and reinstall.');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'init') await cmdInit(rest[0], rest[1]);
else if (cmd === 'build') await cmdBuild(rest[0]);
else if (cmd === 'refresh') cmdRefresh(rest[0]);
else {
  console.log('usage: node scripts/sdk/cli.mjs init <extension-id> [dir] | build <project-dir> | refresh <project-dir>');
  process.exit(1);
}
