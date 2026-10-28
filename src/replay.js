import { formatMapCount, groupMapDisplayRecords, renderMapFeatures, geometryBounds } from './map-data.js';
import { mapMetricColor } from './map-colors.js';
import { createAreaReplay } from './replay-areas.js';

const $ = (selector) => document.querySelector(selector);
const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (date) => dateFormat.format(new Date(`${date}T00:00:00Z`));

// Summarize each date once; only compact daily totals and location visits survive preparation.
export function buildReplay(records, grouping = 'off', includeGroups = true) {
  const checklists = new Set(),
    locations = new Map(),
    dates = new Map();
  for (const record of records) {
    if (!locations.has(record.locationId))
      locations.set(record.locationId, {
        type: 'Feature',
        id: locations.size,
        geometry: { type: 'Point', coordinates: [record.longitude, record.latitude] },
        properties: { name: record.location, locationId: record.locationId },
      });
    if (!dates.has(record.date))
      dates.set(record.date, {
        date: record.date,
        locations: new Set(),
        species: new Set(),
        count: 0,
        observations: 0,
        individuals: 0,
      });
    const day = dates.get(record.date);
    day.locations.add(locations.get(record.locationId).id);
    if (!checklists.has(record.checklist)) {
      day.count++;
      checklists.add(record.checklist);
    }
    if (record.count === 0) continue;
    day.observations++;
    day.individuals += record.count ?? 0;
    if (record.species && record.exotic !== 'X') day.species.add(record.species);
  }
  const species = new Set(),
    visited = new Set();
  const totals = { species: 0, checklists: 0, observations: 0, individuals: 0, locations: 0 };
  let position = 0,
    previousTimestamp;
  const days = [...dates.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day, i) => {
      const added = {
        species: 0,
        checklists: day.count,
        observations: day.observations,
        individuals: day.individuals,
        locations: 0,
      };
      for (const id of day.species)
        if (!species.has(id)) {
          species.add(id);
          added.species++;
        }
      for (const id of day.locations)
        if (!visited.has(id)) {
          visited.add(id);
          added.locations++;
        }
      for (const key of Object.keys(totals)) totals[key] += added[key];
      const timestamp = Date.parse(day.date);
      if (i) position += Math.min(7, (timestamp - previousTimestamp) / 86400000);
      previousTimestamp = timestamp;
      return {
        date: day.date,
        timestamp,
        at: position,
        added,
        totals: { ...totals },
        locations: [...day.locations],
      };
    });
  const span = Math.min(90000, Math.max(6000, days.length * 500));
  for (const day of days) day.at = position ? (day.at / position) * span : 0;
  const replay = { days, points: [...locations.values()], duration: (position ? span : 0) + 1500, grouping };
  if (includeGroups) {
    if (grouping !== 'off') replay.areaPoints = renderMapFeatures(groupMapDisplayRecords(records, grouping));
    const groups = new Map(
      grouping === 'off'
        ? replay.points.map((point) => [point.id, []])
        : replay.areaPoints.map((point) => [point.properties.id, []]),
    );
    for (const record of records) {
      const key =
        grouping === 'off' ? locations.get(record.locationId).id : record.country === 'XX' ? 'XX' : record[grouping];
      if (groups.has(key)) groups.get(key).push(record);
    }
    const byDate = new Map(
      days.map((day) => {
        day.areas = [];
        return [day.date, day];
      }),
    );
    for (const [id, rows] of groups) {
      for (const day of buildReplay(rows, 'off', false).days)
        byDate.get(day.date).areas.push({ id, totals: day.totals });
    }
  }
  return replay;
}

export function replayTimeline(days, binCount = 96, metric = 'checklists') {
  const start = days[0].timestamp,
    end = Math.max(start + 86400000, days.at(-1).timestamp);
  const bins = Array(binCount).fill(0);
  for (const day of days)
    bins[Math.min(binCount - 1, Math.floor(((day.timestamp - start) / (end - start)) * binCount))] += day.added[metric];
  const firstYear = Number(days[0].date.slice(0, 4)),
    lastYear = Number(days.at(-1).date.slice(0, 4));
  const step = Math.max(1, Math.ceil((lastYear - firstYear) / 6));
  const years = [{ year: firstYear, position: 0 }];
  for (let year = firstYear + step; year <= lastYear; year += step)
    years.push({ year, position: (Date.UTC(year, 0, 1) - start) / (end - start) });
  return { start, end, bins, years };
}

