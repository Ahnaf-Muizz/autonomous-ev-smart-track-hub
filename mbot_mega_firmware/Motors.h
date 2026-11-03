#pragma once
#include "Config.h"

void motorsInit();
void stopAllMotors();
void driveMecanum(int vy, int vx, int omega);
void driveTank(int leftSpeed, int rightSpeed);
int shapeSpeed(int v, float trim);