import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Download, Upload, FileText, X } from 'lucide-react';

interface StepCreateDatasetProps {
  onNext: (params: { file: File }) => void;
  initialFile?: File | null;
}

export function StepCreateDataset({ onNext, initialFile }: StepCreateDatasetProps) {
  const [expandedOption, setExpandedOption] = useState<'upload' | 'search'>('upload');
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isValidFile(dropped)) {
      setFile(dropped);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && isValidFile(selected)) {
      setFile(selected);
    }
  };

  const isValidFile = (f: File) => {
    const validTypes = ['.csv', '.xlsx', '.xls'];
    return validTypes.some(ext => f.name.toLowerCase().endsWith(ext));
  };

  const handleUpload = () => {
    if (file) {
      onNext({ file });
    }
  };

  const handleDownloadTemplate = () => {
    const headers = 'score,pub no,year,title,ipc (main),applicants,inventors,abstract,publication date,filing date';
    const blob = new Blob([headers + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'patent_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-2xl">
      {/* Upload Patent File */}
      <div className="border border-gray-200 rounded-lg mb-3">
        <button
          onClick={() => setExpandedOption('upload')}
          className="w-full flex items-center p-4 bg-gray-100 hover:bg-gray-50 rounded-t-lg"
        >
          {expandedOption === 'upload' ? (
            <ChevronDown size={18} className="mr-2" />
          ) : (
            <ChevronRight size={18} className="mr-2" />
          )}
          <span className="font-medium">Upload Patent File</span>
          <span
            onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
            className="ml-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
          >
            <Download size={14} />
            Download Template
          </span>
        </button>

        {expandedOption === 'upload' && (
          <div className="p-4 border-t border-gray-200 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver
                  ? 'border-[#0d3356] bg-[#0d3356]/5'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText size={24} className="text-[#0d3356]" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="ml-2 p-1 hover:bg-gray-100 rounded"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={32} className="mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-600 mb-1">
                    Drag & drop your patent file here
                  </p>
                  <label className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 text-sm">
                    Browse files
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={!file}
              className="w-full py-3 bg-[#0d3356] text-white rounded-lg hover:bg-[#0d3356]/90 disabled:opacity-50"
            >
              Create Dataset
            </button>
          </div>
        )}
      </div>

      {/* Concept Search - Coming Soon */}
      <div className="border border-gray-200 rounded-lg opacity-60">
        <button
          onClick={() => setExpandedOption('search')}
          className="w-full flex items-center p-4 bg-gray-100 hover:bg-gray-50 rounded-lg"
        >
          {expandedOption === 'search' ? (
            <ChevronDown size={18} className="mr-2" />
          ) : (
            <ChevronRight size={18} className="mr-2" />
          )}
          <span className="font-medium">Concept Search</span>
          <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-500 text-xs rounded-full">
            Coming Soon
          </span>
        </button>

        {expandedOption === 'search' && (
          <div className="p-6 border-t border-gray-200 text-center text-gray-400">
            <p>Concept search will allow you to search patent databases directly.</p>
            <p className="text-sm mt-1">Stay tuned!</p>
          </div>
        )}
      </div>
    </div>
  );
}
