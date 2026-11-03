# AI Agent Handoff Specification: Unified mBot Mega & ESP32 Gate Control Dashboard

## 1. Executive Summary & Mission

You are inheriting a production-ready, dual-hardware robotics and automated infrastructure system. Extensive engineering effort has been invested in designing, debugging, and stabilizing two separate C++/Arduino modular firmwares:

1. **mBot Mega Rover Firmware (ATmega2560 / Makeblock MegaPi):** A multi-mode omnidirectional Mecanum rover with full safety interlocks, autonomous boundary-line following, custom LED state-machine feedback, and zero-latency **Web Bluetooth (BLE)** teleoperation.
2. **ESP32 Automated Dual-Barrier Gate Firmware (ESP32 DevKit V1):** A standalone smart toll/entry gate featuring ultrasonic vehicle detection, a 30-second car-counting debounce lockout, synchronized traffic LED banks, a non-blocking hardware-timed acoustic chime engine, dual RC servo barriers, and a **Wi-Fi SoftAP + WebSocket Server** (`ws://192.168.4.1:81`).

**Your Objective:** Design and build a unified, modern, dynamic, and interactive **Master Web Cockpit Dashboard** that connects simultaneously to the **mBot Mega via Web Bluetooth API** and the **ESP32 Gate Controller via WebSockets**, combining both control surfaces and telemetry streams into a single cohesive command center.

---

## 2. System 1: mBot Mega Firmware Architecture (Makeblock MegaPi)

### Modular Codebase Structure

The firmware was refactored to eliminate Makeblock library linker collisions (`MeMegaPi.h` is strictly isolated inside `Motors.cpp`), prevent AVR 8 KB SRAM heap fragmentation (all static strings are locked into Program Flash via `F()`), and prevent hardware UART loopback re-triggering on `Serial3`:

