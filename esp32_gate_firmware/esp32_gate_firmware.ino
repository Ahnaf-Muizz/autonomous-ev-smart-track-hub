#include <Arduino.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "Config.h"
#include "Ultrasonic.h"
#include "LEDs.h"
#include "Buzzer.h"
#include "GateServos.h"
#include "GateWebSocket.h"

// System State Variables
GateSequenceState currentState = IDLE_STANDBY;
unsigned int carCount = 0;
unsigned long lastCarLoggedTime = 0;
unsigned long stateTimer = 0;
unsigned long ultrasonicPingTimer = 0;

// Non-blocking Tone Sub-Timer
unsigned long toneTimer = 0;
uint8_t chimeStep = 0;

// Independent Gate Timers (Completely Decoupled)
unsigned long gate1OpenedAt = 0;
bool gate1IsOpen = false;

unsigned long gate2OpenedAt = 0;
bool gate2IsOpen = false;

void setup() {
  // Disable transient brownout reset from SG90 servo motor inrush spikes
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);

  ultrasonicInit();
  ledsInit();
  buzzerInit();
  gateServosInit();
  gateNetworkInit();

  Serial.println(F("\n=============================================="));
  Serial.println(F("  ESP32 Gate Controller + WebSocket Broadcast "));
  Serial.println(F("=============================================="));
  Serial.println(F("Gate 1: Ultrasonic Trigger -> Closes 20s later (No Wireless)"));
  Serial.println(F("Gate 2: WebSocket Trigger -> Closes 10s later"));
  Serial.println(F("Status: Standby. Solid RED active."));
  Serial.print(F("Current Car Count: ")); Serial.println(carCount);
}

