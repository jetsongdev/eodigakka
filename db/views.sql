CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dong_stats AS
SELECT
  bjd_code,
  CASE WHEN area_m2 < 60 THEN 'S' WHEN area_m2 < 85 THEN 'M' ELSE 'L' END AS size_bucket,
  'TRADE' AS mode,
  COUNT(*) AS tx_count_3m,
  COUNT(DISTINCT complex_name) AS unique_complex_3m,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_man)  AS median_man,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_man) AS p25_man,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_man) AS p75_man,
  MAX(contract_date) AS last_contract_date,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY build_year) AS median_build_year,
  STDDEV(build_year) AS build_year_stddev,
  CASE
    WHEN COUNT(*) >= 10 THEN 'high'
    WHEN COUNT(*) >= 3  THEN 'low'
    ELSE 'insufficient'
  END AS confidence
FROM tx_apt_trade
WHERE contract_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY bjd_code, size_bucket
UNION ALL
SELECT
  bjd_code,
  CASE WHEN area_m2 < 60 THEN 'S' WHEN area_m2 < 85 THEN 'M' ELSE 'L' END AS size_bucket,
  'JEONSE' AS mode,
  COUNT(*) AS tx_count_3m,
  COUNT(DISTINCT complex_name) AS unique_complex_3m,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY deposit_man)  AS median_man,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY deposit_man) AS p25_man,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY deposit_man) AS p75_man,
  MAX(contract_date) AS last_contract_date,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY build_year) AS median_build_year,
  STDDEV(build_year) AS build_year_stddev,
  CASE
    WHEN COUNT(*) >= 10 THEN 'high'
    WHEN COUNT(*) >= 3  THEN 'low'
    ELSE 'insufficient'
  END AS confidence
FROM tx_apt_rent
WHERE contract_date >= CURRENT_DATE - INTERVAL '3 months'
  AND monthly_man = 0
GROUP BY bjd_code, size_bucket;

CREATE UNIQUE INDEX IF NOT EXISTS mv_dong_stats_bjd_code_size_bucket_mode_idx
  ON mv_dong_stats (bjd_code, size_bucket, mode);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_jeonse_ratio AS
SELECT
  t.bjd_code,
  t.size_bucket,
  t.median_man AS sale_median,
  j.median_man AS jeonse_median,
  j.median_man::FLOAT / NULLIF(t.median_man, 0) AS ratio
FROM mv_dong_stats t
JOIN mv_dong_stats j USING (bjd_code, size_bucket)
WHERE t.mode = 'TRADE' AND j.mode = 'JEONSE';

CREATE UNIQUE INDEX IF NOT EXISTS mv_jeonse_ratio_bjd_code_size_bucket_idx
  ON mv_jeonse_ratio (bjd_code, size_bucket);
