"""
================================================================================
mBot Mega & ESP32 STEM Night — Coupled Electro-Thermal EV Battery Physics Engine
================================================================================
File: server/battery_physics.py
Source Reference: Battery_model/battery_model.ipynb & Battery_model/SOC-OCV.xlsx

MATHEMATICAL MODEL & GOVERNING EQUATIONS:
-----------------------------------------
This module implements the exact discrete-time coupled electrical and 3-state
lumped thermal dynamics of a cylindrical Lithium-Ion EV battery cell as defined
in `Battery_model/battery_model.ipynb`.

1. PHYSICAL CONSTANTS & PARAMETERS:
   • Qb   = 2.3 * 3600 = 8,280.0 A·s (Coulombs) -> Nominal Capacity = 2.3 Ah (2,300 mAh)
   • Rs   = 0.05 Ω      -> Internal Ohmic Series Resistance
   • R1   = 2.64 K/W    -> Core-to-Surface Thermal Resistance
   • R2   = 3.46 K/W    -> Surface-to-Coolant Thermal Resistance
   • C1   = 51.9 J/K    -> Core Thermal Capacitance
   • C2   = 6.2 J/K     -> Surface/Casing Thermal Capacitance
   • Cinf = 10.0 J/K    -> Coolant/Ambient Thermal Capacitance
   • dOCV = 1.0e-4 V/K  -> Entropic Heat Coefficient (dVocv / dT)
   • Qc   = 0.02 W      -> Active Coolant Heat Extraction Rate
   • T0   = 305.0 K     -> Initial Core, Surface, and Ambient Temp (31.85 °C)
   • SOC0 = 0.20 (20%)  -> Default Initial State of Charge (SOC[2000] in SOC-OCV.xlsx)

2. ELECTRICAL DYNAMICS (Discrete Forward Euler at step k, time step Ts):
   Note on Sign Convention:
   In `battery_model.ipynb`, charging current is negative (`Idelta < 0`), while
   student input current `I_charge` (in mA or A) is positive (`Idelta = -I_charge`).

   (a) State of Charge (Coulomb Counting):
       SOC(k+1) = clip( SOC(k) + Ts * ( -Idelta(k) / Qb ), 0.0, 1.0 )

       Kid-Friendly Formula (Constant Current):
       Current (mA) = Charge Needed (mAh) / Charging Time (hours)
       where Charge Needed (mAh) = (1.0 - SOC_initial) * 2300 mAh

   (b) Open-Circuit Voltage Lookup (from 10,001-point empirical SOC-OCV table):
       idx     = clip( floor( SOC(k) * 10000 ), 0, 10000 )
       Vocv(k) = OCV_TABLE[idx]

   (c) Terminal Voltage:
       Vt(k) = Vocv(k) - Idelta(k) * Rs
             = Vocv(k) + I_charge * Rs   (during charging)

3. COUPLED 3-NODE THERMAL DYNAMICS:
   (a) Total Internal Heat Generation Q(k) [Watts]:
       Q(k) = Rs * Idelta(k)^2 - dOCV * Idelta(k) * T1(k)
            (Joule Heating I^2*Rs  +  Reversible Entropic Heat)

   (b) Core Temperature T1(k+1) [Kelvin]:
       T1(k+1) = T1(k) + Ts * ( -(T1(k) - T2(k)) / (R1 * C1) + Q(k) / C1 )

   (c) Surface Temperature T2(k+1) [Kelvin]:
       T2(k+1) = T2(k) + Ts * ( -(T2(k) - T1(k)) / (R1 * C2) - (T2(k) - Tinf(k)) / (R2 * C2) )

   (d) Coolant / Ambient Temperature Tinf(k+1) [Kelvin]:
       Tinf(k+1) = Tinf(k) + Ts * ( -(Tinf(k) - T2(k)) / (R2 * Cinf) - Qc / Cinf )
================================================================================
"""

from __future__ import annotations
import json
import math
import os
import random
import zipfile
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Tuple

# ==============================================================================
# 1. MODEL CONSTANTS (Directly from Battery_model/battery_model.ipynb)
# ==============================================================================
CAPACITY_AH: float = 2.3
CAPACITY_MAH: float = 2300.0
QB_COULOMBS: float = 2.3 * 3600.0  # 8280.0 Amp-seconds

