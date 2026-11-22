import { copyFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(root, 'node_modules', 'stockfish');
const engineBase = 'stockfish-19-lite-single';
const candidates = [
  join(packageRoot, 'bin'),
  join(packageRoot, 'src'),
  packageRoot
];
const destination = join(root, 'public', 'engines');
const licenseDestination = join(root, 'public', 'licenses');
await mkdir(destination, { recursive: true });
await mkdir(licenseDestination, { recursive: true });

async function firstExisting(file) {
  for (const folder of candidates) {
    const candidate = join(folder, file);
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch { /* try the next package layout */ }
  }
  throw new Error(`Stockfish asset not found: ${file}. Check that stockfish@19.0.1 was installed correctly.`);
}

for (const extension of ['js', 'wasm']) {
  const file = `${engineBase}.${extension}`;
  await copyFile(await firstExisting(file), join(destination, file));
}

for (const notice of ['Copying.txt', 'AUTHORS']) {
  try {
    await copyFile(join(packageRoot, notice), join(licenseDestination, `STOCKFISH-${notice}`));
  } catch { /* attribution and the upstream source link remain in the project notices */ }
}

console.log('Stockfish 19 lite single-threaded assets copied to public/engines/.');
