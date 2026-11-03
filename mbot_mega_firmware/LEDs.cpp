#include "LEDs.h"
#include "LineSensor.h"
#include <MeRGBLed.h>

// Forward declaration of internal helper to eliminate any Arduino compiler scope errors
static void applyPodColors(uint8_t lR, uint8_t lG, uint8_t lB,
                           uint8_t rR, uint8_t rG, uint8_t rB);

static MeRGBLed ledsRight(0, 4);
static MeRGBLed ledsLeft(0, 4);

static unsigned long lastBlinkTime = 0;
static bool blinkToggle = false;
static unsigned long stoppedSince = 0;
static RobotState lastEvaluatedState = STATE_FORWARD;

// Shadow registers to eliminate bus contention
static uint8_t curL_R = 255, curL_G = 255, curL_B = 255;
static uint8_t curR_R = 255, curR_G = 255, curR_B = 255;

// Active LED Override Mode
static LEDOverrideType activeOverride = LED_OVERRIDE_NONE;
static uint8_t customR = 0, customG = 200, customB = 255;

// Cadence throttle timer for dynamic animations to keep AVR interrupts enabled >99% of the time
static unsigned long lastAnimMs = 0;

static void applyPodColors(uint8_t lR, uint8_t lG, uint8_t lB,
                           uint8_t rR, uint8_t rG, uint8_t rB) {
  if (lR != curL_R || lG != curL_G || lB != curL_B) {
    ledsLeft.setColor(0, lR, lG, lB);
    ledsLeft.show();
    curL_R = lR; curL_G = lG; curL_B = lB;
  }
  if (rR != curR_R || rG != curR_R || rB != curR_B) {
    ledsRight.setColor(0, rR, rG, rB);
    ledsRight.show();
    curR_R = rR; curR_G = rG; curR_B = rB;
  }
}

void ledsInit() {
  ledsRight.reset(0);
  ledsRight.setpin(PIN_LED_RIGHT);
  ledsLeft.reset(0);
  ledsLeft.setpin(PIN_LED_LEFT);
  resetLEDCadence();
}

void resetLEDCadence() {
  lastBlinkTime = millis();
  blinkToggle = true;
}

void setCountdownVisual(int sec, bool stateOn) {
  if (stateOn) {
    applyPodColors(0, 255, 0, 0, 255, 0); // Solid Green
  } else {
    applyPodColors(0, 0, 0, 0, 0, 0);       // OFF
  }
}

void setCustomRGB(uint8_t r, uint8_t g, uint8_t b) {
  activeOverride = LED_OVERRIDE_CUSTOM;
  customR = r;
  customG = g;
  customB = b;
  applyPodColors(r, g, b, r, g, b);
}

void setLEDOverride(LEDOverrideType overrideType) {
  activeOverride = overrideType;
}

void clearLEDOverride() {
  activeOverride = LED_OVERRIDE_NONE;
}

static void computeHueRGB(uint16_t hue, uint8_t &r, uint8_t &g, uint8_t &b) {
  hue = hue % 360;
  float h = hue / 60.0;
  int i = floor(h);
  float f = h - i;
  uint8_t q = 255 * (1.0 - f);
  uint8_t t = 255 * f;
  switch (i) {
    case 0: r = 255; g = t;   b = 0;   break;
    case 1: r = q;   g = 255; b = 0;   break;
    case 2: r = 0;   g = 255; b = t;   break;
    case 3: r = 0;   g = q;   b = 255; break;
    case 4: r = t;   g = 0;   b = 255; break;
    default:r = 255; g = 0;   b = q;   break;
  }
}

