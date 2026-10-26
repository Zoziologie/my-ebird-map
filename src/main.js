import 'bootstrap-icons/font/bootstrap-icons.css';
import { filterRecords, summarize, pointInPolygon, unwrapPolygon, polygonError, ebirdSummaryLinks } from './model.js';
import { loadSnapshot, saveSnapshotMetadata } from './storage.js';
import { exoticStatusSummary } from './exotic-rules.js';
import { driveClientId, prepareDrive, saveToDrive, loadFromDrive } from './drive.js';
import {
  groupMapRecords,
  indexMapLocations,
  clusteredMapFeatures,
  renderMapFeatures,
  countryMapFeatures,
} from './map-data.js';

const $ = (selector) => document.querySelector(selector);
const format = (value) => new Intl.NumberFormat('en').format(value);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const preferences = {
  theme: 'system',
  mapStyle: 'atlas',
  projection: 'mercator',
  clustering: 'off',
  ...JSON.parse(localStorage.getItem('myebirdmap:display') || '{}'),
};
let activeSource,
  locallySaved = false,
  dataBusy = false;
let dataset,
  records = [],
  filtered = [],
  mapRecords = [],
  map,
  tab = 'species',
  themeMode = preferences.theme,
  theme = themeMode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'atlas') : themeMode,
  mapStyle = preferences.mapStyle,
  projection = preferences.projection;
let metric = preferences.metric || 'species',
  clustering = preferences.clustering,
  mapPoints = [],
  clusterIndex;
let grouping = preferences.grouping || clustering,
  mapGroups = new Map(),
  renderedSource,
  renderedKey;
let countryBoundaries, countryBoundaryRequest;
let yearFrom = preferences.yearFrom || '',
  yearTo = preferences.yearTo || '',
  monthFrom = preferences.monthFrom || '',
  monthTo = preferences.monthTo || '';
const selectedCodes = new Set();
let selectionAnchor = '',
  areaRecords = [],
  speciesRecords = [],
  polygon = preferences.polygon || null,
  drawing = false,
  vertices = [];
let previewPolygon = null,
  polygonHistory = [],
  cornerMarkers = [],
  draggingCorner = false,
  liveCountTimer,
  liveDragCounts = true;
let speciesTooltipTarget;
let resultsByCode = new Map(),
  toastTimer,
  locationPopup;
const tableSort = { species: { key: 'observations', direction: -1 }, locations: { key: 'checklists', direction: -1 } };
const searchText = { species: '', locations: '' };
let visibleRows = 160;

function savePreferences() {
  localStorage.setItem(
    'myebirdmap:display',
    JSON.stringify({
      theme: themeMode,
      mapStyle,
      projection,
      metric,
      clustering,
      grouping,
      polygon,
      yearFrom,
      yearTo,
      monthFrom,
      monthTo,
      followMap: $('#follow-map').checked,
      additional: $('#additional').checked,
      camera: map
        ? { center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }
        : preferences.camera,
    }),
  );
}

