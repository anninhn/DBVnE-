-- 34 Tỉnh Thành — Wiki Architecture Schema
-- Chạy trên Supabase SQL Editor

-- Bật UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DANH MỤC THỰC THỂ (34 tỉnh, vùng, quốc gia, ngành)
CREATE TABLE entities_catalog (
    entity_id VARCHAR(50) PRIMARY KEY,
    entity_name VARCHAR(150) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,     -- 'PROVINCE', 'REGION', 'NATIONAL', 'SECTOR'
    old_codes TEXT[] DEFAULT '{}',         -- Pre-merger codes
    region TEXT,                           -- Vùng (ĐNB, ĐBSCL...) — chỉ cho PROVINCE
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG TRUNG TÂM: MỌI TÀI NGUYÊN
CREATE TABLE resources (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(50) NOT NULL REFERENCES entities_catalog(entity_id) ON DELETE CASCADE,
    resource_type VARCHAR(30) NOT NULL,    -- 'indicator', 'ranking', 'document', 'audio', 'dataset', 'geo_layer'
    title TEXT NOT NULL,
    year INT,
    structured_data JSONB,                 -- {"grdp_growth": 7.2, "unit": "%"}
    file_url TEXT,                         -- Object Storage URL
    file_type VARCHAR(10),                 -- pdf, xlsx, mp3, docx, geojson
    file_size_mb NUMERIC,
    source TEXT,                           -- 'Niên giám thống kê 2024'
    description TEXT,                      -- Ghi chú phóng viên
    tags TEXT[] DEFAULT '{}',
    uploaded_by VARCHAR(50) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resources_entity ON resources(entity_id);
CREATE INDEX idx_resources_type ON resources(resource_type);
CREATE INDEX idx_resources_year ON resources(year);
CREATE INDEX idx_resources_tags_gin ON resources USING gin(tags);
CREATE INDEX idx_resources_structured_gin ON resources USING gin(structured_data);

-- 3. VERSION HISTORY (lineage kiểu Git nhẹ)
CREATE TABLE resource_versions (
    id SERIAL PRIMARY KEY,
    resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    version INT NOT NULL,
    snapshot JSONB NOT NULL,               -- Snapshot toàn bộ resource lúc commit
    file_url TEXT,
    changed_by VARCHAR(50) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_note TEXT,
    UNIQUE(resource_id, version)
);

-- 4. DATA DICTIONARY (từ điển chỉ số)
CREATE TABLE indicator_metadata (
    key TEXT PRIMARY KEY,                  -- 'grdp_growth'
    name_vi TEXT NOT NULL,                 -- 'Tốc độ tăng trưởng GRDP'
    unit TEXT,                             -- '%', 'tỷ đồng', 'người'
    description TEXT,
    source TEXT,                           -- Nguồn tiêu chuẩn
    category TEXT                          -- 'vĩ mô', 'giáo dục', 'y tế', 'xếp hạng'
);

-- 5. CONTROLLED TAGS
CREATE TABLE tags (
    slug TEXT PRIMARY KEY,                 -- 'vi-mo'
    name TEXT NOT NULL,                    -- 'Vĩ mô'
    category TEXT                          -- 'loại dữ liệu', 'lĩnh vực', 'nguồn'
);

-- Cập nhật updated_at tự động cho resources
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.uploaded_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
