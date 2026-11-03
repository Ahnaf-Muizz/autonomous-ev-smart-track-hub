import React, { useEffect, useRef, useState } from 'react';
import { PhysicsPoint, SimulationSummary } from '../types';
import { calculateSpeedBonusPoints } from '../services/batteryPhysics';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';

interface BatterySuperchargerViewProps {
  initialSoc: number;
  targetMinutes: number;
  currentMa: number;
  setCurrentMa: (val: number) => void;
  isCharging: boolean;
  livePoint: PhysicsPoint | null;
  liveSeries: PhysicsPoint[];
  lastSummary: SimulationSummary | null;
  theme?: 'dark' | 'light';
  attemptCount: number;
  onStartCharge: () => void;
  onPlayGame?: () => void;
}

export const BatterySuperchargerView: React.FC<BatterySuperchargerViewProps> = ({
  initialSoc,
  targetMinutes,
  currentMa,
  setCurrentMa,
  isCharging,
  livePoint,
  liveSeries,
  lastSummary,
  theme = 'dark',
  attemptCount,
  onStartCharge,
  onPlayGame,
}) => {
  const [showInstructions, setShowInstructions] = useState<boolean>(true);
  const [showScience, setShowScience] = useState(false);

  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isDark = theme === 'dark';

  const startSocPct = Math.round(initialSoc * 100);
  const neededMah = Math.round((1 - initialSoc) * 2300);
  const batteryPct = Math.max(0, Math.min(100, livePoint?.soc_pct ?? startSocPct));
  const tempC = livePoint?.T1_C ?? 31.85;
  const simMin = livePoint?.sim_time_min ?? 0.0;

  // Ideal charging speed for neededMah in targetMinutes (+1,200 mA safe window)
  const hours = targetMinutes / 60;
  const minRequiredMa = Math.round(neededMah / hours);
  const maxSafeMa = minRequiredMa + 1200;

  // 5 Attempts Score System:
  // Attempt 1 = 500, Attempt 2 = 400, Attempt 3 = 300, Attempt 4 = 200, Attempt 5 = 100
  const currentAttemptPoints =
    attemptCount >= 1 && attemptCount <= 5 ? 600 - attemptCount * 100 : 0;

  const { timeSavedMin, timeBonusPoints } = calculateSpeedBonusPoints(
    targetMinutes,
    lastSummary?.time_to_full_min,
    initialSoc
  );
  const totalScorePoints = currentAttemptPoints + timeBonusPoints;

  const timeFrac = Math.max(0, Math.min(100, (simMin / Math.max(1, targetMinutes)) * 100));
  const heatFrac = Math.max(5, Math.min(100, ((tempC - 25) / 45) * 100));
  const limitFrac = ((61.85 - 25) / 45) * 100;
  const isOverheated = tempC >= 61.85;
  const isWarm = tempC >= 52 && tempC < 61.85;

  // Render Live Curve inside Helper Drawer when open (with uniform scaling)
  useEffect(() => {
    if (!showScience) return;
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(300, rect.width || 440);
    const cssH = Math.max(140, rect.height || 150);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const W = 440;
    const H = 150;
    const scale = Math.min(cssW / W, cssH / H);
    const offsetX = (cssW - W * scale) / 2;
    const offsetY = (cssH - H * scale) / 2;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = isDark ? '#080D1A' : '#F8FAFC';
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const pad = { l: 36, r: 24, t: 26, b: 22 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    ctx.font = '700 10.5px Inter, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('● Battery %', pad.l, 15);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('● Heat (°C)', pad.l + 85, 15);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('--- 61.9°C Max Limit', pad.l + 170, 15);

    const limY = pad.t + ph * (1 - (61.85 - 20) / 60);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    ctx.beginPath();
    ctx.moveTo(pad.l, limY);
    ctx.lineTo(pad.l + pw, limY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (liveSeries.length > 1) {
      const maxT = Math.max(targetMinutes, liveSeries[liveSeries.length - 1].sim_time_min || 1);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      liveSeries.forEach((p, idx) => {
        const x = pad.l + (p.sim_time_min / maxT) * pw;
        const y = pad.t + ph * (1 - p.soc_pct / 100);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      liveSeries.forEach((p, idx) => {
        const x = pad.l + (p.sim_time_min / maxT) * pw;
        const y = pad.t + ph * (1 - (p.T1_C - 20) / 60);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }, [showScience, liveSeries, targetMinutes, isDark]);

  // =========================================================================
  // VIEW 1: DEDICATED INSTRUCTIONS & SCORING CARD (Before clicking Play Game)
  // =========================================================================
  if (showInstructions) {
    return (
      <div
        className={`flex flex-col gap-3.5 h-full justify-between animate-fadeIn p-4 sm:p-5 rounded-3xl border transition-colors ${
          isDark ? 'bg-[#080D1A] border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        {/* Top Header */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${
                isDark ? 'bg-amber-500/15 text-amber-300 border-amber-400/30' : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              ⚡ Step 3 · Mission Instructions
            </span>
            <span className={`text-xs font-black flex items-center gap-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              <Trophy className="w-3.5 h-3.5" /> 500 Base Pts + Speed Bonus
            </span>
          </div>

          <h2 className={`text-lg sm:text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
            How to Play &amp; Score Points
          </h2>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Your rover is docked inside the Supercharger Bay! Your goal is to charge the battery to{' '}
            <strong className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>100% full</strong> in under{' '}
            <strong className={isDark ? 'text-blue-400' : 'text-blue-700'}>{targetMinutes} minutes</strong> without overheating.
          </p>
        </div>

        {/* Prominent Mission Targets */}
        <div
          className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-blue-500/15 via-slate-900 to-amber-500/15 border-blue-400/30'
              : 'bg-gradient-to-r from-blue-50 via-slate-50 to-amber-50 border-blue-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>🔋 Battery Needed:</span>
            <span
              className={`px-2 py-0.5 rounded-lg border font-black text-sm ${
                isDark ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              {neededMah.toLocaleString()} mAh ({startSocPct}% → 100%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>⏱️ Target Time:</span>
            <span
              className={`px-2 py-0.5 rounded-lg border font-black text-sm ${
                isDark ? 'bg-blue-500/25 text-blue-200 border-blue-400/40' : 'bg-blue-100 text-blue-900 border-blue-300'
              }`}
            >
              {targetMinutes} min ({hours.toFixed(2)} hr)
            </span>
          </div>
        </div>

        {/* 3 Core Rule Cards */}
        <div className="grid grid-cols-1 gap-2.5 flex-1 overflow-y-auto pr-0.5">
          {/* Rule 1: 5 Attempts Max */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2 transition-colors ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black">
                  1
                </span>
                <span className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  5 Attempts Max · 1st Attempt Wins 500 Pts!
                </span>
              </div>
              <span className={`text-[10px] font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                Fewer attempts = More points
              </span>
            </div>

            {/* Visual 5-Step Points Ladder */}
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {[
                { att: 1, pts: 500, label: '1st' },
                { att: 2, pts: 400, label: '2nd' },
                { att: 3, pts: 300, label: '3rd' },
                { att: 4, pts: 200, label: '4th' },
                { att: 5, pts: 100, label: '5th' },
              ].map((step) => (
                <div
                  key={step.att}
                  className={`p-1.5 rounded-xl border flex flex-col items-center justify-center transition ${
                    step.att === attemptCount && attemptCount <= 5
                      ? isDark
                        ? 'bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/40 shadow-sm'
                        : 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-300 shadow-sm'
                      : step.att < attemptCount
                      ? isDark
                        ? 'bg-red-500/10 border-red-500/30 text-red-400 line-through opacity-60'
                        : 'bg-red-50 border-red-200 text-red-600 line-through opacity-60'
                      : isDark
                      ? 'bg-slate-950/70 border-slate-800 text-slate-400'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="text-[10px] font-bold">{step.label}</span>
                  <span className="text-xs font-black">{step.pts}p</span>
                </div>
              ))}
            </div>

            <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Overheating or running out of time consumes 1 attempt. After 5 failed attempts, 0 attempt points are awarded.
            </p>
          </div>

          {/* Rule 2: Speed Efficiency Bonus */}
          <div
            className={`p-3.5 rounded-2xl border space-y-1.5 transition-colors ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-black">
                  2
                </span>
                <span className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Speed Efficiency Bonus (Up to +250 Pts)
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-800'
                }`}
              >
                Target: {targetMinutes} min
              </span>
            </div>
            <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              The faster you charge below the {targetMinutes}-minute target, the higher your bonus — up to{' '}
              <strong className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>+250 Bonus Points</strong>!
              Pushing your current near the fastest safe speed without overheating maximizes your speed score!
            </p>
          </div>

          {/* Rule 3: Thermal Safety */}
          <div
            className={`p-3.5 rounded-2xl border space-y-1.5 transition-colors ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-black">
                  3
                </span>
                <span className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Thermal Safety Limit (Keep Battery &lt; 61.9°C)
                </span>
              </div>
              <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5">
                <Flame className="w-3 h-3" /> 61.9°C Max
              </span>
            </div>
            <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              High charging speed generates rapid heat (<code className="font-mono font-bold">Q = I² × R</code>). If the battery
              temperature reaches <strong>61.9°C</strong>, emergency cooling trips, the run fails, and you lose an attempt!
            </p>
          </div>
        </div>

        {/* Action Button: Got It - Play Game */}
        <button
          type="button"
          onClick={() => {
            setShowInstructions(false);
            onPlayGame?.();
          }}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-amber-500/25 active:scale-[0.99]"
        >
          <span>Got It — Play Game!</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: INTERACTIVE SUPERCHARGER GAME CONTROLS & METERS
  // =========================================================================
  return (
    <div className="flex flex-col gap-3.5 h-full justify-between">
      {/* Header + Instructions Toggle + Difficulty Selector */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              Step 3 of 4 · EV Supercharger Game
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Instructions Button */}
            <button
              type="button"
              onClick={() => setShowInstructions(true)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                isDark
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-amber-400 hover:border-amber-400/50'
                  : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 shadow-sm'
              }`}
              title="Review game rules & scoring scale"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Rules &amp; Scoring</span>
            </button>
          </div>
        </div>

        {/* First-Line Mission Spec: Capacity + Time Required */}
        <div
          className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-blue-500/15 via-slate-900 to-amber-500/15 border-blue-400/30'
              : 'bg-gradient-to-r from-blue-50 via-slate-50 to-amber-50 border-blue-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>🔋 Capacity Needed:</span>
            <span
              className={`px-2.5 py-1 rounded-lg border font-black text-base ${
                isDark ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              {neededMah.toLocaleString()} mAh
            </span>
            <span className={`text-[11px] font-semibold hidden sm:inline ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              ({startSocPct}% → 100%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>⏱️ Time Required:</span>
            <span
              className={`px-2.5 py-1 rounded-lg border font-black text-base ${
                isDark ? 'bg-blue-500/25 text-blue-200 border-blue-400/40' : 'bg-blue-100 text-blue-900 border-blue-300'
              }`}
            >
              {targetMinutes} min ({hours.toFixed(2)} hr)
            </span>
          </div>
        </div>

        {/* 5-ATTEMPTS STATUS TRACKER BAR */}
        <div
          className={`p-2.5 sm:p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 transition-colors ${
            isDark ? 'bg-slate-900/85 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              🎯 Attempt:
            </span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((idx) => {
                const isCurrent = idx === attemptCount && attemptCount <= 5 && !lastSummary?.success;
                const isPassed = Boolean(lastSummary?.success && idx === (attemptCount <= 5 ? attemptCount : 5));
                const isFailed = idx < attemptCount;
                const pts = 600 - idx * 100;

                return (
                  <div
                    key={idx}
                    className={`px-2 py-0.5 rounded-lg border text-xs font-black flex items-center gap-1 transition ${
                      isPassed
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-sm'
                        : isCurrent
                        ? isDark
                          ? 'bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/40 animate-pulse'
                          : 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-300 animate-pulse'
                        : isFailed
                        ? isDark
                          ? 'bg-red-500/15 border-red-500/40 text-red-400 line-through opacity-60'
                          : 'bg-red-50 border-red-200 text-red-600 line-through opacity-60'
                        : isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-500'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                    title={`Attempt ${idx}: ${pts} points`}
                  >
                    <span>#{idx}</span>
                    <span className="text-[10px] hidden sm:inline">({pts}p)</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              This Try Worth:
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-lg border text-xs font-black ${
                currentAttemptPoints > 0
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-red-500/20 text-red-400 border-red-400/40'
              }`}
            >
              {currentAttemptPoints > 0 ? `${currentAttemptPoints} pts` : '0 pts (Out)'}
            </span>
          </div>
        </div>
      </div>

      {/* Cutaway EV Battery Tank & Heat Thermometer Cards */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-2xl border transition-colors ${
          isDark ? 'border-slate-800 bg-[#080D1A]' : 'border-slate-200 bg-slate-50 shadow-sm'
        }`}
      >
        {/* Left 7 cols: Cutaway EV Battery Tank */}
        <div className="sm:col-span-7 flex flex-col justify-between gap-2.5">
          <div className="flex items-center pr-2">
            {/* Battery Body */}
            <div
              className={`relative flex-1 h-28 rounded-2xl border-2 p-1.5 overflow-hidden transition-colors ${
                isOverheated
                  ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : batteryPct >= 99.5
                  ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                  : isDark
                  ? 'border-slate-700 bg-slate-950'
                  : 'border-slate-300 bg-white shadow-inner'
              }`}
            >
              {/* Liquid Energy Fill */}
              <div
                className={`h-full rounded-xl transition-all duration-150 ${
                  isOverheated
                    ? 'bg-gradient-to-r from-orange-500 to-red-500'
                    : batteryPct >= 99.5
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400'
                }`}
                style={{ width: `${batteryPct}%` }}
              />

              {/* Centered Battery % Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                <span className="text-3xl font-black text-white tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] leading-none">
                  {batteryPct.toFixed(0)}%
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] mt-1">
                  Battery Level
                </span>
              </div>
            </div>
            {/* Positive Terminal Nub */}
            <div className={`w-2.5 h-8 rounded-r-md shrink-0 ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} />
          </div>

          {/* Clock Progress Bar */}
          <div className="space-y-1">
            <div className={`flex items-center justify-between text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <span>⏱️ Clock: {simMin.toFixed(0)} / {targetMinutes} min</span>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{timeFrac.toFixed(0)}% of window</span>
            </div>
            <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  timeFrac >= 100 && batteryPct < 99.5 ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${timeFrac}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right 5 cols: Battery Heat Thermometer Card */}
        <div
          className={`sm:col-span-5 p-3.5 rounded-xl border flex flex-col justify-between gap-2 transition-colors ${
            isOverheated
              ? 'border-red-500/80 bg-red-500/10'
              : isDark
              ? 'border-slate-800 bg-slate-900/95'
              : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            🌡️ Battery Heat
          </div>

          <div>
            <div
              className={`text-2xl font-black tabular-nums leading-tight ${
                isOverheated ? 'text-red-500' : isWarm ? 'text-amber-500' : isDark ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              {tempC.toFixed(1)}°C
            </div>
            <div className={`text-[11px] font-bold mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Danger Line: 61.9°C 🔥
            </div>
          </div>

          {/* Heat Bar with Red Limit Marker */}
          <div
            className={`relative w-full h-3 rounded-full border overflow-visible my-1 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                isOverheated ? 'bg-red-500' : isWarm ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${heatFrac}%` }}
            />
            <div
              className="absolute -top-1 -bottom-1 w-0.5 bg-red-500"
              style={{ left: `${limitFrac}%` }}
              title="61.9°C Overheat Limit"
            />
          </div>

          <div
            className={`text-[11px] font-extrabold ${
              isOverheated
                ? isDark ? 'text-red-300' : 'text-red-700'
                : isWarm
                ? isDark ? 'text-amber-200' : 'text-amber-700'
                : isDark ? 'text-emerald-300' : 'text-emerald-700'
            }`}
          >
            {isOverheated
              ? '🚨 TOO HOT! OVERHEATED'
              : isWarm
              ? '⚠️ Getting Warm!'
              : '❄️ Cool & Safe'}
          </div>
        </div>
      </div>

      {/* Charging Speed (mA) Input Card */}
      <div
        className={`p-4 rounded-2xl border space-y-3 transition-colors ${
          isDark ? 'bg-slate-900/75 border-slate-800/90' : 'bg-slate-50 border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-xs font-extrabold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
            Pick Charging Speed (mA)
          </span>
        </div>

        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            disabled={isCharging}
            onClick={() => setCurrentMa(Math.max(500, currentMa - 100))}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0 transition ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
            }`}
          >
            <Minus className="w-4 h-4" />
          </button>

          <div className="flex items-baseline gap-1.5">
            <input
              type="number"
              min={500}
              max={8000}
              step={50}
              disabled={isCharging}
              value={currentMa}
              onChange={(e) => setCurrentMa(Math.max(500, Math.min(8000, Number(e.target.value) || 500)))}
              className={`w-32 bg-transparent text-right text-3xl sm:text-4xl font-black tabular-nums focus:outline-none ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            />
            <span className={`text-base font-extrabold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>mA</span>
          </div>

          <button
            type="button"
            disabled={isCharging}
            onClick={() => setCurrentMa(Math.min(8000, currentMa + 100))}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0 transition ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
            }`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <input
          type="range"
          min={500}
          max={8000}
          step={50}
          disabled={isCharging}
          value={currentMa}
          onChange={(e) => setCurrentMa(Number(e.target.value))}
          className={`w-full h-2.5 rounded-lg appearance-none cursor-pointer accent-amber-500 ${
            isDark ? 'bg-slate-800' : 'bg-slate-200'
          }`}
        />

        <div className={`flex flex-wrap justify-between gap-1 text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <span>500 mA (Slow)</span>
          <span>8,000 mA (Max)</span>
        </div>
      </div>

      {/* Outcome Banner if finished or failed */}
      {lastSummary && !isCharging && (
        <div
          className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-colors ${
            lastSummary.success
              ? isDark
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm'
              : isDark
              ? 'bg-red-500/15 border-red-400/40 text-red-100'
              : 'bg-red-50 border-red-300 text-red-900 shadow-sm'
          }`}
        >
          {lastSummary.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : lastSummary.overheated ? (
            <Flame className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="text-xs leading-relaxed flex-1">
            <div className="font-extrabold text-sm flex flex-wrap items-center justify-between gap-1">
              <span>
                {lastSummary.success
                  ? '100% Charged! Gate 2 is Opening!'
                  : lastSummary.overheated
                  ? `Too Hot! Battery Hit ${Number(lastSummary.peak_T1_C ?? 62).toFixed(1)}°C!`
                  : `Time Ran Out at ${Number(lastSummary.final_soc_pct ?? 50).toFixed(0)}% Full!`}
              </span>
              {lastSummary.success && (
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-black border ${
                    isDark
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  +{totalScorePoints} Points Earned!
                </span>
              )}
            </div>
            <div>
              {lastSummary.success
                ? `Awesome! Attempt ${attemptCount} (${currentAttemptPoints} pts) + Time Bonus (+${timeBonusPoints} pts). Zooming to Finish Line!`
                : attemptCount <= 5
                ? `Attempt ${attemptCount - 1} burned. You have ${6 - attemptCount} attempt(s) remaining! Try #${attemptCount} is worth ${currentAttemptPoints} pts.`
                : 'Attempt 5 burned. All 5 Attempts Used (0 Pts)! Reset station to try a new challenge.'}
            </div>
          </div>
        </div>
      )}

      {/* Primary 10s Supercharge Trigger Button */}
      {(() => {
        const isOutOfAttempts = attemptCount > 5;
        const isSuperchargeDisabled = isCharging || Boolean(lastSummary?.success) || isOutOfAttempts;
        return (
          <button
            type="button"
            disabled={isSuperchargeDisabled}
            onClick={onStartCharge}
            className={`w-full py-4 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition ${
              isSuperchargeDisabled
                ? isDark
                  ? 'bg-slate-800/90 text-slate-500 border border-slate-700/80 cursor-not-allowed opacity-60 shadow-none'
                  : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 shadow-none'
                : lastSummary && !lastSummary.success
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/30 cursor-pointer animate-pulse'
                : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/25 cursor-pointer'
            }`}
          >
            {isCharging ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-amber-400 animate-spin" />
                <span>Supercharging Battery (10s)...</span>
              </>
            ) : lastSummary?.success ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Battery Charged (100%) · Ready to Exit!</span>
              </>
            ) : isOutOfAttempts ? (
              <>
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>All 5 Attempts Used (0 Pts)</span>
              </>
            ) : lastSummary && !lastSummary.success ? (
              <>
                <RotateCcw className="w-5 h-5 text-slate-950" />
                <span>Adjust Speed &amp; Try Attempt {attemptCount} of 5 ({currentAttemptPoints} pts)</span>
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 fill-slate-950" />
                <span>Charge the Battery! (10s) · Worth {currentAttemptPoints} pts</span>
              </>
            )}
          </button>
        );
      })()}

      {/* Need a Hint Drawer: Appears and blinks when the first two attempts fail (attemptCount >= 3) */}
      {attemptCount >= 3 && (
        <div
          className={`rounded-2xl border overflow-hidden transition-all animate-hintBlink ${
            isDark
              ? 'bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-amber-500/10 border-amber-400/50 shadow-lg shadow-amber-500/15'
              : 'bg-gradient-to-r from-amber-50 via-white to-amber-50 border-amber-400 shadow-md shadow-amber-500/15'
          }`}
        >
          <button
            type="button"
            onClick={() => setShowScience(!showScience)}
            className={`w-full px-4 py-3 flex items-center justify-between text-xs font-black cursor-pointer transition ${
              isDark ? 'text-amber-300 hover:text-amber-200' : 'text-amber-900 hover:text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">💡</span>
              <span className="font-extrabold text-[12px] sm:text-xs">Need a Hint? See the Simple Formula &amp; Graph</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 border border-amber-300 shadow-sm ml-1">
                Hint Unlocked
              </span>
            </div>
            {showScience ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showScience && (
            <div
              className={`px-4 pb-4 space-y-2.5 border-t pt-3 text-xs ${
                isDark ? 'border-slate-800/80 text-slate-300' : 'border-slate-200 text-slate-700'
              }`}
            >
              <div
                className={`font-mono p-2.5 rounded-xl border leading-relaxed ${
                  isDark ? 'bg-slate-950 border-slate-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                Min Speed = {neededMah.toLocaleString()} mAh ÷ {hours.toFixed(2)} hr = {minRequiredMa.toLocaleString()} mA
                <br />
                👉 Safe Window = {minRequiredMa.toLocaleString()} mA to {maxSafeMa.toLocaleString()} mA (Overheats above{' '}
                {maxSafeMa.toLocaleString()} mA!)
              </div>
              <canvas
                ref={chartCanvasRef}
                className={`w-full h-[145px] rounded-xl border block ${isDark ? 'border-slate-800' : 'border-slate-200'}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
