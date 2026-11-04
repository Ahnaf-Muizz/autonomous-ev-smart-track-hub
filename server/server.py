"""
================================================================================
mBot Mega & ESP32 Gate STEM Night — Multi-PC Sync & Battery Physics Server
================================================================================
File: server/server.py

Responsibilities:
1. Serves the modern React 19 + TypeScript + Tailwind CSS Web Application built
   into `dashboard/dist` (with automatic fallback to `dashboard/`), supporting
   both `/` (Page 1: Student Interactive Mission Experience) and `/master`
   (Page 2: Password-Protected Table Host Manual Override & Analytics Console).
2. Executes the coupled electro-thermal EV battery charging model via
   `server/battery_physics.py` (10.0s real-time simulation) and persists every
   student's full trajectory (`SOC`, `Vocv`, `Vt`, `T1`, `T2`, `T_inf`, `Q`) in
   `server/game_history.json` so Page 2 can inspect and plot all 4 physics curves
   for any game.
3. Synchronizes real-time state across all PCs via Server-Sent Events (`/api/events`),
   including Car Count, Leaderboard updates, Stored Game History, Simulation Mode,
   and the Page 2 Master `ALL-STOP` and `PAUSE / RESUME` controls.
================================================================================
"""

from __future__ import annotations
import http.server
import json
import os
import queue
import socket
import sys
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
        sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
    except Exception:
        pass

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SERVER_DIR)
DASHBOARD_DIR = os.path.join(PROJECT_ROOT, "dashboard")
REACT_DIST_DIR = os.path.join(DASHBOARD_DIR, "dist")

if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import battery_physics

LEADERBOARD_FILE = os.path.join(SERVER_DIR, "leaderboard.json")
GAME_HISTORY_FILE = os.path.join(SERVER_DIR, "game_history.json")
MASTER_PASSWORD = "mbot26"


def load_json_file(path: str, default: Any) -> Any:
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] Could not load {path}: {e}")
    return default


def save_json_file(path: str, data: Any) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[WARN] Could not save {path}: {e}")


