"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useSound } from "@/hooks/useSound";
import { useBgm }   from "@/hooks/useBgm";

/* ─────────────────── 상수 ─────────────────── */
const ROWS = 9;
const COLS = 7;
const GAME_TIME = 60;

// 제거 애니메이션 지속 시간 (ms) — tailwind pop-out 과 맞춤
const REMOVE_MS  = 180;
// 낙하 애니메이션 지속 시간 (ms)
const FALL_MS    = 220;

/* ─────────────────── 타입 ─────────────────── */
interface Cell {
  value: number;
  id: number;
  isNew: boolean;
}
type Pos        = { row: number; col: number };
type GameStatus = "idle" | "playing" | "over";

/* ─────────────────── 헬퍼 ─────────────────── */
let cellIdSeq = 0;
const randValue = (): number => {
  const r = Math.random();
  if (r < 0.5)  return Math.floor(Math.random() * 3) + 1; // 1~3 (50%)
  if (r < 0.8)  return Math.floor(Math.random() * 3) + 4; // 4~6 (30%)
  return Math.floor(Math.random() * 3) + 7;               // 7~9 (20%)
};
const mkCell   = (): Cell => ({ value: randValue(), id: cellIdSeq++, isNew: true });
const keepCell = (c: Cell): Cell => c.isNew ? { ...c, isNew: false } : c;
const initGrid = (): Cell[][] => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, mkCell));

const isAdjacent = (a: Pos, b: Pos) =>
  (Math.abs(a.row - b.row) === 1 && a.col === b.col) ||
  (a.row === b.row && Math.abs(a.col - b.col) === 1);

/* ─────────────────── 색상 ─────────────────── */
const COLORS: Record<number, string> = {
  1: "bg-red-400 shadow-red-200",
  2: "bg-orange-400 shadow-orange-200",
  3: "bg-amber-400 shadow-amber-200",
  4: "bg-lime-500 shadow-lime-200",
  5: "bg-emerald-500 shadow-emerald-200",
  6: "bg-cyan-500 shadow-cyan-200",
  7: "bg-blue-500 shadow-blue-200",
  8: "bg-violet-500 shadow-violet-200",
  9: "bg-pink-500 shadow-pink-200",
};