function updateMapMetric() {
  document.querySelectorAll('[data-metric]').forEach((button) => {
    const selected = button.dataset.metric === metric;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  const radius = ['interpolate', ['linear'], ['ln', ['+', ['get', metric], 1]], 0, 9, 9, 30];
  const count = ['get', metric];
  const label = metric === 'observations' ? ['get', 'observationLabel'] : ['to-string', count];
  const breaks = (
    clustering === 'country'
      ? {
          species: [25, 100, 250, 500, 1000],
          checklists: [10, 50, 200, 1000, 5000],
          observations: [100, 1000, 5000, 20000, 100000],
          locations: [5, 20, 100, 500, 2000],
        }
      : {
          species: [5, 15, 30, 60, 100],
          checklists: [2, 5, 20, 100, 500],
          observations: [10, 50, 200, 1000, 5000],
          locations: [2, 5, 20, 100, 500],
        }
  )[metric];
  const colors = [
    'case',
    ['==', count, 0],
    '#87939b',
    [
      'step',
      count,
      '#440154',
      breaks[0],
      '#414487',
      breaks[1],
      '#2a788e',
      breaks[2],
      '#22a884',
      breaks[3],
      '#7ad151',
      breaks[4],
      '#fde725',
    ],
  ];
  $('#map-legend').innerHTML =
    `<strong>${{ species: 'Species', checklists: 'Checklists', observations: 'Observations', locations: 'Locations' }[metric]}</strong><div class="legend-colors"><span>1–${breaks[0] - 1}</span>${breaks.map((value, i) => `<span>${format(value)}${i === breaks.length - 1 ? '+' : '–' + format(breaks[i + 1] - 1)}</span>`).join('')}</div>`;
  if (!map?.getLayer('map-labels')) return;
  for (const layer of ['clusters', 'locations']) {
    map.setPaintProperty(layer, 'circle-radius-transition', { duration: 0 });
    map.setPaintProperty(layer, 'circle-color-transition', { duration: 0 });
    map.setPaintProperty(layer, 'circle-radius', [
      'interpolate',
      ['linear'],
      ['zoom'],
      0,
      clustering === 'off' ? 4 : radius,
      7,
      clustering === 'off' ? 6 : radius,
      12,
      radius,
    ]);
    map.setPaintProperty(layer, 'circle-color', colors);
    map.setLayoutProperty(layer, 'circle-sort-key', count);
    map.setPaintProperty(layer, 'circle-opacity', 1);
    map.setPaintProperty(layer, 'circle-stroke-color', '#ffffff');
    map.setPaintProperty(layer, 'circle-stroke-width', clustering === 'off' ? 1.5 : 2);
  }
  map.setPaintProperty('country-fill', 'fill-color', colors);
  map.setPaintProperty('country-fill', 'fill-opacity', 0.72);
  map.setLayoutProperty('country-labels', 'text-field', label);
  map.setPaintProperty('point-outlines', 'circle-radius-transition', { duration: 0 });
  map.setPaintProperty('point-outlines', 'circle-radius', [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    clustering === 'off' ? 6.5 : ['+', radius, 3],
    7,
    clustering === 'off' ? 8.5 : ['+', radius, 3],
    12,
    ['+', radius, 3],
  ]);
  map.setPaintProperty('map-labels', 'text-color', ['step', count, '#ffffff', breaks[2], '#102a36']);
  map.setLayoutProperty('map-labels', 'text-allow-overlap', clustering !== 'off');
  map.setLayerZoomRange('map-labels', clustering === 'off' ? 8 : 0, 24);
  map.setLayoutProperty('map-labels', 'text-field', label);
}

function toast(message, error = false) {
  $('#toast-message').textContent = message;
  $('#toast-icon').className = `bi ${error ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}`;
  $('#toast').classList.toggle('toast-error', error);
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  if (!error) toastTimer = setTimeout(() => ($('#toast').hidden = true), 12000);
}

function progress(message) {
  $('#import-status').textContent = message;
}

function beginOperation(title, message) {
  dataBusy = true;
  updateDataActions();
  $('#toast').hidden = true;
  $('#data-feedback').hidden = true;
  $('#progress-title').textContent = title;
  progress(message);
  if (!$('#progress-dialog').open) $('#progress-dialog').showModal();
  $('#progress-dialog').focus();
}

function finishOperation() {
  dataBusy = false;
  updateDataActions();
  $('#progress-dialog').close();
}

function updateDataActions() {
  $('#data-button').disabled = dataBusy;
  $('#choose-export').disabled = dataBusy;
  $('#explore-demo').disabled = dataBusy;
  $('#drive-backups').hidden = !driveClientId;
  const personal = dataset?.kind === 'import';
  $('#data-state').textContent = personal
    ? locallySaved
      ? 'Saved on this device'
      : 'Session only · not saved'
    : dataset?.kind === 'synthetic'
      ? 'Demo · sample observations'
      : 'No data loaded';
  $('#data-state').classList.toggle('is-demo', dataset?.kind === 'synthetic');
  $('#current-data').hidden = !personal;
  $('#current-data-name').textContent = dataset?.label || '';
  $('#current-data-detail').textContent =
    `${format(records.length)} observation${records.length === 1 ? '' : 's'} · ${locallySaved ? 'Saved on this device' : 'Session only'}`;
  $('#data-title').textContent = personal ? 'My data' : 'Your birding, mapped.';
  $('#data-intro').hidden = personal;
  $('#close-data').hidden = !records.length;
  $('#data-footer').hidden = personal;
  $('#demo-invitation').hidden = personal;
  $('#backup-status').textContent = dataset?.driveSavedAt
    ? `Last backup: ${new Date(dataset.driveSavedAt).toLocaleString()}`
    : personal
      ? 'Save a copy to use on another device.'
      : 'Have a saved backup? Restore it here.';
  $('#drive-save').disabled = dataBusy || !activeSource || !driveClientId;
  $('#drive-load').disabled = dataBusy || !driveClientId;
  for (const id of ['drive-save', 'drive-load'])
    $(`#${id}`).title = driveClientId
      ? `${id === 'drive-save' ? 'Save to' : 'Load from'} Google Drive`
      : 'Google Drive is not configured';
}

async function transferDrive(action) {
  beginOperation(
    action === 'save' ? 'Saving to Google Drive' : 'Loading from Google Drive',
    'Connecting to Google Drive… Complete sign-in in the Google window if prompted.',
  );
  try {
    if (action === 'save') {
      const backup = await saveToDrive(activeSource, dataset, progress);
      dataset.driveSavedAt = backup.savedAt;
      if (locallySaved) await saveSnapshotMetadata(dataset).catch(() => {});
      progress('Saved to your Google Drive.');
      toast('Saved to your Google Drive.');
    } else {
      const backup = await loadFromDrive(progress);
      await importCsv(backup.file, { origin: 'drive', backupAt: backup.savedAt });
    }
  } catch (error) {
    $('#data-feedback').textContent = error.message;
    $('#data-feedback').hidden = false;
    toast(error.message, true);
  } finally {
    finishOperation();
  }
}

function setDateBounds() {
  const years = [
    ...new Set([...records.map((record) => record.date.slice(0, 4)), yearFrom, yearTo].filter(Boolean)),
  ].sort();
  const options = '<option value="">Any year</option>' + years.map((year) => `<option>${year}</option>`).join('');
  const months =
    '<option value="">Any month</option>' +
    Array.from(
      { length: 12 },
      (_, i) =>
        `<option value="${String(i + 1).padStart(2, '0')}">${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, i, 1))}</option>`,
    ).join('');
  for (const end of ['from', 'to']) {
    $(`#date-${end}-year`).innerHTML = options;
    $(`#date-${end}-month`).innerHTML = months;
    $(`#date-${end}-year`).value = end === 'from' ? yearFrom : yearTo;
    $(`#date-${end}-month`).value = end === 'from' ? monthFrom : monthTo;
  }
}

function hideSpeciesTooltip() {
  speciesTooltipTarget?.removeAttribute('aria-describedby');
  speciesTooltipTarget = null;
  $('#species-tooltip').hidden = true;
}

function showSpeciesTooltip(event) {
  const icon = event.target.closest('.table-name .exotic-icon');
  if (tab !== 'species' || !icon || icon === speciesTooltipTarget) return;
  hideSpeciesTooltip();
  const { categories } = exoticStatusSummary(resultsByCode.get(icon.closest('.table-name').dataset.key).exoticCounts);
  if (!categories.length) return;
  const tooltip = $('#species-tooltip');
  tooltip.innerHTML = `<strong>Observations</strong>${categories
    .map(
      (category) =>
        `<div class="status-breakdown-row"><span class="exotic-icon exotic-icon-${category.code}" aria-hidden="true"></span><span>${category.label}</span><b>${format(category.count)}</b></div>`,
    )
    .join('')}`;
  tooltip.hidden = false;
  const bounds = icon.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - tooltip.offsetWidth - 8))}px`;
  tooltip.style.top = `${bounds.bottom + 8 + tooltip.offsetHeight > innerHeight ? Math.max(8, bounds.top - tooltip.offsetHeight - 8) : bounds.bottom + 8}px`;
  speciesTooltipTarget = icon;
  icon.setAttribute('aria-describedby', 'species-tooltip');
}

function renderResults() {
  hideSpeciesTooltip();
  const query = $('#search')
    .value.trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const groups = new Map();
  for (const record of tab === 'species' ? speciesRecords : filtered) {
    if (tab === 'species' && record.count === 0) continue;
    const key = tab === 'species' ? record.species || record.code : record.locationId;
    if (!groups.has(key))
      groups.set(key, {
        ...record,
        name: tab === 'species' ? record.speciesName || record.name : record.name,
        scientific: record.speciesScientific || record.scientific,
        category: record.species ? 'species' : record.category,
        checklists: new Set(),
        speciesIds: new Set(),
        observations: 0,
        individuals: 0,
        exoticCounts: { native: 0, N: 0, P: 0, X: 0, unresolved: 0 },
      });
    groups.get(key).checklists.add(record.checklist);
    if (record.count !== 0) groups.get(key).observations++;
    groups.get(key).individuals += record.count ?? 0;
    if (record.count !== 0)
      groups.get(key).exoticCounts[record.exoticNeedsCounty ? 'unresolved' : record.exotic || 'native']++;
    if (record.species && record.count !== 0 && record.exotic !== 'X') groups.get(key).speciesIds.add(record.species);
  }
  const results = [...groups.entries()].filter(([, record]) =>
    (tab === 'species'
      ? `${record.name} ${record.scientific}`
      : `${record.location} ${countryNames.of(record.country)} ${record.checklist} ${record.date}`
    )
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .includes(query),
  );
  const sort = tableSort[tab];
  results.sort(
    ([, a], [, b]) =>
      sort.direction *
      (sort.key === 'name'
        ? tab === 'species'
          ? a.taxonOrder - b.taxonOrder
          : a.location.localeCompare(b.location)
        : sort.key === 'species'
          ? a.speciesIds.size - b.speciesIds.size
          : sort.key === 'checklists'
            ? a.checklists.size - b.checklists.size
            : a[sort.key] - b[sort.key]),
  );
  resultsByCode = new Map(results);
  const columns = [
    ['name', tab === 'species' ? 'Species' : 'Location', tab === 'species' ? 'Taxonomic order' : 'Location name'],
    ...(tab === 'locations'
      ? [
          ['species', 'Species', 'Species'],
          ['checklists', 'Lists', 'Checklists'],
        ]
      : []),
    ['observations', 'Obs.', 'Observations'],
    ['individuals', 'Birds', 'Sum of numeric counts; X is excluded'],
  ];
  const head = columns
    .map(
      ([key, label, title]) =>
        `<th scope="col" aria-sort="${sort.key === key ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${key}" title="${title}">${label}<span aria-hidden="true">${sort.key === key ? (sort.direction === 1 ? '<i class="bi bi-arrow-up"></i>' : '<i class="bi bi-arrow-down"></i>') : ''}</span></button></th>`,
    )
    .join('');
  let speciesNumber = 0;
  const rows = results
    .slice(0, visibleRows)
    .map(([key, record]) => {
      const status = exoticStatusSummary(record.exoticCounts);
      const statusTags =
        tab === 'species' && status.code && status.code !== 'unresolved'
          ? `<span class="exotic-icon exotic-icon-${status.code}" role="img" tabindex="0" aria-label="${status.label}"></span>`
          : '';
      return `<tr data-key="${escapeHtml(key)}" class="${tab === 'species' && selectedCodes.has(key) ? 'selected ' : ''}${tab === 'species' && !record.speciesIds.size ? 'additional-taxon' : ''}">${tab === 'species' ? `<td class="species-number">${record.speciesIds.size ? format(++speciesNumber) : ''}</td>` : ''}<td><button class="table-name"${tab === 'species' ? ` aria-pressed="${selectedCodes.has(key)}"` : ''} data-key="${escapeHtml(key)}" ${tab === 'locations' ? `title="${escapeHtml(record.location)}"` : ''}><span class="species-label">${escapeHtml(tab === 'species' ? record.name : record.location)}</span>${statusTags}</button></td>${tab === 'locations' ? `<td>${format(record.speciesIds.size)}</td><td>${format(record.checklists.size)}</td>` : ''}<td>${format(record.observations)}</td><td>${format(record.individuals)}</td></tr>`;
    })
    .join('');
  $('#results').innerHTML =
    `<table class="results-table"><caption class="visually-hidden">${tab === 'species' ? 'Species' : 'Locations'} in the selected area. Click column headings to sort.</caption><thead><tr>${tab === 'species' ? '<th scope="col" class="species-number" title="Species number">#</th>' : ''}${head}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + (tab === 'species' ? 1 : 0)}" class="empty">No results in this selection.</td></tr>`}</tbody></table>${results.length > visibleRows ? `<button class="show-more" data-more>Show more (${format(visibleRows)} of ${format(results.length)})</button>` : ''}`;
  $('#list-label').textContent = `${format(results.length)} ${tab === 'species' ? 'TAXA' : 'PLACES'} IN THIS AREA`;
}