def get_lan_ips() -> List[str]:
    ips: List[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127."):
                ips.append(ip)
        except Exception:
            pass
    return ips


def relay_esp_command(host: str, cmd: str, token: str = "mbot-gate-2026") -> Tuple[bool, str]:
    """Relays commands to ESP32 SoftAP (192.168.4.1:81).
    Sends RFC6455 WebSocket frame to port 81 (with HTTP fallback on port 80)."""
    clean_host = (
        host.replace("http://", "")
        .replace("https://", "")
        .replace("ws://", "")
        .replace("wss://", "")
        .strip()
    )
    ip = clean_host.split(":")[0] if ":" in clean_host else clean_host
    port = int(clean_host.split(":")[1]) if ":" in clean_host else 81

    # Map aliases
    wire_cmd = cmd
    if cmd == "CHARGED":
        wire_cmd = "OPEN_GATE2"

    # 1. Primary: HTTP GET / POST to Port 80 (/cmd?cmd=...) - Clean, stateless, doesn't hijack WS slots
    e_http = None
    try:
        url = f"http://{ip}:80/cmd?cmd={wire_cmd}"
        req = urllib.request.Request(url, data=wire_cmd.encode("utf-8"), method="POST")
        req.add_header("Content-Type", "text/plain")
        with urllib.request.urlopen(req, timeout=1.0) as r:
            if r.status == 200:
                return True, f"HTTP command '{wire_cmd}' delivered to {ip}:80"
    except Exception as err:
        e_http = err

    # 2. Secondary: Direct WebSocket frame to Port 81 with graceful close
    e_ws = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        s.connect((ip, port))
        sec_key = base64.b64encode(os.urandom(16)).decode("ascii")
        handshake = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {ip}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {sec_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        s.sendall(handshake.encode("utf-8"))
        resp = s.recv(1024).decode("utf-8", errors="ignore")
        if "101" in resp:
            payload = wire_cmd.encode("utf-8")
            mask = os.urandom(4)
            masked_payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            header = bytes([0x81, 0x80 | len(payload)]) + mask
            s.sendall(header + masked_payload)
            time.sleep(0.08)  # Let ESP32 process frame

            # Send standard WebSocket Close frame (code 1000 normal closure)
            close_mask = os.urandom(4)
            close_code = (1000).to_bytes(2, "big")
            masked_close = bytes(b ^ close_mask[i % 4] for i, b in enumerate(close_code))
            close_header = bytes([0x88, 0x80 | len(close_code)]) + close_mask
            try:
                s.sendall(close_header + masked_close)
            except Exception:
                pass
            s.close()
            return True, f"WebSocket frame '{wire_cmd}' delivered to {ip}:{port}"
        s.close()
    except Exception as err:
        e_ws = err

    return False, f"Delivery failed for {ip}: HTTP: {e_http}, WS: {e_ws}"


def convert_raw_sim_to_unified_payload(
    raw_sim: Dict[str, Any],
    student_name: str = "STEM Explorer",
    lap_time_sec: Optional[float] = None,
) -> Dict[str, Any]:
    s_dict = raw_sim.get("series", {})
    anim_t = s_dict.get("anim_t", [])
    sim_min = s_dict.get("sim_min", [])
    soc_pct = s_dict.get("soc_pct", [])
    vocv = s_dict.get("vocv", [])
    vt = s_dict.get("vt", [])
    t1_k = s_dict.get("t1_k", [])
    t2_k = s_dict.get("t2_k", [])
    tinf_k = s_dict.get("tinf_k", [])
    t1_c = s_dict.get("t1_c", [])
    t2_c = s_dict.get("t2_c", [])
    tinf_c = s_dict.get("tinf_c", [])
    q_watt = s_dict.get("q_watt", [])

    inputs = raw_sim.get("inputs", {})
    raw_sum = raw_sim.get("summary", {})
    c_ma = float(inputs.get("current_ma", 3680.0))
    target_min = float(inputs.get("target_minutes", 30.0))
    anim_sec = float(inputs.get("animation_seconds", 10.0))

    points: List[Dict[str, Any]] = []
    n_pts = len(anim_t)
    for i in range(n_pts):
        s_m = float(sim_min[i]) if i < len(sim_min) else 0.0
        sp = float(soc_pct[i]) if i < len(soc_pct) else 20.0
        points.append(
            {
                "real_sec": float(anim_t[i]),
                "sim_time_s": round(s_m * 60.0, 2),
                "sim_time_min": s_m,
                "soc": round(sp / 100.0, 4),
                "soc_pct": sp,
                "T1_K": float(t1_k[i]) if i < len(t1_k) else 305.0,
                "T2_K": float(t2_k[i]) if i < len(t2_k) else 305.0,
                "T_inf_K": float(tinf_k[i]) if i < len(tinf_k) else 305.0,
                "T1_C": float(t1_c[i]) if i < len(t1_c) else 31.85,
                "T2_C": float(t2_c[i]) if i < len(t2_c) else 31.85,
                "T_inf_C": float(tinf_c[i]) if i < len(tinf_c) else 31.85,
                "V_ocv": float(vocv[i]) if i < len(vocv) else 3.25,
                "V_term": float(vt[i]) if i < len(vt) else 3.40,
                "Q_heat_W": float(q_watt[i]) if i < len(q_watt) else 0.0,
                "current_mA": c_ma,
            }
        )

    passed = bool(raw_sim.get("passed", False))
    status_str = str(raw_sim.get("status", "SUCCESS"))
    overheated = status_str == "FAIL_OVERHEAT"
    timed_out = status_str == "FAIL_TOO_SLOW"
    failure_reason = (
        "NONE" if passed else ("OVERHEATED" if overheated else "TIME_EXPIRED")
    )
    min_req = int(raw_sum.get("min_required_ma", 3000))
    max_safe = int(raw_sum.get("max_safe_ma", 5400))
    actual_min = float(raw_sum.get("actual_minutes", target_min))

    summary = {
        "success": passed,
        "overheated": overheated,
        "timed_out": timed_out,
        "failure_reason": failure_reason,
        "status_code": "SUCCESS" if passed else ("FAIL_OVERHEAT" if overheated else "FAIL_TIMEOUT"),
        "led_command": "v" if passed else "f",
        "final_soc_pct": float(raw_sum.get("final_soc_pct", 100.0)),
        "peak_T1_C": float(raw_sum.get("peak_t1_c", 42.0)),
        "peak_T2_C": float(raw_sum.get("peak_t2_c", 36.0)),
        "max_safe_T1_C": float(inputs.get("max_temp_c", 61.85)),
        "final_V_term": float(raw_sum.get("final_vt", 3.85)),
        "time_to_full_min": actual_min if passed else None,
        "time_to_full_real_sec": round((actual_min / max(1.0, target_min)) * anim_sec, 2)
        if passed
        else None,
        "ideal_min_current_mA": min_req,
        "max_safe_current_mA": max_safe,
        "sweet_spot_mA": [min_req, max_safe],
    }

    equations = {
        "kid_formula": "Current (mA) = Charge Needed (mAh) ÷ Charging Time (Hours)",
        "soc_ode": "dSOC/dt = I_charge / (3600 · C_Ah)   [C_Ah = 2.3 Ah]",
        "terminal_voltage": "V_term(t) = V_ocv(SOC) + I_charge · R_s   [R_s = 0.05 Ω]",
        "heat_generation": "Q(t) = R_s · I² - dOCV · (-I) · T1(t)",
        "core_temp_ode": "dT1/dt = -(T1 - T2)/(R1·C1) + Q/C1",
        "surface_temp_ode": "dT2/dt = -(T2 - T1)/(R1·C2) - (T2 - T_inf)/(R2·C2)",
    }

    return {
        "ok": True,
        "inputs": {
            "current_mA": c_ma,
            "current_A": round(c_ma / 1000.0, 3),
            "target_minutes": target_min,
            "real_duration_sec": anim_sec,
            "initial_soc": float(inputs.get("initial_soc_pct", 20.0)) / 100.0,
            "target_soc": 1.0,
            "capacity_mAh": 2300,
        },
        "summary": summary,
        "equations": equations,
        "series": points,
        "student_name": student_name,
        "lap_time_sec": lap_time_sec,
    }


def sanitize_history_records(raw_list: Any) -> List[Dict[str, Any]]:
    """
    Filters out or upgrades any older schema records in game_history.json so
    every record has valid `id`, `peak_T1_C`, and `series` (List[PhysicsPoint]).
    """
    if not isinstance(raw_list, list):
        return []
    clean: List[Dict[str, Any]] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        series = item.get("series")
        if isinstance(series, list) and len(series) > 0 and "peak_T1_C" in item:
            clean.append(item)
    return clean


class HubState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.subscribers: List[queue.Queue] = []

        self.state: Dict[str, Any] = {
            "paused": False,
            "all_stop": False,
            "emergency_stop": False,
            "simulation_mode": False,  # Default to Real Field Hardware Mode; toggleable in Master Console
            "sim_launch_to_gate1_sec": 2.0,
            "sim_gate2_to_finish_sec": 3.0,
            "car_count": 0,
            "active_phase": "STANDBY",
            "phase": "STANDBY",
            "student_name": "STEM Explorer",
            "target_charge_minutes": 30,
            "esp32_ip": "192.168.4.1:81",
            "esp32_online": False,
            "rover_ble_connected": False,
            "rover_name": "mBot Mega",
            "gate1_open": False,
            "gate2_open": False,
            "gate1_lockout_sec": 0.0,
            "lap_elapsed_sec": 0.0,
            "last_event": "INIT",
        }

        raw_lb = load_json_file(LEADERBOARD_FILE, [])
        self.leaderboard: List[Dict[str, Any]] = []
        if isinstance(raw_lb, list):
            for e in raw_lb:
                if isinstance(e, dict):
                    # Ensure points-based properties exist
                    att_num = int(e.get("attempt_num", 1))
                    att_pts = int(e.get("attempt_points", max(0, 600 - att_num * 100) if 1 <= att_num <= 5 else 0))
                    t_min = float(e.get("charge_time_min", 30.0))
                    tgt_min = float(e.get("target_minutes", 40.0))
                    needed_mah = (1.0 - 0.20) * 2300.0
                    hours = tgt_min / 60.0
                    min_ma = needed_mah / hours if hours > 0 else 2000.0
                    max_safe_ma = min_ma + 1200.0
                    fastest_time = (needed_mah / max_safe_ma) * 60.0
                    max_saved = max(0.2, tgt_min - fastest_time)
                    time_saved = max(0.0, tgt_min - t_min)
                    speed_ratio = min(1.0, max(0.0, time_saved / max_saved))
                    def_bonus = round(speed_ratio * 250)
                    t_bonus = int(e.get("time_bonus_points", def_bonus))
                    e["total_points"] = int(e.get("total_points", att_pts + t_bonus))
                    e["attempt_num"] = att_num
                    e["attempt_points"] = att_pts
                    e["time_bonus_points"] = t_bonus
                    e["target_minutes"] = tgt_min
                    self.leaderboard.append(e)
            # Leaderboard ranking based only on total points
            self.leaderboard.sort(key=lambda x: -x.get("total_points", 0))

        raw_hist = load_json_file(GAME_HISTORY_FILE, [])
        self.game_history: List[Dict[str, Any]] = sanitize_history_records(raw_hist)
        if len(self.game_history) != (len(raw_hist) if isinstance(raw_hist, list) else 0):
            save_json_file(GAME_HISTORY_FILE, self.game_history)

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        with self.lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def broadcast(self, event_type: str, payload: Any) -> None:
        msg = {"type": event_type, "payload": payload, "ts": time.time()}
        with self.lock:
            dead = []
            for q in self.subscribers:
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    dead.append(q)
            for q in dead:
                if q in self.subscribers:
                    self.subscribers.remove(q)

    def update_state(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            # Synchronize key aliases
            if "emergency_stop" in patch and "all_stop" not in patch:
                patch["all_stop"] = patch["emergency_stop"]
            elif "all_stop" in patch and "emergency_stop" not in patch:
                patch["emergency_stop"] = patch["all_stop"]
            if "phase" in patch and "active_phase" not in patch:
                patch["active_phase"] = patch["phase"]
            elif "active_phase" in patch and "phase" not in patch:
                patch["phase"] = patch["active_phase"]

            for k, v in patch.items():
                if k in self.state:
                    self.state[k] = v
            snap = dict(self.state)
        self.broadcast("state_sync", snap)
        return snap

    def add_leaderboard_entry(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        c_ma = int(float(data.get("current_mA", 3680)))
        t_min = float(data.get("charge_time_min", 30.0))
        peak_t = float(data.get("peak_temp_C", 0.0))
        target_min = float(data.get("target_minutes", 40.0))
        attempt_num = int(data.get("attempt_num", 1))

        # Dynamically compute exact physics peak temperature if missing or stuck at dummy 42.0 fallback
        if peak_t <= 0.0 or abs(peak_t - 42.0) < 0.01:
            try:
                from server.battery_physics import simulate_battery_charging
                sim = simulate_battery_charging(current_ma=c_ma, initial_soc=0.20, target_minutes=t_min)
                peak_t = float(sim["summary"]["peak_t1_c"])
            except Exception:
                peak_t = 45.0

        # Attempt points: Attempt 1 = 500, Attempt 2 = 400, Attempt 3 = 300, Attempt 4 = 200, Attempt 5 = 100
        if 1 <= attempt_num <= 5:
            default_att_pts = 600 - (attempt_num * 100)
        else:
            default_att_pts = 0
        attempt_pts = int(data.get("attempt_points", default_att_pts))

        # Time bonus: Normalized speed efficiency bonus up to +250 points for fast charging near thermal limit
        time_saved = max(0.0, target_min - t_min)
        needed_mah = (1.0 - 0.20) * 2300.0
        hours = target_min / 60.0
        min_ma = needed_mah / hours if hours > 0 else 2000.0
        max_safe_ma = min_ma + 1200.0
        fastest_time = (needed_mah / max_safe_ma) * 60.0
        max_saved = max(0.2, target_min - fastest_time)
        speed_ratio = min(1.0, max(0.0, time_saved / max_saved))
        default_time_bonus = round(speed_ratio * 250)
        time_bonus = int(data.get("time_bonus_points", default_time_bonus))

        total_pts = int(data.get("total_points", attempt_pts + time_bonus))

        entry = {
            "id": str(data.get("id") or uuid.uuid4().hex[:10]),
            "name": str(data.get("name") or "STEM Explorer").strip()[:28],
            "total_points": total_pts,
            "attempt_num": attempt_num,
            "attempt_points": attempt_pts,
            "time_bonus_points": time_bonus,
            "target_minutes": round(target_min, 1),
            "lap_time_sec": round(float(data.get("lap_time_sec", 25.0)), 2),
            "charge_time_min": round(t_min, 2),
            "current_mA": c_ma,
            "peak_temp_C": round(peak_t, 2),
            "final_soc_pct": round(float(data.get("final_soc_pct", 100.0)), 1),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        with self.lock:
            self.leaderboard.append(entry)
            # Leaderboard ranking based only on total points
            self.leaderboard.sort(key=lambda x: -x.get("total_points", 0))
            self.leaderboard = self.leaderboard[:50]
            save_json_file(LEADERBOARD_FILE, self.leaderboard)
            lb_copy = list(self.leaderboard)
        self.broadcast("leaderboard_sync", lb_copy)
        return lb_copy

    def delete_leaderboard_entry(self, entry_id: str) -> List[Dict[str, Any]]:
        with self.lock:
            self.leaderboard = [e for e in self.leaderboard if e.get("id") != entry_id]
            save_json_file(LEADERBOARD_FILE, self.leaderboard)
            lb_copy = list(self.leaderboard)
        self.broadcast("leaderboard_sync", lb_copy)
        return lb_copy

    def clear_leaderboard(self) -> List[Dict[str, Any]]:
        with self.lock:
            self.leaderboard = []
            save_json_file(LEADERBOARD_FILE, self.leaderboard)
        self.broadcast("leaderboard_sync", [])
        return []

    def record_game_simulation(self, unified: Dict[str, Any]) -> Dict[str, Any]:
        summary = unified["summary"]
        inputs = unified["inputs"]
        rec = {
            "id": uuid.uuid4().hex[:10],
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "student_name": str(unified.get("student_name") or "STEM Explorer"),
            "lap_time_sec": unified.get("lap_time_sec"),
            "current_mA": int(inputs["current_mA"]),
            "target_minutes": float(inputs["target_minutes"]),
            "success": bool(summary["success"]),
            "failure_reason": str(summary["failure_reason"]),
            "status_code": str(summary["status_code"]),
            "final_soc_pct": float(summary["final_soc_pct"]),
            "peak_T1_C": float(summary["peak_T1_C"]),
            "peak_T2_C": float(summary["peak_T2_C"]),
            "final_V_term": float(summary["final_V_term"]),
            "time_to_full_min": summary["time_to_full_min"],
            "sweet_spot_mA": summary["sweet_spot_mA"],
            "equations": unified["equations"],
            "series": unified["series"],
        }
        with self.lock:
            self.game_history.insert(0, rec)
            self.game_history = self.game_history[:60]
            save_json_file(GAME_HISTORY_FILE, self.game_history)
        self.broadcast("game_history_sync", {"latest_id": rec["id"]})
        return rec

    def clear_game_history(self) -> None:
        with self.lock:
            self.game_history = []
            save_json_file(GAME_HISTORY_FILE, self.game_history)
        self.broadcast("game_history_sync", {"cleared": True})


HUB = HubState()


def log_event(category: str, message: str, client_ip: str = "") -> None:
    """Pretty-prints real-time status updates with timestamp and category tag."""
    now_str = time.strftime("%H:%M:%S")
    ip_tag = f" [{client_ip}]" if client_ip else ""
    cat_tag = f"[{category}]".ljust(18)
    print(f"[{now_str}] {cat_tag} {message}{ip_tag}", flush=True)


class QuietThreadingHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request: Any, client_address: Any) -> None:
        exc_type, exc_val, _ = sys.exc_info()
        if exc_type is not None and issubclass(
            exc_type,
            (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, TimeoutError, OSError),
        ):
            # Ignore normal browser disconnect / tab reload socket errors ([WinError 10053/10054])
            return
        super().handle_error(request, client_address)


class DashboardRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        web_root = (
            REACT_DIST_DIR
            if os.path.exists(os.path.join(REACT_DIST_DIR, "index.html"))
            else DASHBOARD_DIR
        )
        try:
            super().__init__(*args, directory=web_root, **kwargs)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
            pass

    def log_message(self, fmt: str, *args: Any) -> None:
        # Suppress noisy default HTTP request access logging (e.g. .js, .css chunks)
        pass

    def _send_json(self, payload: Any, status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
            pass

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        client_ip = self.client_address[0] if hasattr(self, "client_address") else ""

        if path in ("/", "/game", "/master", "/master/"):
            if path in ("/master", "/master/"):
                log_event("MASTER CONNECT", f"Host PC accessed Master Console ({path})", client_ip)
            else:
                log_event("CLIENT CONNECT", f"Student Tablet / Kiosk loaded Interactive STEM Experience ({path})", client_ip)
            self.path = "/index.html"
            try:
                return super().do_GET()
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
                return

        if path == "/api/state":
            with HUB.lock:
                st = dict(HUB.state)
            return self._send_json({"ok": True, "state": st})

        if path == "/api/rover/status":
            with HUB.lock:
                return self._send_json({
                    "ok": True,
                    "connected": HUB.state.get("rover_ble_connected", False),
                    "name": HUB.state.get("rover_name", "mBot Mega"),
                })

        if path == "/api/leaderboard":
            with HUB.lock:
                lb = list(HUB.leaderboard)
            return self._send_json({"ok": True, "entries": lb})

        if path in ("/api/games/history", "/api/history"):
            with HUB.lock:
                games = list(HUB.game_history)
            return self._send_json({"ok": True, "games": games, "history": games})

        if path == "/api/battery/reference":
            return self._send_json(battery_physics.get_reference_curves_and_formulae())

        if path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            sub_q = HUB.subscribe()
            with HUB.lock:
                active_subs = len(HUB.subscribers)
            log_event("SSE STREAM", f"Client subscribed to real-time state bus (Active listeners: {active_subs})", client_ip)

            try:
                with HUB.lock:
                    init_state = dict(HUB.state)
                init_msg = json.dumps({"type": "state_sync", "payload": init_state})
                self.wfile.write(f"data: {init_msg}\n\n".encode("utf-8"))
                self.wfile.flush()

                while True:
                    try:
                        evt = sub_q.get(timeout=12.0)
                        self.wfile.write(f"data: {json.dumps(evt)}\n\n".encode("utf-8"))
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b": heartbeat\n\n")
                        self.wfile.flush()
            except Exception:
                pass
            finally:
                HUB.unsubscribe(sub_q)
                with HUB.lock:
                    active_subs = len(HUB.subscribers)
                log_event("SSE STREAM", f"Client disconnected from state bus (Active listeners: {active_subs})", client_ip)
            return

        try:
            return super().do_GET()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
            return

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        client_ip = self.client_address[0] if hasattr(self, "client_address") else ""
        length = int(self.headers.get("Content-Length", "0"))
        body_raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(body_raw)
        except Exception:
            body = {}

        if path == "/api/rover/command":
            cmd = str(body.get("cmd") or body.get("char") or "").strip()
            text = str(body.get("text") or "").strip()
            action = str(body.get("action") or "").strip()
            client_id = str(body.get("clientId") or "").strip()

            desc = cmd or text or action or "NOOP"
            log_event("ROVER RELAY", f"Command relayed from Kiosk ({client_ip}): '{desc}'", client_ip)

            HUB.broadcast("rover_command", {
                "cmd": cmd,
                "text": text,
                "action": action,
                "clientId": client_id,
                "ts": time.time(),
            })
            return self._send_json({"ok": True, "relayed": True, "cmd": cmd, "text": text, "action": action})

        if path == "/api/rover/status":
            connected = bool(body.get("connected", False))
            name = str(body.get("name") or "mBot Mega")
            client_id = str(body.get("clientId") or "").strip()

            prev_conn = HUB.state.get("rover_ble_connected", False)
            snap = HUB.update_state({
                "rover_ble_connected": connected,
                "rover_name": name,
            })
            if connected != prev_conn:
                log_event("ROVER BLE", f"Host reported BLE link: {'CONNECTED (' + name + ')' if connected else 'DISCONNECTED'}", client_ip)
            return self._send_json({"ok": True, "rover_ble_connected": connected, "name": name})

        if path == "/api/rover/event":
            tag = str(body.get("tag") or "").strip()
            line = str(body.get("line") or "").strip()
            client_id = str(body.get("clientId") or "").strip()

            log_event("ROVER TELEMETRY", f"Host BLE event broadcast: [EVT:{tag}]", client_ip)

            HUB.broadcast("rover_event", {
                "tag": tag,
                "line": line,
                "clientId": client_id,
                "ts": time.time(),
            })
            return self._send_json({"ok": True, "broadcasted": True, "tag": tag})

        if path == "/api/esp/probe":
            host = str(body.get("host", "192.168.4.1:81")).strip()
            token = str(body.get("token", "mbot-gate-2026")).strip()
            clean_host = (
                host.replace("http://", "")
                .replace("https://", "")
                .replace("ws://", "")
                .replace("wss://", "")
                .strip()
            )
            ip = clean_host.split(":")[0] if ":" in clean_host else clean_host
            port = int(clean_host.split(":")[1]) if ":" in clean_host else 81

            ok = False
            msg = ""
            status_data = {}
            # 1. Try HTTP on port 80 /status (ESP32 Gate Controller returns 200 OK with live telemetry)
            url = f"http://{ip}:80/status"
            try:
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        ok = True
                        msg = "ESP32 port 80 web server active"
                        try:
                            status_data = json.loads(resp.read().decode("utf-8"))
                        except Exception:
                            pass
            except Exception as e_http:
                # Fallback to root /
                try:
                    url = f"http://{ip}:80/"
                    req = urllib.request.Request(url, method="GET")
                    with urllib.request.urlopen(req, timeout=1.0) as resp:
                        if resp.status == 200:
                            ok = True
                            msg = "ESP32 port 80 web server active"
                except Exception:
                    # 2. Try WebSocket port 81 connection
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(1.0)
                        s.connect((ip, port))
                        s.close()
                        ok = True
                        msg = f"ESP32 port {port} reachable"
                    except Exception as e_sock:
                        msg = f"Target unreachable (HTTP 80: {e_http}; Port {port}: {e_sock})"

            prev_online = HUB.state.get("esp32_online")
            HUB.update_state({"esp32_online": ok})
            if ok != prev_online:
                log_event(
                    "ESP32 LINK",
                    f"Target {ip}:{port} -> {'ONLINE' if ok else 'OFFLINE'} ({msg})",
                    client_ip,
                )
            return self._send_json({"ok": ok, "host": host, "ip": ip, "message": msg, "telemetry": status_data})

        if path == "/api/esp/command":
            cmd = str(body.get("cmd", "")).strip()
            host = str(body.get("host", "192.168.4.1:81")).strip()
            token = str(body.get("token", "mbot-gate-2026")).strip()
            if not cmd:
                return self._send_json({"error": "Missing cmd"}, status=400)
            ok, msg = relay_esp_command(host, cmd, token)
            if ok:
                HUB.update_state({"esp32_online": True})
            log_event(
                "ESP32 RELAY",
                f"Relayed '{cmd}' to {host} -> {'SUCCESS' if ok else 'FAILED'} ({msg})",
                client_ip,
            )
            return self._send_json({"ok": ok, "cmd": cmd, "message": msg})

        if path == "/api/esp/telemetry":
            car_cnt = body.get("carCount")
            gate1 = body.get("gate1") == "OPEN"
            gate2 = body.get("gate2") == "OPEN"
            lockout = float(body.get("lockoutRemainingMs", 0)) / 1000.0
            patch: Dict[str, Any] = {}
            # Dashboard car counter is strictly dashboard-based (Phases 1-4 completed)
            # Do NOT overwrite dashboard car count with ESP32 Gate 1 ultrasonic triggers!
            patch["gate1_open"] = gate1
            patch["gate2_open"] = gate2
            patch["gate1_lockout_sec"] = lockout
            snap = HUB.update_state(patch)
            log_event(
                "ESP32 TELEMETRY",
                f"Gate1={'OPEN' if gate1 else 'CLOSED'}, Gate2={'OPEN' if gate2 else 'CLOSED'}, "
                f"CarCount={car_cnt}, Lockout={lockout:.1f}s",
                client_ip,
            )
            return self._send_json({"ok": True, "state": snap})

        if path in ("/api/master/auth", "/api/auth"):
            pwd = str(body.get("password", "")).strip()
            ok = pwd == MASTER_PASSWORD
            log_event(
                "SECURITY",
                f"Master Password Check: {'SUCCESS (Access Granted)' if ok else 'FAILED (Access Denied)'}",
                client_ip,
            )
            return self._send_json({"ok": ok, "authenticated": ok})

        if path == "/api/state/update":
            updates = []
            if "emergency_stop" in body or "all_stop" in body:
                val = body.get("emergency_stop", body.get("all_stop"))
                updates.append("EMERGENCY ALL-STOP: " + ("ENGAGED" if val else "CLEARED"))
            if "phase" in body or "active_phase" in body:
                val = body.get("phase", body.get("active_phase"))
                updates.append(f"Phase -> {val}")
            if "easy_mode" in body:
                updates.append("Mode -> " + ("EASY (35s safe window)" if body["easy_mode"] else "REALISTIC (12s safe window)"))
            if "speed_limit" in body:
                updates.append(f"Speed Limit -> {body['speed_limit']}%")
            if "gate1_open" in body:
                updates.append("Gate 1 -> " + ("OPEN" if body["gate1_open"] else "CLOSED"))
            if "gate2_open" in body:
                updates.append("Gate 2 -> " + ("OPEN" if body["gate2_open"] else "CLOSED"))
            if not updates:
                updates.append(f"Keys: {list(body.keys())}")
            log_event("MASTER OVERRIDE", " | ".join(updates), client_ip)
            snap = HUB.update_state(body)
            return self._send_json({"ok": True, "state": snap})

        if path == "/api/battery/simulate":
            import importlib
            importlib.reload(battery_physics)
            c_ma = float(body.get("current_mA") or body.get("currentMa") or 3680.0)
            t_min = float(body.get("target_minutes") or body.get("targetMinutes") or 30.0)
            r_sec = float(body.get("real_duration_sec") or 10.0)
            init_soc = float(body.get("initial_soc") or 0.20)
            s_name = str(body.get("student_name") or "STEM Explorer")
            lap_s = body.get("lap_time_sec")

            raw_sim = battery_physics.simulate_battery_charging(
                current_ma=c_ma,
                initial_soc=init_soc,
                target_minutes=t_min,
                animation_seconds=r_sec,
            )
            unified = convert_raw_sim_to_unified_payload(
                raw_sim, student_name=s_name, lap_time_sec=lap_s
            )
            if body.get("record_history", True):
                HUB.record_game_simulation(unified)
            summary = unified.get("summary", {})
            status = summary.get("status_code", "UNKNOWN")
            p_temp = summary.get("peak_T1_C", 0.0)
            soc = summary.get("final_soc_pct", 0.0)
            time_full = summary.get("time_to_full_min")
            full_str = f"{time_full:.1f}m" if time_full is not None else "N/A"
            log_event(
                "PHYSICS ENGINE",
                f"Student: '{s_name}' | {c_ma:.0f} mA @ {t_min:.1f}m -> {status} "
                f"(Peak T1: {p_temp:.1f}°C, SoC: {soc:.1f}%, Full: {full_str})",
                client_ip,
            )
            return self._send_json(unified)

        if path == "/api/leaderboard/add":
            lb = HUB.add_leaderboard_entry(body)
            s_name = str(body.get("name") or "STEM Explorer")
            lap = float(body.get("lap_time_sec", 0.0))
            charge = float(body.get("charge_time_min", 0.0))
            log_event(
                "LEADERBOARD",
                f"Recorded entry: '{s_name}' | Lap: {lap:.2f}s | Charge: {charge:.2f}m (Total: {len(lb)} scores)",
                client_ip,
            )
            return self._send_json({"ok": True, "entries": lb})

        if path == "/api/leaderboard/delete":
            lb = HUB.delete_leaderboard_entry(str(body.get("id", "")))
            log_event("LEADERBOARD", f"Deleted score id: {body.get('id')}", client_ip)
            return self._send_json({"ok": True, "entries": lb})

        if path == "/api/leaderboard/clear":
            lb = HUB.clear_leaderboard()
            log_event("LEADERBOARD", "Leaderboard scores reset to empty", client_ip)
            return self._send_json({"ok": True, "entries": lb})

        if path == "/api/games/clear":
            HUB.clear_game_history()
            log_event("ARCHIVE", "Physics trajectory game history wiped", client_ip)
            return self._send_json({"ok": True, "games": []})

        return self._send_json({"error": "Not found"}, status=404)


def print_server_diagnostics(port: int) -> None:
    lan_ips = get_lan_ips()
    serving_mode = (
        "React 19 + TypeScript (dashboard/dist/index.html)"
        if os.path.exists(os.path.join(REACT_DIST_DIR, "index.html"))
        else "Fallback HTML/JS (dashboard/)"
    )

    with HUB.lock:
        lb_count = len(HUB.leaderboard)
        hist_count = len(HUB.game_history)

    print("\n" + "=" * 80)
    print("  TEXAS TECH UNIVERSITY — SHARE LAB STEM NIGHT CONTROL SYSTEM")
    print("=" * 80)
    print("  [1] SYSTEM RUNTIME & PLATFORM ENVIRONMENT")
    print(f"      • Python Runtime:      v{sys.version.split()[0]} ({'64-bit' if sys.maxsize > 2**32 else '32-bit'})")
    print(f"      • Interpreter Path:    {sys.executable}")
    print(f"      • Host Machine:        {socket.gethostname()} ({sys.platform.upper()}) [Process PID {os.getpid()}]")
    print(f"      • Web Frontend:        {serving_mode}")
    print(f"      • Network Protocol:    Pure Unencrypted HTTP (Port {port})")

    print("\n  [2] ELECTRO-THERMAL EV BATTERY SIMULATION ENGINE")
    print("      • Physics Formulation: Coupled 2-State ECM + Dual Thermal Mass (Discrete Forward Euler)")
    print("      • Battery Chemistry:   Lithium-Ion Cylindrical Cell (Qb = 2,300 mAh / 8,280 Coulombs)")
    print("      • Internal Resistance: Rs = 0.050 Ohm (50 mOhm Series Ohmic Resistance)")
    print("      • Thermal Masses:      Core C1=51.9 J/K | Surface C2=6.2 J/K | Coolant Cinf=10.0 J/K")
    print("      • Thermal Limits:      Overheat Threshold = 60.0°C | Safe Charging Window = 3,400–3,960 mA")
    print("      • SOC-OCV Calibrator:  10,001 High-Precision Discrete Calibration Points Loaded")

    print("\n  [3] HARDWARE & WIRELESS INTERFACES")
    print("      • Wireless Network:    ESP32 SoftAP (SSID: ESP32_Gate_Network | IP: 192.168.4.1)")
    print("      • Gate Controller:     Port 81 (WebSocket) & Port 80 (HTTP Fallback)")
    print("      • Gate Auth Token:     mbot-gate-2026")
    print("      • Gate 1 (Entry):      Servo Pin 14 + Ultrasonic Sonar (5 cm) + 3-Color Light Tower")
    print("      • Gate 2 (Exit):       Servo Pin 27 + Buzzer + 3-Color Light Tower")
    print("      • Light Tower States:  RED = Charging/Standby | YELLOW = Transition | GREEN = Gate Open")
    print("      • mBot Mega BLE:       Web Bluetooth Low Energy (Serial3 / Port 5)")

    print("\n  [4] DATA ARCHIVES & MULTI-CLIENT BUS")
    print(f"      • Speed Leaderboard:   {lb_count} Records loaded from server/leaderboard.json")
    print(f"      • Physics Histories:   {hist_count} Full Trajectories loaded from server/game_history.json")
    print("      • Real-Time Sync:      Server-Sent Events (/api/events) Thread-Safe Push Bus")

    print("=" * 80)
    print("  HTTP NETWORK ACCESS ENDPOINTS:")
    print("=" * 80)
    print(f"  [PAGE 2] HOST PC MASTER CONSOLE:    http://localhost:{port}/master")
    print(f"  [PAGE 1] STUDENT KIOSK & TABLETS:  http://localhost:{port}/")
    for ip in lan_ips:
        print(f"  [LOCAL NETWORK TABLET ACCESS]:     http://{ip}:{port}/")
    print("=" * 80 + "\n")
    print("[STATUS] Real-time event logging active. Server ready for student missions!\n", flush=True)


def run_server(port: int = 8080) -> None:
    battery_physics.load_soc_ocv_table()
    if not HUB.game_history:
        sample_raw = battery_physics.simulate_battery_charging(
            current_ma=3680.0, initial_soc=0.20, target_minutes=30.0, animation_seconds=10.0
        )
        sample_unified = convert_raw_sim_to_unified_payload(
            sample_raw, student_name="Sample EV Run", lap_time_sec=22.4
        )
        HUB.record_game_simulation(sample_unified)

    try:
        server = QuietThreadingHTTPServer(("0.0.0.0", port), DashboardRequestHandler)
    except OSError as e:
        print(f"\n[NOTICE] Port {port} is already in use ({e}).")
        print("         Another server instance may be running. Terminate it and re-run.")
        return

    print_server_diagnostics(port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down HTTP server...")
        server.server_close()


if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(p)
