// Install only the reviewed Forge products in docs/forge-workshop-lock.json.
// Source archives stay outside Git. Forge scripts are parsed by the existing importer, never run here.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { importForge } from '../server/plugins/forgeImport.js';
import { readVanillaAssets } from '../server/plugins/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const argv = process.argv.slice(2);
const allowed = new Set(['--source', '--download', '--install', '--dry-run']);
let sourceRoot = null;
for (let i = 0; i < argv.length; i++) {
  if (!allowed.has(argv[i])) throw new Error(`Unknown option: ${argv[i]}`);
  if (argv[i] === '--source') {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--source requires the downloaded Forge repository path');
    sourceRoot = path.resolve(argv[++i]);
  }
}
const write = argv.includes('--install') && !argv.includes('--dry-run');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'docs/forge-workshop-lock.json'), 'utf8'));
const dataDir = path.join(root, 'data');
const pluginsDir = path.join(root, 'plugins');
const vanilla = readVanillaAssets(dataDir);
const installedFile = path.join(pluginsDir, '_forge-installation.json');
const installed = fs.existsSync(installedFile) ? JSON.parse(fs.readFileSync(installedFile, 'utf8')) : { commit: lock.commit, plugins: {} };
const selected = lock.sources.filter(row => row.decision === 'install');

for (const item of selected) {
  const existing = item.products.filter(product => fs.existsSync(path.join(pluginsDir, product.id)));
  if (existing.length) {
    if (existing.length !== item.products.length) throw new Error(`${item.id}: only some products exist; inspect before continuing`);
    for (const product of existing) {
      const dir = path.join(pluginsDir, product.id);
      const pin = installed.plugins[product.id];
      const file = path.join(dir, 'plugin.lock.json');
      if (!pin || pin.sourceSha256 !== item.sha256 || pin.lockSha256 !== sha256(fs.readFileSync(file))) {
        throw new Error(`${product.id}: existing folder is not this installation's locked product; refusing to replace it`);
      }
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
      if (manifest.id !== product.id || manifest.version !== item.version) throw new Error(`${product.id}: installed identity differs`);
      const productLock = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [relative, expectedFile] of Object.entries(productLock.files || {})) {
        const bytes = fs.readFileSync(path.join(dir, relative));
        if (bytes.length !== expectedFile.bytes || sha256(bytes) !== expectedFile.sha256) {
          throw new Error(`${product.id}: installed file ${relative} differs from its lock`);
        }
      }
    }
    console.log(`${item.id}: already installed (source and lock pins match)`);
    continue;
  }
  const source = sourceRoot ? path.join(sourceRoot, item.path) : path.join(root, '.cache/forge', lock.commit, item.path);
  if (!fs.existsSync(source)) {
    if (!argv.includes('--download')) throw new Error(`${item.id}: missing ${source}; use --source <Forge repository> or --download`);
    const response = await fetch(`https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/${item.path}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${item.id}: download HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== item.sizeBytes || sha256(bytes) !== item.sha256) throw new Error(`${item.id}: downloaded source size/SHA256 mismatch`);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, bytes, { flag: 'wx' });
  }
  const bytes = fs.readFileSync(source);
  if (bytes.length !== item.sizeBytes || sha256(bytes) !== item.sha256) throw new Error(`${item.id}: source size/SHA256 mismatch`);
  const options = { root, pluginsDir, dataDir, vanilla, scripts: true, officialTables: { offline: true } };
  const preview = await importForge(source, { ...options, dryRun: true });
  if (!preview.ok || preview.report.partial || preview.report.needsManualAdaptation || preview.report.cosmeticBare) {
    throw new Error(`${item.id}: conversion is no longer complete: ${preview.report.check}`);
  }
  const ids = preview.report.products.map(product => product.id).sort();
  const expected = item.products.map(product => product.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error(`${item.id}: conversion product list changed`);
  if (!write) {
    console.log(`${item.id}: checked ${ids.join(', ')} (dry-run)`);
    continue;
  }
  const result = await importForge(source, { ...options, dryRun: false });
  if (!result.ok || !result.wrote) throw new Error(`${item.id}: import failed: ${result.report.check}`);
  for (const id of ids) {
    installed.plugins[id] = { sourceId: item.id, sourceVersion: item.version, sourceSha256: item.sha256,
      lockSha256: sha256(fs.readFileSync(path.join(pluginsDir, id, 'plugin.lock.json'))) };
  }
  fs.writeFileSync(installedFile, JSON.stringify(installed, null, 2) + '\n');
  console.log(`${item.id}: installed ${ids.join(', ')}`);
}
console.log(`${selected.length} reviewed Forge sources ${write ? 'installed' : 'checked'}; room and personal selections follow the existing plugin controls.`);
