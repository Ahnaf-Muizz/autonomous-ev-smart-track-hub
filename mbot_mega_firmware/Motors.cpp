#include "Motors.h"
#include <MeMegaPi.h>

// Makeblock MegaPi motor driver port mapping:
// PORT1A: Front-Right (FR)
// PORT1B: Rear-Right  (RR)
// PORT2A: Rear-Left   (RL)
// PORT2B: Front-Left  (FL)
static MeMegaPiDCMotor motorFR(PORT1A);
static MeMegaPiDCMotor motorRR(PORT1B);
static MeMegaPiDCMotor motorRL(PORT2A);
static MeMegaPiDCMotor motorFL(PORT2B);

void motorsInit() {
  stopAllMotors();
}

void stopAllMotors() {
  motorFR.stop();
  motorRR.stop();
  motorRL.stop();
  motorFL.stop();
}

int shapeSpeed(int v, float trim) {
  if (v == 0) return 0;
  int sign = (v < 0) ? -1 : 1;
  int mag = (int)(abs(v) * trim);
  if (mag <= 0) return 0;

  if (mag >= MIN_RUN) return sign * min(mag, MAX_SPEED);

  unsigned long ph = millis() % DITHER_MS;
  bool on = (ph * (unsigned long)MIN_RUN) < ((unsigned long)mag * DITHER_MS);
  return on ? sign * MIN_RUN : 0;
}

void driveTank(int leftSpeed, int rightSpeed) {
  int l = shapeSpeed(leftSpeed,  LEFT_TRIM);
  int r = shapeSpeed(rightSpeed, RIGHT_TRIM);
  motorFL.run(l);
  motorRL.run(l);
  motorFR.run(r);
  motorRR.run(r);
}

void driveMecanum(int vy, int vx, int omega) {
  // Inverted sign matrix for mBot Mega gear polarity:
  // vy    = Forward (+) / Backward (-)
  // vx    = Strafe Right (+) / Strafe Left (-)
  // omega = Rotate CW/Right (+) / Rotate CCW/Left (-)
  int vFL = vy - vx - omega;
  int vFR = vy + vx + omega;
  int vRL = vy + vx - omega;
  int vRR = vy - vx + omega;

  // Normalize motor PWM duty if vector summation exceeds 255
  int maxVal = max(max(abs(vFL), abs(vFR)), max(abs(vRL), abs(vRR)));
  if (maxVal > 255) {
    vFL = (int)((long)vFL * 255 / maxVal);
    vFR = (int)((long)vFR * 255 / maxVal);
    vRL = (int)((long)vRL * 255 / maxVal);
    vRR = (int)((long)vRR * 255 / maxVal);
  }

  motorFL.run(shapeSpeed(vFL, LEFT_TRIM));
  motorFR.run(shapeSpeed(vFR, RIGHT_TRIM));
  motorRL.run(shapeSpeed(vRL, LEFT_TRIM));
  motorRR.run(shapeSpeed(vRR, RIGHT_TRIM));
}