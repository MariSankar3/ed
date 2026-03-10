const fs = require('fs');
const path = require('path');

const dir = '.';
const files = fs.readdirSync(dir).filter(f => /^[a-z]{2}\.json$/.test(f));

const getKeys = (obj, prefix = '') => Object.keys(obj).reduce((res, el) => {
  if (Array.isArray(obj[el])) return [...res, prefix + el];
  if (typeof obj[el] === 'object' && obj[el] !== null) return [...res, ...getKeys(obj[el], prefix + el + '.')];
  return [...res, prefix + el];
}, []);

const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const enKeys = new Set(getKeys(en));

console.log('Total keys in en.json: ' + enKeys.size);

const results = files.map(f => {
  if (f === 'en.json') return null;
  const lang = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const langKeys = new Set(getKeys(lang));
  
  const missing = [...enKeys].filter(k => !langKeys.has(k)).length;
  const extra = [...langKeys].filter(k => !enKeys.has(k)).length;
  
  return `${f.padEnd(8)} | Missing: ${String(missing).padStart(3)} | Extra: ${String(extra).padStart(3)}`;
}).filter(Boolean);

console.log('--- SYNC STATUS ---');
console.log(results.join('\n'));
console.log('-------------------');
console.log('Total Languages Found (' + files.length + '): ' + files.map(f => f.slice(0, 2)).join(', '));
