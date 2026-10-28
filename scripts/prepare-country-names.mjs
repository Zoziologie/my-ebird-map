import fs from 'node:fs';

// eBird has custom country codes: AC and CS must not use generic ISO/Intl labels.
const response = await fetch('https://api.ebird.org/v2/ref/region/list/country/world', {
  headers: { 'X-eBirdApiToken': process.env.EBIRD_API_TOKEN },
});
if (!response.ok) throw new Error(`eBird country inventory failed: ${response.status}`);
const countries = await response.json();
fs.writeFileSync(
  'src/assets/country-names.json',
  JSON.stringify(
    Object.fromEntries(
      countries.sort((a, b) => a.code.localeCompare(b.code, 'en')).map(({ code, name }) => [code, name]),
    ),
    null,
    2,
  ) + '\n',
);
