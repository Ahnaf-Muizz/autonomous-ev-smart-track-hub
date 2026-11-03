#include "line_follower_mode.h"
#include "Motors.h"
#include "LineSensor.h"
#include "BarrierSensor.h"
#include "CollisionSensor.h"
#include "LEDs.h"

extern OperationalMode activeMode;

enum FollowerSubState {
  WAITING_FOR_ALIGNMENT,
  COUNTDOWN_ARMING,
  FORWARD_PATROL,
  GENTLE_ROTATING,
  BLOCKED_BY_HAZARD,
  WAITING_CLEAR_DELAY
};

static FollowerSubState subState = WAITING_FOR_ALIGNMENT;
static int rotateDir = +1;
static unsigned long clearTimer = 0;
static unsigned long obstacleClearTimer = 0;

static unsigned long countdownStartMs = 0;
static unsigned long lastCountdownBlink = 0;
static bool countdownLedOn = false;

void armFinishLineDetector() {
  Serial.println(F(">>> [AUTO] Finish Line Detection active (Both sensors on black)!"));
}

bool isFinishLineArmed() {
  return true;
}

void lineFollowerInit() {
  resetLineFollower();
}

void resetLineFollower() {
  subState = WAITING_FOR_ALIGNMENT;
  rotateDir = +1;
  clearTimer = 0;
  obstacleClearTimer = 0;
  countdownStartMs = 0;
  lastCountdownBlink = 0;
  countdownLedOn = false;
  stopAllMotors();
}

void startLineFollowerRun() {
  resetLineFollower();
}

bool isLineFollowerWaitingStart() {
  return (subState == WAITING_FOR_ALIGNMENT || subState == COUNTDOWN_ARMING);
}

void printLineFollowerMenu() {
  Serial.println(F("\n-------------------------------------------------------------"));
  Serial.println(F(" [MODE 1: AUTONOMOUS BOUNDARY LINE FOLLOWER]                 "));
  Serial.println(F("  1. Place rover on safe white track (both sensors 1)        "));
  Serial.println(F("  2. System verifies alignment & flashes GREEN for 5s        "));
  Serial.println(F("  3. Cruises CYAN forward at speed 70                        "));
  Serial.println(F("  4. Rotates AMBER away from black boundary at speed 40      "));
  Serial.println(F("  5. FINISH: Both sensors hit black -> Instant stop & Mode 2 "));
  Serial.println(F("  Press [X / Space] -> Return to Standby                     "));
  Serial.println(F("  Press [2]         -> Switch to Manual Control Mode         "));
  Serial.println(F("-------------------------------------------------------------\n"));
}

