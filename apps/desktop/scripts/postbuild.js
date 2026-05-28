import { cpSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DISABLED: With asar: false, dist-renderer should stay at the root level
// It will be included separately in electron-builder.json files list
// Old behavior was copying dist-renderer into dist/dist-renderer which is wrong

console.log('postbuild: skipped (dist-renderer stays at root level)');