/* ─────────────────── 컴포넌트 ─────────────────── */
export default function Game() {
  /* ── 상태 ── */
  const [grid,          setGrid]          = useState<Cell[][]>(initGrid);
  const [status,        setStatus]        = useState<GameStatus>("idle");
  const [selection,     setSelection]     = useState<Pos[]>([]);
  const [score,         setScore]         = useState(0);
  const [highScore,     setHighScore]     = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(GAME_TIME);
  const [removing,      setRemoving]      = useState<Set<string>>(new Set());
  const [isShaking,     setIsShaking]     = useState(false);
  const [comboCount,    setComboCount]    = useState(0);
  const [bgmVol,        setBgmVol]        = useState(55);
  const [sfxVol,        setSfxVol]        = useState(80);
  const [floatingScores, setFloatingScores] = useState<
    { id: number; value: number; x: number; y: number }[]
  >([]);

  /* ── 사운드 ── */
  const { playTick, playSuccess, playFail, playCombo, playGameOver, setVolume: setSfxVolume } = useSound();
  const bgm = useBgm();

  /* ── Refs ── */
  const dragging        = useRef(false);
  const isAnimating     = useRef(false);
  const selectionRef    = useRef(selection);
  const gridRef         = useRef(grid);
  const statusRef       = useRef(status);
  const scoreRef        = useRef(score);
  const lastSuccessTime = useRef(0);
  const comboRef        = useRef(0);
  const comboTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatIdSeq      = useRef(0);
  const gridDomRef      = useRef<HTMLDivElement>(null);
  // FLIP 애니메이션용: 그리드 업데이트 직전 각 셀의 화면 위치를 보관
  const snapPositions   = useRef<Map<number, DOMRect>>(new Map());

  selectionRef.current = selection;
  gridRef.current      = grid;
  statusRef.current    = status;
  scoreRef.current     = score;

  /* ── 초기 로드 ── */
  useEffect(() => {
    const hs = localStorage.getItem("appleGame_hs");
    const bv = localStorage.getItem("appleGame_bgmVol");
    const sv = localStorage.getItem("appleGame_sfxVol");
    if (hs) setHighScore(Number(hs));
    if (bv) setBgmVol(Number(bv));
    if (sv) setSfxVol(Number(sv));
  }, []);

  /* ── 볼륨 동기화 ── */
  useEffect(() => {
    bgm.setVolume(bgmVol / 100);
    localStorage.setItem("appleGame_bgmVol", String(bgmVol));
  }, [bgmVol]); // eslint-disable-line

  useEffect(() => {
    setSfxVolume(sfxVol / 100);
    localStorage.setItem("appleGame_sfxVol", String(sfxVol));
  }, [sfxVol, setSfxVolume]);

  /* ── BGM 재생/정지 ── */
  useEffect(() => {
    if (status === "playing") bgm.play();
    else                      bgm.stop();
  }, [status]); // eslint-disable-line

  /* ── 타이머 ── */
  useEffect(() => {
    if (status !== "playing") return;
    if (timeLeft <= 0) {
      setStatus("over");
      playGameOver();
      const final = scoreRef.current;
      setHighScore((prev) => {
        const next = Math.max(prev, final);
        localStorage.setItem("appleGame_hs", String(next));
        return next;
      });
      return;
    }
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [status, timeLeft, playGameOver]);

  /* ════════════════════════════════════════════════
     FLIP 낙하 애니메이션
     - grid 상태가 변경된 직후, 브라우저가 화면을 그리기 전(useLayoutEffect)에 실행
     - snapPositions에 저장된 "이동 전 위치"와 "이동 후 위치"의 차이를 계산
     - 순간이동(Invert) → transition으로 새 위치까지 이동(Play)
  ════════════════════════════════════════════════ */
  useLayoutEffect(() => {
    const stored = snapPositions.current;
    if (stored.size === 0 || !gridDomRef.current) return;

    const els = gridDomRef.current.querySelectorAll<HTMLElement>("[data-cell-id]");

    els.forEach((el) => {
      const id      = Number(el.dataset.cellId);
      const oldRect = stored.get(id);
      if (!oldRect) return; // 새 셀 — pop-in이 담당

      const newRect = el.getBoundingClientRect();
      const dy      = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) return; // 실제로 이동하지 않은 셀

      // ① Invert: transition 없이 이전 위치로 순간이동
      el.style.transition = "none";
      el.style.transform  = `translateY(${dy}px)`;

      // ② Play: 다음 프레임부터 새 위치로 부드럽게 이동
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = `transform ${FALL_MS}ms ease-out`;
          el.style.transform  = "";
        });
      });
    });

    // 사용한 스냅 데이터 초기화
    snapPositions.current = new Map();
  }, [grid]);

  /* ── 시작 ── */
  const startGame = () => {
    setGrid(initGrid());
    setSelection([]);
    setScore(0);
    setTimeLeft(GAME_TIME);
    setStatus("playing");
    setRemoving(new Set());
    setIsShaking(false);
    setComboCount(0);
    setFloatingScores([]);
    snapPositions.current   = new Map();
    dragging.current        = false;
    isAnimating.current     = false;
    lastSuccessTime.current = 0;
    comboRef.current        = 0;
    if (comboTimerRef.current) { clearTimeout(comboTimerRef.current); comboTimerRef.current = null; }
  };

  /* ════════════════════════════════════════════════
     핵심 로직: 선택 확정
     합 = 10 → ① 제거 애니메이션(REMOVE_MS)
              → ② 위치 스냅 기록
              → ③ 그리드 업데이트(중력 + 새 셀)
              → ④ FLIP 낙하 애니메이션(FALL_MS)
     합 ≠ 10 → 흔들기
  ════════════════════════════════════════════════ */
  const confirmSelection = useCallback(() => {
    const sel = selectionRef.current;
    const g   = gridRef.current;

    if (!sel.length || statusRef.current !== "playing" || isAnimating.current) return;

    const sum = sel.reduce((acc, { row, col }) => acc + g[row][col].value, 0);

    if (sum === 10) {
      isAnimating.current = true;

      // 제거 대상 표시 → pop-out 애니메이션 시작
      setRemoving(new Set(sel.map(({ row, col }) => `${row}-${col}`)));

      // 콤보
      const now    = Date.now();
      let newCombo = 1;
      if (lastSuccessTime.current > 0 && now - lastSuccessTime.current < 2000)
        newCombo = Math.min(comboRef.current + 1, 10);
      comboRef.current        = newCombo;
      lastSuccessTime.current = now;
      setComboCount(newCombo);
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
      comboTimerRef.current = setTimeout(() => setComboCount(0), 2000);

      playSuccess(newCombo);
      playCombo(newCombo);

      const points = sel.length * 10 * newCombo;

      // 플로팅 점수
      if (gridDomRef.current) {
        const el = gridDomRef.current.querySelector(
          `[data-row="${sel[0].row}"][data-col="${sel[0].col}"]`
        );
        if (el) {
          const r  = el.getBoundingClientRect();
          const id = floatIdSeq.current++;
          setFloatingScores((prev) => [
            ...prev,
            { id, value: points, x: r.left + r.width / 2, y: r.top },
          ]);
          setTimeout(() => setFloatingScores((p) => p.filter((f) => f.id !== id)), 900);
        }
      }

      // REMOVE_MS 후: 위치 스냅 기록 → 그리드 업데이트
      setTimeout(() => {
        // ★ 그리드 업데이트 직전에 현재 모든 셀의 화면 위치를 저장
        //    (제거된 셀 제외 — 이미 scale-0 이므로 의미 없는 위치)
        if (gridDomRef.current) {
          const removed = new Set(sel.map(({ row, col }) => `${row}-${col}`));
          const els     = gridDomRef.current.querySelectorAll<HTMLElement>("[data-cell-id]");
          const pos     = new Map<number, DOMRect>();
          els.forEach((el) => {
            const row = el.dataset.row;
            const col = el.dataset.col;
            if (removed.has(`${row}-${col}`)) return; // 제거 셀 제외
            pos.set(Number(el.dataset.cellId), el.getBoundingClientRect());
          });
          snapPositions.current = pos;
        }

        // 그리드 상태 업데이트 (중력 적용 + 새 셀)
        setGrid((prev) => {
          const removed = new Set(sel.map(({ row, col }) => `${row}-${col}`));
          const next: Cell[][] = Array.from({ length: ROWS }, () => new Array(COLS));
          for (let c = 0; c < COLS; c++) {
            const kept: Cell[] = [];
            for (let r = ROWS - 1; r >= 0; r--)
              if (!removed.has(`${r}-${c}`)) kept.push(keepCell(prev[r][c]));
            for (let i = 0; i < kept.length; i++)  next[ROWS - 1 - i][c] = kept[i];
            for (let r = 0; r < ROWS - kept.length; r++) next[r][c] = mkCell();
          }
          return next;
        });

        setScore((s) => s + points);
        setTimeLeft((t) => Math.min(t + sel.length * 0.3, GAME_TIME));
        setRemoving(new Set());
        setSelection([]);

        // FLIP 낙하 애니메이션이 끝난 뒤 인터랙션 잠금 해제
        setTimeout(() => {
          isAnimating.current = false;
        }, FALL_MS + 20);

      }, REMOVE_MS + 20); // 제거 애니메이션 완료 후

    } else {
      if (sel.length >= 2) {
        setIsShaking(true);
        playFail();
        setTimeout(() => setIsShaking(false), 380);
      }
      setSelection([]);
    }
  }, [playSuccess, playCombo, playFail]);

  /* ── 전역 mouseup ── */
  useEffect(() => {
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      confirmSelection();
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [confirmSelection]);

  /* ── 셀 이벤트 ── */
  const onCellMouseDown = (row: number, col: number) => {
    if (statusRef.current !== "playing" || isAnimating.current) return;
    dragging.current = true;
    playTick(0);
    setSelection([{ row, col }]);
  };

  const onCellMouseEnter = useCallback((row: number, col: number) => {
    if (!dragging.current || isAnimating.current) return;
    setSelection((prev) => {
      if (!prev.length) return prev;
      const idx = prev.findIndex((s) => s.row === row && s.col === col);
      if (idx >= 0) { playTick(Math.max(idx - 1, 0)); return prev.slice(0, idx + 1); }
      const last = prev[prev.length - 1];
      if (!isAdjacent(last, { row, col })) return prev;
      playTick(prev.length);
      return [...prev, { row, col }];
    });
  }, [playTick]);

  /* ── 터치 ── */
  const getPos = (x: number, y: number): Pos | null => {
    const el = document.elementFromPoint(x, y);
    const r  = el?.getAttribute("data-row");
    const c  = el?.getAttribute("data-col");
    return r != null && c != null ? { row: +r, col: +c } : null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (statusRef.current !== "playing" || isAnimating.current) return;
    const { clientX, clientY } = e.touches[0];
    const pos = getPos(clientX, clientY);
    if (!pos) return;
    dragging.current = true;
    playTick(0);
    setSelection([pos]);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const { clientX, clientY } = e.touches[0];
    const pos = getPos(clientX, clientY);
    if (pos) onCellMouseEnter(pos.row, pos.col);
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    confirmSelection();
  };

  /* ── 파생값 ── */
  const selSum     = selection.reduce((acc, { row, col }) => acc + (grid[row]?.[col]?.value ?? 0), 0);
  const timerRatio = timeLeft / GAME_TIME;
  const timerColor = timeLeft > 60 ? "bg-green-400" : timeLeft > 20 ? "bg-yellow-400" : "bg-red-500";
  const isNewRecord = status === "over" && score > 0 && score >= highScore;

  /* ─────────────────── 렌더 ─────────────────── */
  return (
    <div
      className="flex flex-col items-center min-h-screen py-4 px-3 gap-3"
      style={{ touchAction: "none" }}
    >
      <h1 className="text-3xl font-black text-orange-600 tracking-tight">🍎 사과게임</h1>

      {/* HUD */}
      {status === "playing" && (
        <div className="w-full max-w-xs space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${timerColor}`}
              style={{ width: `${timerRatio * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <Stat label="시간" value={`${Math.floor(timeLeft)}s`} className={timeLeft <= 10 ? "text-red-500 animate-pulse2" : "text-gray-700"} />
            <Stat label="합계" value={selSum > 0 ? String(selSum) : "—"}
              className={selSum === 10 ? "text-green-500" : selSum > 10 ? "text-red-500" : selSum > 0 ? "text-orange-500" : "text-gray-300"} />
            <Stat label="점수" value={String(score)}     className="text-orange-600" />
            <Stat label="최고" value={String(highScore)} className="text-purple-600" />
          </div>
        </div>
      )}

      {/* 그리드 */}
      {status !== "idle" && (
        <div className="relative" style={{ width: "min(100%, 336px)" }}>
          {comboCount > 1 && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <span className="text-orange-500 font-black text-3xl drop-shadow-lg">🔥 {comboCount}x COMBO!</span>
            </div>
          )}
          <div
            className={`bg-white/80 backdrop-blur p-2 rounded-2xl shadow-2xl border-2 border-orange-200 ${isShaking ? "animate-shake" : ""}`}
            ref={gridDomRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: "4px" }}>
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const isSelected = selection.some((s) => s.row === r && s.col === c);
                const isRemoving = removing.has(`${r}-${c}`);
                return (
                  <div
                    key={cell.id}
                    data-row={r}
                    data-col={c}
                    data-cell-id={cell.id}  // FLIP 애니메이션 식별자
                    className={[
                      "aspect-square rounded-xl flex items-center justify-center",
                      "font-black text-white text-base cursor-pointer shadow-md",
                      cell.isNew ? "animate-pop-in" : "",
                      COLORS[cell.value],
                      isSelected
                        ? "ring-4 ring-white ring-offset-1 scale-110 brightness-125 z-10 relative"
                        : "hover:brightness-110 active:brightness-125",
                      isRemoving ? "animate-pop-out pointer-events-none" : "",
                    ].filter(Boolean).join(" ")}
                    onMouseDown={(e) => { e.preventDefault(); onCellMouseDown(r, c); }}
                    onMouseEnter={() => onCellMouseEnter(r, c)}
                  >
                    {cell.value}
                  </div>
                );
              })
            )}
          </div>
          </div>
        </div>
      )}

      {/* 볼륨 컨트롤 */}
      <div className="bg-white/70 backdrop-blur rounded-2xl px-5 py-3 shadow border border-orange-100 flex items-center gap-6">
        <VolumeCtrl icon="🎵" label="BGM"   value={bgmVol} onChange={setBgmVol} />
        <div className="w-px h-8 bg-gray-200" />
        <VolumeCtrl icon="🔊" label="효과음" value={sfxVol} onChange={setSfxVol} />
      </div>

      {/* 시작 화면 */}
      {status === "idle" && (
        <div className="flex flex-col items-center gap-4 max-w-xs w-full px-2">
          <div className="bg-white/90 rounded-2xl p-5 shadow-lg border border-orange-100 w-full space-y-3">
            <RuleItem icon="👆" text="인접한 숫자를 드래그로 연결하세요" />
            <RuleItem icon="🎯" text={<>합이 <strong className="text-orange-500">10</strong>이 되면 제거 &amp; 점수!</>} />
            <RuleItem icon="🔥" text="연속 성공하면 콤보 보너스!" />
            <RuleItem icon="⏱️" text="제한 시간: 60초 (블록 제거 시 +0.3초)" />
          </div>
          {highScore > 0 && <p className="text-purple-600 font-bold text-sm">최고 기록: {highScore}점</p>}
          <button
            onClick={startGame}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-2xl rounded-2xl shadow-lg hover:brightness-110 active:scale-95 transition-all"
          >
            게임 시작!
          </button>
        </div>
      )}

      {/* 게임 오버 */}
      {status === "over" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 px-6">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="text-6xl mb-2">{isNewRecord ? "🏆" : "🎊"}</div>
            <h2 className="text-2xl font-black mb-5">게임 종료!</h2>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 mb-4 border border-orange-100">
              <p className="text-sm text-gray-400 mb-1">최종 점수</p>
              <p className="text-6xl font-black text-orange-600 leading-none">{score}</p>
              {isNewRecord && <p className="text-green-500 font-bold text-sm mt-2">✨ 새로운 최고 기록!</p>}
            </div>
            <div className="mb-6">
              <p className="text-xs text-gray-400">역대 최고</p>
              <p className="text-3xl font-black text-purple-600">{highScore}</p>
            </div>
            <button
              onClick={startGame}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-xl rounded-2xl shadow-lg active:scale-95 transition-all hover:brightness-110"
            >
              다시 시작!
            </button>
          </div>
        </div>
      )}

      {/* 플로팅 점수 */}
      {floatingScores.map((f) => (
        <div
          key={f.id}
          className="fixed pointer-events-none font-black text-xl text-orange-500 animate-score-float z-50"
          style={{ left: f.x, top: f.y, transform: "translateX(-50%)", textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
        >
          +{f.value}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── 서브 컴포넌트 ─────────────────── */
function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="text-center min-w-[56px]">
      <div className="text-xs text-gray-400 font-medium">{label}</div>
      <div className={`text-xl font-black leading-tight ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function RuleItem({ icon, text }: { icon: string; text: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm text-gray-600">
      <span className="text-xl leading-none">{icon}</span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}

function VolumeCtrl({ icon, label, value, onChange }: {
  icon: string; label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-xs text-gray-500 font-bold w-6 text-right">{value}</span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 h-1.5 accent-orange-500 cursor-pointer"
      />
    </div>
  );
}
