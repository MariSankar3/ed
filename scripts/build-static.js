/**
 * build-static.js
 *
 * Temporarily renames app/api → app/_api before `next build` so the API routes
 * (which use Node.js fs and are incompatible with `output: 'export'`) are excluded
 * from the static export. After the build completes, the folder is restored.
 *
 * Usage: node scripts/build-static.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'app', 'api');
const hiddenApiDir = path.join(root, 'app', '_api');

let renamed = false;

function restore() {
  if (renamed && fs.existsSync(hiddenApiDir)) {
    fs.renameSync(hiddenApiDir, apiDir);
    console.log('✅ Restored app/api folder');
  }
}

// Handle unexpected exits
process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(1); });
process.on('SIGTERM', () => { restore(); process.exit(1); });
process.on('uncaughtException', (err) => { console.error(err); restore(); process.exit(1); });

try {
  // 1. Hide the api folder from Next.js
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, hiddenApiDir);
    renamed = true;
    console.log('📁 Temporarily hidden app/api (excluded from static export)');
  }

  // 2. Run next build using the local binary (avoids PATH issues and npm hook recursion)
  const nextBin = path.join(root, 'node_modules', '.bin', 'next');
  execSync(`"${nextBin}" build`, { stdio: 'inherit', cwd: root, shell: true });

} finally {
  // 3. Always restore the api folder
  restore();
}
