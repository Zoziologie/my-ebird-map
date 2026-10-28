import 'bootstrap-icons/font/bootstrap-icons.css';
import { buildReplay, createReplay } from './replay.js';
import regionNames from './assets/region-names.json';
import ebirdCountryNames from './assets/country-names.json';
import taxonomyMetadata from './assets/taxonomy-source.json';
import { filterRecords, summarize, pointInPolygon, unwrapPolygon, polygonError, ebirdSummaryLinks } from './model.js';
import { loadSnapshot, saveSnapshotMetadata } from './storage.js';
import { exoticStatusSummary } from './exotic-rules.js';
import { driveClientId, prepareDrive, saveToDrive, loadFromDrive } from './drive.js';
import { initializeAnalyticsChoice, trackEvent } from './analytics.js';
import { datasetMapScales, mapMetricColor, mapPalette } from './map-colors.js';
import { regionMarkerRadius, updateRegionMarkers } from './region-markers.js';
import { readUrlSettings, writeUrlSettings } from './url-state.js';
import {
  groupMapDisplayRecords,
  indexMapLocations,
  clusteredMapFeatures,
  indexLocationHighlights,
  renderMapFeatures,
  formatMapCount,
  boundaryMapFeatures,
  geometryBounds,
} from './map-data.js';

const $ = (selector) => document.querySelector(selector);
const numberFormat = new Intl.NumberFormat('en');
const format = (value) => numberFormat.format(value);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const countryNames = { of: (code) => ebirdCountryNames[code] || code };
const preferences = readUrlSettings(window.location.href, {
  theme: 'system',
  mapStyle: 'atlas',
  projection: 'mercator',
  clustering: 'off',
  ...JSON.parse(localStorage.getItem('myebirdmap:display') || '{}'),
});
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
const regionBoundaries = new Map(),
  regionBoundaryRequests = new Map();
let regionBoundaryFrame;
let replay, replayLayerVisibility;
const regionBoundaryFiles = import.meta.glob('./assets/regions-v1/*.json', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});
let colorScales, selectionColorScales, colorSelectionKey;
let yearFrom = preferences.yearFrom || '',
  yearTo = preferences.yearTo || '',
  monthFrom = preferences.monthFrom || '',
  monthTo = preferences.monthTo || '';
const selectedCodes = new Set(preferences.species);
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
const resultGroups = new Map();
let locationHighlights = new Map(),
  hoveredLocation = '';

function highlightLocation(key = '') {
  const source = map?.getSource('location-highlight');
  if (!source || key === hoveredLocation) return;
  hoveredLocation = key;
  const feature = locationHighlights.get(key);
  const radius = feature ? regionMarkerRadius(feature.properties[metric]) + 6 : 0;
  source.setData({
    type: 'FeatureCollection',
    features: feature
      ? [
          {
            ...feature,
            properties: {
              ...feature.properties,
              highlightRadius: clustering === 'off' ? 10 : radius,
              highlightRadius7: clustering === 'off' ? 12 : radius,
              highlightRadius12: radius,
            },
          },
        ]
      : [],
  });
}

function displaySettings() {
  return {
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
  };
}

let urlUpdateTimer;
function scheduleUrlUpdate() {
  clearTimeout(urlUpdateTimer);
  urlUpdateTimer = setTimeout(() => {
    const url = writeUrlSettings(window.location.href, { ...displaySettings(), species: [...selectedCodes].sort() });
    if (url !== window.location.href) history.replaceState(history.state, '', url);
  }, 200);
}

function savePreferences() {
  localStorage.setItem('myebirdmap:display', JSON.stringify(displaySettings()));
  scheduleUrlUpdate();
}

function updateMapLegend(metric) {
  const maximum = (selectionColorScales || colorScales).maxima[clustering][metric];
  const ticks = [
    ...new Set(
      maximum > 1
        ? [
            1,
            ...[1, 2].map((i) =>
              Math.round(Math.exp(Math.log(2) + ((Math.log(maximum + 1) - Math.log(2)) * i) / 3) - 1),
            ),
            maximum,
          ]
        : [maximum],
    ),
  ];
  $('#map-legend').title =
    `Continuous logarithmic scale from ${maximum ? 1 : 0} to ${format(maximum)}; zero is gray. Based on the full file${selectedCodes.size ? ' for the selected taxa' : ''}; stable across zoom, date and area filters.`;
  $('#map-legend').innerHTML =
    `<strong>${{ species: 'Species', checklists: 'Checklists', observations: 'Observations', individuals: 'Count', locations: 'Locations' }[metric]}</strong><div class="continuous-map-ramp" style="background:${maximum > 1 ? `linear-gradient(to right, ${mapPalette.join(',')})` : maximum ? mapPalette.at(-1) : '#87939b'}"></div><div class="continuous-map-ticks">${ticks.map((value) => `<span style="left:${maximum <= 1 ? 100 : ((Math.log(value + 1) - Math.log(2)) / (Math.log(maximum + 1) - Math.log(2))) * 100}%" title="${format(value)}">${format(value)}</span>`).join('')}</div>`;
}

