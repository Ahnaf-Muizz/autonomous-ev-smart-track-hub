/**
 * ============================================================================
 * EV Battery Supercharger Cutaway Visualizer & Physics Graph Renderer
 * File: dashboard/js/battery_game_ui.js
 * ============================================================================
 * Renders:
 *  1. High-DPI Cutaway Li-Ion Cell Animation (#batteryAnimCanvas) with:
 *     - Liquid electrolyte wave fill (20% -> 100% SOC)
 *     - Migrating Li+ ions whose speed scales with charging current I (mA)
 *     - 3-Node Thermal Gauge (Core T1 vs 61.9°C Overheat Limit)
 *     - Live Time Remaining / Simulated Minutes bar
 *  2. Expandable Live SOC & Core Temperature Chart (#liveChargeChartCanvas)
 *  3. Page 2 Stored Per-Game 4-Panel Physics Charts:
 *     - #histChartSoc  (SOC % vs Time)
 *     - #histChartTemp (T1 Core, T2 Surface, T_inf Coolant °C vs Time)
 *     - #histChartVolt (Terminal Voltage Vt vs Open-Circuit Vocv V)
 *     - #histChartHeat (Joule Heat Q Watts vs Time)
 */

class BatteryGameVisualizer {
  constructor(batteryCanvasId, liveChartCanvasId) {
    this.batCanvas = document.getElementById(batteryCanvasId);
    this.batCtx = this.batCanvas ? this.batCanvas.getContext("2d") : null;

    this.chartCanvas = document.getElementById(liveChartCanvasId);
    this.chartCtx = this.chartCanvas ? this.chartCanvas.getContext("2d") : null;

    // Current state
    this.soc = 20.0; // %
    this.t1C = 26.85; // Core °C
    this.t2C = 26.85; // Surface °C
    this.tInfC = 26.85; // Coolant °C
    this.vTerm = 3.253; // V
    this.vOcv = 3.253; // V
    this.qHeatW = 0.0; // W
    this.currentMa = 3200;
    this.simElapsedMin = 0.0;
    this.targetMin = 30.0;
    this.status = "READY"; // READY, CHARGING, SUCCESS, OVERHEAT, TIMEOUT

    this.liveSeries = [];
    this.ions = Array.from({ length: 18 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 2.5 + (i % 3),
      phase: Math.random() * Math.PI * 2,
    }));

