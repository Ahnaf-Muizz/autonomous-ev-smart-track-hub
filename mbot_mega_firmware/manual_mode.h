#pragma once
#include "Config.h"

void manualModeInit();
void printManualModeMenu();

void stepManualModeSafety(RobotState &currentState, LineEscapeDirection &allowedEscape,
                          int &escapeDirectionSign, unsigned long &escapeStartTime,
                          bool onLine, bool frontHit, bool rearHit);

void handleManualModeChar(char cmd, RobotState &currentState, LineEscapeDirection &allowedEscape,
                          int &escapeDirectionSign, unsigned long &escapeStartTime,
                          bool onLine, bool frontHit, bool rearHit);

int getManualSpeed();
void setManualSpeed(int newSpeed);

bool isLineSafetyEnabled();
bool isFrontBarrierSafetyEnabled();
bool isRearCollisionSafetyEnabled();