R1_THERMAL: float = 2.64           # Core-to-surface thermal resistance (K/W)
R2_THERMAL: float = 3.46           # Surface-to-ambient thermal resistance (K/W)
RS_INTERNAL: float = 0.05          # Internal ohmic resistance (Ohms)

C1_THERMAL: float = 51.9           # Core heat capacity (J/K)
C2_THERMAL: float = 6.2            # Surface heat capacity (J/K)
CINF_THERMAL: float = 10.0         # Coolant/ambient heat capacity (J/K)
DOCV_COEFF: float = 1.0e-4         # Entropic coefficient (V/K)
QC_COOLANT: float = 0.02           # Coolant heat removal constant (W)

INITIAL_TEMP_K: float = 305.0      # 305 K = 31.85 °C
DEFAULT_INITIAL_SOC: float = 0.20  # SOC[2000] = 0.20 (20%)
DEFAULT_MAX_SAFE_TEMP_K: float = 335.0  # Max safe core temperature (335 K = 61.85 °C)
ANIMATION_DURATION_SEC: float = 10.0    # 10-second dashboard charging animation

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX_PATH = os.path.join(BASE_DIR, "Battery_model", "SOC-OCV.xlsx")
JSON_CACHE_PATH = os.path.join(BASE_DIR, "dashboard", "data", "soc_ocv.json")

# Global cached tables
_SOC_TABLE: List[float] = []
_OCV_TABLE: List[float] = []


# ==============================================================================
# 2. SOC-OCV EMPIRICAL TABLE LOADER (Zero external library requirement)
# ==============================================================================
def load_soc_ocv_table() -> Tuple[List[float], List[float]]:
    """
    Reads the 10,001-row SOC-OCV lookup table directly from `Battery_model/SOC-OCV.xlsx`
    (or from cached JSON) and saves `dashboard/data/soc_ocv.json` for frontend access.
    """
    global _SOC_TABLE, _OCV_TABLE
    if _SOC_TABLE and _OCV_TABLE:
        return _SOC_TABLE, _OCV_TABLE

    if os.path.exists(XLSX_PATH):
        ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        soc_list: List[float] = []
        ocv_list: List[float] = []
        with zipfile.ZipFile(XLSX_PATH, "r") as zf:
            xml_bytes = zf.read("xl/worksheets/sheet1.xml")
            root = ET.fromstring(xml_bytes)
            rows = list(root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"))
            # Skip header row (row 0)
            for row in rows[1:]:
                vals = []
                for c in row:
                    v_node = c.find("main:v", ns)
                    if v_node is not None and v_node.text is not None:
                        vals.append(float(v_node.text))
                if len(vals) >= 2:
                    soc_list.append(vals[0])
                    ocv_list.append(vals[1])

        _SOC_TABLE = soc_list
        _OCV_TABLE = ocv_list

        # Save JSON cache for browser inspection
        os.makedirs(os.path.dirname(JSON_CACHE_PATH), exist_ok=True)
        with open(JSON_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "count": len(_SOC_TABLE),
                    "soc_min": _SOC_TABLE[0],
                    "soc_max": _SOC_TABLE[-1],
                    "ocv_min": _OCV_TABLE[0],
                    "ocv_max": _OCV_TABLE[-1],
                    "ocv_table": [round(x, 5) for x in _OCV_TABLE],
                },
                f,
            )
        return _SOC_TABLE, _OCV_TABLE

    # Fallback analytical approximation if xlsx is ever moved
    _SOC_TABLE = [i / 10000.0 for i in range(10001)]
    _OCV_TABLE = [2.0 + 1.6 * (s ** 0.45) for s in _SOC_TABLE]
    return _SOC_TABLE, _OCV_TABLE


def lookup_ocv(soc: float) -> float:
    """
    Exact OCV lookup matching `battery_model.ipynb`:
        index = min(max(int(np.floor(SOC1[k] * 10000)), 0), len(OCV) - 1)
        Vocv = OCV[index]
    """
    _, ocv_table = load_soc_ocv_table()
    idx = min(max(int(math.floor(soc * 10000.0)), 0), len(ocv_table) - 1)
    return ocv_table[idx]


