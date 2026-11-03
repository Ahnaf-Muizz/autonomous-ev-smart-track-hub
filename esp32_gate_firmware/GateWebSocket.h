#pragma once
#include "Config.h"

void gateNetworkInit();
void gateNetworkLoop();

// Broadcasts JSON telemetry updates to connected dashboard clients
void broadcastTelemetry(unsigned int count, GateSequenceState state, const char* eventLog = "");

// Returns true if dashboard commanded Gate 2 to open (cleared upon read)
bool pollRemoteGate2Trigger();