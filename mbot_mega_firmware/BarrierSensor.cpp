#include "BarrierSensor.h"

void barrierSensorInit() {
  pinMode(PIN_OBS_FRONT, INPUT);
}

int readFrontBarrierRaw() {
  return analogRead(PIN_OBS_FRONT);
}

bool isFrontBarrierDetected() {
  return (readFrontBarrierRaw() < OBSTACLE_THRESHOLD);
}