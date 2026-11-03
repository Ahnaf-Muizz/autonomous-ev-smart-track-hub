#include "LEDs.h"

void ledsInit() {
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  setLeds(true, false, false);
}

void setLeds(bool red, bool yellow, bool green) {
  digitalWrite(PIN_LED_RED,    red    ? HIGH : LOW);
  digitalWrite(PIN_LED_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(PIN_LED_GREEN,  green  ? HIGH : LOW);
}