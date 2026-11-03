#include "manual_mode.h"
#include "Motors.h"
#include "LEDs.h"
#include "LineSensor.h"

static int manualDriveSpeed = DEFAULT_MANUAL_SPEED;

static bool lineSafetyEnabled     = true;
static bool frontBarrierEnabled   = true;
static bool rearCollisionEnabled  = true;

static RobotState lastLoggedSafetyState = STATE_STOPPED;

int getManualSpeed() {
  return manualDriveSpeed;
}

void setManualSpeed(int newSpeed) {
  manualDriveSpeed = constrain(newSpeed, MIN_RUN, MAX_SPEED);
}

bool isLineSafetyEnabled() {
  return lineSafetyEnabled;
}

bool isFrontBarrierSafetyEnabled() {
  return frontBarrierEnabled;
}

bool isRearCollisionSafetyEnabled() {
  return rearCollisionEnabled;
}

static bool isMovingForwardOrManeuvering(RobotState state) {
  return (state == STATE_FORWARD ||
          state == STATE_LEFT ||
          state == STATE_RIGHT);
}

static bool isMovingBackward(RobotState state) {
  return (state == STATE_BACKWARD);
}

void manualModeInit() {
  manualDriveSpeed = DEFAULT_MANUAL_SPEED;
  lineSafetyEnabled = true;
  frontBarrierEnabled = true;
  rearCollisionEnabled = true;
  lastLoggedSafetyState = STATE_STOPPED;
}

static void printSafetyStatus() {
  Serial.print(F(">> SENSORS: [8] Boundary: "));
  Serial.print(lineSafetyEnabled ? F("ACTIVE") : F("MUTED"));
  Serial.print(F(" | [9] Front Barrier: "));
  Serial.print(frontBarrierEnabled ? F("ACTIVE") : F("MUTED"));
  Serial.print(F(" | [B] Rear Bumpers: "));
  Serial.println(rearCollisionEnabled ? F("ACTIVE") : F("MUTED"));
}

void printManualModeMenu() {
  Serial.println(F("\n--------------------------------------------------------"));
  Serial.println(F(" [MODE 2: MANUAL CONTROL MODE]                          "));
  Serial.println(F("  [W] Forward   | [S] Backward  | [X / Space] Stop      "));
  Serial.println(F("  [A] Strafe L  | [D] Strafe R                          "));
  Serial.println(F("  [U] Speed Up  | [J] Speed Down| [K] Reset Speed (100) "));
  Serial.println(F("  ----------------------------------------------------  "));
  Serial.println(F("  [8] Toggle Line Safety   | [9] Toggle Front Barrier   "));
  Serial.println(F("  [B] Toggle Rear Bumpers  | [T] Toggle Tabletop Master "));
  Serial.println(F("  [L] Live Line Status     | [1] Switch to Auto Mode    "));
  Serial.print  (F("  Active Speed: ")); Serial.println(manualDriveSpeed);
  printSafetyStatus();
  Serial.println(F("--------------------------------------------------------\n"));
}