void loop() {
  // Service HTTP & WebSocket frames
  gateNetworkLoop();

  // Service non-blocking active-pulse-and-detach on servos (Zero Jitter)
  gateServosLoop();

  unsigned long now = millis();

  // -------------------------------------------------------------
  // PERIODIC TELEMETRY HEARTBEAT (Every 1000ms)
  // Keeps WebSocket connection warm, prevents browser timeout,
  // and updates car count, gate states, and system status live.
  // -------------------------------------------------------------
  static unsigned long lastHeartbeatTimer = 0;
  if (now - lastHeartbeatTimer >= 1000) {
    lastHeartbeatTimer = now;
    broadcastTelemetry(carCount, currentState, NULL);
  }

  // -------------------------------------------------------------
  // A. ULTRASONIC VEHICLE DETECTION FOR GATE 1 (Every 100ms)
  // -------------------------------------------------------------
  if (currentState == IDLE_STANDBY && !gate1IsOpen && (now - ultrasonicPingTimer >= 100)) {
    ultrasonicPingTimer = now;
    long distance = readUltrasonicDistanceCM();

    if (distance > 0 && distance <= TRIGGER_DISTANCE_CM) {
      if (lastCarLoggedTime == 0 || (now - lastCarLoggedTime >= CAR_LOCKOUT_MS)) {
        carCount++;
        lastCarLoggedTime = now;

        Serial.println(F("\n----------------------------------------------"));
        Serial.print(F(">> VEHICLE DETECTED! Distance: "));
        Serial.print(distance);
        Serial.println(F(" cm"));
        Serial.print(F(">> LOGGED VEHICLE #"));
        Serial.println(carCount);
        Serial.println(F(">> 30s lockout timer started."));
        Serial.println(F("----------------------------------------------"));

        currentState = STAGE_RED;
        stateTimer = now;
        toneTimer = now;
        chimeStep = 0;

        setLeds(true, false, false);
        playTone(440); // 440 Hz cue pulse
        Serial.println(F(">> Sequence [1/3]: RED Active (1.0s)..."));

        broadcastTelemetry(carCount, currentState, "Vehicle Detected: Sequence Started");
      } else {
        static unsigned long lastLockoutLog = 0;
        if (now - lastLockoutLog >= 2000) {
          lastLockoutLog = now;
          Serial.printf(">> [LOCKOUT] Vehicle at %ld cm (Debounce active: %lums remaining)\n",
                        distance, CAR_LOCKOUT_MS - (now - lastCarLoggedTime));
        }
      }
    } else {
      static unsigned long lastIdlePingLog = 0;
      if (now - lastIdlePingLog >= 3000) {
        lastIdlePingLog = now;
        Serial.printf(">> [SONAR IDLE] Distance: %ld cm (Trip threshold <= %d cm)\n", distance, TRIGGER_DISTANCE_CM);
      }
    }
  }

  // -------------------------------------------------------------
  // B. GATE 2 TRIGGER: WEBSOCKET ONLY (Player Completes Game)
  // -------------------------------------------------------------
  // Check Serial manual trigger for Gate 2
  if (Serial.available() > 0) {
    char sc = Serial.read();
    if (sc == '2' || sc == 'o' || sc == 'O') {
      openGate2();
      gate2OpenedAt = now;
      gate2IsOpen = true;
      Serial.println(F(">> [MANUAL SERIAL] Gate 2 Opened! Auto-closing in exactly 10.0s..."));
      broadcastTelemetry(carCount, currentState, "Gate 2 Opened via Serial (10s Timer)");
    } else if (sc == 'c' || sc == 'C') {
      closeGate2();
      gate2IsOpen = false;
      Serial.println(F(">> [MANUAL SERIAL] Gate 2 Closed!"));
      broadcastTelemetry(carCount, currentState, "Gate 2 Closed via Serial");
    }
  }

  // Check WebSocket trigger for Gate 2
  if (pollRemoteGate2Trigger()) {
    openGate2();
    gate2OpenedAt = now;
    gate2IsOpen = true;
    Serial.println(F("\n======================================================="));
    Serial.println(F(">> [GATE 2 OPEN] Player Successfully Completed Game!"));
    Serial.println(F(">> Gate 2 Opened! Auto-closing after exactly 10.0s..."));
    Serial.println(F("======================================================="));
    broadcastTelemetry(carCount, currentState, "Gate 2 Opened: Vehicle Cleared to Exit (10s Timer)");
  }

  // -------------------------------------------------------------
  // C. GATE 2 INDEPENDENT AUTO-CLOSE TIMER (EXACTLY 10.0s)
  // -------------------------------------------------------------
  if (gate2IsOpen && (now - gate2OpenedAt >= GATE2_HOLD_OPEN_MS)) {
    closeGate2();
    gate2IsOpen = false;
    Serial.println(F("\n======================================================="));
    Serial.println(F(">> [GATE 2 AUTO-CLOSE] Exactly 10.0s elapsed! Gate 2 Closed."));
    Serial.println(F("======================================================="));
    broadcastTelemetry(carCount, currentState, "Gate 2 Auto-Closed (10s Elapsed)");
  }

  // -------------------------------------------------------------
  // D. GATE 1 INDEPENDENT AUTO-CLOSE TIMER (EXACTLY 20.0s)
  // -------------------------------------------------------------
  if (gate1IsOpen && (now - gate1OpenedAt >= GATE1_HOLD_OPEN_MS)) {
    closeGate1();
    gate1IsOpen = false;
    setLeds(true, false, false); // Return traffic light to solid Red Standby
    if (currentState == GATE1_OPEN_HOLD) {
      currentState = IDLE_STANDBY;
    }
    Serial.println(F("\n======================================================="));
    Serial.println(F(">> [GATE 1 AUTO-CLOSE] Exactly 20.0s elapsed! Gate 1 Closed."));
    Serial.println(F(">> Traffic light returned to Solid RED. System Ready."));
    Serial.println(F("======================================================="));
    broadcastTelemetry(carCount, currentState, "Gate 1 Auto-Closed (20s Elapsed)");
  }

  // -------------------------------------------------------------
  // E. SEQUENCE STATE MACHINE FOR GATE 1 (RED -> YELLOW -> GREEN)
  // -------------------------------------------------------------
  switch (currentState) {
    case IDLE_STANDBY:
      break;

    case STAGE_RED:
      if (now - toneTimer >= 120 && chimeStep == 0) {
        stopTone();
        chimeStep = 1;
      }

      if (now - stateTimer >= STAGE_DELAY_MS) {
        currentState = STAGE_YELLOW;
        stateTimer = now;
        toneTimer = now;
        chimeStep = 0;

        setLeds(false, true, false);
        playTone(880); // 880 Hz warning ping
        Serial.println(F(">> Sequence [2/3]: YELLOW Active (1.0s)..."));
      }
      break;

    case STAGE_YELLOW:
      if (now - toneTimer >= 120 && chimeStep == 0) {
        stopTone();
        chimeStep = 1;
      } else if (now - toneTimer >= 350 && chimeStep == 1) {
        playTone(880);
        chimeStep = 2;
      } else if (now - toneTimer >= 470 && chimeStep == 2) {
        stopTone();
        chimeStep = 3;
      }

      if (now - stateTimer >= STAGE_DELAY_MS) {
        currentState = STAGE_GREEN;
        stateTimer = now;
        toneTimer = now;
        chimeStep = 0;

        setLeds(false, false, true);
        
        // Gate 1 opens by ultrasonic sensor!
        openGate1();
        gate1OpenedAt = now;
        gate1IsOpen = true;

        playTone(1318); // Harmonic entry chime (E6)
        Serial.println(F(">> Sequence [3/3]: GREEN Active (1.0s) -> GATE 1 OPENED!"));
        Serial.println(F(">> [GATE 1 AUTO] 20.0s countdown started. Gate 1 will close in 20.0s."));
        broadcastTelemetry(carCount, currentState, "Gate 1 Opened Automatically (20s Timer)");
      }
      break;

    case STAGE_GREEN:
      if (now - toneTimer >= 180 && chimeStep == 0) {
        playTone(1760); // Harmonic entry chime (A6)
        chimeStep = 1;
      } else if (now - toneTimer >= 450 && chimeStep == 1) {
        stopTone();
        chimeStep = 2;
      }

      if (now - stateTimer >= STAGE_DELAY_MS) {
        currentState = GATE1_OPEN_HOLD;
        stateTimer = now;
        stopTone();
        Serial.println(F(">> Gate 1 Open. Auto-closing 20s after ultrasonic trigger."));
      }
      break;

    case GATE1_OPEN_HOLD:
      // Holds Gate 1 open until the 20.0s independent timer closes it in Section D
      break;

    case GATE2_OPEN_HOLD:
      // Gate 2 is held open until the 10.0s independent timer closes it in Section C
      break;
  }
}