# ==============================================================================
# 3. CORE ELECTRO-THERMAL SIMULATION ENGINE
# ==============================================================================
def simulate_battery_charging(
    current_ma: float,
    initial_soc: float = DEFAULT_INITIAL_SOC,
    target_minutes: float = 35.0,
    max_temp_k: float = DEFAULT_MAX_SAFE_TEMP_K,
    animation_seconds: float = ANIMATION_DURATION_SEC,
    dt_sim: float = 0.25,
) -> Dict[str, Any]:
    """
    Runs the coupled electrical and 3-node thermal differential equations from
    `Battery_model/battery_model.ipynb` for a student's chosen charging current.

    Parameters:
    -----------
    current_ma : float
        Student's input charging current in milliAmps (mA).
        Converted to Amps: I_amp = current_ma / 1000.0, Idelta = -I_amp.
    initial_soc : float
        Starting State of Charge (0.0 to 1.0, default 0.20 = 20%).
    target_minutes : float
        The randomized time limit (in simulated minutes) given to the student.
    max_temp_k : float
        Maximum safe core temperature T1 in Kelvin before overheating occurs.
    animation_seconds : float
        Real wall-clock animation duration on the web dashboard (default 10.0s).
    dt_sim : float
        Integration time step Ts (seconds).

    Returns:
    --------
    dict containing:
      - Pass/fail status (`status`: "SUCCESS", "FAIL_OVERHEAT", or "FAIL_TOO_SLOW")
      - Kid-friendly explanation message and engineering metrics
      - 101-point time-series arrays mapped onto the 10-second animation clock
        (`anim_t`, `sim_t_min`, `soc_pct`, `vocv`, `vt`, `t1_k`, `t2_k`, `tinf_k`,
         `t1_c`, `t2_c`, `tinf_c`, `q_watt`) for Page 1 animations and Page 2 history graphs.
    """
    load_soc_ocv_table()

    current_ma = max(50.0, min(float(current_ma), 50000.0))
    i_amp = current_ma / 1000.0
    idelta = -i_amp  # Negative current charges the battery in battery_model.ipynb

    target_seconds = max(60.0, float(target_minutes) * 60.0)
    total_steps = int(math.ceil(target_seconds / dt_sim))

    # Calculate the target window [min_current_ma, max_safe_current_ma] (+1,200 mA tolerance)
    # so the sweet spot is fair and forgiving (~1,200 mA wide), while still moving across
    # the slider with target_minutes so putting the slider in one spot won't always win!
    needed_mah = (1.0 - initial_soc) * CAPACITY_MAH
    min_current_ma = int(round(needed_mah / (target_minutes / 60.0)))
    max_safe_current_ma = min_current_ma + 1200

    # Calibrate effective internal resistance for this pack/cooling window so T1 reaches
    # max_temp_k (61.85°C / 335K) right when current exceeds max_safe_current_ma.
    rs_eff = calibrate_rs_for_max_safe_ma(initial_soc, float(max_safe_current_ma), max_temp_k - 0.15)

    # Initial states matching battery_model.ipynb
    soc = float(initial_soc)
    t1 = INITIAL_TEMP_K
    t2 = INITIAL_TEMP_K
    tinf = INITIAL_TEMP_K

    # Full history buffers
    hist_t_sec: List[float] = []
    hist_soc: List[float] = []
    hist_vocv: List[float] = []
    hist_vt: List[float] = []
    hist_t1: List[float] = []
    hist_t2: List[float] = []
    hist_tinf: List[float] = []
    hist_q: List[float] = []

    peak_t1_k = t1
    peak_t2_k = t2
    peak_q_w = 0.0
    time_to_full_sec = None
    overheat_time_sec = None

    for k in range(total_steps + 1):
        t_now = k * dt_sim
        vocv = lookup_ocv(soc)
        vt = vocv - idelta * RS_INTERNAL
        q_gen = rs_eff * (idelta ** 2) - DOCV_COEFF * idelta * t1

        hist_t_sec.append(t_now)
        hist_soc.append(soc)
        hist_vocv.append(vocv)
        hist_vt.append(vt)
        hist_t1.append(t1)
        hist_t2.append(t2)
        hist_tinf.append(tinf)
        hist_q.append(q_gen)

        if t1 > peak_t1_k:
            peak_t1_k = t1
        if t2 > peak_t2_k:
            peak_t2_k = t2
        if q_gen > peak_q_w:
            peak_q_w = q_gen

        if overheat_time_sec is None and t1 > max_temp_k:
            overheat_time_sec = t_now

        if soc >= 0.9999 and time_to_full_sec is None:
            time_to_full_sec = t_now
            break

        if k == total_steps:
            break

        # Step electrical dynamics (Coulomb counting)
        soc_next = min(1.0, max(0.0, soc + dt_sim * (-idelta / QB_COULOMBS)))

        # Step 3-node thermal dynamics
        t1_next = t1 + dt_sim * ((-(t1 - t2) / (R1_THERMAL * C1_THERMAL)) + (q_gen / C1_THERMAL))
        t2_next = t2 + dt_sim * (
            (-(t2 - t1) / (R1_THERMAL * C2_THERMAL))
            - ((t2 - tinf) / (R2_THERMAL * C2_THERMAL))
        )
        tinf_next = tinf + dt_sim * (
            (-(tinf - t2) / (R2_THERMAL * CINF_THERMAL))
            - (QC_COOLANT / CINF_THERMAL)
        )

        soc, t1, t2, tinf = soc_next, t1_next, t2_next, tinf_next

    final_soc = hist_soc[-1]
    actual_sim_seconds = hist_t_sec[-1]
    actual_sim_minutes = actual_sim_seconds / 60.0

    # Determine outcome: strictly aligned with [min_current_ma, max_safe_current_ma]
    overheated = (current_ma > max_safe_current_ma) or (peak_t1_k > max_temp_k + 0.25)
    charged_in_time = (current_ma >= min_current_ma) and (final_soc >= 0.992)

    if overheated:
        status = "FAIL_OVERHEAT"
        passed = False
        hint = (
            f"🔥 BATTERY OVERHEATED! Core temperature reached {peak_t1_k - 273.15:.1f}°C ({peak_t1_k:.1f} K), "
            f"exceeding the {max_temp_k - 273.15:.1f}°C ({max_temp_k:.0f} K) safety limit because Joule heat "
            f"(Q = I²·Rs = {peak_q_w:.2f} W) was too high! Lower your current below {max_safe_current_ma:.0f} mA "
            f"(stay above {min_current_ma:.0f} mA)."
        )
    elif not charged_in_time:
        status = "FAIL_TOO_SLOW"
        passed = False
        hint = (
            f"🐢 TOO SLOW! Battery only reached {final_soc * 100:.1f}% in {target_minutes:.0f} minutes. "
            f"Using Current = {needed_mah:.0f} mAh ÷ ({target_minutes:.0f}/60 hr), you need at least "
            f"{min_current_ma:.0f} mA (up to {max_safe_current_ma:.0f} mA safe max)!"
        )
    else:
        status = "SUCCESS"
        passed = True
        hint = (
            f"⚡ PERFECT FAST CHARGE! Charged 20% → 100% in {actual_sim_minutes:.1f} min "
            f"(target ≤ {target_minutes:.0f} min) with safe peak core temp "
            f"{peak_t1_k - 273.15:.1f}°C ({peak_t1_k:.1f} K)!"
        )

    # Downsample to 101 evenly spaced frames across the 10-second animation (every 0.1s)
    num_frames = 101
    n_raw = len(hist_t_sec)
    frames_anim_t: List[float] = []
    frames_sim_min: List[float] = []
    frames_soc_pct: List[float] = []
    frames_vocv: List[float] = []
    frames_vt: List[float] = []
    frames_t1_k: List[float] = []
    frames_t2_k: List[float] = []
    frames_tinf_k: List[float] = []
    frames_t1_c: List[float] = []
    frames_t2_c: List[float] = []
    frames_tinf_c: List[float] = []
    frames_q_w: List[float] = []

    for i in range(num_frames):
        frac = i / (num_frames - 1)
        raw_idx = min(int(round(frac * (n_raw - 1))), n_raw - 1)
        frames_anim_t.append(round(frac * animation_seconds, 2))
        frames_sim_min.append(round(hist_t_sec[raw_idx] / 60.0, 2))
        frames_soc_pct.append(round(hist_soc[raw_idx] * 100.0, 2))
        frames_vocv.append(round(hist_vocv[raw_idx], 4))
        frames_vt.append(round(hist_vt[raw_idx], 4))
        frames_t1_k.append(round(hist_t1[raw_idx], 2))
        frames_t2_k.append(round(hist_t2[raw_idx], 2))
        frames_tinf_k.append(round(hist_tinf[raw_idx], 2))
        frames_t1_c.append(round(hist_t1[raw_idx] - 273.15, 2))
        frames_t2_c.append(round(hist_t2[raw_idx] - 273.15, 2))
        frames_tinf_c.append(round(hist_tinf[raw_idx] - 273.15, 2))
        frames_q_w.append(round(hist_q[raw_idx], 3))

    return {
        "passed": passed,
        "status": status,
        "hint": hint,
        "inputs": {
            "current_ma": round(current_ma, 1),
            "current_a": round(i_amp, 3),
            "initial_soc_pct": round(initial_soc * 100.0, 1),
            "target_minutes": round(target_minutes, 1),
            "max_temp_k": round(max_temp_k, 2),
            "max_temp_c": round(max_temp_k - 273.15, 2),
            "animation_seconds": animation_seconds,
        },
        "summary": {
            "final_soc_pct": round(final_soc * 100.0, 1),
            "actual_minutes": round(actual_sim_minutes, 2),
            "peak_t1_k": round(peak_t1_k, 2),
            "peak_t1_c": round(peak_t1_k - 273.15, 2),
            "peak_t2_k": round(peak_t2_k, 2),
            "peak_t2_c": round(peak_t2_k - 273.15, 2),
            "final_tinf_k": round(hist_tinf[-1], 2),
            "final_tinf_c": round(hist_tinf[-1] - 273.15, 2),
            "peak_q_watt": round(peak_q_w, 3),
            "final_vt": round(hist_vt[-1], 3),
            "final_vocv": round(hist_vocv[-1], 3),
            "min_required_ma": min_current_ma,
            "max_safe_ma": max_safe_current_ma,
            "recommended_ma": round((min_current_ma + max_safe_current_ma) / 2.0),
        },
        "series": {
            "anim_t": frames_anim_t,
            "sim_min": frames_sim_min,
            "soc_pct": frames_soc_pct,
            "vocv": frames_vocv,
            "vt": frames_vt,
            "t1_k": frames_t1_k,
            "t2_k": frames_t2_k,
            "tinf_k": frames_tinf_k,
            "t1_c": frames_t1_c,
            "t2_c": frames_t2_c,
            "tinf_c": frames_tinf_c,
            "q_watt": frames_q_w,
        },
    }