export function replayPositionAt(data, timestamp) {
  if (data.days.length === 1)
    return Math.min(1, Math.max(0, (timestamp - data.days[0].timestamp) / 86400000)) * data.duration;
  const next = data.days.findIndex((day) => day.timestamp > timestamp);
  if (next === -1) return data.duration;
  if (next === 0) return 0;
  const before = data.days[next - 1],
    after = data.days[next];
  return before.at + ((timestamp - before.timestamp) / (after.timestamp - before.timestamp)) * (after.at - before.at);
}

export function replayStateAt(days, position) {
  const visits = new Map();
  let index = 0;
  while (index < days.length && days[index].at <= position) {
    for (const id of days[index].locations) visits.set(id, { seen: true, at: days[index].at, date: days[index].date });
    index++;
  }
  return { visits, index };
}

// Keep zoom at the top level, as required by Mapbox, while adding a visit pulse at each zoom stop.
export function replayLocationRadius(metric, pulse = 0) {
  const countRadius = [
    'interpolate',
    ['linear'],
    ['ln', ['+', ['coalesce', ['feature-state', metric], 0], 1]],
    0,
    9,
    9,
    30,
  ];
  return ['interpolate', ['linear'], ['zoom'], 0, ['+', 4, pulse], 7, ['+', 6, pulse], 12, ['+', countRadius, pulse]];
}

