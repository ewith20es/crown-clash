"""Cache public RoyaleTools level-11 tables for an auditable, offline collection."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import re, html, json, urllib.request, time

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools/sources'
def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()
def fetch(slug):
    path = CACHE / (slug + '.html')
    if not path.exists():
        req = urllib.request.Request('https://www.royaletools.com/cards/' + slug, headers={'User-Agent':'CrownClash stat reference'})
        for attempt in range(6):
            try:
                path.write_bytes(urllib.request.urlopen(req, timeout=60).read())
                time.sleep(0.6)
                break
            except Exception:
                if attempt == 5: raise
                time.sleep(3 * (attempt + 1))
    s = path.read_text(encoding='utf8')
    tables = {}
    for label, body in re.findall(r'<table[^>]*aria-label="([^"]+)"[^>]*>(.*?)</table>', s, re.S):
        groups = []
        for role, group in re.findall(r'<tbody[^>]*data-role="([^"]+)"[^>]*>(.*?)</tbody>', body, re.S):
            rows = {}
            title = 'main'
            for row in re.findall(r'<tr[^>]*>(.*?)</tr>', group, re.S):
                cells = re.findall(r'<(?:th|td)[^>]*>(.*?)</(?:th|td)>', row, re.S)
                if '<td' in row and len(cells)==2:
                    rows[clean(cells[0])] = clean(cells[1])
                elif 'rowgroup' in row: title = clean(cells[0])
            groups.append({'name':title,'stats':rows})
        tables[html.unescape(label)] = groups
    name = clean(re.search(r'<h1[^>]*>(.*?)</h1>',s,re.S)[1])
    meta = html.unescape(re.search(r'<meta name="description" content="([^"]+)',s)[1])
    pills = [clean(x) for x in re.findall(r'<span class="[^"]*_pill"[^>]*>(.*?)</span>',s,re.S)][:3]
    sections = {}
    for heading, body in re.findall(r'<h2[^>]*>(.*?)</h2>(.*?)(?=<h2|$)',s,re.S):
        title=clean(heading)
        if title in [name+' Evolution',name+' Hero']:
            sections[title] = [clean(x) for x in re.findall(r'<p[^>]*>(.*?)</p>',body,re.S)][:5]
    return {'slug':slug,'name':name,'meta':meta,'pills':pills,'tables':tables,'sections':sections,'source':'https://www.royaletools.com/cards/'+slug}

if __name__ == '__main__':
    slugs=list(dict.fromkeys(re.findall(r'href="/cards/([^"?#/]+)"', (CACHE/'catalog.html').read_text(encoding='utf8'))))
    slugs.remove('compare')
    with ThreadPoolExecutor(max_workers=2) as pool:
        records=list(pool.map(fetch,slugs))
    output=ROOT/'js/data/collection-source.js'
    output.write_text('// Public level-11 reference snapshot; collected 2026-11-17. See tools/sync-collection.py.\nexport const COLLECTION_SOURCE = '+json.dumps(records,ensure_ascii=False,indent=2)+';\n',encoding='utf8')
    print('Saved',len(records),'card references to',output)
