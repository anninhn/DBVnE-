import UploadWizard from "@/components/upload/UploadWizard";
import CatalogNav from "@/components/CatalogNav";

export const metadata = {
  title: "Upload Dataset · VnExpress Data",
};

export default function UploadPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <CatalogNav />
      <div className="max-w-[1280px] mx-auto px-6 py-8 w-full flex-1">
        <header className="mb-6">
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
