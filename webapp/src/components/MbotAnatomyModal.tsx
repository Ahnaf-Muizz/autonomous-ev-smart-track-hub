import React, { useEffect, useRef, useState } from 'react';
import { MBOT_PARTS, MBOT_PART_LIST } from '../data/mbotParts';
import { MbotPartId } from '../types';
import { ArrowLeft, ChevronLeft, ChevronRight, Cpu, Sparkles, X } from 'lucide-react';

interface MbotAnatomyModalProps {
  isOpen: boolean;
  initialPartId: MbotPartId | null;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

export const MbotAnatomyModal: React.FC<MbotAnatomyModalProps> = ({
  isOpen,
  initialPartId,
  onClose,
  theme = 'dark',
}) => {
  const [selectedPartId, setSelectedPartId] = useState<MbotPartId | null>(initialPartId);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interactive simulator controls for Level-2 part deep-dive
  const [mecanumCmd, setMecanumCmd] = useState<'w' | 's' | 'a' | 'd'>('w');
  const [lineOffset, setLineOffset] = useState<number>(0);
  const [barrierDistCm, setBarrierDistCm] = useState<number>(12);
  const [ledPattern, setLedPattern] = useState<
    'rainbow' | 'standby' | 'cyan' | 'green' | 'solid' | 'red'
  >('rainbow');
  const [rearLeftHit, setRearLeftHit] = useState(false);
  const [rearRightHit, setRearRightHit] = useState(false);

  useEffect(() => {
    setSelectedPartId(initialPartId);
  }, [initialPartId, isOpen]);

  // Run 60fps interactive part simulator on Level-2 canvas
  useEffect(() => {
    if (!isOpen || !selectedPartId) return;
    let animId: number;

    const drawSim = (now: number) => {
      const canvas = simCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(300, rect.width || 480);
      const cssH = Math.max(150, rect.height || 190);
      const W = 480;
      const H = 190;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }

      const scale = Math.min(cssW / W, cssH / H);
      const offsetX = (cssW - W * scale) / 2;
      const offsetY = (cssH - H * scale) / 2;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = theme === 'dark' ? '#070B14' : '#F8FAFC';
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Subtle grid
      ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.06)' : 'rgba(100, 116, 139, 0.12)';
      for (let x = 24; x < W; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 24; y < H; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      if (selectedPartId === 'mecanum') {
        const cx = W / 2;
        const cy = H / 2 + 8;
        const dirs: Record<
          string,
          { fl: number; fr: number; rl: number; rr: number; label: string }
        > = {
          w: { fl: 1, fr: 1, rl: 1, rr: 1, label: '🚀 Drive Forward · All 4 Wheels Spin Forward' },
          s: { fl: -1, fr: -1, rl: -1, rr: -1, label: '⏪ Back Up · All 4 Wheels Spin Backward' },
          a: { fl: -1, fr: 1, rl: 1, rr: -1, label: '🦀 Crab Slide Left · Diagonal Rollers Push Sideways!' },
          d: { fl: 1, fr: -1, rl: -1, rr: 1, label: '🦀 Crab Slide Right · Diagonal Rollers Push Sideways!' },
        };
        const d = dirs[mecanumCmd];

        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 46, cy - 50, 92, 100, 14);
        ctx.fill();
        ctx.stroke();

        const wPos = [
          { x: cx - 60, y: cy - 32, dir: d.fl },
          { x: cx + 60, y: cy - 32, dir: d.fr },
          { x: cx - 60, y: cy + 32, dir: d.rl },
          { x: cx + 60, y: cy + 32, dir: d.rr },
        ];
        for (const w of wPos) {
          ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#f1f5f9';
          ctx.strokeStyle = w.dir > 0 ? (theme === 'dark' ? '#34d399' : '#10b981') : (theme === 'dark' ? '#f59e0b' : '#d97706');
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(w.x - 12, w.y - 20, 24, 40, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = w.dir > 0 ? (theme === 'dark' ? '#34d399' : '#059669') : (theme === 'dark' ? '#f59e0b' : '#d97706');
          ctx.font = '800 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(w.dir > 0 ? '▲' : '▼', w.x, w.y + 4);
        }

        ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '800 12.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, cx, 22);
      } else if (selectedPartId === 'linesensors') {
        ctx.fillStyle = theme === 'dark' ? '#090D16' : '#cbd5e1';
        ctx.fillRect(40, 36, 400, 125);
        ctx.fillStyle = theme === 'dark' ? '#EDF2FF' : '#ffffff';
        ctx.fillRect(110, 36, 260, 125);

        if (lineOffset === 2) {
          ctx.fillStyle = theme === 'dark' ? '#090D16' : '#1e293b';
          ctx.fillRect(110, 74, 260, 42);
        }

        const rx = lineOffset === 2 ? 240 : 240 + lineOffset * 130;
        const a6X = rx - 24;
        const a7X = rx + 24;
        const a6Black = lineOffset === 2 || a6X < 110 || a6X > 370;
        const a7Black = lineOffset === 2 || a7X < 110 || a7X > 370;

        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(rx - 44, 68, 88, 44, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = a6Black ? '#ef4444' : (theme === 'dark' ? '#34d399' : '#10b981');
        ctx.beginPath();
        ctx.arc(a6X, 90, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = a7Black ? '#ef4444' : (theme === 'dark' ? '#34d399' : '#10b981');
        ctx.beginPath();
        ctx.arc(a7X, 90, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '800 12.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        const status =
          a6Black && a7Black
            ? '🏁 Both Eyes See Black → Finish Line Celebration!'
            : a6Black
            ? '↩️ Left Eye Sees Black Edge → Steer Right!'
            : a7Black
            ? '↪️ Right Eye Sees Black Edge → Steer Left!'
            : '✅ Both Eyes See White Road → Cruise Ahead!';
        ctx.fillText(status, W / 2, 22);
      } else if (selectedPartId === 'frontir') {
        const triggered = barrierDistCm <= 5;

        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(45, 65, 95, 66, 12);
        ctx.fill();
        ctx.stroke();

        const bx = 155 + barrierDistCm * 14;
        ctx.fillStyle = triggered ? '#ef4444' : (theme === 'dark' ? '#34d399' : '#10b981');
        ctx.beginPath();
        ctx.roundRect(bx, 42, 14, 112, 5);
        ctx.fill();

        ctx.fillStyle = triggered ? 'rgba(239, 68, 68, 0.28)' : 'rgba(56, 189, 248, 0.2)';
        ctx.beginPath();
        ctx.moveTo(140, 98);
        ctx.lineTo(bx, 62);
        ctx.lineTo(bx, 134);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '800 12.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          triggered
            ? `🛑 Gate is Close (${barrierDistCm} cm) → Auto-Brakes On!`
            : `✅ Path Clear (${barrierDistCm} cm) → Keep Driving!`,
          W / 2,
          24
        );
      } else if (selectedPartId === 'rgbleds') {
        const blink = Math.floor(now / 220) % 2 === 0;
        const colors = [0, 1, 2, 3].map((i) => {
          if (ledPattern === 'rainbow') {
            const hue = (Math.floor(now / 2) + i * 90) % 360;
            return `hsl(${hue}, 95%, 60%)`;
          }
          if (ledPattern === 'standby') {
            const hue = Math.floor(now / 16) % 360;
            return `hsl(${hue}, 85%, 58%)`;
          }
          if (ledPattern === 'cyan') return blink ? '#22d3ee' : '#0f293a';
          if (ledPattern === 'green') return blink ? '#34d399' : '#0f2e24';
          if (ledPattern === 'solid') return '#34d399';
          return blink ? '#ef4444' : '#3b1212';
        });

        ctx.fillStyle = theme === 'dark' ? '#111827' : '#ffffff';
        ctx.strokeStyle = theme === 'dark' ? '#475569' : '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(85, 68, 310, 68, 16);
        ctx.fill();
        ctx.stroke();

        for (let i = 0; i < 4; i++) {
          const x = 135 + i * 70;
          ctx.fillStyle = colors[i];
          ctx.shadowColor = colors[i];
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(x, 102, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
          ctx.font = '700 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Light #${i + 1}`, x, 154);
        }

        ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '800 12.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          ledPattern === 'rainbow'
            ? '🏁 Complete Loop: Every Single Light Chases Rainbow Colors!'
            : ledPattern === 'standby'
            ? '🌊 Standby Mode: All Lights Glow Together Slowly'
            : '⚡ Charging Bay Status Signal',
          W / 2,
          26
        );
      } else {
        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(22, 38, 436, 118, 16);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '800 13.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        if (selectedPartId === 'bumpers') {
          const hit = rearLeftHit || rearRightHit;
          ctx.fillStyle = hit ? '#ef4444' : (theme === 'dark' ? '#34d399' : '#059669');
          ctx.fillText(
            hit ? '🚨 Bumper Pressed! Reverse Motor Stopped!' : '✅ Rear Bumpers Clear — Safe to Back Up',
            W / 2,
            90,
            412
          );
          ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#64748b';
          ctx.font = '700 12px Inter, sans-serif';
          ctx.fillText('Click the buttons below to test the bumper switches!', W / 2, 120, 412);
        } else if (selectedPartId === 'ble') {
          ctx.fillStyle = theme === 'dark' ? '#60a5fa' : '#2563eb';
          ctx.fillText('📶 Instant Wireless Link to Dashboard', W / 2, 86, 412);
          ctx.fillStyle = theme === 'dark' ? '#34d399' : '#059669';
          ctx.font = '700 12px Inter, sans-serif';
          ctx.fillText('Sends Start, Charge, and Finish signals in 0.001 seconds!', W / 2, 118, 412);
        } else {
          ctx.fillStyle = theme === 'dark' ? '#f87171' : '#dc2626';
          ctx.fillText('🧠 Checking All Sensors 2,500 Times / Sec!', W / 2, 86, 412);
          ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#64748b';
          ctx.font = '700 12px Inter, sans-serif';
          ctx.fillText('Steers the wheels and updates lights without ever freezing!', W / 2, 118, 412);
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(drawSim);
    };

    animId = requestAnimationFrame(drawSim);
    return () => cancelAnimationFrame(animId);
  }, [
    isOpen,
    selectedPartId,
    mecanumCmd,
    lineOffset,
    barrierDistCm,
    ledPattern,
    rearLeftHit,
    rearRightHit,
    theme,
  ]);

  if (!isOpen) return null;

  const activeSpec = selectedPartId ? MBOT_PARTS[selectedPartId] : null;
  const activeIdx = selectedPartId
    ? MBOT_PART_LIST.findIndex((p) => p.id === selectedPartId)
    : -1;

  const handleStepPart = (delta: number) => {
    const len = MBOT_PART_LIST.length;
    const nextIdx = activeIdx >= 0 ? (activeIdx + delta + len) % len : 0;
    setSelectedPartId(MBOT_PART_LIST[nextIdx].id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full max-w-6xl max-h-[92vh] rounded-3xl border shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 ${
          theme === 'dark'
            ? 'bg-[#0D1326] border-slate-700/70 text-white'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 z-20 w-10 h-10 rounded-xl border flex items-center justify-center transition cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-600/60'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-300'
          }`}
          title="Close Explorer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ==================================================================
            LEFT COLUMN (7 cols): ILLUSTRATED MAKEBLOCK mBot MEGA + 7 PARTS
            ================================================================== */}
        <div
          className={`lg:col-span-7 p-6 sm:p-7 border-b lg:border-b-0 lg:border-r flex flex-col ${
            theme === 'dark'
              ? 'bg-gradient-to-b from-[#0B1123] to-[#080C18] border-slate-800/80'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-blue-400">
                <Cpu className="w-3.5 h-3.5" /> Interactive Robot Explorer · Tap Any Number!
              </div>
              <h2
                className={`text-xl sm:text-2xl font-black tracking-tight ${
                  theme === 'dark' ? 'text-white' : 'text-slate-900'
                }`}
              >
                Inside the mBot Mega Rover
              </h2>
            </div>
          </div>

          {/* Interactive SVG Diagram + Floating Pill Tags */}
          <div className="relative flex-1 flex items-center justify-center min-h-[370px] my-2">
            <div className="relative w-full max-w-[600px] aspect-[640/480]">
              <svg
                viewBox="0 0 640 480"
                className="w-full h-full overflow-visible select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <radialGradient id="roverFloorGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={theme === 'dark' ? 0.24 : 0.14} />
                    <stop offset="100%" stopColor={theme === 'dark' ? '#090E1C' : '#f8fafc'} stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="chassisPlate" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#263354" />
                    <stop offset="100%" stopColor="#131B31" />
                  </linearGradient>
                  <linearGradient id="megaPiBoard" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#991b1b" />
                  </linearGradient>
                </defs>

                <ellipse cx="320" cy="245" rx="225" ry="190" fill="url(#roverFloorGlow)" />

                <path d="M 320 4 L 310 18 L 330 18 Z" fill="rgba(96, 165, 250, 0.55)" />
                <text
                  x="320"
                  y="-4"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  fontWeight="800"
                  letterSpacing="1.5"
                >
                  FRONT OF ROVER
                </text>

                {/* 1. 4x Mecanum Wheels */}
                <g
                  onClick={() => setSelectedPartId('mecanum')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'mecanum' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  {[
                    { x: 175, y: 112, s: 1 },
                    { x: 465, y: 112, s: -1 },
                    { x: 175, y: 358, s: -1 },
                    { x: 465, y: 358, s: 1 },
                  ].map((w, idx) => (
                    <g key={idx} transform={`translate(${w.x}, ${w.y})`}>
                      <rect
                        x="-25"
                        y="-42"
                        width="50"
                        height="84"
                        rx="10"
                        fill="#172038"
                        stroke={selectedPartId === 'mecanum' ? '#60a5fa' : '#7c93c9'}
                        strokeWidth={selectedPartId === 'mecanum' ? '3' : '2'}
                      />
                      <line x1={-18 * w.s} y1="-26" x2={18 * w.s} y2="-8" stroke="#9fb3e0" strokeWidth="3" />
                      <line x1={-18 * w.s} y1="-6" x2={18 * w.s} y2="12" stroke="#9fb3e0" strokeWidth="3" />
                      <line x1={-18 * w.s} y1="14" x2={18 * w.s} y2="32" stroke="#9fb3e0" strokeWidth="3" />
                    </g>
                  ))}
                </g>

                {/* Main Chassis */}
                <rect
                  x="210"
                  y="72"
                  width="220"
                  height="336"
                  rx="28"
                  fill="url(#chassisPlate)"
                  stroke="#64748b"
                  strokeWidth="2.2"
                />

                {/* 2. Dual IR Line Sensors A6 & A7 */}
                <g
                  onClick={() => setSelectedPartId('linesensors')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'linesensors' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="260" y="76" width="48" height="28" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.2" />
                  <circle cx="284" cy="90" r="6" fill="#38bdf8" />
                  <text x="284" y="116" textAnchor="middle" fill="#93c5fd" fontSize="10" fontWeight="800">
                    Left Eye
                  </text>

                  <rect x="332" y="76" width="48" height="28" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.2" />
                  <circle cx="356" cy="90" r="6" fill="#38bdf8" />
                  <text x="356" y="116" textAnchor="middle" fill="#93c5fd" fontSize="10" fontWeight="800">
                    Right Eye
                  </text>
                </g>

                {/* 3. Front IR Barrier Sensor A15 */}
                <g
                  onClick={() => setSelectedPartId('frontir')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'frontir' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <path d="M 294 52 L 346 52 L 356 72 L 284 72 Z" fill="#1e293b" stroke="#fbbf24" strokeWidth="2.2" />
                  <circle cx="310" cy="62" r="5" fill="#fbbf24" />
                  <circle cx="330" cy="62" r="5" fill="#38bdf8" />
                </g>

                {/* 4. Dual 4-LED WS2812B RGB Pods */}
                <g
                  onClick={() => setSelectedPartId('rgbleds')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'rgbleds' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="205" y="182" width="22" height="106" rx="8" fill="#090d1a" stroke="#a855f7" strokeWidth="2.2" />
                  <circle cx="216" cy="200" r="6" fill="#ef4444" />
                  <circle cx="216" cy="223" r="6" fill="#eab308" />
                  <circle cx="216" cy="246" r="6" fill="#10b981" />
                  <circle cx="216" cy="269" r="6" fill="#3b82f6" />

                  <rect x="413" y="182" width="22" height="106" rx="8" fill="#090d1a" stroke="#a855f7" strokeWidth="2.2" />
                  <circle cx="424" cy="200" r="6" fill="#ef4444" />
                  <circle cx="424" cy="223" r="6" fill="#eab308" />
                  <circle cx="424" cy="246" r="6" fill="#10b981" />
                  <circle cx="424" cy="269" r="6" fill="#3b82f6" />
                </g>

                {/* 5. Makeblock MegaPi Brain */}
                <g
                  onClick={() => setSelectedPartId('megapi')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'megapi' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect
                    x="252"
                    y="156"
                    width="136"
                    height="148"
                    rx="14"
                    fill="url(#megaPiBoard)"
                    stroke="#fca5a5"
                    strokeWidth="2.2"
                  />
                  <rect x="292" y="198" width="56" height="56" rx="6" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="320" y="228" textAnchor="middle" fill="#f8fafc" fontSize="10" fontWeight="900">
                    CPU
                  </text>
                  <text x="320" y="178" textAnchor="middle" fill="#fee2e2" fontSize="11" fontWeight="900">
                    MegaPi Brain
                  </text>
                </g>

                {/* 6. Web Bluetooth Module */}
                <g
                  onClick={() => setSelectedPartId('ble')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'ble' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="334" y="274" width="46" height="62" rx="8" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2.2" />
                  <text x="357" y="310" textAnchor="middle" fill="#dbeafe" fontSize="9.5" fontWeight="800">
                    BLE
                  </text>
                </g>

                {/* 7. Rear Mechanical Bumpers */}
                <g
                  onClick={() => setSelectedPartId('bumpers')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'bumpers' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="242" y="394" width="62" height="22" rx="6" fill="#1f2937" stroke="#f87171" strokeWidth="2" />
                  <text x="273" y="409" textAnchor="middle" fill="#fecaca" fontSize="9" fontWeight="800">
                    Bumper L
                  </text>
                  <rect x="336" y="394" width="62" height="22" rx="6" fill="#1f2937" stroke="#f87171" strokeWidth="2" />
                  <text x="367" y="409" textAnchor="middle" fill="#fecaca" fontSize="9" fontWeight="800">
                    Bumper R
                  </text>
                </g>
              </svg>

              {/* Floating Numbered Part Pills over the Diagram */}
              {MBOT_PART_LIST.map((part) => {
                const isSelected = selectedPartId === part.id;
                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => setSelectedPartId(part.id)}
                    style={{ left: `${part.tagPosition.x}%`, top: `${part.tagPosition.y}%` }}
                    className={`-translate-x-1/2 -translate-y-1/2 absolute flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold transition shadow-lg cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-blue-600 text-white border-2 border-white scale-105 shadow-blue-500/40'
                        : theme === 'dark'
                        ? 'bg-slate-900/95 hover:bg-slate-800 text-slate-200 border border-slate-600/80'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-md'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-black ${
                        isSelected
                          ? 'bg-white text-blue-700'
                          : theme === 'dark'
                          ? 'bg-blue-500/25 text-blue-300'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {part.number}
                    </span>
                    {part.shortTitle}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`text-center text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            💡 Tap any numbered part on the car to play with its interactive simulator!
          </div>
        </div>

        {/* ==================================================================
            RIGHT COLUMN (5 cols): CLEAN KID-FRIENDLY DEEP-DIVE & SIMULATOR
            ================================================================== */}
        <div
          className={`lg:col-span-5 p-6 sm:p-7 overflow-y-auto max-h-[88vh] flex flex-col justify-between ${
            theme === 'dark' ? 'bg-[#0D1326]' : 'bg-white'
          }`}
        >
          {!activeSpec ? (
            /* LEVEL 1: ALL 7 SUBSYSTEMS DIRECTORY */
            <div className="space-y-4">
              <div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                    theme === 'dark'
                      ? 'bg-blue-500/15 text-blue-300 border border-blue-400/25'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  Tap a Part to Try It!
                </span>
                <h3
                  className={`text-xl font-black mt-2 ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  7 Cool Parts Inside Our Rover
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  Pick any part below (or click right on the robot picture) to test how it works!
                </p>
              </div>

              <div className="space-y-2">
                {MBOT_PART_LIST.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPartId(p.id)}
                    className={`w-full text-left p-3 rounded-2xl border transition flex items-center justify-between gap-3 group cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-blue-500/50'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-blue-400 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-xl font-black text-sm flex items-center justify-center shrink-0 border ${
                          theme === 'dark'
                            ? 'bg-blue-500/15 border-blue-400/30 text-blue-300'
                            : 'bg-blue-100 border-blue-200 text-blue-700'
                        }`}
                      >
                        {p.number}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-extrabold transition truncate ${
                            theme === 'dark'
                              ? 'text-white group-hover:text-blue-300'
                              : 'text-slate-900 group-hover:text-blue-600'
                          }`}
                        >
                          {p.name}
                        </div>
                        <div
                          className={`text-xs truncate ${
                            theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {p.summary}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition ${
                        theme === 'dark'
                          ? 'text-slate-500 group-hover:text-blue-400'
                          : 'text-slate-400 group-hover:text-blue-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* LEVEL 2: INDIVIDUAL PART DEEP-DIVE + LIVE MINI SIMULATOR */
            <div className="space-y-4">
              <div className="flex items-center justify-between pr-12">
                <button
                  type="button"
                  onClick={() => setSelectedPartId(null)}
                  className={`inline-flex items-center gap-1.5 text-xs font-extrabold cursor-pointer transition ${
                    theme === 'dark'
                      ? 'text-blue-400 hover:text-blue-300'
                      : 'text-blue-600 hover:text-blue-700'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> All 7 Parts
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStepPart(-1)}
                    title="Previous Part"
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      theme === 'dark'
                        ? 'bg-blue-500/15 text-blue-300 border-blue-400/30'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    Part #{activeSpec.number} of 7
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStepPart(1)}
                    title="Next Part"
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <h3
                  className={`text-2xl font-black leading-snug ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {activeSpec.name}
                </h3>
                <p
                  className={`text-sm mt-1.5 leading-relaxed ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-600'
                  }`}
                >
                  {activeSpec.kidExplanation}
                </p>
              </div>

              {/* Interactive Mini-Simulator Box */}
              <div
                className={`rounded-2xl overflow-hidden border ${
                  theme === 'dark'
                    ? 'bg-[#070B14] border-slate-800'
                    : 'bg-slate-50 border-slate-200 shadow-sm'
                }`}
              >
                <canvas ref={simCanvasRef} className="w-full h-[175px] block" />

                <div
                  className={`p-2.5 border-t flex flex-wrap items-center gap-1.5 ${
                    theme === 'dark'
                      ? 'bg-slate-900/90 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {activeSpec.id === 'mecanum' &&
                    (['w', 's', 'a', 'd'] as const).map((cmd) => (
                      <button
                        key={cmd}
                        type="button"
                        onClick={() => setMecanumCmd(cmd)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                          mecanumCmd === cmd
                            ? 'bg-blue-600 text-white'
                            : theme === 'dark'
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300 shadow-sm'
                        }`}
                      >
                        {cmd === 'w'
                          ? '▲ Forward (W)'
                          : cmd === 's'
                          ? '▼ Back (S)'
                          : cmd === 'a'
                          ? '🦀 Slide Left (A)'
                          : '🦀 Slide Right (D)'}
                      </button>
                    ))}

                  {activeSpec.id === 'linesensors' &&
                    [
                      { v: 0, lbl: 'White Road' },
                      { v: -1, lbl: 'Left Edge' },
                      { v: 1, lbl: 'Right Edge' },
                      { v: 2, lbl: '🏁 Finish Line' },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setLineOffset(opt.v)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                          lineOffset === opt.v
                            ? 'bg-blue-600 text-white'
                            : theme === 'dark'
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300 shadow-sm'
                        }`}
                      >
                        {opt.lbl}
                      </button>
                    ))}

                  {activeSpec.id === 'frontir' && (
                    <div className="w-full flex items-center gap-3 px-2">
                      <span
                        className={`text-xs font-bold whitespace-nowrap ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        Gate Distance: {barrierDistCm} cm
                      </span>
                      <input
                        type="range"
                        min={2}
                        max={16}
                        step={1}
                        value={barrierDistCm}
                        onChange={(e) => setBarrierDistCm(Number(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {activeSpec.id === 'rgbleds' &&
                    (
                      [
                        { id: 'rainbow', lbl: '🏁 Complete Loop' },
                        { id: 'standby', lbl: '🌊 Standby' },
                        { id: 'cyan', lbl: '💎 Ready' },
                        { id: 'green', lbl: '⚡ Charging' },
                        { id: 'solid', lbl: '✅ Full!' },
                        { id: 'red', lbl: '🔥 Too Hot' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setLedPattern(m.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                          ledPattern === m.id
                            ? 'bg-blue-600 text-white'
                            : theme === 'dark'
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300 shadow-sm'
                        }`}
                      >
                        {m.lbl}
                      </button>
                    ))}

                  {activeSpec.id === 'bumpers' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRearLeftHit(!rearLeftHit)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                          rearLeftHit
                            ? 'bg-red-600 text-white'
                            : theme === 'dark'
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-white text-slate-700 border border-slate-300 shadow-sm'
                        }`}
                      >
                        {rearLeftHit ? 'Release Left Bumper' : 'Click Left Bumper'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRearRightHit(!rearRightHit)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                          rearRightHit
                            ? 'bg-red-600 text-white'
                            : theme === 'dark'
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-white text-slate-700 border border-slate-300 shadow-sm'
                        }`}
                      >
                        {rearRightHit ? 'Release Right Bumper' : 'Click Right Bumper'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Simple Rule Box */}
              <div
                className={`p-3.5 rounded-2xl border text-xs font-extrabold text-center ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-800 text-blue-300'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                ⚡ {activeSpec.formula}
              </div>

              {/* Fun Fact */}
              <div
                className={`p-4 rounded-2xl border text-xs leading-relaxed flex gap-2.5 ${
                  theme === 'dark'
                    ? 'bg-amber-500/10 border-amber-400/25 text-amber-200'
                    : 'bg-amber-100/70 border-amber-300 text-amber-950'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <b>Fun Fact:</b> {activeSpec.funFact}
                </div>
              </div>

              {/* Prev / Next Part Footer Arrows */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleStepPart(-1)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4 text-blue-500" /> Previous Part
                </button>
                <button
                  type="button"
                  onClick={() => handleStepPart(1)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Next Part <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
