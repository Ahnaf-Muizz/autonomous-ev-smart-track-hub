import { PhysicsPoint, SimulationResult } from '../types';

const CAPACITY_MAH = 2300.0;
const QB_COULOMBS = 2.3 * 3600.0; // 8280 As
const R1_THERMAL = 2.64;
const R2_THERMAL = 3.46;
const RS_INTERNAL = 0.05;
const C1_THERMAL = 51.9;
const C2_THERMAL = 6.2;
const CINF_THERMAL = 10.0;
const DOCV_COEFF = 1.0e-4;
const QC_COOLANT = 0.02;
const INITIAL_TEMP_K = 305.0; // 31.85 °C
const DEFAULT_MAX_SAFE_TEMP_K = 335.0; // 61.85 °C

function lookupOcv(soc: number): number {
  const s = Math.max(0, Math.min(1, soc));
  // Accurate empirical fit to Battery_model/SOC-OCV.xlsx (2.0V -> 3.6V)
  return Number((2.0 + 1.6 * Math.pow(s, 0.45)).toFixed(4));
}

function calibrateRsForMaxSafeMa(
  initialSoc: number,
  maxSafeMa: number,
  maxTempK: number
): number {
  const idelta = -(maxSafeMa / 1000.0);
  let lowRs = 0.005;
  let highRs = 0.45;
  const dt = 1.0;

  for (let iter = 0; iter < 16; iter++) {
    const midRs = 0.5 * (lowRs + highRs);
    let soc = initialSoc;
    let t1 = INITIAL_TEMP_K;
    let t2 = INITIAL_TEMP_K;
    let tinf = INITIAL_TEMP_K;
    let peakT1 = t1;

    while (soc < 1.0) {
      const qGen = midRs * idelta * idelta - DOCV_COEFF * idelta * t1;
      const t1N = t1 + dt * (-(t1 - t2) / (R1_THERMAL * C1_THERMAL) + qGen / C1_THERMAL);
      const t2N =
        t2 +
        dt *
          (-(t2 - t1) / (R1_THERMAL * C2_THERMAL) -
            (t2 - tinf) / (R2_THERMAL * C2_THERMAL));
      const tinfN =
        tinf +
        dt * (-(tinf - t2) / (R2_THERMAL * CINF_THERMAL) - QC_COOLANT / CINF_THERMAL);
      soc = Math.min(1.0, soc + dt * (-idelta / QB_COULOMBS));
      t1 = t1N;
      t2 = t2N;
      tinf = tinfN;
      if (t1 > peakT1) peakT1 = t1;
    }

    if (peakT1 <= maxTempK) {
      lowRs = midRs;
    } else {
      highRs = midRs;
    }
  }
  return 0.5 * (lowRs + highRs);
}

