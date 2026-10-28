"""Build region labels from eBird's public country subregion pages."""
import json
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen


class RegionLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.names = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        prefix = 'https://ebird.org/region/'
        if tag == 'a' and attrs.get('href', '').startswith(prefix) and 'title' in attrs:
            code = attrs['href'][len(prefix):]
            if '/' not in code:
                self.names[code] = attrs['title']


def read_regions(country):
    cache = Path('output/review/region-names') / f'{country}.html'
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        with urlopen(f'https://ebird.org/region/{country}/regions', timeout=60) as response:
            cache.write_bytes(response.read())
    parser = RegionLinks()
    parser.feed(cache.read_text())
    return {code: name for code, name in parser.names.items() if code.startswith(country + '-')}


# The world page supplies country codes; labels always come from exact eBird codes.
with urlopen('https://ebird.org/region/world/regions', timeout=60) as response:
    parser = RegionLinks()
    parser.feed(response.read().decode())
countries = sorted(code for code in parser.names if len(code) == 2)
names = {}
with ThreadPoolExecutor(max_workers=6) as executor:
    for country, regions in zip(countries, executor.map(read_regions, countries)):
        names.update(regions)
        print(country, len(regions), flush=True)
Path('src/assets/region-names.json').write_text(json.dumps(dict(sorted(names.items())), ensure_ascii=False, indent=2) + '\n')
print(f'Saved {len(names)} region names from {len(countries)} countries.')
