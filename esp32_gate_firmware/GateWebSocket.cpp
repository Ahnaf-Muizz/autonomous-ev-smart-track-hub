#include "GateWebSocket.h"
#include "GateServos.h"
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>

extern unsigned int carCount;
extern GateSequenceState currentState;

static WebServer server(80);
static WebSocketsServer webSocket(81);
static bool remoteGate2Triggered = false;

static void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[WS] Client #%u connected from %s\n", num, webSocket.remoteIP(num).toString().c_str());
      {
        String greet = "{\"connected\":true,\"gate1\":\"" + String(isGate1Open() ? "OPEN" : "CLOSED") +
                       "\",\"gate2\":\"" + String(isGate2Open() ? "OPEN" : "CLOSED") + "\"}";
        webSocket.sendTXT(num, greet);
      }
      break;

    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u disconnected\n", num);
      break;

    case WStype_TEXT: {
      // 1. Build clean string from exact payload bytes [0..length)
      String msg = "";
      msg.reserve(length + 1);
      for (size_t i = 0; i < length; i++) {
        msg += (char)payload[i];
      }
      msg.trim();

      // 2. Normalize to uppercase for tolerant matching
      String upper = msg;
      upper.toUpperCase();

      Serial.printf("[WS RX #%u] Raw (%u bytes): \"%s\"\n", num, (unsigned int)length, msg.c_str());

      // 3. Command dispatch: Exclusively for Gate 2 (Gate 1 is 100% autonomous sonar only)
      if (upper.indexOf("OPEN_GATE2") >= 0 || upper.indexOf("OPEN_GATE_2") >= 0 || 
          upper.indexOf("CHARGED") >= 0 || upper == "2" || upper == "O") {
        remoteGate2Triggered = true;
        Serial.println(F(">> [REMOTE WS] Player Completed Game! Gate 2 OPEN queued!"));
        webSocket.sendTXT(num, "{\"ok\":true,\"event\":\"GATE2_OPENING\"}");
      } 
      else if (upper.indexOf("CLOSE_GATE2") >= 0 || upper.indexOf("CLOSE_GATE_2") >= 0) {
        closeGate2();
        Serial.println(F(">> [REMOTE WS] Gate 2 CLOSE request executed!"));
        webSocket.sendTXT(num, "{\"ok\":true,\"event\":\"GATE2_CLOSING\"}");
      } 
      else if (upper.indexOf("GATE1") >= 0 || upper.indexOf("GATE_1") >= 0) {
        Serial.println(F(">> [REMOTE WS] Gate 1 is 100% autonomous sonar only (wireless disabled)."));
      }
      else if (upper.indexOf("GET_STATUS") >= 0 || upper.indexOf("STATUS") >= 0 || upper == "PING") {
        String pong = "{\"pong\":true,\"gate1\":\"" + String(isGate1Open() ? "OPEN" : "CLOSED") +
                      "\",\"gate2\":\"" + String(isGate2Open() ? "OPEN" : "CLOSED") + "\"}";
        webSocket.sendTXT(num, pong);
      } 
      else {
        Serial.printf(">> [REMOTE WS WARN] Command: \"%s\"\n", msg.c_str());
      }
      break;
    }
    default:
      break;
  }
}

void gateNetworkInit() {
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.print(F("SoftAP Active. SSID: ")); Serial.println(AP_SSID);
  Serial.print(F("SoftAP IP:   ")); Serial.println(WiFi.softAPIP());

  // WebSocket Server on Port 81
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  // HTTP Endpoints on Port 80 for seamless reachability & fallback commands
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "ESP32 Gate Controller Active. Connect WebSocket to ws://192.168.4.1:81 or HTTP /cmd");
  });

  server.on("/cmd", HTTP_ANY, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "*");

    if (server.method() == HTTP_OPTIONS) {
      server.send(204);
      return;
    }

    String cmd = "";
    if (server.hasArg("cmd")) cmd = server.arg("cmd");
    else if (server.hasArg("plain")) cmd = server.arg("plain");
    cmd.trim();
    cmd.toUpperCase();

    Serial.printf("[HTTP /cmd] \"%s\"\n", cmd.c_str());

    if (cmd.indexOf("OPEN_GATE2") >= 0 || cmd.indexOf("OPEN_GATE_2") >= 0 || 
        cmd.indexOf("CHARGED") >= 0 || cmd == "2" || cmd == "O") {
      remoteGate2Triggered = true;
      server.send(200, "application/json", "{\"ok\":true,\"status\":\"GATE2_OPENING\"}");
      Serial.println(F(">> [HTTP /cmd] Gate 2 OPEN queued!"));
    } else if (cmd.indexOf("CLOSE_GATE2") >= 0 || cmd.indexOf("CLOSE_GATE_2") >= 0) {
      closeGate2();
      server.send(200, "application/json", "{\"ok\":true,\"status\":\"GATE2_CLOSING\"}");
      Serial.println(F(">> [HTTP /cmd] Gate 2 CLOSE executed!"));
    } else {
      server.send(200, "application/json", "{\"ok\":true,\"status\":\"ACK\"}");
    }
  });

  server.on("/open_gate2", HTTP_ANY, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    remoteGate2Triggered = true;
    server.send(200, "application/json", "{\"ok\":true,\"gate2\":\"OPENING\"}");
    Serial.println(F(">> [HTTP] /open_gate2 triggered!"));
  });

  server.on("/close_gate2", HTTP_ANY, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    closeGate2();
    server.send(200, "application/json", "{\"ok\":true,\"gate2\":\"CLOSING\"}");
    Serial.println(F(">> [HTTP] /close_gate2 triggered!"));
  });

  server.on("/status", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    String json = "{";
    json += "\"ok\":true,";
    json += "\"carCount\":" + String(carCount) + ",";
    json += "\"gate1\":\"" + String(isGate1Open() ? "OPEN" : "CLOSED") + "\",";
    json += "\"gate2\":\"" + String(isGate2Open() ? "OPEN" : "CLOSED") + "\",";
    json += "\"state\":" + String((int)currentState);
    json += "}";
    server.send(200, "application/json", json);
  });

  server.begin();
  Serial.println(F(">> WebSocket Server listening on ws://192.168.4.1:81"));
  Serial.println(F(">> HTTP Server listening on http://192.168.4.1:80 (/cmd, /open_gate2, /status)"));
}

void gateNetworkLoop() {
  webSocket.loop();
  server.handleClient();
}

void broadcastTelemetry(unsigned int count, GateSequenceState state, const char* eventLog) {
  String safeLog = "";
  if (eventLog && strlen(eventLog) > 0) {
    for (size_t i = 0; i < strlen(eventLog); i++) {
      char c = eventLog[i];
      if (c == '"' || c == '\\') safeLog += '\\';
      if (c >= 32 && c <= 126) safeLog += c;
    }
  }

  String json = "{";
  json += "\"carCount\":" + String(count) + ",";
  json += "\"gate1\":\"" + String(isGate1Open() ? "OPEN" : "CLOSED") + "\",";
  json += "\"gate2\":\"" + String(isGate2Open() ? "OPEN" : "CLOSED") + "\",";
  json += "\"state\":" + String((int)state) + ",";
  json += "\"log\":\"" + safeLog + "\"";
  json += "}";

  webSocket.broadcastTXT(json);
}

bool pollRemoteGate2Trigger() {
  if (remoteGate2Triggered) {
    remoteGate2Triggered = false;
    return true;
  }
  return false;
}