function updateMapMetric() {
  highlightLocation();
  document.querySelectorAll('[data-metric]').forEach((button) => {
    const selected = button.dataset.metric === metric;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  const radius = ['interpolate', ['linear'], ['ln', ['+', ['get', metric], 1]], 0, 9, 9, 30];
  const count = ['get', metric];
  const label =
    metric === 'observations'
      ? ['get', 'observationLabel']
      : metric === 'individuals'
        ? ['get', 'individualsLabel']
        : ['to-string', count];
  const maximum = (selectionColorScales || colorScales).maxima[clustering][metric];
  const colors = mapMetricColor(count, clustering, selectionColorScales || colorScales, metric);
  updateMapLegend(metric);
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
    map.setPaintProperty(layer, 'circle-stroke-color', [
      'case',
      ['==', ['get', 'highSeas'], true],
      '#087db5',
      '#ffffff',
    ]);
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
  map.setPaintProperty('map-labels', 'text-color', [
    'case',
    ['==', count, 0],
    '#102a36',
    ['>=', count, Math.exp(Math.log(2) + (Math.log(Math.max(1, maximum) + 1) - Math.log(2)) * 0.6) - 1],
    '#102a36',
    '#ffffff',
  ]);
  map.setLayoutProperty('map-labels', 'text-allow-overlap', clustering !== 'off');
  map.setLayerZoomRange('map-labels', clustering === 'off' ? 8 : 0, 24);
  map.setLayoutProperty('map-labels', 'text-field', label);
  for (const layer of ['point-outlines', 'clusters', 'locations', 'map-labels'])
    map.setLayoutProperty(layer, 'visibility', clustering === 'region' ? 'none' : 'visible');
  map.setLayoutProperty('region-markers', 'visibility', clustering === 'region' ? 'visible' : 'none');
  if (clustering === 'region') {
    updateRegionMarkers(
      map,
      mapPoints.filter((point) => point.properties.highSeas),
      metric,
      maximum,
    );
    map.setLayoutProperty('region-markers', 'symbol-sort-key', count);
  }
  // Keep the single hovered marker identical to the markers beneath it.
  for (const layer of map
    .getStyle()
    .layers.filter((layer) => ['locations', 'map-labels', 'region-markers'].includes(layer.id))) {
    for (const [key, value] of Object.entries(layer.paint || {})) map.setPaintProperty(`hover-${layer.id}`, key, value);
    for (const [key, value] of Object.entries(layer.layout || {}))
      map.setLayoutProperty(`hover-${layer.id}`, key, value);
    map.setLayerZoomRange(`hover-${layer.id}`, layer.minzoom || 0, layer.maxzoom || 24);
  }
  map.setLayoutProperty('hover-map-labels', 'text-allow-overlap', true);
  map.setLayoutProperty('hover-map-labels', 'text-ignore-placement', true);
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
  $('#data-button').disabled = dataBusy || Boolean(replay);
  $('#choose-export').disabled = dataBusy;
  $('#explore-demo').disabled = dataBusy;
  $('#drive-backups').hidden = !driveClientId;
  const personal = dataset?.kind === 'import';
  $('#data-state').textContent = personal
    ? locallySaved
      ? ''
      : 'Session only · not saved'
    : dataset?.kind === 'synthetic'
      ? 'Demo · sample observations'
      : 'No data loaded';
  $('#data-state').hidden = personal && locallySaved;
  $('#data-state').classList.toggle('is-demo', dataset?.kind === 'synthetic');
  $('#current-data').hidden = !personal;
  $('#current-data-name').textContent = dataset?.label || '';
  $('#current-data-detail').textContent =
    `${format(records.length)} observation${records.length === 1 ? '' : 's'}${locallySaved ? '' : ' · Session only'}`;
  $('#data-title').textContent = personal ? 'My data' : 'Your birding, mapped.';
  $('#close-data').hidden = !records.length;
  $('#data-footer').hidden = personal;
  $('#demo-invitation').hidden = personal;
  $('#backup-status').textContent = dataset?.driveSavedAt
    ? `Last backup: ${new Date(dataset.driveSavedAt).toLocaleString()}`
    : personal
      ? 'Save a copy to use on another device.'
      : '';
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
      trackEvent('drive_backup_save_success');
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
  highlightLocation();
  const locationGrouping = ['country', 'region'].includes(grouping) ? grouping : 'locationId';
  const locationLabel = { country: 'Country', region: 'Region', locationId: 'Location' }[locationGrouping];
  const locationPlural = { country: 'Countries', region: 'Regions', locationId: 'Locations' }[locationGrouping];
  $('#search').placeholder = tab === 'species' ? 'Search species' : `Search ${locationPlural.toLowerCase()}`;
  $('#search').setAttribute('aria-label', $('#search').placeholder);
  const query = $('#search')
    .value.trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const cacheKey = `${tab}/${locationGrouping}`;
  if (!resultGroups.has(cacheKey)) {
    const groups = new Map();
    for (const record of tab === 'species' ? speciesRecords : filtered) {
      if (tab === 'species' && record.count === 0) continue;
      if (tab === 'locations' && locationGrouping === 'region' && !record.region.split('-')[1]) continue;
      const key = tab === 'species' ? record.species || record.code : record[locationGrouping];
      if (!groups.has(key))
        groups.set(key, {
          ...record,
          location:
            tab === 'species' || locationGrouping === 'locationId'
              ? record.location
              : locationGrouping === 'country'
                ? countryNames.of(key)
                : regionNames[key] || key,
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
    resultGroups.set(cacheKey, [...groups.entries()]);
  }
  const results = resultGroups.get(cacheKey).filter(([, record]) =>
    (tab === 'species'
      ? `${record.name} ${record.scientific}`
      : `${record.location} ${record.region} ${countryNames.of(record.country)} ${record.checklist} ${record.date}`
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
    [
      'name',
      tab === 'species' ? 'Species' : locationLabel,
      tab === 'species' ? 'Taxonomic order' : `${locationLabel} name`,
    ],
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
      return `<tr data-key="${escapeHtml(key)}" class="${tab === 'species' && selectedCodes.has(key) ? 'selected ' : ''}${tab === 'species' && !record.speciesIds.size ? 'additional-taxon' : ''}">${tab === 'species' ? `<td class="species-number">${record.speciesIds.size ? format(++speciesNumber) : ''}</td>` : ''}<td><button class="table-name"${tab === 'species' ? ` aria-pressed="${selectedCodes.has(key)}"` : ''} data-key="${escapeHtml(key)}" ${tab === 'locations' ? `title="${escapeHtml(record.location)}"` : ''}><span class="species-label">${escapeHtml(tab === 'species' ? record.name : record.location)}</span>${statusTags}</button></td>${tab === 'locations' ? `<td>${format(record.speciesIds.size)}</td><td>${format(record.checklists.size)}</td>` : ''}<td>${format(record.observations)}</td><td>${record.individuals === 0 && record.observations > 0 ? 'X' : format(record.individuals)}</td></tr>`;
    })
    .join('');
  $('#results').innerHTML =
    `<table class="results-table"><caption class="visually-hidden">${tab === 'species' ? 'Species' : locationPlural} in the selected area. Click column headings to sort.</caption><thead><tr>${tab === 'species' ? '<th scope="col" class="species-number" title="Species number">#</th>' : ''}${head}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + (tab === 'species' ? 1 : 0)}" class="empty">No results in this selection.</td></tr>`}</tbody></table>${results.length > visibleRows ? `<button class="show-more" data-more>Show more (${format(visibleRows)} of ${format(results.length)})</button>` : ''}`;
  $('#list-label').textContent =
    `${format(results.length)} ${tab === 'species' ? 'TAXA' : locationGrouping === 'locationId' ? 'PLACES' : locationPlural.toUpperCase()} IN THIS AREA`;
}

function refresh(updateSource = true) {
  if (replay) return;
  resultGroups.clear();
  scheduleUrlUpdate();
  const selectionKey = JSON.stringify([...selectedCodes].sort());
  if (selectionKey !== colorSelectionKey) {
    selectionColorScales = selectedCodes.size ? datasetMapScales(records, selectedCodes) : null;
    colorSelectionKey = selectionKey;
    updateMapMetric();
  }
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
  $('#replay-start').hidden = !['off', 'country', 'region'].includes(grouping);
  $('#replay-start').disabled = !mapRecords.length || !map?.getSource('observations') || drawing;
  const totals = summarize(filtered);
  for (const [id, key] of [
    ['species', 'species'],
    ['checklists', 'checklists'],
    ['observations', 'observations'],
    ['individuals', 'individuals'],
    ['places', 'locations'],
  ]) {
    $(`#${id}-count`).textContent =
      key === 'individuals' ? formatMapCount(totals[key], totals.observations) : format(totals[key]);
    $(`#${id}-count`).title =
      key === 'individuals' && totals.individuals === 0 && totals.observations > 0
        ? 'X: present without a numeric count'
        : format(totals[key]);
  }
  $('#species-selection').hidden = !selectedCodes.size;
  if (selectedCodes.size === 1) {
    const code = [...selectedCodes][0],
      record = records.find((record) => record.code === code || record.species === code);
    $('#species-selection-label').textContent = `Selected: ${record?.speciesName || record?.name || code}`;
  } else $('#species-selection-label').textContent = `${format(selectedCodes.size)} taxa selected`;
  renderResults();
  updateMap(updateSource);
}

function loadCountryBoundaries() {
  if (countryBoundaryRequest) return countryBoundaryRequest;
  return (countryBoundaryRequest = fetch(new URL('./assets/countries-v1.json', import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error('Country boundary download failed');
      return response.json();
    })
    .then((data) => {
      countryBoundaries = new Map(data.features.map((feature) => [feature.properties.code, feature]));
      renderedKey = null;
      updateMap(false);
    })
    .catch(() => toast('Country boundaries could not load. Showing country circles instead.')));
}

function loadRegionBoundaries(points) {
  const countries = [...new Set(points.map((point) => point.properties.id.split('-')[0]))];
  for (const country of countries) {
    const url = regionBoundaryFiles[`./assets/regions-v1/${country}.json`];
    if (!url || regionBoundaryRequests.has(country)) continue;
    regionBoundaryRequests.set(
      country,
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error('Region boundary download failed');
          return response.json();
        })
        .then((data) => {
          for (const feature of data.features) regionBoundaries.set(feature.properties.code, feature);
          if (!regionBoundaryFrame)
            regionBoundaryFrame = requestAnimationFrame(() => {
              regionBoundaryFrame = null;
              renderedKey = null;
              updateMap(false);
            });
        })
        .catch(() => toast(`Region boundaries for ${countryNames.of(country)} could not load. Reload to try again.`)),
    );
  }
  return Promise.all(countries.map((country) => regionBoundaryRequests.get(country)));
}

function updateMap(rebuild = true) {
  if (replay) return;
  if (rebuild) {
    mapGroups.clear();
    renderedKey = null;
  }
  const source = map?.getSource('observations');
  if (!source) return;
  const key = ['country', 'region'].includes(clustering) ? clustering : 'locations';
  if (!mapGroups.has(key)) mapGroups.set(key, { points: groupMapDisplayRecords(mapRecords, clustering) });
  const group = mapGroups.get(key);
  mapPoints = group.points;
  if (clustering === 'auto' && !group.index) group.index = indexMapLocations(mapPoints);
  clusterIndex = clustering === 'auto' ? group.index : null;
  const nextKey = `${clustering}/${clusterIndex ? Math.floor(map.getZoom()) : ''}`;
  if (source === renderedSource && nextKey === renderedKey) return;
  const features = clusterIndex ? clusteredMapFeatures(clusterIndex, map.getZoom()) : mapPoints;
  if (clustering === 'country' && !countryBoundaries) loadCountryBoundaries();
  if (clustering === 'region') loadRegionBoundaries(features);
  const boundaries = clustering === 'country' ? countryBoundaries : clustering === 'region' ? regionBoundaries : null;
  const areas = boundaries
    ? boundaryMapFeatures(features, boundaries)
    : { polygons: [], circles: renderMapFeatures(features), labels: [] };
  if (clustering === 'region')
    updateRegionMarkers(
      map,
      areas.circles.filter((point) => point.properties.highSeas),
      metric,
      (selectionColorScales || colorScales).maxima.region[metric],
    );
  map.setFilter(
    'clusters',
    clustering === 'country'
      ? ['all', ['has', 'point_count'], ['==', ['get', 'grouping'], 'country']]
      : ['has', 'point_count'],
  );
  map.setFilter(
    'locations',
    clustering === 'country'
      ? [
          'all',
          ['!', ['has', 'point_count']],
          ['any', ['==', ['get', 'grouping'], 'country'], ['==', ['get', 'highSeas'], true]],
        ]
      : ['!', ['has', 'point_count']],
  );
  source.setData({ type: 'FeatureCollection', features: areas.circles });
  map.getSource('countries').setData({ type: 'FeatureCollection', features: areas.polygons });
  map.getSource('country-labels').setData({ type: 'FeatureCollection', features: areas.labels });
  highlightLocation();
  locationHighlights = indexLocationHighlights([...areas.circles, ...areas.polygons], clusterIndex);
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
  map.addSource('countries', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: `<a href="${window.location.origin}${import.meta.env.BASE_URL}boundary-sources.html" target="_blank">Boundary sources: Natural Earth / geoBoundaries &amp; contributors</a>`,
  });
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
    id: 'region-markers',
    type: 'symbol',
    source: 'observations',
    filter: ['==', ['get', 'highSeas'], true],
    layout: {
      visibility: 'none',
      'icon-image': ['concat', 'region:', ['get', 'id']],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
      'symbol-z-order': 'source',
      'symbol-sort-key': ['get', metric],
    },
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
  map.addSource('location-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const [suffix, color, width] of [
    ['halo', '#ffffff', 6],
    ['ring', '#0879b0', 2.5],
  ]) {
    map.addLayer({
      id: `location-highlight-${suffix}`,
      type: 'circle',
      source: 'location-highlight',
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0,
          ['get', 'highlightRadius'],
          7,
          ['get', 'highlightRadius7'],
          12,
          ['get', 'highlightRadius12'],
        ],
        'circle-opacity': 0,
        'circle-stroke-color': color,
        'circle-stroke-width': width,
        'circle-radius-transition': { duration: 0 },
      },
    });
    map.addLayer({
      id: `country-highlight-${suffix}`,
      type: 'line',
      source: 'location-highlight',
      filter: ['==', '$type', 'Polygon'],
      paint: { 'line-color': color, 'line-width': width },
    });
  }
  // Draw the hovered marker and its label above every observation layer.
  for (const layer of map
    .getStyle()
    .layers.filter((layer) => ['locations', 'map-labels', 'region-markers'].includes(layer.id)))
    map.addLayer({
      ...layer,
      id: `hover-${layer.id}`,
      source: 'location-highlight',
      filter:
        layer.id === 'region-markers'
          ? ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'highSeas'], true]]
          : ['==', '$type', 'Point'],
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
  $('#replay-start').disabled = true;
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
  return map
    .queryRenderedFeatures(point, { layers: ['region-markers', 'locations', 'clusters', 'country-fill'] })
    .filter(
      (feature) =>
        feature.layer.id !== 'region-markers' ||
        map.project(feature.geometry.coordinates).dist(point) <= regionMarkerRadius(feature.properties[metric]) + 3,
    );
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
    if (replay) return;
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
    if (replay) return;
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
      const name =
        p.grouping === 'country'
          ? countryNames.of(p.id)
          : p.grouping === 'region'
            ? regionNames[p.id] || p.name
            : p.name;
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
        ['individuals', 'Count', 'species'],
      ]
        .map(([key, label, icon]) => {
          const linked = links[key];
          const tag = linked ? 'a' : 'div';
          const attributes = linked
            ? ` href="${escapeHtml(linked)}" target="_blank" rel="noopener" title="View your ${label.toLowerCase()} on eBird"`
            : '';
          return `<${tag} class="popup-stat"${attributes}><span class="stat-value"><svg class="metric-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#Icon--${icon}"/></svg><span>${key === 'individuals' && p.individuals === 0 && p.observations > 0 ? 'X' : format(p[key])}</span></span><span class="metric-label">${label}</span></${tag}>`;
        })
        .join('');
      const title =
        p.grouping === 'country' || p.grouping === 'region' || dataset.kind !== 'synthetic'
          ? `<a href="https://ebird.org/${p.grouping === 'country' || p.grouping === 'region' ? 'region' : 'hotspot'}/${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="View ${p.grouping === 'country' || p.grouping === 'region' ? p.grouping : 'location'} on eBird">${escapeHtml(name)}</a>`
          : escapeHtml(name);
      const boundary =
        p.grouping === 'country'
          ? countryBoundaries?.get(p.id)
          : p.grouping === 'region'
            ? regionBoundaries.get(p.id)
            : null;
      const polygonBounds = boundary ? new mapboxgl.LngLatBounds(geometryBounds(boundary.geometry)) : null;
      locationPopup = new mapboxgl.Popup({ maxWidth: '340px' })
        .setLngLat(
          polygonBounds
            ? polygonBounds.getCenter()
            : feature.geometry.type === 'Point'
              ? feature.geometry.coordinates
              : event.lngLat,
        )
        .setHTML(
          `<section class="location-popup"><h3>${title}</h3><div class="popup-stats">${stats}</div>${p.approximate ? `<p class="popup-note">Illustrative area: ${p.boundaryMethod === 'eBird bounding box' ? 'eBird bounding box, not a land or reef outline' : 'country land divided by nearest region centre; not an administrative boundary'}. Counts follow your eBird region code.</p>` : ''}${p.highSeas ? '<p class="popup-note">All High Seas observations in this selection, shown at one representative observation site. No maritime boundary is implied.</p>' : ''}${dataset.kind === 'synthetic' ? '<p class="popup-note">Demonstration data</p>' : ''}</section>`,
        )
        .addTo(map);
      if (!p.highSeas && (p.grouping === 'country' || p.grouping === 'region')) {
        const bounds = polygonBounds || new mapboxgl.LngLatBounds();
        if (!polygonBounds) for (const record of rows) bounds.extend([record.longitude, record.latitude]);
        map.fitBounds(bounds, { padding: 50, maxZoom: 12, retainPadding: false });
      } else if (!p.highSeas) map.flyTo({ center: feature.geometry.coordinates, zoom: Math.max(15, map.getZoom()) });
    }
  });
  map.on('dblclick', (event) => {
    if (drawing) {
      event.preventDefault();
      finishPolygon();
    }
  });
  map.on('mousemove', (event) => {
    if (replay || !map.getLayer('locations')) return;
    const feature = drawing ? null : mapFeaturesAt(event.point)[0];
    map.getCanvas().style.cursor = drawing ? 'crosshair' : feature ? 'pointer' : '';
    highlightLocation(feature ? feature.properties.id || `cluster:${feature.properties.cluster_id}` : '');
  });
  map.getCanvas().addEventListener('mouseleave', () => highlightLocation());
}

