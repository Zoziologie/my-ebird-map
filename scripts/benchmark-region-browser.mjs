// Run in a Vite browser console after importing an export and choosing Region:
// await (await import('/my-ebird-map/scripts/benchmark-region-browser.mjs')).benchmarkRegionView(window.designMap)
function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    samples: values.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  };
}

export async function benchmarkRegionView(map, repetitions = 3, renderer = 'current') {
  // The legacy pass uses the old circle/text layers with identical data, camera and image-update work.
  const showRenderer = () => {
    if (!map.getLayer('region-markers')) return;
    for (const layer of ['point-outlines', 'clusters', 'locations', 'map-labels'])
      map.setLayoutProperty(layer, 'visibility', renderer === 'legacy' ? 'visible' : 'none');
    map.setLayoutProperty('region-markers', 'visibility', renderer === 'legacy' ? 'none' : 'visible');
  };
  const settle = (action) =>
    new Promise((resolve) => {
      map.once('idle', resolve);
      action();
    });
  await settle(() => {
    showRenderer();
    map.jumpTo({ center: [8, 47], zoom: 4, bearing: 0, pitch: 0 });
    map.triggerRepaint();
  });
  const frames = [],
    pans = [],
    zooms = [],
    metrics = [];
  const movingFrames = [];
  let previous,
    measuring = true;
  function sample(now) {
    if (!measuring) return;
    if (previous !== undefined) frames.push(now - previous);
    if (previous !== undefined && map.isMoving()) movingFrames.push(now - previous);
    previous = now;
    globalThis.requestAnimationFrame(sample);
  }
  globalThis.requestAnimationFrame(sample);
  for (let round = 0; round < repetitions; round++) {
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      await settle(() => map.panBy([i % 2 ? -35 : 35, i % 3 ? 8 : -16], { duration: 180 }));
      pans.push(performance.now() - start);
    }
    for (const zoom of [5, 4]) {
      const start = performance.now();
      await settle(() => map.easeTo({ zoom, duration: 250 }));
      zooms.push(performance.now() - start);
    }
    for (const metric of ['checklists', 'observations', 'locations', 'species']) {
      const start = performance.now();
      await settle(() => {
        globalThis.document.querySelector(`[data-metric="${metric}"]`).click();
        showRenderer();
        map.triggerRepaint();
      });
      metrics.push(performance.now() - start);
    }
  }
  measuring = false;
  return {
    userAgent: globalThis.navigator.userAgent,
    viewport: [globalThis.innerWidth, globalThis.innerHeight, globalThis.devicePixelRatio],
    regionFeatures: map.getSource('observations')._data.features.length,
    renderer,
    repetitions,
    frameIntervals: distribution(frames),
    movingFrameIntervals: distribution(movingFrames),
    framesOver25Ms: frames.filter((ms) => ms > 25).length,
    panToIdle: distribution(pans),
    zoomToIdle: distribution(zooms),
    metricToIdle: distribution(metrics),
    note: 'Desktop browser, warm map tiles; frame intervals are requestAnimationFrame timings, not GPU timings or a physical-phone measurement.',
  };
}
