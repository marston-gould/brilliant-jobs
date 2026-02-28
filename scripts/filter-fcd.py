#!/usr/bin/env python3
"""
filter-fcd.py — FCD Enrichment Pipeline Step 1a
=================================================
Streams the 10 GB Free Company Dataset (FCD) file line by line (~100 MB RAM)
and extracts companies with non-null industry values for enrichment matching.

Usage:
    python3 scripts/filter-fcd.py /path/to/free_company_dataset.json

Output:
    filtered-companies.json in current directory

Filter criteria:
    - Has non-null industry value
    - Has a name with 3+ characters
    - Extracts linkedin_slug and domain for downstream matching

NOTE: This replaces the old filter-pdl.py which filtered by ATS URL patterns.
      The FCD file has NO ATS URLs — it has company metadata only.
"""

import json
import sys
import re
import time
from pathlib import Path


# Fields to extract from each matching company
KEEP_FIELDS = [
    'name', 'industry', 'sub_industry', 'sector',
    'employee_count', 'employee_count_range',
    'locality', 'region', 'country',
    'website', 'linkedin_url',
    'founded', 'type',
]


def normalize_name(name: str) -> str:
    """Lowercase, strip common suffixes, remove punctuation, collapse whitespace."""
    if not name:
        return ''
    n = name.lower().strip()
    # Strip common corporate suffixes
    for suffix in [', inc.', ', inc', ', llc', ', ltd', ', corp', ', co.',
                   ' inc.', ' inc', ' llc', ' ltd', ' corp', ' co.',
                   ' gmbh', ' ag', ' sa', ' pty', ' plc', ' bv', ' nv',
                   ' limited', ' corporation', ' company']:
        if n.endswith(suffix):
            n = n[:-len(suffix)]
    # Replace separators with spaces
    n = n.replace('-', ' ').replace('_', ' ').replace('.', ' ')
    # Remove non-alphanumeric except spaces
    n = re.sub(r'[^a-z0-9 ]', '', n)
    return re.sub(r'\s+', ' ', n).strip()


def extract_linkedin_slug(linkedin_url: str) -> str:
    """Extract company slug from a LinkedIn URL."""
    if not linkedin_url:
        return ''
    # Match patterns like linkedin.com/company/clockwise or linkedin.com/company/clockwise/
    m = re.search(r'linkedin\.com/company/([^/?#]+)', linkedin_url, re.IGNORECASE)
    if m:
        return m.group(1).lower().strip('/')
    return ''


def extract_domain(url: str) -> str:
    """Extract root domain from a URL."""
    if not url:
        return ''
    d = re.sub(r'^https?://(www\.)?', '', str(url)).rstrip('/')
    # Take just the domain part (before any path)
    d = d.split('/')[0].lower().strip()
    return d


def filter_company(company: dict) -> dict | None:
    """Extract relevant fields if company has non-null industry and 3+ char name."""
    name = company.get('name', '')
    industry = company.get('industry')

    # Must have industry (non-null, non-empty)
    if not industry or not str(industry).strip():
        return None

    # Must have a name with 3+ characters
    if not name or len(name.strip()) < 3:
        return None

    # Build filtered record
    record = {}
    for field in KEEP_FIELDS:
        val = company.get(field)
        if val is not None:
            record[field] = val

    record['normalized_name'] = normalize_name(name)

    # Extract linkedin_slug
    linkedin_url = company.get('linkedin_url', '')
    slug = extract_linkedin_slug(linkedin_url)
    if slug:
        record['linkedin_slug'] = slug

    # Extract domain from website
    website = company.get('website', '')
    domain = extract_domain(website)
    if domain:
        record['domain'] = domain

    return record


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 filter-fcd.py /path/to/free_company_dataset.json')
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f'Error: File not found: {input_path}')
        sys.exit(1)

    output_path = Path('filtered-companies.json')

    print(f'[filter-fcd] Input:  {input_path} ({input_path.stat().st_size / 1e9:.2f} GB)')
    print(f'[filter-fcd] Output: {output_path}')
    print()

    total = 0
    matched = 0
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

            # Progress every 500K lines
            if total % 500_000 == 0:
                elapsed = time.time() - start
                rate = total / elapsed
                print(f'  [{total:>10,} processed] {matched:>8,} matched | '
                      f'{rate:,.0f} lines/sec | {elapsed:.0f}s elapsed')

        outfile.write('\n]\n')

    elapsed = time.time() - start
    out_size = output_path.stat().st_size

    print()
    print(f'[filter-fcd] Done in {elapsed:.1f}s')
    print(f'  Total processed:   {total:>10,}')
    print(f'  Matched (total):   {matched:>10,}')
    print(f'  Parse errors:      {errors:>10,}')
    print(f'  Output size:       {out_size / 1e6:.1f} MB')
    print(f'  Output file:       {output_path}')

    if out_size > 100_000_000:
        print()
        print(f'  ⚠ WARNING: Output exceeds 100 MB ({out_size / 1e6:.0f} MB).')
        print(f'  The Edge Function has a 150 MB memory limit.')
        print(f'  Consider Option C from the handoff doc: load into a')
        print(f'  ref_fcd_companies Supabase table instead of Storage.')


if __name__ == '__main__':
    main()
