import fs from 'node:fs';

// node --env-file=.env scripts/review-exotic.mjs [normalized-sample.json] [checklist-limit]
// Probe observation-level status without changing the source export or guessing regional rules.
const dataset = JSON.parse(fs.readFileSync(process.argv[2] || 'local/data.local.json', 'utf8'));
const headers = { 'X-eBirdApiToken': process.env.EBIRD_API_TOKEN };
const limit = Number(process.argv[3] || 8);
const ids = [
  ...new Set(
    [...dataset.records.filter((record) => record.category === 'domestic'), ...dataset.records].map(
      (record) => record.checklist,
    ),
  ),
].slice(0, limit);
const directory = 'output/review/checklist-status';
fs.mkdirSync(directory, { recursive: true });
const report = [];
for (const id of ids) {
  const path = `${directory}/${id}.json`;
  let checklist;
  if (fs.existsSync(path)) checklist = JSON.parse(fs.readFileSync(path, 'utf8'));
  else {
    const response = await fetch(`https://api.ebird.org/v2/product/checklist/view/${id}`, { headers });
    if (!response.ok) {
      report.push({ checklist: id, httpStatus: response.status });
      continue;
    }
    const data = await response.json();
    checklist = {
      checklist: id,
      fetchedAt: new Date().toISOString(),
      lastEdited: data.lastEditedDt,
      observations: data.obs.map((obs) => ({
        speciesCode: obs.speciesCode,
        obsId: obs.obsId,
        exotic: obs.exoticCategory ?? '',
        userDoNotCount: obs.userDoNotCount,
      })),
    };
    fs.writeFileSync(path, JSON.stringify(checklist, null, 2));
  }
  const rows = dataset.records.filter((record) => record.checklist === id);
  const statuses = {},
    missing = new Set(),
    matched = new Set();
  for (const row of rows) {
    // Match the original taxon, before roll-up: domestic and wild types can have different statuses.
    const observations = checklist.observations.filter((obs) => obs.speciesCode === row.code);
    if (observations.length !== 1) {
      missing.add(row.code);
      continue;
    }
    matched.add(row.code);
    const status = observations[0].exotic || 'native';
    statuses[status] = (statuses[status] || 0) + 1;
  }
  report.push({ checklist: id, matchedTaxa: matched.size, unmatchedTaxa: [...missing], statuses });
}
fs.writeFileSync('output/review/exotic-api-review.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      checklists: report.length,
      matchedTaxa: report.reduce((sum, item) => sum + (item.matchedTaxa || 0), 0),
      results: report.map(({ checklist, ...counts }) => counts),
    },
    null,
    2,
  ),
);
