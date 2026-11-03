#include <Arduino.h>
#include "Config.h"
#include "Motors.h"
#include "LEDs.h"
#include "LineSensor.h"
#include "CollisionSensor.h"
#include "BarrierSensor.h"
#include "manual_mode.h"
#include "line_follower_mode.h"

OperationalMode activeMode = MODE_MANUAL;
RobotState currentState = STATE_STOPPED;
LineEscapeDirection allowedEscape = ESCAPE_NONE;
unsigned long escapeStartTime = 0;
int escapeDirectionSign = 0;

void printMasterBanner() {
  Serial.println(F("\n========================================================"));
  Serial.println(F("         mBot Mega Multi-Mode Master Firmware           "));
  Serial.println(F("========================================================"));
  Serial.println(F(" SELECT OPERATING MODE:                                 "));
  Serial.println(F("   [1] -> Autonomous Black-Line Following Mode          "));
  Serial.println(F("   [2] -> Manual Keyboard Control Mode (Default)        "));
  Serial.println(F("========================================================"));
  printManualModeMenu();
}

void setup() {
  Serial.begin(115200);
  Serial3.begin(115200);

  delay(400);

  motorsInit();
  ledsInit();
  lineSensorInit();
  collisionSensorsInit();
  barrierSensorInit();
  manualModeInit();
  lineFollowerInit();

  // Clear serial buffers
  while (Serial.available())  Serial.read();
  while (Serial3.available()) Serial3.read();

  activeMode = MODE_MANUAL;
  currentState = STATE_STOPPED;

  printMasterBanner();
}

void loop() {
  bool onLine   = isBoundaryDetected();
  bool rearHit  = isRearCollisionDetected();
  bool frontHit = isFrontBarrierDetected();
  bool bothBlack = bothHitBlack();

  // --- FINISH: Both sensors detect black line together -> Instant Stop & Mode 2 ---
  if (bothBlack && activeMode == MODE_LINE_FOLLOWER) {
    stopAllMotors();
    activeMode = MODE_MANUAL;
    currentState = STATE_STOPPED;
    allowedEscape = ESCAPE_NONE;
    resetLineFollower();
    clearLEDOverride();

    Serial.println(F("\n======================================================="));
    Serial.println(F(">> [FINISH] Both sensors detected black line!"));
    Serial.println(F(">> Car stopped immediately. Switched to Mode 2 (Manual)."));
    Serial.println(F("======================================================="));

    Serial3.println(F("[EVT:FINISH]"));
    Serial3.println(F("[FINISH]"));
  }

  // --- 1. CLEAN SINGLE-BYTE INPUT FETCH (Prioritize Serial3 Bluetooth) ---
  char incomingChar = 0;
  if (Serial3.available() > 0) {
    incomingChar = Serial3.read();
  } else if (Serial.available() > 0) {
    incomingChar = Serial.read();
  }

  // Filter out line noise, carriage returns, nulls
  if (incomingChar == '\r' || incomingChar == '\n' || incomingChar <= 0) {
    incomingChar = 0;
  }

  // --- 2. DEDICATED MODE SWITCHING ('1' for Auto) & IMMEDIATE HALT / FORCE MODE 2 ('2', Space, 'x') ---
  if (incomingChar == '1') {
    clearLEDOverride();
    if (activeMode != MODE_LINE_FOLLOWER) {
      stopAllMotors();
      resetLineFollower();
      activeMode = MODE_LINE_FOLLOWER;
      currentState = STATE_LINE_FOLLOW_READY;
      Serial.println(F("\n>>> [MODE 1: AUTONOMOUS] Line Follower Armed."));
      printLineFollowerMenu();
    }
    incomingChar = 0; // Consume so it does not propagate
  } 
  else if (incomingChar == '2' || incomingChar == 'x' || incomingChar == 'X' || incomingChar == ' ') {
    clearLEDOverride();
    stopAllMotors();
    resetLineFollower();
    activeMode = MODE_MANUAL;
    currentState = STATE_STOPPED;
    allowedEscape = ESCAPE_NONE;
    Serial.println(F("\n>>> [STOP / MODE 2] All motors halted. Forced into Mode 2 (Manual)."));
    if (incomingChar == '2') {
      printManualModeMenu();
    }
    incomingChar = 0; // Consume so it does not trigger further actions
  }

  // --- 3. CUSTOM RGB PARSER (#RRGGBB) & STEM LED OVERRIDES ---
  static char hexBuf[7] = {0};
  static uint8_t hexIdx = 0;
  static bool readingHex = false;

  if (incomingChar == '#') {
    readingHex = true;
    hexIdx = 0;
    incomingChar = 0;
  } else if (readingHex && incomingChar != 0) {
    hexBuf[hexIdx++] = incomingChar;
    incomingChar = 0;
    if (hexIdx >= 6) {
      hexBuf[6] = '\0';
      readingHex = false;
      long hexVal = strtol(hexBuf, NULL, 16);
      uint8_t cr = (hexVal >> 16) & 0xFF;
      uint8_t cg = (hexVal >> 8) & 0xFF;
      uint8_t cb = hexVal & 0xFF;
      setCustomRGB(cr, cg, cb);
      Serial.print(F(">>> [LED] Custom RGB set: #"));
      Serial.println(hexBuf);
    }
  } else if (incomingChar == 'e' || incomingChar == 'E') {
    armFinishLineDetector();
    incomingChar = 0;
  } else if (incomingChar == 'c' || incomingChar == 'C') {
    setLEDOverride(LED_OVERRIDE_CYAN);
    Serial.println(F(">>> [LED] Cyan Override"));
    incomingChar = 0;
  } else if (incomingChar == 'g' || incomingChar == 'G') {
    setLEDOverride(LED_OVERRIDE_CHARGE);
    Serial.println(F(">>> [LED] Charge Override"));
    incomingChar = 0;
  } else if (incomingChar == 'v' || incomingChar == 'V') {
    setLEDOverride(LED_OVERRIDE_RAINBOW);
    Serial.println(F(">>> [LED] Rainbow Override"));
    incomingChar = 0;
  } else if (incomingChar == 'f' || incomingChar == 'F') {
    setLEDOverride(LED_OVERRIDE_FAULT);
    Serial.println(F(">>> [LED] Fault Override"));
    incomingChar = 0;
  } else if (incomingChar == 'p' || incomingChar == 'P') {
    setLEDOverride(LED_OVERRIDE_CYCLE);
    Serial.println(F(">>> [LED] Color Cycle Override"));
    incomingChar = 0;
  } else if (incomingChar == 'r' || incomingChar == 'R') {
    clearLEDOverride();
    Serial.println(F(">>> [LED] Override Cleared"));
    incomingChar = 0;
  }

  // --- 4. EXECUTE ACTIVE MODE ---
  if (activeMode == MODE_LINE_FOLLOWER) {
    stepLineFollower(currentState, frontHit, rearHit);
  } 
  else {
    // MODE_MANUAL: WASD teleoperation and safety interlocks
    stepManualModeSafety(currentState, allowedEscape, escapeDirectionSign, escapeStartTime,
                         onLine, frontHit, rearHit);

    handleManualModeChar(incomingChar, currentState, allowedEscape, escapeDirectionSign, escapeStartTime,
                         onLine, frontHit, rearHit);
  }

  // --- 5. UPDATE LEDS ---
  updateLEDs(currentState, activeMode, escapeDirectionSign);
}
