import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/model.js';
import { replayCounterValue } from '../src/replay-areas.js';
import { buildReplay, replayStateAt, replayTimeline, replayPositionAt, replayLocationRadius } from '../src/replay.js';

const records = [
  ['S3', 'L1', '2025-06-02'],
  ['S1', 'L1', '2025-06-01'],
  ['S1', 'L1', '2025-06-01'],
  ['S2', 'L2', '2025-06-01'],
  ['S4', 'L1', '2026-06-02'],
].map(([checklist, locationId, date]) => ({
  checklist,
  locationId,
  date,
  location: locationId,
  longitude: 6,
  latitude: 46,
}));

test('replay counts distinct checklists, groups same-day locations and compresses long gaps', () => {
  const replay = buildReplay(records);
  assert.equal(replay.points.length, 2);
  assert.deepEqual(
    replay.days.map((day) => [day.date, day.added.checklists, day.totals.checklists]),
    [
      ['2025-06-01', 2, 2],
      ['2025-06-02', 1, 3],
      ['2026-06-02', 1, 4],
    ],
  );
  assert.deepEqual(replay.days[0].locations, [0, 1]);
  assert.equal(replay.days[1].at, 750);
  assert.equal(replay.days[2].at, 6000);
  assert.equal(replay.duration, 7500);
});

test('scrubbing backward removes future visits and restores the earlier visit at repeated locations', () => {
  const { days } = buildReplay(records);
  const end = replayStateAt(days, 7500);
  assert.equal(end.index, 3);
  assert.equal(end.visits.get(0).date, '2026-06-02');
  const start = replayStateAt(days, 0);
  assert.equal(start.index, 1);
  assert.equal(start.visits.size, 2);
  assert.equal(start.visits.get(0).date, '2025-06-01');
  assert.equal(replayStateAt(days, 749).visits.get(0).at, 0);
  assert.equal(replayStateAt(days, 750).visits.get(0).at, 750);
});

test('single-day replay retains all simultaneous checklists and a finite settling interval', () => {
  const replay = buildReplay(records.filter((record) => record.date === '2025-06-01'));
  assert.equal(replay.days.length, 1);
  assert.equal(replay.days[0].at, 0);
  assert.equal(replay.days[0].totals.checklists, 2);
  assert.equal(replay.duration, 1500);
  assert.equal(replayStateAt(replay.days, replay.duration).visits.size, 2);
});

test('calendar histogram preserves checklist totals and positions year ticks by date', () => {
  const replay = buildReplay(records);
  const timeline = replayTimeline(replay.days, 12);
  assert.equal(
    timeline.bins.reduce((sum, count) => sum + count, 0),
    4,
  );
  assert.equal(timeline.bins[0], 3);
  assert.equal(timeline.bins[11], 1);
  assert.equal(timeline.years[0].year, 2025);
  assert.equal(timeline.years[0].position, 0);
  assert.equal(timeline.years[1].year, 2026);
  assert.equal(timeline.years[1].position, (Date.UTC(2026, 0, 1) - timeline.start) / (timeline.end - timeline.start));
});

test('calendar seeking maps dates onto compressed playback, including the final settling interval', () => {
  const replay = buildReplay(records);
  assert.equal(replayPositionAt(replay, Date.UTC(2025, 5, 1)), 0);
  assert.equal(replayPositionAt(replay, Date.UTC(2025, 5, 2)), 750);
  assert.equal(replayPositionAt(replay, Date.UTC(2026, 5, 2)), replay.duration);
  const midpoint = (replay.days[1].timestamp + replay.days[2].timestamp) / 2;
  assert.equal(replayPositionAt(replay, midpoint), 3375);
  const single = buildReplay(records.filter((record) => record.date === '2025-06-01'));
  assert.equal(replayPositionAt(single, single.days[0].timestamp + 43200000), single.duration / 2);
  assert.equal(replayTimeline(single.days).end - replayTimeline(single.days).start, 86400000);
});

test('every cumulative metric matches the normal summary at each date, including revisits, zeros and X counts', () => {
  const rows = [
    ['2025-01-01', 'A', 'L1', 'mallard', 2, ''],
    ['2025-01-01', 'A', 'L1', 'robin', null, ''],
    ['2025-01-01', 'A', 'L1', 'mallard', 3, ''],
    ['2025-01-01', 'B', 'L2', 'sparrow', 4, 'X'],
    ['2025-01-02', 'C', 'L1', 'robin', 5, ''],
    ['2025-01-03', 'D', 'L3', 'sparrow', 0, ''],
    ['2025-01-04', 'E', 'L2', 'sparrow', 3, ''],
    ['2025-01-04', 'E', 'L2', null, 1, ''],
  ].map(([date, checklist, locationId, species, count, exotic]) => ({
    date,
    checklist,
    locationId,
    species,
    count,
    exotic,
    location: locationId,
    longitude: 6,
    latitude: 46,
  }));
  const replay = buildReplay(rows.toReversed());
  for (const day of replay.days) {
    const expected = summarize(rows.filter((row) => row.date <= day.date));
    for (const key of Object.keys(day.totals)) assert.equal(day.totals[key], expected[key], `${day.date}: ${key}`);
  }
  assert.deepEqual(
    replay.days.map((day) => day.added.species),
    [2, 0, 0, 1],
  );
  assert.deepEqual(
    replay.days.map((day) => day.added.locations),
    [2, 0, 1, 0],
  );
  for (const metric of ['species', 'checklists', 'observations', 'individuals', 'locations']) {
    assert.equal(
      replayTimeline(replay.days, 96, metric).bins.reduce((sum, count) => sum + count, 0),
      replay.days.at(-1).totals[metric],
    );
  }
});

