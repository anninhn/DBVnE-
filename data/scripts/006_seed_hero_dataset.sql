-- 006_seed_hero_dataset.sql
-- F1 — Dataset Catalog & Listing (specs/2026-06-24-dataset-catalog/)
--
-- Seeds ONE real dataset to test the read-path end-to-end.
-- Pulls preview rows from the typed tables (province_stats / wards / leadership),
-- which must already be populated (by 004_seed_34tinh_full.sql).
--
-- Run AFTER 005_dataset_hub_schema.sql.
--
-- column_stats: each resource also gets precomputed per-column statistics over
-- the FULL typed table (not the 10-row preview), so the Dataset Viewer charts
-- reflect the true distribution. Stats helpers defined inline below (same as
-- 007_column_stats.sql). See specs/2026-06-24-column-statistics/.

BEGIN;

-- ─── 0. Stats helpers (same as 007_column_stats.sql — keep 006 self-sufficient) ──
CREATE OR REPLACE FUNCTION compute_numeric_stats(p_table text, p_column text, p_where text DEFAULT '')
RETURNS jsonb AS $$
DECLARE
    vmin double precision; vmax double precision; step double precision;
    counts int[] := ARRAY[0,0,0,0,0,0,0,0]; v double precision; idx int; q text; rec record;
BEGIN
    q := format('SELECT min(%I::double precision), max(%I::double precision) FROM %I %s',
                p_column, p_column, p_table, CASE WHEN p_where<>'' THEN 'WHERE '||p_where ELSE '' END);
    EXECUTE q INTO vmin, vmax;
    IF vmin IS NULL OR vmax IS NULL THEN RETURN NULL; END IF;
    IF vmax = vmin THEN RETURN jsonb_build_object('min',vmin,'max',vmax,'histogram',ARRAY[0,0,0,0,0,0,0,1]); END IF;
    step := (vmax - vmin) / 8.0;
    q := format('SELECT %I::double precision AS v FROM %I %s', p_column, p_table,
                CASE WHEN p_where<>'' THEN 'WHERE '||p_where ELSE '' END);
    FOR rec IN EXECUTE q LOOP
        v := rec.v; IF v IS NULL THEN CONTINUE; END IF;
        idx := floor((v - vmin)/step)::int + 1;
        IF idx<1 THEN idx:=1; ELSIF idx>8 THEN idx:=8; END IF;
        counts[idx] := counts[idx] + 1;
    END LOOP;
    RETURN jsonb_build_object('min',vmin,'max',vmax,'histogram',counts);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION compute_categorical_stats(p_table text, p_value_expr text, p_where text DEFAULT '')
RETURNS jsonb AS $$
DECLARE v_distinct int; v_segments jsonb; q text;
BEGIN
    q := format('SELECT count(DISTINCT v) FROM (SELECT (%s) AS v FROM %I %s) t WHERE v IS NOT NULL',
                p_value_expr, p_table, CASE WHEN p_where<>'' THEN 'WHERE '||p_where ELSE '' END);
    EXECUTE q INTO v_distinct;
    q := format('SELECT COALESCE(jsonb_agg(jsonb_build_object(''label'',label,''count'',cnt) ORDER BY cnt DESC, label ASC), ''[]''::jsonb) FROM (SELECT v AS label, count(*) AS cnt FROM (SELECT (%s) AS v FROM %I %s) t WHERE v IS NOT NULL GROUP BY v) s',
                p_value_expr, p_table, CASE WHEN p_where<>'' THEN 'WHERE '||p_where ELSE '' END);
    EXECUTE q INTO v_segments;
    RETURN jsonb_build_object('distinct', v_distinct, 'segments', v_segments);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 1. The dataset ─────────────────────────────────────────────────────────