// Only replay styling advances on frames; the normal app's filters and tables stay untouched.
export function createReplay(map, data, initialMetric = 'checklists', onMetricChange, resume) {
  let position = 0,
    index = 0,
    frame,
    seekFrame,
    lastFrame = 0,
    playing = false,
    popup,
    displayedDay,
    metric = initialMetric;
  const metricLabels = {
    species: 'New species',
    checklists: 'Checklists',
    observations: 'Observations',
    individuals: 'Numeric bird counts (X excluded)',
    locations: 'New locations',
  };
  const palette = getComputedStyle(document.body);
  const history = palette.getPropertyValue('--replay-history').trim();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const areas = data.geometry ? createAreaReplay(map, data, reducedMotion) : null;
  if (!areas) {
    map.addSource('replay', { type: 'geojson', data: { type: 'FeatureCollection', features: data.points } });
    map.addLayer({
      id: 'replay-dots',
      type: 'circle',
      source: 'replay',
      paint: {
        'circle-radius': 3,
        'circle-color': history,
        'circle-opacity': ['case', ['boolean', ['feature-state', 'seen'], false], 0.7, 0],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'seen'], false], 1, 0],
        'circle-stroke-opacity-transition': { duration: 0 },
        'circle-radius-transition': { duration: 0 },
        'circle-color-transition': { duration: 0 },
      },
    });
    map.addLayer({
      id: 'replay-rings',
      type: 'circle',
      source: 'replay',
      paint: {
        'circle-color': history,
        'circle-opacity': 0,
        'circle-stroke-color': history,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0,
        'circle-radius-transition': { duration: 0 },
        'circle-stroke-opacity-transition': { duration: 0 },
      },
    });
  }
  const timeline = replayTimeline(data.days);
  function renderActivity() {
    const { bins } = replayTimeline(data.days, 96, metric);
    const maximum = Math.max(...bins);
    const bars = bins
      .map((count, i) =>
        count
          ? `<rect x="${i * 10 + 1}" y="${64 - Math.max(3, (count / maximum) * 60)}" width="8" height="${Math.max(3, (count / maximum) * 60)}" rx="1.5"><title>${count.toLocaleString('en')} ${metricLabels[metric].toLowerCase()}</title></rect>`
          : '',
      )
      .join('');
    $('#replay-activity').setAttribute('aria-label', `${metricLabels[metric]} over time`);
    $('#replay-activity').innerHTML =
      `<g class="replay-bars-future">${bars}</g><g class="replay-bars-elapsed">${bars}</g>`;
  }
  $('#replay-years').innerHTML = timeline.years
    .map(({ year, position }) => `<span style="left:${position * 100}%">${year}</span>`)
    .join('');

  function paint() {
    if (areas) areas.paint(position);
    else {
      const age = ['-', position, ['coalesce', ['feature-state', 'at'], -100000]];
      const visible = ['all', ['boolean', ['feature-state', 'seen'], false], ['<', age, 1200]];
      const pulse = reducedMotion ? 0 : ['case', visible, ['interpolate', ['linear'], age, 0, 3, 1200, 0], 0];
      map.setPaintProperty('replay-dots', 'circle-radius', replayLocationRadius(metric, pulse));
      map.setPaintProperty('replay-dots', 'circle-opacity', [
        'case',
        ['boolean', ['feature-state', 'seen'], false],
        0.95,
        0,
      ]);
      if (!reducedMotion) {
        map.setPaintProperty(
          'replay-rings',
          'circle-radius',
          replayLocationRadius(metric, ['interpolate', ['linear'], age, 0, 3, 1200, 20]),
        );
        map.setPaintProperty('replay-rings', 'circle-stroke-opacity', [
          'case',
          visible,
          ['interpolate', ['linear'], age, 0, 0.85, 1200, 0],
          0,
        ]);
      }
    }
    const day = data.days[index - 1],
      next = data.days[index];
    const timestamp = next
      ? day.timestamp + ((position - day.at) / (next.at - day.at)) * (next.timestamp - day.timestamp)
      : day.timestamp;
    const progress =
      data.days.length === 1
        ? position / data.duration
        : (timestamp - timeline.start) / (timeline.end - timeline.start);
    $('#replay-slider').value = String(Math.round(progress * 10000));
    $('#replay-controls').style.setProperty('--progress', `${progress * 100}%`);
    const label = dateFormat.format(new Date(timestamp));
    $('#replay-date').textContent = label;
    $('#replay-slider').setAttribute('aria-valuetext', label);
    $('#replay-count').textContent =
      metric === 'individuals'
        ? formatMapCount(day.totals.individuals, day.totals.observations)
        : day.totals[metric].toLocaleString('en');
    $('#replay-count').title =
      metric === 'individuals' && day.totals.individuals === 0 && day.totals.observations > 0
        ? 'X: present without a numeric count'
        : day.totals[metric].toLocaleString('en');
    if (day !== displayedDay) {
      for (const [id, key] of [
        ['species', 'species'],
        ['checklists', 'checklists'],
        ['observations', 'observations'],
        ['individuals', 'individuals'],
        ['places', 'locations'],
      ]) {
        const count = document.querySelector(`#${id}-count`);
        count.textContent =
          key === 'individuals'
            ? formatMapCount(day.totals.individuals, day.totals.observations)
            : day.totals[key].toLocaleString('en');
        count.title =
          key === 'individuals' && day.totals.individuals === 0 && day.totals.observations > 0
            ? 'X: present without a numeric count'
            : day.totals[key].toLocaleString('en');
      }
      displayedDay = day;
    }
  }

  function advance() {
    while (index < data.days.length && data.days[index].at <= position) {
      const day = data.days[index++];
      if (areas) areas.update(day);
      else
        for (const event of day.areas)
          map.setFeatureState(
            { source: 'replay', id: event.id },
            { ...event.totals, seen: true, at: day.at, date: day.date },
          );
    }
    paint();
  }

  function pause() {
    areas?.settle(position);
    playing = false;
    cancelAnimationFrame(frame);
    $('#replay-toggle').innerHTML =
      `<i class="bi ${position >= data.duration ? 'bi-arrow-counterclockwise' : 'bi-play-fill'}" aria-hidden="true"></i>`;
    $('#replay-toggle').setAttribute('aria-label', position >= data.duration ? 'Restart replay' : 'Play replay');
    $('#replay-toggle').setAttribute('aria-pressed', 'false');
  }

  function seek(value) {
    popup?.remove();
    position = value;
    const state = replayStateAt(data.days, position);
    index = state.index;
    if (areas) areas.seek(index);
    else {
      map.removeFeatureState({ source: 'replay' });
      for (const day of data.days.slice(0, index))
        for (const event of day.areas)
          map.setFeatureState(
            { source: 'replay', id: event.id },
            { ...event.totals, seen: true, at: day.at, date: day.date },
          );
    }
    paint();
  }

  function tick(now) {
    if (!playing) return;
    if (now - lastFrame >= 33) {
      position = Math.min(data.duration, position + (now - lastFrame) * Number($('#replay-speed').value));
      lastFrame = now;
      advance();
      if (position >= data.duration) {
        pause();
        return;
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function play() {
    if (position >= data.duration) seek(0);
    popup?.remove();
    playing = true;
    lastFrame = performance.now();
    $('#replay-toggle').innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i>';
    $('#replay-toggle').setAttribute('aria-label', 'Pause replay');
    $('#replay-toggle').setAttribute('aria-pressed', 'true');
    frame = requestAnimationFrame(tick);
  }

  function inspect(event) {
    if (playing) return;
    const feature = areas
      ? areas.featureAt(event.point)
      : map
          .queryRenderedFeatures(event.point, { layers: ['replay-dots'] })
          .find((feature) => map.getFeatureState({ source: 'replay', id: feature.id }).seen);
    if (!feature) return;
    popup?.remove();
    const content = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = feature.properties.name;
    const detail = document.createElement('p');
    const state = map.getFeatureState({ source: areas ? 'replay-areas' : 'replay', id: feature.id });
    detail.textContent = `${document.querySelector(`[data-metric="${metric}"] .metric-label`).textContent}: ${metric === 'individuals' && state.individuals === 0 && state.observations > 0 ? 'X' : state[metric].toLocaleString('en')} · Last activity: ${dateLabel(state.date)}`;
    content.append(title, detail);
    if (feature.properties.approximate || feature.properties.highSeas) {
      const note = document.createElement('p');
      note.className = 'popup-note';
      note.textContent = feature.properties.highSeas
        ? 'High Seas observations, shown at a representative observation site.'
        : `Illustrative area (${feature.properties.boundaryMethod}). Counts follow the imported region code.`;
      content.append(note);
    }
    const polygon = data.geometry?.polygons.find((polygon) => polygon.id === feature.id);
    const bounds = polygon ? new mapboxgl.LngLatBounds(geometryBounds(polygon.geometry)) : null;
    if (bounds)
      map.fitBounds(bounds, {
        padding: { top: 50, bottom: 230, left: 45, right: 45 },
        maxZoom: 12,
        retainPadding: false,
      });
    popup = new mapboxgl.Popup({ maxWidth: '300px' })
      .setLngLat(bounds ? bounds.getCenter() : feature.geometry.coordinates)
      .setDOMContent(content)
      .addTo(map);
  }

  function visibilityChange() {
    if (document.hidden) pause();
  }
  map.on('click', inspect);
  document.addEventListener('visibilitychange', visibilityChange);
  $('#replay-toggle').onclick = () => (playing ? pause() : play());
  $('#replay-slider').oninput = () => {
    pause();
    cancelAnimationFrame(seekFrame);
    seekFrame = requestAnimationFrame(() => {
      seek(
        replayPositionAt(
          data,
          timeline.start + (Number($('#replay-slider').value) / 10000) * (timeline.end - timeline.start),
        ),
      );
      pause();
    });
  };
  function setMetric(value) {
    metric = value;
    for (const button of document.querySelectorAll('[data-metric]')) {
      const selected = button.dataset.metric === metric;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    $('#replay-count-label').textContent =
      `${document.querySelector(`[data-metric="${metric}"] .metric-label`).textContent.toLowerCase()} so far`;
    onMetricChange(value);
    if (areas) areas.setMetric(value);
    else {
      const color = mapMetricColor(['coalesce', ['feature-state', value], 0], 'off', data.scales, value);
      map.setPaintProperty('replay-dots', 'circle-color', color);
      map.setPaintProperty('replay-rings', 'circle-stroke-color', color);
    }
    renderActivity();
    paint();
  }
  $('#replay-speed').value = '1';
  advance();
  setMetric(initialMetric);
  if (resume) {
    seek(Math.min(resume.position, data.duration));
    $('#replay-speed').value = resume.speed;
    if (resume.playing && position < data.duration) play();
    else pause();
  } else if (reducedMotion) pause();
  else play();
  return {
    pause,
    setMetric,
    snapshot() {
      return { position, playing, metric, speed: $('#replay-speed').value };
    },
    destroy() {
      pause();
      cancelAnimationFrame(seekFrame);
      popup?.remove();
      map.off('click', inspect);
      document.removeEventListener('visibilitychange', visibilityChange);
      if (areas) areas.destroy();
      else {
        map.removeLayer('replay-rings');
        map.removeLayer('replay-dots');
        map.removeSource('replay');
      }
      $('#replay-toggle').onclick = null;
      $('#replay-slider').oninput = null;
    },
  };
}
