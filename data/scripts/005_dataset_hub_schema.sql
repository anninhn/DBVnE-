-- 005_dataset_hub_schema.sql
-- F1 — Dataset Catalog & Listing (specs/2026-06-24-dataset-catalog/)
--
-- Replaces the entity-centric schema (era "34 Tỉnh wiki") with the dataset-centric
-- schema from constitution/tech-stack.md Data Model.
--
-- DROPS (legacy, superseded):
--   resources           — files attached to PROVINCES (replaced by new dataset-keyed resources)
--   resource_versions   — depended on dropped resources
--   indicator_metadata  — flat indicator list (replaced by data_dictionary)
--
-- KEEPS (still used — seed in 006 reads from these):
--   entities_catalog, province_stats, wards, leadership, tags
--
-- CREATES:
--   datasets, resources (dataset-keyed), data_dictionary, upload_log
--
-- Deviations from constitution/tech-stack.md (see requirements.md §5.1):
--   datasets: +downloads, +likes ; -quality_score, -last_verified_at

BEGIN;

-- ─── Drop legacy entity-centric tables ──────────────────────────────────────
DROP TABLE IF EXISTS resource_versions CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS indicator_metadata CASCADE;

-- ─── datasets ───────────────────────────────────────────────────────────────
CREATE TABLE datasets (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    tags            TEXT[] DEFAULT '{}',
    license         VARCHAR(50),
    year_range      INT[],
    row_count       INT,
    file_count      INT,
    total_size_mb   NUMERIC,
    downloads       INT DEFAULT 0,
    likes           INT DEFAULT 0,
    source          TEXT,
    uploaded_by     VARCHAR(50) NOT NULL,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── resources (dataset-keyed) ──────────────────────────────────────────────
CREATE TABLE resources (
    id               SERIAL PRIMARY KEY,
    dataset_id       INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    resource_type    VARCHAR(30) NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT,
    file_url         TEXT,
    file_type        VARCHAR(10),
    file_size_mb     NUMERIC,
    file_hash        TEXT,
    structured_data  JSONB,
    columns          JSONB,
    row_count        INT,
    tags             TEXT[] DEFAULT '{}',
    year             INT,
    uploaded_by      VARCHAR(50) NOT NULL,
    uploaded_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resources_dataset        ON resources(dataset_id);
CREATE INDEX idx_resources_type           ON resources(resource_type);
CREATE INDEX idx_resources_tags_gin       ON resources USING gin(tags);
CREATE INDEX idx_resources_structured_gin ON resources USING gin(structured_data);

-- ─── data_dictionary ────────────────────────────────────────────────────────
CREATE TABLE data_dictionary (
    id               SERIAL PRIMARY KEY,
    dataset_id       INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    column_name      TEXT NOT NULL,
    label_vi         TEXT NOT NULL,
    data_type        VARCHAR(20),
    unit             TEXT,
    description      TEXT,
    source           TEXT,
    category         TEXT,
    validation_rules JSONB
);

CREATE INDEX idx_data_dictionary_dataset ON data_dictionary(dataset_id);

-- ─── upload_log (created now, populated by future upload feature) ────────────
CREATE TABLE upload_log (
    id              SERIAL PRIMARY KEY,
    dataset_id      INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    resource_id     INT REFERENCES resources(id) ON DELETE SET NULL,
    action          VARCHAR(20) NOT NULL,
    changed_by      VARCHAR(50) NOT NULL,
    changed_at      TIMESTAMPTZ DEFAULT NOW(),
    change_note     TEXT,
    snapshot_before JSONB,
    snapshot_after  JSONB
);

CREATE INDEX idx_upload_log_dataset ON upload_log(dataset_id);

COMMIT;
