#include "LineSensor.h"

void lineSensorInit() {
  pinMode(PIN_LINE_LEFT, INPUT);
  pinMode(PIN_LINE_RIGHT, INPUT);
}

bool leftHitBlack() {
  return (digitalRead(PIN_LINE_LEFT) == BLACK_LINE_LOGIC);
}

bool rightHitBlack() {
  return (digitalRead(PIN_LINE_RIGHT) == BLACK_LINE_LOGIC);
}

bool bothHitBlack() {
  return (digitalRead(PIN_LINE_LEFT) == BLACK_LINE_LOGIC && digitalRead(PIN_LINE_RIGHT) == BLACK_LINE_LOGIC);
}

bool isBoundaryDetected() {
  return (leftHitBlack() || rightHitBlack());
}

void printLineSensorsRaw() {
  int l = digitalRead(PIN_LINE_LEFT);
  int r = digitalRead(PIN_LINE_RIGHT);
  
  const char *lStr = (l == BLACK_LINE_LOGIC) ? "BLACK(0)" : "WHITE(1)";
  const char *rStr = (r == BLACK_LINE_LOGIC) ? "BLACK(0)" : "WHITE(1)";

  Serial.print(F("L (A6): ")); Serial.print(lStr);
  Serial.print(F(" | R (A7): ")); Serial.println(rStr);

  Serial3.print(F("L (A6): ")); Serial3.print(lStr);
  Serial3.print(F(" | R (A7): ")); Serial3.println(rStr);
}
