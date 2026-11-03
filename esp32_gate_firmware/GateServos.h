#pragma once
#include "Config.h"
#include <ESP32Servo.h>

void gateServosInit();
void gateServosLoop();

void openGate1();
void closeGate1();
void openGate2();
void closeGate2();
void closeAllGates();

bool isGate1Open();
bool isGate2Open();