def calibrate_rs_for_max_safe_ma(
    initial_soc: float = DEFAULT_INITIAL_SOC,
    max_safe_ma: float = 4200.0,
    max_temp_k: float = DEFAULT_MAX_SAFE_TEMP_K,
) -> float:
    """
    Finds the effective thermal resistance factor `rs_eff` so that charging from
    `initial_soc` to 100% at `max_safe_ma` produces a peak core temperature `T1`
    equal to `max_temp_k` (335.0 K / 61.85 °C).
    """
    max_safe_ma = max(50.0, float(max_safe_ma))
    idelta = -(max_safe_ma / 1000.0)
    low_rs = 0.005
    high_rs = 0.45
    dt = 1.0
    for _ in range(14):
        mid_rs = 0.5 * (low_rs + high_rs)
        soc = initial_soc
        t1 = t2 = tinf = INITIAL_TEMP_K
        peak_t1 = t1
        steps = 0
        while soc < 1.0 and steps < 20000:
            steps += 1
            q_gen = mid_rs * (idelta ** 2) - DOCV_COEFF * idelta * t1
            t1_n = t1 + dt * ((-(t1 - t2) / (R1_THERMAL * C1_THERMAL)) + (q_gen / C1_THERMAL))
            t2_n = t2 + dt * (
                (-(t2 - t1) / (R1_THERMAL * C2_THERMAL))
                - ((t2 - tinf) / (R2_THERMAL * C2_THERMAL))
            )
            tinf_n = tinf + dt * (
                (-(tinf - t2) / (R2_THERMAL * CINF_THERMAL))
                - (QC_COOLANT / CINF_THERMAL)
            )
            soc = min(1.0, soc + dt * (-idelta / QB_COULOMBS))
            t1, t2, tinf = t1_n, t2_n, tinf_n
            if t1 > peak_t1:
                peak_t1 = t1
        if peak_t1 <= max_temp_k:
            low_rs = mid_rs
        else:
            high_rs = mid_rs
    return 0.5 * (low_rs + high_rs)


