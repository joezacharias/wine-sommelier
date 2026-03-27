'use client';

import { useState, useRef, useCallback } from 'react';
import type { WineResult, AnalyzeResponse } from './api/analyze/route';

// ---------------------------------------------------------------------------
// Icons (inline SVGs to avoid extra deps)
// ---------------------------------------------------------------------------

const WineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
    <path d="M8 2h8l1 7c0 3.31-2.69 6-6 6s-6-2.69-6-6L8 2z" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 15v7M8 22h8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/>
    <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/>
    <polyline points="10 9 9 9 8 9" strokeLinecap="round"/>
  </svg>
);

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 inline" fill={filled ? '#f59e0b' : 'none'} stroke="#f59e0b" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

const ArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: WineResult['type'] }) {
  const config: Record<string, { label: string; color: string }> = {
    red:      { label: '🍷 Red',      color: 'bg-red-900/60 text-red-200 border-red-800' },
    white:    { label: '🥂 White',    color: 'bg-yellow-900/40 text-yellow-200 border-yellow-800' },
    rosé:     { label: '🌸 Rosé',    color: 'bg-pink-900/50 text-pink-200 border-pink-800' },
    sparkling:{ label: '✨ Sparkling', color: 'bg-blue-900/40 text-blue-200 border-blue-800' },
    dessert:  { label: '🍯 Dessert',  color: 'bg-amber-900/40 text-amber-200 border-amber-800' },
    unknown:  { label: '🍾 Wine',     color: 'bg-purple-900/40 text-purple-200 border-purple-800' },
  };
  const { label, color } = config[type] ?? config.unknown;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function ValueStars({ score }: { score: number | null }) {
  if (score === null) return null;
  const stars = score >= 60 ? 3 : score >= 42 ? 2 : score >= 28 ? 1 : 0;
  return (
    <span>
      {[1,2,3].map(i => <StarIcon key={i} filled={i <= stars} />)}
    </span>
  );
}

function WineCard({ wine, rank, isTop }: { wine: WineResult; rank: number; isTop: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const markup = wine.markupRatio !== null
    ? `${Math.round((wine.markupRatio - 1) * 100)}% markup`
    : null;

  const scoreBarWidth = wine.valueScore !== null
    ? `${Math.min(100, (wine.valueScore / 80) * 100)}%`
    : '0%';

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
        isTop
          ? 'border-yellow-500/60 bg-gradient-to-br from-yellow-950/60 via-amber-950/40 to-[#1a1226] shadow-lg shadow-yellow-900/20'
          : 'border-[#2d1f3d] bg-[#1a1226]'
      }`}
    >
      {/* Top badge */}
      {isTop && (
        <div className="bg-gradient-to-r from-yellow-600 to-amber-500 px-4 py-1.5 flex items-center gap-2">
          <span className="text-sm font-bold text-black tracking-wide">⭐ BEST VALUE PICK</span>
        </div>
      )}

      <button
        className="w-full text-left p-4"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Rank */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-0.5 ${
            isTop ? 'bg-yellow-500 text-black' : 'bg-[#2d1f3d] text-purple-300'
          }`}>
            {rank}
          </div>

          <div className="flex-1 min-w-0">
            {/* Wine name */}
            <p className="font-semibold text-white leading-snug pr-2">
              {wine.name}
              {wine.vintage !== 'NV' && (
                <span className="text-purple-400 font-normal ml-1.5">{wine.vintage}</span>
              )}
            </p>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <TypeBadge type={wine.type} />
              {wine.rating !== null && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-700">
                  {wine.rating} pts
                </span>
              )}
              {wine.valueLabel && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  wine.valueLabel === 'Excellent Value' ? 'bg-green-900/60 text-green-200 border-green-700' :
                  wine.valueLabel === 'Good Value'      ? 'bg-teal-900/60 text-teal-200 border-teal-700' :
                  wine.valueLabel === 'Fair Value'      ? 'bg-orange-900/40 text-orange-200 border-orange-800' :
                                                         'bg-red-900/40 text-red-300 border-red-800'
                }`}>
                  {wine.valueLabel}
                </span>
              )}
            </div>

            {/* Price row */}
            <div className="flex items-center gap-3 mt-2 text-sm">
              <div>
                <span className="text-purple-400 text-xs">List price </span>
                <span className="text-white font-semibold">${wine.restaurantPrice}</span>
              </div>
              {wine.retailPrice !== null && (
                <>
                  <span className="text-[#3d2a52]">·</span>
                  <div>
                    <span className="text-purple-400 text-xs">Retail </span>
                    <span className="text-green-400 font-semibold">${wine.retailPrice}</span>
                  </div>
                  {markup && (
                    <>
                      <span className="text-[#3d2a52]">·</span>
                      <span className="text-orange-400 text-xs font-medium">{markup}</span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Value score bar */}
            {wine.valueScore !== null && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-purple-400">Value score</span>
                  <div className="flex items-center gap-1">
                    <ValueStars score={wine.valueScore} />
                    <span className="text-xs font-bold text-white ml-1">{wine.valueScore}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[#2d1f3d] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      isTop ? 'bg-gradient-to-r from-yellow-500 to-amber-400' : 'bg-gradient-to-r from-wine-600 to-purple-500'
                    }`}
                    style={{ width: scoreBarWidth }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Expand hint */}
        {(wine.snippets.length > 0 || wine.ratingSource) && (
          <div className="flex items-center justify-end mt-2">
            <span className="text-xs text-purple-500">
              {expanded ? '▲ Less' : '▼ Sources'}
            </span>
          </div>
        )}
      </button>

      {/* Expanded snippets */}
      {expanded && wine.snippets.length > 0 && (
        <div className="px-4 pb-4 border-t border-[#2d1f3d] mt-0 pt-3">
          <p className="text-xs font-semibold text-purple-400 mb-2 uppercase tracking-wider">
            From the web {wine.ratingSource ? `· ${wine.ratingSource}` : ''}
          </p>
          {wine.snippets.map((s, i) => (
            <p key={i} className="text-xs text-purple-200/70 leading-relaxed mb-1.5 last:mb-0">
              "{s}"
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading State
// ---------------------------------------------------------------------------

const LOADING_STEPS = [
  { label: 'Reading wine list…',     sub: 'Claude AI is scanning your photo or PDF' },
  { label: 'Searching ratings…',     sub: 'Looking up critic scores for each wine' },
  { label: 'Comparing prices…',      sub: 'Finding retail prices to calculate markup' },
  { label: 'Scoring value…',         sub: 'Ranking wines by quality-to-markup ratio' },
];

function LoadingView({ step }: { step: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-8 text-center">
      <div className="w-16 h-16 text-wine-500 mb-6">
        <WineIcon />
      </div>
      <SpinnerIcon />
      <h2 className="text-xl font-bold text-white mt-5 mb-1">
        {LOADING_STEPS[step]?.label ?? 'Processing…'}
      </h2>
      <p className="text-purple-400 text-sm">
        {LOADING_STEPS[step]?.sub ?? 'Almost there…'}
      </p>

      {/* Step dots */}
      <div className="flex gap-2 mt-8">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === step ? 'bg-wine-500 scale-125' :
              i < step  ? 'bg-wine-800' :
                          'bg-[#2d1f3d]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results View
// ---------------------------------------------------------------------------

function ResultsView({ data, onReset }: { data: AnalyzeResponse; onReset: () => void }) {
  const scored  = data.wines.filter(w => w.valueScore !== null);
  const partial = data.wines.filter(w => w.valueScore === null && w.rating !== null);
  const unknown = data.wines.filter(w => w.valueScore === null && w.rating === null);

  return (
    <div className="min-h-dvh pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f0a14]/95 backdrop-blur-sm border-b border-[#2d1f3d]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onReset}
            className="p-2 -ml-2 rounded-xl text-purple-400 hover:text-white hover:bg-[#2d1f3d] transition-colors"
            aria-label="Back"
          >
            <ArrowLeft />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-white">Wine Analysis</h1>
            <p className="text-xs text-purple-400">
              {data.totalFound} wines found · {data.analyzedCount} fully scored
            </p>
          </div>
          <div className="w-7 h-7 text-wine-500">
            <WineIcon />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Summary banner */}
        {scored.length > 0 && (
          <div className="bg-gradient-to-r from-wine-950/80 to-purple-950/80 border border-wine-800/50 rounded-2xl p-4">
            <p className="text-sm text-purple-200 leading-relaxed">
              🍷 Based on critic ratings and retail pricing,{' '}
              <span className="text-white font-semibold">{scored[0].name}</span>{' '}
              {scored[0].vintage !== 'NV' ? `(${scored[0].vintage}) ` : ''}
              is your best value at <span className="text-green-400 font-semibold">${scored[0].restaurantPrice}</span>
              {scored[0].retailPrice ? (
                <> vs ~<span className="text-green-400 font-semibold">${scored[0].retailPrice}</span> retail</>
              ) : ''}.
            </p>
          </div>
        )}

        {/* Fully scored wines */}
        {scored.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest px-1 mb-2">
              Ranked by Value
            </h2>
            <div className="space-y-3">
              {scored.map((wine, i) => (
                <WineCard key={i} wine={wine} rank={i + 1} isTop={i === 0} />
              ))}
            </div>
          </section>
        )}

        {/* Partially scored */}
        {partial.length > 0 && (
          <section className="mt-4">
            <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest px-1 mb-2">
              Rating Found (No Retail Price)
            </h2>
            <div className="space-y-3">
              {partial.map((wine, i) => (
                <WineCard key={i} wine={wine} rank={scored.length + i + 1} isTop={false} />
              ))}
            </div>
          </section>
        )}

        {/* No data found */}
        {unknown.length > 0 && (
          <section className="mt-4">
            <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest px-1 mb-2">
              No Data Found
            </h2>
            <div className="space-y-2">
              {unknown.map((wine, i) => (
                <div key={i} className="border border-[#2d1f3d] bg-[#1a1226] rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-white/70 truncate">{wine.name}</p>
                    <p className="text-xs text-purple-500 mt-0.5">
                      {wine.vintage !== 'NV' ? wine.vintage : ''} · ${wine.restaurantPrice}
                    </p>
                  </div>
                  <TypeBadge type={wine.type} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Methodology note */}
        <div className="mt-6 border border-[#2d1f3d] rounded-2xl p-4">
          <p className="text-xs text-purple-500 leading-relaxed">
            <span className="font-semibold text-purple-400">How value is calculated:</span>{' '}
            Value Score = (Critic Rating ÷ 100) ÷ (Restaurant Price ÷ Retail Price) × 100.
            A higher score means more quality per dollar of markup. Retail prices are estimated from web search results.
          </p>
        </div>

        {/* Scan again button */}
        <button
          onClick={onReset}
          className="w-full mt-2 py-4 rounded-2xl bg-wine-700 hover:bg-wine-600 active:bg-wine-800 text-white font-semibold text-base transition-colors"
        >
          Scan Another Wine List
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload View
// ---------------------------------------------------------------------------

function UploadView({
  onFileSelect,
  isLoading,
}: {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
    onFileSelect(file);
  }, [onFileSelect]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="flex flex-col min-h-dvh px-5 pt-safe-top pb-8">
      {/* Logo */}
      <div className="flex flex-col items-center pt-12 pb-8">
        <div className="w-16 h-16 text-wine-500 mb-4">
          <WineIcon />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">AI Sommelier</h1>
        <p className="text-purple-400 text-sm mt-1 text-center">
          Find the best value wine on any restaurant list
        </p>
      </div>

      {/* Upload area */}
      <div
        className={`flex-1 flex flex-col gap-4 ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
      >
        {/* Drop zone / preview */}
        <div
          className={`flex-1 min-h-[180px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? 'border-wine-500 bg-wine-950/30'
              : fileName
              ? 'border-wine-700 bg-wine-950/20'
              : 'border-[#3d2a52] bg-[#1a1226] hover:border-wine-700 hover:bg-wine-950/10'
          }`}
          onClick={() => !fileName && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {preview ? (
            <img src={preview} alt="Wine list preview" className="max-h-48 rounded-2xl object-contain" />
          ) : fileName ? (
            <div className="text-center p-6">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-white font-medium text-sm break-all px-4">{fileName}</p>
              <p className="text-purple-400 text-xs mt-1">PDF ready to analyze</p>
            </div>
          ) : (
            <div className="text-center p-8">
              <div className="text-4xl mb-3 opacity-50">📋</div>
              <p className="text-purple-300 font-medium">Drop a wine list here</p>
              <p className="text-purple-500 text-xs mt-1">Photo or PDF</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => photoRef.current?.click()}
            className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[#1a1226] border border-[#3d2a52] hover:border-wine-700 hover:bg-wine-950/20 active:bg-wine-950/40 transition-all text-purple-200"
          >
            <CameraIcon />
            <span className="text-sm font-medium">Take Photo</span>
            <span className="text-xs text-purple-500 text-center leading-tight">Point your camera at<br/>the wine list</span>
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[#1a1226] border border-[#3d2a52] hover:border-wine-700 hover:bg-wine-950/20 active:bg-wine-950/40 transition-all text-purple-200"
          >
            <PdfIcon />
            <span className="text-sm font-medium">Upload PDF</span>
            <span className="text-xs text-purple-500 text-center leading-tight">Upload a PDF or<br/>image from your files</span>
          </button>
        </div>

        {/* Hidden inputs */}
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {/* Analyze button — only shown once a file is selected */}
        {fileName && !isLoading && (
          <div className="mt-1 text-center">
            <p className="text-xs text-purple-500 mb-3">
              {fileName} selected
              <button
                onClick={() => { setFileName(null); setPreview(null); }}
                className="ml-2 text-wine-400 underline"
              >
                Clear
              </button>
            </p>
          </div>
        )}

        {/* How it works */}
        {!fileName && (
          <div className="mt-2 border border-[#2d1f3d] rounded-2xl p-4">
            <p className="text-xs font-semibold text-purple-400 mb-2 uppercase tracking-wider">How it works</p>
            <ol className="text-xs text-purple-300/80 space-y-1.5 list-decimal list-inside">
              <li>Photograph or upload your restaurant's wine list</li>
              <li>Claude AI reads every wine, vintage &amp; price</li>
              <li>Web search finds critic scores &amp; retail prices</li>
              <li>Value score = quality ÷ restaurant markup</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error View
// ---------------------------------------------------------------------------

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-8 text-center">
      <div className="text-5xl mb-4">😞</div>
      <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
      <p className="text-purple-400 text-sm mb-8 leading-relaxed">{message}</p>
      <button
        onClick={onRetry}
        className="py-3 px-8 rounded-2xl bg-wine-700 text-white font-semibold text-base"
      >
        Try Again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

type AppState = 'upload' | 'loading' | 'results' | 'error';

export default function App() {
  const [state, setState] = useState<AppState>('upload');
  const [loadingStep, setLoadingStep] = useState(0);
  const [results, setResults] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string>('');
  const pendingFile = useRef<File | null>(null);

  const analyzeFile = useCallback(async (file: File) => {
    pendingFile.current = file;
    setState('loading');
    setLoadingStep(0);

    // Animate loading steps
    const stepTimers = [
      setTimeout(() => setLoadingStep(1), 4000),
      setTimeout(() => setLoadingStep(2), 12000),
      setTimeout(() => setLoadingStep(3), 20000),
    ];

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      stepTimers.forEach(clearTimeout);

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error ?? `Server error ${resp.status}`);
      }

      setResults(data as AnalyzeResponse);
      setState('results');
    } catch (err: unknown) {
      stepTimers.forEach(clearTimeout);
      const msg = err instanceof Error ? err.message : 'Unknown error. Please try again.';
      setError(msg);
      setState('error');
    }
  }, []);

  const reset = useCallback(() => {
    setState('upload');
    setResults(null);
    setError('');
    setLoadingStep(0);
    pendingFile.current = null;
  }, []);

  return (
    <>
      {state === 'upload'  && <UploadView onFileSelect={analyzeFile} isLoading={false} />}
      {state === 'loading' && <LoadingView step={loadingStep} />}
      {state === 'results' && results && <ResultsView data={results} onReset={reset} />}
      {state === 'error'   && <ErrorView message={error} onRetry={reset} />}
    </>
  );
}
