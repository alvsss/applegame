"use client";

import { useRef, useCallback } from "react";
import { getCtx } from "@/lib/audioCtx";

/* ───────── 템포 ───────── */
const BPM        = 138;
const BEAT       = 60 / BPM;        // 4분음표 (≈ 0.435s)
const LOOP_BEATS = 64;              // 16마디 루프
const LOOP_DUR   = LOOP_BEATS * BEAT; // ≈ 28초
const LOOKAHEAD  = 0.22;
const TICK_MS    = 25;

/* ─────────────────────────────────────────────
   멜로디: [주파수(Hz), 박자수]
   C 장조 16마디, 138 BPM — 코드 진행: C→G→Am→F
   8분음표 런 + 롱노트 교차, 마디16 → 마디1 심리스 접합
───────────────────────────────────────────── */
const MELODY: [number, number][] = [
  // 마디 1 — C, 활기찬 인트로 런
  [523.25,0.5],[659.25,0.5],[783.99,0.5],[659.25,0.5],[523.25,0.5],[392.00,0.5],[440.00,0.5],[523.25,0.5],
  // 마디 2 — C, 상승 멜로디
  [659.25,1],[783.99,1],[880.00,0.5],[783.99,0.5],[659.25,1],
  // 마디 3 — C, 리듬감 강조
  [783.99,0.5],[659.25,0.5],[523.25,0.5],[659.25,0.5],[783.99,0.5],[880.00,0.5],[783.99,0.5],[659.25,0.5],
  // 마디 4 — C, 여운
  [523.25,2],[392.00,1],[523.25,1],
  // 마디 5 — G, 도미넌트 런
  [493.88,0.5],[587.33,0.5],[783.99,0.5],[587.33,0.5],[493.88,0.5],[392.00,0.5],[440.00,0.5],[493.88,0.5],
  // 마디 6 — G, 리드 멜로디
  [587.33,1],[783.99,1],[880.00,0.5],[783.99,0.5],[587.33,1],
  // 마디 7 — G, 에너지 피크
  [783.99,0.5],[698.46,0.5],[659.25,0.5],[587.33,0.5],[493.88,0.5],[587.33,0.5],[783.99,0.5],[987.77,0.5],
  // 마디 8 — G, 정착
  [783.99,2],[587.33,1],[392.00,1],
  // 마디 9 — Am, 감성 전환
  [440.00,0.5],[523.25,0.5],[659.25,0.5],[523.25,0.5],[440.00,0.5],[329.63,0.5],[392.00,0.5],[440.00,0.5],
  // 마디 10 — Am, 상승 선율
  [523.25,1],[659.25,1],[783.99,0.5],[880.00,0.5],[783.99,1],
  // 마디 11 — Am, 리드미컬
  [659.25,0.5],[783.99,0.5],[880.00,0.5],[783.99,0.5],[659.25,0.5],[523.25,0.5],[440.00,0.5],[523.25,0.5],
  // 마디 12 — Am, 긴 호흡
  [880.00,2],[659.25,1],[440.00,1],
  // 마디 13 — F, 따뜻한 전환
  [349.23,0.5],[440.00,0.5],[523.25,0.5],[440.00,0.5],[349.23,0.5],[440.00,0.5],[523.25,0.5],[698.46,0.5],
  // 마디 14 — F, 클라이맥스
  [880.00,1],[1046.50,1],[880.00,0.5],[698.46,0.5],[523.25,1],
  // 마디 15 — F, 하강 패시지
  [698.46,0.5],[659.25,0.5],[587.33,0.5],[523.25,0.5],[587.33,0.5],[659.25,0.5],[698.46,0.5],[783.99,0.5],
  // 마디 16 — 루프 접합 (C 해결)
  [783.99,0.5],[659.25,0.5],[587.33,0.5],[523.25,0.5],[392.00,1],[523.25,1],
];

