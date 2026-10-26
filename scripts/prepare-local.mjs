import fs from 'node:fs';

// Optional full-export preview for development; the original file is untouched.
fs.mkdirSync('local', { recursive: true });
fs.copyFileSync(process.argv[2], 'local/MyEBirdData.local.csv');
fs.writeFileSync('local/preview-data.local.json', JSON.stringify({ csv: './MyEBirdData.local.csv' }));
console.log('Local export prepared. Run npm run dev; the export loads when no browser snapshot exists.');