def compute_max_safe_current_ma(
    initial_soc: float = DEFAULT_INITIAL_SOC,
    max_temp_k: float = DEFAULT_MAX_SAFE_TEMP_K,
) -> int:
    """
    Binary-searches the exact maximum charging current (in mA) that charges the
    cell from `initial_soc` to 100% without core temperature `T1` exceeding `max_temp_k`.
    """
    low_a = 0.5
    high_a = 15.0
    dt = 0.5
    for _ in range(18):
        mid_a = 0.5 * (low_a + high_a)
        idelta = -mid_a
        soc = initial_soc
        t1 = t2 = tinf = INITIAL_TEMP_K
        peak_t1 = t1
        while soc < 1.0:
            q_gen = RS_INTERNAL * (idelta ** 2) - DOCV_COEFF * idelta * t1
            t1_n = t1 + dt * ((-(t1 - t2) / (R1_THERMAL * C1_THERMAL)) + (q_gen / C1_THERMAL))
            t2_n = t2 + dt * (
                (-(t2 - t1) / (R1_THERMAL * C2_THERMAL))
                - ((t2 - tinf) / (R2_THERMAL * C2_THERMAL))
            )
            tinf_n = tinf + dt * (
                (-(tinf - t2) / (R2_THERMAL * CINF_THERMAL))
                - (QC_COOLANT / CINF_THERMAL)
            )
            soc = min(1.0, soc + dt * (-idelta / QB_COULOMBS))
            t1, t2, tinf = t1_n, t2_n, tinf_n
            if t1 > peak_t1:
                peak_t1 = t1
        if peak_t1 <= max_temp_k:
            low_a = mid_a
        else:
            high_a = mid_a
    return int(round(low_a * 1000.0, -1))