test('country and region events match independent summaries at every date, without summing global species', () => {
  const rows = [
    ['2025-01-01', 'A', 'L1', 'CH-VD', 'mallard', 2, ''],
    ['2025-01-01', 'A', 'L1', 'CH-VD', 'robin', null, ''],
    ['2025-01-02', 'B', 'L2', 'CH-GE', 'mallard', 3, ''],
    ['2025-01-02', 'C', 'L3', 'FR-ARA', 'robin', 4, ''],
    ['2025-01-03', 'D', 'L1', 'CH-VD', 'mallard', 5, ''],
    ['2025-01-03', 'E', 'L4', 'FR-', 'sparrow', 1, ''],
    ['2025-01-04', 'F', 'L5', 'XX-', 'tern', 2, ''],
    ['2025-01-04', 'G', 'L6', 'CH-VD', 'escapee', 3, 'X'],
    ['2025-01-04', 'H', 'L7', 'CH-GE', 'sparrow', 0, ''],
  ].map(([date, checklist, locationId, region, species, count, exotic]) => ({
    date,
    checklist,
    locationId,
    region,
    country: region.split('-')[0],
    species,
    count,
    exotic,
    location: locationId,
    longitude: 6,
    latitude: 46,
  }));
  for (const grouping of ['country', 'region']) {
    const replay = buildReplay(rows.toReversed(), grouping);
    const latest = new Map();
    for (const day of replay.days) {
      for (const event of day.areas) latest.set(event.id, event.totals);
      for (const [id, totals] of latest) {
        const expected = summarize(
          rows.filter((row) => row.date <= day.date && (row.country === 'XX' ? 'XX' : row[grouping]) === id),
        );
        for (const key of Object.keys(totals))
          assert.equal(totals[key], expected[key], `${grouping}/${id}/${day.date}: ${key}`);
      }
      const global = summarize(rows.filter((row) => row.date <= day.date));
      for (const key of Object.keys(day.totals)) assert.equal(day.totals[key], global[key]);
    }
    for (const point of replay.areaPoints)
      for (const key of Object.keys(latest.get(point.properties.id)))
        assert.equal(point.properties[key], latest.get(point.properties.id)[key]);
    assert.ok(latest.has('XX'), 'High Seas stays a separate aggregate');
    assert.ok(!latest.has('FR-'), 'Country-only rows are not assigned a fictional region');
    assert.ok(
      [...latest.values()].reduce((sum, totals) => sum + totals.species, 0) > replay.days.at(-1).totals.species,
      'Global species are deduplicated independently',
    );
    assert.equal(
      replay.days.reduce((sum, day) => sum + day.areas.length, 0),
      7,
      'Only dates with area activity get stored',
    );
  }
});

test('display counters advance monotonically and settle exactly after 400 ms', () => {
  const counts = [0, 50, 100, 200, 300, 400, 500].map((elapsed) => replayCounterValue(20, 120, elapsed));
  assert.equal(counts[0], 20);
  assert.equal(counts[3], 95);
  assert.equal(counts[5], 120);
  assert.equal(counts[6], 120);
  assert.ok(counts.every((value, i) => !i || value >= counts[i - 1]));
  const mid = replayCounterValue(20, 120, 200);
  assert.equal(replayCounterValue(mid, 180, 0), mid, 'New events start from the displayed value without jumping');
});

test('individual replay accumulates each location independently on first visits and revisits', () => {
  const rows = [
    ['2025-01-01', 'S1', 'L1', 'bird1', 2],
    ['2025-01-01', 'S1', 'L1', 'bird2', null],
    ['2025-01-02', 'S2', 'L2', 'bird1', 3],
    ['2025-01-03', 'S3', 'L1', 'bird1', 5],
    ['2025-01-03', 'S3', 'L1', 'bird3', 1],
  ].map(([date, checklist, locationId, species, count]) => ({
    date,
    checklist,
    locationId,
    species,
    count,
    location: locationId,
    longitude: 6,
    latitude: 46,
    exotic: '',
  }));
  const replay = buildReplay(rows);
  const latest = new Map();
  for (const day of replay.days) {
    for (const event of day.areas) latest.set(event.id, event.totals);
    for (const [id, totals] of latest) {
      const location = replay.points.find((point) => point.id === id).properties.locationId;
      const expected = summarize(rows.filter((row) => row.locationId === location && row.date <= day.date));
      for (const key of Object.keys(totals)) assert.equal(totals[key], expected[key], `${location}/${day.date}/${key}`);
    }
  }
  assert.equal(replay.days[0].areas.length, 1, 'Only the first visited location appears initially');
  assert.deepEqual(replay.days[2].areas[0].totals, {
    species: 3,
    checklists: 2,
    observations: 4,
    individuals: 8,
    locations: 1,
  });
});

test('location pulse radius keeps zoom at the top level and adds the pulse at every zoom stop', () => {
  const radius = replayLocationRadius('checklists', ['feature-state', 'pulse']);
  assert.deepEqual(radius.slice(0, 3), ['interpolate', ['linear'], ['zoom']]);
  for (const i of [4, 6, 8]) assert.deepEqual(radius[i].at(-1), ['feature-state', 'pulse']);
  assert.deepEqual(radius[8][1][2], ['ln', ['+', ['coalesce', ['feature-state', 'checklists'], 0], 1]]);
});