INSERT INTO datasets (
    slug, title, description, category, tags, license, year_range,
    row_count, file_count, total_size_mb, downloads, likes, source, uploaded_by
) VALUES (
    'ho-so-34-tinh-thanh-2025',
    'Hồ sơ 34 tỉnh thành 2025',
    'Bộ dữ liệu nền dùng chung cho 34 tỉnh, thành Việt Nam sau sáp nhập hành chính 2025. Gồm thống kê kinh tế - xã hội (dân số, diện tích, GRDP, ngân sách, hạ tầng), danh sách xã/phường mới, và lãnh đạo (bí thư, chủ tịch UBND). Đơn vị phân tích: 34 tỉnh. Nguồn: Tổng cục Thống kê + báo cáo chính thức của các tỉnh.',
    'xa-hoi',
    ARRAY['vĩ mô','dân số','GRDP','hành chính','sáp nhập 2025','lãnh đạo'],
    'internal',
    ARRAY[2025],
    258, 3, 2.4, 142, 34,
    'Tổng cục Thống kê + báo cáo UBND các tỉnh (2025)',
    'Ninh'
)
ON CONFLICT (slug) DO NOTHING
RETURNING id AS ds_id \gset

-- \gset captures the RETURNING id into :ds_id for use below.
-- If running via Supabase Studio (no psql \gset), replace :ds_id references below
-- with a subquery: (SELECT id FROM datasets WHERE slug = 'ho-so-34-tinh-thanh-2025')

-- ─── 2. Resources (preview rows from typed tables) ──────────────────────────

-- Resource 1: province_stats preview (first 10 provinces by entity_id)
INSERT INTO resources (
    dataset_id, resource_type, title, description, file_type, file_size_mb,
    structured_data, columns, column_stats, row_count, tags, year, uploaded_by
) VALUES (
    :ds_id,
    'data',
    'Thống kê kinh tế - xã hội 34 tỉnh',
    'Dân số, diện tích, mật độ, số đơn vị cấp xã, GRDP, thu ngân sách, cảng biển, sân bay, thứ hạng.',
    'csv', 0.4,
    (SELECT jsonb_agg(to_jsonb(t) - 'created_at' ORDER BY t.entity_id)
     FROM (SELECT entity_id, year, population, area, density, num_wards,
                  grdp, budget_revenue, rank_grdp, is_merged
           FROM province_stats ORDER BY entity_id LIMIT 10) t),
    '[
        {"name":"entity_id","type":"text","label_vi":"Mã tỉnh"},
        {"name":"year","type":"int","label_vi":"Năm"},
        {"name":"population","type":"int","label_vi":"Dân số","unit":"người"},
        {"name":"area","type":"float","label_vi":"Diện tích","unit":"km²"},
        {"name":"density","type":"float","label_vi":"Mật độ","unit":"người/km²"},
        {"name":"num_wards","type":"int","label_vi":"Số đơn vị cấp xã"},
        {"name":"grdp","type":"float","label_vi":"GRDP","unit":"tỷ đồng"},
        {"name":"budget_revenue","type":"float","label_vi":"Thu ngân sách","unit":"tỷ đồng"},
        {"name":"rank_grdp","type":"int","label_vi":"Hạng GRDP"},
        {"name":"is_merged","type":"text","label_vi":"Có sáp nhập"}
    ]'::jsonb,
    jsonb_build_object(
        'entity_id',     compute_categorical_stats('province_stats', 'entity_id'),
        'year',          compute_numeric_stats('province_stats', 'year'),
        'population',    compute_numeric_stats('province_stats', 'population'),
        'area',          compute_numeric_stats('province_stats', 'area'),
        'density',       compute_numeric_stats('province_stats', 'density'),
        'num_wards',     compute_numeric_stats('province_stats', 'num_wards'),
        'grdp',          compute_numeric_stats('province_stats', 'grdp'),
        'budget_revenue',compute_numeric_stats('province_stats', 'budget_revenue'),
        'rank_grdp',     compute_numeric_stats('province_stats', 'rank_grdp'),
        'is_merged',     compute_categorical_stats('province_stats', 'CASE WHEN is_merged THEN ''Có'' ELSE ''Không'' END')
    ),
    (SELECT count(*) FROM province_stats),
    ARRAY['vĩ mô','GRDP'],
    2025,
    'Ninh'
);