function refresh(updateSource = true) {
  $('#demo-notice').hidden = dataset.kind !== 'synthetic';
  const area = drawing ? previewPolygon : polygon;
  if (updateSource) {
    locationPopup?.remove();
    areaRecords = filterRecords(records, {
      yearFrom,
      yearTo,
      monthFrom,
      monthTo,
      additional: $('#additional').checked,
    });
    if (area) areaRecords = areaRecords.filter((record) => pointInPolygon([record.longitude, record.latitude], area));
    mapRecords = selectedCodes.size
      ? areaRecords.filter(
          (record) => record.count !== 0 && (selectedCodes.has(record.code) || selectedCodes.has(record.species)),
        )
      : areaRecords;
  }
  const followArea = !area && $('#follow-map').checked && map && map.getZoom() >= 3;
  const bounds = followArea ? map.getBounds() : null;
  filtered = bounds ? mapRecords.filter((record) => bounds.contains([record.longitude, record.latitude])) : mapRecords;
  speciesRecords = selectedCodes.size
    ? bounds
      ? areaRecords.filter((record) => bounds.contains([record.longitude, record.latitude]))
      : areaRecords
    : filtered;
  const totals = summarize(filtered);
  for (const [id, key] of [
    ['species', 'species'],
    ['checklists', 'checklists'],
    ['observations', 'observations'],
    ['places', 'locations'],
  ])
    $(`#${id}-count`).textContent = format(totals[key]);
  $('#species-selection').hidden = !selectedCodes.size;
  if (selectedCodes.size === 1) {
    const code = [...selectedCodes][0],
      record = records.find((record) => record.code === code || record.species === code);
    $('#species-selection-label').textContent = `Selected: ${record.speciesName || record.name}`;
  } else $('#species-selection-label').textContent = `${format(selectedCodes.size)} taxa selected`;
  renderResults();
  updateMap(updateSource);
}

