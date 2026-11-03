/**
 * ============================================================================
 * EV Rover Lab — Step-by-Step Dashboard Controller
 * File: dashboard/js/app.js
 * ============================================================================
 * Connects:
 *  - 4-Step Student Mission Flow (Step 1 Launch -> Step 2 Gate 1 -> Step 3 10s Supercharge -> Step 4 Finish)
 *  - Interactive Circular Track Canvas (TrackAnimator)
 *  - Cutaway Li-Ion Cell & Core Temp Visualizer (BatteryGameVisualizer)
 *  - 2-Level Interactive mBot Mega Hardware Explorer (education_popups.js)
 *  - Direct Web Bluetooth (MbotBLE) & ESP32 Gate WebSocket (Esp32GateClient)
 *  - Multi-PC Server-Sent Events (/api/events) & Stored Per-Game Physics Graphs
 */

(function () {
  let currentRoute =
    window.location.pathname.includes("master") || window.location.hash.includes("master")
      ? "master"
      : "student";
  let masterAuthed = false;
  let activeStep = 1;
  let difficultyMode = "easy";
  let targetMinutes = 30;
  let currentMa = 3680;
  let isCharging = false;
  let chargeInterval = null;
  let lapStartTime = null;
  let lapTimerInterval = null;
  let lapElapsedSec = 0;
  let lastSimSummary = null;
  let cachedGameHistory = [];

  let trackAnim = null;
  let batteryViz = null;
  let mbotBle = null;
  let esp32Ws = null;

  document.addEventListener("DOMContentLoaded", () => {
    trackAnim = new window.TrackAnimator("trackCanvas");
    batteryViz = new window.BatteryGameVisualizer("batteryAnimCanvas", "liveChargeChartCanvas");

    initHardwareClients();
    initServerSync();
    applyRouteUI();
    updateCurrentFormulaUI();
    setupManualDriveButtons();
  });

  // ==========================================================================
  // ROUTING (/ vs /master)
  // ==========================================================================
  window.togglePageRoute = function () {
    currentRoute = currentRoute === "student" ? "master" : "student";
    applyRouteUI();
  };

  function applyRouteUI() {
    const p1 = document.getElementById("page1");
    const p2 = document.getElementById("page2");
    const stepper = document.getElementById("missionStepper");
    const navBtn = document.getElementById("navSwitchBtn");

    if (currentRoute === "master") {
      p1?.classList.remove("active");
      p2?.classList.add("active");
      if (stepper) stepper.style.display = "none";
      if (navBtn) navBtn.textContent = "← Student View";
      loadGameHistoryList();
    } else {
      p2?.classList.remove("active");
      p1?.classList.add("active");
      if (stepper) stepper.style.display = "flex";
      if (navBtn) navBtn.textContent = "🛠️ Host Console";
    }
  }

  // ==========================================================================
  // STEP NAVIGATION (1..4)
  // ==========================================================================
  window.setStudentStep = function (stepNum) {
    activeStep = stepNum;
    for (let i = 1; i <= 4; i++) {
      const view = document.getElementById(`viewStep${i}`);
      const nav = document.getElementById(`stepNav${i}`);
      if (view) view.classList.toggle("active", i === stepNum);
      if (nav) {
        nav.classList.remove("current", "done");
        if (i === stepNum) nav.classList.add("current");
        else if (i < stepNum) nav.classList.add("done");
      }
    }
  };

  function setStageCaption(text, dotState = "") {
    const cap = document.getElementById("stageCaptionText");
    const dot = document.getElementById("stageStatusDot");
    if (cap) cap.textContent = text;
    if (dot) {
      dot.className = "status-dot" + (dotState ? ` ${dotState}` : "");
    }
  }

  // ==========================================================================
  // STEP 1 -> STEP 2: START MISSION
  // ==========================================================================
  window.startStudentMission = function () {
    const nameInput = document.getElementById("studentNameInput");
    const driverName = (nameInput?.value || "").trim() || "STEM Explorer";
    const hudName = document.getElementById("hudDriverName");
    if (hudName) hudName.textContent = driverName;

    // Randomize target charging window (18..40 min)
    const windows = [18, 22, 25, 30, 35, 40];
    targetMinutes = windows[Math.floor(Math.random() * windows.length)];
    const idealMa = Math.round(1840 / (targetMinutes / 60) / 50) * 50;
    currentMa = Math.min(5200, Math.max(2400, idealMa));

    const slider = document.getElementById("currentMaSlider");
    const input = document.getElementById("currentMaInput");
    if (slider) slider.value = String(currentMa);
    if (input) input.value = String(currentMa);
    updateCurrentFormulaUI();
    batteryViz?.reset(targetMinutes);

    const banner = document.getElementById("chargeResultBanner");
    if (banner) banner.hidden = true;

    // Trigger Mode 1 on mBot BLE & Reset Gate 1 Lockout
    mbotBle?.sendChar("1");
    esp32Ws?.sendCommand("RESET_LOCKOUT");

    window.setStudentStep(2);
    trackAnim?.setPhase("COUNTDOWN", { gate1Open: false, gate2Open: false, soc: 20 });
    setStageCaption("5-Second Alignment Countdown · Place rover on white road at Start Line", "ok");

    let count = 5;
    const ring = document.getElementById("step2HeroRing");
    const title = document.getElementById("step2Title");
    if (ring) {
      ring.classList.add("countdown");
      ring.textContent = String(count);
    }
    if (title) title.textContent = `Alignment Countdown: ${count}s`;

    const cdTimer = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        if (ring) ring.textContent = String(count);
        if (title) title.textContent = `Alignment Countdown: ${count}s`;
      } else {
        window.clearInterval(cdTimer);
        if (ring) {
          ring.classList.remove("countdown");
          ring.textContent = "🤖";
        }
        if (title) title.textContent = "Cruising to Ultrasonic Gate 1";
        startLapClock();
        trackAnim?.setPhase("DRIVING_TO_GATE1");
        setStageCaption("Autonomous Mode 1 · Dual IR sensors guiding rover toward Gate 1");

        // If running in standalone simulation mode without physical ESP32/BLE connected:
        if (!esp32Ws?.connected && !mbotBle?.connected) {
          window.setTimeout(() => {
            trackAnim?.setPhase("WAITING_GATE1", { trafficLight: "RED" });
            setStageCaption("Gate 1 Ultrasonic Sensor (<5 cm) · Traffic Light: RED → YELLOW → GREEN", "energy");
            incrementCarCount();
          }, 2200);
          window.setTimeout(() => {
            trackAnim?.setPhase("WAITING_GATE1", { trafficLight: "YELLOW" });
          }, 3200);
          window.setTimeout(() => {
            trackAnim?.setPhase("DRIVING_TO_CHARGE", { gate1Open: true, trafficLight: "GREEN" });
          }, 4200);
          window.setTimeout(() => {
            window.arriveAtChargingStation();
          }, 6600);
        }
      }
    }, 1000);
  };

  window.arriveAtChargingStation = function () {
    window.setStudentStep(3);
    trackAnim?.setPhase("READY_TO_CHARGE", { gate1Open: true, gate2Open: false, soc: 20 });
    mbotBle?.sendChar("c"); // Flashing Cyan
    setStageCaption("Docked at Supercharger (Flashing Cyan) · Select charging current (mA)!", "energy");
  };

  // ==========================================================================
  // STEP 3: 10-SECOND EV BATTERY SUPERCHARGER SIMULATION
  // ==========================================================================
  window.setDifficultyMode = function (mode) {
    difficultyMode = mode;
    document.getElementById("diffBtnEasy")?.classList.toggle("active", mode === "easy");
    document.getElementById("diffBtnPro")?.classList.toggle("active", mode === "pro");
    updateCurrentFormulaUI();
  };

  window.stepCurrentMa = function (delta) {
    if (isCharging) return;
    currentMa = Math.max(500, Math.min(8000, currentMa + delta));
    const slider = document.getElementById("currentMaSlider");
    const input = document.getElementById("currentMaInput");
    if (slider) slider.value = String(currentMa);
    if (input) input.value = String(currentMa);
    updateCurrentFormulaUI();
  };

  window.syncCurrentInputFromSlider = function () {
    const slider = document.getElementById("currentMaSlider");
    const input = document.getElementById("currentMaInput");
    currentMa = Number(slider?.value || 3680);
    if (input) input.value = String(currentMa);
    updateCurrentFormulaUI();
  };

  window.syncCurrentSliderFromInput = function () {
    const slider = document.getElementById("currentMaSlider");
    const input = document.getElementById("currentMaInput");
    currentMa = Math.max(500, Math.min(8000, Number(input?.value || 3680)));
    if (slider) slider.value = String(currentMa);
    updateCurrentFormulaUI();
  };

  function updateCurrentFormulaUI() {
    const minBadge = document.getElementById("targetMinutesBadge");
    if (minBadge) minBadge.textContent = `${targetMinutes} min`;

    const hrs = targetMinutes / 60;
    const minReqMa = Math.round(1840 / hrs);
    const maxSafeMa = 5400;

    const fMin = document.getElementById("formulaMinSpan");
    const fHr = document.getElementById("formulaHrSpan");
    const fBox = document.getElementById("formulaCalcBox");
    if (fMin) fMin.textContent = `${targetMinutes} min`;
    if (fHr) fHr.textContent = `${hrs.toFixed(2)} hr`;
    if (fBox) {
      fBox.textContent = `I = 1,840 mAh ÷ ${hrs.toFixed(2)} hr = ${minReqMa.toLocaleString()} mA  (Keep Core T1 < 61.9°C!)`;
    }

    const hint = document.getElementById("sweetSpotHintLabel");
    if (hint) {
      hint.textContent =
        difficultyMode === "easy"
          ? `Sweet Spot: ${minReqMa.toLocaleString()} – ${maxSafeMa.toLocaleString()} mA`
          : `Calculate: 1,840 mAh ÷ ${hrs.toFixed(2)} hr`;
    }

    const zone = document.getElementById("ampZoneBadge");
    if (zone) {
      if (difficultyMode !== "easy") {
        zone.className = "zone slow";
        zone.textContent = "Challenge Mode";
      } else if (currentMa < minReqMa * 0.96) {
        zone.className = "zone slow";
        zone.textContent = "Too Slow (Won't Finish)";
      } else if (currentMa > maxSafeMa) {
        zone.className = "zone hot";
        zone.textContent = "Danger: Overheats (>61.9°C)!";
      } else {
        zone.className = "zone ok";
        zone.textContent = "Sweet Spot Zone";
      }
    }

    if (batteryViz) batteryViz.currentMa = currentMa;
  }

  window.runSuperchargeSimulation = async function () {
    if (isCharging) return;
    isCharging = true;
    const btn = document.getElementById("btnRunSupercharge");
    const banner = document.getElementById("chargeResultBanner");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⚡ Supercharging EV Battery (10.0s)...";
    }
    if (banner) banner.hidden = true;

    batteryViz?.reset(targetMinutes);
    trackAnim?.setPhase("CHARGING");
    mbotBle?.sendChar("g"); // Flashing Green
    setStageCaption("10-Second EV Supercharge Active (Flashing Green) · Watch Core Temp T1!", "energy");

    const driverName =
      (document.getElementById("studentNameInput")?.value || "").trim() || "STEM Explorer";

    try {
      const res = await fetch("/api/battery/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_mA: currentMa,
          target_minutes: targetMinutes,
          real_duration_sec: 10.0,
          initial_soc: 0.2,
          target_soc: 1.0,
          student_name: driverName,
          lap_time_sec: Number(lapElapsedSec.toFixed(2)),
          record_history: true,
        }),
      });
      const data = await res.json();
      const series = data.series || [];
      const summary = data.summary;
      lastSimSummary = summary;

      let idx = 0;
      if (chargeInterval) window.clearInterval(chargeInterval);
      chargeInterval = window.setInterval(() => {
        if (idx < series.length) {
          const pt = series[idx];
          batteryViz?.updateFrame(pt, "CHARGING", targetMinutes);
          trackAnim?.setPhase("CHARGING", { soc: pt.soc_pct, tempC: pt.T1_C });
          idx += 1;

          const reachedFull = pt.soc_pct >= 99.9 && summary.success;
          const overheatedNow = pt.T1_C >= 61.85 && summary.overheated;
          if (!reachedFull && !overheatedNow && idx < series.length) {
            return;
          }
        }

        window.clearInterval(chargeInterval);
        isCharging = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "⚡ Start 10-Second Supercharge";
        }

        showChargeResultBanner(summary);
        loadGameHistoryList();

        if (summary.success) {
          trackAnim?.setPhase("CHARGED", { gate2Open: true, soc: 100 });
          mbotBle?.sendChar("v"); // Solid Green
          esp32Ws?.sendCommand("CHARGED");
          setStageCaption("100% Charged Safely! Gate 2 Opening for Final Sprint!", "ok");

          window.setTimeout(() => {
            trackAnim?.setPhase("DRIVING_TO_FINISH", { gate2Open: true });
            if (!mbotBle?.connected) {
              window.setTimeout(() => {
                completeLapAndCelebrate();
              }, 2500);
            }
          }, 1800);
        } else {
          trackAnim?.setPhase("CHARGE_FAILED", { soc: summary.final_soc_pct });
          mbotBle?.sendChar("f"); // Flashing Red
          setStageCaption("Charge Failed (Flashing Red) · Adjust Current (mA) and retry!", "bad");
        }
      }, 100);
    } catch (err) {
      isCharging = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "⚡ Start 10-Second Supercharge";
      }
      logTerminal(`[SIM ERR] ${err.message || err}`);
    }
  };

  function showChargeResultBanner(summary) {
    const banner = document.getElementById("chargeResultBanner");
    const ico = document.getElementById("chargeResultIcon");
    const title = document.getElementById("chargeResultTitle");
    const text = document.getElementById("chargeResultText");
    if (!banner) return;

    banner.hidden = false;
    if (summary.success) {
      banner.className = "result ok";
      if (ico) ico.textContent = "✅";
      if (title) title.textContent = "100% Charged Safely! Gate 2 Opening!";
      if (text) {
        text.textContent = `Charged in ${summary.time_to_full_min?.toFixed(1)} min with Peak Core Temp ${summary.peak_T1_C.toFixed(1)}°C (< 61.9°C).`;
      }
    } else if (summary.overheated) {
      banner.className = "result bad";
      if (ico) ico.textContent = "🔥";
      if (title) title.textContent = `Battery Overheated (${summary.peak_T1_C.toFixed(1)}°C > 61.9°C)!`;
      if (text) {
        text.textContent = "Lower your charging current (mA) so Joule heating (I²R) stays under 61.9°C, then try again!";
      }
    } else {
      banner.className = "result warn";
      if (ico) ico.textContent = "⏱️";
      if (title) title.textContent = `Time Ran Out at ${summary.final_soc_pct.toFixed(0)}% SOC!`;
      if (text) {
        text.textContent = `Increase your current (mA) to at least ${summary.ideal_min_current_mA} mA to finish inside ${targetMinutes} minutes!`;
      }
    }
  }

  // ==========================================================================
  // STEP 4: FINISH LINE & 7-SECOND CHASING RAINBOW CELEBRATION
  // ==========================================================================
  async function completeLapAndCelebrate() {
    stopLapClock();
    window.setStudentStep(4);
    trackAnim?.setPhase("FINISH_CELEBRATION", { gate1Open: false, gate2Open: false, soc: 100 });
    setStageCaption("🏁 Lap Complete! 7-Second Individual-LED Chasing Rainbow Celebration!", "ok");

    // Reset Gate 1 timer immediately on lap finish
    esp32Ws?.sendCommand("RESET_LOCKOUT");
    esp32Ws?.sendCommand("RESET_GATES");

    const driverName =
      (document.getElementById("studentNameInput")?.value || "").trim() || "STEM Explorer";
    const lapTime = Math.max(8.5, lapElapsedSec);

    document.getElementById("finishTitleBanner").textContent = `Awesome Job, ${driverName}!`;
    document.getElementById("finishLapTimeVal").textContent = lapTime.toFixed(1);
    document.getElementById("finishStatCurrent").textContent = `${currentMa} mA`;
    document.getElementById("finishStatTemp").textContent = `${(lastSimSummary?.peak_T1_C ?? 44.5).toFixed(1)}°C`;
    document.getElementById("finishStatSoc").textContent = "100%";

    try {
      await fetch("/api/leaderboard/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: driverName,
          lap_time_sec: Number(lapTime.toFixed(2)),
          charge_time_min: lastSimSummary?.time_to_full_min ?? targetMinutes,
          current_mA: currentMa,
          peak_temp_C: lastSimSummary?.peak_T1_C ?? 44.5,
          final_soc_pct: 100,
        }),
      });
      refreshLeaderboardUI();
    } catch {
      // ignore
    }

    // After 7 seconds of fast per-LED chasing rainbow, transition to uniform Standby color cycle
    window.setTimeout(() => {
      if (activeStep === 4) {
        trackAnim?.setPhase("STANDBY");
        const rTitle = document.getElementById("finishRainbowStatusTitle");
        if (rTitle) rTitle.textContent = "Standby Color Cycle Ready for Next Student!";
        setStageCaption("Standby Mode · Uniform rainbow cycle active. Ready for next student!");
      }
    }, 7000);
  }

  window.resetForNextStudent = function () {
    stopLapClock();
    lapElapsedSec = 0;
    const clockEl = document.getElementById("lapClockVal");
    if (clockEl) clockEl.textContent = "0.0";
    window.setStudentStep(1);
    trackAnim?.setPhase("STANDBY", { gate1Open: false, gate2Open: false, soc: 20 });
    setStageCaption("Place rover on the Start Line and press Start Mission");
  };

  // ==========================================================================
  // LAP STOPWATCH
  // ==========================================================================
  function startLapClock() {
    stopLapClock();
    lapStartTime = performance.now();
    lapTimerInterval = window.setInterval(() => {
      lapElapsedSec = (performance.now() - lapStartTime) / 1000;
      const el = document.getElementById("lapClockVal");
      if (el) el.textContent = lapElapsedSec.toFixed(1);
    }, 100);
  }

  function stopLapClock() {
    if (lapTimerInterval) {
      window.clearInterval(lapTimerInterval);
      lapTimerInterval = null;
    }
  }

  // ==========================================================================
  // HARDWARE CLIENTS (mBot BLE + ESP32 WebSocket)
  // ==========================================================================
  function initHardwareClients() {
    if (window.MbotBLE) {
      mbotBle = new window.MbotBLE({
        onStatusChange: (conn) => {
          document.getElementById("dotBle")?.classList.toggle("on", conn);
          const btn = document.getElementById("btnConnectBle");
          if (btn) btn.textContent = conn ? "● BLE Connected" : "📶 Connect BLE";
        },
        onLog: logTerminal,
        onEvent: (tag) => {
          if (tag === "LAUNCH") {
            startLapClock();
            trackAnim?.setPhase("DRIVING_TO_GATE1");
          } else if (tag === "OBS_STOP") {
            if (activeStep <= 2) {
              window.arriveAtChargingStation();
            }
          } else if (tag === "FINISH") {
            completeLapAndCelebrate();
          }
        },
      });
    }

    if (window.Esp32GateClient) {
      esp32Ws = new window.Esp32GateClient({
        onStatusChange: (conn) => {
          document.getElementById("dotEsp32")?.classList.toggle("on", conn);
          const chip = document.getElementById("esp32ConnChip");
          if (chip) chip.textContent = conn ? "Online" : "Offline";
        },
        onLog: logTerminal,
        onTelemetry: (data) => {
          if (data.carCount !== undefined) updateCarCountBadges(data.carCount);
          if (data.distanceCm !== undefined) {
            const kv = document.getElementById("kvUltrasonic");
            if (kv) kv.textContent = `${data.distanceCm.toFixed(1)} cm`;
          }
          if (data.gateState) {
            const kv = document.getElementById("kvGateState");
            if (kv) kv.textContent = data.gateState;
          }
        },
      });
    }
  }

  window.connectMbotBle = () => mbotBle?.connect();
  window.sendMbotChar = (ch) => mbotBle?.sendChar(ch);
  window.connectEsp32Gate = () => {
    const ip = document.getElementById("esp32IpInput")?.value || "192.168.137.169:81";
    esp32Ws?.connect(ip);
  };
  window.sendEsp32Cmd = (cmd) => esp32Ws?.sendCommand(cmd);

  function setupManualDriveButtons() {
    document.querySelectorAll("[data-drive]").forEach((btn) => {
      const ch = btn.getAttribute("data-drive");
      btn.addEventListener("mousedown", () => mbotBle?.sendChar(ch));
      btn.addEventListener("mouseup", () => mbotBle?.sendChar(" "));
    });
  }

  // ==========================================================================
  // MULTI-PC SERVER SYNC & PAGE 2 MASTER CONTROLS
  // ==========================================================================
  function initServerSync() {
    refreshLeaderboardUI();
    loadGameHistoryList();

    const es = new EventSource("/api/events");
    es.onopen = () => document.getElementById("dotServer")?.classList.add("on");
    es.onerror = () => document.getElementById("dotServer")?.classList.remove("on");
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "state_sync" && msg.payload) {
          const st = msg.payload;
          const overlay = document.getElementById("globalPauseOverlay");
          if (overlay) overlay.classList.toggle("active", Boolean(st.paused || st.all_stop));
          if (typeof st.car_count === "number") updateCarCountBadges(st.car_count);
        } else if (msg.type === "leaderboard_sync") {
          refreshLeaderboardUI();
        } else if (msg.type === "game_history_sync") {
          loadGameHistoryList();
        }
      } catch {
        // ignore
      }
    };
  }

  window.submitMasterLogin = function (e) {
    e.preventDefault();
    const pw = document.getElementById("masterPasswordInput")?.value || "";
    const err = document.getElementById("masterLoginError");
    if (pw.trim() === "mbot26") {
      masterAuthed = true;
      document.getElementById("masterLoginBox").hidden = true;
      document.getElementById("masterConsoleContent").hidden = false;
      loadGameHistoryList();
    } else if (err) {
      err.hidden = false;
    }
  };

  window.triggerMasterAllStop = function () {
    mbotBle?.sendChar(" ");
    esp32Ws?.sendCommand("RESET_GATES");
    fetch("/api/state/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all_stop: true, paused: true, last_event: "MASTER_ALL_STOP" }),
    });
  };

  let masterPaused = false;
  window.toggleMasterPause = function () {
    masterPaused = !masterPaused;
    const btn = document.getElementById("btnMasterPauseToggle");
    if (btn) btn.textContent = masterPaused ? "▶️ Resume Station" : "⏸️ Pause Station";
    fetch("/api/state/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: masterPaused, all_stop: false }),
    });
  };

  window.masterResetLapAndGate1 = function () {
    masterPaused = false;
    window.resetForNextStudent();
    esp32Ws?.sendCommand("RESET_LOCKOUT");
    fetch("/api/state/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: false, all_stop: false, gate1_lockout_sec: 0 }),
    });
  };

  function incrementCarCount() {
    const cur = Number(document.getElementById("p1CarCountBadge")?.textContent || 0) + 1;
    updateCarCountBadges(cur);
    fetch("/api/state/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ car_count: cur }),
    });
  }

  window.resetCarCountAll = function () {
    updateCarCountBadges(0);
    esp32Ws?.sendCommand("RESET_COUNT");
    fetch("/api/state/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ car_count: 0 }),
    });
  };

  function updateCarCountBadges(count) {
    const b1 = document.getElementById("p1CarCountBadge");
    const b2 = document.getElementById("p2CarCountVal");
    if (b1) b1.textContent = String(count);
    if (b2) b2.textContent = String(count);
  }

  // ==========================================================================
  // LEADERBOARD & STORED PER-GAME PHYSICS HISTORY
  // ==========================================================================
  async function refreshLeaderboardUI() {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      const entries = data.entries || [];

      const p1List = document.getElementById("p1LeaderboardList");
      if (p1List) {
        if (!entries.length) {
          p1List.innerHTML = `<div class="lb-empty">Complete a lap to claim the #1 spot on the leaderboard!</div>`;
        } else {
          p1List.innerHTML = entries
            .slice(0, 5)
            .map(
              (e, i) => `
              <div class="lb-row">
                <div class="lb-rank">#${i + 1}</div>
                <div class="lb-name">${e.name} <small style="color:var(--muted)">(${e.current_mA} mA)</small></div>
                <div class="lb-time">${Number(e.lap_time_sec).toFixed(1)}s</div>
              </div>
            `
            )
            .join("");
        }
      }

      const p2Body = document.getElementById("p2LeaderboardBody");
      if (p2Body) {
        if (!entries.length) {
          p2Body.innerHTML = `<tr><td colspan="5" style="color:var(--muted); text-align:center; padding:18px;">No laps recorded yet</td></tr>`;
        } else {
          p2Body.innerHTML = entries
            .map(
              (e, i) => `
              <tr>
                <td>#${i + 1}</td>
                <td>${e.name}</td>
                <td>${Number(e.lap_time_sec).toFixed(1)}s</td>
                <td>${e.current_mA} mA</td>
                <td><button class="m-btn danger mini" onclick="deleteScoreEntry('${e.id}')">✕</button></td>
              </tr>
            `
            )
            .join("");
        }
      }
    } catch {
      // ignore
    }
  }

  window.deleteScoreEntry = async function (id) {
    await fetch("/api/leaderboard/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refreshLeaderboardUI();
  };

  window.clearAllLeaderboard = async function () {
    await fetch("/api/leaderboard/clear", { method: "POST", body: "{}" });
    refreshLeaderboardUI();
  };

  window.loadGameHistoryList = async function () {
    try {
      const res = await fetch("/api/games/history?include_series=1&limit=50");
      const data = await res.json();
      cachedGameHistory = data.games || [];
      const sel = document.getElementById("gameHistorySelect");
      if (!sel) return;

      if (!cachedGameHistory.length) {
        sel.innerHTML = `<option value="">No student charging runs stored yet — click "Generate Sample Run"</option>`;
        return;
      }

      sel.innerHTML = cachedGameHistory
        .map(
          (g, idx) =>
            `<option value="${g.id}">Run #${cachedGameHistory.length - idx} · ${g.student_name} · ${
              g.current_mA
            } mA (${g.target_minutes}m) → ${g.success ? "SUCCESS" : g.failure_reason} (Peak ${Number(
              g.peak_T1_C
            ).toFixed(1)}°C)</option>`
        )
        .join("");

      window.onSelectStoredGame();
    } catch {
      // ignore
    }
  };

  window.onSelectStoredGame = function () {
    const sel = document.getElementById("gameHistorySelect");
    const id = sel?.value;
    const rec = cachedGameHistory.find((g) => g.id === id) || cachedGameHistory[0];
    if (!rec) return;

    const meta = document.getElementById("historyMetaBar");
    if (meta) {
      meta.innerHTML = `
        <span class="meta-chip">Driver: <b>${rec.student_name}</b></span>
        <span class="meta-chip">Current: <b>${rec.current_mA} mA</b></span>
        <span class="meta-chip">Window: <b>${rec.target_minutes} min</b></span>
        <span class="meta-chip">Peak Core T1: <b>${Number(rec.peak_T1_C).toFixed(1)}°C</b></span>
        <span class="meta-chip ${rec.success ? "ok" : "bad"}">Outcome: <b>${
        rec.success ? "100% Charged Safely" : rec.failure_reason
      }</b></span>
      `;
    }

    if (window.renderStoredGameGraphs) {
      window.renderStoredGameGraphs(rec);
    }
  };

  window.runQuickDemoPhysicsOnMaster = async function () {
    await fetch("/api/battery/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_mA: 3750,
        target_minutes: 30,
        real_duration_sec: 10.0,
        student_name: "Sample Physics Run",
        lap_time_sec: 22.1,
        record_history: true,
      }),
    });
    window.loadGameHistoryList();
  };

  window.clearAllGameHistory = async function () {
    await fetch("/api/games/clear", { method: "POST", body: "{}" });
    window.loadGameHistoryList();
  };

  function logTerminal(msg) {
    const term = document.getElementById("masterTerminal");
    if (!term) return;
    const ts = new Date().toLocaleTimeString();
    term.textContent = `[${ts}] ${msg}\n` + term.textContent.slice(0, 6000);
  }
})();
