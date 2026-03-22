import { useState } from "react";
import { X, FileText, Image, Loader2, Camera } from "lucide-react";
import { exportMapAsPng } from "./ExportUtils";
import { exportMapAsScreenshot } from "./ExportUtilsScreenshot";

interface ReportGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  // Map element ref for PNG export
  mapRef: React.RefObject<HTMLDivElement>;
}

export default function ReportGenerator({
  isOpen,
  onClose,
  mapRef,
}: ReportGeneratorProps) {
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  // Export PNG (existing SVG-based method)
  const handleExportPng = async () => {
    if (!mapRef.current) return;

    setIsExportingPng(true);
    try {
      await exportMapAsPng(mapRef.current);
    } catch (error) {
      console.error("PNG export failed:", error);
      alert("Failed to export map. Please try again.");
    } finally {
      setIsExportingPng(false);
    }
  };

  // Test other export methods
  const handleTestExport = async () => {
    if (!mapRef.current) return;

    setIsTesting(true);
    try {
      await exportMapAsScreenshot(mapRef.current, "patent-map-test.png", {
        scale: 2, // 2x screen size = ~3900x1975 pixels
      });
    } catch (error) {
      console.error("Test export failed:", error);
      alert("Failed to export. Please try again.");
    } finally {
      setIsTesting(false);
    }
  };

  // Download PDF (static file)
  const handleDownloadPdf = () => {
    const link = document.createElement("a");
    link.href = "/demo-report.pdf";
    link.download = "patent-landscape-report.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Export & Report</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* PNG Export */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Export Map Image
            </h3>
            <div className="space-y-2">
              {/* Existing SVG-based export */}
              <button
                onClick={handleExportPng}
                disabled={isExportingPng}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {isExportingPng ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Image className="w-5 h-5 text-gray-600" />
                )}
                <span className="font-medium text-gray-700">
                  {isExportingPng ? "Exporting..." : "Download PNG"}
                </span>
              </button>

              {/* Test other export methods */}
              <button
                onClick={handleTestExport}
                disabled={isTesting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {isTesting ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                ) : (
                  <Camera className="w-5 h-5 text-amber-600" />
                )}
                <span className="font-medium text-amber-700">
                  {isTesting ? "Testing..." : "Test Other Methods"}
                </span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Export the current map view as an image
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* PDF Report */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Download Full Report
            </h3>
            <button
              onClick={handleDownloadPdf}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium">Download PDF Report</span>
            </button>
            <p className="text-xs text-gray-500 mt-1.5">
              AI-generated analysis with key takeaways, opportunities, topics, and players
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}