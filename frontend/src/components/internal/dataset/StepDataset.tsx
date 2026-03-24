import { useState, useEffect, useMemo, useRef } from 'react';
import { Download, ArrowLeft, ArrowRight, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../../../config';

interface Patent {
  score: string;
  pubNo: string;
  year: string;
  title: string;
  ipc: string;
  applicants: string;
  inventors: string;
  abstract: string;
  publicationDate: string;
  filingDate: string;
}

interface StepDatasetProps {
  file: File;
  onBack: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNewAnalysis?: (data: any) => void;
}

function parseCSV(text: string): Patent[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Parse header - handle quoted headers
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

  // Map header names to indices
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h.includes('score')) colMap.score = i;
    else if (h.includes('pub no') || h.includes('pubno') || h.includes('pub_no')) colMap.pubNo = i;
    else if (h === 'year') colMap.year = i;
    else if (h === 'title') colMap.title = i;
    else if (h.includes('ipc')) colMap.ipc = i;
    else if (h.includes('applicant')) colMap.applicants = i;
    else if (h.includes('inventor')) colMap.inventors = i;
    else if (h === 'abstract') colMap.abstract = i;
    else if (h.includes('publication date') || h.includes('publication_date')) colMap.publicationDate = i;
    else if (h.includes('filing date') || h.includes('filing_date')) colMap.filingDate = i;
  });

  const patents: Patent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);

    patents.push({
      score: cols[colMap.score] || '',
      pubNo: cols[colMap.pubNo] || '',
      year: cols[colMap.year] || '',
      title: cols[colMap.title] || '',
      ipc: cols[colMap.ipc] || '',
      applicants: cols[colMap.applicants] || '',
      inventors: cols[colMap.inventors] || '',
      abstract: cols[colMap.abstract] || '',
      publicationDate: cols[colMap.publicationDate] || '',
      filingDate: cols[colMap.filingDate] || '',
    });
  }

  return patents;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const DEMO_API_BASE = API_BASE_URL;

