/**
 * ============================================================================
 * Interactive 2-Level mBot Mega Hardware Explorer & Science Popups
 * File: dashboard/js/education_popups.js
 * ============================================================================
 * Features:
 *  1. Level 1: Full interactive Makeblock mBot Mega (ATmega2560 / MegaPi)
 *     exploded/top-down technical diagram with 7 clickable hardware subsystems.
 *  2. Level 2: Clicking any part on the diagram (or pill) expands a deep-dive
 *     panel with an interactive live mini-simulator canvas for that exact sensor
 *     or actuator, kid-friendly explanation, and real firmware pinouts.
 *  3. Clean museum-grade Science Modals for Ultrasonic Gate 1, EV Battery Cell,
 *     and Electro-Thermal Heat Dynamics.
 */

window.MBOT_PARTS = {
  mecanum: {
    num: 1,
    icon: "🛞",
    name: "4× Mecanum Omnidirectional Wheels",
    pin: "MegaPi Ports 1A, 1B, 2A, 2B (DC Geared Motors)",
    tagPos: { left: "16%", top: "22%" },
    shortDesc: "45° diagonal rollers let the rover drive forward, backward, or slide sideways!",
    kidExplain:
      "Look closely at the wheels—each wheel is rimmed with 9 smaller diagonal rollers angled at 45 degrees! By spinning the 4 wheels in different combinations, the diagonal forces cancel out or add together so the rover can slide straight sideways (strafe) like a crab without turning its body.",
    howItWorks: [
      "Forward (W): All 4 wheels spin forward—diagonal forces cancel out and the rover drives straight ahead.",
      "Strafe Right (D): Front-Left and Rear-Right spin forward while Front-Right and Rear-Left spin backward—pushing the rover purely sideways!",
      "Gentle Boundary Turn: In Auto Mode, left and right wheels spin in opposite directions at speed 40 to pivot smoothly away from the black tape.",
    ],
    firmwareSpec:
      "Motors.cpp: Custom inverted polarity matrix for Port 1 & Port 2 + 60ms PWM dithering (MIN_RUN = 60, LINE_FOLLOW_BASE_SPEED = 70).",
    formula: "v_FL = vy - vx - ω   |   v_FR = vy + vx + ω\nv_RL = vy + vx - ω   |   v_RR = vy - vx + ω",
    funFact:
      "The US Navy invented Mecanum wheels in 1973 so forklifts could move aircraft sideways inside cramped aircraft carrier hangars!",
  },

  linesensors: {
    num: 2,
    icon: "👀",
    name: "Dual IR Line & Finish Sensors",
    pin: "Pin A6 (Left Sensor) & Pin A7 (Right Sensor)",
    tagPos: { left: "50%", top: "8%" },
    shortDesc: "Infrared light beams underneath the nose detect the white road vs. black boundary.",
    kidExplain:
      "Mounted under the front bumper are two Infrared (IR) light sensors—like a pair of eyes looking straight down at the track. Each sensor shines invisible IR light onto the floor and measures how much bounces back: the white track reflects light (Logic 1 = Safe), while black tape absorbs it (Logic 0 = Boundary).",
    howItWorks: [
      "Both White (A6=1, A7=1): Safe road! Rover cruises forward with cyan headlights.",
      "One Hits Black (A6=0 or A7=0): Edge of the road! Rover stops and rotates away with an amber turn signal until both sensors see white again.",
      "Both Hit Black After Charging (A6=0 & A7=0): That's the Finish Line! Rover drives 180ms forward to clear the black tape onto the white road, stops, and launches its 7-second rainbow celebration!",
    ],
    firmwareSpec:
      "LineSensor.cpp: Digital active-LOW boundary logic (0 = BLACK_LINE_LOGIC, 1 = WHITE) with 100ms clearance settle window.",
    formula: "A6 == 1 && A7 == 1  →  Cruise Forward\nA6 == 0 && A7 == 0 (postCharge)  →  Finish Line!",
    funFact:
      "Why can't your eyes see the sensor's light? Because Infrared has a wavelength around 940 nanometers—just beyond red in the visible rainbow!",
  },

  frontir: {
    num: 3,
    icon: "🛡️",
    name: "Front IR Barrier & Station Sensor",
    pin: "Pin A15 / Digital 69 (Analog ADC Threshold < 350)",
    tagPos: { left: "83%", top: "16%" },
    shortDesc: "Detects closed Gate 1 & Gate 2 barriers to stop the rover safely in the charging bay.",
    kidExplain:
      "Right on the front nose is a forward-looking Infrared proximity sensor. When the rover approaches a closed gate barrier, the barrier reflects IR light back into the receiver, causing the voltage reading (ADC) to drop below 350 and triggering an instant, touch-free stop!",
    howItWorks: [
      "At Gate 1: Detects the closed entry arm and pauses (flashing red) while the ESP32 traffic light counts down Red → Yellow → Green.",
      "Inside the Charging Station (Gate 2): Closed Gate 2 stops the rover right inside the Supercharger bay and switches the LEDs to Flashing Cyan (Ready to Charge)!",
      "Auto-Resume: Once you charge the battery to 100% and Gate 2 opens, the sensor sees a clear path, waits 2.0 seconds, and races to the Finish Line!",
    ],
    firmwareSpec:
      "BarrierSensor.cpp: analogRead(A15) < 350 (OBSTACLE_THRESHOLD). Holds 2000ms (OBSTACLE_CLEAR_DELAY_MS) after barrier opens.",
    formula: "analogRead(A15) < 350  →  Obstacle Detected (Halt Motors)",
    funFact:
      "Because it uses an analog-to-digital converter (0 to 1023), the MegaPi can measure continuous reflection intensity in less than 0.1 milliseconds!",
  },

  rgbleds: {
    num: 4,
    icon: "🌈",
    name: "Dual 4-LED WS2812B RGB Pods",
    pin: "Pin 66 / A12 (Left Pod) & Pin 65 / A11 (Right Pod)",
    tagPos: { left: "15%", top: "54%" },
    shortDesc: "8 addressable smart RGB LEDs that communicate the rover's exact brain state.",
    kidExplain:
      "Mounted on the left and right fenders are two light bars, each containing 4 individually addressable WS2812B RGB LEDs. Every single LED has its own tiny microchip inside that mixes Red, Green, and Blue light (0–255 each) to create 16.7 million possible colors!",
    howItWorks: [
      "Charging Station States: Flashing Cyan = Ready to Charge · Flashing Green = Charging (10s) · Solid Green = 100% Charged · Flashing Red = Overheated/Too Slow.",
      "7-Second Finish Celebration: Each of the 4 LEDs in the bar shifts its rainbow hue by 90° (`baseHue + idx * 90`), creating a fast chasing rainbow wave across individual LEDs!",
      "Standby Aura: After the 7s celebration finishes, all 8 LEDs breathe together in a calm, slow uniform rainbow cycle while waiting for the next student.",
    ],
    firmwareSpec:
      "LEDs.cpp: Uses shadow registers (curL_R/G/B) to prevent interrupt locking on the 800 kHz single-wire NeoPixel bus.",
    formula: "Chasing Rainbow: Hue(LED_i) = (millis()/2 + i × 90°) mod 360°\nStandby Cycle:   Hue(All)   = (millis()/15) mod 360°",
    funFact:
      "Shadow registers in LEDs.cpp make sure the microcontroller only sends data when a color actually changes—keeping motor and serial interrupts lightning fast!",
  },

  megapi: {
    num: 5,
    icon: "🧠",
    name: "Makeblock MegaPi Brain (ATmega2560)",
    pin: "16 MHz AVR Microcontroller · 256 KB Flash · 8 KB SRAM",
    tagPos: { left: "85%", top: "48%" },
    shortDesc: "The central computer running the non-blocking state machine thousands of times per second.",
    kidExplain:
      "At the center of the chassis sits the red Makeblock MegaPi mainboard, powered by an ATmega2560 microcontroller. Instead of doing one thing at a time and freezing (`delay()`), its brain runs a non-blocking state machine loop that checks all sensors, motors, Bluetooth commands, and LED animations thousands of times every second!",
    howItWorks: [
      "Mode 1 (Autonomous Line Follower): Handles the 5s alignment countdown, boundary patrol, charging station holds, and finish-line clearance.",
      "Mode 2 (Manual Control + Safety Interlocks): Lets the table host drive with WASD while automatically stopping if a sensor trips.",
      "Memory Guard (`F()` Macro): All text strings are locked into Program Flash so the 8 KB RAM never fragments during a 3-hour STEM Night!",
    ],
    firmwareSpec:
      "mbot_mega_firmware.ino: Multiplexed non-blocking state router switching cleanly between MODE_LINE_FOLLOWER and MODE_MANUAL.",
    formula: "loop() frequency ≈ 2,500 Hz (0.4 ms per full sensor + motor + LED update)",
    funFact:
      "The ATmega2560 has 54 digital input/output pins and 16 analog inputs—enough to control a 3D printer or a full autonomous rover!",
  },

  ble: {
    num: 6,
    icon: "📶",
    name: "Web Bluetooth (BLE) Wireless Module",
    pin: "Hardware UART Serial3 @ 115200 Baud (Service 0000ffe1)",
    tagPos: { left: "83%", top: "78%" },
    shortDesc: "Streams instant single-byte commands and finish-line telemetry over 2.4 GHz Bluetooth.",
    kidExplain:
      "Plugged into hardware port Serial3 is a Bluetooth Low Energy (BLE) radio module. It creates a wireless bridge directly between the web browser and the rover's brain at 115,200 bits per second—so pressing Start or driving with WASD happens in just a few milliseconds!",
    howItWorks: [
      "Browser → Rover (TX `0000ffe3`): Sends single-byte commands (`'1'` Auto, `'2'` Manual, `'c'` Cyan, `'g'` Green, `'v'` Charged, `'f'` Fail, `' '` Halt).",
      "Rover → Browser (RX `0000ffe2`): Sends compact event tags (`[EVT:LAUNCH]`, `[EVT:OBS_STOP]`, `[EVT:FINISH]`, `[EVT:STANDBY_READY]`).",
      "Zero Loopback Bug: Verbose human menus go only to USB Serial, keeping the wireless Serial3 channel clean and lag-free.",
    ],
    firmwareSpec:
      "GATT Primary Service: 0000ffe1-0000-1000-8000-00805f9b34fb | Baud: 115200 bps.",
    formula: "1 Byte Command @ 115,200 bps ≈ 0.087 ms air-serial transmission time",
    funFact:
      "Web Bluetooth lets Chrome talk directly to hardware GATT characteristics without installing any native drivers or apps!",
  },

  bumpers: {
    num: 7,
    icon: "🚨",
    name: "Dual Rear Mechanical Collision Bumpers",
    pin: "Pin A9 / 63 (Rear Left) & Pin A10 / 64 (Rear Right)",
    tagPos: { left: "22%", top: "84%" },
    shortDesc: "Spring-loaded microswitches that protect the rover when backing up.",
    kidExplain:
      "Attached to the back corners of the rover are two tactile snap-action limit switches with metal lever arms. If the rover ever backs into an obstacle while reversing, the metal lever clicks the switch closed, connecting the pin to Ground (`LOW`) and cutting reverse motor power immediately!",
    howItWorks: [
      "Internal Pull-Up (`INPUT_PULLUP`): Normally held at 5V (`HIGH`) inside the chip; pressing either bumper pulls the signal to 0V (`LOW`).",
      "Directional Lockout: Halts backward motion and flashes red hazard lights, while still allowing forward motion to drive safely away.",
    ],
    firmwareSpec:
      "CollisionSensor.cpp: digitalRead(A9) == LOW || digitalRead(A10) == LOW.",
    formula: "Rear_Hit = (Pin_A9 == 0) OR (Pin_A10 == 0)  →  Block Reverse Motion",
    funFact:
      "Mechanical microswitches use a 'snap-action' spring inside so the electrical contact closes cleanly in less than 1 millisecond!",
  },
};