-- Resource 2: wards preview (first 10 HCM wards)
INSERT INTO resources (
    dataset_id, resource_type, title, description, file_type, file_size_mb,
    structured_data, columns, column_stats, row_count, tags, year, uploaded_by
) VALUES (
    :ds_id,
    'data',
    'Xã phường mới sau sáp nhập (chi tiết TP HCM)',
    '168 xã/phường TP HCM với dân số, diện tích, trụ sở hành chính, tọa độ. Các tỉnh khác chỉ có số lượng tổng hợp.',
    'csv', 1.6,
    (SELECT jsonb_agg(to_jsonb(t) - 'created_at' ORDER BY t.ward_name)
     FROM (SELECT entity_id, ward_name, ward_type, old_wards, population, area,
                  density, hq_name
           FROM wards WHERE entity_id = 'VN-HCM' ORDER BY ward_name LIMIT 10) t),
    '[
        {"name":"entity_id","type":"text","label_vi":"Mã tỉnh"},
        {"name":"ward_name","type":"text","label_vi":"Tên xã/phường"},
        {"name":"ward_type","type":"text","label_vi":"Loại"},
        {"name":"old_wards","type":"text","label_vi":"Xã phường cũ"},
        {"name":"population","type":"int","label_vi":"Dân số","unit":"người"},
        {"name":"area","type":"float","label_vi":"Diện tích","unit":"km²"},
        {"name":"density","type":"float","label_vi":"Mật độ","unit":"người/km²"},
        {"name":"hq_name","type":"text","label_vi":"Trụ sở hành chính"}
    ]'::jsonb,
    jsonb_build_object(
        'entity_id',   compute_categorical_stats('wards', 'entity_id', 'entity_id = ''VN-HCM'''),
        'ward_name',   compute_categorical_stats('wards', 'ward_name', 'entity_id = ''VN-HCM'''),
        'ward_type',   compute_categorical_stats('wards', 'ward_type', 'entity_id = ''VN-HCM'''),
        'population',  compute_numeric_stats('wards', 'population', 'entity_id = ''VN-HCM'''),
        'area',        compute_numeric_stats('wards', 'area', 'entity_id = ''VN-HCM'''),
        'density',     compute_numeric_stats('wards', 'density', 'entity_id = ''VN-HCM''')
    ),
    (SELECT count(*) FROM wards WHERE entity_id = 'VN-HCM'),
    ARRAY['hành chính','sáp nhập 2025'],
    2025,
    'Ninh'
);

-- Resource 3: leadership preview (first 10 leaders)
INSERT INTO resources (
    dataset_id, resource_type, title, description, file_type, file_size_mb,
    structured_data, columns, column_stats, row_count, tags, year, uploaded_by
) VALUES (
    :ds_id,
    'data',
    'Lãnh đạo 34 tỉnh (bí thư, chủ tịch UBND)',
    'Bí thư và chủ tịch UBND các tỉnh thành sau sáp nhập, kèm chức danh đầy đủ và ảnh.',
    'csv', 0.4,
    (SELECT jsonb_agg(to_jsonb(t) - 'created_at' - 'photo_url' - 'deputies' ORDER BY t.entity_id, t.role)
     FROM (SELECT entity_id, role, title, name
           FROM leadership ORDER BY entity_id, role LIMIT 10) t),
    '[
        {"name":"entity_id","type":"text","label_vi":"Mã tỉnh"},
        {"name":"role","type":"text","label_vi":"Chức vụ"},
        {"name":"title","type":"text","label_vi":"Chức danh đầy đủ"},
        {"name":"name","type":"text","label_vi":"Họ tên"}
    ]'::jsonb,
    jsonb_build_object(
        'entity_id', compute_categorical_stats('leadership', 'entity_id'),
        'role',      compute_categorical_stats('leadership', 'role'),
        'title',     compute_categorical_stats('leadership', 'title'),
        'name',      compute_categorical_stats('leadership', 'name')
    ),
    (SELECT count(*) FROM leadership),
    ARRAY['lãnh đạo','chính trị'],
    2025,
    'Ninh'
);