function loadCountryBoundaries() {
  if (countryBoundaryRequest) return;
  countryBoundaryRequest = fetch(new URL('./assets/countries-v1.json', import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error('Country boundary download failed');
      return response.json();
    })
    .then((data) => {
      countryBoundaries = new Map(data.features.map((feature) => [feature.properties.code, feature]));
      renderedKey = null;
      updateMap(false);
    })
    .catch(() => toast('Country boundaries could not load. Showing country circles instead.'));
}

function updateMap(rebuild = true) {
  if (rebuild) {
    mapGroups.clear();
    renderedKey = null;
  }
  const source = map?.getSource('observations');
  if (!source) return;
  const key = ['country', 'region'].includes(clustering) ? clustering : 'locations';
  if (!mapGroups.has(key)) mapGroups.set(key, { points: groupMapRecords(mapRecords, clustering) });
  const group = mapGroups.get(key);
  mapPoints = group.points;
  if (clustering === 'auto' && !group.index) group.index = indexMapLocations(mapPoints);
  clusterIndex = clustering === 'auto' ? group.index : null;
  const nextKey = `${clustering}/${clusterIndex ? Math.floor(map.getZoom()) : ''}`;
  if (source === renderedSource && nextKey === renderedKey) return;
  const features = clusterIndex ? clusteredMapFeatures(clusterIndex, map.getZoom()) : mapPoints;
  if (clustering === 'country' && !countryBoundaries) loadCountryBoundaries();
  const countries =
    clustering === 'country' && countryBoundaries
      ? countryMapFeatures(features, countryBoundaries)
      : { polygons: [], circles: renderMapFeatures(features), labels: [] };
  map.setFilter(
    'clusters',
    clustering === 'country'
      ? ['all', ['has', 'point_count'], ['==', ['get', 'grouping'], 'country']]
      : ['has', 'point_count'],
  );
  map.setFilter(
    'locations',
    clustering === 'country'
      ? ['all', ['!', ['has', 'point_count']], ['==', ['get', 'grouping'], 'country']]
      : ['!', ['has', 'point_count']],
  );
  source.setData({ type: 'FeatureCollection', features: countries.circles });
  map.getSource('countries').setData({ type: 'FeatureCollection', features: countries.polygons });
  map.getSource('country-labels').setData({ type: 'FeatureCollection', features: countries.labels });
  renderedSource = source;
  renderedKey = nextKey;
}

