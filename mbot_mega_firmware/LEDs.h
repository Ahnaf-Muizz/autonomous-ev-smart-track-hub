#pragma once
#include "Config.h"

enum LEDOverrideType {
  LED_OVERRIDE_NONE,
  LED_OVERRIDE_CUSTOM,
  LED_OVERRIDE_CYAN,
  LED_OVERRIDE_CHARGE,
  LED_OVERRIDE_RAINBOW,
  LED_OVERRIDE_FAULT,
  LED_OVERRIDE_CYCLE
};

void ledsInit();
void updateLEDs(RobotState state, OperationalMode mode, int escapeDirectionSign = 0);
void resetLEDCadence();
void setCountdownVisual(int sec, bool stateOn);

// STEM Dashboard Overrides
void setCustomRGB(uint8_t r, uint8_t g, uint8_t b);
void setLEDOverride(LEDOverrideType overrideType);
void clearLEDOverride();