window.SCIENCE_POPUPS = {
  ultrasonic: {
    icon: "📡",
    badge: "ESP32 + HC-SR04 Echolocation",
    title: "How Gate 1 Uses Sound Waves to Detect the Rover",
    lead:
      "Just like bats and dolphins navigate using echolocation, Gate 1's HC-SR04 Ultrasonic Sensor beams out 40,000 Hz sound pulses (too high-pitched for human ears!) and times how long the echo takes to bounce back from the rover.",
    steps: [
      "Every 0.1 seconds, the ESP32 fires a 10-microsecond ultrasonic ping from the TRIG pin (GPIO 13) and listens on ECHO (GPIO 12).",
      "When the rover approaches within 5 cm, the gate logs +1 to the Car Counter and starts the 3-stage traffic light & chime sequence: Red (1s, 440 Hz) → Yellow (1s, double 880 Hz) → Green (1s, rising chord + opens Gate 1).",
      "Gate 1's debounce lockout automatically resets as soon as the rover crosses the Finish Line—so the next student can launch right away!",
    ],
    formula: "Distance (cm) = (Echo Time in μs × 0.0343 cm/μs) ÷ 2",
    fact:
      "Why divide by 2? Because the sound wave has to travel from the sensor to the rover AND all the way back!",
  },

  battery: {
    icon: "🔋",
    badge: "Electrochemistry · 2,300 mAh Li-Ion Cell",
    title: "Inside an EV Battery: SOC, Voltage & Current",
    lead:
      "Think of an electric car battery like a rechargeable water tank for electrons and Lithium ions (Li+). Its total size is 2,300 milliAmp-hours (mAh), and our rover arrives at the station with 20% left in the tank.",
    steps: [
      "Charge Needed (mAh): To fill the battery from 20% to 100%, we need to add 80% of 2,300 mAh = 1,840 mAh of charge.",
      "Current (mA) Controls Speed: Current is how fast we pump charge into the cell. Higher current (mA) finishes in fewer minutes!",
      "Open-Circuit Voltage (OCV): Our Python physics engine looks up the real laboratory voltage curve from SOC-OCV.xlsx (rising from 3.25 V at 20% up to 3.60 V at 100%).",
    ],
    formula: "Current (mA) = Charge Needed (mAh) ÷ Time (Hours)\nExample: 1,840 mAh ÷ 0.5 hr (30 min) = 3,680 mA",
    fact:
      "When charging, Terminal Voltage (Vt) is slightly higher than Open-Circuit Voltage (Vocv) because of the battery's internal resistance: Vt = Vocv + I × Rs!",
  },

  thermal: {
    icon: "🌡️",
    badge: "Coupled 3-Node Electro-Thermal Physics",
    title: "Why Fast-Charging Too Hard Makes Batteries Overheat",
    lead:
      "Every battery has a tiny internal resistance to electricity (Rs = 0.05 Ω). Pushing current through that resistance generates Joule heat inside the core—and that heat grows with the SQUARE of the current!",
    steps: [
      "The Square Law (Q = I² × Rs): Doubling the charging current doesn't just double the heat—it creates FOUR TIMES as much heat per second!",
      "Three Coupled Temperatures: The Python model solves differential equations for Core Temp (T1), Surface Temp (T2), and Coolant Temp (T∞).",
      "The Safe Fast-Charge Window: Pick a current high enough to finish before the clock runs out, but low enough that Core Temp T1 stays under 61.9°C (335 K)!",
    ],
    formula:
      "Q = Rs·I² - dOCV·I·T1\ndT1/dt = -(T1 - T2)/(R1·C1) + Q/C1\ndT2/dt = -(T2 - T1)/(R1·C2) - (T2 - T∞)/(R2·C2)",
    fact:
      "Real EV Superchargers pre-chill liquid coolant around the battery pack so heat flows out from the core (T1 → T2 → T∞) faster!",
  },
};