function updatePolygon() {
  const points = drawing ? vertices : polygon || [];
  const features = [];
  if (points.length > 1)
    features.push({
      type: 'Feature',
      properties: {},
      geometry:
        points.length > 2
          ? { type: 'Polygon', coordinates: [[...unwrapPolygon(points), points[0]]] }
          : { type: 'LineString', coordinates: unwrapPolygon(points) },
    });

  map?.getSource('selection')?.setData({ type: 'FeatureCollection', features });
  $('#polygon-start').hidden = grouping !== 'polygon' || drawing;
  $('#polygon-start').textContent = polygon ? 'Draw new polygon' : 'Draw polygon';
  $('#polygon-start').setAttribute('aria-expanded', String(drawing));
  $('#polygon-clear').hidden = grouping !== 'polygon' || drawing || !polygon;
  $('#polygon-actions').hidden = !drawing;
  $('#polygon-finish').disabled = vertices.length < 3;
  $('#polygon-undo').disabled = !polygonHistory.length;
  const error = vertices.length >= 3 ? polygonError(vertices) : null;
  $('#polygon-help').textContent = error
    ? `${error} Counts show the last valid area.`
    : vertices.length < 3
      ? 'Add corners on the map. Double-click to finish.'
      : liveDragCounts
        ? 'Drag corners to adjust. Double-click to finish.'
        : 'Drag corners to adjust. Counts update when you release.';
  if (drawing && vertices.length >= 3 && !error) previewPolygon = unwrapPolygon(vertices);
  if (cornerMarkers.length !== points.length) {
    cornerMarkers.forEach((marker) => marker.remove());
    cornerMarkers = points.map((point, index) => {
      const element = document.createElement('button');
      element.className = 'polygon-corner';
      element.setAttribute('aria-label', 'Drag polygon corner');
      element.title = 'Drag to move corner';
      element.onclick = (event) => event.stopPropagation();
      element.ondblclick = (event) => {
        event.stopPropagation();
        if (drawing) finishPolygon();
      };
      const marker = new mapboxgl.Marker({ element, draggable: true }).setLngLat(point).addTo(map);
      marker.on('dragstart', () => {
        if (!drawing) {
          drawing = true;
          vertices = polygon.map((point) => [...point]);
          previewPolygon = polygon;
          polygonHistory = [];
          map.doubleClickZoom.disable();
        }
        polygonHistory.push(vertices.map((point) => [...point]));
        draggingCorner = true;
        locationPopup?.remove();
        updatePolygon();
      });
      marker.on('drag', () => {
        const position = marker.getLngLat();
        vertices[index] = [position.lng, position.lat];
        updatePolygon();
        if (liveDragCounts && !liveCountTimer)
          liveCountTimer = setTimeout(() => {
            liveCountTimer = null;
            const started = performance.now();
            refresh();
            if (performance.now() - started > 80) {
              liveDragCounts = false;
              updatePolygon();
            }
          }, 150);
      });
      marker.on('dragend', () => {
        draggingCorner = false;
        clearTimeout(liveCountTimer);
        liveCountTimer = null;
        updatePolygon();
        refresh();
      });
      return marker;
    });
  }
  if (!draggingCorner) cornerMarkers.forEach((marker, index) => marker.setLngLat(points[index]));
}

function endDrawing() {
  clearTimeout(liveCountTimer);
  liveCountTimer = null;
  drawing = false;
  vertices = [];
  previewPolygon = null;
  polygonHistory = [];
  map?.doubleClickZoom.enable();
  if (map) map.getCanvas().style.cursor = '';
  updatePolygon();
}

