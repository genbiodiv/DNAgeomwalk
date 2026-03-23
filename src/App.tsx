import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Dna, 
  Download, 
  Trash2, 
  Info, 
  Languages, 
  Sun, 
  Moon, 
  Upload, 
  BarChart3, 
  BookOpen, 
  X,
  ChevronRight,
  Search,
  Loader2
} from 'lucide-react';
import { 
  Nucleotide, 
  Point, 
  VisualizationSettings, 
  Language,
  AppMode
} from './types';
import { 
  NUCLEOTIDE_CORNERS, 
  FIXED_PALETTE, 
  BASE_COLORS, 
  cleanDNA, 
  parseFASTA, 
  getSequenceStats, 
  blendColors,
  generateRandomDNA,
  hexToRgb
} from './utils';
import { translations } from './i18n';

const DEFAULT_SEQUENCE = "ATGCTAGTCGATCGTACGATCGTAGCTAGCTAGGCTAGCTAGCTAGCTACGATCGATCGTACGTAGCTAGCTAGCTGACTGATCGTAGCTAGCTAGCTAGCATCGATCGTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCATCGATCGTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCATCGATCGTAGCTAGCTAG";

export default function App() {
  // State
  const [sequence, setSequence] = useState<string>(DEFAULT_SEQUENCE);
  const [sequenceB, setSequenceB] = useState<string>(DEFAULT_SEQUENCE);
  const [mode, setMode] = useState<AppMode>('single');
  const [lang, setLang] = useState<Language>('en');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [showChallenges, setShowChallenges] = useState<boolean>(false);
  const [settings, setSettings] = useState<VisualizationSettings>({
    r: 0.5,
    pointSize: 2,
    opacity: 0.8,
    resolution: 512,
    colorMode: 'fixed',
    projection: 'square',
    mixingWeight: 0.4,
    backgroundColor: '#ffffff',
    showGrid: true,
    showOrigin: true,
    autoScale: true,
    customColors: { ...FIXED_PALETTE },
    pointShape: 'circle',
    isFilled: true,
    hasStroke: false,
    animationSpeed: 0,
    comparisonColorA: '#2563eb', // Blue
    comparisonColorB: '#dc2626', // Red
    overlapColor: '#facc15', // Yellow
  });

  const [randomSettings, setRandomSettings] = useState({
    length: 500,
    gcContent: 0.5,
  });

  const [accessionId, setAccessionId] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [inputTarget, setInputTarget] = useState<'A' | 'B'>('A');

  const handleNCBIFetch = async () => {
    if (!accessionId.trim()) return;
    
    setIsFetching(true);
    setFetchError(null);
    
    try {
      const response = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${accessionId.trim()}&rettype=fasta&retmode=text`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch from NCBI');
      }
      
      const fastaData = await response.text();
      const parsed = parseFASTA(fastaData);
      
      if (parsed.length > 10000) {
        setFetchError(t.sequenceTooLarge);
        return;
      }
      
      if (parsed.length > 0) {
        if (inputTarget === 'A') setSequence(parsed);
        else setSequenceB(parsed);
        setAccessionId('');
      } else {
        throw new Error('No sequence found in response');
      }
    } catch (error) {
      console.error('NCBI Fetch Error:', error);
      if (!fetchError) {
        setFetchError(t.fetchError);
      }
    } finally {
      setIsFetching(false);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const currentIndexRef = useRef<number>(0);
  const currentPosRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const currentPosBRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const visitedPointsRef = useRef<Set<string>>(new Set());
  const t = translations[lang];

  // Derived stats
  const stats = getSequenceStats(sequence);

  // Helper to draw a single point
  const drawPoint = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number, 
    color: string, 
    shape: 'circle' | 'square', 
    isFilled: boolean, 
    hasStroke: boolean,
    backgroundColor: string
  ) => {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(x - size / 2, y - size / 2, size, size);
    }

    if (isFilled) {
      ctx.fillStyle = color;
      ctx.fill();
    }

    if (hasStroke) {
      // Calculate contrast for stroke
      const bgRgb = hexToRgb(backgroundColor);
      const ptRgb = hexToRgb(color);
      
      let strokeColor = '#000000';
      if (bgRgb) {
        const bgLuminance = (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255;
        strokeColor = bgLuminance > 0.5 ? '#000000' : '#ffffff';
        
        // If point color is very similar to chosen stroke color, try to flip it
        if (ptRgb) {
          const ptLuminance = (0.299 * ptRgb.r + 0.587 * ptRgb.g + 0.114 * ptRgb.b) / 255;
          const strokeLuminance = strokeColor === '#ffffff' ? 1 : 0;
          if (Math.abs(ptLuminance - strokeLuminance) < 0.3) {
            // Point is too close to stroke color, but we also need to contrast with background
            // If background is mid-tone, we have more flexibility.
            // For simplicity, we stick to the one that contrasts best with background.
          }
        }
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(0.5, size * 0.1);
      ctx.stroke();
    } else if (!isFilled) {
      // If not filled and no stroke, we must show something, so we use the color as stroke
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  // Rendering logic
  const render = useCallback((isAnimationStep = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { 
      r, pointSize, opacity, resolution, colorMode, projection, mixingWeight, 
      backgroundColor, showGrid, showOrigin, autoScale, customColors,
      pointShape, isFilled, hasStroke, animationSpeed,
      comparisonColorA, comparisonColorB, overlapColor
    } = settings;
    
    // Auto-scale point size for small sequences
    const effectivePointSize = autoScale && sequence.length < 500 ? Math.max(pointSize, 6) : pointSize;

    if (!isAnimationStep) {
      // Full redraw or start of animation
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, resolution, resolution);
      visitedPointsRef.current.clear();

      if (showGrid) {
        ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, resolution / 2);
        ctx.lineTo(resolution, resolution / 2);
        ctx.moveTo(resolution / 2, 0);
        ctx.lineTo(resolution / 2, resolution);
        ctx.stroke();
        
        // Draw corners labels
        ctx.fillStyle = isDarkMode ? '#ffffff' : '#000000';
        ctx.font = 'bold 16px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const drawLabel = (text: string, x: number, y: number) => {
          ctx.strokeStyle = isDarkMode ? '#000000' : '#ffffff';
          ctx.lineWidth = 3;
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        };

        drawLabel('A', 20, 20);
        drawLabel('T', resolution - 20, 20);
        drawLabel('G', resolution - 20, resolution - 20);
        drawLabel('C', 20, resolution - 20);
      }

      // Initial position
      currentPosRef.current = { x: 0.5, y: 0.5 };
      currentPosBRef.current = { x: 0.5, y: 0.5 };
      currentIndexRef.current = 0;
      
      // Draw origin if requested
      if (showOrigin) {
        ctx.fillStyle = isDarkMode ? '#ffffff' : '#000000';
        ctx.beginPath();
        ctx.arc(0.5 * resolution, 0.5 * resolution, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isDarkMode ? '#000000' : '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Pre-calculate Sequence A visits if in comparison mode
      if (mode === 'comparison') {
        let tempPos = { x: 0.5, y: 0.5 };
        for (let i = 0; i < sequence.length; i++) {
          const s = sequence[i] as Nucleotide;
          const corner = NUCLEOTIDE_CORNERS[s];
          if (!corner) continue;
          tempPos.x = tempPos.x + r * (corner.x - tempPos.x);
          tempPos.y = tempPos.y + r * (corner.y - tempPos.y);
          const key = `${Math.round(tempPos.x * resolution)},${Math.round(tempPos.y * resolution)}`;
          visitedPointsRef.current.add(key);
        }
      }
    }

    // Batch rendering
    ctx.globalAlpha = opacity;
    
    const startIdx = currentIndexRef.current;
    const maxLen = mode === 'comparison' ? Math.max(sequence.length, sequenceB.length) : sequence.length;
    const endIdx = animationSpeed > 0 
      ? Math.min(startIdx + animationSpeed, maxLen)
      : maxLen;

    for (let i = startIdx; i < endIdx; i++) {
      // Draw Sequence A (or only sequence in single mode)
      if (i < sequence.length) {
        const s = sequence[i] as Nucleotide;
        const corner = NUCLEOTIDE_CORNERS[s];
        if (corner) {
          currentPosRef.current.x = currentPosRef.current.x + r * (corner.x - currentPosRef.current.x);
          currentPosRef.current.y = currentPosRef.current.y + r * (corner.y - currentPosRef.current.y);

          let color = '#000000';
          if (mode === 'comparison') {
            color = comparisonColorA;
          } else if (colorMode === 'paired') {
            const pairIdx = Math.floor(i / 2);
            const base1 = sequence[pairIdx * 2] as Nucleotide;
            const base2 = (sequence[pairIdx * 2 + 1] || base1) as Nucleotide;
            const dinuc = base1 + base2;
            color = customColors[dinuc] || '#000000';
          } else if (i > 0) {
            const prevS = sequence[i - 1] as Nucleotide;
            const dinuc = prevS + s;
            if (colorMode === 'fixed') {
              color = customColors[dinuc] || '#000000';
            } else {
              color = blendColors(BASE_COLORS[prevS], BASE_COLORS[s], mixingWeight);
            }
          } else {
            color = BASE_COLORS[s] || '#000000';
          }

          const canvasX = currentPosRef.current.x * resolution;
          const canvasY = (1 - currentPosRef.current.y) * resolution;
          
          if (projection === 'circular') {
            const u = 2 * currentPosRef.current.x - 1;
            const v = 2 * currentPosRef.current.y - 1;
            const uPrime = u * Math.sqrt(1 - (v * v) / 2);
            const vPrime = v * Math.sqrt(1 - (u * u) / 2);
            const circX = (uPrime + 1) / 2 * resolution;
            const circY = (1 - (vPrime + 1) / 2) * resolution;
            drawPoint(ctx, circX, circY, effectivePointSize, color, pointShape, isFilled, hasStroke, backgroundColor);
          } else {
            drawPoint(ctx, canvasX, canvasY, effectivePointSize, color, pointShape, isFilled, hasStroke, backgroundColor);
          }
        }
      }

      // Draw Sequence B if in comparison mode
      if (mode === 'comparison' && i < sequenceB.length) {
        const s = sequenceB[i] as Nucleotide;
        const corner = NUCLEOTIDE_CORNERS[s];
        if (corner) {
          currentPosBRef.current.x = currentPosBRef.current.x + r * (corner.x - currentPosBRef.current.x);
          currentPosBRef.current.y = currentPosBRef.current.y + r * (corner.y - currentPosBRef.current.y);

          const key = `${Math.round(currentPosBRef.current.x * resolution)},${Math.round(currentPosBRef.current.y * resolution)}`;
          const isOverlap = visitedPointsRef.current.has(key);
          const color = isOverlap ? overlapColor : comparisonColorB;

          const canvasX = currentPosBRef.current.x * resolution;
          const canvasY = (1 - currentPosBRef.current.y) * resolution;
          
          if (projection === 'circular') {
            const u = 2 * currentPosBRef.current.x - 1;
            const v = 2 * currentPosBRef.current.y - 1;
            const uPrime = u * Math.sqrt(1 - (v * v) / 2);
            const vPrime = v * Math.sqrt(1 - (u * u) / 2);
            const circX = (uPrime + 1) / 2 * resolution;
            const circY = (1 - (vPrime + 1) / 2) * resolution;
            drawPoint(ctx, circX, circY, effectivePointSize, color, pointShape, isFilled, hasStroke, backgroundColor);
          } else {
            drawPoint(ctx, canvasX, canvasY, effectivePointSize, color, pointShape, isFilled, hasStroke, backgroundColor);
          }
        }
      }
    }
    
    currentIndexRef.current = endIdx;
    ctx.globalAlpha = 1.0;

    // Continue animation if needed
    if (animationSpeed > 0 && currentIndexRef.current < maxLen) {
      animationFrameId.current = requestAnimationFrame(() => render(true));
    }
  }, [sequence, sequenceB, settings, isDarkMode, mode]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    setSettings(prev => ({
      ...prev,
      backgroundColor: isDarkMode ? '#09090b' : '#ffffff'
    }));
  }, [isDarkMode]);

  useEffect(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    render();
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [render]);

  // Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = (file.name.endsWith('.fasta') || file.name.endsWith('.fa')) 
        ? parseFASTA(content) 
        : cleanDNA(content);
      
      if (target === 'A') setSequence(parsed);
      else setSequenceB(parsed);
    };
    reader.readAsText(file);
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `dna_walk_${sequence.length}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-950'} font-sans`}>
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 p-4 sticky top-0 bg-inherit/80 backdrop-blur-md z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-black dark:text-white">
              <Dna size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white">{t.title}</h1>
              <p className="text-xs text-zinc-800 dark:text-zinc-300 font-medium">{t.subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex p-1 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mr-2">
              <button 
                onClick={() => { setMode('single'); setInputTarget('A'); }}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${mode === 'single' ? 'bg-zinc-950 text-white dark:bg-white dark:text-black' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'}`}
              >
                {t.singleMode}
              </button>
              <button 
                onClick={() => setMode('comparison')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${mode === 'comparison' ? 'bg-zinc-950 text-white dark:bg-white dark:text-black' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'}`}
              >
                {t.comparisonMode}
              </button>
            </div>
            <button 
              onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black transition-colors flex items-center gap-1 text-sm font-medium"
              title={t.language}
            >
              <Languages size={18} />
              <span className="uppercase">{lang}</span>
            </button>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black transition-colors"
              title={isDarkMode ? t.lightMode : t.darkMode}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              onClick={() => setShowInstructions(true)}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black transition-colors"
              title={t.instructions}
            >
              <Info size={18} />
            </button>
            <button 
              onClick={() => setShowChallenges(true)}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black transition-colors"
              title={t.challenges}
            >
              <BookOpen size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Canvas and Input Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Canvas Area */}
          <div className={`relative aspect-square overflow-hidden border border-zinc-200 dark:border-zinc-700 flex items-center justify-center ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}>
            <canvas 
              ref={canvasRef} 
              width={settings.resolution} 
              height={settings.resolution}
              className="max-w-full max-h-full object-contain"
            />
            {sequence.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-900 dark:text-zinc-400">
                <Dna size={48} className="mb-2 opacity-20" />
                <p className="font-bold">No sequence loaded</p>
              </div>
            )}
          </div>

          {/* Input Section (Moved closer to canvas) */}
          <div className={`p-6 border border-zinc-200 dark:border-zinc-700 ${isDarkMode ? 'bg-zinc-900' : 'bg-white shadow-sm'}`}>
            {/* Target Selection (only in comparison mode) */}
            {mode === 'comparison' && (
              <div className="mb-6 flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                <span className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">{t.targetSequence}:</span>
                <div className="flex p-1 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <button 
                    onClick={() => setInputTarget('A')}
                    className={`px-4 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${inputTarget === 'A' ? 'bg-zinc-950 text-white dark:bg-white dark:text-black' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'}`}
                  >
                    {t.targetA}
                  </button>
                  <button 
                    onClick={() => setInputTarget('B')}
                    className={`px-4 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${inputTarget === 'B' ? 'bg-zinc-950 text-white dark:bg-white dark:text-black' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'}`}
                  >
                    {t.targetB}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Dna size={20} className="text-zinc-950 dark:text-white" />
                <h2 className="font-bold text-zinc-950 dark:text-white">{mode === 'comparison' ? t.sequenceA : t.sequence}</h2>
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black transition-colors" title={t.uploadFasta}>
                  <Upload size={18} className="text-zinc-800 dark:text-zinc-200" />
                  <input type="file" className="hidden" accept=".fasta,.fa,.txt" onChange={(e) => handleFileUpload(e, 'A')} />
                </label>
                <button 
                  onClick={() => setSequence('')}
                  className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 border border-transparent hover:border-black transition-colors"
                  title={t.clear}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            
            {/* Random Generator */}
            <div className="mb-4 p-4 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 size={16} className="text-zinc-950 dark:text-white" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-950 dark:text-white">{t.randomGenerator}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-950 dark:text-white">{t.length}: <span className="text-zinc-950 dark:text-white font-mono">{randomSettings.length}</span></label>
                  <input 
                    type="range" min="50" max="1000" step="10"
                    value={randomSettings.length}
                    onChange={(e) => setRandomSettings({...randomSettings, length: parseInt(e.target.value)})}
                    className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold text-zinc-950 dark:text-white">{t.gcContent}: <span className="text-zinc-950 dark:text-white font-mono">{Math.round(randomSettings.gcContent * 100)}%</span></label>
                    <label className="text-[10px] font-bold text-zinc-950 dark:text-white">{t.atContent}: <span className="text-zinc-950 dark:text-white font-mono">{Math.round((1 - randomSettings.gcContent) * 100)}%</span></label>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={randomSettings.gcContent}
                    onChange={(e) => setRandomSettings({...randomSettings, gcContent: parseFloat(e.target.value)})}
                    className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                  />
                </div>
              </div>
              <button 
                onClick={() => {
                  const seq = generateRandomDNA(randomSettings.length, randomSettings.gcContent);
                  if (inputTarget === 'A') setSequence(seq);
                  else setSequenceB(seq);
                }}
                className="w-full py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-black dark:text-white text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95"
              >
                {t.generate}
              </button>
            </div>

            {/* NCBI Fetcher */}
            <div className="mb-4 p-4 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Search size={16} className="text-zinc-950 dark:text-white" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-950 dark:text-white">{t.ncbiFetch}</h3>
              </div>
              <div className="space-y-2">
                <input 
                  type="text"
                  value={accessionId}
                  onChange={(e) => setAccessionId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNCBIFetch()}
                  placeholder={t.accessionId}
                  className="w-full p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-950 dark:text-white focus:ring-1 focus:ring-zinc-400 outline-none"
                />
                {fetchError && (
                  <p className="text-[10px] text-red-500 font-medium">{fetchError}</p>
                )}
                <button 
                  onClick={handleNCBIFetch}
                  disabled={isFetching || !accessionId.trim()}
                  className="w-full py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:bg-zinc-50 dark:disabled:bg-zinc-900 text-black dark:text-white text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {isFetching ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t.fetching}
                    </>
                  ) : (
                    <>
                      <Search size={14} />
                      {t.fetch}
                    </>
                  )}
                </button>
              </div>
            </div>

            <textarea
              className="w-full h-32 p-3 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-1 focus:ring-zinc-400 font-mono text-sm resize-none text-black dark:text-zinc-100 placeholder:text-zinc-500"
              placeholder={t.pasteSequence}
              value={sequence}
              onChange={(e) => setSequence(cleanDNA(e.target.value))}
            />

            {mode === 'comparison' && (
              <>
                <div className="flex items-center justify-between mt-6 mb-4">
                  <div className="flex items-center gap-2">
                    <Dna size={20} className="text-zinc-950 dark:text-white" />
                    <h2 className="font-bold text-zinc-950 dark:text-white">{t.sequenceB}</h2>
                  </div>
                  <div className="flex gap-2">
                    <label className="cursor-pointer p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black transition-colors" title={t.uploadFasta}>
                      <Upload size={18} className="text-zinc-800 dark:text-zinc-200" />
                      <input type="file" className="hidden" accept=".fasta,.fa,.txt" onChange={(e) => handleFileUpload(e, 'B')} />
                    </label>
                    <button 
                      onClick={() => setSequenceB('')}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 border border-transparent hover:border-black transition-colors"
                      title={t.clear}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <textarea 
                  className="w-full h-32 p-3 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-1 focus:ring-zinc-400 font-mono text-sm resize-none text-black dark:text-zinc-100 placeholder:text-zinc-500"
                  placeholder={t.pasteSequence}
                  value={sequenceB}
                  onChange={(e) => setSequenceB(cleanDNA(e.target.value))}
                />
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 mb-4">
                  <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-relaxed italic">
                    {t.comparisonInfo}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Settings and Stats */}
        <div className="lg:col-span-5 space-y-6">
          {/* Settings Section */}
          <div className={`p-6 border border-zinc-200 dark:border-zinc-700 ${isDarkMode ? 'bg-zinc-900' : 'bg-white shadow-sm'}`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-zinc-950 dark:text-white" />
                <h2 className="font-bold text-zinc-950 dark:text-white">{t.settings}</h2>
              </div>
              <button 
                onClick={() => setSettings({
                  r: 0.5,
                  pointSize: 2,
                  opacity: 0.8,
                  resolution: 512,
                  colorMode: 'fixed',
                  projection: 'square',
                  mixingWeight: 0.4,
                  backgroundColor: isDarkMode ? '#09090b' : '#ffffff',
                  showGrid: true,
                  showOrigin: true,
                  autoScale: true,
                  customColors: { ...FIXED_PALETTE },
                  pointShape: 'circle',
                  isFilled: true,
                  hasStroke: false,
                  animationSpeed: 0,
                  comparisonColorA: '#2563eb',
                  comparisonColorB: '#dc2626',
                  overlapColor: '#facc15',
                })}
                className="text-xs font-bold text-zinc-950 dark:text-white hover:underline"
              >
                {t.reset}
              </button>
            </div>

            <div className="space-y-6">
              {/* Movement Factor */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <label className="text-zinc-950 dark:text-white">{t.movementFactor}</label>
                  <span className="text-zinc-950 dark:text-white font-mono">{settings.r.toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="0.1" max="1.0" step="0.01"
                  value={settings.r}
                  onChange={(e) => setSettings({...settings, r: parseFloat(e.target.value)})}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                />
              </div>

              {/* Point Size & Opacity */}
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <label className="text-zinc-950 dark:text-white">{t.pointSize}</label>
                    <span className="text-zinc-950 dark:text-white font-mono">{settings.pointSize}px</span>
                  </div>
                  <input 
                    type="range" min="1" max="10" step="1"
                    value={settings.pointSize}
                    onChange={(e) => setSettings({...settings, pointSize: parseInt(e.target.value)})}
                    className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <label className="text-zinc-950 dark:text-white">{t.opacity}</label>
                    <span className="text-zinc-950 dark:text-white font-mono">{Math.round(settings.opacity * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="1.0" step="0.05"
                    value={settings.opacity}
                    onChange={(e) => setSettings({...settings, opacity: parseFloat(e.target.value)})}
                    className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                  />
                </div>
              </div>

              {/* Color Mode */}
              {mode === 'single' && (
                <div className="space-y-3">
                  <label className="text-xs font-bold block text-zinc-950 dark:text-white">{t.colorMode}</label>
                  <div className="flex p-1 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <button 
                      onClick={() => setSettings({...settings, colorMode: 'fixed'})}
                      className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.colorMode === 'fixed' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                    >
                      {t.fixed}
                    </button>
                    <button 
                      onClick={() => setSettings({...settings, colorMode: 'mixing'})}
                      className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.colorMode === 'mixing' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                    >
                      {t.mixing}
                    </button>
                    <button 
                      onClick={() => setSettings({...settings, colorMode: 'paired'})}
                      className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.colorMode === 'paired' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                    >
                      {t.paired}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'comparison' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-950 dark:text-white">{t.comparisonColorA}</label>
                      <input 
                        type="color" 
                        value={settings.comparisonColorA}
                        onChange={(e) => setSettings({...settings, comparisonColorA: e.target.value})}
                        className="w-full h-8 cursor-pointer bg-transparent border-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-950 dark:text-white">{t.comparisonColorB}</label>
                      <input 
                        type="color" 
                        value={settings.comparisonColorB}
                        onChange={(e) => setSettings({...settings, comparisonColorB: e.target.value})}
                        className="w-full h-8 cursor-pointer bg-transparent border-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-950 dark:text-white">{t.overlapColor}</label>
                      <input 
                        type="color" 
                        value={settings.overlapColor}
                        onChange={(e) => setSettings({...settings, overlapColor: e.target.value})}
                        className="w-full h-8 cursor-pointer bg-transparent border-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {settings.colorMode === 'mixing' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between text-xs font-bold">
                    <label className="text-black dark:text-white">{t.mixingWeight}</label>
                    <span className="text-black dark:text-white font-mono">{Math.round(settings.mixingWeight * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05"
                    value={settings.mixingWeight}
                    onChange={(e) => setSettings({...settings, mixingWeight: parseFloat(e.target.value)})}
                    className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                  />
                </div>
              )}

              {/* Projection Mode */}
              <div className="space-y-3">
                <label className="text-xs font-bold block text-zinc-950 dark:text-white">{t.projection}</label>
                <div className="flex p-1 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <button 
                    onClick={() => setSettings({...settings, projection: 'square'})}
                    className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.projection === 'square' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                  >
                    {t.squareProjection}
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, projection: 'circular'})}
                    className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.projection === 'circular' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                  >
                    {t.circularProjection}
                  </button>
                </div>
              </div>

              {/* Point Shape */}
              <div className="space-y-3">
                <label className="text-xs font-bold block text-zinc-950 dark:text-white">{t.pointShape}</label>
                <div className="flex p-1 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <button 
                    onClick={() => setSettings({...settings, pointShape: 'circle'})}
                    className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.pointShape === 'circle' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                  >
                    {t.circle}
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, pointShape: 'square'})}
                    className={`flex-1 py-2 text-xs font-bold transition-all border ${settings.pointShape === 'square' ? 'bg-zinc-50 border-zinc-400 text-black dark:bg-white dark:text-black dark:border-black' : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-500 dark:text-zinc-400'}`}
                  >
                    {t.square}
                  </button>
                </div>
              </div>

              {/* Animation Speed */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <label className="text-zinc-950 dark:text-white">{t.animationSpeed}</label>
                  <span className="text-zinc-950 dark:text-white font-mono">
                    {settings.animationSpeed === 0 ? t.noAnimation : `${settings.animationSpeed} ${t.nucleotidesPerFrame}`}
                  </span>
                </div>
                <input 
                  type="range" min="0" max="100" step="5"
                  value={settings.animationSpeed}
                  onChange={(e) => setSettings({...settings, animationSpeed: parseInt(e.target.value)})}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-black dark:accent-white"
                />
              </div>

              {settings.colorMode === 'fixed' && (
                <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-black dark:text-white">{t.customPalette}</label>
                    <button 
                      onClick={() => setSettings({...settings, customColors: { ...FIXED_PALETTE }})}
                      className="text-[10px] font-bold text-black dark:text-white hover:underline"
                    >
                      {t.reset}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(settings.customColors).map(([dn, color]) => (
                      <div key={dn} className="flex flex-col items-center gap-1">
                        <input 
                          type="color" 
                          value={color}
                          onChange={(e) => setSettings({
                            ...settings, 
                            customColors: { ...settings.customColors, [dn]: e.target.value }
                          })}
                          className="w-6 h-6 cursor-pointer border border-zinc-200 dark:border-zinc-700 bg-transparent overflow-hidden"
                        />
                        <span className="text-[8px] font-mono font-bold text-black dark:text-white">{dn}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {/* Toggles */}
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" className="sr-only" 
                        checked={settings.isFilled}
                        onChange={() => setSettings({...settings, isFilled: !settings.isFilled})}
                      />
                      <div className={`w-10 h-5 border border-zinc-200 dark:border-zinc-800 transition-colors ${settings.isFilled ? 'bg-zinc-100 dark:bg-white' : 'bg-white dark:bg-zinc-600'}`}></div>
                      <div className={`absolute left-1 top-1 w-3 h-3 bg-white border border-zinc-400 dark:border-black transition-transform ${settings.isFilled ? 'translate-x-5 bg-white dark:bg-black' : 'bg-zinc-800 dark:bg-white'}`}></div>
                    </div>
                    <span className="text-xs font-bold text-black dark:text-white">{t.isFilled}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" className="sr-only" 
                        checked={settings.hasStroke}
                        onChange={() => setSettings({...settings, hasStroke: !settings.hasStroke})}
                      />
                      <div className={`w-10 h-5 border border-zinc-200 dark:border-zinc-800 transition-colors ${settings.hasStroke ? 'bg-zinc-100 dark:bg-white' : 'bg-white dark:bg-zinc-600'}`}></div>
                      <div className={`absolute left-1 top-1 w-3 h-3 bg-white border border-zinc-400 dark:border-black transition-transform ${settings.hasStroke ? 'translate-x-5 bg-white dark:bg-black' : 'bg-zinc-800 dark:bg-white'}`}></div>
                    </div>
                    <span className="text-xs font-bold text-black dark:text-white">{t.hasStroke}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" className="sr-only" 
                        checked={settings.showGrid}
                        onChange={() => setSettings({...settings, showGrid: !settings.showGrid})}
                      />
                      <div className={`w-10 h-5 border border-zinc-200 dark:border-zinc-800 transition-colors ${settings.showGrid ? 'bg-zinc-100 dark:bg-white' : 'bg-white dark:bg-zinc-600'}`}></div>
                      <div className={`absolute left-1 top-1 w-3 h-3 bg-white border border-zinc-400 dark:border-black transition-transform ${settings.showGrid ? 'translate-x-5 bg-white dark:bg-black' : 'bg-zinc-800 dark:bg-white'}`}></div>
                    </div>
                    <span className="text-xs font-bold text-black dark:text-white">{t.showGrid}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" className="sr-only" 
                        checked={settings.showOrigin}
                        onChange={() => setSettings({...settings, showOrigin: !settings.showOrigin})}
                      />
                      <div className={`w-10 h-5 border border-zinc-200 dark:border-zinc-800 transition-colors ${settings.showOrigin ? 'bg-zinc-100 dark:bg-white' : 'bg-white dark:bg-zinc-600'}`}></div>
                      <div className={`absolute left-1 top-1 w-3 h-3 bg-white border border-zinc-400 dark:border-black transition-transform ${settings.showOrigin ? 'translate-x-5 bg-white dark:bg-black' : 'bg-zinc-800 dark:bg-white'}`}></div>
                    </div>
                    <span className="text-xs font-bold text-black dark:text-white">{t.showOrigin}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" className="sr-only" 
                        checked={settings.autoScale}
                        onChange={() => setSettings({...settings, autoScale: !settings.autoScale})}
                      />
                      <div className={`w-10 h-5 border border-zinc-200 dark:border-zinc-800 transition-colors ${settings.autoScale ? 'bg-zinc-100 dark:bg-white' : 'bg-white dark:bg-zinc-600'}`}></div>
                      <div className={`absolute left-1 top-1 w-3 h-3 bg-white border border-zinc-400 dark:border-black transition-transform ${settings.autoScale ? 'translate-x-5 bg-white dark:bg-black' : 'bg-zinc-800 dark:bg-white'}`}></div>
                    </div>
                    <span className="text-xs font-bold text-black dark:text-white">{t.autoScale}</span>
                  </label>
                </div>

                {/* Resolution Select */}
                <div className="space-y-2">
                  <label className="text-xs font-bold block text-zinc-950 dark:text-white">{t.resolution}</label>
                  <select 
                    value={settings.resolution}
                    onChange={(e) => setSettings({...settings, resolution: parseInt(e.target.value)})}
                    className="w-full p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold focus:ring-1 focus:ring-zinc-400 text-zinc-950 dark:text-white outline-none"
                  >
                    <option value={256}>256 × 256</option>
                    <option value={512}>512 × 512</option>
                    <option value={1024}>1024 × 1024</option>
                  </select>
                </div>
              </div>

              {/* Export Button */}
              <button 
                onClick={exportImage}
                className="w-full py-3 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-black dark:text-white font-bold border border-zinc-200 dark:border-zinc-800 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Download size={18} />
                {t.export}
              </button>
            </div>
          </div>

          {/* Stats Section (Moved lower) */}
          <div className={`p-6 border border-zinc-200 dark:border-zinc-700 ${isDarkMode ? 'bg-zinc-900' : 'bg-white shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={20} className="text-zinc-950 dark:text-white" />
              <h2 className="font-bold text-zinc-950 dark:text-white">{t.stats}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <p className="text-[10px] uppercase tracking-wider text-zinc-950 dark:text-white mb-1 font-bold">{t.sequenceLength}</p>
                <p className="text-lg font-mono font-bold text-zinc-950 dark:text-white">{stats.length.toLocaleString()}</p>
              </div>
              {Object.entries(stats.frequencies).map(([n, f]) => (
                <div key={n} className="p-3 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-950 dark:text-white mb-1 font-bold">{n}</p>
                  <p className="text-lg font-mono font-bold text-zinc-950 dark:text-white">{(f / (stats.length || 1) * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
            
            {/* Dinucleotide Heatmap */}
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wider text-zinc-950 dark:text-white mb-2 font-bold">{t.dinucleotideFrequencies}</p>
              <div className="grid grid-cols-4 gap-1">
                {['AA', 'AT', 'AG', 'AC', 'TA', 'TT', 'TG', 'TC', 'GA', 'GT', 'GG', 'GC', 'CA', 'CT', 'CG', 'CC'].map(dn => {
                  const count = stats.dinucleotideFrequencies[dn] || 0;
                  const intensity = Math.min(count / (stats.length / 8), 1);
                  return (
                    <div 
                      key={dn} 
                      className="aspect-square flex flex-col items-center justify-center text-[10px] font-mono transition-all hover:scale-105 border border-zinc-200 dark:border-zinc-700"
                      style={{ 
                        backgroundColor: isDarkMode ? `rgba(255, 255, 255, ${intensity})` : `rgba(0, 0, 0, ${intensity * 0.3})`,
                        color: isDarkMode ? (intensity > 0.5 ? 'black' : 'white') : (intensity > 0.7 ? 'white' : 'black')
                      }}
                      title={`${dn}: ${count}`}
                    >
                      <span className="font-bold">{dn}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showInstructions && (
          <Modal title={t.howToPlay} onClose={() => setShowInstructions(false)}>
            <div className="space-y-6">
              <section>
                <h3 className="text-zinc-950 dark:text-white font-bold flex items-center gap-2 mb-2">
                  <ChevronRight size={16} />
                  {t.spatialSystem}
                </h3>
                <p className="text-sm text-zinc-900 dark:text-zinc-200 leading-relaxed">
                  {t.spatialSystemText}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono text-zinc-950 dark:text-zinc-100">A: (0, 1)</div>
                  <div className="p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono text-zinc-950 dark:text-zinc-100">T: (1, 1)</div>
                  <div className="p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono text-zinc-950 dark:text-zinc-100">G: (1, 0)</div>
                  <div className="p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono text-zinc-950 dark:text-zinc-100">C: (0, 0)</div>
                </div>
              </section>
              <section>
                <h3 className="text-zinc-950 dark:text-white font-bold flex items-center gap-2 mb-2">
                  <ChevronRight size={16} />
                  {t.colorSystem}
                </h3>
                <p className="text-sm text-zinc-900 dark:text-zinc-200 leading-relaxed">
                  {t.colorSystemText}
                </p>
              </section>
              <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <p className="text-xs text-zinc-900 dark:text-zinc-300 italic font-medium">
                  {t.instructionText}
                </p>
              </div>
            </div>
          </Modal>
        )}

        {showChallenges && (
          <Modal title={t.challenges} onClose={() => setShowChallenges(false)}>
            <div className="space-y-6">
              <ChallengeCard title={t.challenge1} text={t.challenge1Text} />
              <ChallengeCard title={t.challenge2} text={t.challenge2Text} />
              <ChallengeCard title={t.challenge3} text={t.challenge3Text} />
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-8 text-center text-zinc-900 dark:text-zinc-400 text-xs">
        <p>© 2026 DNA Geometric Walk • Scientific Visualization Tool</p>
      </footer>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white dark:bg-zinc-900 w-full max-w-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
            <h2 className="text-xl font-bold text-zinc-950 dark:text-white">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors text-zinc-950 dark:text-white">
              <X size={20} />
            </button>
          </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto text-zinc-950 dark:text-zinc-300">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChallengeCard({ title, text }: { title: string, text: string }) {
  return (
    <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-white transition-colors group">
      <h4 className="font-bold text-zinc-950 dark:text-white mb-2 group-hover:translate-x-1 transition-transform">{title}</h4>
      <p className="text-sm text-zinc-900 dark:text-zinc-200 leading-relaxed">{text}</p>
    </div>
  );
}
