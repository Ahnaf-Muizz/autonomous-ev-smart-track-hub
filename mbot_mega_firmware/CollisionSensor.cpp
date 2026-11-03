#include "CollisionSensor.h"

void collisionSensorsInit() {
  pinMode(PIN_COLLISION_RL, INPUT_PULLUP);
  pinMode(PIN_COLLISION_RR, INPUT_PULLUP);
}

bool isRearLeftCollisionDetected() {
  return (digitalRead(PIN_COLLISION_RL) == COLLISION_TRIGGER);
}

bool isRearRightCollisionDetected() {
  return (digitalRead(PIN_COLLISION_RR) == COLLISION_TRIGGER);
}

bool isRearCollisionDetected() {
  return (isRearLeftCollisionDetected() || isRearRightCollisionDetected());
}