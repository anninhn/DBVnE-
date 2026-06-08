export interface EntitiesCatalog {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  old_codes: string[];
  region: string | null;
  tags: string[];
  created_at: string;
}

export interface Resource {
  id: number;
  entity_id: string;
  resource_type: string;
  title: string;
  year: number | null;
  structured_data: Record<string, unknown> | null;
  file_url: string | null;
  file_type: string | null;
  file_size_mb: number | null;
  source: string | null;
  description: string | null;
  tags: string[];
  uploaded_by: string;
  uploaded_at: string;
}

export interface ResourceVersion {
  id: number;
  resource_id: number;
  version: number;
  snapshot: Record<string, unknown>;
  file_url: string | null;
  changed_by: string;
  changed_at: string;
  change_note: string | null;
}

export interface IndicatorMetadata {
  key: string;
  name_vi: string;
  unit: string | null;
  description: string | null;
  source: string | null;
  category: string | null;
}

export interface Tag {
  slug: string;
  name: string;
  category: string | null;
}
