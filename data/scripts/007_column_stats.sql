-- 007_column_stats.sql
-- Feature: Column Statistics (specs/2026-06-24-column-statistics/)
--
-- Adds resources.column_stats JSONB and populates it for the 3 hero resources,
-- computed over the FULL typed tables (not the 10-row preview).
--
-- Numeric columns: {min, max, histogram:[8 counts]}
-- Categorical:     {distinct, segments:[{label,count}, ...top 12]}
--
-- Run AFTER 005 + 006.

-- Helper: numeric stats (min, max, 8-bin histogram) for one column of one table.
-- Returns jsonb. Pass table name + column name as text; uses dynamic SQL.
CREATE OR REPLACE FUNCTION compute_numeric_stats(p_table text, p_column text, p_where text DEFAULT '')
RETURNS jsonb AS $$
DECLARE
    vmin double precision;
    vmax double precision;
    bins int[];
    step double precision;
    counts int[] := ARRAY[0,0,0,0,0,0,0,0];
    v double precision;
    idx int;
    q text;
    rec record;
BEGIN
    q := format('SELECT min(%I::double precision), max(%I::double precision) FROM %I %s',
                p_column, p_column, p_table,
                CASE WHEN p_where <> '' THEN 'WHERE '||p_where ELSE '' END);
    EXECUTE q INTO vmin, vmax;
    IF vmin IS NULL OR vmax IS NULL THEN
        RETURN NULL;
    END IF;
    IF vmax = vmin THEN
        -- tất cả giá trị bằng nhau → 1 bar ở bin cuối
        counts := ARRAY[0,0,0,0,0,0,0,1];
        RETURN jsonb_build_object('min', vmin, 'max', vmax, 'histogram', counts);
    END IF;
    step := (vmax - vmin) / 8.0;
    q := format('SELECT %I::double precision AS v FROM %I %s',
                p_column, p_table,
                CASE WHEN p_where <> '' THEN 'WHERE '||p_where ELSE '' END);
    FOR rec IN EXECUTE q LOOP
        v := rec.v;
        IF v IS NULL THEN CONTINUE; END IF;
        idx := floor((v - vmin) / step)::int + 1;
        IF idx < 1 THEN idx := 1; END IF;
        IF idx > 8 THEN idx := 8; END IF;
        counts[idx] := counts[idx] + 1;
    END LOOP;
    RETURN jsonb_build_object('min', vmin, 'max', vmax, 'histogram', counts);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper: categorical stats (distinct count + top 12 segments).
-- p_value_expr là biểu thức SQL để render label (vd: CASE WHEN is_merged THEN 'Có' ELSE 'Không' END).
CREATE OR REPLACE FUNCTION compute_categorical_stats(p_table text, p_value_expr text, p_where text DEFAULT '')
RETURNS jsonb AS $$
DECLARE
    v_distinct int;
    v_segments jsonb;
    q text;
BEGIN
    -- distinct count
    q := format('SELECT count(DISTINCT v) FROM (SELECT (%s) AS v FROM %I %s) t WHERE v IS NOT NULL',
                p_value_expr, p_table,
                CASE WHEN p_where <> '' THEN 'WHERE '||p_where ELSE '' END);
    EXECUTE q INTO v_distinct;

    -- top-12 segments by count
    q := format(
        'SELECT COALESCE(jsonb_agg(jsonb_build_object(''label'', label, ''count'', cnt) ORDER BY cnt DESC, label ASC), ''[]''::jsonb)
         FROM (
             SELECT v AS label, count(*) AS cnt
             FROM (SELECT (%s) AS v FROM %I %s) t WHERE v IS NOT NULL
             GROUP BY v
         ) s',
        p_value_expr, p_table,
        CASE WHEN p_where <> '' THEN 'WHERE '||p_where ELSE '' END
    );
    EXECUTE q INTO v_segments;

    RETURN jsonb_build_object('distinct', v_distinct, 'segments', v_segments);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── Apply column to table ──────────────────────────────────────────────────
ALTER TABLE resources ADD COLUMN IF NOT EXISTS column_stats JSONB;

-- ─── Resource 1: province_stats (34 rows) ───────────────────────────────────
UPDATE resources SET column_stats = jsonb_build_object(
    'entity_id',     compute_categorical_stats('province_stats', 'entity_id'),
    'year',          compute_numeric_stats('province_stats', 'year'),
    'population',    compute_numeric_stats('province_stats', 'population'),
    'area',          compute_numeric_stats('province_stats', 'area'),
    'density',       compute_numeric_stats('province_stats', 'density'),
    'num_wards',     compute_numeric_stats('province_stats', 'num_wards'),
    'grdp',          compute_numeric_stats('province_stats', 'grdp'),
    'budget_revenue',compute_numeric_stats('province_stats', 'budget_revenue'),
    'rank_grdp',     compute_numeric_stats('province_stats', 'rank_grdp'),
    'is_merged',     compute_categorical_stats('province_stats',
        'CASE WHEN is_merged THEN ''Có'' ELSE ''Không'' END')
) WHERE title = 'Thống kê kinh tế - xã hội 34 tỉnh';

-- ─── Resource 2: wards (HCM only — 168 rows) ────────────────────────────────
UPDATE resources SET column_stats = jsonb_build_object(
    'entity_id',   compute_categorical_stats('wards', 'entity_id', 'entity_id = ''VN-HCM'''),
    'ward_name',   compute_categorical_stats('wards', 'ward_name', 'entity_id = ''VN-HCM'''),
    'ward_type',   compute_categorical_stats('wards', 'ward_type', 'entity_id = ''VN-HCM'''),
    'population',  compute_numeric_stats('wards', 'population', 'entity_id = ''VN-HCM'''),
    'area',        compute_numeric_stats('wards', 'area', 'entity_id = ''VN-HCM'''),
    'density',     compute_numeric_stats('wards', 'density', 'entity_id = ''VN-HCM''')
) WHERE title = 'Xã phường mới sau sáp nhập (chi tiết TP HCM)';

-- ─── Resource 3: leadership (56 rows) ───────────────────────────────────────
UPDATE resources SET column_stats = jsonb_build_object(
    'entity_id', compute_categorical_stats('leadership', 'entity_id'),
    'role',      compute_categorical_stats('leadership', 'role'),
    'title',     compute_categorical_stats('leadership', 'title'),
    'name',      compute_categorical_stats('leadership', 'name')
) WHERE title = 'Lãnh đạo 34 tỉnh (bí thư, chủ tịch UBND)';

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- SELECT title, jsonb_object_keys(column_stats) FROM resources WHERE dataset_id=(SELECT id FROM datasets WHERE slug='ho-so-34-tinh-thanh-2025');
-- SELECT jsonb_pretty(column_stats->'population') FROM resources WHERE title='Thống kê kinh tế - xã hội 34 tỉnh';