-- ─── 3. Data dictionary (~25 column docs across the 3 resources) ────────────
INSERT INTO data_dictionary (dataset_id, column_name, label_vi, data_type, unit, description, source) VALUES
    (:ds_id, 'entity_id',      'Mã tỉnh',                'text',  NULL,         'Mã định danh tỉnh sau sáp nhập (VD: VN-HCM)', NULL),
    (:ds_id, 'year',           'Năm',                    'int',   NULL,         'Năm dữ liệu', NULL),
    (:ds_id, 'population',     'Dân số',                 'int',   'người',      'Tổng dân số', 'Thongtintinhthanh.Danso'),
    (:ds_id, 'area',           'Diện tích',              'float', 'km²',        'Diện tích tự nhiên', 'Thongtintinhthanh.Dientich'),
    (:ds_id, 'density',        'Mật độ',                 'float', 'người/km²',  'Tính = population / area', NULL),
    (:ds_id, 'num_wards',      'Số đơn vị cấp xã',       'int',   'đơn vị',     'Số xã/phường/thị trấn', 'Thongtintinhthanh.SoDVHCcapxa'),
    (:ds_id, 'grdp',           'GRDP',                   'float', 'tỷ đồng',    'Tổng sản phẩm trên địa bàn', 'Thongtintinhthanh.GRDP'),
    (:ds_id, 'budget_revenue', 'Thu ngân sách',          'float', 'tỷ đồng',    'Thu ngân sách nhà nước', 'Thongtintinhthanh.Thungansach'),
    (:ds_id, 'rank_grdp',      'Hạng GRDP',              'int',   NULL,         'Thứ hạng GRDP среди 34 tỉnh', 'Thongtintinhthanh.ThuhangGRDP'),
    (:ds_id, 'is_merged',      'Có sáp nhập',            'text',  NULL,         'Có / Không', NULL),
    (:ds_id, 'ward_name',      'Tên xã/phường',          'text',  NULL,         'Tên đơn vị cấp xã mới', NULL),
    (:ds_id, 'ward_type',      'Loại',                   'text',  NULL,         'Xã / Phường / Thị trấn', NULL),
    (:ds_id, 'old_wards',      'Xã phường cũ',           'text',  NULL,         'Danh sách trước sáp nhập', NULL),
    (:ds_id, 'hq_name',        'Trụ sở hành chính',      'text',  NULL,         'Tên trụ sở UBND xã/phường', NULL),
    (:ds_id, 'role',           'Chức vụ',                'text',  NULL,         'bí thư / chủ tịch', NULL),
    (:ds_id, 'title',          'Chức danh đầy đủ',       'text',  NULL,         'VD: Bí thư Thành ủy', NULL),
    (:ds_id, 'name',           'Họ tên',                 'text',  NULL,         'Họ tên lãnh đạo', NULL)
ON CONFLICT DO NOTHING;

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- SELECT slug, title, downloads, likes FROM datasets;
-- SELECT title, file_type, jsonb_array_length(structured_data) AS preview_rows FROM resources WHERE dataset_id = (SELECT id FROM datasets WHERE slug = 'ho-so-34-tinh-thanh-2025');
-- SELECT count(*) FROM data_dictionary WHERE dataset_id = (SELECT id FROM datasets WHERE slug = 'ho-so-34-tinh-thanh-2025');