export function StepDataset({ file, onBack, onNewAnalysis }: StepDatasetProps) {
  const [patents, setPatents] = useState<Patent[]>([]);
  const [displayCount, setDisplayCount] = useState(5);
  const [sortBy, setSortBy] = useState<'score' | 'year'>('score');
  const [loading, setLoading] = useState(true);

  // Pipeline progress state
  const [processing, setProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setPatents(parsed);
      setLoading(false);
    };
    reader.readAsText(file);
  }, [file]);

  const sortedPatents = useMemo(() => {
    const sorted = [...patents];
    if (sortBy === 'score') {
      sorted.sort((a, b) => parseFloat(b.score || '0') - parseFloat(a.score || '0'));
    } else {
      sorted.sort((a, b) => parseInt(b.year || '0') - parseInt(a.year || '0'));
    }
    return sorted;
  }, [patents, sortBy]);

  // Compute year stats from real data
  const yearStats = useMemo(() => {
    const counts: Record<number, number> = {};
    patents.forEach(p => {
      const y = parseInt(p.year);
      if (!isNaN(y)) counts[y] = (counts[y] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([year, count]) => ({ year: parseInt(year), count }))
      .sort((a, b) => a.year - b.year);
  }, [patents]);

  // Compute top IPCs from real data
  const topIPCs = useMemo(() => {
    const counts: Record<string, number> = {};
    patents.forEach(p => {
      const ipc = p.ipc.trim();
      if (ipc) counts[ipc] = (counts[ipc] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([ipc, count]) => ({ ipc, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [patents]);

  const handleGenerateNewAnalysis = async () => {
    if (processing) return;
    setProcessing(true);
    setProgressStep('');
    setProgressMessage('Starting...');
    setProgressPercent(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('distance_threshold', '1.1');
      formData.append('top_players', '20');

      console.log('[Generate] Starting upload to', `${DEMO_API_BASE}/api/demo/upload`);
      const response = await fetch(`${DEMO_API_BASE}/api/demo/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      console.log('[Generate] Response status:', response.status);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response stream');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[Generate] Stream ended. Remaining buffer:', buffer);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          console.log('[Generate] SSE line:', line);
          const data = JSON.parse(line.slice(6));

          if (data.error) {
            console.error('[Generate] Error:', data.error);
            setProgressMessage(`Error: ${data.error}`);
            setProcessing(false);
            return;
          }

          setProgressStep(data.step || '');
          setProgressMessage(data.message || '');
          if (data.progress !== undefined) {
            setProgressPercent(data.progress);
          }

          if (data.step === 'done' && data.resultId) {
            console.log('[Generate] Done! Fetching result:', data.resultId);
            setProgressMessage('Loading results...');
            const resultRes = await fetch(`${DEMO_API_BASE}/api/demo/result/${data.resultId}`);
            console.log('[Generate] Result fetch status:', resultRes.status);
            const resultData = await resultRes.json();
            console.log('[Generate] Result keys:', Object.keys(resultData));
            setProcessing(false);
            onNewAnalysis?.(resultData);
            return;
          }
        }
      }
    } catch (err) {
      console.error('[Generate] Exception:', err);
      if ((err as Error).name !== 'AbortError') {
        setProgressMessage(`Error: ${(err as Error).message}`);
      }
    }
    setProcessing(false);
  };

  const handleDownload = () => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadMore = () => {
    setDisplayCount(prev => Math.min(prev + 10, sortedPatents.length));
  };

  const formatInventors = (inventors: string) => {
    return inventors.replace(/\|/g, ', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Parsing file...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header with title and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Patent Dataset</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download size={18} />
            <span>Download Patents CSV</span>
          </button>
          <button
            onClick={handleGenerateNewAnalysis}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Generate New Analysis</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* File Info + Statistical Info */}
      <div className="grid grid-cols-2 gap-6">
        {/* File Info */}
        <div className="bg-white rounded-lg border p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">File Information</h3>

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-gray-400" />
              <span className="text-gray-500">File name:</span>
              <span className="text-gray-800 font-medium">{file.name}</span>
            </div>
            <div>
              <span className="text-gray-500">File size:</span>
              <p className="text-gray-800">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <div>
              <span className="text-gray-500">Total patents:</span>
              <p className="text-gray-800 font-medium">{patents.length.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-500">Year range:</span>
              <p className="text-gray-800">
                {yearStats.length > 0
                  ? `${yearStats[0].year} - ${yearStats[yearStats.length - 1].year}`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Uploaded:</span>
              <p className="text-gray-800">{new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Statistical Information */}
        <div className="bg-white rounded-lg border p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Statistical Information</h3>

          <div className="mb-4">
            <span className="text-gray-500 text-sm">Total patents</span>
            <p className="text-gray-800 font-medium">{patents.length.toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Year counts */}
            <div>
              <p className="text-gray-500 text-sm mb-2">The num of patents in each year</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-blue-500">
                    <th className="pb-1">Year</th>
                    <th className="pb-1">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {yearStats.map(({ year, count }) => (
                    <tr key={year} className="text-gray-700">
                      <td className="py-0.5">{year}</td>
                      <td className="py-0.5">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top IPCs */}
            <div>
              <p className="text-gray-500 text-sm mb-2">Top 10 IPCs</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-blue-500">
                    <th className="pb-1">IPC</th>
                    <th className="pb-1">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topIPCs.map(({ ipc, count }) => (
                    <tr key={ipc} className="text-gray-700">
                      <td className="py-0.5">{ipc}</td>
                      <td className="py-0.5">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Patent List */}
      <div className="bg-white rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">List of Patents</h3>
          <div className="flex items-center gap-4 text-sm">
            <span
              onClick={() => setSortBy('score')}
              className={`cursor-pointer hover:underline ${sortBy === 'score' ? 'text-blue-600 font-medium' : 'text-blue-500'}`}
            >
              Sort by score
            </span>
            <span className="text-gray-400">|</span>
            <span
              onClick={() => setSortBy('year')}
              className={`cursor-pointer hover:underline ${sortBy === 'year' ? 'text-blue-600 font-medium' : 'text-blue-500'}`}
            >
              Sort by year
            </span>
            <span className="text-gray-500 ml-4">
              Showing results 1 - {Math.min(displayCount, sortedPatents.length)} of {patents.length.toLocaleString()}
            </span>
            <ChevronRight size={18} className="text-gray-400" />
          </div>
        </div>

        <div className="divide-y">
          {sortedPatents.slice(0, displayCount).map((patent, index) => (
            <div key={`${patent.pubNo}-${index}`} className="p-4">
              {/* Title row */}
              <div className="flex items-start gap-3 mb-2">
                <span className="text-gray-500 text-sm flex-shrink-0 w-6">{index + 1}.</span>
                <div>
                  {patent.score && (
                    <>
                      <span className="text-gray-500 text-sm">({parseFloat(patent.score).toFixed(6)})</span>
                      {' '}
                    </>
                  )}
                  <span className="font-medium text-gray-900">{patent.title}</span>
                  {' '}
                  {patent.pubNo && (
                    <span className="text-gray-500">[{patent.pubNo}]</span>
                  )}
                </div>
              </div>

              {/* Abstract */}
              {patent.abstract && (
                <p className="text-gray-600 text-sm ml-9 mb-2 leading-relaxed">
                  {patent.abstract}
                </p>
              )}

              {/* Meta info */}
              <p className="text-gray-500 text-sm ml-9">
                {[patent.ipc, patent.applicants, formatInventors(patent.inventors)]
                  .filter(Boolean)
                  .join(' / ')}
              </p>
            </div>
          ))}
        </div>

        {/* Load more */}
        {displayCount < sortedPatents.length && (
          <div className="p-4 border-t text-center">
            <button
              onClick={handleLoadMore}
              className="text-blue-500 hover:text-blue-600 text-sm font-medium"
            >
              Load more...
            </button>
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {processing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex flex-col items-center">
              <Loader2 size={40} className="animate-spin text-emerald-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {progressStep === 'cache_hit' ? 'Loading Cached Data' : 'Generating Analysis'}
              </h3>
              <p className="text-gray-600 text-sm text-center mb-4">
                {progressMessage}
              </p>
              {progressStep === 'embeddings' && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  setProcessing(false);
                }}
                className="mt-4 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
