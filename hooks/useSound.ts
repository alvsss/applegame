"use client";

import { useRef, useCallback } from "react";
import { getCtx } from "@/lib/audioCtx";

export function useSound() {
  const sfxGain = useRef<GainNode | null>(null);
  const volRef  = useRef(0.8);

  /* SFX 마스터 Gain 노드 */
  const getGain = (): GainNode => {
    const ac = getCtx();
    if (!sfxGain.current) {
      const g = ac.createGain();
      g.gain.value = volRef.current;
      g.connect(ac.destination);
      sfxGain.current = g;
    }
    return sfxGain.current;
  };

  /* 공통 톤 생성 유틸 */
  const tone = useCallback(
    (
      freq: number,
      type: OscillatorType,
      peakVol: number,
      dur: number,
      startTime: number,
      freqEnd?: number
    ) => {
      const ac  = getCtx();
      const out = getGain();
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.connect(env);
      env.connect(out);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + dur);
      }
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(peakVol, startTime + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.01);
    },
    [] // eslint-disable-line
  );

  /* ── 셀 선택 틱 (선택 수 n에 따라 피치 상승) ── */
  const playTick = useCallback(
    (n: number) => {
      const ac   = getCtx();
      const base = 600 + n * 75;
      tone(base, "sine", 0.22, 0.09, ac.currentTime, base * 1.28);
    },
    [tone]
  );

  /* ── 성공 아르페지오 (콤보에 따라 피치 상승) ── */
  const playSuccess = useCallback(
    (combo: number) => {
      const ac      = getCtx();
      const t       = ac.currentTime;
      const shift   = Math.min(combo - 1, 6);
      const pitch   = (f: number) => f * Math.pow(2, shift / 12);
      const gap     = Math.max(0.055 - combo * 0.004, 0.028);
      const notes   = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach((f, i) =>
        tone(pitch(f), "sine", 0.32, 0.22, t + i * gap, pitch(f) * 1.04)
      );
      // 마지막 반짝임 고음
      tone(pitch(2093), "sine", 0.13, 0.11, t + notes.length * gap);
    },
    [tone]
  );

  /* ── 실패 뿅 ── */
  const playFail = useCallback(() => {
    const ac = getCtx();
    tone(310, "triangle", 0.18, 0.19, ac.currentTime, 155);
  }, [tone]);

  /* ── 콤보 팡파레 (3+ 콤보) ── */
  const playCombo = useCallback(
    (combo: number) => {
      if (combo < 3) return;
      const ac   = getCtx();
      const base = 880 + combo * 38;
      tone(base,       "sine", 0.16, 0.08, ac.currentTime);
      tone(base * 1.5, "sine", 0.11, 0.08, ac.currentTime + 0.07);
    },
    [tone]
  );

  /* ── 게임 오버 하강 멜로디 ── */
  const playGameOver = useCallback(() => {
    const ac  = getCtx();
    const t   = ac.currentTime;
    const seq = [523.25, 440, 349.23, 261.63];
    seq.forEach((f, i) =>
      tone(f, "triangle", 0.28, 0.35, t + i * 0.19, f * 0.91)
    );
  }, [tone]);

  /* ── SFX 볼륨 조절 (0~1) ── */
  const setVolume = useCallback((vol: number) => {
    volRef.current = vol;
    if (sfxGain.current) {
      const ac = getCtx();
      sfxGain.current.gain.setValueAtTime(vol, ac.currentTime);
    }
  }, []);

  return { playTick, playSuccess, playFail, playCombo, playGameOver, setVolume };
}
