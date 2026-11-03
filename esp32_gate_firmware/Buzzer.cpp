#include "Buzzer.h"

void buzzerInit() {
  pinMode(PIN_BUZZER, OUTPUT);
  stopTone();
}

void playTone(uint32_t frequency) {
  if (frequency > 0) {
    tone(PIN_BUZZER, frequency);
  } else {
    noTone(PIN_BUZZER);
  }
}

void stopTone() {
  noTone(PIN_BUZZER);
}