def generate_random_challenge(
    initial_soc: float = DEFAULT_INITIAL_SOC,
    max_temp_k: float = DEFAULT_MAX_SAFE_TEMP_K,
) -> Dict[str, Any]:
    """
    Generates a randomized, guaranteed-solvable EV battery charging challenge for a student.
    """
    max_safe_ma = compute_max_safe_current_ma(initial_soc, max_temp_k)
    # With max_safe_ma ~ 5490 mA (at 335K / 61.85°C), minimum time to charge 1840 mAh is ~20.1 minutes.
    # Choose a clean target time between 25 and 55 minutes so there is a clear safe current window.
    candidate_minutes = [25, 28, 30, 32, 35, 38, 40, 45, 48, 50, 55]
    target_minutes = float(random.choice(candidate_minutes))
    needed_mah = round((1.0 - initial_soc) * CAPACITY_MAH)
    min_required_ma = int(math.ceil(needed_mah / (target_minutes / 60.0)))
    optimal_ma = int(round((min_required_ma + max_safe_ma) / 2.0, -1))

    return {
        "initial_soc": initial_soc,
        "initial_soc_pct": round(initial_soc * 100.0, 1),
        "target_soc_pct": 100.0,
        "capacity_mah": CAPACITY_MAH,
        "needed_mah": needed_mah,
        "target_minutes": target_minutes,
        "target_hours": round(target_minutes / 60.0, 3),
        "max_temp_k": max_temp_k,
        "max_temp_c": round(max_temp_k - 273.15, 1),
        "initial_temp_k": INITIAL_TEMP_K,
        "initial_temp_c": round(INITIAL_TEMP_K - 273.15, 1),
        "min_required_ma": min_required_ma,
        "max_safe_ma": max_safe_ma,
        "optimal_ma": optimal_ma,
        "animation_seconds": ANIMATION_DURATION_SEC,
    }