/* ── 베이스: [주파수, 박자] ── */
const BASS: [number, number][] = [
  // C (마디 1-4)
  [130.81,2],[98.00,2], [130.81,2],[98.00,2],
  [130.81,2],[98.00,2], [130.81,1],[98.00,1],[130.81,1],[98.00,1],
  // G (마디 5-8)
  [98.00,2],[146.83,2], [98.00,2],[146.83,2],
  [98.00,2],[146.83,2], [98.00,1],[146.83,1],[98.00,1],[146.83,1],
  // Am (마디 9-12)
  [110.00,2],[82.41,2], [110.00,2],[82.41,2],
  [110.00,2],[82.41,2], [110.00,1],[82.41,1],[110.00,1],[82.41,1],
  // F (마디 13-16)
  [87.31,2],[130.81,2], [87.31,2],[130.81,2],
  [87.31,2],[130.81,2], [87.31,1],[98.00,1],[130.81,1],[146.83,1],
];

/* ── 코드 패드: [3화음], 마디당 1개 (총 16개) ── */
const PADS: [number, number, number][] = [
  // C (마디 1-4)
  [261.63,329.63,392.00],[261.63,329.63,392.00],
  [261.63,329.63,392.00],[261.63,329.63,392.00],
  // G (마디 5-8)
  [196.00,246.94,293.66],[196.00,246.94,293.66],
  [196.00,246.94,293.66],[196.00,246.94,293.66],
  // Am (마디 9-12)
  [220.00,261.63,329.63],[220.00,261.63,329.63],
  [220.00,261.63,329.63],[220.00,261.63,329.63],
  // F (마디 13-16)
  [174.61,220.00,261.63],[174.61,220.00,261.63],
  [174.61,220.00,261.63],[174.61,220.00,261.63],
];

