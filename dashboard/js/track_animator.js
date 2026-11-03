/**
 * ============================================================================
 * Circular Track & mBot Mega Live Canvas Renderer (HiDPI Museum-Grade)
 * File: dashboard/js/track_animator.js
 * ============================================================================
 * Renders:
 *  - High-DPI responsive stadium track with white roadway & black boundaries
 *  - Start / Finish Line at bottom (270 deg / 6 o'clock)
 *  - Gate 1 (ESP32 Ultrasonic HC-SR04 + Traffic Light + Servo Arm) at 90 deg (12 o'clock)
 *  - EV Supercharging Bay + Gate 2 Exit Barrier at 0 deg (3 o'clock)
 *  - Interactive mBot Mega rover with 4 Mecanum wheels, 2× 4-LED RGB bars,
 *    infrared nose cone, and hover/click hit-target that opens the 2-Level
 *    mBot Mega Hardware Explorer!
 */

class TrackAnimator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

    // Logical coordinate space (scaled automatically to HiDPI canvas)
    this.logicalW = 880;
    this.logicalH = 605;
    this.cx = 440;
    this.cy = 308;
    this.rx = 290;
    this.ry = 185;
    this.trackWidth = 68;

    // Rover state:
    // 270 deg (3*PI/2) = Start/Finish (Bottom)
    // Counter-clockwise motion:
    //   270 deg -> 180 deg (Right/90? Wait: in canvas y-down:
    //   0 rad = Right (3 o'clock = Charging Station & Gate 2)
    //   PI/2 rad = Bottom (6 o'clock = Start / Finish Line)
    //   PI rad = Left (9 o'clock = West)
    //   3*PI/2 rad = Top (12 o'clock = Gate 1 Ultrasonic)
    // Let's travel clockwise on screen:
    //   Bottom (PI/2) -> Left (PI) -> Top (3*PI/2, Gate 1) -> Right (2*PI, Charging Bay / Gate 2) -> Bottom (5*PI/2, Finish)
    this.angle = Math.PI / 2;
    this.targetAngle = Math.PI / 2;
    this.roverState = "STANDBY"; // STANDBY, COUNTDOWN, DRIVING_TO_GATE1, WAITING_GATE1, DRIVING_TO_CHARGE, READY_TO_CHARGE, CHARGING, CHARGED, CHARGE_FAILED, DRIVING_TO_FINISH, FINISH_CELEBRATION

    this.gate1Open = false;
    this.gate2Open = false;
    this.trafficLight = "RED"; // RED, YELLOW, GREEN
    this.ultrasonicCm = 42.0;
    this.chargeSoc = 20;
    this.chargeTempC = 26.85;

    this.hoverItem = null; // 'rover', 'gate1', 'charger'
    this.roverScreenPos = { x: 440, y: 493, r: 42 };
    this.particles = [];
    this.lastTime = performance.now();

    if (this.canvas) {
      this._setupEvents();
      this._startLoop();
    }
  }

  _setupEvents() {
    const getLogicalPt = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * this.logicalW,
        y: ((e.clientY - rect.top) / rect.height) * this.logicalH,
      };
    };

    this.canvas.addEventListener("mousemove", (e) => {
      const pt = getLogicalPt(e);
      const hit = this._hitTest(pt.x, pt.y);
      this.hoverItem = hit;
      this.canvas.style.cursor = hit ? "pointer" : "default";
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.hoverItem = null;
      this.canvas.style.cursor = "default";
    });

    this.canvas.addEventListener("click", (e) => {
      const pt = getLogicalPt(e);
      const hit = this._hitTest(pt.x, pt.y);
      if (hit === "rover" && window.openRoverExplorer) {
        window.openRoverExplorer(null);
      } else if (hit === "gate1" && window.openStemPopup) {
        window.openStemPopup("ultrasonic");
      } else if (hit === "charger" && window.openStemPopup) {
        window.openStemPopup("battery");
      }
    });
  }

  _hitTest(x, y) {
    // 1. Check Rover first (highest priority)
    const dxR = x - this.roverScreenPos.x;
    const dyR = y - this.roverScreenPos.y;
    if (Math.hypot(dxR, dyR) <= 46) return "rover";

    // 2. Check Gate 1 (Top: cx, cy - ry)
    const g1x = this.cx;
    const g1y = this.cy - this.ry;
    if (Math.hypot(x - g1x, y - g1y) <= 58) return "gate1";

    // 3. Check Charging Bay / Gate 2 (Right: cx + rx, cy)
    const cbx = this.cx + this.rx;
    const cby = this.cy;
    if (Math.hypot(x - cbx, y - cby) <= 64) return "charger";

    return null;
  }

  setPhase(phase, opts = {}) {
    this.roverState = phase;
    if (opts.gate1Open !== undefined) this.gate1Open = opts.gate1Open;
    if (opts.gate2Open !== undefined) this.gate2Open = opts.gate2Open;
    if (opts.trafficLight !== undefined) this.trafficLight = opts.trafficLight;
    if (opts.soc !== undefined) this.chargeSoc = opts.soc;
    if (opts.tempC !== undefined) this.chargeTempC = opts.tempC;

    switch (phase) {
      case "STANDBY":
      case "COUNTDOWN":
        this.angle = Math.PI / 2;
        this.targetAngle = Math.PI / 2;
        break;
      case "DRIVING_TO_GATE1":
        this.targetAngle = (3 * Math.PI) / 2 - 0.16;
        break;
      case "WAITING_GATE1":
        this.targetAngle = (3 * Math.PI) / 2 - 0.12;
        break;
      case "DRIVING_TO_CHARGE":
      case "READY_TO_CHARGE":
      case "CHARGING":
      case "CHARGED":
      case "CHARGE_FAILED":
        this.targetAngle = 2 * Math.PI;
        break;
      case "DRIVING_TO_FINISH":
        this.targetAngle = (5 * Math.PI) / 2;
        break;
      case "FINISH_CELEBRATION":
        this.angle = Math.PI / 2;
        this.targetAngle = Math.PI / 2;
        this._spawnConfetti();
        break;
    }
  }

  _spawnConfetti() {
    const colors = ["#5b8cff", "#34d399", "#ffb547", "#ff6b6b", "#a855f7", "#22d3ee"];
    const rx = this.cx;
    const ry = this.cy + this.ry;
    for (let i = 0; i < 48; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      this.particles.push({
        x: rx,
        y: ry,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        color: colors[i % colors.length],
        life: 1.0,
        size: 3 + Math.random() * 4,
      });
    }
  }

  _startLoop() {
    const tick = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this._update(dt);
      this._render(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _update(dt) {
    // Smooth angular progression along track
    const diff = this.targetAngle - this.angle;
    if (Math.abs(diff) > 0.002) {
      const speed =
        this.roverState === "DRIVING_TO_GATE1" ||
        this.roverState === "DRIVING_TO_CHARGE" ||
        this.roverState === "DRIVING_TO_FINISH"
          ? 0.95
          : 2.2;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
      this.angle += step;
    }

    // Wrap completed lap
    if (
      this.roverState === "DRIVING_TO_FINISH" &&
      Math.abs(this.angle - (5 * Math.PI) / 2) < 0.04
    ) {
      this.angle = Math.PI / 2;
      this.targetAngle = Math.PI / 2;
    }

    // Update celebration particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      p.life -= dt * 0.55;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _syncCanvasResolution() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { scaleX: w / this.logicalW, scaleY: h / this.logicalH };
  }

  _render(now) {
    if (!this.ctx) return;
    const scale = this._syncCanvasResolution();
    if (!scale) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(scale.scaleX, scale.scaleY);

    // 1. Deep navy lab background with subtle blueprint grid
    ctx.fillStyle = "#0b1123";
    ctx.fillRect(0, 0, this.logicalW, this.logicalH);

    ctx.strokeStyle = "rgba(148, 163, 209, 0.045)";
    ctx.lineWidth = 1;
    for (let x = 40; x < this.logicalW; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.logicalH);
      ctx.stroke();
    }
    for (let y = 40; y < this.logicalH; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.logicalW, y);
      ctx.stroke();
    }

    // 2. Ambient glow behind track
    const bgGlow = ctx.createRadialGradient(
      this.cx,
      this.cy,
      60,
      this.cx,
      this.cy,
      360
    );
    bgGlow.addColorStop(0, "rgba(91, 140, 255, 0.08)");
    bgGlow.addColorStop(1, "rgba(11, 17, 35, 0)");
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, this.logicalW, this.logicalH);

    // 3. Draw Oval Track (Black Outer & Inner Boundaries + White Roadway)
    this._drawTrack(ctx, now);

    // 4. Center Infield Telemetry Emblem
    this._drawInfield(ctx, now);

    // 5. Start / Finish Line at Bottom (PI/2)
    this._drawFinishLine(ctx, now);

    // 6. Gate 1 (Ultrasonic + Traffic Light + Servo Arm) at Top (3*PI/2)
    this._drawGate1(ctx, now);

    // 7. EV Supercharging Bay + Gate 2 at Right (0 / 2*PI)
    this._drawChargingStation(ctx, now);

    // 8. mBot Mega Rover on Track
    this._drawRover(ctx, now);

    // 9. Confetti particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _drawTrack(ctx, now) {
    const { cx, cy, rx, ry, trackWidth } = this;
    const tx = cx - rx;
    const ty = cy - ry;
    const tw = rx * 2;
    const th = ry * 2;
    const cr = 88;

    ctx.save();
    // Black Boundary Tape
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, cr);
    ctx.strokeStyle = "#080b14";
    ctx.lineWidth = trackWidth + 18;
    ctx.stroke();

    // White Track Surface
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, cr);
    ctx.strokeStyle = "#e9eefb";
    ctx.lineWidth = trackWidth - 4;
    ctx.stroke();

    // Animated centerline dashes
    ctx.save();
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -(now * 0.025) % 24;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, cr);
    ctx.strokeStyle = "rgba(91, 140, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Direction arrows along the track (West & South-East quadrants)
    const arrowAngles = [Math.PI * 0.78, Math.PI * 1.22, Math.PI * 1.72, Math.PI * 0.25];
    for (const a of arrowAngles) {
      const ax = cx + rx * Math.cos(a);
      const ay = cy + ry * Math.sin(a);
      const tx = -rx * Math.sin(a);
      const ty = ry * Math.cos(a);
      const rot = Math.atan2(ty, tx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(rot);
      ctx.fillStyle = "rgba(91, 140, 255, 0.42)";
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  _drawInfield(ctx, now) {
    const { cx, cy } = this;
    ctx.save();

    // Subtle center badge
    ctx.fillStyle = "rgba(18, 26, 49, 0.72)";
    ctx.strokeStyle = "rgba(148, 163, 209, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - 145, cy - 42, 290, 84, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#8c95b5";
    ctx.font = "800 10px Nunito, system-ui, sans-serif";
    ctx.fillText("AUTONOMOUS EV CIRCUIT · CLICK ROVER OR GATES", cx, cy - 16);

    ctx.fillStyle = "#eef1f8";
    ctx.font = "900 15px Nunito, system-ui, sans-serif";
    const stateLabels = {
      STANDBY: "Standby · Ready at Start Line",
      COUNTDOWN: "5-Second Alignment Countdown",
      DRIVING_TO_GATE1: "Cruising to Ultrasonic Gate 1",
      WAITING_GATE1: "Gate 1 Traffic Light Sequence",
      DRIVING_TO_CHARGE: "Entering EV Supercharger Bay",
      READY_TO_CHARGE: "Docked · Waiting for Charge Current",
      CHARGING: "Fast-Charging EV Battery (10s Sim)",
      CHARGED: "100% Charged · Gate 2 Opening!",
      CHARGE_FAILED: "Charge Failed · Adjust Current (mA)",
      DRIVING_TO_FINISH: "Final Sprint to Finish Line",
      FINISH_CELEBRATION: "Lap Complete! 7s Rainbow Celebration",
    };
    ctx.fillText(stateLabels[this.roverState] || this.roverState, cx, cy + 8);

    ctx.fillStyle = "#5b8cff";
    ctx.font = "700 12px Nunito, system-ui, sans-serif";
    ctx.fillText("🔍 Click the rover on the track to inspect its 7 parts", cx, cy + 28);

    ctx.restore();
  }

  _drawFinishLine(ctx, now) {
    const fx = this.cx;
    const fy = this.cy + this.ry;
    const halfW = this.trackWidth / 2 - 2;

    ctx.save();
    ctx.translate(fx, fy);

    // Black Finish Tape strip across the white road (triggers A6==0 && A7==0 after charging)
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(-10, -halfW, 20, halfW * 2);

    // Checkered accents on edges
    const sq = 6;
    for (let y = -halfW; y < halfW; y += sq) {
      ctx.fillStyle = Math.floor((y + halfW) / sq) % 2 === 0 ? "#ffffff" : "#0a0e1a";
      ctx.fillRect(-10, y, 5, sq);
      ctx.fillStyle = Math.floor((y + halfW) / sq) % 2 === 1 ? "#ffffff" : "#0a0e1a";
      ctx.fillRect(5, y, 5, sq);
    }

    // Label pill below finish line
    ctx.fillStyle = "rgba(18, 26, 49, 0.92)";
    ctx.strokeStyle = "rgba(148, 163, 209, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-78, halfW + 14, 156, 26, 13);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eef1f8";
    ctx.font = "800 11px Nunito, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🏁 START / FINISH LINE", 0, halfW + 31);

    ctx.restore();
  }

  _drawGate1(ctx, now) {
    const gx = this.cx;
    const gy = this.cy - this.ry;
    const halfW = this.trackWidth / 2;
    const isHover = this.hoverItem === "gate1";

    ctx.save();
    ctx.translate(gx, gy);

    // Ultrasonic sonar wave cones radiating left toward approaching rover
    const pulse = (now % 1400) / 1400;
    for (let i = 0; i < 3; i++) {
      const p = (pulse + i / 3) % 1;
      const r = 16 + p * 52;
      ctx.strokeStyle = `rgba(91, 140, 255, ${(1 - p) * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-18, 0, r, Math.PI * 0.72, Math.PI * 1.28);
      ctx.stroke();
    }

    // Servo Barrier Arm across track
    ctx.save();
    ctx.translate(0, -halfW - 8);
    const armAngle = this.gate1Open ? -Math.PI * 0.42 : 0;
    ctx.rotate(armAngle);

    // Barrier arm with red/white stripes
    ctx.fillStyle = this.gate1Open ? "#34d399" : "#ff6b6b";
    ctx.beginPath();
    ctx.roundRect(-4, 0, 8, halfW * 2 + 14, 4);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    for (let y = 8; y < halfW * 2; y += 16) {
      ctx.fillRect(-4, y, 8, 7);
    }
    ctx.restore();

    // Pivot post + Traffic Light module above track
    ctx.fillStyle = isHover ? "#1e2a52" : "#121a31";
    ctx.strokeStyle = isHover ? "#5b8cff" : "rgba(148, 163, 209, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-84, -halfW - 46, 168, 34, 12);
    ctx.fill();
    ctx.stroke();

    // 3 Traffic Light LEDs
    const tlColors = [
      { key: "RED", c: "#ff5b5b", x: -64 },
      { key: "YELLOW", c: "#ffc94a", x: -48 },
      { key: "GREEN", c: "#34d399", x: -32 },
    ];
    for (const l of tlColors) {
      const active =
        this.trafficLight === l.key || (this.gate1Open && l.key === "GREEN");
      ctx.fillStyle = active ? l.c : "#1d253d";
      if (active) {
        ctx.shadowColor = l.c;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(l.x, -halfW - 29, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#eef1f8";
    ctx.font = "800 11px Nunito, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      this.gate1Open ? "GATE 1 · OPEN" : "GATE 1 · ULTRASONIC",
      -18,
      -halfW - 25
    );

    ctx.restore();
  }

  _drawChargingStation(ctx, now) {
    const cx = this.cx + this.rx;
    const cy = this.cy;
    const halfW = this.trackWidth / 2;
    const isHover = this.hoverItem === "charger";

    ctx.save();
    ctx.translate(cx, cy);

    // Glowing charging pad on the white track
    const isCharging = this.roverState === "CHARGING";
    const isReady = this.roverState === "READY_TO_CHARGE";
    const isCharged = this.roverState === "CHARGED";
    const padColor = isCharged
      ? "rgba(52, 211, 153, 0.28)"
      : isCharging
      ? "rgba(255, 181, 71, 0.30)"
      : isReady
      ? "rgba(34, 211, 238, 0.25)"
      : "rgba(91, 140, 255, 0.14)";

    ctx.fillStyle = padColor;
    ctx.strokeStyle = isCharging
      ? "#ffb547"
      : isCharged
      ? "#34d399"
      : "rgba(91, 140, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-halfW + 4, -44, this.trackWidth - 8, 88, 12);
    ctx.fill();
    ctx.stroke();

    // Supercharger kiosk to the right of the track
    ctx.fillStyle = isHover ? "#1e2a52" : "#121a31";
    ctx.strokeStyle = isHover ? "#ffb547" : "rgba(148, 163, 209, 0.26)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(halfW + 16, -48, 118, 96, 14);
    ctx.fill();
    ctx.stroke();

    // Energy cable from kiosk to track
    ctx.strokeStyle = isCharging ? "#ffb547" : "#4b587c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(halfW + 16, 0);
    ctx.lineTo(halfW - 4, 0);
    ctx.stroke();

    if (isCharging) {
      const p = (now % 600) / 600;
      ctx.fillStyle = "#ffb547";
      ctx.beginPath();
      ctx.arc(halfW + 16 - p * 20, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffb547";
    ctx.font = "900 11px Nunito, system-ui, sans-serif";
    ctx.fillText("⚡ SUPERCHARGER", halfW + 26, -26);

    ctx.fillStyle = "#eef1f8";
    ctx.font = "900 18px Nunito, system-ui, sans-serif";
    ctx.fillText(`${Math.round(this.chargeSoc)}% SOC`, halfW + 26, -3);

    ctx.fillStyle = "#8c95b5";
    ctx.font = "700 11px Nunito, system-ui, sans-serif";
    ctx.fillText(
      this.gate2Open ? "Gate 2: OPEN" : "Gate 2: CLOSED",
      halfW + 26,
      16
    );
    ctx.fillStyle = "#5b8cff";
    ctx.fillText("Click for EV math", halfW + 26, 34);

    // Gate 2 Exit Barrier Arm (just below the charging bay at y = +46)
    ctx.save();
    ctx.translate(halfW + 8, 46);
    const g2Angle = this.gate2Open ? -Math.PI * 0.42 : 0;
    ctx.rotate(g2Angle);
    ctx.fillStyle = this.gate2Open ? "#34d399" : "#ff6b6b";
    ctx.beginPath();
    ctx.roundRect(-(this.trackWidth + 14), -4, this.trackWidth + 14, 8, 4);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  _drawRover(ctx, now) {
    const rx = this.cx + this.rx * Math.cos(this.angle);
    const ry = this.cy + this.ry * Math.sin(this.angle);

    // Tangent vector for clockwise motion (d/dtheta of [rx cos, ry sin] is [-rx sin, ry cos])
    const tx = -this.rx * Math.sin(this.angle);
    const ty = this.ry * Math.cos(this.angle);
    const heading = Math.atan2(ty, tx);

    this.roverScreenPos = { x: rx, y: ry, r: 44 };
    const isHover = this.hoverItem === "rover";

    ctx.save();
    ctx.translate(rx, ry);

    // Interactive pulse halo around the rover so students notice it's clickable
    const haloPulse = 0.5 + 0.5 * Math.sin(now * 0.005);
    ctx.beginPath();
    ctx.arc(0, 0, isHover ? 44 : 38 + haloPulse * 4, 0, Math.PI * 2);
    ctx.fillStyle = isHover
      ? "rgba(91, 140, 255, 0.24)"
      : "rgba(91, 140, 255, 0.10)";
    ctx.fill();
    ctx.strokeStyle = isHover
      ? "#5b8cff"
      : "rgba(91, 140, 255, 0.38)";
    ctx.lineWidth = isHover ? 2 : 1.2;
    ctx.stroke();

    ctx.save();
    ctx.rotate(heading);

    // 4× Mecanum Wheels with 45-degree roller treads
    const wheels = [
      { x: 14, y: -19 }, // Front-Left
      { x: 14, y: 19 },  // Front-Right
      { x: -14, y: -19 }, // Rear-Left
      { x: -14, y: 19 },  // Rear-Right
    ];
    for (const w of wheels) {
      ctx.fillStyle = "#171f36";
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(w.x - 8, w.y - 4.5, 16, 9, 2.5);
      ctx.fill();
      ctx.stroke();

      // Diagonal Mecanum rollers
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      for (let r = -5; r <= 5; r += 5) {
        ctx.beginPath();
        ctx.moveTo(w.x + r - 2, w.y - 3.5);
        ctx.lineTo(w.x + r + 2, w.y + 3.5);
        ctx.stroke();
      }
    }

    // Anodized Red/Dark-Slate Makeblock mBot Mega Chassis
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-22, -15, 44, 30, 8);
    ctx.fill();
    ctx.stroke();

    // Red MegaPi Mainboard Core
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.roundRect(-11, -9, 22, 18, 4);
    ctx.fill();

    // Dual 4-LED WS2812B RGB Bars (Left & Right fenders)
    const ledColors = this._getRoverLedColors(now);
    for (let i = 0; i < 4; i++) {
      const lx = -12 + i * 8;
      // Left pod (y = -13) & Right pod (y = +13)
      ctx.fillStyle = ledColors[i];
      ctx.shadowColor = ledColors[i];
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(lx, -13, 2.5, 0, Math.PI * 2);
      ctx.arc(lx, 13, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Front Nose IR Sensor (A15) + Headlight cone
    ctx.fillStyle = "rgba(56, 189, 248, 0.20)";
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(44, -13);
    ctx.lineTo(44, 13);
    ctx.closePath();
    ctx.fill();

    ctx.restore(); // unrotate heading

    // Floating callout pill above the rover
    ctx.fillStyle = isHover ? "#5b8cff" : "rgba(18, 26, 49, 0.92)";
    ctx.strokeStyle = isHover ? "#ffffff" : "rgba(91, 140, 255, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-62, -52, 124, 22, 11);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 10.5px Nunito, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(isHover ? "🔍 Inspect mBot Mega" : "🤖 mBot Mega · Click", 0, -37);

    ctx.restore();
  }

  /**
   * Returns an array of 4 CSS color strings for the 4 individual WS2812B LEDs
   * in each RGB module, matching the exact firmware states!
   */
  _getRoverLedColors(now) {
    const blink = Math.floor(now / 220) % 2 === 0;

    switch (this.roverState) {
      case "FINISH_CELEBRATION": {
        // Fast individual-LED chasing rainbow (each of the 4 LEDs shifted by 90 deg!)
        const baseHue = Math.floor(now / 2) % 360;
        return [0, 1, 2, 3].map((i) => `hsl(${(baseHue + i * 90) % 360}, 95%, 60%)`);
      }
      case "STANDBY": {
        // Slow uniform standby rainbow cycle (all 4 LEDs share the same smooth hue)
        const hue = Math.floor(now / 18) % 360;
        const c = `hsl(${hue}, 85%, 58%)`;
        return [c, c, c, c];
      }
      case "COUNTDOWN": {
        const c = blink ? "#34d399" : "#1e293b";
        return [c, c, c, c];
      }
      case "READY_TO_CHARGE": {
        // Flashing Cyan ('c')
        const c = blink ? "#22d3ee" : "#0e3a47";
        return [c, c, c, c];
      }
      case "CHARGING": {
        // Flashing Green ('g')
        const c = blink ? "#34d399" : "#0f3d2e";
        return [c, c, c, c];
      }
      case "CHARGED": {
        // Solid Green ('v')
        return ["#34d399", "#34d399", "#34d399", "#34d399"];
      }
      case "CHARGE_FAILED":
      case "WAITING_GATE1": {
        // Flashing Red ('f')
        const c = blink ? "#ff6b6b" : "#451a1a";
        return [c, c, c, c];
      }
      default: {
        // Driving forward -> Cyan headlights
        return ["#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8"];
      }
    }
  }
}

window.TrackAnimator = TrackAnimator;
