#pragma once
#include <Arduino.h>

// ==========================================
// 1. PIN CONFIGURATIONS (ALL ON VIN SIDE)
// ==========================================
const uint8_t PIN_TRIG        = 13;  // Ultrasonic Trigger
const uint8_t PIN_ECHO        = 12;  // Ultrasonic Echo (Level-shifted to 3.3V)

const uint8_t PIN_SERVO_1     = 14;  // Gate 1: Entry Barrier (GPIO 14) - Ultrasonic only
const uint8_t PIN_SERVO_2     = 27;  // Gate 2: Exit Barrier (GPIO 27) - WebSocket only

const uint8_t PIN_LED_RED     = 26;  // Bank of 3 Red LEDs
const uint8_t PIN_LED_YELLOW  = 25;  // Bank of 3 Yellow LEDs
const uint8_t PIN_LED_GREEN   = 33;  // Bank of 3 Green LEDs

const uint8_t PIN_BUZZER      = 32;  // Passive Buzzer

// ==========================================
// 2. CALIBRATION & TIMING CONSTANTS
// ==========================================
const int TRIGGER_DISTANCE_CM         = 15;     // Ultrasonic trip threshold (cm)
const unsigned long CAR_LOCKOUT_MS    = 30000; // 30.0s debounce between car counts
const unsigned long STAGE_DELAY_MS    = 1000;  // 1.0s duration per color stage

// Independent Autonomous Gate Timers:
const unsigned long GATE1_HOLD_OPEN_MS = 5000; // Gate 1 closes exactly 20.0s after ultrasonic opens it
const unsigned long GATE2_HOLD_OPEN_MS = 5000; // Gate 2 closes exactly 10.0s after WebSocket opens it

// Hardware Calibration Parameters (Calibrated per Gate)
const int S1_ANGLE_OPEN               = 0;     // Gate 1: Entry Barrier Open (0 deg)
const int S1_ANGLE_CLOSED             = 90;    // Gate 1: Entry Barrier Closed (90 deg)

const int S2_ANGLE_OPEN               = 180;   // Gate 2: Exit Barrier Open (180 deg)
const int S2_ANGLE_CLOSED             = 90;    // Gate 2: Exit Barrier Closed (90 deg)

// Pulse width limits (Standard micro-servos)
const int SERVO_MIN_US                = 500;
const int SERVO_MAX_US                = 2400;

// Active travel hold window before cutting PWM train (allows physical swing, then detaches to eliminate jitter)
const unsigned long SERVO_TRAVEL_MS   = 100; 

// SoftAP Credentials
const char* const AP_SSID             = "ESP32_Gate_Network";
const char* const AP_PASS             = "gate1234";

// ==========================================
// 3. SYSTEM STATE MACHINE
// ==========================================
enum GateSequenceState {
  IDLE_STANDBY,     // 0: Standby, solid red LEDs
  STAGE_RED,        // 1: Ultrasonic trip cue
  STAGE_YELLOW,     // 2: Warning cue
  STAGE_GREEN,      // 3: Entry chime, Gate 1 opens
  GATE1_OPEN_HOLD,  // 4: Gate 1 held open for 20s
  GATE2_OPEN_HOLD   // 5: Gate 2 opened via WS for 10s
};
