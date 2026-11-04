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

  // ====================================================================
  // 1. HOST / STEM DASHBOARD LED OVERRIDES (TOP PRIORITY)
  //    Takes absolute precedence over obstacle sensors so that while the car
  //    is parked at Gate 1, the charging dock, or Gate 2, the specific mission
  //    LEDs (Cyan, Pulsing Green, Victory Green, or Fault Red) display cleanly!
  // ====================================================================
  if (activeOverride != LED_OVERRIDE_NONE) {
    if (activeOverride == LED_OVERRIDE_CUSTOM) {
      applyPodColors(customR, customG, customB, customR, customG, customB);
      return;
    }
    if (activeOverride == LED_OVERRIDE_CYAN) {
      applyPodColors(0, 200, 255, 0, 200, 255); // Solid Vibrant Cyan (Docked at Charger)
      return;
    }
    if (activeOverride == LED_OVERRIDE_CHARGE) {
      // Dynamic pulsing Green supercharging energy animation (25 FPS)
      if (now - lastAnimMs >= 40) {
        lastAnimMs = now;
        uint8_t pulse = (uint8_t)(60 + 195 * (0.5 + 0.5 * sin(now / 150.0)));
        applyPodColors(0, pulse, pulse / 5, 0, pulse, pulse / 5);
      }
      return;
    }
    if (activeOverride == LED_OVERRIDE_SUCCESS) {
      // Solid bright Emerald Green for supercharging complete & victory sprint
      applyPodColors(0, 255, 0, 0, 255, 0);
      return;
    }
    if (activeOverride == LED_OVERRIDE_FAULT) {
      // Rapid Red Alert blink on overheat or failed charge attempt
      if (alertToggle) {
        applyPodColors(255, 0, 0, 255, 0, 0);
      } else {
        applyPodColors(0, 0, 0, 0, 0, 0);
      }
      return;
    }
    if (activeOverride == LED_OVERRIDE_RAINBOW) {
      if (now - lastAnimMs >= 40) {
        lastAnimMs = now;
        uint16_t hueL = (now / 6) % 360;
        uint16_t hueR = (hueL + 180) % 360;
        uint8_t lR, lG, lB, rR, rG, rB;
        computeHueRGB(hueL, lR, lG, lB);
        computeHueRGB(hueR, rR, rG, rB);
        applyPodColors(lR, lG, lB, rR, rG, rB);
      }
      return;
    }
    if (activeOverride == LED_OVERRIDE_CYCLE) {
      if (now - lastAnimMs >= 40) {
        lastAnimMs = now;
        uint16_t hue = (now / 15) % 360;
        uint8_t r, g, b;
        computeHueRGB(hue, r, g, b);
        applyPodColors(r, g, b, r, g, b);
      }
      return;
    }
  }

  // ====================================================================
  // 2. PHYSICAL HAZARD INTERLOCKS
  // ====================================================================
  // Rear collision (physical bumper switch hit) is always a Red hazard flash
  if (state == STATE_COLLISION_ALERT) {
    if (alertToggle) {
      applyPodColors(255, 0, 0, 255, 0, 0);
    } else {
      applyPodColors(0, 0, 0, 0, 0, 0);
    }
    return;
  }

  // Front obstacle: In MANUAL mode, flash Red alert.
  // In AUTONOMOUS mode (Mode 1), arriving at Gate 1 or Gate 2 is a controlled checkpoint stop,
  // NOT an error! Hold Solid Cyan headlights instead of flashing Red!
  if (state == STATE_OBSTACLE_ALERT) {
    if (mode == MODE_MANUAL) {
      if (alertToggle) {
        applyPodColors(255, 0, 0, 255, 0, 0);
      } else {
        applyPodColors(0, 0, 0, 0, 0, 0);
      }
      return;
    } else {
      applyPodColors(0, 200, 255, 0, 200, 255); // Solid Cyan at Gate 1 & Gate 2
      return;
    }
  }

  // 3. GREEN COUNTDOWN DURING AUTO ARMING
  if (state == STATE_LINE_FOLLOW_READY && activeOverride == LED_OVERRIDE_NONE) {
    return;
  }

  // 4. BOUNDARY LINE ALERT FLASH (Single-sensor boundary edge trip in manual mode)
  if (state == STATE_LINE_ALERT) {
    if (alertToggle) {
      applyPodColors(255, 0, 0, 255, 0, 0);
    } else {
      applyPodColors(0, 0, 0, 0, 0, 0);
    }
    return;
  }

  // ====================================================================
  // 5. AUTONOMOUS EV DRIVING (MODE 1): CONSTANT SOLID CYAN HEADLIGHTS
  //    Cruising, steering, gentle rotations, or post-obstacle holds in Auto
  //    ALL shine Solid Cyan. Amber turn signals are NEVER triggered in Auto!
  // ====================================================================
  if (mode == MODE_LINE_FOLLOWER) {
    applyPodColors(0, 200, 255, 0, 200, 255); // Solid Vibrant Cyan
    return;
  }

  // ====================================================================
  // 6. MANUAL MODE (MODE 2): TELEOPERATION LIGHTING
  // ====================================================================
  // Turning / Strafe in Manual Mode: Dedicated Amber blinkers
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

  // Forward Motion: Solid White in Manual
  if (state == STATE_FORWARD || state == STATE_ESCAPING_LINE) {
    applyPodColors(255, 255, 255, 255, 255, 255); // Solid White
    return;
  }

  // Reverse: Solid Red
  if (state == STATE_BACKWARD) {
    applyPodColors(255, 0, 0, 255, 0, 0);
    return;
  }

  // Standby Idle in Manual (White for 3s, then Color Cycle Aura)
  if (state == STATE_STOPPED) {
    unsigned long idleDuration = now - stoppedSince;
    if (idleDuration < STANDBY_AURA_DELAY_MS) {
      applyPodColors(255, 255, 255, 255, 255, 255);
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