export function runClientBatterySimulation(
  currentMa: number,
  targetMinutes: number,
  initialSoc: number = 0.2,
  realDurationSec: number = 10.0
): SimulationResult {
  const iAmp = currentMa / 1000.0;
  const idelta = -iAmp;
  const dtSim = 0.25;
  const targetSeconds = Math.max(60.0, targetMinutes * 60.0);
  const totalSteps = Math.ceil(targetSeconds / dtSim);

  const neededMah = (1.0 - initialSoc) * CAPACITY_MAH; // 1,840 mAh
  const minCurrentMa = Math.round(neededMah / (targetMinutes / 60.0));
  const maxSafeCurrentMa = minCurrentMa + 1200;
  const maxTempK = DEFAULT_MAX_SAFE_TEMP_K;

  const rsEff = calibrateRsForMaxSafeMa(initialSoc, maxSafeCurrentMa, maxTempK - 0.15);

  let soc = initialSoc;
  let t1 = INITIAL_TEMP_K;
  let t2 = INITIAL_TEMP_K;
  let tinf = INITIAL_TEMP_K;

  const histT: number[] = [];
  const histSoc: number[] = [];
  const histVocv: number[] = [];
  const histVt: number[] = [];
  const histT1: number[] = [];
  const histT2: number[] = [];
  const histTinf: number[] = [];
  const histQ: number[] = [];

  let peakT1K = t1;
  let peakT2K = t2;

  for (let k = 0; k <= totalSteps; k++) {
    const tNow = k * dtSim;
    const vocv = lookupOcv(soc);
    const vt = vocv - idelta * RS_INTERNAL;
    const qGen = rsEff * idelta * idelta - DOCV_COEFF * idelta * t1;

    histT.push(tNow);
    histSoc.push(soc);
    histVocv.push(vocv);
    histVt.push(vt);
    histT1.push(t1);
    histT2.push(t2);
    histTinf.push(tinf);
    histQ.push(qGen);

    if (t1 > peakT1K) peakT1K = t1;
    if (t2 > peakT2K) peakT2K = t2;

    if (soc >= 0.9999 || k === totalSteps) {
      break;
    }

    const socNext = Math.min(1.0, Math.max(0.0, soc + dtSim * (-idelta / QB_COULOMBS)));
    const t1Next = t1 + dtSim * (-(t1 - t2) / (R1_THERMAL * C1_THERMAL) + qGen / C1_THERMAL);
    const t2Next =
      t2 +
      dtSim *
        (-(t2 - t1) / (R1_THERMAL * C2_THERMAL) - (t2 - tinf) / (R2_THERMAL * C2_THERMAL));
    const tinfNext =
      tinf + dtSim * (-(tinf - t2) / (R2_THERMAL * CINF_THERMAL) - QC_COOLANT / CINF_THERMAL);

    soc = socNext;
    t1 = t1Next;
    t2 = t2Next;
    tinf = tinfNext;
  }

  const finalSoc = histSoc[histSoc.length - 1];
  const actualSimMin = histT[histT.length - 1] / 60.0;

  // Strictly match the [minCurrentMa, maxSafeCurrentMa] window
  const overheated = currentMa > maxSafeCurrentMa || peakT1K > maxTempK + 0.25;
  const chargedInTime = currentMa >= minCurrentMa && finalSoc >= 0.992;
  const passed = !overheated && chargedInTime;
  const timedOut = !passed && !overheated;

  const numFrames = 101;
  const nRaw = histT.length;
  const series: PhysicsPoint[] = [];

  for (let i = 0; i < numFrames; i++) {
    const frac = i / (numFrames - 1);
    const rawIdx = Math.min(Math.round(frac * (nRaw - 1)), nRaw - 1);
    const sMin = Number((histT[rawIdx] / 60.0).toFixed(2));
    const sPct = Number((histSoc[rawIdx] * 100.0).toFixed(2));
    series.push({
      real_sec: Number((frac * realDurationSec).toFixed(2)),
      sim_time_s: Number(histT[rawIdx].toFixed(2)),
      sim_time_min: sMin,
      soc: Number(histSoc[rawIdx].toFixed(4)),
      soc_pct: sPct,
      T1_K: Number(histT1[rawIdx].toFixed(2)),
      T2_K: Number(histT2[rawIdx].toFixed(2)),
      T_inf_K: Number(histTinf[rawIdx].toFixed(2)),
      T1_C: Number((histT1[rawIdx] - 273.15).toFixed(2)),
      T2_C: Number((histT2[rawIdx] - 273.15).toFixed(2)),
      T_inf_C: Number((histTinf[rawIdx] - 273.15).toFixed(2)),
      V_ocv: Number(histVocv[rawIdx].toFixed(4)),
      V_term: Number(histVt[rawIdx].toFixed(4)),
      Q_heat_W: Number(histQ[rawIdx].toFixed(3)),
      current_mA: currentMa,
    });
  }

  return {
    ok: true,
    inputs: {
      current_mA: currentMa,
      current_A: Number((currentMa / 1000).toFixed(3)),
      target_minutes: targetMinutes,
      real_duration_sec: realDurationSec,
      initial_soc: initialSoc,
      target_soc: 1.0,
      capacity_mAh: 2300,
    },
    summary: {
      success: passed,
      overheated,
      timed_out: timedOut,
      failure_reason: passed ? 'NONE' : overheated ? 'OVERHEATED' : 'TIME_EXPIRED',
      status_code: passed ? 'SUCCESS' : overheated ? 'FAIL_OVERHEAT' : 'FAIL_TIMEOUT',
      led_command: passed ? 'v' : 'f',
      final_soc_pct: Number((finalSoc * 100.0).toFixed(1)),
      peak_T1_C: Number((peakT1K - 273.15).toFixed(2)),
      peak_T2_C: Number((peakT2K - 273.15).toFixed(2)),
      max_safe_T1_C: 61.85,
      final_V_term: Number(histVt[histVt.length - 1].toFixed(3)),
      time_to_full_min: passed ? Number(actualSimMin.toFixed(2)) : null,
      time_to_full_real_sec: passed
        ? Number(((actualSimMin / Math.max(1, targetMinutes)) * realDurationSec).toFixed(2))
        : null,
      ideal_min_current_mA: minCurrentMa,
      max_safe_current_mA: maxSafeCurrentMa,
      sweet_spot_mA: [minCurrentMa, maxSafeCurrentMa],
    },
    equations: {
      kid_formula: 'Current (mA) = Charge Needed (1,840 mAh) ÷ Charging Time (Hours)',
      soc_ode: 'dSOC/dt = I_charge / (3600 · C_Ah)   [C_Ah = 2.3 Ah]',
      terminal_voltage: 'V_term(t) = V_ocv(SOC) + I_charge · R_s   [R_s = 0.05 Ω]',
      heat_generation: 'Q(t) = R_s · I² - dOCV · (-I) · T1(t)',
      core_temp_ode: 'dT1/dt = -(T1 - T2)/(R1·C1) + Q/C1',
      surface_temp_ode: 'dT2/dt = -(T2 - T1)/(R1·C2) - (T2 - T_inf)/(R2·C2)',
    },
    series,
  };
}

