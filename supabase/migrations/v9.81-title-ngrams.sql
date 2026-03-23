-- v9.81: Job title ngrams table + refresh function
-- Precomputed ngrams (1-3 words) from open job titles, min 5 occurrences.
-- Used by Browse Job Titles modal instead of client-side computation.
-- Incremental update: run refresh_title_ngrams() after each ingestion batch.

CREATE TABLE IF NOT EXISTS job_title_ngrams (
  ngram text PRIMARY KEY,
  cnt   integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_title_ngrams_cnt_idx ON job_title_ngrams(cnt DESC);

-- Full refresh function — truncates and rebuilds from current open jobs
CREATE OR REPLACE FUNCTION refresh_title_ngrams()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  stop_words text[] := ARRAY[
    'a','an','the','and','or','of','in','at','for','to','with',
    'by','on','as','is','are','be','was','it','its','us','we',
    'our','from','into','per','via','vs','amp','ft','pt','de','la',
    'this','that','have','has','had','not','but','you','they'
  ];
BEGIN
  DELETE FROM job_title_ngrams;

  INSERT INTO job_title_ngrams(ngram, cnt, updated_at)
  SELECT ngram, count(*) AS cnt, now()
  FROM (
    -- Clean titles: remove parentheticals, years, punctuation
    SELECT lower(
      regexp_replace(
        regexp_replace(title,
          '\([^)]*\)|\[[^\]]*\]|\b(19|20)\d{2}\b|[-–|,/()\[\]]', ' ', 'g'),
        '[^a-zA-Z0-9 &+]', '', 'g')
    ) AS cleaned
    FROM ats_jobs
    WHERE status = 'open' AND title IS NOT NULL
  ) t
  CROSS JOIN LATERAL (
    SELECT array_to_string(words[i:i+n-1], ' ') AS ngram
    FROM (
      SELECT regexp_split_to_array(
        trim(regexp_replace(cleaned, '\s+', ' ', 'g')), ' '
      ) AS words
    ) w
    CROSS JOIN generate_series(1, 3) AS n
    CROSS JOIN generate_series(
      1,
      greatest(0,
        array_length(
          regexp_split_to_array(trim(regexp_replace(cleaned, '\s+', ' ', 'g')), ' '),
        1) - n + 1
      )
    ) AS i
    WHERE
      array_length(
        regexp_split_to_array(trim(regexp_replace(cleaned, '\s+', ' ', 'g')), ' '),
      1) >= n
  ) ngrams
  WHERE
    length(trim(ngram)) > 1
    AND trim(ngram) NOT IN (SELECT unnest(stop_words))
    AND ngram !~ '^\s*$'
    AND ngram !~ '^\d+$'
  GROUP BY ngram
  HAVING count(*) >= 5
  ON CONFLICT(ngram) DO UPDATE
    SET cnt = EXCLUDED.cnt, updated_at = now();
END;
$$;

-- Initial population
SELECT refresh_title_ngrams();
