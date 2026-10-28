const settings = {
  mapview: 'grouping',
  background: 'mapStyle',
  projection: 'projection',
  metric: 'metric',
  theme: 'theme',
  yearFrom: 'yearFrom',
  yearTo: 'yearTo',
  monthFrom: 'monthFrom',
  monthTo: 'monthTo',
};

export function readUrlSettings(url, saved = {}) {
  const params = new URL(url).searchParams;
  const state = { ...saved, camera: { ...saved.camera } };
  for (const [param, key] of Object.entries(settings)) if (params.has(param)) state[key] = params.get(param);
  if (params.has('mapview')) state.clustering = state.grouping === 'polygon' ? 'off' : state.grouping;
  for (const key of ['followMap', 'additional']) if (params.has(key)) state[key] = params.get(key) === '1';
  if (params.has('species')) state.species = params.get('species').split(',').filter(Boolean);
  if (params.has('polygon')) state.polygon = params.get('polygon') ? JSON.parse(params.get('polygon')) : null;
  if (params.has('lat') || params.has('lon'))
    state.camera.center = [
      Number(params.get('lon') ?? saved.camera?.center?.[0] ?? 12),
      Number(params.get('lat') ?? saved.camera?.center?.[1] ?? 22),
    ];
  for (const key of ['zoom', 'bearing', 'pitch']) if (params.has(key)) state.camera[key] = Number(params.get(key));
  return state;
}

export function writeUrlSettings(url, state) {
  const result = new URL(url);
  const params = result.searchParams;
  for (const [param, key] of Object.entries(settings)) params.set(param, state[key] ?? '');
  for (const key of ['followMap', 'additional']) params.set(key, state[key] ? '1' : '0');
  params.set('species', state.species.join(','));
  params.set('polygon', state.polygon ? JSON.stringify(state.polygon) : '');
  if (state.camera?.center) {
    params.set('lon', Number(state.camera.center[0].toFixed(5)));
    params.set('lat', Number(state.camera.center[1].toFixed(5)));
  }
  for (const key of ['zoom', 'bearing', 'pitch'])
    if (state.camera?.[key] !== undefined) params.set(key, Number(state.camera[key].toFixed(2)));
  return result.href;
}