void stepLineFollower(RobotState &currentState, bool frontObstacle, bool rearCollision) {
  unsigned long now = millis();
  bool lBlack = leftHitBlack();
  bool rBlack = rightHitBlack();

  // ====================================================================
  // FINISH: Whenever both sensors detect black line together, car immediately
  // stops and goes into Mode 2 at anytime regardless of phases.
  // It does NOT have to move clear of boundary or anything.
  // ====================================================================
  if (lBlack && rBlack) {
    stopAllMotors();
    activeMode = MODE_MANUAL;
    currentState = STATE_STOPPED;
    resetLineFollower();
    clearLEDOverride();

    Serial.println(F("\n======================================================="));
    Serial.println(F(">> [FINISH] Both sensors detected black line!"));
    Serial.println(F(">> Car stopped immediately. Switched to Mode 2 (Manual)."));
    Serial.println(F("======================================================="));

    Serial3.println(F("[EVT:FINISH]"));
    Serial3.println(F("[FINISH]"));
    return;
  }

  // 1. HAZARD OVERRIDES
  if (frontObstacle || rearCollision) {
    stopAllMotors();
    if (subState != BLOCKED_BY_HAZARD) {
      Serial.println(F("!! [AUTO] Hazard detected! Emergency stop activated !!"));
      subState = BLOCKED_BY_HAZARD;
    }
    currentState = frontObstacle ? STATE_OBSTACLE_ALERT : STATE_COLLISION_ALERT;
    return;
  }

  // 2. RESUME SEQUENCE FROM HAZARD
  if (subState == BLOCKED_BY_HAZARD && !frontObstacle && !rearCollision) {
    stopAllMotors();
    subState = WAITING_CLEAR_DELAY;
    obstacleClearTimer = now;
    currentState = STATE_LINE_FOLLOW_PAUSED;
    Serial.println(F(">> [AUTO] Obstacle/gate cleared! Holding 3.0 seconds..."));
    return;
  }

  if (subState == WAITING_CLEAR_DELAY) {
    if (now - obstacleClearTimer < OBSTACLE_CLEAR_DELAY_MS) {
      stopAllMotors();
      currentState = STATE_LINE_FOLLOW_PAUSED;
      return;
    } else {
      subState = FORWARD_PATROL;
      currentState = STATE_LINE_FOLLOWING;
      Serial.println(F(">> [AUTO] 3.0s elapsed! Resuming forward motion."));
    }
  }

  // 3. STATE MACHINE EXECUTION
  switch (subState) {

    case WAITING_FOR_ALIGNMENT: {
      stopAllMotors();

      if (lBlack || rBlack) {
        currentState = STATE_LINE_ALERT;
        static unsigned long lastWaitMsg = 0;
        if (now - lastWaitMsg > 1500) {
          lastWaitMsg = now;
          Serial.println(F(">> [AUTO] On black boundary. Move to white track to arm."));
        }
      } else {
        subState = COUNTDOWN_ARMING;
        countdownStartMs = now;
        lastCountdownBlink = now;
        countdownLedOn = true;
        currentState = STATE_LINE_FOLLOW_READY;
        setCountdownVisual(5, true);
        Serial.println(F(">> [AUTO] Aligned on white! Beginning 5s countdown..."));
      }
      break;
    }

    case COUNTDOWN_ARMING: {
      stopAllMotors();

      if (lBlack || rBlack) {
        Serial.println(F("!! [AUTO] Boundary hit during countdown! Resetting to Red Alert !!"));
        subState = WAITING_FOR_ALIGNMENT;
        currentState = STATE_LINE_ALERT;
        setCountdownVisual(0, false);
        return;
      }

      unsigned long elapsed = now - countdownStartMs;

      if (now - lastCountdownBlink >= 250) {
        lastCountdownBlink = now;
        countdownLedOn = !countdownLedOn;
        setCountdownVisual((5 - (elapsed / 1000)), countdownLedOn);
      }

      static int lastSecondPrinted = -1;
      int secRemaining = 5 - (elapsed / 1000);
      if (secRemaining != lastSecondPrinted && secRemaining >= 0) {
        lastSecondPrinted = secRemaining;
        Serial.print(F(">> Launching in: ")); Serial.print(secRemaining); Serial.println(F(" s..."));
      }

      if (elapsed >= 5000) {
        Serial.println(F(">> [AUTO] COUNTDOWN COMPLETE! Cruising Forward."));
        subState = FORWARD_PATROL;
        currentState = STATE_LINE_FOLLOWING;
        lastSecondPrinted = -1;
      }
      break;
    }

    case FORWARD_PATROL: {
      if (lBlack && !rBlack) {
        stopAllMotors();
        rotateDir = +1;
        currentState = STATE_ROTATE_CW;
        subState = GENTLE_ROTATING;
        clearTimer = 0;
        driveTank(+LINE_FOLLOW_ROTATE_SPEED, -LINE_FOLLOW_ROTATE_SPEED);
      } else if (rBlack && !lBlack) {
        stopAllMotors();
        rotateDir = -1;
        currentState = STATE_ROTATE_CCW;
        subState = GENTLE_ROTATING;
        clearTimer = 0;
        driveTank(-LINE_FOLLOW_ROTATE_SPEED, +LINE_FOLLOW_ROTATE_SPEED);
      } else {
        currentState = STATE_LINE_FOLLOWING;
        driveTank(LINE_FOLLOW_BASE_SPEED, LINE_FOLLOW_BASE_SPEED);
      }
      break;
    }

    case GENTLE_ROTATING: {
      driveTank(rotateDir * LINE_FOLLOW_ROTATE_SPEED, -rotateDir * LINE_FOLLOW_ROTATE_SPEED);

      if (!lBlack && !rBlack) {
        if (clearTimer == 0) {
          clearTimer = now;
        }

        if (now - clearTimer >= CLEARANCE_SETTLE_MS) {
          subState = FORWARD_PATROL;
          currentState = STATE_LINE_FOLLOWING;
          driveTank(LINE_FOLLOW_BASE_SPEED, LINE_FOLLOW_BASE_SPEED);
          Serial.println(F(">> Both sensors clear -> RESUME FORWARD PATROL"));
        }
      } else {
        clearTimer = 0;
      }
      break;
    }
  }
}
