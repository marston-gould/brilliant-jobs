#!/usr/bin/env python3
"""
filter-pdl.py — PDL Industry Enrichment Pipeline Step 1a
=========================================================
Streams the 10 GB PDL free_company_dataset.json line by line (~100 MB RAM)
and extracts only companies with ATS platform presence.

Usage:
    python3 scripts/filter-pdl.py /path/to/free_company_dataset.json

Output:
    filtered-companies.json in current directory (~50–200 MB)

Matching criteria:
    1. ATS URL patterns in website, linkedin_url, or any URL fields
    2. Company name normalization for fuzzy matching downstream

ATS patterns detected:
    - boards.greenhouse.io/{slug}
    - jobs.lever.co/{slug}
    - jobs.ashbyhq.com/{slug}
    - apply.workable.com/{slug}
    - *.wd{1,2,3,5}.myworkdayjobs.com
    - careers.recruitee.com/{slug}
"""

import json
import sys
import re
import time
from pathlib import Path


# ─── ATS URL patterns ─────────────────────────────────────────
ATS_PATTERNS = [
    re.compile(r'boards\.greenhouse\.io/[\w-]+', re.IGNORECASE),
    re.compile(r'jobs\.lever\.co/[\w-]+', re.IGNORECASE),
    re.compile(r'jobs\.ashbyhq\.com/[\w-]+', re.IGNORECASE),
    re.compile(r'apply\.workable\.com/[\w-]+', re.IGNORECASE),
    re.compile(r'[\w-]+\.wd[1235]\.myworkdayjobs\.com', re.IGNORECASE),
    re.compile(r'careers\.recruitee\.com/[\w-]+', re.IGNORECASE),
]

# Fields to extract from each matching company
KEEP_FIELDS = [
    'name', 'industry', 'sub_industry', 'sector',
    'employee_count', 'employee_count_range',
    'locality', 'region', 'country',
    'website', 'linkedin_url',
    'founded', 'type', 'tags',
]


def normalize_name(name: str) -> str:
    """Lowercase, strip common suffixes, collapse whitespace."""
    if not name:
        return ''
    n = name.lower().strip()
    # Strip common corporate suffixes
    for suffix in [', inc.', ', inc', ', llc', ', ltd', ', corp', ', co.',
                   ' inc.', ' inc', ' llc', ' ltd', ' corp', ' co.',
                   ' gmbh', ' ag', ' sa', ' pty', ' plc', ' bv', ' nv']:
        if n.endswith(suffix):
            n = n[:-len(suffix)]
    return re.sub(r'\s+', ' ', n).strip()


def extract_ats_slugs(company: dict) -> list[dict]:
    """Check all URL-like fields for ATS patterns. Return matched slug info."""
    matches = []
    urls_to_check = []

    # Collect all URL-like fields
    for field in ['website', 'linkedin_url']:
        val = company.get(field)
        if val:
            urls_to_check.append(str(val))

    # Some PDL records have alternative_domains or profiles
    for field in ['alternative_domains', 'profiles']:
        val = company.get(field)
        if isinstance(val, list):
            urls_to_check.extend([str(v) for v in val])
        elif isinstance(val, str):
            urls_to_check.append(val)

    combined = ' '.join(urls_to_check)

    for pattern in ATS_PATTERNS:
        m = pattern.search(combined)
        if m:
            matches.append({'match': m.group(), 'source': 'url_field'})

    return matches


def filter_company(company: dict) -> dict | None:
    """Extract relevant fields if company has ATS presence or useful data."""
    ats_matches = extract_ats_slugs(company)
    name = company.get('name', '')

    # Must have a name and either ATS URL match or enough data to match by name later
    has_ats_url = len(ats_matches) > 0
    has_industry = bool(company.get('industry'))
    has_linkedin = bool(company.get('linkedin_url'))
    has_website = bool(company.get('website'))

    # Include if: has ATS URL, OR has industry + at least one matching signal
    if not has_ats_url and not (has_industry and (has_linkedin or has_website)):
        return None

    # Build filtered record
    record = {}
    for field in KEEP_FIELDS:
        val = company.get(field)
        if val is not None:
            record[field] = val

    record['normalized_name'] = normalize_name(name)

    if ats_matches:
        record['ats_matches'] = ats_matches

    # Extract domain from website for matching
    website = company.get('website', '')
    if website:
        domain = re.sub(r'^https?://(www\.)?', '', str(website)).rstrip('/')
        record['domain'] = domain.lower()

    return record


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 filter-pdl.py /path/to/free_company_dataset.json')
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f'Error: File not found: {input_path}')
        sys.exit(1)

    output_path = Path('filtered-companies.json')

    print(f'[filter-pdl] Input:  {input_path} ({input_path.stat().st_size / 1e9:.2f} GB)')
    print(f'[filter-pdl] Output: {output_path}')
    print()

    total = 0
    matched = 0
    ats_url_matched = 0
    errors = 0
    start = time.time()

    with open(input_path, 'r', encoding='utf-8') as infile, \
         open(output_path, 'w', encoding='utf-8') as outfile:

        outfile.write('[\n')
        first = True

        for line_num, line in enumerate(infile, 1):
            line = line.strip()
            if not line or line in ('', '[', ']', ','):
                continue

            # Strip trailing comma for JSONL-like formats
            if line.endswith(','):
                line = line[:-1]

            try:
                company = json.loads(line)
            except json.JSONDecodeError:
                errors += 1
                if errors <= 5:
                    print(f'  [WARN] JSON parse error at line {line_num}')
                continue

            total += 1
            result = filter_company(company)

            if result:
                if not first:
                    outfile.write(',\n')
                json.dump(result, outfile, separators=(',', ':'))
                first = False
                matched += 1
                if result.get('ats_matches'):
                    ats_url_matched += 1

            # Progress every 500K lines
            if total % 500_000 == 0:
                elapsed = time.time() - start
                rate = total / elapsed
                print(f'  [{total:>10,} processed] {matched:>8,} matched '
                      f'({ats_url_matched} ATS URL) | {rate:,.0f} lines/sec | '
                      f'{elapsed:.0f}s elapsed')

        outfile.write('\n]\n')

    elapsed = time.time() - start
    out_size = output_path.stat().st_size

    print()
    print(f'[filter-pdl] Done in {elapsed:.1f}s')
    print(f'  Total processed:   {total:>10,}')
    print(f'  Matched (total):   {matched:>10,}')
    print(f'  ATS URL matches:   {ats_url_matched:>10,}')
    print(f'  Parse errors:      {errors:>10,}')
    print(f'  Output size:       {out_size / 1e6:.1f} MB')
    print(f'  Output file:       {output_path}')

    if out_size > 150_000_000:
        print()
        print(f'  ⚠ WARNING: Output exceeds 150 MB ({out_size / 1e6:.0f} MB).')
        print(f'  The Edge Function may need batched processing or a split file.')
        print(f'  Consider filtering more aggressively (ATS URL matches only).')


if __name__ == '__main__':
    main()
