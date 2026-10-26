"""Build private regression cases with an independent CSV/taxonomy reference count."""
import collections
import csv
import hashlib
import json
from pathlib import Path
import sys

source = Path(sys.argv[1] if len(sys.argv) > 1 else 'local/MyEBirdData.local.csv')
taxonomy_path = Path('src/assets/eBird_taxonomy.json')
taxonomy = json.loads(taxonomy_path.read_text())
scientific = {taxon['sciName']: taxon for taxon in taxonomy}
codes = {taxon['speciesCode']: taxon for taxon in taxonomy}
with source.open(encoding='utf-8-sig', newline='') as handle:
    reader = csv.DictReader(handle)
    fields = reader.fieldnames
    rows = list(reader)

# Compute expected identities directly from raw CSV, independently of the JS model.
records = []
for row in rows:
    taxon = scientific.get(row['Scientific Name'], {})
    parent = codes.get(taxon.get('reportAs') or taxon.get('speciesCode'), {})
    eligible = taxon.get('category') not in ('spuh', 'slash', 'hybrid') and parent.get('category') == 'species'
    records.append({
        'checklist': row['Submission ID'], 'location': row['Location ID'],
        'country': row['State/Province'].split('-')[0], 'region': row['State/Province'],
        'date': row['Date'], 'longitude': float(row['Longitude']), 'latitude': float(row['Latitude']),
        'species': parent.get('speciesCode') if eligible else None,
        'code': taxon.get('speciesCode', row['Scientific Name']),
        'present': row['Count'].upper() == 'X' or float(row['Count']) != 0,
        'exotic': row.get('Exotic Code'), 'category': taxon.get('category', 'unmatched'),
    })


def summary(selected):
    return {
        'species': len({r['species'] for r in selected if r['present'] and r['species'] and r['exotic'] != 'X'}),
        'checklists': len({r['checklist'] for r in selected}),
        'locations': len({r['location'] for r in selected}),
        'countries': len({r['country'] for r in selected if r['country'] != 'XX'}),
        'observations': sum(r['present'] for r in selected),
        'additional': sum(r['present'] and (not r['species'] or r['exotic'] == 'X') for r in selected),
    }


output = Path('local/export-cases')
output.mkdir(parents=True, exist_ok=True)
strata = set()
checklists = set()
for row, record in zip(rows, records):
    keys = [(record['country'], record['date'][:4]), (record['category'], record['exotic'], row['Count'] if row['Count'] in ('X', '0') else 'numeric')]
    if any(key not in strata for key in keys):
        checklists.add(record['checklist'])
    strata.update(keys)

fixtures = []
checklist_sizes = collections.Counter(record['checklist'] for record in records)
small_checklist = next(key for key, count in checklist_sizes.items() if count >= 20)
for name, ids in [('small', {small_checklist}), ('representative', checklists)]:
    path = output / f'{name}.csv'
    selected = [record for record in records if record['checklist'] in ids]
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(row for row, record in zip(rows, records) if record['checklist'] in ids)
    fixtures.append({'name': name, 'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'rows': len(selected), 'expected': summary(selected)})
fixtures.append({'name': 'full', 'path': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'rows': len(records), 'expected': summary(records)})

latest_year = max(r['date'][:4] for r in records)
location = collections.Counter(r['location'] for r in records).most_common(1)[0][0]
species = collections.Counter(r['species'] for r in records if r['species']).most_common(1)[0][0]
# A rectangle allows an independent axis-range oracle for polygon containment.
polygon = [[5, 45], [11, 45], [11, 48], [5, 48]]
cases = [
    ('all', {'additional': True}, records),
    ('species-only', {'additional': False}, [r for r in records if r['species'] and r['exotic'] != 'X']),
    ('latest-year', {'additional': True, 'yearFrom': latest_year, 'yearTo': latest_year}, [r for r in records if r['date'][:4] == latest_year]),
    ('winter', {'additional': True, 'monthFrom': '11', 'monthTo': '02'}, [r for r in records if r['date'][5:7] >= '11' or r['date'][5:7] <= '02']),
    ('latest-summer', {'additional': True, 'yearFrom': latest_year, 'yearTo': latest_year, 'monthFrom': '06', 'monthTo': '08'}, [r for r in records if r['date'][:4] == latest_year and '06' <= r['date'][5:7] <= '08']),
    ('one-location', {'additional': True, 'locationId': location}, [r for r in records if r['location'] == location]),
    ('one-species', {'additional': True, 'code': species}, [r for r in records if r['present'] and species in (r['code'], r['species'])]),
    ('empty-year', {'additional': True, 'yearFrom': str(int(latest_year) + 1)}, []),
    ('rectangle', {'additional': True}, [r for r in records if 5 <= r['longitude'] <= 11 and 45 <= r['latitude'] <= 48]),
]
scenarios = [{'name': name, 'filters': filters, 'polygon': polygon if name == 'rectangle' else None, 'rows': len(selected), 'expected': summary(selected)} for name, filters, selected in cases]
groups = {}
for grouping in ['country', 'region']:
    selected = collections.defaultdict(list)
    for record in records:
        if grouping == 'region' and not record['region'].partition('-')[2]:
            continue
        selected[record[grouping]].append(record)
    groups[grouping] = {key: summary(value) for key, value in sorted(selected.items())}

manifest = {
    'version': 1, 'reference': 'Python csv + independent raw-row taxonomy/counting oracle; not an eBird life-list certification',
    'taxonomySha256': hashlib.sha256(taxonomy_path.read_bytes()).hexdigest(),
    'fixtures': fixtures, 'scenarios': scenarios, 'groups': groups,
}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'fixtures': [{k: f[k] for k in ['name', 'rows', 'expected']} for f in fixtures], 'scenarios': len(scenarios), 'manifest': str(output / 'manifest.json')}, indent=2))
