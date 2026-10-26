// Compile once, then resolve the original taxon before species roll-up.
export function exoticRulesIndex(rules, counties = {}) {
  const countyExceptions = new Map(),
    countryExceptions = new Map();
  for (const [code, regions] of Object.entries(rules)) {
    const states = new Set(),
      countries = new Set();
    for (const [region, status] of Object.entries(regions)) {
      if (region.includes('-')) countries.add(region.split('-')[0]);
      if (region.split('-').length !== 3) continue;
      const state = region.slice(0, region.lastIndexOf('-'));
      const inherited = regions[state] ?? regions[state.split('-')[0]] ?? regions.world ?? '';
      if (status !== inherited) states.add(state);
    }
    countyExceptions.set(code, states);
    countryExceptions.set(code, countries);
  }
  return { rules, counties, countyExceptions, countryExceptions };
}

export function regionalExoticStatus(index, code, region) {
  const regions = index.rules[code];
  const parts = region.split('-');
  if (parts.length === 2 && index.countyExceptions.get(code)?.has(region))
    return { status: null, region: null, needsCounty: true };
  // Missing state also leaves any state/county exceptions unresolved.
  if (parts.length === 1 && index.countryExceptions.get(code)?.has(region))
    return { status: null, region: null, needsCounty: true };
  while (parts.length) {
    const scope = parts.join('-');
    if (regions?.[scope] !== undefined) return { status: regions[scope], region: scope, needsCounty: false };
    parts.pop();
  }
  return { status: regions?.world ?? '', region: regions?.world === undefined ? null : 'world', needsCounty: false };
}

// No exotic code means native; missing county information remains unresolved.
export function exoticStatusSummary(counts) {
  const exotic = ['N', 'P', 'X'].find((code) => counts[code]);
  const code = counts.native && exotic ? 'mixed' : counts.native ? '' : exotic || 'unresolved';
  const label = {
    mixed: 'Native and exotic observations',
    '': 'Native',
    N: 'Naturalized',
    P: 'Provisional',
    X: 'Escapee',
    unresolved: 'Status unavailable',
  }[code];
  const categories = Object.entries({
    native: 'Native',
    N: 'Naturalized',
    P: 'Provisional',
    X: 'Escapee',
  })
    .filter(([category]) => counts[category] > 0)
    .map(([category, name]) => ({ code: category, label: name, count: counts[category] }));
  return { code, label, categories };
}
