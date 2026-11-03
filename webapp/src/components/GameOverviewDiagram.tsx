import React from 'react';
import { Flag, Bot, BatteryCharging, Trophy, ChevronRight } from 'lucide-react';

interface GameOverviewDiagramProps {
  theme?: 'dark' | 'light';
}

export const GameOverviewDiagram: React.FC<GameOverviewDiagramProps> = ({ theme = 'dark' }) => {
  return (
    <div className="w-full space-y-2.5">
      {/* 4-PHASE VISUAL MISSION FLOW CARDS (MATCHES 4-STEP TOP NAVIGATION) */}
      <div className="space-y-2">
        {/* PHASE 1: LAUNCH */}
        <div
          className={`p-3 rounded-2xl border transition relative overflow-hidden group ${
            theme === 'dark'
              ? 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-blue-500/50'
              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-blue-400 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center shrink-0 text-blue-400">
              <Flag className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-black text-[10px] uppercase">
                  Phase 1
                </span>
              </div>
              <div className={`text-xs sm:text-sm font-extrabold mt-0.5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Launch
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Type your driver name, position the rover at the Start Line, and trigger the 5-second countdown!
              </p>
            </div>
          </div>
        </div>

        {/* PHASE 2: SELF-DRIVING CAR */}
        <div
          className={`p-3 rounded-2xl border transition relative overflow-hidden group ${
            theme === 'dark'
              ? 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-indigo-500/50'
              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-indigo-400 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-400">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 font-black text-[10px] uppercase">
                  Phase 2
                </span>
              </div>
              <div className={`text-xs sm:text-sm font-extrabold mt-0.5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Self-Driving Car
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Infrared bottom eyes guide the rover along the track until ultrasonic sound waves trip Gate 1’s stop &amp; light tower.
              </p>
            </div>
          </div>
        </div>

        {/* PHASE 3: SUPERCHARGER GAME */}
        <div
          className={`p-3 rounded-2xl border transition relative overflow-hidden group ${
            theme === 'dark'
              ? 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-amber-500/50'
              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-amber-400 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0 text-amber-400">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-black text-[10px] uppercase">
                  Phase 3
                </span>
              </div>
              <div className={`text-xs sm:text-sm font-extrabold mt-0.5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Supercharger Game
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Car docks in the bay. Dial in the current slider (mA) to fill the battery before time runs out without overheating!
              </p>
            </div>
          </div>
        </div>

        {/* PHASE 4: RETURN TO BASE */}
        <div
          className={`p-3 rounded-2xl border transition relative overflow-hidden group ${
            theme === 'dark'
              ? 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-emerald-500/50'
              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-400 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase">
                  Phase 4
                </span>
              </div>
              <div className={`text-xs sm:text-sm font-extrabold mt-0.5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Return to base
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Gate 2 lifts open! Rover flashes rainbow LEDs, sprints across the finish line, and logs your points score on the podium!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MINI ILLUSTRATED TRACK SCHEMATIC (4 STEPS TO 4 PHASES MATCHED) */}
      <div
        className={`p-2.5 rounded-2xl border flex items-center justify-between text-[11px] font-bold ${
          theme === 'dark'
            ? 'bg-slate-950/80 border-slate-800 text-slate-300'
            : 'bg-slate-100 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span>1. Launch</span>
        </div>
        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span>2. Self-Driving Car</span>
        </div>
        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>3. Supercharger Game</span>
        </div>
        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>4. Return to base 🏁</span>
        </div>
      </div>
    </div>
  );
};