async function enterReplay(resume) {
  if (dataBusy || !['off', 'country', 'region'].includes(grouping)) return;
  map.getCanvas().style.cursor = '';
  locationPopup?.remove();
  hideSpeciesTooltip();
  highlightLocation();
  if (!resume?.settingsOpen) $('#settings-dialog').hidePopover();
  // Replay ignores the viewport while retaining explicit species, date and area selections.
  const replayGrouping = ['country', 'region'].includes(grouping) ? grouping : 'off';
  let data;
  if (replayGrouping === 'off') data = buildReplay(mapRecords);
  else {
    beginOperation(
      'Preparing replay',
      `Loading ${replayGrouping === 'country' ? 'country' : 'region'} boundaries and daily totals…`,
    );
    $('#replay-start').disabled = true;
    try {
      await new Promise(requestAnimationFrame);
      data = buildReplay(mapRecords, replayGrouping);
      if (replayGrouping === 'country') await loadCountryBoundaries();
      else await loadRegionBoundaries(data.areaPoints);
      for (const point of data.areaPoints)
        point.properties.name = point.properties.highSeas
          ? 'High Seas'
          : replayGrouping === 'country'
            ? countryNames.of(point.properties.id)
            : regionNames[point.properties.id] || point.properties.name;
      data.geometry = boundaryMapFeatures(
        data.areaPoints,
        (replayGrouping === 'country' ? countryBoundaries : regionBoundaries) || new Map(),
      );
      // Fallback circles also need labels when a boundary is unavailable.
      data.geometry.labels.push(...data.geometry.circles);
      for (const features of Object.values(data.geometry))
        for (const feature of features) feature.id = feature.properties.id;
    } catch (error) {
      toast(`Replay could not start: ${error.message}`, true);
      return;
    } finally {
      finishOperation();
      $('#replay-start').disabled = !mapRecords.length;
    }
  }
  if (!data.days.length) {
    if (resume) toast('No observations match these filters. Replay stopped.');
    return;
  }
  replayLayerVisibility = new Map(
    map
      .getStyle()
      .layers.filter((layer) =>
        ['observations', 'countries', 'country-labels', 'location-highlight', 'selection'].includes(layer.source),
      )
      .map((layer) => [layer.id, layer.layout?.visibility || 'visible']),
  );
  for (const [id] of replayLayerVisibility) map.setLayoutProperty(id, 'visibility', 'none');
  document.body.classList.add('replaying');
  $('.sidebar').inert = true;
  $('#clustering').disabled = true;
  $('#clustering').value = replayGrouping;
  $('#replay-view').value = replayGrouping;
  $('#map-legend').hidden = false;
  $('#clear-species-selection').disabled = false;
  $('#replay-start').setAttribute('aria-pressed', 'true');
  $('#data-button').disabled = true;
  $('#replay-controls').hidden = false;
  data.scales = selectionColorScales || colorScales;
  replay = createReplay(map, data, resume?.metric || metric, updateMapLegend, resume);
  map.stop();
  map.resize();
  const bounds = new mapboxgl.LngLatBounds();
  for (const point of data.points) bounds.extend(point.geometry.coordinates);
  for (const feature of data.geometry?.polygons || []) {
    const rings =
      feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    for (const ring of rings) for (const coordinate of ring) bounds.extend(coordinate);
  }
  const height = map.getContainer().clientHeight;
  map.fitBounds(bounds, {
    padding: { top: Math.min(100, height * 0.2), bottom: Math.min(230, height * 0.4), left: 45, right: 45 },
    maxZoom: 12,
    duration: 0,
    retainPadding: false,
  });
  if (resume?.settingsOpen) $('#settings-dialog').showPopover();
  else $('#replay-toggle').focus();
}

