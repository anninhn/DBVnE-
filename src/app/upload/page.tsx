import UploadWizard from "@/components/upload/UploadWizard";

export const metadata = {
  title: "Upload Dataset · VnExpress Data",
};

export default function UploadPage() {
  return (
    <div className="min-h-[calc(100vh-52px)] bg-hf-bg-subtle">
      <div className="max-w-[1280px] mx-auto px-6 py-8">
        <header className="mb-6">
          <nav className="text-xs text-hf-text-faint mb-2">
            <a href="/" className="hover:text-hf-text-muted hover:underline">
              Catalog
            </a>
            <span className="mx-1">/</span>
            <span className="text-hf-text-muted">Upload</span>
          </nav>
          <h1 className="text-xl font-semibold text-hf-text">
            Upload Dataset{" "}
            <span className="text-hf-text-faint font-normal text-sm ml-2">
              AI hỗ trợ điền thông tin
            </span>
          </h1>
          <p className="text-sm text-hf-text-muted mt-1">
            Kéo thả file CSV/XLSX. AI sẽ đề xuất metadata và data dictionary
            — bạn xem lại và lưu.
          </p>
        </header>
        <UploadWizard />
      </div>
    </div>
  );
}