void stepManualModeSafety(RobotState &currentState, LineEscapeDirection &allowedEscape,
                          int &escapeDirectionSign, unsigned long &escapeStartTime,
                          bool onLine, bool frontHit, bool rearHit) {
  unsigned long now = millis();

  bool bothBlack       = bothHitBlack();
  bool activeLineTrip  = (onLine && !bothBlack) && lineSafetyEnabled;
  bool activeFrontTrip = frontHit && frontBarrierEnabled;
  bool activeRearTrip  = rearHit && rearCollisionEnabled;

  // 1. Boundary Clearance Window
  if (currentState == STATE_ESCAPING_LINE) {
    if (escapeDirectionSign < 0 && activeRearTrip) {
      stopAllMotors();
      currentState = STATE_COLLISION_ALERT;
      Serial.println(F("!! ESCAPE HALTED: Rear bumper switch hit !!"));
    } 
    else if (escapeDirectionSign > 0 && activeFrontTrip) {
      stopAllMotors();
      currentState = STATE_OBSTACLE_ALERT;
      Serial.println(F("!! ESCAPE HALTED: Front barrier hit !!"));
    } 
    else if (now - escapeStartTime < ESCAPE_WINDOW_MS) {
      driveMecanum(escapeDirectionSign * manualDriveSpeed, 0, 0);
    } 
    else {
      if (activeLineTrip) {
        stopAllMotors();
        currentState = STATE_LINE_ALERT;
        Serial.println(F("!! STILL ON BOUNDARY AFTER 1.0s: Press escape key again !!"));
      } else {
        allowedEscape = ESCAPE_NONE;
        if (escapeDirectionSign < 0) {
          currentState = STATE_BACKWARD;
          Serial.println(F(">> Boundary cleared: Continuing continuous REVERSE drive."));
        } else {
          currentState = STATE_FORWARD;
          Serial.println(F(">> Boundary cleared: Continuing continuous FORWARD drive."));
        }
      }
    }
    return;
  }

  // 2. Safety Interlocks (Edge-Triggered Only)
  if (activeLineTrip) {
    if (isMovingForwardOrManeuvering(currentState)) {
      stopAllMotors();
      allowedEscape = ESCAPE_REQUIRE_BACKWARD;
      currentState = STATE_LINE_ALERT;
      if (lastLoggedSafetyState != STATE_LINE_ALERT) {
        Serial.println(F("!! BOUNDARY TRIPPED -> Halt! Press [S] to reverse away !!"));
        lastLoggedSafetyState = STATE_LINE_ALERT;
      }
    } else if (isMovingBackward(currentState)) {
      stopAllMotors();
      allowedEscape = ESCAPE_REQUIRE_FORWARD;
      currentState = STATE_LINE_ALERT;
      if (lastLoggedSafetyState != STATE_LINE_ALERT) {
        Serial.println(F("!! BOUNDARY TRIPPED (Reverse) -> Halt! Press [W] to drive forward away !!"));
        lastLoggedSafetyState = STATE_LINE_ALERT;
      }
    } else if (currentState != STATE_LINE_ALERT) {
      stopAllMotors();
      currentState = STATE_LINE_ALERT;
      if (lastLoggedSafetyState != STATE_LINE_ALERT) {
        Serial.println(F("!! STANDBY ALERT: Black Line detected !!"));
        lastLoggedSafetyState = STATE_LINE_ALERT;
      }
    }
  } else {
    if (currentState == STATE_LINE_ALERT) {
      stopAllMotors();
      currentState = STATE_STOPPED;
      allowedEscape = ESCAPE_NONE;
      lastLoggedSafetyState = STATE_STOPPED;
      Serial.println(F(">> Safe surface restored. Entering Standby."));
    }
  }

  if (activeFrontTrip && !activeLineTrip) {
    if (isMovingForwardOrManeuvering(currentState)) {
      stopAllMotors();
      currentState = STATE_OBSTACLE_ALERT;
      if (lastLoggedSafetyState != STATE_OBSTACLE_ALERT) {
        Serial.println(F("!! FRONT BARRIER TRIPPED: Motion halted! Press [S] to reverse away !!"));
        lastLoggedSafetyState = STATE_OBSTACLE_ALERT;
      }
    } else if (currentState == STATE_STOPPED && lastLoggedSafetyState != STATE_OBSTACLE_ALERT) {
      currentState = STATE_OBSTACLE_ALERT;
      Serial.println(F("!! STANDBY ALERT: Front obstacle detected !!"));
      lastLoggedSafetyState = STATE_OBSTACLE_ALERT;
    }
  } else if (currentState == STATE_OBSTACLE_ALERT && !activeFrontTrip) {
    stopAllMotors();
    currentState = STATE_STOPPED;
    lastLoggedSafetyState = STATE_STOPPED;
    Serial.println(F(">> Front obstacle cleared. Returning to Standby."));
  }

  if (activeRearTrip && !activeLineTrip) {
    if (isMovingBackward(currentState)) {
      stopAllMotors();
      currentState = STATE_COLLISION_ALERT;
      if (lastLoggedSafetyState != STATE_COLLISION_ALERT) {
        Serial.println(F("!! REAR COLLISION TRIPPED: Reverse motion halted !!"));
        lastLoggedSafetyState = STATE_COLLISION_ALERT;
      }
    } else if (currentState == STATE_STOPPED && lastLoggedSafetyState != STATE_COLLISION_ALERT) {
      currentState = STATE_COLLISION_ALERT;
      Serial.println(F("!! STANDBY ALERT: Rear bumper pressed !!"));
      lastLoggedSafetyState = STATE_COLLISION_ALERT;
    }
  } else if (currentState == STATE_COLLISION_ALERT && !activeRearTrip) {
    stopAllMotors();
    currentState = STATE_STOPPED;
    lastLoggedSafetyState = STATE_STOPPED;
    Serial.println(F(">> Rear bumper cleared. Returning to Standby."));
  }
}

