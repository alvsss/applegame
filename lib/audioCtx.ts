"use client";

// BGM과 SFX가 하나의 AudioContext를 공유 (브라우저 제한 대비)
let _ctx: AudioContext | null = null;

export function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  }
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}