export function useBgm() {
  const masterGain = useRef<GainNode | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTime   = useRef(0);
  const noiseBuf   = useRef<AudioBuffer | null>(null);
  const volRef     = useRef(0.5);

  const getGain = (): GainNode => {
    const ac = getCtx();
    if (!masterGain.current) {
      const g = ac.createGain();
      g.gain.value = volRef.current;
      g.connect(ac.destination);
      masterGain.current = g;
    }
    return masterGain.current;
  };

  const getNoise = (): AudioBuffer => {
    const ac = getCtx();
    if (!noiseBuf.current) {
      const n    = Math.ceil(ac.sampleRate * 0.5);
      const buf  = ac.createBuffer(1, n, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      noiseBuf.current = buf;
    }
    return noiseBuf.current;
  };

  /* ── 멜로디 (triangle 파, 더 밝고 신남) ── */
  const scheduleMelody = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();
    let   t   = t0;
    for (const [freq, beats] of MELODY) {
      const dur = beats * BEAT;
      const osc = ac.createOscillator();
      const lpf = ac.createBiquadFilter();
      const env = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      lpf.type = "lowpass";
      lpf.frequency.value = 3200;  // 고음 살짝 다듬기
      osc.connect(lpf); lpf.connect(env); env.connect(out);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.24, t + 0.015);
      env.gain.setValueAtTime(0.20, t + dur * 0.55);
      env.gain.linearRampToValueAtTime(0, t + dur * 0.88);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  };

  /* ── 베이스 (triangle + 로우패스) ── */
  const scheduleBass = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();
    let   t   = t0;
    for (const [freq, beats] of BASS) {
      const dur = beats * BEAT;
      const osc = ac.createOscillator();
      const lpf = ac.createBiquadFilter();
      const env = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      lpf.type = "lowpass";
      lpf.frequency.value = 400;
      lpf.Q.value = 0.8;
      osc.connect(lpf); lpf.connect(env); env.connect(out);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.32, t + 0.03);
      env.gain.setValueAtTime(0.25, t + dur * 0.6);
      env.gain.linearRampToValueAtTime(0, t + dur * 0.92);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  };

  /* ── 코드 패드 (sine, 아주 소프트) ── */
  const schedulePads = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();
    PADS.forEach((triad, i) => {
      const t   = t0 + i * 4 * BEAT;
      const dur = 4 * BEAT;
      triad.forEach((freq) => {
        const osc = ac.createOscillator();
        const env = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(env); env.connect(out);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.040, t + 0.18);
        env.gain.setValueAtTime(0.032, t + dur * 0.7);
        env.gain.linearRampToValueAtTime(0, t + dur);
        osc.start(t); osc.stop(t + dur + 0.05);
      });
    });
  };

  /* ── 킥 드럼 (마디 1·3박 = 매 2박자) ── */
  const scheduleKick = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();
    const count = LOOP_BEATS / 2; // 16 킥
    for (let i = 0; i < count; i++) {
      const t   = t0 + i * 2 * BEAT;
      const dur = 0.14;
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + dur);
      env.gain.setValueAtTime(0.42, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(env); env.connect(out);
      osc.start(t); osc.stop(t + dur + 0.01);
    }
  };

  /* ── 스네어 (마디 2·4박 = 매 2박자, 1박 오프셋) ── */
  const scheduleSnare = (t0: number) => {
    const ac   = getCtx();
    const out  = getGain();
    const buf  = getNoise();
    const count = LOOP_BEATS / 2; // 16 스네어
    for (let i = 0; i < count; i++) {
      const t = t0 + BEAT + i * 2 * BEAT; // 1박 오프셋
      // 노이즈
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bpf = ac.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.value = 1800;
      bpf.Q.value = 0.8;
      const env1 = ac.createGain();
      env1.gain.setValueAtTime(0.12, t);
      env1.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
      src.connect(bpf); bpf.connect(env1); env1.connect(out);
      src.start(t); src.stop(t + 0.12);
      // 톤
      const osc = ac.createOscillator();
      const env2 = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = 190;
      env2.gain.setValueAtTime(0.08, t);
      env2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(env2); env2.connect(out);
      osc.start(t); osc.stop(t + 0.09);
    }
  };

  /* ── 하이햇 (8분음표, 박자 강조) ── */
  const scheduleHats = (t0: number) => {
    const ac   = getCtx();
    const out  = getGain();
    const buf  = getNoise();
    const step  = BEAT * 0.5;
    const count = Math.round(LOOP_DUR / step);
    for (let i = 0; i < count; i++) {
      const t    = t0 + i * step;
      const isOn = i % 2 === 0;
      const src  = ac.createBufferSource();
      src.buffer = buf;
      const hpf  = ac.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 9000;
      const env = ac.createGain();
      env.gain.setValueAtTime(isOn ? 0.052 : 0.028, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.040);
      src.connect(hpf); hpf.connect(env); env.connect(out);
      src.start(t); src.stop(t + 0.05);
    }
  };

  /* ── 1루프 전체 스케줄 ── */
  const scheduleLoop = (t0: number) => {
    scheduleMelody(t0);
    scheduleBass(t0);
    schedulePads(t0);
    scheduleKick(t0);
    scheduleSnare(t0);
    scheduleHats(t0);
  };

  const tick = useCallback(() => {
    const ac = getCtx();
    while (nextTime.current < ac.currentTime + LOOKAHEAD) {
      scheduleLoop(nextTime.current);
      nextTime.current += LOOP_DUR;
    }
  }, []); // eslint-disable-line

  const play = useCallback(() => {
    const ac = getCtx();
    const g  = getGain();
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(volRef.current, ac.currentTime);
    nextTime.current = ac.currentTime + 0.05;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, TICK_MS);
    tick();
  }, [tick]); // eslint-disable-line

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (masterGain.current) {
      const ac = getCtx();
      masterGain.current.gain.setValueAtTime(masterGain.current.gain.value, ac.currentTime);
      masterGain.current.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    volRef.current = vol;
    if (masterGain.current) {
      const ac = getCtx();
      masterGain.current.gain.setValueAtTime(vol, ac.currentTime);
    }
  }, []);

  return { play, stop, setVolume };
}
