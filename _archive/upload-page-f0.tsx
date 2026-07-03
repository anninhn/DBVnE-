"use client";

import { useState } from "react";

interface Province {
  entity_id: string;
  entity_name: string;
}

export default function UploadPage() {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Load provinces on focus
  async function loadProvinces() {
    if (loaded) return;
    const res = await fetch("/api/entities");
    const data = await res.json();
    setProvinces(data);
    setLoaded(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const entityId = formData.get("entity_id") as string;
    const title = formData.get("title") as string;
    const resourceType = formData.get("resource_type") as string;
    const year = formData.get("year") as string;
    const source = formData.get("source") as string;
    const description = formData.get("description") as string;
    const uploadedBy = formData.get("uploaded_by") as string;
    const tagsRaw = formData.get("tags") as string;
    const jsonData = formData.get("structured_data") as string;
    const file = formData.get("file") as File | null;

    let fileUrl: string | null = null;
    let fileType: string | null = null;
    let fileSizeMb: number | null = null;

    // Upload file trước nếu có
    if (file && file.size > 0) {
      try {
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        uploadForm.append("entity_id", entityId);
        if (year) uploadForm.append("year", year);

        const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadForm });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          setResult({ ok: false, message: uploadData.error });
          setSubmitting(false);
          return;
        }

        fileUrl = uploadData.file_url;
        fileType = uploadData.file_type;
        fileSizeMb = uploadData.file_size_mb;
      } catch {
        setResult({ ok: false, message: "File upload failed" });
        setSubmitting(false);
        return;
      }
    }

    // Tạo resource
    let structuredData = null;
    if (jsonData.trim()) {
      try {
        structuredData = JSON.parse(jsonData);
      } catch {
        setResult({ ok: false, message: "JSON không hợp lệ" });
        setSubmitting(false);
        return;
      }
    }

    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: entityId,
          resource_type: resourceType,
          title,
          year: year ? parseInt(year) : null,
          structured_data: structuredData,
          file_url: fileUrl,
          file_type: fileType,
          file_size_mb: fileSizeMb,
          source,
          description,
          tags,
          uploaded_by: uploadedBy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `Tạo resource #${data.id} thành công!` });
        form.reset();
      } else {
        setResult({ ok: false, message: data.error });
      }
    } catch {
      setResult({ ok: false, message: "Request failed" });
    }

    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Upload tài nguyên</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Entity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tỉnh thành *
            </label>
            <select
              name="entity_id"
              required
              onFocus={loadProvinces}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">-- Chọn tỉnh --</option>
              {provinces.map((p) => (
                <option key={p.entity_id} value={p.entity_id}>
                  {p.entity_name} ({p.entity_id})
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tiêu đề *
            </label>
            <input
              name="title"
              required
              placeholder="GRDP growth rate 2020-2025"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Type + Year */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loại tài nguyên *
              </label>
              <select
                name="resource_type"
                required
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="indicator">Chỉ số</option>
                <option value="ranking">Xếp hạng</option>
                <option value="document">Tài liệu</option>
                <option value="audio">Ghi âm</option>
                <option value="dataset">Dataset</option>
                <option value="geo_layer">Bản đồ</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Năm
              </label>
              <input
                name="year"
                type="number"
                placeholder="2024"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Structured data */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dữ liệu cấu trúc (JSON)
            </label>
            <textarea
              name="structured_data"
              rows={4}
              placeholder='{"grdp_growth": 7.2, "population": 1200000}'
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File đính kèm
            </label>
            <input
              name="file"
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.docx,.mp3,.wav,.geojson,.json"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Source + Tags */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nguồn
              </label>
              <input
                name="source"
                placeholder="Niên giám thống kê 2024"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (phẩy)
              </label>
              <input
                name="tags"
                placeholder="vĩ mô, GRDP"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ghi chú
            </label>
            <textarea
              name="description"
              rows={2}
              placeholder="Mô tả ngắn hoặc ghi chú"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Uploaded by */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Người nhập *
            </label>
            <input
              name="uploaded_by"
              required
              placeholder="Ninh"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? "Đang upload..." : "Tạo tài nguyên"}
          </button>

          {/* Result */}
          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {result.message}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
