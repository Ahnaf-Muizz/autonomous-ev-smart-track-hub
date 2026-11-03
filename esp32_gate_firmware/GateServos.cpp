#include "GateServos.h"
#include <Arduino.h>

static Servo srv1;
static Servo srv2;

static int curAngle1 = S1_ANGLE_CLOSED;
static int curAngle2 = S2_ANGLE_CLOSED;

static bool s1Active = false;
static bool s2Active = false;
static unsigned long s1Timer = 0;
static unsigned long s2Timer = 0;

static void triggerS1(int angle) {
  curAngle1 = constrain(angle, 0, 180);
  if (!srv1.attached()) {
    srv1.attach(PIN_SERVO_1, SERVO_MIN_US, SERVO_MAX_US);
  }
  srv1.write(curAngle1);
  s1Timer = millis();
  s1Active = true;
  Serial.printf(">> S1 commanded to %d deg (PWM active for %lums)...\n", curAngle1, SERVO_TRAVEL_MS);
}

static void triggerS2(int angle) {
  curAngle2 = constrain(angle, 0, 180);
  if (!srv2.attached()) {
    srv2.attach(PIN_SERVO_2, SERVO_MIN_US, SERVO_MAX_US);
  }
  srv2.write(curAngle2);
  s2Timer = millis();
  s2Active = true;
  Serial.printf(">> S2 commanded to %d deg (PWM active for %lums)...\n", curAngle2, SERVO_TRAVEL_MS);
}

void gateServosInit() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  srv1.setPeriodHertz(50);
  srv2.setPeriodHertz(50);

  // Initialize both barrier arms closed, hold exactly SERVO_TRAVEL_MS (50ms), then detach
  triggerS1(S1_ANGLE_CLOSED);
  triggerS2(S2_ANGLE_CLOSED);
  delay(SERVO_TRAVEL_MS);
  srv1.detach();
  srv2.detach();
  s1Active = false;
  s2Active = false;
}

void openGate1() {
  triggerS1(S1_ANGLE_OPEN);
}

void closeGate1() {
  triggerS1(S1_ANGLE_CLOSED);
}

void openGate2() {
  triggerS2(S2_ANGLE_OPEN);
}

void closeGate2() {
  triggerS2(S2_ANGLE_CLOSED);
}

void closeAllGates() {
  triggerS1(S1_ANGLE_CLOSED);
  triggerS2(S2_ANGLE_CLOSED);
}

bool isGate1Open() {
  return (curAngle1 == S1_ANGLE_OPEN);
}

bool isGate2Open() {
  return (curAngle2 == S2_ANGLE_OPEN);
}

void gateServosLoop() {
  unsigned long now = millis();

  // Non-blocking automatic detach once travel duration completes to eliminate jitter and humming
  if (s1Active && (now - s1Timer >= SERVO_TRAVEL_MS)) {
    srv1.detach();
    s1Active = false;
    Serial.printf(">> S1 arrived at %d deg: PWM Detached.\n", curAngle1);
  }

  if (s2Active && (now - s2Timer >= SERVO_TRAVEL_MS)) {
    srv2.detach();
    s2Active = false;
    Serial.printf(">> S2 arrived at %d deg: PWM Detached.\n", curAngle2);
  }
}