// ============================================================================
// ROVER ANATOMY EXPLORER CONTROLLER (2-LEVEL INTERACTIVE MODAL)
// ============================================================================
let _explorerActivePart = null;
let _explorerAnimFrame = null;
let _demoState = {
  mecanumCmd: "w",     // w, s, a, d, cw
  linePos: 0.0,        // -1 (left black) .. 0 (white) .. +1 (right black) .. 2 (finish line both black)
  barrierDistCm: 12.0, // 2..20 cm
  ledMode: "rainbow",  // countdown, cyan, green, solid, red, rainbow, standby
  bumperLeft: false,
  bumperRight: false,
};

window.openRoverExplorer = function (initialPartKey = null) {
  const modal = document.getElementById("roverExplorerModal");
  if (!modal) return;
  modal.classList.add("open");
  renderRoverDiagramTags();
  selectRoverPart(initialPartKey);
  startExplorerDemoLoop();
};

window.closeRoverExplorer = function () {
  const modal = document.getElementById("roverExplorerModal");
  if (modal) modal.classList.remove("open");
  if (_explorerAnimFrame) {
    cancelAnimationFrame(_explorerAnimFrame);
    _explorerAnimFrame = null;
  }
};

window.openStemPopup = function (topicKey) {
  if (topicKey === "rover") {
    window.openRoverExplorer(null);
    return;
  }
  const t = window.SCIENCE_POPUPS[topicKey];
  if (!t) return;
  const modal = document.getElementById("stemLearnModal");
  const body = document.getElementById("stemLearnModalBody");
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="sci-head">
      <div class="sci-ico">${t.icon}</div>
      <div>
        <div class="eyebrow">${t.badge}</div>
        <h2>${t.title}</h2>
      </div>
    </div>
    <p class="sci-lead">${t.lead}</p>
    <ol class="sci-steps">
      ${t.steps.map((s, idx) => `<li><span>${idx + 1}</span><div>${s}</div></li>`).join("")}
    </ol>
    <div class="eyebrow" style="margin-bottom:6px;">Key Formula</div>
    <pre class="formula" style="margin:0 0 16px 0; white-space:pre-wrap;">${t.formula}</pre>
    <div class="sci-fact"><b>💡 Did you know?</b> ${t.fact}</div>
  `;
  modal.classList.add("open");
};

window.closeStemPopup = function () {
  document.getElementById("stemLearnModal")?.classList.remove("open");
};

function renderRoverDiagramTags() {
  const container = document.getElementById("exDiagramTags");
  if (!container) return;
  container.innerHTML = Object.entries(window.MBOT_PARTS)
    .map(
      ([key, p]) => `
      <button
        type="button"
        class="ex-tag"
        id="exTag_${key}"
        style="left:${p.tagPos.left}; top:${p.tagPos.top};"
        onclick="selectRoverPart('${key}')"
      >
        <span class="n">${p.num}</span>${p.icon} ${p.name.replace("4× ", "").replace("Dual ", "")}
      </button>
    `
    )
    .join("");
}

window.selectRoverPart = function (partKey) {
  _explorerActivePart = partKey;
  const svgBox = document.getElementById("exSvgBox");
  if (svgBox) {
    svgBox.classList.toggle("has-active", !!partKey);
    svgBox.querySelectorAll(".part").forEach((el) => {
      el.classList.toggle("active", el.dataset.part === partKey);
    });
    svgBox.querySelectorAll(".leader").forEach((el) => {
      el.classList.toggle("active", el.dataset.part === partKey);
    });
  }
  Object.keys(window.MBOT_PARTS).forEach((k) => {
    document.getElementById(`exTag_${k}`)?.classList.toggle("active", k === partKey);
  });

  const detailPane = document.getElementById("exDetailPane");
  if (!detailPane) return;

  // Level 1 Overview (when no specific part is selected yet, or user clicks "All Parts")
  if (!partKey || !window.MBOT_PARTS[partKey]) {
    const cardsHtml = Object.entries(window.MBOT_PARTS)
      .map(
        ([k, p]) => `
        <button type="button" class="ex-part-btn" onclick="selectRoverPart('${k}')">
          <div class="pi">${p.icon}</div>
          <div>
            <div>${p.num}. ${p.name}</div>
            <small>${p.shortDesc}</small>
          </div>
        </button>
      `
      )
      .join("");

    detailPane.innerHTML = `
      <div>
        <div class="eyebrow">Interactive Anatomy · 7 Subsystems</div>
        <h3>Tap Any Part on the mBot Mega</h3>
      </div>
      <p class="lead">
        Click any glowing component on the rover diagram—or choose a part below—to test how it works in an interactive simulator and see its real engineering specs.
      </p>
      <div class="ex-parts-grid">${cardsHtml}</div>
      <div class="ex-fact">
        <b>🤖 Built for Autonomy & Zero-Latency Control:</b> Every sensor and motor shown here is running live on the physical Makeblock mBot Mega rover on our circular track!
      </div>
    `;
    return;
  }

  // Level 2 Individual Part Deep-Dive + Interactive Simulator
  const keys = Object.keys(window.MBOT_PARTS);
  const idx = keys.indexOf(partKey);
  const prevKey = keys[(idx - 1 + keys.length) % keys.length];
  const nextKey = keys[(idx + 1) % keys.length];
  const p = window.MBOT_PARTS[partKey];

  detailPane.innerHTML = `
    <div class="row-between">
      <div>
        <div class="eyebrow">Part ${p.num} of ${keys.length} · ${p.pin}</div>
        <h3>${p.icon} ${p.name}</h3>
      </div>
      <button type="button" class="icon-btn" onclick="selectRoverPart(null)">← All Parts</button>
    </div>

    <p class="lead">${p.kidExplain}</p>

    <!-- Interactive Live Mini-Simulator for this specific part -->
    <div class="ex-demo">
      <canvas id="exDemoCanvas" width="520" height="190"></canvas>
      <div class="ex-demo-controls" id="exDemoControls">
        ${getControlsHtmlForPart(partKey)}
      </div>
    </div>

    <div class="ex-info">
      <div>
        <h4>How It Works on the Track</h4>
        <ul>
          ${p.howItWorks.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </div>
      <div>
        <h4>Engineering & Firmware</h4>
        <p style="margin-bottom:8px;">${p.firmwareSpec}</p>
        <code>${p.formula.replace(/\n/g, "<br/>")}</code>
      </div>
    </div>

    <div class="ex-fact"><b>💡 Fun STEM Fact:</b> ${p.funFact}</div>

    <div class="ex-nav">
      <button type="button" class="btn btn-ghost" onclick="selectRoverPart('${prevKey}')">
        ← ${window.MBOT_PARTS[prevKey].icon} Prev Part
      </button>
      <button type="button" class="btn btn-primary" onclick="selectRoverPart('${nextKey}')">
        Next: ${window.MBOT_PARTS[nextKey].icon} ${window.MBOT_PARTS[nextKey].name.split(" ")[1]} →
      </button>
    </div>
  `;
};

function getControlsHtmlForPart(partKey) {
  if (partKey === "mecanum") {
    const cmds = [
      ["w", "↑ Forward (W)"],
      ["s", "↓ Reverse (S)"],
      ["a", "← Strafe Left (A)"],
      ["d", "→ Strafe Right (D)"],
      ["cw", "↻ Rotate (Boundary Turn)"],
    ];
    return cmds
      .map(
        ([c, lbl]) =>
          `<button type="button" class="${_demoState.mecanumCmd === c ? "active" : ""}" onclick="setExplorerDemo('mecanumCmd','${c}')">${lbl}</button>`
      )
      .join("");
  }
  if (partKey === "linesensors") {
    return `
      <button type="button" onclick="setExplorerDemo('linePos', 0)">White Road (1, 1)</button>
      <button type="button" onclick="setExplorerDemo('linePos', -1)">Left Hits Black (0, 1)</button>
      <button type="button" onclick="setExplorerDemo('linePos', 1)">Right Hits Black (1, 0)</button>
      <button type="button" onclick="setExplorerDemo('linePos', 2)">🏁 Finish Line (0, 0)</button>
    `;
  }
  if (partKey === "frontir") {
    return `
      <label>Gate Barrier Distance:</label>
      <input type="range" min="2" max="18" step="0.5" value="${_demoState.barrierDistCm}" oninput="setExplorerDemo('barrierDistCm', parseFloat(this.value))" />
      <button type="button" onclick="setExplorerDemo('barrierDistCm', 3.5)">Close Gate (Stop!)</button>
      <button type="button" onclick="setExplorerDemo('barrierDistCm', 15)">Open Gate (Clear)</button>
    `;
  }
  if (partKey === "rgbleds") {
    const modes = [
      ["countdown", "🟢 5s Countdown"],
      ["cyan", "🩵 Ready (Cyan)"],
      ["green", "💚 Charging"],
      ["solid", "✅ 100% Solid"],
      ["rainbow", "🌈 7s Chasing Rainbow"],
      ["standby", "✨ Standby Cycle"],
    ];
    return modes
      .map(
        ([m, lbl]) =>
          `<button type="button" class="${_demoState.ledMode === m ? "active" : ""}" onclick="setExplorerDemo('ledMode','${m}')">${lbl}</button>`
      )
      .join("");
  }
  if (partKey === "bumpers") {
    return `
      <button type="button" onclick="setExplorerDemo('bumperLeft', !_demoState.bumperLeft)">Toggle Rear-Left Bumper (A9)</button>
      <button type="button" onclick="setExplorerDemo('bumperRight', !_demoState.bumperRight)">Toggle Rear-Right Bumper (A10)</button>
    `;
  }
  return `<span style="font-size:12px; color:#8c95b5;">Live interactive telemetry visualization active</span>`;
}

window.setExplorerDemo = function (key, val) {
  _demoState[key] = val;
  const ctrl = document.getElementById("exDemoControls");
  if (ctrl && _explorerActivePart) {
    ctrl.innerHTML = getControlsHtmlForPart(_explorerActivePart);
  }
};

function startExplorerDemoLoop() {
  if (_explorerAnimFrame) cancelAnimationFrame(_explorerAnimFrame);
  const tick = (now) => {
    drawExplorerPartDemo(now);
    _explorerAnimFrame = requestAnimationFrame(tick);
  };
  _explorerAnimFrame = requestAnimationFrame(tick);
}

function drawExplorerPartDemo(now) {
  const canvas = document.getElementById("exDemoCanvas");
  if (!canvas || !_explorerActivePart) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (rect.width > 0 && canvas.width !== Math.floor(rect.width * dpr)) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = rect.width || 520;
  const h = rect.height || 190;
  ctx.clearRect(0, 0, w, h);

  const part = _explorerActivePart;

  if (part === "mecanum") {
    const cmd = _demoState.mecanumCmd;
    const cx = w * 0.5;
    const cy = h * 0.52;
    // Draw rover body & 4 wheels with individual spin direction arrows
    ctx.fillStyle = "#172040";
    ctx.strokeStyle = "#5b8cff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - 55, cy - 36, 110, 72, 14);
    ctx.fill();
    ctx.stroke();

    const wheelDirs = {
      w: [1, 1, 1, 1],
      s: [-1, -1, -1, -1],
      a: [-1, 1, 1, -1],
      d: [1, -1, -1, 1],
      cw: [1, -1, 1, -1],
    }[cmd] || [1, 1, 1, 1];

    const wheelCoords = [
      [cx - 72, cy - 32, "FL", wheelDirs[0]],
      [cx + 56, cy - 32, "FR", wheelDirs[1]],
      [cx - 72, cy + 6, "RL", wheelDirs[2]],
      [cx + 56, cy + 6, "RR", wheelDirs[3]],
    ];

    wheelCoords.forEach(([wx, wy, lbl, dir]) => {
      ctx.fillStyle = "#0a0f1e";
      ctx.strokeStyle = dir > 0 ? "#34d399" : "#ffb547";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(wx, wy, 16, 26, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = dir > 0 ? "#34d399" : "#ffb547";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(dir > 0 ? "▲" : "▼", wx + 8, wy + 17);
      ctx.fillStyle = "#8c95b5";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(lbl, wx + 8, wy - 5);
    });

    // Overall motion vector arrow
    ctx.fillStyle = "#eef1f8";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    const labels = {
      w: "Net Force: ↑ Pure Forward Drive",
      s: "Net Force: ↓ Pure Reverse Drive",
      a: "Net Force: ← Pure Sideways Strafe Left",
      d: "Net Force: → Pure Sideways Strafe Right",
      cw: "Net Force: ↻ In-Place Boundary Rotation",
    };
    ctx.fillText(labels[cmd], cx, 24);
  } else if (part === "linesensors") {
    const mode = _demoState.linePos;
    const cy = h * 0.55;
    // White track bar + black edges
    ctx.fillStyle = "#050811";
    ctx.fillRect(40, cy + 20, w - 80, 26);
    ctx.fillStyle = "#eef1f8";
    if (mode !== 2) {
      ctx.fillRect(110, cy + 20, w - 220, 26);
    }

    const roverX =
      mode === -1 ? 115 : mode === 1 ? w - 115 : w * 0.5;
    const lBlack = mode === -1 || mode === 2;
    const rBlack = mode === 1 || mode === 2;

    // Sensor housing
    ctx.fillStyle = "#172040";
    ctx.strokeStyle = "#5b8cff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(roverX - 48, cy - 38, 96, 36, 10);
    ctx.fill();
    ctx.stroke();

    // Left A6 & Right A7 beams
    [
      [roverX - 24, lBlack, "A6 Left"],
      [roverX + 24, rBlack, "A7 Right"],
    ].forEach(([sx, isBlk, name]) => {
      ctx.beginPath();
      ctx.moveTo(sx, cy - 2);
      ctx.lineTo(sx, cy + 20);
      ctx.strokeStyle = isBlk ? "#ff6b6b" : "#34d399";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = isBlk ? "#ff6b6b" : "#34d399";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${name}: ${isBlk ? "0 (BLACK)" : "1 (WHITE)"}`, sx, cy - 46);
    });

    ctx.fillStyle = "#eef1f8";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    const statusTxt =
      mode === 2
        ? "🏁 BOTH SENSORS HIT BLACK (0 & 0) → Clear Line & 7s Rainbow!"
        : mode === 0
        ? "🩵 Both Sensors on White (1 & 1) → Cruise Forward"
        : mode === -1
        ? "🟠 Left Sensor Hit Black (0 & 1) → Rotate Right Away!"
        : "🟠 Right Sensor Hit Black (1 & 0) → Rotate Left Away!";
    ctx.fillText(statusTxt, w * 0.5, h - 14);
  } else if (part === "frontir") {
    const dist = _demoState.barrierDistCm;
    const adc = Math.round(Math.min(980, dist * 58));
    const tripped = adc < 350;

    const rovX = 90;
    const cy = h * 0.55;
    const gateX = rovX + 50 + (dist / 18) * (w - 220);

    // Rover nose
    ctx.fillStyle = "#172040";
    ctx.strokeStyle = tripped ? "#ff6b6b" : "#5b8cff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rovX - 40, cy - 26, 80, 52, 10);
    ctx.fill();
    ctx.stroke();

    // IR Waves
    ctx.strokeStyle = tripped ? "#ff6b6b" : "#34d399";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(rovX + 42, cy);
    ctx.lineTo(gateX, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gate Barrier
    ctx.fillStyle = tripped ? "#ff6b6b" : "#34d399";
    ctx.beginPath();
    ctx.roundRect(gateX, cy - 38, 12, 76, 4);
    ctx.fill();

    ctx.fillStyle = "#eef1f8";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `A15 Raw ADC: ${adc} (Threshold < 350)  →  ${tripped ? "🛑 BARRIER DETECTED (STOP!)" : "✅ PATH CLEAR"}`,
      w * 0.5,
      28
    );
  } else if (part === "rgbleds") {
    const m = _demoState.ledMode;
    const cy = h * 0.55;
    const getColors = () => {
      if (m === "rainbow") {
        const base = (now / 2) % 360;
        return [0, 1, 2, 3].map((i) => `hsl(${(base + i * 90) % 360}, 100%, 58%)`);
      }
      if (m === "standby") {
        const c = `hsl(${(now / 15) % 360}, 90%, 55%)`;
        return [c, c, c, c];
      }
      if (m === "countdown") {
        const c = Math.floor(now / 250) % 2 === 0 ? "#34d399" : "#122320";
        return [c, c, c, c];
      }
      if (m === "cyan") {
        const c = Math.floor(now / 220) % 2 === 0 ? "#38bdf8" : "#112233";
        return [c, c, c, c];
      }
      if (m === "green") {
        const c = Math.floor(now / 200) % 2 === 0 ? "#34d399" : "#122320";
        return [c, c, c, c];
      }
      return ["#34d399", "#34d399", "#34d399", "#34d399"];
    };
    const cols = getColors();

    // Draw Left & Right 4-LED WS2812B Modules
    [
      [w * 0.28, "Left Pod (Pin 66 / A12)"],
      [w * 0.72, "Right Pod (Pin 65 / A11)"],
    ].forEach(([px, title]) => {
      ctx.fillStyle = "#0d1326";
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px - 86, cy - 24, 172, 48, 12);
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const lx = px - 57 + i * 38;
        ctx.save();
        ctx.beginPath();
        ctx.arc(lx, cy, 11, 0, Math.PI * 2);
        ctx.fillStyle = cols[i];
        ctx.shadowColor = cols[i];
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = "#8c95b5";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, px, cy + 44);
    });
  } else {
    // MegaPi / BLE / Bumpers live signal wave
    ctx.fillStyle = "#eef1f8";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    if (part === "bumpers") {
      const lHit = _demoState.bumperLeft;
      const rHit = _demoState.bumperRight;
      ctx.fillText(
        `Rear-Left (A9): ${lHit ? "0 (PRESSED!)" : "1 (CLEAR)"}   |   Rear-Right (A10): ${rHit ? "0 (PRESSED!)" : "1 (CLEAR)"}`,
        w * 0.5,
        h * 0.45
      );
      ctx.fillStyle = lHit || rHit ? "#ff6b6b" : "#34d399";
      ctx.fillText(
        lHit || rHit ? "🚨 COLLISION INTERLOCK TRIPPED — Reverse Halted!" : "✅ Bumpers Clear — Reverse Allowed",
        w * 0.5,
        h * 0.68
      );
    } else {
      ctx.fillText("⚡ ATmega2560 Non-Blocking Loop & Serial3 BLE @ 115,200 bps", w * 0.5, h * 0.35);
      // Animated pulse train
      ctx.strokeStyle = "#5b8cff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const offset = Math.floor(now / 30);
      for (let x = 40; x < w - 40; x += 4) {
        const bit = Math.sin((x + offset) * 0.12) > 0 ? -18 : 18;
        if (x === 40) ctx.moveTo(x, h * 0.65 + bit);
        else ctx.lineTo(x, h * 0.65 + bit);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}
