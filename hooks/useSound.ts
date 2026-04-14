"use client";

import { useRef, useCallback } from "react";

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);

  // 브라우저 정책: 사용자 인터랙션 후에만 AudioContext 생성 가능
  const ctx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  // ── 공통 유틸: 오실레이터 + 게인 연결 ──
  const playTone = useCallback(
    (
      freq: number,
      type: OscillatorType,
      startVol: number,
      duration: number,
      startTime: number,
      freqEnd?: number
    ) => {
      if (mutedRef.current) return;
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
      }

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(startVol, startTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    },
    []
  );

  /* ── 셀 선택 틱 ──
     선택 칸 수(n)에 따라 피치가 조금씩 올라가는 경쾌한 '틱' 소리 */
  const playTick = useCallback(
    (n: number) => {
      if (mutedRef.current) return;
      const ac = ctx();
      const base = 600 + n * 80; // 선택할수록 높아짐
      const t = ac.currentTime;

      // 짧은 사인파 + 살짝 올라가는 피치
      playTone(base, "sine", 0.25, 0.09, t, base * 1.25);
    },
    [playTone]
  );

  /* ── 성공 사운드 ──
     합 = 10 달성 시, 콤보에 따라 반짝이는 아르페지오 */
  const playSuccess = useCallback(
    (combo: number) => {
      if (mutedRef.current) return;
      const ac = ctx();
      const t = ac.currentTime;

      // 콤보가 높을수록 음계가 올라가고 더 빠르게 연주
      const semitone = Math.min(combo - 1, 6);
      const pitch = (n: number) => n * Math.pow(2, semitone / 12);
      const gap = Math.max(0.055 - combo * 0.004, 0.03);

      // 도-미-솔-도(옥타브) 아르페지오
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        playTone(pitch(freq), "sine", 0.35, 0.22, t + i * gap, pitch(freq) * 1.05);
      });

      // 마지막에 짧은 '반짝' 고음 추가
      playTone(pitch(2093), "sine", 0.15, 0.12, t + notes.length * gap);
    },
    [playTone]
  );

  /* ── 실패 사운드 ──
     합이 10이 아닐 때 짧은 하강 '뿅' */
  const playFail = useCallback(() => {
    if (mutedRef.current) return;
    const ac = ctx();
    const t = ac.currentTime;
    playTone(320, "triangle", 0.2, 0.18, t, 160);
  }, [playTone]);

  /* ── 콤보 팡파레 ──
     콤보 3 이상일 때 추가로 짧은 상승음 */
  const playCombo = useCallback(
    (combo: number) => {
      if (mutedRef.current || combo < 3) return;
      const ac = ctx();
      const t = ac.currentTime;
      const base = 880 + combo * 40;
      playTone(base, "sine", 0.18, 0.08, t);
      playTone(base * 1.5, "sine", 0.12, 0.08, t + 0.07);
    },
    [playTone]
  );

  /* ── 게임 오버 ──
     짧은 하강 멜로디 */
  const playGameOver = useCallback(() => {
    if (mutedRef.current) return;
    const ac = ctx();
    const t = ac.currentTime;
    const seq = [523.25, 440, 349.23, 261.63];
    seq.forEach((freq, i) => {
      playTone(freq, "triangle", 0.3, 0.35, t + i * 0.18, freq * 0.92);
    });
  }, [playTone]);

  /* ── 뮤트 토글 ── */
  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    return mutedRef.current;
  }, []);

  const isMuted = () => mutedRef.current;

  return { playTick, playSuccess, playFail, playCombo, playGameOver, toggleMute, isMuted };
}
