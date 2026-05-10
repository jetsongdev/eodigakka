CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS tx_apt_trade (
  id            BIGSERIAL PRIMARY KEY,
  sigungu_code  CHAR(5)        NOT NULL,
  bjd_code      CHAR(10)       NOT NULL,
  complex_name  TEXT           NOT NULL,
  area_m2       NUMERIC(6,2)   NOT NULL,
  build_year    SMALLINT,
  floor         SMALLINT,
  price_man     INTEGER        NOT NULL,
  contract_date DATE           NOT NULL,
  source        TEXT           NOT NULL DEFAULT 'RTMS',
  fetched_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (bjd_code, complex_name, area_m2, floor, price_man, contract_date)
);
CREATE INDEX IF NOT EXISTS tx_apt_trade_bjd_code_contract_date_idx
  ON tx_apt_trade (bjd_code, contract_date);

CREATE TABLE IF NOT EXISTS tx_apt_rent (
  id            BIGSERIAL PRIMARY KEY,
  sigungu_code  CHAR(5)        NOT NULL,
  bjd_code      CHAR(10)       NOT NULL,
  complex_name  TEXT           NOT NULL,
  area_m2       NUMERIC(6,2)   NOT NULL,
  build_year    SMALLINT,
  floor         SMALLINT,
  deposit_man   INTEGER        NOT NULL,
  monthly_man   INTEGER        NOT NULL DEFAULT 0,
  contract_date DATE           NOT NULL,
  source        TEXT           NOT NULL DEFAULT 'RTMS',
  fetched_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (bjd_code, complex_name, area_m2, floor, deposit_man, monthly_man, contract_date)
);
CREATE INDEX IF NOT EXISTS tx_apt_rent_bjd_code_contract_date_idx
  ON tx_apt_rent (bjd_code, contract_date);

CREATE TABLE IF NOT EXISTS bjd_polygon (
  bjd_code  CHAR(10) PRIMARY KEY,
  bjd_name  TEXT NOT NULL,
  sido      TEXT NOT NULL,
  sigungu   TEXT NOT NULL,
  dong      TEXT NOT NULL,
  geom      GEOMETRY(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS bjd_polygon_geom_idx
  ON bjd_polygon USING GIST (geom);

CREATE TABLE IF NOT EXISTS etl_job_status (
  job_name                  TEXT        PRIMARY KEY,
  last_started_at           TIMESTAMPTZ,
  last_succeeded_at         TIMESTAMPTZ,
  mv_refreshed_at           TIMESTAMPTZ,
  last_error                TEXT,
  last_contract_date_trade  DATE,
  last_contract_date_rent   DATE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