* `mbot_mega_firmware.ino`: Master state machine, multiplexed input router (`Serial` USB + `Serial3` BLE at `115200` baud), and mode switcher.
* `Config.h`: Pin mappings, speed thresholds, timing constants, and global enums (`OperationalMode`, `RobotState`, `LineEscapeDirection`).
* `Motors.h / .cpp`: Custom Mecanum kinematic matrix (calibrated specifically for the mBot Mega's inverted gearbox polarity on Port 1 & Port 2) + low-speed PWM dithering.
* `LEDs.h / .cpp`: Dual 4-LED WS2812B RGB pods (Right on Pin `65/A11`, Left on Pin `66/A12`) using shadow registers to prevent interrupt locking and bus contention.
* `LineSensor.h / .cpp`: Dual digital boundary sensors on `A6` (Left) and `A7` (Right) where `0 (LOW)` = Black Tape Boundary and `1 (HIGH)` = Safe White Track.
* `BarrierSensor.h / .cpp`: Front center IR obstacle sensor on `A15 (Pin 69)` (Active-LOW, threshold `< 350` ADC).
* `CollisionSensor.h / .cpp`: Dual rear mechanical limit bumpers on `A9 (Pin 63)` and `A10 (Pin 64)` (Active-LOW with `INPUT_PULLUP`).
* `manual_mode.h / .cpp`: Omnidirectional teleop engine, 1.0-second directional boundary escape window, edge-triggered safety alerts, and individual/master tabletop safety overrides.
* `line_follower_mode.h / .cpp`: 3-step autonomous boundary patrol state machine.

### Operational Modes & Behaviors

1. **Mode 2: Manual Control Mode (Default on Boot)**
* **Omnidirectional Drive:** Pure Mecanum translation (`W` Forward, `S` Reverse, `A` Strafe Left, `D` Strafe Right, `Space`/`X` Halt). Fixed rotations (`Q`/`E`) were removed for clean translation control.
* **Speed Scaling:** Adjustable between `60` (`MIN_RUN`) and `200` (`MAX_SPEED`), defaulting to `100`.
* **Hardware Safety Interlocks:** Automatically halts motion if the black boundary line, front IR barrier, or rear bumpers are tripped, locking out further movement in the offending direction until cleared or escaped via a 1.0s opposite-direction window.
* **Tabletop Mode Overrides:** Operators can mute individual sensors (`8` Boundary, `9` Front Barrier, `B` Rear Bumpers) or toggle Master Tabletop Mode (`T`) to mute/unmute all interlocks simultaneously.


2. **Mode 1: Autonomous Boundary Line Follower**
* **Alignment & Countdown:** Verifies rover is placed on the safe white track (`A6 == 1 && A7 == 1`). If on black, flashes red hazard alert. Once aligned on white, executes a 5-second flashing green arming countdown.
* **3-Step Boundary Logic:** Cruises forward at speed `65` with solid cyan LEDs. Upon hitting the black tape boundary, immediately cuts forward motion, executes a non-dithered gentle in-place rotation at speed `40` away from the triggered side with dedicated amber turn signals until both sensors clear for `100ms`, then smoothly resumes forward cyan patrol.
* **Obstacle Pause:** If the front barrier or rear bumper triggers during auto patrol, the rover emergency-stops (flashing red). Once cleared, it holds in amber standby for `2.0s` before automatically resuming patrol.



### LED Lighting Specification

* **Hazard / Sensor Trip Alert:** Synchronized rapid flashing Red (`150ms` cadence) on both pods.
* **Auto Alignment Countdown:** Synchronized flashing Green (`250ms` cadence) for 5 seconds.
* **Forward Cruising:** Solid White in Manual Mode; Solid Cyan in Autonomous Mode.
* **Reverse:** Solid Red on both pods.
* **Strafing (Manual) / Turning (Auto):** Dedicated flashing Amber (`350ms` cadence) on the active side pod while the opposite pod is completely OFF (zero cyan/white bleed).
* **Standby Idle:** Holds mode color for `3.0s`, then transitions into a smooth HSV rainbow aura cycle.

### Wireless Protocol: Web Bluetooth API (GATT over UART `Serial3`)

* **Baud Rate:** `115200`
* **Primary UART Service UUID:** `0000ffe1-0000-1000-8000-00805f9b34fb`
* **RX Notify Characteristic (MegaPi -> Browser):** `0000ffe2-0000-1000-8000-00805f9b34fb` (Verbose Serial debug logs are routed only to USB `Serial` to prevent BLE module hardware loopback bugs; explicit data/clean telemetry can use `Serial3`).
* **TX Write Characteristic (Browser -> MegaPi):** `0000ffe3-0000-1000-8000-00805f9b34fb` (Single-byte UTF-8 ASCII characters via `writeValueWithoutResponse` or `writeValue`).

| Single-Byte Command | Function | Context |
| --- | --- | --- |
| **`1`** | Switch to **Mode 1** (Autonomous Line Follower) | Global |
| **`2`** | Switch to **Mode 2** (Manual Control Mode) | Global |
| **`w` / `s**` | Drive Forward / Backward | Manual Mode |
| **`a` / `d**` | Strafe Left / Strafe Right | Manual Mode |
| **` ` (Space) / `x**` | Immediate Halt / Standby (Pauses Auto in Mode 1) | Global |
| **`u` / `j` / `k**` | Speed Up (`+10`) / Speed Down (`-10`) / Reset Speed (`100`) | Manual Mode |
| **`8`** | Toggle Boundary Line Sensor Safety | Manual Mode |
| **`9`** | Toggle Front Barrier Sensor Safety | Manual Mode |
| **`b`** | Toggle Rear Bumper Sensor Safety | Manual Mode |
| **`t`** | Toggle Master Tabletop Mode (Mute/Unmute All Sensors) | Manual Mode |
| **`l`** | Request Live Line Sensor Raw Readout | Manual Mode |

---

## 3. System 2: ESP32 Dual-Barrier Gate Firmware Architecture

### Modular Codebase Structure

All hardware pins are strictly consolidated on the **VIN-side header rail** of the 30-pin ESP32 DevKit V1 (SILABS CP2102 bridge):

* `esp32_gate_firmware.ino`: Master non-blocking state machine and vehicle counter.
* `Config.h`: VIN-side GPIO definitions, timing constants, SoftAP credentials, and `GateSequenceState` enum.
* `Ultrasonic.h / .cpp`: HC-SR04 driver (`TRIG` on `GPIO 13`, `ECHO` on `GPIO 12` via 5V-to-3.3V resistor divider).
* `LEDs.h / .cpp`: Parallel 3x LED traffic banks (`RED` on `GPIO 26`, `YELLOW` on `GPIO 25`, `GREEN` on `GPIO 33`).
* `Buzzer.h / .cpp`: Universal `tone()` / `noTone()` acoustic engine on `GPIO 32`.
* `GateServos.h / .cpp`: Dual 50Hz hardware-timed PWM servos (`Servo 1` Entry Barrier on `GPIO 14`, `Servo 2` Exit Barrier on `GPIO 27`). Angles are calibrated for inverted spline mounting: **`90°` = Closed (Horizontal)**, **`0°` = Open (Vertical)**.
* `GateWebSocket.h / .cpp`: Wi-Fi SoftAP host (`SSID: "ESP32_Gate_Network"`, `Pass: "gate1234"`, IP: `192.168.4.1`), HTTP server on Port `80`, and WebSocket server on Port `81`.

### Gate Sequence & State Machine (`GateSequenceState`)

1. **`IDLE_STANDBY` (`0`):** Solid Red LEDs, both Gate 1 and Gate 2 locked closed at `90°`, ultrasonic polling every `100ms`.
2. **Vehicle Trigger & 30s Lockout:** When an object enters `<= 5 cm` (`TRIGGER_DISTANCE_CM`), if `30,000ms` (`CAR_LOCKOUT_MS`) has elapsed since the last trigger (or on first boot), `carCount` increments by 1, the 30s lockout timer starts, and the opening sequence begins:
3. **`STAGE_RED` (`1`):** Holds Red LEDs for `1.0s`, emits a `120ms` 440 Hz acoustic cue pulse, Gate 1 remains strictly closed (`90°`).
4. **`STAGE_YELLOW` (`2`):** Switches to Yellow LEDs for `1.0s`, emits a double 880 Hz warning beep, Gate 1 remains strictly closed (`90°`).
5. **`STAGE_GREEN` (`3`):** Switches to Green LEDs for `1.0s`, **opens Gate 1 (`0°`)**, and plays a rising two-tone harmonic entry chime (`1318 Hz E6` -> `1760 Hz A6`).
6. **`WAITING_FOR_GATE2` (`4`):** Gate 1 stays open (`0°`) with Green LEDs active, holding indefinitely until the operator clicks the **"Open Gate 2"** button on the Web Dashboard.
7. **`RESETTING_GATES` (`5`):** Upon receiving `"OPEN_GATE2"` over WebSocket, **Gate 2 opens (`0°`)**. A `4.0s` (`RESET_HOLD_MS`) passage timer runs, after which both Gate 1 and Gate 2 automatically close (`90°`) and the system returns to `IDLE_STANDBY` (`0`) with solid Red LEDs.

### Wireless Protocol: WebSockets (`ws://192.168.4.1:81`)

* **Downlink (ESP32 -> Browser Broadcast JSON):**

```json
{
  "carCount": 1,
  "gate1": "OPEN",
  "gate2": "CLOSED",
  "state": 4,
  "log": "Awaiting Gate 2 Command from Dashboard"
}

```

*`state` maps directly to `GateSequenceState` (`0` = Standby, `1` = Red, `2` = Yellow, `3` = Green, `4` = Waiting for Gate 2, `5` = Resetting).*

* **Uplink (Browser -> ESP32 Text Frames):**
* `"OPEN_GATE2"` -> Opens Exit Barrier (Servo 2) and triggers the 4.0s auto-reset timer if in `WAITING_FOR_GATE2`.
* `"CLOSE_GATE2"` -> Manually forces Servo 2 closed (`90°`).



---

## 4. Requirements for the Next AI Agent (Unified Web Dashboard)

Using the uploaded codebase, build a single, responsive, high-contrast **Master Command & Telemetry Web Application** (HTML/CSS/JS or local frontend stack) that integrates both systems:

1. **Dual-Link Connection Header:**
* Independent connection managers and status badges for **mBot Mega BLE** (Web Bluetooth API picker) and **ESP32 Gate Controller** (WebSocket `ws://192.168.4.1:81` with configurable IP input and auto-reconnect).


2. **mBot Mega Teleoperation & Mode Cockpit:**
* Visual **WASD + Spacebar** cross-pad with active key-press highlighting (`keydown` / `keyup` visual feedback, with `e.repeat` filtering).
* Mode selector switches (`[1] Autonomous Line Follower` vs. `[2] Manual Mode`) with visual state indicators.
* Speed control bar (`[J] -10`, `[K] Reset 100`, `[U] +10`) tracking estimated speed locally on the UI (`60` to `200`).
* Safety Interlock Control Matrix (`[8] Boundary`, `[9] Front Barrier`, `[B] Rear Bumpers`, and a prominent `[T] Master Tabletop Mode` button).


3. **ESP32 Gate Control & Live Visualization Panel:**
* **Live Traffic Light Graphic:** Visual Red / Yellow / Green vertical signal housing that illuminates in real time based on the incoming JSON `state` (`0–5`) and `gate1`/`gate2` status.
* **Animated Dual-Barrier Visuals:** Visual representations of **Gate 1 (Entry)** and **Gate 2 (Exit)** showing `OPEN` vs. `CLOSED` states.
* **Vehicle Counter & Lockout Timer:** Large telemetry readout for `carCount`, plus a client-side **30-second countdown progress bar** that triggers whenever `carCount` increments so the operator knows exactly when the ultrasonic sensor lockout expires.
* **Interactive Gate 2 Trigger:** Prominent action buttons for **`OPEN_GATE2`** (pulsing/highlighted when `state === 4` / `WAITING_FOR_GATE2`) and **`CLOSE_GATE2`**.


4. **Unified Event & Telemetry Console:**
* Timestamped, color-coded activity log combining Web Bluetooth TX/RX events and ESP32 WebSocket JSON event logs with a quick-clear action.



---

### Immediate Next Steps for the Receiving Agent

1. Create `dashboard/index.html`, `dashboard/styles.css`, and `dashboard/app.js`.
2. Connect to the ESP32 Wi-Fi AP (`ESP32_Gate_Network` / `gate1234`) on the client machine.
3. Serve the web cockpit over HTTPS or `localhost` (required for Web Bluetooth API security restrictions in Chrome/Edge).
4. Connect Bluetooth to the Makeblock MegaPi BLE module (`0000ffe1` service) and open the WebSocket to `ws://192.168.4.1:81`.