void handleManualModeChar(char cmd, RobotState &currentState, LineEscapeDirection &allowedEscape,
                          int &escapeDirectionSign, unsigned long &escapeStartTime,
                          bool onLine, bool frontHit, bool rearHit) {
  if (cmd == 0 || cmd == '\r' || cmd == '\n') return;

  bool bothBlack       = bothHitBlack();
  bool activeLineTrip  = (onLine && !bothBlack) && lineSafetyEnabled;
  bool activeFrontTrip = frontHit && frontBarrierEnabled;
  bool activeRearTrip  = rearHit && rearCollisionEnabled;

  // --- SENSOR TOGGLES ---
  if (cmd == '8') {
    lineSafetyEnabled = !lineSafetyEnabled;
    Serial.print(F(">> [TOGGLE] Boundary Line Safety: "));
    Serial.println(lineSafetyEnabled ? F("ENABLED") : F("MUTED"));
    if (!lineSafetyEnabled && currentState == STATE_LINE_ALERT) currentState = STATE_STOPPED;
    printSafetyStatus();
    return;
  }

  if (cmd == '9') {
    frontBarrierEnabled = !frontBarrierEnabled;
    Serial.print(F(">> [TOGGLE] Front Barrier Safety: "));
    Serial.println(frontBarrierEnabled ? F("ENABLED") : F("MUTED"));
    if (!frontBarrierEnabled && currentState == STATE_OBSTACLE_ALERT) currentState = STATE_STOPPED;
    printSafetyStatus();
    return;
  }

  if (cmd == 'b' || cmd == 'B') {
    rearCollisionEnabled = !rearCollisionEnabled;
    Serial.print(F(">> [TOGGLE] Rear Bumper Safety: "));
    Serial.println(rearCollisionEnabled ? F("ENABLED") : F("MUTED"));
    if (!rearCollisionEnabled && currentState == STATE_COLLISION_ALERT) currentState = STATE_STOPPED;
    printSafetyStatus();
    return;
  }

  if (cmd == 't' || cmd == 'T') {
    bool muteAll = (lineSafetyEnabled || frontBarrierEnabled || rearCollisionEnabled);
    lineSafetyEnabled    = !muteAll;
    frontBarrierEnabled  = !muteAll;
    rearCollisionEnabled = !muteAll;

    if (muteAll) {
      Serial.println(F("\n>> [TABLETOP MODE ACTIVE] ALL safety interlocks MUTED."));
      if (currentState == STATE_LINE_ALERT || 
          currentState == STATE_OBSTACLE_ALERT || 
          currentState == STATE_COLLISION_ALERT) {
        currentState = STATE_STOPPED;
      }
    } else {
      Serial.println(F("\n>> [NORMAL SAFETY ACTIVE] ALL safety interlocks ENABLED."));
    }
    printSafetyStatus();
    return;
  }

  // --- SPEED ADJUSTMENTS ---
  if (cmd == 'u' || cmd == 'U') {
    setManualSpeed(manualDriveSpeed + 10);
    Serial.print(F(">> SPEED INCREASED: ")); Serial.println(manualDriveSpeed);
    return;
  }
  if (cmd == 'j' || cmd == 'J') {
    setManualSpeed(manualDriveSpeed - 10);
    Serial.print(F(">> SPEED DECREASED: ")); Serial.println(manualDriveSpeed);
    return;
  }
  if (cmd == 'k' || cmd == 'K') {
    setManualSpeed(DEFAULT_MANUAL_SPEED);
    Serial.print(F(">> SPEED RESET: ")); Serial.println(manualDriveSpeed);
    return;
  }

  // --- STOP COMMAND ---
  if (cmd == 'x' || cmd == 'X' || cmd == ' ') {
    Serial.println(F(">> STOP (Standby)"));
    stopAllMotors();
    currentState = STATE_STOPPED;
    allowedEscape = ESCAPE_NONE;
    return;
  }

  // --- LIVE LINE DIAGNOSTIC ---
  if (cmd == 'l' || cmd == 'L') {
    printLineSensorsRaw();
    return;
  }

  // --- DIRECTIONAL TELEOP ---
  switch (cmd) {
    case 'w':
    case 'W':
      if (currentState == STATE_LINE_ALERT && allowedEscape != ESCAPE_REQUIRE_BACKWARD) {
        if (activeFrontTrip) {
          Serial.println(F(">> CANNOT ESCAPE FORWARD: Front barrier blocked!"));
        } else {
          Serial.println(F(">> ESCAPING FORWARD (1.0s window)..."));
          currentState = STATE_ESCAPING_LINE;
          escapeDirectionSign = 1;
          escapeStartTime = millis();
          driveMecanum(manualDriveSpeed, 0, 0);
        }
      } else if (activeLineTrip && allowedEscape == ESCAPE_REQUIRE_BACKWARD) {
        Serial.println(F(">> FORWARD BLOCKED: On boundary! Press [S] to reverse (or [8] to mute)."));
      } else if (activeFrontTrip) {
        Serial.println(F(">> FORWARD BLOCKED: Front obstacle active! (Press [9] to mute)."));
        currentState = STATE_OBSTACLE_ALERT;
      } else {
        Serial.print(F(">> FORWARD @ speed ")); Serial.println(manualDriveSpeed);
        currentState = STATE_FORWARD;
        driveMecanum(manualDriveSpeed, 0, 0);
      }
      break;

    case 's':
    case 'S':
      if (currentState == STATE_LINE_ALERT && allowedEscape != ESCAPE_REQUIRE_FORWARD) {
        if (activeRearTrip) {
          Serial.println(F(">> CANNOT ESCAPE BACKWARD: Rear bumper blocked!"));
        } else {
          Serial.println(F(">> ESCAPING BACKWARD (1.0s window)..."));
          currentState = STATE_ESCAPING_LINE;
          escapeDirectionSign = -1;
          escapeStartTime = millis();
          driveMecanum(-manualDriveSpeed, 0, 0);
        }
      } else if (activeLineTrip && allowedEscape == ESCAPE_REQUIRE_FORWARD) {
        Serial.println(F(">> REVERSE BLOCKED: On boundary! Press [W] to pull forward (or [8] to mute)."));
      } else if (activeRearTrip) {
        Serial.println(F(">> REVERSE BLOCKED: Rear bumper hit! (Press [B] to mute)."));
        currentState = STATE_COLLISION_ALERT;
      } else {
        Serial.print(F(">> BACKWARD @ speed ")); Serial.println(manualDriveSpeed);
        currentState = STATE_BACKWARD;
        driveMecanum(-manualDriveSpeed, 0, 0);
      }
      break;

    case 'a':
    case 'A':
      if (activeLineTrip) {
        Serial.println(F(">> STRAFE LEFT BLOCKED: On boundary line!"));
      } else if (activeFrontTrip) {
        Serial.println(F(">> STRAFE LEFT BLOCKED: Front obstacle active!"));
        currentState = STATE_OBSTACLE_ALERT;
      } else {
        Serial.print(F(">> STRAFE LEFT @ speed ")); Serial.println(manualDriveSpeed);
        currentState = STATE_LEFT;
        resetLEDCadence();
        driveMecanum(0, -manualDriveSpeed, 0);
      }
      break;

    case 'd':
    case 'D':
      if (activeLineTrip) {
        Serial.println(F(">> STRAFE RIGHT BLOCKED: On boundary line!"));
      } else if (activeFrontTrip) {
        Serial.println(F(">> STRAFE RIGHT BLOCKED: Front obstacle active!"));
        currentState = STATE_OBSTACLE_ALERT;
      } else {
        Serial.print(F(">> STRAFE RIGHT @ speed ")); Serial.println(manualDriveSpeed);
        currentState = STATE_RIGHT;
        resetLEDCadence();
        driveMecanum(0, manualDriveSpeed, 0);
      }
      break;

    default:
      break;
  }
}