function exitReplay(focus = true) {
  replay.destroy();
  replay = null;
  for (const [id, visibility] of replayLayerVisibility) map.setLayoutProperty(id, 'visibility', visibility);
  replayLayerVisibility = null;
  document.body.classList.remove('replaying');
  $('.sidebar').inert = false;
  $('#clustering').disabled = false;
  $('#clustering').value = grouping;
  $('#clear-species-selection').disabled = false;
  $('#replay-start').setAttribute('aria-pressed', 'false');
  for (const button of document.querySelectorAll('[data-metric], #settings-button')) button.disabled = false;
  $('#replay-controls').hidden = true;
  $('#map-legend').hidden = false;
  map.resize();
  updateDataActions();
  updateMapMetric();
  refresh(false);
  savePreferences();
  if (focus) $('#replay-start').focus();
  if (themeMode === 'system') {
    const systemTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'atlas';
    if (theme !== systemTheme) {
      theme = systemTheme;
      document.body.classList.toggle('night', theme === 'night');
      changeMapStyle();
    }
  }
}
$('#replay-start').onclick = () => (replay ? exitReplay() : enterReplay());
$('#replay-exit').onclick = () => exitReplay();
$('#replay-view').onchange = async () => {
  const state = replay.snapshot();
  const view = $('#replay-view').value;
  exitReplay(false);
  grouping = clustering = view;
  $('#clustering').value = view;
  savePreferences();
  refresh();
  await enterReplay(state);
};

