import React, { useEffect, useRef, useState } from 'react';
import { GatePartId, RoverPhase } from '../types';
import { Cpu, Sparkles, Timer, User, Zap } from 'lucide-react';

interface CircularTrackCanvasProps {
  phase: RoverPhase;
  driverName: string;
  lapSeconds: number;
  lapRunning?: boolean;
  gate1Open: boolean;
  gate2Open: boolean;
  trafficLight: 'RED' | 'YELLOW' | 'GREEN';
  socPct: number;
  tempC: number;
  statusCaption: string;
  simulationMode?: boolean;
  launchToGate1Sec?: number;
  gate2ToFinishSec?: number;
  theme?: 'dark' | 'light';
  onInspectRover: (partId?: string) => void;
  onInspectGate?: (partId?: GatePartId) => void;
  onOpenScience: (topic: 'ultrasonic' | 'battery' | 'thermal') => void;
}

/**
 * Computes exact (x, y, heading) along a clockwise rounded-rectangle track
 * starting at Bottom-Center (progress = 0.0):
 *  - progress = 0.000 : Bottom-Center (Start / Finish Line)
 *  - progress = 0.425 : Approaching Gate 1 (Entry Gate on Top-Left of Top Straight)
 *  - progress = 0.500 : Parked inside Supercharger Bay (Top-Center, between Gate 1 & Gate 2)
 *  - progress = 1.000 : Back to Bottom-Center (Finish Line)
 */
function getRoundedRectPose(
  rawProgress: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number
): { x: number; y: number; heading: number } {
  const p = ((rawProgress % 1) + 1) % 1;
  const straightW = w - 2 * r;
  const straightH = h - 2 * r;
  const arcLen = (Math.PI / 2) * r;
  const totalLen = 2 * straightW + 2 * straightH + 4 * arcLen;

  let d = p * totalLen;

  const leftX = cx - w / 2;
  const rightX = cx + w / 2;
  const topY = cy - h / 2;
  const botY = cy + h / 2;

  // Segment 1: Bottom-Center to Bottom-Left corner start (going left)
  const seg1 = straightW / 2;
  if (d <= seg1) {
    return { x: cx - d, y: botY, heading: Math.PI };
  }
  d -= seg1;

  // Segment 2: Bottom-Left Corner Arc (PI/2 to PI)
  if (d <= arcLen) {
    const a = Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
    return {
      x: leftX + r + r * Math.cos(a),
      y: botY - r + r * Math.sin(a),
      heading: a + Math.PI / 2,
    };
  }
  d -= arcLen;

  // Segment 3: Left Straight (going up)
  if (d <= straightH) {
    return { x: leftX, y: botY - r - d, heading: -Math.PI / 2 };
  }
  d -= straightH;

  // Segment 4: Top-Left Corner Arc (PI to 3*PI/2)
  if (d <= arcLen) {
    const a = Math.PI + (d / arcLen) * (Math.PI / 2);
    return {
      x: leftX + r + r * Math.cos(a),
      y: topY + r + r * Math.sin(a),
      heading: a + Math.PI / 2,
    };
  }
  d -= arcLen;

  // Segment 5: Top Straight (going right: Gate 1 -> Supercharger Bay -> Gate 2)
  if (d <= straightW) {
    return { x: leftX + r + d, y: topY, heading: 0 };
  }
  d -= straightW;

  // Segment 6: Top-Right Corner Arc (-PI/2 to 0)
  if (d <= arcLen) {
    const a = -Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
    return {
      x: rightX - r + r * Math.cos(a),
      y: topY + r + r * Math.sin(a),
      heading: a + Math.PI / 2,
    };
  }
  d -= arcLen;

  // Segment 7: Right Straight (going down)
  if (d <= straightH) {
    return { x: rightX, y: topY + r + d, heading: Math.PI / 2 };
  }
  d -= straightH;

  // Segment 8: Bottom-Right Corner Arc (0 to PI/2)
  if (d <= arcLen) {
    const a = 0 + (d / arcLen) * (Math.PI / 2);
    return {
      x: rightX - r + r * Math.cos(a),
      y: botY - r + r * Math.sin(a),
      heading: a + Math.PI / 2,
    };
  }
  d -= arcLen;

  // Segment 9: Bottom-Right to Bottom-Center (going left to Finish Line)
  return { x: rightX - r - d, y: botY, heading: Math.PI };
}

