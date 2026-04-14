"use client";

import { useRef, useCallback } from "react";
import { getCtx } from "@/lib/audioCtx";

/* ── 템포 설정 ── */
const BPM = 116;
const BEAT = 60 / BPM;          // 4분음표 길이(초)
const LOOP_BEATS = 16;           // 4마디 루프
const LOOP_DUR = LOOP_BEATS * BEAT;
const LOOKAHEAD = 0.20;          // 스케줄 선행 시간
const TICK_MS = 25;              // 스케줄러 호출 간격

/* ──────────────────────────────────────────────
   멜로디: [주파수(Hz), 박자 수]
   C 장조 4마디 루프 (C → Am → F → G)
   각 값은 4분음표 기준, 0 = 쉼표
────────────────────────────────────────────── */
const MELODY: [number, number][] = [
  // 마디1 (C major)
  [523.25, 1], [659.25, 1], [783.99, 1], [659.25, 1],
  // 마디2 (A minor)
  [523.25, 1], [440.00, 1], [523.25, 2],
  // 마디3 (F major)
  [349.23, 1], [440.00, 1], [523.25, 1], [440.00, 1],
  // 마디4 (G major — 해결)
  [392.00, 1], [493.88, 1], [587.33, 2],
];

/* ── 베이스: 마디당 1음 (각 4박자) ── */
const BASS_HZ = [130.81, 110.00, 87.31, 98.00]; // C3 A2 F2 G2

/* ── 화음(패드): 각 마디의 근음 3화음 ── */
const CHORD_HZ: [number, number, number][] = [
  [261.63, 329.63, 392.00], // C4 E4 G4
  [220.00, 261.63, 329.63], // A3 C4 E4
  [174.61, 220.00, 261.63], // F3 A3 C4
  [196.00, 246.94, 293.66], // G3 B3 D4
];

/* ─────────────────────────────────── */
export function useBgm() {
  const masterGain = useRef<GainNode | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTime   = useRef(0);
  const noiseBuf   = useRef<AudioBuffer | null>(null);
  const volRef     = useRef(0.5);

  /* 마스터 Gain 노드 (BGM 전체 볼륨) */
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

  /* 하이햇용 화이트 노이즈 버퍼 (한 번만 생성) */
  const getNoiseBuf = (): AudioBuffer => {
    const ac = getCtx();
    if (!noiseBuf.current) {
      const size = Math.ceil(ac.sampleRate * 0.5);
      const buf  = ac.createBuffer(1, size, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
      noiseBuf.current = buf;
    }
    return noiseBuf.current;
  };

  /* ── 멜로디 스케줄 ── */
  const scheduleMelody = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();
    let   t   = t0;

    for (const [freq, beats] of MELODY) {
      const dur = beats * BEAT;
      if (freq > 0) {
        const osc = ac.createOscillator();
        const env = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(env);
        env.connect(out);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.20, t + 0.018);
        env.gain.setValueAtTime(0.17, t + dur * 0.55);
        env.gain.linearRampToValueAtTime(0, t + dur * 0.88);
        osc.start(t);
        osc.stop(t + dur);
      }
      t += dur;
    }
  };

  /* ── 베이스 스케줄 ── */
  const scheduleBass = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();

    BASS_HZ.forEach((freq, i) => {
      const t   = t0 + i * 4 * BEAT;
      const dur = 4 * BEAT;
      const osc = ac.createOscillator();
      const lpf = ac.createBiquadFilter();
      const env = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      lpf.type = "lowpass";
      lpf.frequency.value = 500;
      osc.connect(lpf);
      lpf.connect(env);
      env.connect(out);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.26, t + 0.04);
      env.gain.setValueAtTime(0.20, t + dur * 0.55);
      env.gain.linearRampToValueAtTime(0, t + dur * 0.90);
      osc.start(t);
      osc.stop(t + dur);
    });
  };

  /* ── 화음(패드) 스케줄 — 아주 부드럽게 ── */
  const scheduleChords = (t0: number) => {
    const ac  = getCtx();
    const out = getGain();

    CHORD_HZ.forEach((triad, i) => {
      const t   = t0 + i * 4 * BEAT;
      const dur = 4 * BEAT;
      triad.forEach((freq) => {
        const osc = ac.createOscillator();
        const env = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(env);
        env.connect(out);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.045, t + 0.15);
        env.gain.setValueAtTime(0.038, t + dur * 0.7);
        env.gain.linearRampToValueAtTime(0, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    });
  };

  /* ── 하이햇 스케줄 (8분음표마다) ── */
  const scheduleHats = (t0: number) => {
    const ac    = getCtx();
    const out   = getGain();
    const buf   = getNoiseBuf();
    const step  = BEAT * 0.5;
    const count = Math.round(LOOP_DUR / step);

    for (let i = 0; i < count; i++) {
      const t    = t0 + i * step;
      const isOn = i % 2 === 0; // 박자 정박 = 조금 더 크게
      const vol  = isOn ? 0.055 : 0.030;

      const src = ac.createBufferSource();
      src.buffer = buf;
      const hpf = ac.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 8500;
      const env = ac.createGain();
      env.gain.setValueAtTime(vol, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(hpf);
      hpf.connect(env);
      env.connect(out);
      src.start(t);
      src.stop(t + 0.05);
    }
  };

  /* ── 1루프 전체 스케줄 ── */
  const scheduleLoop = (t0: number) => {
    scheduleMelody(t0);
    scheduleBass(t0);
    scheduleChords(t0);
    scheduleHats(t0);
  };

  /* ── look-ahead 스케줄러 tick ── */
  const tick = useCallback(() => {
    const ac = getCtx();
    while (nextTime.current < ac.currentTime + LOOKAHEAD) {
      scheduleLoop(nextTime.current);
      nextTime.current += LOOP_DUR;
    }
  }, []); // eslint-disable-line

  /* ── 재생 ── */
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

  /* ── 정지 (페이드아웃) ── */
  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (masterGain.current) {
      const ac = getCtx();
      masterGain.current.gain.setValueAtTime(
        masterGain.current.gain.value,
        ac.currentTime
      );
      masterGain.current.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6);
    }
  }, []);

  /* ── 볼륨 조절 (0~1) ── */
  const setVolume = useCallback((vol: number) => {
    volRef.current = vol;
    if (masterGain.current) {
      const ac = getCtx();
      masterGain.current.gain.setValueAtTime(vol, ac.currentTime);
    }
  }, []);

  return { play, stop, setVolume };
}
