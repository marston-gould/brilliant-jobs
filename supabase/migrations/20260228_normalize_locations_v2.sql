-- normalize_locations_v2
-- Backfills location_normalized from structured fields (loc_city, loc_state, loc_country, is_remote)
-- for all open jobs where location_normalized IS NULL.
--
-- Format rules (matching existing normalized data):
--   US jobs:     "City, Full State Name"        e.g. "Denver, Colorado"
--   Non-US jobs: "City, Full Country Name"      e.g. "London, United Kingdom"
--   Remote:      "Remote" or "Remote, Country"
--   Country-only: Full country name
--
-- Returns: { updated: int, remote_set: int, structured_set: int, pattern_set: int }

CREATE OR REPLACE FUNCTION normalize_locations_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remote int := 0;
  v_structured int := 0;
  v_pattern int := 0;
  v_usajobs int := 0;
BEGIN

  -- ═══════════════════════════════════════════════════════════
  -- PASS 1: Remote jobs with no city → "Remote"
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = 'Remote',
        loc_type = 'remote'
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = true
      AND (loc_city IS NULL OR TRIM(loc_city) = '')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_remote FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 2: Remote jobs WITH a city → "Remote, State" or "Remote, Country"
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = CASE
      WHEN loc_country = 'US' AND loc_state IS NOT NULL THEN
        'Remote, ' || CASE loc_state
          WHEN 'AL' THEN 'Alabama' WHEN 'AK' THEN 'Alaska' WHEN 'AZ' THEN 'Arizona'
          WHEN 'AR' THEN 'Arkansas' WHEN 'CA' THEN 'California' WHEN 'CO' THEN 'Colorado'
          WHEN 'CT' THEN 'Connecticut' WHEN 'DE' THEN 'Delaware' WHEN 'FL' THEN 'Florida'
          WHEN 'GA' THEN 'Georgia' WHEN 'HI' THEN 'Hawaii' WHEN 'ID' THEN 'Idaho'
          WHEN 'IL' THEN 'Illinois' WHEN 'IN' THEN 'Indiana' WHEN 'IA' THEN 'Iowa'
          WHEN 'KS' THEN 'Kansas' WHEN 'KY' THEN 'Kentucky' WHEN 'LA' THEN 'Louisiana'
          WHEN 'ME' THEN 'Maine' WHEN 'MD' THEN 'Maryland' WHEN 'MA' THEN 'Massachusetts'
          WHEN 'MI' THEN 'Michigan' WHEN 'MN' THEN 'Minnesota' WHEN 'MS' THEN 'Mississippi'
          WHEN 'MO' THEN 'Missouri' WHEN 'MT' THEN 'Montana' WHEN 'NE' THEN 'Nebraska'
          WHEN 'NV' THEN 'Nevada' WHEN 'NH' THEN 'New Hampshire' WHEN 'NJ' THEN 'New Jersey'
          WHEN 'NM' THEN 'New Mexico' WHEN 'NY' THEN 'New York' WHEN 'NC' THEN 'North Carolina'
          WHEN 'ND' THEN 'North Dakota' WHEN 'OH' THEN 'Ohio' WHEN 'OK' THEN 'Oklahoma'
          WHEN 'OR' THEN 'Oregon' WHEN 'PA' THEN 'Pennsylvania' WHEN 'RI' THEN 'Rhode Island'
          WHEN 'SC' THEN 'South Carolina' WHEN 'SD' THEN 'South Dakota' WHEN 'TN' THEN 'Tennessee'
          WHEN 'TX' THEN 'Texas' WHEN 'UT' THEN 'Utah' WHEN 'VT' THEN 'Vermont'
          WHEN 'VA' THEN 'Virginia' WHEN 'WA' THEN 'Washington' WHEN 'WV' THEN 'West Virginia'
          WHEN 'WI' THEN 'Wisconsin' WHEN 'WY' THEN 'Wyoming' WHEN 'DC' THEN 'District of Columbia'
          ELSE loc_state
        END
      WHEN loc_country = 'US' THEN 'Remote, United States'
      ELSE 'Remote'
    END,
    loc_type = 'remote'
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = true
      AND loc_city IS NOT NULL
      AND TRIM(loc_city) != ''
    RETURNING 1
  )
  SELECT v_remote + COUNT(*) INTO v_remote FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 3: US jobs with loc_city + loc_state → "City, Full State"
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = INITCAP(TRIM(loc_city)) || ', ' || CASE UPPER(TRIM(loc_state))
      WHEN 'AL' THEN 'Alabama' WHEN 'AK' THEN 'Alaska' WHEN 'AZ' THEN 'Arizona'
      WHEN 'AR' THEN 'Arkansas' WHEN 'CA' THEN 'California' WHEN 'CO' THEN 'Colorado'
      WHEN 'CT' THEN 'Connecticut' WHEN 'DE' THEN 'Delaware' WHEN 'FL' THEN 'Florida'
      WHEN 'GA' THEN 'Georgia' WHEN 'HI' THEN 'Hawaii' WHEN 'ID' THEN 'Idaho'
      WHEN 'IL' THEN 'Illinois' WHEN 'IN' THEN 'Indiana' WHEN 'IA' THEN 'Iowa'
      WHEN 'KS' THEN 'Kansas' WHEN 'KY' THEN 'Kentucky' WHEN 'LA' THEN 'Louisiana'
      WHEN 'ME' THEN 'Maine' WHEN 'MD' THEN 'Maryland' WHEN 'MA' THEN 'Massachusetts'
      WHEN 'MI' THEN 'Michigan' WHEN 'MN' THEN 'Minnesota' WHEN 'MS' THEN 'Mississippi'
      WHEN 'MO' THEN 'Missouri' WHEN 'MT' THEN 'Montana' WHEN 'NE' THEN 'Nebraska'
      WHEN 'NV' THEN 'Nevada' WHEN 'NH' THEN 'New Hampshire' WHEN 'NJ' THEN 'New Jersey'
      WHEN 'NM' THEN 'New Mexico' WHEN 'NY' THEN 'New York' WHEN 'NC' THEN 'North Carolina'
      WHEN 'ND' THEN 'North Dakota' WHEN 'OH' THEN 'Ohio' WHEN 'OK' THEN 'Oklahoma'
      WHEN 'OR' THEN 'Oregon' WHEN 'PA' THEN 'Pennsylvania' WHEN 'RI' THEN 'Rhode Island'
      WHEN 'SC' THEN 'South Carolina' WHEN 'SD' THEN 'South Dakota' WHEN 'TN' THEN 'Tennessee'
      WHEN 'TX' THEN 'Texas' WHEN 'UT' THEN 'Utah' WHEN 'VT' THEN 'Vermont'
      WHEN 'VA' THEN 'Virginia' WHEN 'WA' THEN 'Washington' WHEN 'WV' THEN 'West Virginia'
      WHEN 'WI' THEN 'Wisconsin' WHEN 'WY' THEN 'Wyoming' WHEN 'DC' THEN 'District of Columbia'
      -- If state is already a full name (Greenhouse often sends full names)
      ELSE INITCAP(TRIM(loc_state))
    END
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = false
      AND loc_country = 'US'
      AND loc_city IS NOT NULL AND TRIM(loc_city) != ''
      AND loc_state IS NOT NULL AND TRIM(loc_state) != ''
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_structured FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 4: Non-US jobs with loc_city + loc_country → "City, Country Name"
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = INITCAP(TRIM(loc_city)) || ', ' || CASE UPPER(TRIM(loc_country))
      WHEN 'GB' THEN 'United Kingdom' WHEN 'DE' THEN 'Germany' WHEN 'FR' THEN 'France'
      WHEN 'CA' THEN 'Canada' WHEN 'AU' THEN 'Australia' WHEN 'IN' THEN 'India'
      WHEN 'NL' THEN 'Netherlands' WHEN 'ES' THEN 'Spain' WHEN 'IT' THEN 'Italy'
      WHEN 'BR' THEN 'Brazil' WHEN 'JP' THEN 'Japan' WHEN 'KR' THEN 'South Korea'
      WHEN 'SG' THEN 'Singapore' WHEN 'IE' THEN 'Ireland' WHEN 'SE' THEN 'Sweden'
      WHEN 'NO' THEN 'Norway' WHEN 'DK' THEN 'Denmark' WHEN 'FI' THEN 'Finland'
      WHEN 'CH' THEN 'Switzerland' WHEN 'AT' THEN 'Austria' WHEN 'BE' THEN 'Belgium'
      WHEN 'PL' THEN 'Poland' WHEN 'CZ' THEN 'Czech Republic' WHEN 'PT' THEN 'Portugal'
      WHEN 'IL' THEN 'Israel' WHEN 'MX' THEN 'Mexico' WHEN 'AR' THEN 'Argentina'
      WHEN 'CO' THEN 'Colombia' WHEN 'CL' THEN 'Chile' WHEN 'ZA' THEN 'South Africa'
      WHEN 'NZ' THEN 'New Zealand' WHEN 'HK' THEN 'Hong Kong' WHEN 'TW' THEN 'Taiwan'
      WHEN 'PH' THEN 'Philippines' WHEN 'ID' THEN 'Indonesia' WHEN 'MY' THEN 'Malaysia'
      WHEN 'TH' THEN 'Thailand' WHEN 'VN' THEN 'Vietnam' WHEN 'AE' THEN 'UAE'
      WHEN 'SA' THEN 'Saudi Arabia' WHEN 'EG' THEN 'Egypt' WHEN 'NG' THEN 'Nigeria'
      WHEN 'KE' THEN 'Kenya' WHEN 'GH' THEN 'Ghana' WHEN 'RO' THEN 'Romania'
      WHEN 'HU' THEN 'Hungary' WHEN 'GR' THEN 'Greece' WHEN 'HR' THEN 'Croatia'
      WHEN 'UA' THEN 'Ukraine' WHEN 'RU' THEN 'Russia' WHEN 'TR' THEN 'Turkey'
      WHEN 'LT' THEN 'Lithuania' WHEN 'LV' THEN 'Latvia' WHEN 'EE' THEN 'Estonia'
      WHEN 'BG' THEN 'Bulgaria' WHEN 'RS' THEN 'Serbia' WHEN 'SK' THEN 'Slovakia'
      WHEN 'SI' THEN 'Slovenia' WHEN 'LU' THEN 'Luxembourg' WHEN 'MT' THEN 'Malta'
      WHEN 'CY' THEN 'Cyprus' WHEN 'IS' THEN 'Iceland' WHEN 'PE' THEN 'Peru'
      WHEN 'EC' THEN 'Ecuador' WHEN 'UY' THEN 'Uruguay' WHEN 'CR' THEN 'Costa Rica'
      WHEN 'PA' THEN 'Panama' WHEN 'DO' THEN 'Dominican Republic'
      WHEN 'PK' THEN 'Pakistan' WHEN 'BD' THEN 'Bangladesh' WHEN 'LK' THEN 'Sri Lanka'
      WHEN 'MM' THEN 'Myanmar' WHEN 'CN' THEN 'China' WHEN 'QA' THEN 'Qatar'
      WHEN 'BH' THEN 'Bahrain' WHEN 'KW' THEN 'Kuwait' WHEN 'OM' THEN 'Oman'
      WHEN 'JO' THEN 'Jordan' WHEN 'LB' THEN 'Lebanon'
      ELSE UPPER(TRIM(loc_country))
    END
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = false
      AND loc_country IS NOT NULL AND TRIM(loc_country) != '' AND loc_country != 'US'
      AND loc_city IS NOT NULL AND TRIM(loc_city) != ''
    RETURNING 1
  )
  SELECT v_structured + COUNT(*) INTO v_structured FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 5: US jobs with loc_state only (no city) → state name
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = CASE UPPER(TRIM(loc_state))
      WHEN 'AL' THEN 'Alabama' WHEN 'AK' THEN 'Alaska' WHEN 'AZ' THEN 'Arizona'
      WHEN 'AR' THEN 'Arkansas' WHEN 'CA' THEN 'California' WHEN 'CO' THEN 'Colorado'
      WHEN 'CT' THEN 'Connecticut' WHEN 'DE' THEN 'Delaware' WHEN 'FL' THEN 'Florida'
      WHEN 'GA' THEN 'Georgia' WHEN 'HI' THEN 'Hawaii' WHEN 'ID' THEN 'Idaho'
      WHEN 'IL' THEN 'Illinois' WHEN 'IN' THEN 'Indiana' WHEN 'IA' THEN 'Iowa'
      WHEN 'KS' THEN 'Kansas' WHEN 'KY' THEN 'Kentucky' WHEN 'LA' THEN 'Louisiana'
      WHEN 'ME' THEN 'Maine' WHEN 'MD' THEN 'Maryland' WHEN 'MA' THEN 'Massachusetts'
      WHEN 'MI' THEN 'Michigan' WHEN 'MN' THEN 'Minnesota' WHEN 'MS' THEN 'Mississippi'
      WHEN 'MO' THEN 'Missouri' WHEN 'MT' THEN 'Montana' WHEN 'NE' THEN 'Nebraska'
      WHEN 'NV' THEN 'Nevada' WHEN 'NH' THEN 'New Hampshire' WHEN 'NJ' THEN 'New Jersey'
      WHEN 'NM' THEN 'New Mexico' WHEN 'NY' THEN 'New York' WHEN 'NC' THEN 'North Carolina'
      WHEN 'ND' THEN 'North Dakota' WHEN 'OH' THEN 'Ohio' WHEN 'OK' THEN 'Oklahoma'
      WHEN 'OR' THEN 'Oregon' WHEN 'PA' THEN 'Pennsylvania' WHEN 'RI' THEN 'Rhode Island'
      WHEN 'SC' THEN 'South Carolina' WHEN 'SD' THEN 'South Dakota' WHEN 'TN' THEN 'Tennessee'
      WHEN 'TX' THEN 'Texas' WHEN 'UT' THEN 'Utah' WHEN 'VT' THEN 'Vermont'
      WHEN 'VA' THEN 'Virginia' WHEN 'WA' THEN 'Washington' WHEN 'WV' THEN 'West Virginia'
      WHEN 'WI' THEN 'Wisconsin' WHEN 'WY' THEN 'Wyoming' WHEN 'DC' THEN 'District of Columbia'
      ELSE INITCAP(TRIM(loc_state))
    END
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = false
      AND loc_country = 'US'
      AND loc_state IS NOT NULL AND TRIM(loc_state) != ''
      AND (loc_city IS NULL OR TRIM(loc_city) = '')
    RETURNING 1
  )
  SELECT v_structured + COUNT(*) INTO v_structured FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 6: Country-only (no city) → country name
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = CASE UPPER(TRIM(loc_country))
      WHEN 'US' THEN 'United States'
      WHEN 'GB' THEN 'United Kingdom' WHEN 'DE' THEN 'Germany' WHEN 'FR' THEN 'France'
      WHEN 'CA' THEN 'Canada' WHEN 'AU' THEN 'Australia' WHEN 'IN' THEN 'India'
      WHEN 'NL' THEN 'Netherlands' WHEN 'ES' THEN 'Spain' WHEN 'IT' THEN 'Italy'
      WHEN 'BR' THEN 'Brazil' WHEN 'JP' THEN 'Japan' WHEN 'KR' THEN 'South Korea'
      WHEN 'SG' THEN 'Singapore' WHEN 'IE' THEN 'Ireland' WHEN 'SE' THEN 'Sweden'
      WHEN 'CH' THEN 'Switzerland' WHEN 'PL' THEN 'Poland' WHEN 'IL' THEN 'Israel'
      WHEN 'MX' THEN 'Mexico' WHEN 'CO' THEN 'Colombia' WHEN 'ZA' THEN 'South Africa'
      WHEN 'NZ' THEN 'New Zealand' WHEN 'HK' THEN 'Hong Kong' WHEN 'AE' THEN 'UAE'
      WHEN 'RO' THEN 'Romania' WHEN 'UA' THEN 'Ukraine' WHEN 'TR' THEN 'Turkey'
      WHEN 'CN' THEN 'China' WHEN 'PH' THEN 'Philippines'
      ELSE UPPER(TRIM(loc_country))
    END
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = false
      AND loc_country IS NOT NULL AND TRIM(loc_country) != ''
      AND (loc_city IS NULL OR TRIM(loc_city) = '')
      AND (loc_state IS NULL OR TRIM(loc_state) = '')
    RETURNING 1
  )
  SELECT v_structured + COUNT(*) INTO v_structured FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 7: USAJobs pattern — location field is "City, State" already
  -- Parse directly: "Fort Worth, Texas" → "Fort Worth, Texas"
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = INITCAP(TRIM(location))
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND ats_source = 'usajobs'
      AND location IS NOT NULL
      AND TRIM(location) != ''
      AND location NOT ILIKE '%multiple%'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_usajobs FROM updated;

  -- ═══════════════════════════════════════════════════════════
  -- PASS 8: Pattern match on location text for remaining gaps
  -- "City, State, United States" → "City, State"
  -- "City, State Name, Country" for GH format
  -- ═══════════════════════════════════════════════════════════
  WITH updated AS (
    UPDATE ats_jobs
    SET location_normalized = CASE
      -- "City, State, United States" → extract first two parts
      WHEN location ~ '^[A-Za-z .-]+, [A-Za-z ]+, United States$' THEN
        INITCAP(TRIM(SPLIT_PART(location, ',', 1))) || ',' || INITCAP(TRIM(SPLIT_PART(location, ',', 2)))
      -- "City, ST" (2-letter state code) → expand
      WHEN location ~ '^[A-Za-z .-]+, [A-Z]{2}$' THEN
        INITCAP(TRIM(SPLIT_PART(location, ',', 1))) || ', ' || CASE UPPER(TRIM(SPLIT_PART(location, ',', 2)))
          WHEN 'AL' THEN 'Alabama' WHEN 'AK' THEN 'Alaska' WHEN 'AZ' THEN 'Arizona'
          WHEN 'AR' THEN 'Arkansas' WHEN 'CA' THEN 'California' WHEN 'CO' THEN 'Colorado'
          WHEN 'CT' THEN 'Connecticut' WHEN 'DE' THEN 'Delaware' WHEN 'FL' THEN 'Florida'
          WHEN 'GA' THEN 'Georgia' WHEN 'HI' THEN 'Hawaii' WHEN 'ID' THEN 'Idaho'
          WHEN 'IL' THEN 'Illinois' WHEN 'IN' THEN 'Indiana' WHEN 'IA' THEN 'Iowa'
          WHEN 'KS' THEN 'Kansas' WHEN 'KY' THEN 'Kentucky' WHEN 'LA' THEN 'Louisiana'
          WHEN 'ME' THEN 'Maine' WHEN 'MD' THEN 'Maryland' WHEN 'MA' THEN 'Massachusetts'
          WHEN 'MI' THEN 'Michigan' WHEN 'MN' THEN 'Minnesota' WHEN 'MS' THEN 'Mississippi'
          WHEN 'MO' THEN 'Missouri' WHEN 'MT' THEN 'Montana' WHEN 'NE' THEN 'Nebraska'
          WHEN 'NV' THEN 'Nevada' WHEN 'NH' THEN 'New Hampshire' WHEN 'NJ' THEN 'New Jersey'
          WHEN 'NM' THEN 'New Mexico' WHEN 'NY' THEN 'New York' WHEN 'NC' THEN 'North Carolina'
          WHEN 'ND' THEN 'North Dakota' WHEN 'OH' THEN 'Ohio' WHEN 'OK' THEN 'Oklahoma'
          WHEN 'OR' THEN 'Oregon' WHEN 'PA' THEN 'Pennsylvania' WHEN 'RI' THEN 'Rhode Island'
          WHEN 'SC' THEN 'South Carolina' WHEN 'SD' THEN 'South Dakota' WHEN 'TN' THEN 'Tennessee'
          WHEN 'TX' THEN 'Texas' WHEN 'UT' THEN 'Utah' WHEN 'VT' THEN 'Vermont'
          WHEN 'VA' THEN 'Virginia' WHEN 'WA' THEN 'Washington' WHEN 'WV' THEN 'West Virginia'
          WHEN 'WI' THEN 'Wisconsin' WHEN 'WY' THEN 'Wyoming' WHEN 'DC' THEN 'District of Columbia'
          ELSE TRIM(SPLIT_PART(location, ',', 2))
        END
      ELSE NULL
    END
    WHERE status = 'open'
      AND location_normalized IS NULL
      AND is_remote = false
      AND location IS NOT NULL
      AND TRIM(location) != ''
      AND (
        location ~ '^[A-Za-z .-]+, [A-Za-z ]+, United States$'
        OR location ~ '^[A-Za-z .-]+, [A-Z]{2}$'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_pattern FROM updated;

  RETURN jsonb_build_object(
    'updated', v_remote + v_structured + v_usajobs + v_pattern,
    'remote_set', v_remote,
    'structured_set', v_structured,
    'usajobs_set', v_usajobs,
    'pattern_set', v_pattern
  );
END;
$$;