export const CircularTrackCanvas: React.FC<CircularTrackCanvasProps> = ({
  phase,
  driverName,
  lapSeconds,
  lapRunning = false,
  gate1Open,
  gate2Open,
  trafficLight,
  socPct,
  statusCaption,
  simulationMode = false,
  launchToGate1Sec = 2.0,
  gate2ToFinishSec = 3.0,
  theme = 'dark',
  onInspectRover,
  onInspectGate,
  onOpenScience,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverTarget, setHoverTarget] = useState<'rover' | 'gate1' | 'charger' | null>(null);

  const phaseRef = useRef(phase);
  const launchSecRef = useRef(launchToGate1Sec);
  const finishSecRef = useRef(gate2ToFinishSec);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    launchSecRef.current = launchToGate1Sec;
  }, [launchToGate1Sec]);

  useEffect(() => {
    finishSecRef.current = gate2ToFinishSec;
  }, [gate2ToFinishSec]);

  const animRef = useRef({
    progress: 0.0, // 0.0 = Bottom Center Start/Finish
    targetProgress: 0.0,
    roverPos: { x: 440, y: 440 },
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    particles: [] as Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      life: number;
      size: number;
    }>,
    lastTime: performance.now(),
  });

  useEffect(() => {
    const st = animRef.current;
    switch (phase) {
      case 'STANDBY':
      case 'COUNTDOWN':
        st.progress = 0.0;
        st.targetProgress = 0.0;
        break;
      case 'DRIVING_TO_GATE1':
      case 'WAITING_GATE1':
        st.targetProgress = 0.44; // Stops cleanly right in front of Gate 1 (Entry Gate)
        break;
      case 'DRIVING_TO_CHARGE':
      case 'READY_TO_CHARGE':
      case 'CHARGING':
      case 'CHARGED':
      case 'CHARGE_FAILED':
        st.targetProgress = 0.50; // Parked inside Supercharger Bay between Gate 1 & Gate 2!
        break;
      case 'DRIVING_TO_FINISH':
        st.targetProgress = 1.0;
        break;
      case 'FINISH_CELEBRATION': {
        // Keep moving smoothly to 1.0 if not already at the finish line (never teleport!)
        st.targetProgress = st.progress > 0.02 ? 1.0 : 0.0;
        const colors = ['#5b8cff', '#34d399', '#ffb547', '#ff6b6b', '#a855f7', '#22d3ee'];
        for (let i = 0; i < 52; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 50 + Math.random() * 150;
          st.particles.push({
            x: 440,
            y: 430,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 45,
            color: colors[i % colors.length],
            life: 1.0,
            size: 3 + Math.random() * 4,
          });
        }
        break;
      }
    }
  }, [phase]);

  useEffect(() => {
    let frameId: number;
    const LOGICAL_W = 880;
    const LOGICAL_H = 520;
    const CX = 440;
    const CY = 268;
    const RECT_W = 590;
    const RECT_H = 310;
    const CORNER_R = 86;
    const TRACK_W = 64;

    const getLedColors = (now: number): string[] => {
      const blink = Math.floor(now / 220) % 2 === 0;
      switch (phase) {
        case 'FINISH_CELEBRATION': {
          const baseHue = Math.floor(now / 2) % 360;
          return [0, 1, 2, 3].map((i) => `hsl(${(baseHue + i * 90) % 360}, 95%, 60%)`);
        }
        case 'STANDBY': {
          const hue = Math.floor(now / 18) % 360;
          const c = `hsl(${hue}, 85%, 58%)`;
          return [c, c, c, c];
        }
        case 'COUNTDOWN': {
          const c = blink ? '#34d399' : '#1e293b';
          return [c, c, c, c];
        }
        case 'READY_TO_CHARGE': {
          const c = blink ? '#22d3ee' : '#0e3a47';
          return [c, c, c, c];
        }
        case 'CHARGING': {
          const c = blink ? '#34d399' : '#0f3d2e';
          return [c, c, c, c];
        }
        case 'CHARGED':
          return ['#34d399', '#34d399', '#34d399', '#34d399'];
        case 'CHARGE_FAILED':
        case 'WAITING_GATE1': {
          const c = blink ? '#ff6b6b' : '#451a1a';
          return [c, c, c, c];
        }
        default:
          return ['#38bdf8', '#38bdf8', '#38bdf8', '#38bdf8'];
      }
    };

    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const st = animRef.current;
      const dt = Math.min(0.05, (now - st.lastTime) / 1000);
      st.lastTime = now;

      // Calculate dynamic speed matching the configured segment durations:
      // Segment 1 (0.00 -> 0.44 Gate 1): distance = 0.44, duration = launchToGate1Sec
      // Segment 2 (0.44 -> 0.50 Charger Bay): distance = 0.06, duration = 1.0s
      // Segment 3 (0.50 -> 1.00 Finish Line): distance = 0.50, duration = gate2ToFinishSec
      let roverSpeed = 0.22;
      const curPhase = phaseRef.current;
      if (curPhase === 'DRIVING_TO_GATE1') {
        roverSpeed = 0.44 / Math.max(0.2, launchSecRef.current);
      } else if (curPhase === 'DRIVING_TO_CHARGE') {
        roverSpeed = 0.06;
      } else if (curPhase === 'DRIVING_TO_FINISH' || curPhase === 'FINISH_CELEBRATION') {
        roverSpeed = 0.50 / Math.max(0.2, finishSecRef.current);
      }

      const diff = st.targetProgress - st.progress;
      if (Math.abs(diff) > 0.0005) {
        st.progress += Math.sign(diff) * Math.min(Math.abs(diff), roverSpeed * dt);
      }
      if (st.targetProgress === 1.0 && Math.abs(st.progress - 1.0) < 0.002) {
        st.progress = 0.0;
        st.targetProgress = 0.0;
      }

      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 120 * dt;
        p.life -= dt * 0.55;
        if (p.life <= 0) st.particles.splice(i, 1);
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(rect.width * dpr);
        const h = Math.round(rect.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        // UNIFORM SCALING: prevents any vertical/horizontal stretching when right column changes height!
        const scale = Math.min(w / LOGICAL_W, h / LOGICAL_H);
        const offsetX = (w - LOGICAL_W * scale) / 2;
        const offsetY = (h - LOGICAL_H * scale) / 2;
        st.transform = { scale: scale / dpr, offsetX: offsetX / dpr, offsetY: offsetY / dpr };

        ctx.save();
        ctx.fillStyle = theme === 'dark' ? '#090E1C' : '#F8FAFC';
        ctx.fillRect(0, 0, w, h);

        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Subtle technical grid
        ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.04)' : 'rgba(100, 116, 139, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 40; x < LOGICAL_W; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, LOGICAL_H);
          ctx.stroke();
        }
        for (let y = 40; y < LOGICAL_H; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(LOGICAL_W, y);
          ctx.stroke();
        }

        // 2. Rounded-Rectangle Track (Black Outer & Inner Boundaries + White Roadway)
        const trackX = CX - RECT_W / 2;
        const trackY = CY - RECT_H / 2;

        ctx.beginPath();
        ctx.roundRect(trackX, trackY, RECT_W, RECT_H, CORNER_R);
        ctx.strokeStyle = theme === 'dark' ? '#050811' : '#1e293b';
        ctx.lineWidth = TRACK_W + 18;
        ctx.stroke();

        const outOff = TRACK_W / 2 + 9;
        ctx.beginPath();
        ctx.roundRect(
          trackX - outOff,
          trackY - outOff,
          RECT_W + outOff * 2,
          RECT_H + outOff * 2,
          CORNER_R + outOff
        );
        ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.22)' : 'rgba(100, 116, 139, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const inOff = TRACK_W / 2 + 9;
        ctx.beginPath();
        ctx.roundRect(
          trackX + inOff,
          trackY + inOff,
          RECT_W - inOff * 2,
          RECT_H - inOff * 2,
          Math.max(12, CORNER_R - inOff)
        );
        ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.22)' : 'rgba(100, 116, 139, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Pearl White Roadway Surface
        ctx.beginPath();
        ctx.roundRect(trackX, trackY, RECT_W, RECT_H, CORNER_R);
        ctx.strokeStyle = theme === 'dark' ? '#EDF2FF' : '#ffffff';
        ctx.lineWidth = TRACK_W - 4;
        ctx.stroke();

        // Animated centerline dashes
        ctx.save();
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -(now * 0.028) % 24;
        ctx.beginPath();
        ctx.roundRect(trackX, trackY, RECT_W, RECT_H, CORNER_R);
        ctx.strokeStyle = theme === 'dark' ? 'rgba(91, 140, 255, 0.35)' : 'rgba(37, 99, 235, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 3. Center Infield Interactive Callout (Well-padded box)
        ctx.fillStyle = theme === 'dark' ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.18)' : 'rgba(203, 213, 225, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(CX - 165, CY - 34, 330, 68, 18);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.font = '800 14px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.fillText('🤖 Click the Car to See Inside!', CX, CY - 5);

        ctx.fillStyle = theme === 'dark' ? '#60a5fa' : '#2563eb';
        ctx.font = '700 11.5px Inter, sans-serif';
        ctx.fillText('Tap the car or station to explore how they work', CX, CY + 16);

        // 4. Start / Finish Line at Bottom-Center (CX, CY + RECT_H/2)
        const halfW = TRACK_W / 2 - 2;
        const botY = CY + RECT_H / 2;
        ctx.save();
        ctx.translate(CX, botY);
        ctx.fillStyle = '#090D16';
        ctx.fillRect(-10, -halfW, 20, halfW * 2);
        const sq = 6;
        for (let y = -halfW; y < halfW; y += sq) {
          ctx.fillStyle = Math.floor((y + halfW) / sq) % 2 === 0 ? '#ffffff' : '#090D16';
          ctx.fillRect(-10, y, 5, sq);
          ctx.fillStyle = Math.floor((y + halfW) / sq) % 2 === 1 ? '#ffffff' : '#090D16';
          ctx.fillRect(5, y, 5, sq);
        }

        // Start / Finish pill below track with generous padding
        ctx.fillStyle = theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 209, 0.28)' : 'rgba(203, 213, 225, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-92, halfW + 14, 184, 26, 13);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = theme === 'dark' ? '#f1f5f9' : '#0f172a';
        ctx.font = '800 11px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏁 START / FINISH LINE', 0, halfW + 31);
        ctx.restore();

        // ====================================================================
        // 5. UNIFIED TOP STATION: GATE 1 (ENTRY) + SUPERCHARGER BAY + GATE 2 (EXIT)
        //    All positioned along the Top Straight (y = topY = CY - RECT_H/2)!
        // ====================================================================
        const topY = CY - RECT_H / 2;
        const gate1X = -74; // Entry gate on left of bay
        const gate2X = 74;  // Exit gate on right of bay
        const isStationHover = hoverTarget === 'gate1' || hoverTarget === 'charger';

        ctx.save();
        ctx.translate(CX, topY);

        // 5a. Glowing Supercharger Pad on the Road between Gate 1 (-74) and Gate 2 (+74)
        const isCharging = phase === 'CHARGING';
        const isReady = phase === 'READY_TO_CHARGE';
        const isCharged = phase === 'CHARGED';
        ctx.fillStyle = isCharged
          ? 'rgba(52, 211, 153, 0.28)'
          : isCharging
          ? 'rgba(255, 181, 71, 0.30)'
          : isReady
          ? 'rgba(34, 211, 238, 0.25)'
          : 'rgba(91, 140, 255, 0.15)';
        ctx.strokeStyle = isCharging
          ? '#ffb547'
          : isCharged
          ? '#34d399'
          : 'rgba(91, 140, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(gate1X + 6, -halfW + 4, gate2X - gate1X - 12, TRACK_W - 8, 12);
        ctx.fill();
        ctx.stroke();

        // 5b. Ultrasonic Sonar Cones radiating left from Gate 1 toward approaching car
        const pulse = (now % 1400) / 1400;
        for (let i = 0; i < 3; i++) {
          const p = (pulse + i / 3) % 1;
          const r = 14 + p * 46;
          ctx.strokeStyle = `rgba(91, 140, 255, ${(1 - p) * 0.48})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(gate1X - 10, 0, r, Math.PI * 0.74, Math.PI * 1.26);
          ctx.stroke();
        }

        // 5c. Gate 1 Entry Barrier Arm (x = gate1X = -74)
        ctx.save();
        ctx.translate(gate1X, -halfW - 6);
        ctx.rotate(gate1Open ? -Math.PI * 0.42 : 0);
        ctx.fillStyle = gate1Open ? '#34d399' : '#ff6b6b';
        ctx.beginPath();
        ctx.roundRect(-4, 0, 8, halfW * 2 + 12, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let y = 8; y < halfW * 2; y += 16) {
          ctx.fillRect(-4, y, 8, 7);
        }
        ctx.restore();

        // 5d. Gate 2 Exit Barrier Arm (x = gate2X = +74)
        ctx.save();
        ctx.translate(gate2X, -halfW - 6);
        ctx.rotate(gate2Open ? -Math.PI * 0.42 : 0);
        ctx.fillStyle = gate2Open ? '#34d399' : '#ff6b6b';
        ctx.beginPath();
        ctx.roundRect(-4, 0, 8, halfW * 2 + 12, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let y = 8; y < halfW * 2; y += 16) {
          ctx.fillRect(-4, y, 8, 7);
        }
        ctx.restore();

        // 5e. Unified Top Station Header Pill above the track (x: -190..+190, y: -halfW - 50)
        const boxW = 380;
        const boxH = 36;
        const boxX = -boxW / 2;
        const boxY = -halfW - 50;

        ctx.fillStyle = isStationHover
          ? (theme === 'dark' ? '#1e293b' : '#f1f5f9')
          : (theme === 'dark' ? '#0f172a' : '#ffffff');
        ctx.strokeStyle = isStationHover
          ? '#60a5fa'
          : (theme === 'dark' ? 'rgba(148, 163, 209, 0.3)' : 'rgba(203, 213, 225, 0.9)');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 12);
        ctx.fill();
        ctx.stroke();

        // Traffic Light Dots on Left (Gate 1)
        const tlColors = [
          { key: 'RED', c: '#ff5b5b', x: boxX + 20 },
          { key: 'YELLOW', c: '#ffc94a', x: boxX + 35 },
          { key: 'GREEN', c: '#34d399', x: boxX + 50 },
        ];
        for (const l of tlColors) {
          const active = trafficLight === l.key || (gate1Open && l.key === 'GREEN');
          ctx.fillStyle = active ? l.c : (theme === 'dark' ? '#1e293b' : '#cbd5e1');
          if (active) {
            ctx.shadowColor = l.c;
            ctx.shadowBlur = 8;
          }
          ctx.beginPath();
          ctx.arc(l.x, boxY + boxH / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Gate 1 Label
        ctx.fillStyle = gate1Open
          ? (theme === 'dark' ? '#34d399' : '#059669')
          : (theme === 'dark' ? '#e2e8f0' : '#334155');
        ctx.font = '800 10.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(gate1Open ? 'G1: OPEN' : 'G1: ENTRY', boxX + 64, boxY + 22);

        // Center Supercharger Readout
        ctx.fillStyle = theme === 'dark' ? '#ffb547' : '#b45309';
        ctx.textAlign = 'center';
        ctx.font = '800 11px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.fillText(`⚡ CHARGER · 🔋 ${Math.round(socPct)}% Full`, 12, boxY + 22);

        // Right Gate 2 Label
        ctx.fillStyle = gate2Open
          ? (theme === 'dark' ? '#34d399' : '#059669')
          : (theme === 'dark' ? '#f87171' : '#dc2626');
        ctx.textAlign = 'right';
        ctx.font = '800 10.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.fillText(gate2Open ? 'G2: OPEN' : 'G2: EXIT', boxX + boxW - 16, boxY + 22);

        ctx.restore();

        // 6. Draw mBot Mega Rover on Rounded-Rectangle Track
        const pose = getRoundedRectPose(st.progress, CX, CY, RECT_W, RECT_H, CORNER_R);
        st.roverPos = { x: pose.x, y: pose.y };

        const rHover = hoverTarget === 'rover';
        ctx.save();
        ctx.translate(pose.x, pose.y);

        const halo = 0.5 + 0.5 * Math.sin(now * 0.005);
        ctx.beginPath();
        ctx.arc(0, 0, rHover ? 43 : 36 + halo * 4, 0, Math.PI * 2);
        ctx.fillStyle = rHover ? 'rgba(91, 140, 255, 0.28)' : 'rgba(91, 140, 255, 0.12)';
        ctx.fill();
        ctx.strokeStyle = rHover ? '#60a5fa' : 'rgba(91, 140, 255, 0.42)';
        ctx.lineWidth = rHover ? 2.2 : 1.3;
        ctx.stroke();

        ctx.save();
        ctx.rotate(pose.heading);

        // 4x Mecanum Wheels
        const wheels = [
          { x: 14, y: -19 },
          { x: 14, y: 19 },
          { x: -14, y: -19 },
          { x: -14, y: 19 },
        ];
        for (const w of wheels) {
          ctx.fillStyle = '#171f36';
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(w.x - 8, w.y - 4.5, 16, 9, 2.5);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          for (let r = -5; r <= 5; r += 5) {
            ctx.beginPath();
            ctx.moveTo(w.x + r - 2, w.y - 3.5);
            ctx.lineTo(w.x + r + 2, w.y + 3.5);
            ctx.stroke();
          }
        }

        // Chassis + Red MegaPi Brain
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-22, -15, 44, 30, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(-11, -9, 22, 18, 4);
        ctx.fill();

        // Dual 4-LED WS2812B RGB Bars
        const leds = getLedColors(now);
        for (let i = 0; i < 4; i++) {
          const lx = -12 + i * 8;
          ctx.fillStyle = leds[i];
          ctx.shadowColor = leds[i];
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(lx, -13, 2.6, 0, Math.PI * 2);
          ctx.arc(lx, 13, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Front IR Sensor Beam
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(44, -13);
        ctx.lineTo(44, 13);
        ctx.closePath();
        ctx.fill();

        ctx.restore(); // unrotate

        // Floating pill above rover (Well-padded so text never overflows)
        const pillW = 148;
        ctx.fillStyle = rHover
          ? '#3b82f6'
          : theme === 'dark'
          ? 'rgba(15, 23, 42, 0.94)'
          : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = rHover
          ? '#ffffff'
          : theme === 'dark'
          ? 'rgba(96, 165, 250, 0.6)'
          : 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-pillW / 2, -50, pillW, 22, 11);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = rHover
          ? '#ffffff'
          : theme === 'dark'
          ? '#ffffff'
          : '#0f172a';
        ctx.font = '800 10.5px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rHover ? '🔍 Open Rover Inside!' : '🤖 Tap Car to Explore', 0, -35);
        ctx.restore();

        // 7. Celebration Particles
        for (const p of st.particles) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.restore();
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [phase, gate1Open, gate2Open, trafficLight, socPct, hoverTarget, theme]);

  const handlePointer = (e: React.MouseEvent<HTMLCanvasElement>, isClick: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = animRef.current.transform;
    const x = (e.clientX - rect.left - offsetX) / (scale || 1);
    const y = (e.clientY - rect.top - offsetY) / (scale || 1);

    const rPos = animRef.current.roverPos;
    if (Math.hypot(x - rPos.x, y - rPos.y) <= 48) {
      setHoverTarget('rover');
      if (isClick) onInspectRover();
      return;
    }
    // Left half of Top Station = Gate 1 Sonar & Servos
    if (x >= 440 - 190 && x <= 440 - 30 && Math.abs(y - (268 - 155)) <= 65) {
      setHoverTarget('gate1');
      if (isClick) {
        if (onInspectGate) onInspectGate('ultrasonic');
        else onOpenScience('ultrasonic');
      }
      return;
    }
    // Center/Right of Top Station = Supercharger, ESP32 & Gate 2
    if (x > 440 - 30 && x <= 440 + 190 && Math.abs(y - (268 - 155)) <= 65) {
      setHoverTarget('charger');
      if (isClick) {
        if (onInspectGate) onInspectGate('esp32');
        else onOpenScience('battery');
      }
      return;
    }
    setHoverTarget(null);
  };

  return (
    <div
      className={`w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col justify-between transition-colors ${
        theme === 'dark'
          ? 'bg-[#090E1C] border-slate-800/90'
          : 'bg-white border-slate-200/90 shadow-slate-200/60'
      }`}
    >
      {/* Dedicated Top Header Bar (Never overlaps the track!) */}
      <div
        className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
          theme === 'dark'
            ? 'bg-slate-900/90 border-slate-800/80'
            : 'bg-slate-50 border-slate-200/80'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              Driver
            </div>
            <div
              className={`text-sm font-extrabold ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}
            >
              {driverName || 'Ready for Student'}
            </div>
          </div>
          {simulationMode && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                theme === 'dark'
                  ? 'bg-purple-500/25 text-purple-200 border-purple-400/40'
                  : 'bg-purple-100 text-purple-800 border-purple-300'
              }`}
            >
              🎮 Sim Testing Mode
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onInspectRover()}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              theme === 'dark'
                ? 'bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border-blue-400/40'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 shadow-sm'
            }`}
          >
            <Cpu className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            Inside Car
          </button>

          <button
            type="button"
            onClick={() => onInspectGate?.()}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              theme === 'dark'
                ? 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border-amber-400/40'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
            }`}
          >
            <Zap className={`w-4 h-4 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
            Inside Gate
          </button>

          {/* Real-Time Telemetry Lap Timer Pill - Hidden until the student starts supercharger game in Phase 3 */}
          {(lapRunning || lapSeconds > 0) && (
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 animate-fadeIn ${
                theme === 'dark'
                  ? 'bg-slate-950/90 border-slate-800'
                  : 'bg-white border-slate-300 shadow-sm'
              }`}
            >
              <Timer className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
              <div>
                <div className={`text-[9px] uppercase tracking-wider font-extrabold leading-none ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  Charging Timer
                </div>
                <div
                  className={`text-lg font-black tabular-nums leading-tight ${
                    theme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {lapSeconds.toFixed(1)}
                  <span className={`text-xs font-bold ml-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>s</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Aspect Ratio Track Canvas Area (Never stretches or distorts!) */}
      <div
        className={`relative w-full aspect-[880/520] ${
          theme === 'dark' ? 'bg-[#090E1C]' : 'bg-[#F8FAFC]'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => handlePointer(e, false)}
          onMouseLeave={() => setHoverTarget(null)}
          onClick={(e) => handlePointer(e, true)}
          className={`w-full h-full block ${hoverTarget ? 'cursor-pointer' : 'cursor-default'}`}
        />
      </div>

      {/* Dedicated Bottom Status Footer (Never overlaps the Start / Finish Line!) */}
      {statusCaption && statusCaption.trim().length > 0 ? (
        <div
          className={`px-5 py-3 border-t flex items-center justify-center gap-2.5 ${
            theme === 'dark'
              ? 'bg-slate-900/90 border-slate-800/80 text-slate-100'
              : 'bg-slate-50 border-slate-200/80 text-slate-800'
          }`}
        >
          <Sparkles className={`w-4 h-4 shrink-0 animate-pulse ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
          <span className="text-xs sm:text-sm font-extrabold text-center truncate">
            {statusCaption}
          </span>
        </div>
      ) : null}
    </div>
  );
};