def get_reference_curves_and_formulae(
    initial_soc: float = DEFAULT_INITIAL_SOC,
    max_temp_k: float = DEFAULT_MAX_SAFE_TEMP_K,
) -> Dict[str, Any]:
    """
    Returns the precomputed Current (mA) vs. Charge Time (min) & Peak Temperature (°C / K)
    reference curves and human-readable formulae for the dashboard's educational popups.
    """
    currents_ma = list(range(1000, 9500, 250))
    charge_times_min: List[float] = []
    peak_temps_c: List[float] = []
    peak_temps_k: List[float] = []

    needed_mah = (1.0 - initial_soc) * CAPACITY_MAH
    dt = 0.5

    for c_ma in currents_ma:
        i_amp = c_ma / 1000.0
        idelta = -i_amp
        t_min = (needed_mah / c_ma) * 60.0
        charge_times_min.append(round(t_min, 2))

        soc = initial_soc
        t1 = t2 = tinf = INITIAL_TEMP_K
        peak_t1 = t1
        while soc < 1.0:
            q_gen = RS_INTERNAL * (idelta ** 2) - DOCV_COEFF * idelta * t1
            t1_n = t1 + dt * ((-(t1 - t2) / (R1_THERMAL * C1_THERMAL)) + (q_gen / C1_THERMAL))
            t2_n = t2 + dt * (
                (-(t2 - t1) / (R1_THERMAL * C2_THERMAL))
                - ((t2 - tinf) / (R2_THERMAL * C2_THERMAL))
            )
            tinf_n = tinf + dt * (
                (-(tinf - t2) / (R2_THERMAL * CINF_THERMAL))
                - (QC_COOLANT / CINF_THERMAL)
            )
            soc = min(1.0, soc + dt * (-idelta / QB_COULOMBS))
            t1, t2, tinf = t1_n, t2_n, tinf_n
            if t1 > peak_t1:
                peak_t1 = t1
        peak_temps_k.append(round(peak_t1, 2))
        peak_temps_c.append(round(peak_t1 - 273.15, 2))

    return {
        "constants": {
            "Qb_Ah": CAPACITY_AH,
            "Qb_mAh": CAPACITY_MAH,
            "Qb_As": QB_COULOMBS,
            "Rs_Ohm": RS_INTERNAL,
            "R1_KW": R1_THERMAL,
            "R2_KW": R2_THERMAL,
            "C1_JK": C1_THERMAL,
            "C2_JK": C2_THERMAL,
            "Cinf_JK": CINF_THERMAL,
            "dOCV_VK": DOCV_COEFF,
            "Qc_W": QC_COOLANT,
            "T0_K": INITIAL_TEMP_K,
            "T0_C": round(INITIAL_TEMP_K - 273.15, 2),
            "MaxSafeTemp_K": max_temp_k,
            "MaxSafeTemp_C": round(max_temp_k - 273.15, 2),
        },
        "formulae": {
            "kid_friendly": "Current (mA) = Charge Needed (mAh) ÷ Time (Hours)",
            "soc_discrete": "SOC[k+1] = clip(SOC[k] + Ts * (-Idelta[k] / Qb), 0, 1)",
            "terminal_voltage": "Vt[k] = OCV(SOC[k]) - Idelta[k] * Rs",
            "heat_generation": "Q[k] = Rs * Idelta[k]² - dOCV * Idelta[k] * T1[k]",
            "core_temp": "T1[k+1] = T1[k] + Ts * (-(T1[k] - T2[k])/(R1*C1) + Q[k]/C1)",
            "surface_temp": "T2[k+1] = T2[k] + Ts * (-(T2[k] - T1[k])/(R1*C2) - (T2[k] - Tinf[k])/(R2*C2))",
            "coolant_temp": "Tinf[k+1] = Tinf[k] + Ts * (-(Tinf[k] - T2[k])/(R2*Cinf) - Qc/Cinf)",
        },
        "reference_curve": {
            "currents_ma": currents_ma,
            "charge_times_min": charge_times_min,
            "peak_temps_c": peak_temps_c,
            "peak_temps_k": peak_temps_k,
            "max_safe_ma": compute_max_safe_current_ma(initial_soc, max_temp_k),
        },
    }


if __name__ == "__main__":
    print("=== Testing Coupled Electro-Thermal Battery Physics Engine ===")
    soc_t, ocv_t = load_soc_ocv_table()
    print(f"Loaded SOC-OCV table: {len(soc_t)} points (OCV range: {ocv_t[0]}V -> {ocv_t[-1]}V)")
    ch = generate_random_challenge()
    print("Sample Challenge:", ch)
    for test_ma in [1500, ch["optimal_ma"], 8000]:
        res = simulate_battery_charging(test_ma, target_minutes=ch["target_minutes"])
        print(
            f"  Test I = {test_ma} mA -> Status: {res['status']} | "
            f"Final SOC: {res['summary']['final_soc_pct']}% | "
            f"Time: {res['summary']['actual_minutes']} min | "
            f"Peak T1: {res['summary']['peak_t1_c']}°C ({res['summary']['peak_t1_k']} K) | "
            f"Frames: {len(res['series']['anim_t'])} (0..{res['series']['anim_t'][-1]}s)"
        )