function addMapLayers() {
  const palette = getComputedStyle(document.body);
  map.setProjection(projection);
  map.setFog({
    color: theme === 'night' ? '#1d303e' : '#e2ecf3',
    'high-color': theme === 'night' ? '#29495f' : '#d2e2ed',
    'space-color': theme === 'night' ? '#142532' : '#edf3f7',
    'horizon-blend': 0.04,
    'star-intensity': theme === 'night' ? 0.15 : 0,
  });
  if (mapStyle === 'atlas')
    for (const layer of map.getStyle().layers) {
      if (layer.id === 'background')
        map.setPaintProperty(layer.id, 'background-color', theme === 'night' ? '#1d303e' : '#f3f5f4');
      if (layer.id === 'water') map.setPaintProperty(layer.id, 'fill-color', theme === 'night' ? '#234459' : '#cfdfeb');
      if (
        layer.type === 'symbol' &&
        (layer.id.includes('poi') || layer.id.includes('road') || layer.id.includes('airport'))
      )
        map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  map.addSource('countries', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'country-fill',
    type: 'fill',
    source: 'countries',
    paint: { 'fill-color': '#2a788e', 'fill-opacity': 0.52 },
  });
  map.addLayer({
    id: 'country-borders',
    type: 'line',
    source: 'countries',
    paint: { 'line-color': theme === 'night' ? '#e3edf3' : '#385b75', 'line-width': 1.2, 'line-opacity': 0.9 },
  });
  map.addSource('country-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('observations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'point-outlines',
    type: 'circle',
    source: 'observations',
    paint: { 'circle-radius': 6, 'circle-color': '#173e54', 'circle-opacity': 0.65 },
  });
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'observations',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': palette.getPropertyValue('--map-point').trim(),
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 40, 23],
      'circle-opacity': 0.92,
      'circle-stroke-width': 4,
      'circle-stroke-color': palette.getPropertyValue('--map-ring').trim(),
    },
  });
  map.addLayer({
    id: 'locations',
    type: 'circle',
    source: 'observations',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': palette.getPropertyValue('--map-point').trim(),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 7, 6],
      'circle-opacity': 0.95,
      'circle-stroke-color': palette.getPropertyValue('--map-stroke').trim(),
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'map-labels',
    type: 'symbol',
    source: 'observations',
    layout: {
      'text-field': ['to-string', ['get', metric]],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 10,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': palette.getPropertyValue('--map-label').trim() },
  });
  map.addLayer({
    id: 'country-labels',
    type: 'symbol',
    source: 'country-labels',
    layout: {
      'text-field': ['to-string', ['get', metric]],
      'text-size': 12,
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#173e54', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  });
  map.addSource('selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'selection-fill',
    source: 'selection',
    type: 'fill',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': '#7fbe25', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'selection-line',
    source: 'selection',
    type: 'line',
    filter: ['!=', '$type', 'Point'],
    paint: { 'line-color': palette.getPropertyValue('--green').trim(), 'line-width': 2, 'line-dasharray': [3, 2] },
  });
  map.addLayer({
    id: 'selection-corners',
    source: 'selection',
    type: 'circle',
    filter: ['==', '$type', 'Point'],
    paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#7fbe25', 'circle-stroke-width': 2 },
  });
  updatePolygon();
  updateMap(false);
  updateMapMetric();
}

function changeMapStyle() {
  const styles = {
    atlas: `${theme === 'night' ? 'dark' : 'light'}-v11`,
    streets: 'streets-v12',
    outdoors: 'outdoors-v12',
    satellite: 'satellite-streets-v12',
  };
  map?.setStyle(`mapbox://styles/mapbox/${styles[mapStyle]}`, { diff: false });
}

function mapFeaturesAt(point) {
  // GeoJSON sources replace their tile indexes asynchronously after grouping/filter changes.
  if (!map.isStyleLoaded() || !map.isSourceLoaded('observations') || !map.isSourceLoaded('countries')) return [];
  return map.queryRenderedFeatures(point, { layers: ['locations', 'clusters', 'country-fill'] });
}

async function initializeMap() {
  const publicToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  if (!window.mapboxgl || !publicToken) {
    $('#map-message').textContent =
      'The map is unavailable. Configure VITE_MAPBOX_ACCESS_TOKEN and rebuild the app. You can still import and explore your data.';
    $('#map-message').hidden = false;
    return;
  }
  const styles = {
    atlas: `${theme === 'night' ? 'dark' : 'light'}-v11`,
    streets: 'streets-v12',
    outdoors: 'outdoors-v12',
    satellite: 'satellite-streets-v12',
  };
  map = new mapboxgl.Map({
    container: 'map',
    accessToken: publicToken,
    style: `mapbox://styles/mapbox/${styles[mapStyle]}`,
    projection,
    center: [12, 22],
    zoom: window.innerWidth < 760 ? 0.5 : 1.22,
    ...preferences.camera,
    attributionControl: true,
  });
  if (import.meta.env.DEV) window.designMap = map;
  map.on('style.load', () => {
    addMapLayers();
    refresh(false);
  });
  map.on('moveend', () => {
    refresh(false);
    savePreferences();
  });
  map.on('error', (event) => {
    if (event.error?.status === 401 || event.error?.status === 403) {
      $('#map-message').textContent =
        'Mapbox rejected the map token. Check its permissions and allowed URLs, then rebuild with VITE_MAPBOX_ACCESS_TOKEN.';
      $('#map-message').hidden = false;
    } else console.error(event.error);
  });
  map.on('click', (event) => {
    if (drawing) {
      if (event.originalEvent.detail > 1) return;
      const last = vertices.at(-1);
      if (last && map.project(last).dist(event.point) < 6) return;
      polygonHistory.push(vertices.map((point) => [...point]));
      vertices.push([event.lngLat.lng, event.lngLat.lat]);
      updatePolygon();
      refresh();
      return;
    }
    const features = mapFeaturesAt(event.point);
    if (!features.length) return;
    const feature = features[0];
    if (feature.properties.cluster_id !== undefined) {
      map.easeTo({
        center: feature.geometry.coordinates,
        zoom: clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id),
      });
    } else {
      const p = feature.properties;
      const rows = mapRecords.filter(
        (record) =>
          (p.grouping === 'country' ? record.country : p.grouping === 'region' ? record.region : record.locationId) ===
          p.id,
      );
      const name = p.grouping === 'country' ? countryNames.of(p.id) : p.name;
      const links =
        dataset.kind === 'synthetic'
          ? {}
          : ebirdSummaryLinks(
              p.id,
              [...new Set(rows.map((record) => record.checklist))],
              selectedCodes.size === 1 ? [...selectedCodes][0] : '',
            );
      const stats = [
        ['species', 'Species', 'species'],
        ['checklists', 'Checklists', 'checklist'],
        ['observations', 'Observations', 'check'],
      ]
        .map(([key, label, icon]) => {
          const linked = links[key];
          const tag = linked ? 'a' : 'div';
          const attributes = linked
            ? ` href="${escapeHtml(linked)}" target="_blank" rel="noopener" title="View your ${label.toLowerCase()} on eBird"`
            : '';
          return `<${tag} class="popup-stat"${attributes}><span class="stat-value"><svg class="metric-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#Icon--${icon}"/></svg><span>${format(p[key])}</span></span><span class="metric-label">${label}${linked ? '<i class="bi bi-box-arrow-up-right external-link" aria-hidden="true"></i>' : ''}</span></${tag}>`;
        })
        .join('');
      locationPopup = new mapboxgl.Popup({ maxWidth: '340px' })
        .setLngLat(feature.geometry.type === 'Point' ? feature.geometry.coordinates : event.lngLat)
        .setHTML(
          `<section class="location-popup"><h3>${escapeHtml(name)}</h3><div class="popup-stats">${stats}</div>${dataset.kind === 'synthetic' ? '<p class="popup-note">Demonstration data</p>' : ''}</section>`,
        )
        .addTo(map);
      if (p.grouping === 'country' || p.grouping === 'region') {
        const bounds = new mapboxgl.LngLatBounds();
        for (const record of rows) bounds.extend([record.longitude, record.latitude]);
        map.fitBounds(bounds, { padding: 50, maxZoom: 10 });
      } else map.flyTo({ center: feature.geometry.coordinates, zoom: Math.max(15, map.getZoom()) });
    }
  });
  map.on('dblclick', (event) => {
    if (drawing) {
      event.preventDefault();
      finishPolygon();
    }
  });
  map.on('mousemove', (event) => {
    if (!map.getLayer('locations')) return;
    map.getCanvas().style.cursor = drawing ? 'crosshair' : mapFeaturesAt(event.point).length ? 'pointer' : '';
  });
}

function resetSelection() {
  selectedCodes.clear();
  selectionAnchor = '';
  polygon = null;
  if (grouping === 'polygon') {
    grouping = 'off';
    clustering = 'off';
    $('#clustering').value = 'off';
    savePreferences();
  }
  endDrawing();
  refresh();
}

$('#results').onpointerover = showSpeciesTooltip;
$('#results').addEventListener('focusin', showSpeciesTooltip);
$('#results').onpointerout = (event) => {
  if (speciesTooltipTarget && !speciesTooltipTarget.contains(event.relatedTarget)) hideSpeciesTooltip();
};
$('#results').addEventListener('focusout', hideSpeciesTooltip);
document.addEventListener('scroll', hideSpeciesTooltip, true);
window.addEventListener('resize', hideSpeciesTooltip);

$('#results').onclick = (event) => {
  const heading = event.target.closest('[data-sort]');
  if (heading) {
    const sort = tableSort[tab];
    sort.direction = sort.key === heading.dataset.sort ? -sort.direction : heading.dataset.sort === 'name' ? 1 : -1;
    sort.key = heading.dataset.sort;
    visibleRows = 160;
    renderResults();
    return;
  }
  if (event.target.closest('[data-more]')) {
    visibleRows += 160;
    renderResults();
    return;
  }
  const button = event.target.closest('[data-key]');
  if (!button) return;
  const record = resultsByCode.get(button.dataset.key);
  if (tab === 'species') {
    const key = button.dataset.key;
    const keys = [...resultsByCode.keys()];
    if (event.shiftKey && keys.includes(selectionAnchor)) {
      const from = keys.indexOf(selectionAnchor),
        to = keys.indexOf(key);
      for (const code of keys.slice(Math.min(from, to), Math.max(from, to) + 1)) selectedCodes.add(code);
    } else {
      if (selectedCodes.has(key)) selectedCodes.delete(key);
      else {
        if (!event.shiftKey && !event.metaKey && !event.ctrlKey) selectedCodes.clear();
        selectedCodes.add(key);
      }
      selectionAnchor = key;
    }
    refresh();
  } else {
    $('.sidebar').classList.remove('open');
    map?.flyTo({ center: [record.longitude, record.latitude], zoom: 15, essential: false });
  }
};
$('#clear-species-selection').onclick = () => {
  selectedCodes.clear();
  selectionAnchor = '';
  refresh();
};
$('#search').oninput = () => {
  searchText[tab] = $('#search').value;
  visibleRows = 160;
  renderResults();
};
for (const name of ['species', 'locations'])
  $(`#${name}-tab`).onclick = () => {
    tab = name;
    visibleRows = 160;
    $('#search').value = searchText[tab];
    $('#search').placeholder = tab === 'species' ? 'Search species' : 'Search locations';
    $('#search').setAttribute('aria-label', $('#search').placeholder);
    $('.results-panel').setAttribute('aria-labelledby', `${tab}-tab`);
    for (const other of ['species', 'locations'])
      $(`#${other}-tab`).setAttribute('aria-selected', String(other === name));
    renderResults();
  };
$('#zoom-in').onclick = () => map?.zoomIn();
$('#zoom-out').onclick = () => map?.zoomOut();
function startPolygon() {
  if (!map?.getSource('selection')) return;
  locationPopup?.remove();
  vertices = [];
  drawing = true;
  previewPolygon = polygon;
  polygonHistory = [];
  map.doubleClickZoom.disable();
  map.getCanvas().style.cursor = 'crosshair';
  updatePolygon();
}
$('#polygon-start').onclick = startPolygon;
function finishPolygon() {
  const error = polygonError(vertices);
  if (error) {
    $('#polygon-help').textContent = error;
    return;
  }
  polygon = unwrapPolygon(vertices);
  savePreferences();
  endDrawing();
  refresh();
  $('#polygon-start').focus();
}
$('#polygon-finish').onclick = finishPolygon;
$('#polygon-undo').onclick = () => {
  vertices = polygonHistory.pop();
  previewPolygon = polygon;
  updatePolygon();
  refresh();
};
$('#polygon-clear').onclick = () => {
  polygon = null;
  grouping = 'off';
  clustering = 'off';
  $('#clustering').value = 'off';
  endDrawing();
  savePreferences();
  refresh();
  updateMapMetric();
};
$('#polygon-delete').onclick = $('#polygon-clear').onclick;
document.onkeydown = (event) => {
  if (
    event.key === '/' &&
    !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
    !$('#settings-dialog').matches(':popover-open')
  ) {
    event.preventDefault();
    $('.sidebar').classList.add('open');
    $('#search').focus();
  }
  if (event.key === 'Escape') {
    hideSpeciesTooltip();
    if (drawing) {
      endDrawing();
      refresh();
    }
    $('.sidebar').classList.remove('open');
  }
};
$('#clustering').onchange = () => {
  const hadArea = Boolean(polygon || previewPolygon);
  grouping = $('#clustering').value;
  clustering = grouping === 'polygon' ? 'off' : grouping;
  polygon = null;
  endDrawing();
  locationPopup?.remove();
  if (grouping === 'polygon') startPolygon();
  savePreferences();
  if (hadArea) refresh();
  else updateMap(false);
  updateMapMetric();
};
$('#settings-done').onclick = () => $('#settings-dialog').hidePopover();
$('#close-settings').onclick = () => $('#settings-dialog').hidePopover();
$('#settings-form').onsubmit = (event) => {
  event.preventDefault();
  $('#settings-dialog').hidePopover();
};
$('#settings-form').onchange = (event) => {
  if (event.target.id.startsWith('date-')) {
    yearFrom = $('#date-from-year').value;
    yearTo = $('#date-to-year').value;
    monthFrom = $('#date-from-month').value;
    monthTo = $('#date-to-month').value;
    $('#date-to-year').setCustomValidity(
      yearFrom && yearTo && yearFrom > yearTo ? 'Choose a To year on or after From.' : '',
    );
    if (!$('#date-to-year').reportValidity()) return;
  }

  themeMode = $('input[name="theme"]:checked').value;
  theme = themeMode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'atlas') : themeMode;
  projection = $('#projection').value;
  mapStyle = $('#background').value;
  document.body.classList.toggle('night', theme === 'night');
  savePreferences();
  if (event.target.id === 'projection') map?.setProjection(projection);
  else if (event.target.name === 'theme' || event.target.id === 'background') changeMapStyle();
  else refresh();
};
document.querySelectorAll('[data-metric]').forEach(
  (button) =>
    (button.onclick = () => {
      metric = button.dataset.metric;
      savePreferences();
      updateMapMetric();
    }),
);
function importCsv(file, options = {}) {
  if (
    dataset.kind === 'import' &&
    !window.confirm(
      `Replace “${dataset.label}” with “${file.name}”?\nYour saved browser copy is replaced only after a successful import.`,
    )
  )
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.js', import.meta.url), { type: 'module' });
    beginOperation(
      options.origin === 'drive' ? 'Loading from Google Drive' : 'Loading My eBird observations',
      'Opening your export…',
    );
    const finish = () => {
      finishOperation();
      worker.terminate();
    };
    worker.onmessage = async ({ data }) => {
      if (data.type === 'progress') {
        progress(data.message || `Importing ${format(data.rows)} rows…`);
        return;
      }
      if (data.type === 'error') {
        finish();
        $('#data-feedback').textContent = `Import failed: ${data.message}`;
        $('#data-feedback').hidden = false;
        toast(`Import failed: ${data.message}`, true);
        reject(new Error(data.message));
        return;
      }
      progress('Preparing your map and observation lists…');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      dataset = data.metadata;
      records = data.records;
      activeSource = data.source;
      locallySaved = data.saved;
      setDateBounds();
      searchText.species = '';
      searchText.locations = '';
      $('#search').value = '';
      resetSelection();
      toast(
        data.saved
          ? `${format(records.length)} rows loaded and saved on this device.`
          : 'Data loaded for this session. Browser storage is full or unavailable; your previous saved data was kept.',
        !data.saved,
      );
      finish();
      $('#data-dialog').close();
      $('#data-button').focus();
      resolve();
    };
    worker.onerror = (error) => {
      finish();
      $('#data-feedback').textContent = `Import failed: ${error.message}`;
      $('#data-feedback').hidden = false;
      toast(`Import failed: ${error.message}`, true);
      reject(new Error(error.message));
    };
    worker.postMessage({ file, ...options });
  });
}
$('#file-input').onchange = async ({ target }) => {
  const file = target.files[0];
  target.value = '';
  if (file) await importCsv(file).catch(() => {});
};
$('#mobile-results').onclick = () => $('.sidebar').classList.toggle('open');
$('#close-results').onclick = () => $('.sidebar').classList.remove('open');
$('#data-button').onclick = () => $('#data-dialog').showModal();
$('#demo-import').onclick = () => $('#data-dialog').showModal();
$('#choose-export').onclick = () => $('#file-input').click();
$('#close-data').onclick = () => $('#data-dialog').close();
$('#data-dialog').oncancel = (event) => {
  if (!records.length) event.preventDefault();
};
$('#explore-demo').onclick = async () => {
  dataset = { ...(await import('./demo.js')).default };
  records = dataset.records;
  delete dataset.records;
  setDateBounds();
  resetSelection();
  updateDataActions();
  $('#data-dialog').close();
  $('#data-button').focus();
};
$('#choose-export').ondragover = (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = dataBusy ? 'none' : 'copy';
  if (!dataBusy) $('#choose-export').classList.add('drag-over');
};
$('#choose-export').ondragleave = (event) => {
  if (!$('#choose-export').contains(event.relatedTarget)) $('#choose-export').classList.remove('drag-over');
};
$('#choose-export').ondrop = async (event) => {
  event.preventDefault();
  $('#choose-export').classList.remove('drag-over');
  if (dataBusy) return;
  const file = event.dataTransfer.files[0];
  if (file) await importCsv(file).catch(() => {});
};
$('#toast-close').onclick = () => {
  $('#toast').hidden = true;
  clearTimeout(toastTimer);
};
$('#progress-dialog').oncancel = (event) => event.preventDefault();
$('#drive-save').onclick = () => transferDrive('save');
$('#drive-load').onclick = () => transferDrive('load');
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (themeMode !== 'system') return;
  theme = event.matches ? 'night' : 'atlas';
  document.body.classList.toggle('night', theme === 'night');
  changeMapStyle();
});

let stored;
try {
  stored = await loadSnapshot();
} catch {
  /* Browser storage may be unavailable in private browsing. */
}
if (stored) {
  dataset = { ...stored.metadata, records: stored.records };
  activeSource = stored.source;
  locallySaved = true;
} else dataset = { kind: 'empty', label: '', records: [] };
records = dataset.records;
delete dataset.records;
$('#import-status').textContent = dataset.label;
document.body.classList.toggle('night', theme === 'night');
$(`input[name="theme"][value="${themeMode}"]`).checked = true;
$('#projection').value = projection;
$('#background').value = mapStyle;
$('#clustering').value = grouping;
$('#follow-map').checked = preferences.followMap ?? true;
$('#additional').checked = preferences.additional ?? true;
updateMapMetric();
savePreferences();
setDateBounds();
refresh();
initializeMap();
updateDataActions();
if (driveClientId) prepareDrive().catch((error) => toast(error.message, true));
if (!stored) $('#data-dialog').showModal();