void updateLEDs(RobotState state, OperationalMode mode, int escapeDirectionSign) {
  unsigned long now = millis();

  if (state != lastEvaluatedState) {
    if (state == STATE_STOPPED) stoppedSince = now;
    lastEvaluatedState = state;
  }

  // ====================================================================
  // 0. CELEBRATION RAINBOW: Activates ONLY and ONLY if both sensors hit black!
  //    Each LED side has a different color at the exact same time (180° offset).
  // ====================================================================
  if (bothHitBlack()) {
    if (now - lastAnimMs >= 40) {
      lastAnimMs = now;
      uint16_t hueL = (now / 8) % 360;
      uint16_t hueR = (hueL + 180) % 360; // 180° offset: Left and Right pods are different colors simultaneously!

      uint8_t lR, lG, lB;
      uint8_t rR, rG, rB;
      computeHueRGB(hueL, lR, lG, lB);
      computeHueRGB(hueR, rR, rG, rB);

      applyPodColors(lR, lG, lB, rR, rG, rB);
    }
    return;
  }

  static unsigned long lastAlertTime = 0;
  static bool alertToggle = false;
  if (now - lastAlertTime >= ALERT_BLINK_INTERVAL) {
    lastAlertTime = now;
    alertToggle = !alertToggle;
  }

  if (now - lastBlinkTime >= BLINK_INTERVAL) {
    lastBlinkTime = now;
    blinkToggle = !blinkToggle;
  }

  // 1. PHYSICAL COLLISION & OBSTACLE HAZARD OVERRIDES
  if (state == STATE_OBSTACLE_ALERT || state == STATE_COLLISION_ALERT) {
    if (alertToggle) {
      applyPodColors(255, 0, 0, 255, 0, 0);
    } else {
      applyPodColors(0, 0, 0, 0, 0, 0);
    }
    return;
  }

  // 2. GREEN COUNTDOWN DURING AUTO ARMING
  if (state == STATE_LINE_FOLLOW_READY && activeOverride == LED_OVERRIDE_NONE) {
    return;
  }

  // 3. HOST DASHBOARD LED OVERRIDES (Custom RGB, Cyan, Charge, Fault)
  if (activeOverride != LED_OVERRIDE_NONE) {
    if (activeOverride == LED_OVERRIDE_CUSTOM) {
      applyPodColors(customR, customG, customB, customR, customG, customB);
      return;
    }
    if (activeOverride == LED_OVERRIDE_CYAN) {
      applyPodColors(0, 200, 255, 0, 200, 255);
      return;
    }
    if (activeOverride == LED_OVERRIDE_FAULT) {
      if (alertToggle) {
        applyPodColors(255, 0, 0, 255, 0, 0);
      } else {
        applyPodColors(0, 0, 0, 0, 0, 0);
      }
      return;
    }
    if (activeOverride == LED_OVERRIDE_CHARGE) {
      // Warm amber charging pulse - throttled to 25 FPS (40ms)
      if (now - lastAnimMs >= 40) {
        lastAnimMs = now;
        uint8_t pulse = (uint8_t)(120 + 130 * (0.5 + 0.5 * sin(now / 180.0)));
        applyPodColors(pulse, pulse / 2, 0, pulse, pulse / 2, 0);
      }
      return;
    }
  }

  // 4. BOUNDARY LINE ALERT FLASH (Single-sensor boundary edge trip)
  if (state == STATE_LINE_ALERT) {
    if (alertToggle) {
      applyPodColors(255, 0, 0, 255, 0, 0);
    } else {
      applyPodColors(0, 0, 0, 0, 0, 0);
    }
    return;
  }

  // 5. TURNING / ROTATION / STRAFE: DEDICATED AMBER
  if (state == STATE_ROTATE_CCW || state == STATE_LEFT) {
    if (blinkToggle) {
      applyPodColors(255, 120, 0, 0, 0, 0); // Left Amber, Right OFF
    } else {
      applyPodColors(0, 0, 0, 0, 0, 0);
    }
    return;
  }

  if (state == STATE_ROTATE_CW || state == STATE_RIGHT) {
    if (blinkToggle) {
      applyPodColors(0, 0, 0, 255, 120, 0); // Left OFF, Right Amber
    } else {
      applyPodColors(0, 0, 0, 0, 0, 0);
    }
    return;
  }

  // 6. FORWARD MOTION: SOLID WHITE IN MANUAL, SOLID CYAN IN AUTO
  if (state == STATE_FORWARD || state == STATE_LINE_FOLLOWING || state == STATE_ESCAPING_LINE) {
    if (mode == MODE_MANUAL) {
      applyPodColors(255, 255, 255, 255, 255, 255); // Solid White
    } else {
      applyPodColors(0, 200, 255, 0, 200, 255);     // Solid Cyan
    }
    return;
  }

  // 7. REVERSE: SOLID RED
  if (state == STATE_BACKWARD) {
    applyPodColors(255, 0, 0, 255, 0, 0);
    return;
  }

  // 8. POST-OBSTACLE PAUSE
  if (state == STATE_LINE_FOLLOW_PAUSED) {
    applyPodColors(255, 120, 0, 255, 120, 0);
    return;
  }

  // 9. STANDBY IDLE (Solid for 3s, then Color Cycle Aura)
  if (state == STATE_STOPPED) {
    unsigned long idleDuration = now - stoppedSince;
    if (idleDuration < STANDBY_AURA_DELAY_MS) {
      if (mode == MODE_MANUAL) {
        applyPodColors(255, 255, 255, 255, 255, 255);
      } else {
        applyPodColors(0, 200, 255, 0, 200, 255);
      }
    } else {
      if (now - lastAnimMs >= 40) {
        lastAnimMs = now;
        uint16_t hue = (now / 15) % 360;
        uint8_t r, g, b;
        computeHueRGB(hue, r, g, b);
        applyPodColors(r, g, b, r, g, b);
      }
    }
    return;
  }
}