function resetSelection(keepView = false) {
  if (keepView) {
    refresh();
    return;
  }
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

$('#results').onpointerover = (event) => {
  showSpeciesTooltip(event);
  if (tab === 'locations') highlightLocation(event.target.closest('tr[data-key]')?.dataset.key);
};
$('#results').addEventListener('focusin', (event) => {
  showSpeciesTooltip(event);
  if (tab === 'locations') highlightLocation(event.target.closest('tr[data-key]')?.dataset.key);
});
$('#results').onpointerout = (event) => {
  if (speciesTooltipTarget && !speciesTooltipTarget.contains(event.relatedTarget)) hideSpeciesTooltip();
  if (!event.target.closest('tr[data-key]')?.contains(event.relatedTarget)) highlightLocation();
};
$('#results').addEventListener('focusout', () => {
  hideSpeciesTooltip();
  highlightLocation();
});
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
    if (selectedCodes.size && metric === 'species') {
      metric = 'individuals';
      savePreferences();
    }
    refresh();
  } else {
    $('.sidebar').classList.remove('open');
    if (map && ['country', 'region'].includes(grouping)) {
      const boundary =
        grouping === 'country' ? countryBoundaries?.get(button.dataset.key) : regionBoundaries.get(button.dataset.key);
      const bounds = boundary
        ? new mapboxgl.LngLatBounds(geometryBounds(boundary.geometry))
        : new mapboxgl.LngLatBounds();
      for (const row of boundary ? [] : filtered)
        if (row[grouping] === button.dataset.key) bounds.extend([row.longitude, row.latitude]);
      map.fitBounds(bounds, { padding: 50, maxZoom: 12, retainPadding: false });
    } else map?.flyTo({ center: [record.longitude, record.latitude], zoom: 15, essential: false });
  }
};
$('#clear-species-selection').onclick = async () => {
  const state = replay?.snapshot();
  if (state) exitReplay(false);
  selectedCodes.clear();
  selectionAnchor = '';
  refresh();
  if (state) await enterReplay({ ...state, position: 0 });
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
  if (replay) {
    if (event.key === 'Escape' && !$('#settings-dialog').matches(':popover-open')) exitReplay();
    return;
  }
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
  $('#replay-start').hidden = !['off', 'country', 'region'].includes(grouping);
  clustering = grouping === 'polygon' ? 'off' : grouping;
  polygon = null;
  endDrawing();
  locationPopup?.remove();
  if (grouping === 'polygon') startPolygon();
  savePreferences();
  if (hadArea) refresh();
  else {
    updateMap(false);
    renderResults();
  }
  updateMapMetric();
};
$('#close-settings').onclick = () => $('#settings-dialog').hidePopover();
$('#settings-form').onsubmit = (event) => {
  event.preventDefault();
  $('#settings-dialog').hidePopover();
};
$('#settings-form').onchange = async (event) => {
  if (event.target.id.startsWith('date-')) {
    const from = $('#date-from-year').value,
      to = $('#date-to-year').value;
    $('#date-to-year').setCustomValidity(from && to && from > to ? 'Choose a To year on or after From.' : '');
    if (!$('#date-to-year').reportValidity()) return;
    yearFrom = from;
    yearTo = to;
    monthFrom = $('#date-from-month').value;
    monthTo = $('#date-to-month').value;
  }

  const state = replay?.snapshot();
  if (state) exitReplay(false);
  themeMode = $('input[name="theme"]:checked').value;
  theme = themeMode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'atlas') : themeMode;
  projection = $('#projection').value;
  mapStyle = $('#background').value;
  document.body.classList.toggle('night', theme === 'night');
  savePreferences();
  let styleReady;
  if (event.target.id === 'projection') map?.setProjection(projection);
  else if (event.target.name === 'theme' || event.target.id === 'background') {
    if (state && map) styleReady = new Promise((resolve) => map.once('style.load', resolve));
    changeMapStyle();
  } else refresh();
  if (state) {
    await styleReady;
    await enterReplay({
      ...state,
      position: event.target.id.startsWith('date-') || event.target.id === 'additional' ? 0 : state.position,
      settingsOpen: true,
    });
  }
};
document.querySelectorAll('[data-metric]').forEach(
  (button) =>
    (button.onclick = () => {
      if (replay) {
        replay.setMetric(button.dataset.metric);
        return;
      }
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
      const keepView = !records.length;
      dataset = data.metadata;
      records = data.records;
      colorScales = datasetMapScales(records);
      colorSelectionKey = null;
      activeSource = data.source;
      locallySaved = data.saved;
      trackEvent(options.origin === 'drive' ? 'drive_backup_load_success' : 'csv_import_success', {
        file_type: file.name.toLowerCase().endsWith('.zip') ? 'zip' : 'csv',
      });
      setDateBounds();
      searchText.species = '';
      searchText.locations = '';
      $('#search').value = '';
      resetSelection(keepView);
      toast(
        data.saved
          ? `${format(records.length)} rows loaded.`
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
$('#counting-taxonomy-version').textContent = taxonomyMetadata.version;
$('#counting-help').onclick = () => $('#counting-dialog').showModal();
$('#close-counting').onclick = () => $('#counting-dialog').close();
$('#data-button').onclick = () => $('#data-dialog').showModal();
$('#demo-import').onclick = () => $('#data-dialog').showModal();
$('#choose-export').onclick = () => $('#file-input').click();
$('#close-data').onclick = () => $('#data-dialog').close();
$('#data-dialog').oncancel = (event) => {
  if (!records.length) event.preventDefault();
};
$('#explore-demo').onclick = async () => {
  const keepView = !records.length;
  dataset = await (await import('./demo.js')).default();
  records = dataset.records;
  colorScales = datasetMapScales(records);
  colorSelectionKey = null;
  delete dataset.records;
  setDateBounds();
  resetSelection(keepView);
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
  if (themeMode !== 'system' || replay) return;
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
colorScales = datasetMapScales(records);
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
initializeAnalyticsChoice();
if (!stored) $('#data-dialog').showModal();