    this._startLoop();
  }

  reset(targetMin = 30) {
    this.soc = 20.0;
    this.t1C = 26.85;
    this.t2C = 26.85;
    this.tInfC = 26.85;
    this.vTerm = 3.253;
    this.vOcv = 3.253;
    this.qHeatW = 0.0;
    this.simElapsedMin = 0.0;
    this.targetMin = targetMin;
    this.status = "READY";
    this.liveSeries = [];
    this.renderLiveChart();
  }

  updateFrame(pt, status = "CHARGING", targetMin = 30) {
    if (!pt) return;
    this.soc = pt.soc_pct ?? this.soc;
    this.t1C = pt.T1_C ?? this.t1C;
    this.t2C = pt.T2_C ?? this.t2C;
    this.tInfC = pt.T_inf_C ?? this.tInfC;
    this.vTerm = pt.V_term ?? this.vTerm;
    this.vOcv = pt.V_ocv ?? this.vOcv;
    this.qHeatW = pt.Q_heat_W ?? this.qHeatW;
    this.simElapsedMin = pt.sim_time_min ?? this.simElapsedMin;
    this.targetMin = targetMin;
    this.status = status;

    this.liveSeries.push(pt);
    this.renderLiveChart();
  }

  _syncCanvas(canvas, logicalW, logicalH) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { scaleX: w / logicalW, scaleY: h / logicalH };
  }

  _startLoop() {
    const tick = (now) => {
      this._renderBatteryCutaway(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _renderBatteryCutaway(now) {
    if (!this.batCtx || !this.batCanvas) return;
    const W = 520;
    const H = 200;
    const scale = this._syncCanvas(this.batCanvas, W, H);
    if (!scale) return;

    const ctx = this.batCtx;
    ctx.save();
    ctx.scale(scale.scaleX, scale.scaleY);

    ctx.fillStyle = "#0d1326";
    ctx.fillRect(0, 0, W, H);

    // Left Half: Cutaway Horizontal Prismatic EV Cell (x: 22..290, y: 28..146)
    const bx = 24;
    const by = 28;
    const bw = 258;
    const bh = 114;

    // Thermal aura behind battery when heating up
    const tempRatio = Math.max(0, Math.min(1, (this.t1C - 26.85) / (61.85 - 26.85)));
    if (tempRatio > 0.15) {
      const aura = ctx.createRadialGradient(
        bx + bw / 2,
        by + bh / 2,
        20,
        bx + bw / 2,
        by + bh / 2,
        155
      );
      const auraColor =
        this.t1C >= 61.85
          ? `rgba(255, 107, 107, ${0.35 * tempRatio})`
          : `rgba(255, 181, 71, ${0.26 * tempRatio})`;
      aura.addColorStop(0, auraColor);
      aura.addColorStop(1, "rgba(13, 19, 38, 0)");
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, W, H);
    }

    // Battery positive terminal nub on right
    ctx.fillStyle = "#4b587c";
    ctx.beginPath();
    ctx.roundRect(bx + bw, by + bh / 2 - 18, 10, 36, [0, 5, 5, 0]);
    ctx.fill();

    // Battery casing outline
    ctx.fillStyle = "#111933";
    ctx.strokeStyle =
      this.status === "OVERHEAT"
        ? "#ff6b6b"
        : this.status === "SUCCESS"
        ? "#34d399"
        : "rgba(148, 163, 209, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 16);
    ctx.fill();
    ctx.stroke();

    // Clipped liquid SOC fill inside battery
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx + 4, by + 4, bw - 8, bh - 8, 12);
    ctx.clip();

    const fillFrac = Math.max(0, Math.min(1, this.soc / 100));
    const fillW = (bw - 8) * fillFrac;

    const grad = ctx.createLinearGradient(bx + 4, 0, bx + 4 + bw - 8, 0);
    if (this.status === "OVERHEAT" || this.t1C >= 61.85) {
      grad.addColorStop(0, "#f97316");
      grad.addColorStop(1, "#ef4444");
    } else if (this.soc >= 99.5) {
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(1, "#34d399");
    } else {
      grad.addColorStop(0, "#3b82f6");
      grad.addColorStop(0.6, "#22d3ee");
      grad.addColorStop(1, "#34d399");
    }

    ctx.fillStyle = grad;
    ctx.fillRect(bx + 4, by + 4, fillW, bh - 8);

    // Animated wave crest at the right edge of fill
    if (fillFrac > 0.02 && fillFrac < 0.99) {
      ctx.beginPath();
      const waveX = bx + 4 + fillW;
      ctx.moveTo(waveX, by + 4);
      for (let y = by + 4; y <= by + bh - 4; y += 6) {
        const dx = Math.sin(now * 0.008 + y * 0.08) * 4;
        ctx.lineTo(waveX + dx, y);
      }
      ctx.lineTo(bx + 4, by + bh - 4);
      ctx.lineTo(bx + 4, by + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Li+ Ion particles streaming across cell during charging
    const ionSpeed = this.status === "CHARGING" ? 0.0012 * (this.currentMa / 2000) : 0.0002;
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    for (const ion of this.ions) {
      ion.x = (ion.x + ionSpeed) % 1;
      const ix = bx + 10 + ion.x * Math.max(30, fillW - 14);
      const iy =
        by +
        14 +
        ion.y * (bh - 28) +
        Math.sin(now * 0.004 + ion.phase) * 3;
      ctx.beginPath();
      ctx.arc(ix, iy, ion.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // end clip

    // Big SOC % readout centered on battery cell
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 32px Nunito, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 10;
    ctx.fillText(`${this.soc.toFixed(0)}%`, bx + bw / 2, by + bh / 2 + 8);
    ctx.font = "800 11px Nunito, system-ui, sans-serif";
    ctx.fillStyle = "rgba(238, 241, 248, 0.85)";
    ctx.fillText(
      `${this.vTerm.toFixed(2)} V  ·  2,300 mAh Li-Ion`,
      bx + bw / 2,
      by + bh / 2 + 28
    );
    ctx.shadowBlur = 0;

    // Bottom progress bar under battery: Simulated Minutes vs Allowed Window
    const timeFrac = Math.min(1, this.simElapsedMin / Math.max(1, this.targetMin));
    ctx.fillStyle = "#8c95b5";
    ctx.font = "800 11px Nunito, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `⏱️ Charge Time: ${this.simElapsedMin.toFixed(1)} / ${this.targetMin} min`,
      bx,
      166
    );

    ctx.fillStyle = "#172040";
    ctx.beginPath();
    ctx.roundRect(bx, 173, bw, 8, 4);
    ctx.fill();

    ctx.fillStyle = timeFrac >= 1 && this.soc < 99.5 ? "#ff6b6b" : "#5b8cff";
    ctx.beginPath();
    ctx.roundRect(bx, 173, bw * timeFrac, 8, 4);
    ctx.fill();

    // Right Half: Core Temperature T1 Thermometer Card (x: 312..498, y: 28..181)
    const tx = 312;
    const ty = 28;
    const tw = 186;
    const th = 153;

    ctx.fillStyle = "#121a31";
    ctx.strokeStyle =
      this.t1C >= 61.85
        ? "rgba(255, 107, 107, 0.65)"
        : "rgba(148, 163, 209, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#8c95b5";
    ctx.font = "800 11px Nunito, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("🌡️ CORE TEMP (T1)", tx + 14, ty + 22);

    const tempColor =
      this.t1C >= 61.85 ? "#ff6b6b" : this.t1C >= 52 ? "#ffb547" : "#34d399";
    ctx.fillStyle = tempColor;
    ctx.font = "900 28px Nunito, system-ui, sans-serif";
    ctx.fillText(`${this.t1C.toFixed(1)}°C`, tx + 14, ty + 54);

    ctx.fillStyle = "#8c95b5";
    ctx.font = "700 11px Nunito, system-ui, sans-serif";
    ctx.fillText(`Max Safe Limit: 61.9°C`, tx + 14, ty + 73);

    // Thermal bar with 61.9°C red limit line
    const barX = tx + 14;
    const barY = ty + 86;
    const barW = tw - 28;
    const barH = 12;

    ctx.fillStyle = "#0a0f1e";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    const tFill = Math.max(0.05, Math.min(1, (this.t1C - 25) / (70 - 25)));
    ctx.fillStyle = tempColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * tFill, barH, 6);
    ctx.fill();

    // Limit marker at 61.85°C
    const limitX = barX + barW * ((61.85 - 25) / (70 - 25));
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(limitX, barY - 3);
    ctx.lineTo(limitX, barY + barH + 3);
    ctx.stroke();

    // Surface T2 & Joule Heat Q sub-readouts
    ctx.fillStyle = "#8c95b5";
    ctx.font = "700 11px Nunito, system-ui, sans-serif";
    ctx.fillText(`Surface T2: ${this.t2C.toFixed(1)}°C`, tx + 14, ty + 120);
    ctx.fillText(`Joule Heat: ${this.qHeatW.toFixed(1)} W`, tx + 14, ty + 138);

    ctx.restore();
  }

  renderLiveChart() {
    if (!this.chartCtx || !this.chartCanvas) return;
    const W = 440;
    const H = 180;
    const scale = this._syncCanvas(this.chartCanvas, W, H);
    if (!scale) return;

    const ctx = this.chartCtx;
    ctx.save();
    ctx.scale(scale.scaleX, scale.scaleY);

    ctx.fillStyle = "#121a31";
    ctx.fillRect(0, 0, W, H);

    const pad = { l: 38, r: 38, t: 24, b: 26 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    // Gridlines
    ctx.strokeStyle = "rgba(148, 163, 209, 0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
    }

    // Legend
    ctx.font = "800 10.5px Nunito, system-ui, sans-serif";
    ctx.fillStyle = "#34d399";
    ctx.textAlign = "left";
    ctx.fillText("● SOC (%)", pad.l, 15);
    ctx.fillStyle = "#ffb547";
    ctx.fillText("● Core Temp T1 (°C)", pad.l + 75, 15);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillText("--- 61.9°C Limit", pad.l + 200, 15);

    // 61.85°C Thermal Limit dashed line (mapped to 20..80°C on right axis)
    const limitY = pad.t + ph * (1 - (61.85 - 20) / 60);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(255, 107, 107, 0.6)";
    ctx.beginPath();
    ctx.moveTo(pad.l, limitY);
    ctx.lineTo(pad.l + pw, limitY);
    ctx.stroke();
    ctx.restore();

    if (this.liveSeries.length > 1) {
      const maxT = Math.max(this.targetMin, this.liveSeries[this.liveSeries.length - 1].sim_time_min || 1);

      // Draw SOC curve (0..100%)
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      this.liveSeries.forEach((p, idx) => {
        const x = pad.l + (p.sim_time_min / maxT) * pw;
        const y = pad.t + ph * (1 - p.soc_pct / 100);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw Core T1 curve (20..80°C)
      ctx.strokeStyle = "#ffb547";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      this.liveSeries.forEach((p, idx) => {
        const x = pad.l + (p.sim_time_min / maxT) * pw;
        const y = pad.t + ph * (1 - (p.T1_C - 20) / 60);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Axes labels
    ctx.fillStyle = "#8c95b5";
    ctx.font = "700 10px Nunito, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("100%", pad.l - 5, pad.t + 4);
    ctx.fillText("20%", pad.l - 5, pad.t + ph);
    ctx.textAlign = "left";
    ctx.fillText("80°C", pad.l + pw + 5, pad.t + 4);
    ctx.fillText("20°C", pad.l + pw + 5, pad.t + ph);
    ctx.textAlign = "center";
    ctx.fillText(`Simulated Charging Time (0 → ${this.targetMin} min)`, pad.l + pw / 2, H - 6);

    ctx.restore();
  }
}

/**
 * Renders the 4 Stored Per-Game Physics Charts on Page 2 (/master)
 */
window.renderStoredGameGraphs = function (gameRecord) {
  if (!gameRecord || !gameRecord.series || !gameRecord.series.length) return;
  const series = gameRecord.series;
  const maxTime = Math.max(
    gameRecord.target_minutes || 30,
    series[series.length - 1].sim_time_min || 1
  );

  // 1. SOC (%) vs Time
  drawMultiSeriesChart("histChartSoc", {
    title: "1. State of Charge SOC (%) vs. Time (min)",
    xMax: maxTime,
    yMin: 0,
    yMax: 105,
    yUnit: "%",
    limitLine: { value: 100, label: "100% Target", color: "#34d399" },
    lines: [
      {
        label: "SOC (%)",
        color: "#34d399",
        getData: (p) => ({ x: p.sim_time_min, y: p.soc_pct }),
      },
    ],
    series,
  });

  // 2. Coupled 3-Node Temperatures (T1 Core, T2 Surface, T_inf Coolant)
  drawMultiSeriesChart("histChartTemp", {
    title: "2. Coupled 3-Node Temperatures (T1 Core, T2 Surface, T∞ Coolant)",
    xMax: maxTime,
    yMin: 20,
    yMax: 75,
    yUnit: "°C",
    limitLine: { value: 61.85, label: "61.9°C Max Safe (335K)", color: "#ff6b6b" },
    lines: [
      {
        label: "T1 Core (°C)",
        color: "#ff6b6b",
        getData: (p) => ({ x: p.sim_time_min, y: p.T1_C }),
      },
      {
        label: "T2 Surface (°C)",
        color: "#ffb547",
        getData: (p) => ({ x: p.sim_time_min, y: p.T2_C }),
      },
      {
        label: "T∞ Coolant (°C)",
        color: "#5b8cff",
        getData: (p) => ({ x: p.sim_time_min, y: p.T_inf_C }),
      },
    ],
    series,
  });

  // 3. Terminal Voltage Vt vs Open-Circuit Voltage Vocv
  drawMultiSeriesChart("histChartVolt", {
    title: "3. Terminal Voltage Vt vs. Open-Circuit Voltage Vocv (V)",
    xMax: maxTime,
    yMin: 3.1,
    yMax: 4.2,
    yUnit: "V",
    lines: [
      {
        label: "Vt = Vocv + I·Rs",
        color: "#5b8cff",
        getData: (p) => ({ x: p.sim_time_min, y: p.V_term }),
      },
      {
        label: "Vocv (Lookup)",
        color: "#34d399",
        getData: (p) => ({ x: p.sim_time_min, y: p.V_ocv }),
      },
    ],
    series,
  });

  // 4. Electro-Thermal Heat Generation Q (Watts)
  const maxQ = Math.max(5, ...series.map((p) => p.Q_heat_W || 0)) * 1.15;
  drawMultiSeriesChart("histChartHeat", {
    title: "4. Internal Heat Generation Q = Rs·I² - dOCV·I·T1 (Watts)",
    xMax: maxTime,
    yMin: 0,
    yMax: maxQ,
    yUnit: "W",
    lines: [
      {
        label: "Heat Generation Q (W)",
        color: "#ffb547",
        getData: (p) => ({ x: p.sim_time_min, y: p.Q_heat_W }),
      },
    ],
    series,
  });
};

function drawMultiSeriesChart(canvasId, cfg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const W = 520;
  const H = 230;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round((rect.width || W) * dpr);
  canvas.height = Math.round((rect.height || H) * dpr);

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(canvas.width / W, canvas.height / H);

  ctx.fillStyle = "#0d1326";
  ctx.fillRect(0, 0, W, H);

  const pad = { l: 46, r: 20, t: 38, b: 30 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  // Title
  ctx.fillStyle = "#eef1f8";
  ctx.font = "800 12px Nunito, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(cfg.title, pad.l, 18);

  // Legend
  let lx = pad.l;
  ctx.font = "700 10.5px Nunito, system-ui, sans-serif";
  for (const line of cfg.lines) {
    ctx.fillStyle = line.color;
    ctx.fillText(`● ${line.label}`, lx, 32);
    lx += ctx.measureText(`● ${line.label}`).width + 16;
  }

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 209, 0.10)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ph * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + pw, y);
    ctx.stroke();

    const val = cfg.yMax - ((cfg.yMax - cfg.yMin) * i) / 4;
    ctx.fillStyle = "#8c95b5";
    ctx.font = "700 10px Nunito, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${val.toFixed(1)}${cfg.yUnit}`, pad.l - 6, y + 3);
  }

  // Optional limit line
  if (cfg.limitLine) {
    const ly =
      pad.t +
      ph * (1 - (cfg.limitLine.value - cfg.yMin) / (cfg.yMax - cfg.yMin));
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = cfg.limitLine.color;
    ctx.beginPath();
    ctx.moveTo(pad.l, ly);
    ctx.lineTo(pad.l + pw, ly);
    ctx.stroke();
    ctx.restore();
  }

  // Data series
  for (const line of cfg.lines) {
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    cfg.series.forEach((pt, i) => {
      const { x, y } = line.getData(pt);
      const px = pad.l + (x / cfg.xMax) * pw;
      const py =
        pad.t + ph * (1 - (y - cfg.yMin) / (cfg.yMax - cfg.yMin));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // X Axis label
  ctx.fillStyle = "#8c95b5";
  ctx.font = "700 10px Nunito, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Simulated Charging Time (0 → ${cfg.xMax.toFixed(0)} min)`, pad.l + pw / 2, H - 8);

  ctx.restore();
}

window.BatteryGameVisualizer = BatteryGameVisualizer;
