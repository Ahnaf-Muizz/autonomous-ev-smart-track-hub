#pragma once
#include <Arduino.h>

// --- HARDWARE PIN DEFINITIONS ---
const uint8_t PIN_LED_RIGHT    = 65;  // A11 (Right 4-LED WS2812B Pod)
const uint8_t PIN_LED_LEFT     = 66;  // A12 (Left 4-LED WS2812B Pod)
const uint8_t PIN_OBS_FRONT    = A15; // Pin 69 (Front Center IR Barrier Sensor)
const uint8_t PIN_LINE_LEFT    = A6;  // Dual Digital Boundary Sensor Left
const uint8_t PIN_LINE_RIGHT   = A7;  // Dual Digital Boundary Sensor Right
const uint8_t PIN_COLLISION_RL = A9;  // Pin 63 (Rear Left Bumper Switch)
const uint8_t PIN_COLLISION_RR = A10; // Pin 64 (Rear Right Bumper Switch)

// --- THRESHOLDS & LOGIC LEVELS ---
const int COLLISION_TRIGGER        = LOW;  // Active-LOW mechanical bumper
const int OBSTACLE_THRESHOLD       = 350;  // < 350 ADC = Front barrier detected
const int BLACK_LINE_LOGIC         = LOW;  // 0 = Black tape boundary, 1 = Safe white track

// --- MOTOR LIMITS & SPEED DEFAULTS ---
const int MIN_RUN                  = 60;   // Lowest continuous DC motor run threshold
const int MAX_SPEED                = 200;  // Maximum manual speed ceiling
const int DEFAULT_MANUAL_SPEED     = 100;  // Default manual speed
const unsigned long DITHER_MS      = 60;   // PWM dither cycle period

const float LEFT_TRIM              = 1.00;
const float RIGHT_TRIM             = 1.00;

// Autonomous Line Follower Speeds
const int LINE_FOLLOW_BASE_SPEED   = 70;   // Forward cruising speed
const int LINE_FOLLOW_ROTATE_SPEED = 40;   // Gentle in-place rotation speed
const unsigned long CLEARANCE_SETTLE_MS = 100; // Settle window before resuming forward

// --- TIMING CONSTANTS ---
const unsigned long BLINK_INTERVAL          = 350;  // Amber turn signal cadence
const unsigned long ALERT_BLINK_INTERVAL    = 150;  // Rapid red hazard flash
const unsigned long ESCAPE_WINDOW_MS        = 1000; // 1.0s manual escape window
const unsigned long OBSTACLE_CLEAR_DELAY_MS = 3000; // 3.0s hold after obstacle/gate clears in Auto
const unsigned long STANDBY_AURA_DELAY_MS   = 3000; // 3.0s transition before idle color cycle

// --- SYSTEM ENUMS ---
enum OperationalMode {
  MODE_MANUAL,
  MODE_LINE_FOLLOWER
};

enum RobotState {
  STATE_STOPPED,
  STATE_FORWARD,
  STATE_BACKWARD,
  STATE_LEFT,
  STATE_RIGHT,
  STATE_ROTATE_CCW,
  STATE_ROTATE_CW,
  STATE_OBSTACLE_ALERT,
  STATE_LINE_ALERT,
  STATE_COLLISION_ALERT,
  STATE_ESCAPING_LINE,
  STATE_LINE_FOLLOW_READY,
  STATE_LINE_FOLLOWING,
  STATE_LINE_FOLLOW_PAUSED
};

enum LineEscapeDirection {
  ESCAPE_NONE,
  ESCAPE_REQUIRE_BACKWARD,
  ESCAPE_REQUIRE_FORWARD
};