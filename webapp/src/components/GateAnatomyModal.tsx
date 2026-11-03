import React, { useEffect, useRef, useState } from 'react';
import { GATE_PARTS, GATE_PART_LIST } from '../data/gateParts';
import { GatePartId } from '../types';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Sparkles,
  Volume2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

interface GateAnatomyModalProps {
  isOpen: boolean;
  initialPartId: GatePartId | null;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

export const GateAnatomyModal: React.FC<GateAnatomyModalProps> = ({
  isOpen,
  initialPartId,
  onClose,
  theme = 'dark',
}) => {
  const [selectedPartId, setSelectedPartId] = useState<GatePartId | null>(initialPartId);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interactive simulator states
  const [servoAngle, setServoAngle] = useState<number>(0); // 0 (closed) to 90 (open)
  const [sonarDistCm, setSonarDistCm] = useState<number>(14);
  const [ledMode, setLedMode] = useState<'red' | 'yellow' | 'green'>('green');
  const [buzzerFreq, setBuzzerFreq] = useState<number>(1800);
  const [buzzerActive, setBuzzerActive] = useState<boolean>(false);
  const [wifiPingCount, setWifiPingCount] = useState<number>(42);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setSelectedPartId(initialPartId);
  }, [initialPartId, isOpen]);

  // Gentle audio beep on test
  const handleBuzzerBeep = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(buzzerFreq, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.23);
      setBuzzerActive(true);
      setTimeout(() => setBuzzerActive(false), 250);
    } catch {
      setBuzzerActive(true);
      setTimeout(() => setBuzzerActive(false), 250);
    }
  };

  const handleSendWifiPing = () => {
    setWifiPingCount((c) => c + 1);
  };

  // Run 60fps interactive simulator on canvas
  useEffect(() => {
    if (!isOpen || !selectedPartId) return;
    let animId: number;

    const drawSim = (now: number) => {
      const canvas = simCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(300, rect.width || 440);
      const cssH = Math.max(140, rect.height || 170);
      const W = 440;
      const H = 170;
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

      // Tech grid
      ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.07)' : 'rgba(100, 116, 139, 0.12)';
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

      // 1. ESP32 CPU SIMULATOR
      if (selectedPartId === 'esp32') {
        const t = now / 1000;
        const c1Load = 45 + Math.sin(t * 3) * 20;
        const c2Load = 65 + Math.cos(t * 2.5) * 22;

        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(30, 20, 180, 130, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('CORE 0 · WiFi Server', 44, 42);

        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#e2e8f0';
        ctx.beginPath();
        ctx.roundRect(44, 56, 150, 16, 6);
        ctx.fill();

        ctx.fillStyle = '#0ea5e9';
        ctx.beginPath();
        ctx.roundRect(44, 56, (150 * c1Load) / 100, 16, 6);
        ctx.fill();

        ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#334155';
        ctx.font = '10px monospace';
        ctx.fillText(`Load: ${c1Load.toFixed(0)}% · 240 MHz`, 44, 94);
        ctx.fillText('Task: HTTP & Telemetry', 44, 112);
        ctx.fillText('Status: Active Stream', 44, 130);

        // Core 1 box
        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = '#34d399';
        ctx.beginPath();
        ctx.roundRect(230, 20, 180, 130, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('CORE 1 · Sonar & Servos', 244, 42);

        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#e2e8f0';
        ctx.beginPath();
        ctx.roundRect(244, 56, 150, 16, 6);
        ctx.fill();

        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(244, 56, (150 * c2Load) / 100, 16, 6);
        ctx.fill();

        ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#334155';
        ctx.font = '10px monospace';
        ctx.fillText(`Load: ${c2Load.toFixed(0)}% · FreeRTOS`, 244, 94);
        ctx.fillText('Task: 50Hz PWM & Echo', 244, 112);
        ctx.fillText('Status: Hard Real-Time', 244, 130);
      }

      // 2. GATE SERVOS SIMULATOR
      else if (selectedPartId === 'servos') {
        const rad = (servoAngle * Math.PI) / 180;
        const pivotX = 110;
        const pivotY = 125;
        const armLen = 170;

        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#cbd5e1';
        ctx.fillRect(20, 130, 400, 8);

        // Blue Servo Box
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(pivotX - 22, pivotY - 24, 44, 40, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY - 6, 10, 0, Math.PI * 2);
        ctx.fill();

        // Barrier Arm
        ctx.save();
        ctx.translate(pivotX, pivotY - 6);
        ctx.rotate(-rad);

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.roundRect(0, -6, armLen, 12, 4);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        for (let s = 15; s < armLen - 10; s += 24) {
          ctx.beginPath();
          ctx.moveTo(s, -6);
          ctx.lineTo(s + 10, -6);
          ctx.lineTo(s + 4, 6);
          ctx.lineTo(s - 6, 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Readout card
        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = servoAngle > 45 ? '#10b981' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(260, 20, 160, 100, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = servoAngle > 45 ? '#10b981' : '#ef4444';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(servoAngle > 45 ? 'GATE OPEN 🟢' : 'GATE CLOSED 🔴', 275, 44);

        ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#334155';
        ctx.font = '11px monospace';
        ctx.fillText(`Arm Angle: ${servoAngle}°`, 275, 68);
        ctx.fillText(`PWM: ${1000 + Math.round((servoAngle / 90) * 1000)} µs`, 275, 88);
        ctx.fillText(`Frequency: 50 Hz`, 275, 106);
      }

      // 3. ULTRASONIC SENSOR SIMULATOR
      else if (selectedPartId === 'ultrasonic') {
        const carX = 130 + sonarDistCm * 6.0;
        const sensorX = 55;
        const sensorY = 85;

        // Clean Blue PCB
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(sensorX - 22, sensorY - 32, 28, 64, 6);
        ctx.fill();
        ctx.stroke();

        for (const yOff of [-16, 16]) {
          ctx.fillStyle = '#94a3b8';
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sensorX, sensorY + yOff, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(sensorX, sensorY + yOff, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(yOff < 0 ? 'T' : 'R', sensorX - 3, sensorY + yOff + 3);
        }

        // Sound waves
        const tWave = (now % 1000) / 1000;
        const waveDist = tWave * (carX - sensorX);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        for (let r = 1; r <= 3; r++) {
          const w = (waveDist + r * 20) % (carX - sensorX);
          ctx.beginPath();
          ctx.arc(sensorX + 10, sensorY - 16, Math.max(2, w), -0.5, 0.5);
          ctx.stroke();
        }

        // Returning echo
        ctx.strokeStyle = '#fbbf24';
        for (let r = 1; r <= 2; r++) {
          const ew = carX - sensorX - ((waveDist + r * 20) % (carX - sensorX));
          if (ew > 0 && ew < carX - sensorX) {
            ctx.beginPath();
            ctx.arc(carX, sensorY + 16, ew, Math.PI - 0.5, Math.PI + 0.5);
            ctx.stroke();
          }
        }

        // Car
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.roundRect(carX, sensorY - 24, 56, 48, 8);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(carX + 6, sensorY + 24, 14, 6);
        ctx.fillRect(carX + 34, sensorY + 24, 14, 6);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('mBot', carX + 12, sensorY + 4);

        const echoTimeUs = Math.round((sonarDistCm * 2) / 0.0343);
        const isTriggered = sonarDistCm <= 15;

        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = isTriggered ? '#10b981' : '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(260, 16, 165, 138, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isTriggered ? '#10b981' : '#38bdf8';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(isTriggered ? 'CAR DETECTED! ⚡' : 'ECHO RADAR ACTIVE', 272, 38);

        ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#334155';
        ctx.font = '11px monospace';
        ctx.fillText(`Distance: ${sonarDistCm} cm`, 272, 60);
        ctx.fillText(`Echo Time: ${echoTimeUs} µs`, 272, 80);
        ctx.fillText(`Speed: 343 m/s`, 272, 100);
        ctx.fillText(isTriggered ? `Signal: LIFT GATE 1` : `Signal: Path Clear`, 272, 120);
      }

      // 4. SIGNAL LEDS SIMULATOR
      else if (selectedPartId === 'rgbleds') {
        const poleX = 120;
        ctx.fillStyle = '#475569';
        ctx.fillRect(poleX - 5, 20, 10, 130);

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(poleX - 24, 15, 48, 110, 10);
        ctx.fill();
        ctx.stroke();

        const redOn = ledMode === 'red';
        const yellowOn = ledMode === 'yellow';
        const greenOn = ledMode === 'green';

        ctx.fillStyle = redOn ? '#ef4444' : '#37181c';
        ctx.beginPath();
        ctx.arc(poleX, 35, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = yellowOn ? '#eab308' : '#372f18';
        ctx.beginPath();
        ctx.arc(poleX, 70, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = greenOn ? '#22c55e' : '#132e1d';
        ctx.beginPath();
        ctx.arc(poleX, 105, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(190, 18, 235, 130, 12);
        ctx.fill();
        ctx.stroke();

        const msgs = {
          red: { title: '🔴 RED SIGNAL', desc: 'Red tells the rover to stay put for charging. Gate is locked.' },
          yellow: { title: '🟡 YELLOW SIGNAL', desc: 'Yellow warns that gates are moving! Servo motors swinging.' },
          green: { title: '🟢 GREEN SIGNAL', desc: 'Green means the track is clear to zoom! Gate arm is raised.' },
        };
        const m = msgs[ledMode];

        ctx.fillStyle = '#60a5fa';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(m.title, 205, 42);

        ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#334155';
        ctx.font = '11px sans-serif';
        const words = m.desc.split(' ');
        let line = '';
        let ly = 66;
        for (const w of words) {
          if ((line + w).length > 28) {
            ctx.fillText(line, 205, ly);
            line = w + ' ';
            ly += 18;
          } else {
            line += w + ' ';
          }
        }
        ctx.fillText(line, 205, ly);
      }

      // 5. BUZZER SIMULATOR
      else if (selectedPartId === 'buzzer') {
        const cx = 95;
        const cy = 85;

        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = buzzerActive ? '#38bdf8' : '#475569';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();

        if (buzzerActive) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          for (let r = 1; r <= 3; r++) {
            ctx.beginPath();
            ctx.arc(cx, cy, 38 + r * 12, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(170, 16, 255, 138, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('PIEZO SOUND OSCILLOSCOPE', 185, 38);

        ctx.strokeStyle = buzzerActive ? '#22c55e' : '#64748b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const waveY = 78;
        const waveW = 220;
        for (let x = 0; x < waveW; x++) {
          const cycles = buzzerFreq / 400;
          const y = waveY + Math.sin((x / waveW) * cycles * Math.PI * 2 + (buzzerActive ? now / 50 : 0)) * 18;
          if (x === 0) ctx.moveTo(185 + x, y);
          else ctx.lineTo(185 + x, y);
        }
        ctx.stroke();

        ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
        ctx.font = '10px monospace';
        ctx.fillText(`Frequency: ${buzzerFreq} Hz`, 185, 118);
        ctx.fillText(buzzerActive ? `Status: PLAYING TONE!` : `Status: Ready for Beep`, 185, 134);
      }

      // 6. WIFI SIMULATOR
      else if (selectedPartId === 'wifi') {
        const antX = 70;
        const antY = 85;

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(antX - 25, antY);
        ctx.lineTo(antX - 12, antY);
        ctx.lineTo(antX - 12, antY - 20);
        ctx.lineTo(antX, antY - 20);
        ctx.lineTo(antX, antY + 20);
        ctx.lineTo(antX + 12, antY + 20);
        ctx.lineTo(antX + 12, antY);
        ctx.lineTo(antX + 25, antY);
        ctx.stroke();

        const pingT = (now / 400) % 3;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        for (let r = 1; r <= 3; r++) {
          const waveRad = 30 + ((pingT + r) % 3) * 22;
          ctx.beginPath();
          ctx.arc(antX + 25, antY, waveRad, -0.6, 0.6);
          ctx.stroke();
        }

        ctx.fillStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(190, 16, 235, 138, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('WIRELESS TELEMETRY STREAM', 205, 38);

        ctx.fillStyle = theme === 'dark' ? '#cbd5e1' : '#334155';
        ctx.font = '10px monospace';
        ctx.fillText(`Protocol: WebSockets + HTTP`, 205, 62);
        ctx.fillText(`Band: 2.4 GHz (Channel 6)`, 205, 80);
        ctx.fillText(`Latency: 3.8 ms`, 205, 98);
        ctx.fillText(`Packets: ${wifiPingCount}`, 205, 116);
        ctx.fillText(`Status: Low Latency Link`, 205, 134);
      }

      ctx.restore();
      animId = requestAnimationFrame(drawSim);
    };

    animId = requestAnimationFrame(drawSim);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, selectedPartId, servoAngle, sonarDistCm, ledMode, buzzerFreq, buzzerActive, wifiPingCount, theme]);

  if (!isOpen) return null;

  const currentPartIndex = selectedPartId
    ? GATE_PART_LIST.findIndex((p) => p.id === selectedPartId)
    : -1;
  const currentPart = selectedPartId ? GATE_PARTS[selectedPartId] : null;

  const handlePrevPart = () => {
    if (currentPartIndex > 0) {
      setSelectedPartId(GATE_PART_LIST[currentPartIndex - 1].id);
    } else {
      setSelectedPartId(GATE_PART_LIST[GATE_PART_LIST.length - 1].id);
    }
  };

  const handleNextPart = () => {
    if (currentPartIndex < GATE_PART_LIST.length - 1) {
      setSelectedPartId(GATE_PART_LIST[currentPartIndex + 1].id);
    } else {
      setSelectedPartId(GATE_PART_LIST[0].id);
    }
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
        {/* Close Button on Top Right (Matching mBot!) */}
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
            LEFT COLUMN (7 cols): CLEAN SCHEMATIC SUPERCHARGER GATE + 6 PARTS
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
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Interactive Gate Explorer · Tap Any Number!
              </div>
              <h2
                className={`text-xl sm:text-2xl font-black tracking-tight ${
                  theme === 'dark' ? 'text-white' : 'text-slate-900'
                }`}
              >
                Inside the Supercharger Gate
              </h2>
            </div>
          </div>

          {/* Interactive SVG Schematic Diagram (Matching mBot's Clean Aesthetic!) */}
          <div className="relative flex-1 flex items-center justify-center min-h-[370px] my-2">
            <div className="relative w-full max-w-[600px] aspect-[640/480]">
              <svg
                viewBox="0 0 640 480"
                className="w-full h-full overflow-visible select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <radialGradient id="gateFloorGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={theme === 'dark' ? 0.22 : 0.12} />
                    <stop offset="100%" stopColor={theme === 'dark' ? '#090E1C' : '#f8fafc'} stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="gateFramePlate" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#263354" />
                    <stop offset="100%" stopColor="#131B31" />
                  </linearGradient>
                  <linearGradient id="esp32BoardPlate" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#991b1b" />
                  </linearGradient>
                </defs>

                <ellipse cx="320" cy="245" rx="235" ry="195" fill="url(#gateFloorGlow)" />

                {/* Roadway Surface at Bottom */}
                <rect x="50" y="360" width="540" height="85" rx="14" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <line x1="60" y1="402" x2="580" y2="402" stroke="#facc15" strokeWidth="4" strokeDasharray="18 12" />

                {/* Main Clean Gantry Frame (Matching mBot Chassis Style) */}
                <rect
                  x="100"
                  y="70"
                  width="440"
                  height="300"
                  rx="24"
                  fill="url(#gateFramePlate)"
                  stroke="#64748b"
                  strokeWidth="2.2"
                />

                {/* Overhead Station Roof Crossbar */}
                <rect x="120" y="85" width="400" height="26" rx="6" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
                <text x="320" y="102" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900" letterSpacing="1.5">
                  AUTOMATED SUPERCHARGER STATION
                </text>

                {/* ==========================================================
                    1. ESP32 CPU BRAIN (Center Board - Matching MegaPi Brain!)
                    ========================================================== */}
                <g
                  onClick={() => setSelectedPartId('esp32')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'esp32' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect
                    x="250"
                    y="150"
                    width="140"
                    height="150"
                    rx="16"
                    fill="url(#esp32BoardPlate)"
                    stroke="#fca5a5"
                    strokeWidth="2.2"
                  />
                  <rect x="290" y="195" width="60" height="60" rx="8" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="320" y="230" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="900">
                    ESP32 CPU
                  </text>
                  <text x="320" y="176" textAnchor="middle" fill="#fee2e2" fontSize="11" fontWeight="900">
                    ESP32 Brain
                  </text>
                </g>

                {/* ==========================================================
                    6. WiFi Radio (Attached directly to ESP32 like BLE on mBot!)
                    ========================================================== */}
                <g
                  onClick={() => setSelectedPartId('wifi')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'wifi' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="335" y="270" width="48" height="58" rx="8" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2.2" />
                  <text x="359" y="304" textAnchor="middle" fill="#dbeafe" fontSize="10" fontWeight="900">
                    WiFi
                  </text>
                </g>

                {/* ==========================================================
                    3. Ultrasonic Sensor (HC-SR04) (Top Left Eyes)
                    ========================================================== */}
                <g
                  onClick={() => setSelectedPartId('ultrasonic')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'ultrasonic' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="135" y="145" width="95" height="74" rx="14" fill="#0284c7" stroke="#38bdf8" strokeWidth="2.2" />
                  <text x="182" y="165" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="900">
                    Ultrasonic Sensor
                  </text>

                  {/* Dual Clean Sensor Eyes (Trig & Echo) */}
                  <circle cx="160" cy="188" r="14" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
                  <circle cx="160" cy="188" r="6" fill="#38bdf8" />
                  <text x="160" y="212" textAnchor="middle" fill="#93c5fd" fontSize="7.5" fontWeight="bold">
                    Trig
                  </text>

                  <circle cx="204" cy="188" r="14" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
                  <circle cx="204" cy="188" r="6" fill="#38bdf8" />
                  <text x="204" y="212" textAnchor="middle" fill="#93c5fd" fontSize="7.5" fontWeight="bold">
                    Echo
                  </text>

                  {/* Sound Wave Beams */}
                  <path d="M 125 174 A 18 18 0 0 0 125 202" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 115 166 A 28 28 0 0 0 115 210" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="4 4" strokeLinecap="round" />
                </g>

                {/* ==========================================================
                    4. Status Signal LEDs (3-Color Traffic Light Tower: Red, Yellow, Green)
                    ========================================================== */}
                <g
                  onClick={() => setSelectedPartId('rgbleds')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'rgbleds' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="445" y="145" width="28" height="92" rx="10" fill="#090d1a" stroke="#a855f7" strokeWidth="2.2" />
                  <circle cx="459" cy="164" r="7" fill="#ef4444" />
                  <circle cx="459" cy="191" r="7" fill="#eab308" />
                  <circle cx="459" cy="218" r="7" fill="#10b981" />
                </g>

                {/* ==========================================================
                    5. Piezo Alert Buzzer (Center Right)
                    ========================================================== */}
                <g
                  onClick={() => setSelectedPartId('buzzer')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'buzzer' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <circle cx="459" cy="285" r="20" fill="#1e293b" stroke="#38bdf8" strokeWidth="2.2" />
                  <circle cx="459" cy="285" r="7" fill="#0f172a" />
                  <text x="459" y="274" textAnchor="middle" fill="#38bdf8" fontSize="8" fontWeight="bold">
                    Buzzer
                  </text>
                </g>

                {/* ==========================================================
                    2. Dual Gate Servos & Striped Barrier Arms
                    ========================================================== */}
                {/* Gate 1 Servo (Left) */}
                <g
                  onClick={() => setSelectedPartId('servos')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'servos' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="135" y="318" width="48" height="48" rx="8" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2.2" />
                  <circle cx="159" cy="342" r="9" fill="#ffffff" stroke="#94a3b8" />
                  <circle cx="159" cy="342" r="3.5" fill="#f59e0b" />

                  {/* Raised Gate 1 Barrier Arm */}
                  <g transform="rotate(-48 159 342)">
                    <rect x="159" y="336" width="160" height="12" rx="3" fill="#facc15" stroke="#000" strokeWidth="1" />
                    {[30, 60, 90, 120, 150].map((s) => (
                      <line key={s} x1={159 + s} y1="336" x2={169 + s} y2="348" stroke="#000" strokeWidth="4" />
                    ))}
                  </g>
                </g>

                {/* Gate 2 Servo (Right) */}
                <g
                  onClick={() => setSelectedPartId('servos')}
                  className={`cursor-pointer transition-opacity ${
                    selectedPartId && selectedPartId !== 'servos' ? 'opacity-45 hover:opacity-90' : 'opacity-100'
                  }`}
                >
                  <rect x="465" y="318" width="48" height="48" rx="8" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2.2" />
                  <circle cx="489" cy="342" r="9" fill="#ffffff" stroke="#94a3b8" />
                  <circle cx="489" cy="342" r="3.5" fill="#f59e0b" />

                  {/* Lowered Gate 2 Barrier Arm */}
                  <rect x="325" y="336" width="164" height="12" rx="3" fill="#facc15" stroke="#000" strokeWidth="1" />
                  {[25, 55, 85, 115, 145].map((s) => (
                    <line key={s} x1={325 + s} y1="336" x2={335 + s} y2="348" stroke="#000" strokeWidth="4" />
                  ))}
                </g>

                {/* ==========================================================
                    FLOATING CALLOUT PILL BADGES (Matching mBot Exactly!)
                    ========================================================== */}
                {[
                  { id: 'esp32' as GatePartId, num: 1, title: 'ESP32 Brain', x: 265, y: 122, anchor: 'middle' },
                  { id: 'servos' as GatePartId, num: 2, title: 'Gate Servos', x: 70, y: 335, anchor: 'start' },
                  { id: 'ultrasonic' as GatePartId, num: 3, title: 'Ultrasonic Sensor', x: 55, y: 130, anchor: 'start' },
                  { id: 'rgbleds' as GatePartId, num: 4, title: 'Status LEDs', x: 495, y: 130, anchor: 'start' },
                  { id: 'buzzer' as GatePartId, num: 5, title: 'Alert Buzzer', x: 495, y: 275, anchor: 'start' },
                  { id: 'wifi' as GatePartId, num: 6, title: 'WiFi Radio', x: 400, y: 275, anchor: 'start' },
                ].map((item) => {
                  const isSel = selectedPartId === item.id;
                  return (
                    <g
                      key={item.id}
                      onClick={() => setSelectedPartId(item.id)}
                      className="cursor-pointer group"
                    >
                      <rect
                        x={item.x}
                        y={item.y}
                        width={item.title.length * 7.5 + 32}
                        height="26"
                        rx="13"
                        fill={isSel ? '#1d4ed8' : theme === 'dark' ? '#0f172a' : '#ffffff'}
                        stroke={isSel ? '#60a5fa' : theme === 'dark' ? '#334155' : '#cbd5e1'}
                        strokeWidth="1.5"
                      />
                      <circle cx={item.x + 13} cy={item.y + 13} r="8" fill={isSel ? '#60a5fa' : theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                      <text
                        x={item.x + 13}
                        y={item.y + 16.5}
                        textAnchor="middle"
                        fill={isSel ? '#0f172a' : theme === 'dark' ? '#94a3b8' : '#475569'}
                        fontSize="9"
                        fontWeight="900"
                      >
                        {item.num}
                      </text>
                      <text
                        x={item.x + 26}
                        y={item.y + 16.5}
                        fill={isSel ? '#ffffff' : theme === 'dark' ? '#e2e8f0' : '#0f172a'}
                        fontSize="10"
                        fontWeight="800"
                      >
                        {item.title}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Bottom Hint */}
          <div className={`text-center text-xs mt-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            💡 Tap any numbered part on the gate to play with its interactive simulator!
          </div>
        </div>

        {/* ==================================================================
            RIGHT COLUMN (5 cols): MATCHING mBot LEVEL-1 LIST & LEVEL-2 DETAIL
            ================================================================== */}
        <div
          className={`lg:col-span-5 p-6 sm:p-7 flex flex-col justify-between ${
            theme === 'dark' ? 'bg-[#0D1326]' : 'bg-white'
          }`}
        >
          {/* LEVEL 1: LIST VIEW OF ALL 6 PARTS WHEN NONE IS SELECTED */}
          {selectedPartId === null ? (
            <div className="space-y-4">
              <div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-400/25">
                  Tap a Part to Try It!
                </span>
                <h3
                  className={`text-xl font-black mt-2 ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  6 Cool Parts Inside the Gate
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Pick any part below (or click right on the gate picture) to test how it works!
                </p>
              </div>

              <div className="space-y-2">
                {GATE_PART_LIST.map((p) => (
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
                      <span className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-400/30 text-blue-400 font-black text-sm flex items-center justify-center shrink-0">
                        {p.number}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-extrabold group-hover:text-blue-400 transition truncate ${
                            theme === 'dark' ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {p.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{p.summary}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* LEVEL 2: INDIVIDUAL PART DEEP-DIVE + LIVE MINI SIMULATOR */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pr-10">
                <button
                  type="button"
                  onClick={() => setSelectedPartId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> All 6 Parts
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePrevPart}
                    title="Previous Part"
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-400/30">
                    Part #{currentPartIndex + 1} of 6
                  </span>
                  <button
                    type="button"
                    onClick={handleNextPart}
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
                  className={`text-xl font-black leading-snug ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {currentPart?.name}
                </h3>
                <p
                  className={`text-xs mt-1 leading-relaxed ${
                    theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {currentPart?.kidExplanation}
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
                <canvas ref={simCanvasRef} className="w-full h-[165px] block" />

                <div
                  className={`p-2.5 border-t flex flex-wrap items-center gap-1.5 ${
                    theme === 'dark'
                      ? 'bg-slate-900/90 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {selectedPartId === 'servos' && (
                    <div className="w-full flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setServoAngle((a) => (a >= 45 ? 0 : 90))}
                        className={`px-3.5 py-1.5 rounded-xl font-extrabold text-xs transition cursor-pointer ${
                          servoAngle >= 45
                            ? 'bg-amber-500 text-black hover:bg-amber-400'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500'
                        }`}
                      >
                        {servoAngle >= 45 ? '🔒 Close Barrier (0°)' : '🔓 Open Barrier (90°)'}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="90"
                        value={servoAngle}
                        onChange={(e) => setServoAngle(Number(e.target.value))}
                        className="w-32 accent-blue-500 cursor-pointer"
                      />
                      <span
                        className={`text-xs font-mono font-bold ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        {servoAngle}°
                      </span>
                    </div>
                  )}

                  {selectedPartId === 'ultrasonic' && (
                    <div className="w-full flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-bold ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        Distance:
                      </span>
                      <input
                        type="range"
                        min="4"
                        max="40"
                        value={sonarDistCm}
                        onChange={(e) => setSonarDistCm(Number(e.target.value))}
                        className="w-40 accent-sky-500 cursor-pointer"
                      />
                      <span className="text-xs font-mono font-bold text-sky-400">
                        {sonarDistCm} cm
                      </span>
                    </div>
                  )}

                  {selectedPartId === 'rgbleds' && (
                    <div className="w-full flex items-center gap-1.5">
                      {(['red', 'yellow', 'green'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setLedMode(mode)}
                          className={`px-3 py-1 rounded-lg text-xs font-black capitalize transition cursor-pointer ${
                            ledMode === mode
                              ? 'bg-blue-600 text-white shadow-sm'
                              : theme === 'dark'
                              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300 shadow-sm'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedPartId === 'buzzer' && (
                    <div className="w-full flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleBuzzerBeep}
                        className="px-3 py-1 rounded-lg bg-sky-500 text-black font-extrabold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" /> Test Tone
                      </button>
                      <input
                        type="range"
                        min="800"
                        max="3200"
                        step="100"
                        value={buzzerFreq}
                        onChange={(e) => setBuzzerFreq(Number(e.target.value))}
                        className="w-28 accent-sky-500 cursor-pointer"
                      />
                      <span
                        className={`text-xs font-mono font-bold ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        {buzzerFreq} Hz
                      </span>
                    </div>
                  )}

                  {selectedPartId === 'wifi' && (
                    <div className="w-full flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleSendWifiPing}
                        className="px-3 py-1 rounded-lg bg-amber-500 text-black font-extrabold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Wifi className="w-3.5 h-3.5" /> Ping Packet
                      </button>
                      <span
                        className={`text-xs font-mono ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        Packets Broadcast: <b className="text-amber-400">{wifiPingCount}</b>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Formula Box */}
              <div
                className={`p-2.5 rounded-xl border font-mono font-bold text-xs text-center ${
                  theme === 'dark'
                    ? 'bg-slate-950 border-slate-800 text-blue-300'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                ⚡ {currentPart?.formula}
              </div>

              {/* STEM Fun Fact Box */}
              <div
                className={`p-3 rounded-2xl border text-xs leading-relaxed ${
                  theme === 'dark'
                    ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                    : 'bg-amber-100/70 border-amber-300 text-amber-950'
                }`}
              >
                <b className="font-black text-amber-400">💡 STEM Fun Fact: </b>
                {currentPart?.funFact}
              </div>

              {/* Bottom Nav */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handlePrevPart}
                  className={`px-3.5 py-1.5 rounded-xl border text-xs font-extrabold transition flex items-center gap-1 cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous Part
                </button>

                <button
                  type="button"
                  onClick={handleNextPart}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs transition flex items-center gap-1 cursor-pointer shadow-md shadow-blue-600/30"
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
