#pragma once
#include "Config.h"

void lineFollowerInit();
void resetLineFollower();
void startLineFollowerRun();
bool isLineFollowerWaitingStart();
void printLineFollowerMenu();
void stepLineFollower(RobotState &currentState, bool frontObstacle, bool rearCollision);

// Finish line detector arming (called when command 'e' is received after charging)
void armFinishLineDetector();
bool isFinishLineArmed();