/**
 * Calculates fair, normalized speed efficiency bonus points (up to +250 Pts).
 * Awards maximum points when a student charges at the fastest safe speed near the 61.9°C thermal limit,
 * scaling down to 0 points at the minimum required charging current.
 */
export function calculateSpeedBonusPoints(
  targetMinutes: number,
  chargeTimeMin: number | null | undefined,
  initialSoc: number = 0.2
): { timeSavedMin: number; maxSafeTimeSavedMin: number; speedRatio: number; timeBonusPoints: number } {
  if (typeof chargeTimeMin !== 'number' || chargeTimeMin <= 0 || chargeTimeMin >= targetMinutes) {
    return { timeSavedMin: 0, maxSafeTimeSavedMin: 0, speedRatio: 0, timeBonusPoints: 0 };
  }

  const neededMah = (1.0 - initialSoc) * CAPACITY_MAH;
  const hours = targetMinutes / 60.0;
  const minRequiredMa = Math.round(neededMah / hours);
  const maxSafeMa = minRequiredMa + 1200;

  const fastestSafeTimeMin = (neededMah / maxSafeMa) * 60.0;
  const maxSafeTimeSavedMin = Math.max(0.2, targetMinutes - fastestSafeTimeMin);
  const timeSavedMin = Math.max(0, targetMinutes - chargeTimeMin);

  // Fraction of maximum safe speed achieved (0.0 to 1.0, allowed up to 1.05 if right at thermal cutoff)
  const speedRatio = Math.min(1.0, Math.max(0.0, timeSavedMin / maxSafeTimeSavedMin));
  const timeBonusPoints = Math.round(speedRatio * 250);

  return { timeSavedMin, maxSafeTimeSavedMin, speedRatio, timeBonusPoints };
}
