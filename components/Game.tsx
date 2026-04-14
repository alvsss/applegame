"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────── 상수 ─────────────────── */
const ROWS = 9;      // 세로 칸 수
const COLS = 7;      // 가로 칸 수
const GAME_TIME = 120; // 제한 시간(초)

/* ─────────────────── 타입 ─────────────────── */
interface Cell {
  value: number; // 1~9
  id: number;    // React key로 쓰이는 고유 ID
}

type Pos = { row: number; col: number };

type GameStatus = "idle" | "playing" | "over";

/* ─────────────────── 헬퍼 ─────────────────── */
// 전역 셀 ID 카운터 (절대 초기화하지 않아야 React가 신규 셀을 감지)
let cellIdSeq = 0;
const mkCell = (): Cell => ({
  value: Math.floor(Math.random() * 9) + 1,
  id: cellIdSeq++,
});

const initGrid = (): Cell[][] =>
  Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, mkCell)
  );

// 두 좌표가 상하좌우로 인접한지 확인
const isAdjacent = (a: Pos, b: Pos): boolean =>
  (Math.abs(a.row - b.row) === 1 && a.col === b.col) ||
  (a.row === b.row && Math.abs(a.col - b.col) === 1);

/* ─────────────────── 숫자별 색상 ─────────────────── */
const CELL_COLORS: Record<number, string> = {
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
  const [grid, setGrid] = useState<Cell[][]>(initGrid);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [selection, setSelection] = useState<Pos[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [removing, setRemoving] = useState<Set<string>>(new Set()); // "row-col" 형식
  const [isShaking, setIsShaking] = useState(false);
  const [comboCount, setComboCount] = useState(0);
  const [floatingScores, setFloatingScores] = useState<
    { id: number; value: number; x: number; y: number }[]
  >([]);

  /* ── Refs (렌더링 없이 최신 값 접근용) ── */
  const dragging = useRef(false);
  const isAnimating = useRef(false);
  const selectionRef = useRef(selection);
  const gridRef = useRef(grid);
  const statusRef = useRef(status);
  const lastSuccessTime = useRef(0);
  const comboRef = useRef(0);
  const scoreRef = useRef(score);
  const floatIdSeq = useRef(0);
  const gridDomRef = useRef<HTMLDivElement>(null);

  // ref를 항상 최신 상태로 동기화
  selectionRef.current = selection;
  gridRef.current = grid;
  statusRef.current = status;
  scoreRef.current = score;

  /* ── localStorage에서 최고 점수 로드 ── */
  useEffect(() => {
    const stored = localStorage.getItem("appleGame_hs");
    if (stored) setHighScore(Number(stored));
  }, []);

  /* ── 타이머 ── */
  useEffect(() => {
    if (status !== "playing") return;
    if (timeLeft <= 0) {
      // 게임 종료
      setStatus("over");
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
  }, [status, timeLeft]);

  /* ── 게임 시작 / 재시작 ── */
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
    dragging.current = false;
    isAnimating.current = false;
    lastSuccessTime.current = 0;
    comboRef.current = 0;
  };

  /* ─────────────────────────────────────────
     핵심 로직: 선택 확정
     - 합이 10이면 → 제거 애니메이션 후 그리드 갱신 + 점수 추가
     - 합이 10이 아니면 → 흔들기 애니메이션 후 선택 해제
  ───────────────────────────────────────── */
  const confirmSelection = useCallback(() => {
    const sel = selectionRef.current;
    const g = gridRef.current;

    if (sel.length === 0) return;
    if (statusRef.current !== "playing") return;
    if (isAnimating.current) return;

    // 선택된 셀들의 합 계산
    const sum = sel.reduce(
      (acc, { row, col }) => acc + g[row][col].value,
      0
    );

    if (sum === 10) {
      // ── 성공: 제거 + 점수 ──
      isAnimating.current = true;

      const removingSet = new Set(sel.map(({ row, col }) => `${row}-${col}`));
      setRemoving(removingSet);

      // 콤보 계산
      const now = Date.now();
      let newCombo = 1;
      if (lastSuccessTime.current > 0 && now - lastSuccessTime.current < 2000) {
        newCombo = Math.min(comboRef.current + 1, 10);
      }
      comboRef.current = newCombo;
      lastSuccessTime.current = now;
      setComboCount(newCombo);

      const points = sel.length * 10 * newCombo;

      // 플로팅 점수 표시 (첫 번째 선택 셀 위치 기준)
      if (gridDomRef.current) {
        const firstCell = gridDomRef.current.querySelector(
          `[data-row="${sel[0].row}"][data-col="${sel[0].col}"]`
        );
        if (firstCell) {
          const rect = firstCell.getBoundingClientRect();
          const id = floatIdSeq.current++;
          setFloatingScores((prev) => [
            ...prev,
            { id, value: points, x: rect.left + rect.width / 2, y: rect.top },
          ]);
          setTimeout(() => {
            setFloatingScores((prev) => prev.filter((f) => f.id !== id));
          }, 900);
        }
      }

      // 280ms 후 그리드 갱신 (제거 애니메이션 완료 타이밍)
      setTimeout(() => {
        setGrid((prev) => {
          const removed = new Set(sel.map(({ row, col }) => `${row}-${col}`));

          // 각 열(column)별로 중력 적용
          // 1) 제거되지 않은 셀을 아래에서 위로 수집
          // 2) 맨 아래부터 채우고, 남은 위쪽 칸은 새 셀로 채움
          const next: Cell[][] = Array.from({ length: ROWS }, () =>
            new Array(COLS)
          );

          for (let c = 0; c < COLS; c++) {
            const kept: Cell[] = [];
            // 아래에서 위로 순회 → kept[0]이 최하단 셀
            for (let r = ROWS - 1; r >= 0; r--) {
              if (!removed.has(`${r}-${c}`)) {
                kept.push(prev[r][c]);
              }
            }
            // 아래부터 기존 셀 배치 (중력)
            for (let i = 0; i < kept.length; i++) {
              next[ROWS - 1 - i][c] = kept[i];
            }
            // 위 빈칸에 새 셀 채우기
            for (let r = 0; r < ROWS - kept.length; r++) {
              next[r][c] = mkCell();
            }
          }

          return next;
        });

        setScore((s) => s + points);
        setRemoving(new Set());
        setSelection([]);
        isAnimating.current = false;
      }, 280);
    } else {
      // ── 실패: 흔들기 ──
      if (sel.length >= 2) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 380);
      }
      setSelection([]);
    }
  }, []); // ref만 읽으므로 deps 불필요

  /* ─────────────────── 전역 mouseup 처리 ─────────────────── */
  useEffect(() => {
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      confirmSelection();
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [confirmSelection]);

  /* ─────────────────── 셀 이벤트 핸들러 ─────────────────── */
  const onCellMouseDown = (row: number, col: number) => {
    if (statusRef.current !== "playing" || isAnimating.current) return;
    dragging.current = true;
    setSelection([{ row, col }]);
  };

  const onCellMouseEnter = useCallback((row: number, col: number) => {
    if (!dragging.current || isAnimating.current) return;
    setSelection((prev) => {
      if (prev.length === 0) return prev;

      // 이미 선택된 셀을 다시 지나면 → 해당 위치까지 뒤로 되감기
      const existIdx = prev.findIndex((s) => s.row === row && s.col === col);
      if (existIdx >= 0) return prev.slice(0, existIdx + 1);

      // 마지막 선택 셀과 인접한 경우에만 추가
      const last = prev[prev.length - 1];
      if (!isAdjacent(last, { row, col })) return prev;

      return [...prev, { row, col }];
    });
  }, []);

  /* ─────────────────── 터치 이벤트 ─────────────────── */
  // 터치 좌표 → 셀 위치 변환
  const getCellFromPoint = (x: number, y: number): Pos | null => {
    const el = document.elementFromPoint(x, y);
    const r = el?.getAttribute("data-row");
    const c = el?.getAttribute("data-col");
    if (r != null && c != null) return { row: +r, col: +c };
    return null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (statusRef.current !== "playing" || isAnimating.current) return;
    const { clientX, clientY } = e.touches[0];
    const pos = getCellFromPoint(clientX, clientY);
    if (!pos) return;
    dragging.current = true;
    setSelection([pos]);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const { clientX, clientY } = e.touches[0];
    const pos = getCellFromPoint(clientX, clientY);
    if (!pos) return;
    onCellMouseEnter(pos.row, pos.col);
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    confirmSelection();
  };

  /* ─────────────────── 파생값 ─────────────────── */
  const selSum = selection.reduce(
    (acc, { row, col }) => acc + (grid[row]?.[col]?.value ?? 0),
    0
  );
  const timerRatio = timeLeft / GAME_TIME;
  const timerColor =
    timeLeft > 60
      ? "bg-green-400"
      : timeLeft > 20
      ? "bg-yellow-400"
      : "bg-red-500";

  const isNewRecord =
    status === "over" && score > 0 && score >= highScore;

  /* ─────────────────── 렌더 ─────────────────── */
  return (
    <div
      className="flex flex-col items-center min-h-screen py-4 px-3"
      style={{ touchAction: "none" }}
    >
      {/* 제목 */}
      <h1 className="text-3xl font-black text-orange-600 mb-3 tracking-tight">
        🍎 사과게임
      </h1>

      {/* ── 게임 중 HUD ── */}
      {status === "playing" && (
        <div className="w-full max-w-xs mb-3 space-y-2">
          {/* 타이머 바 */}
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${timerColor}`}
              style={{ width: `${timerRatio * 100}%` }}
            />
          </div>

          {/* 통계 행 */}
          <div className="flex justify-between items-center">
            {/* 남은 시간 */}
            <Stat
              label="시간"
              value={`${timeLeft}s`}
              className={
                timeLeft <= 10
                  ? "text-red-500 animate-pulse2"
                  : "text-gray-700"
              }
            />
            {/* 현재 선택 합 */}
            <Stat
              label="합계"
              value={selSum > 0 ? String(selSum) : "—"}
              className={
                selSum === 10
                  ? "text-green-500"
                  : selSum > 10
                  ? "text-red-500"
                  : selSum > 0
                  ? "text-orange-500"
                  : "text-gray-300"
              }
            />
            {/* 점수 */}
            <Stat label="점수" value={String(score)} className="text-orange-600" />
            {/* 최고점수 */}
            <Stat
              label="최고"
              value={String(highScore)}
              className="text-purple-600"
            />
          </div>

          {/* 콤보 표시 */}
          {comboCount > 1 && (
            <div className="text-center text-orange-500 font-black text-lg leading-none">
              🔥 {comboCount}x COMBO!
            </div>
          )}
        </div>
      )}

      {/* ── 게임 그리드 ── */}
      {status !== "idle" && (
        <div
          className={`
            bg-white/80 backdrop-blur p-2 rounded-2xl
            shadow-2xl border-2 border-orange-200
            ${isShaking ? "animate-shake" : ""}
          `}
          style={{ width: "min(100%, 336px)" }}
          ref={gridDomRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gap: "4px",
            }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const isSelected = selection.some(
                  (s) => s.row === r && s.col === c
                );
                const isRemoving = removing.has(`${r}-${c}`);

                return (
                  <div
                    key={cell.id}
                    data-row={r}
                    data-col={c}
                    className={[
                      "aspect-square rounded-xl flex items-center justify-center",
                      "font-black text-white text-base cursor-pointer",
                      "shadow-md transition-transform duration-100",
                      "animate-pop-in",
                      CELL_COLORS[cell.value],
                      isSelected
                        ? "ring-4 ring-white ring-offset-1 scale-110 brightness-125 z-10 relative"
                        : "hover:brightness-110 active:brightness-125",
                      isRemoving ? "animate-pop-out pointer-events-none" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onCellMouseDown(r, c);
                    }}
                    onMouseEnter={() => onCellMouseEnter(r, c)}
                  >
                    {cell.value}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── 시작 화면 ── */}
      {status === "idle" && (
        <div className="flex flex-col items-center gap-5 mt-6 max-w-xs w-full px-2">
          {/* 규칙 카드 */}
          <div className="bg-white/90 rounded-2xl p-5 shadow-lg border border-orange-100 w-full space-y-3">
            <RuleItem
              icon="👆"
              text="인접한 숫자를 드래그로 연결하세요"
            />
            <RuleItem
              icon="🎯"
              text={
                <>
                  합이 <strong className="text-orange-500">10</strong>이 되면
                  제거 &amp; 점수!
                </>
              }
            />
            <RuleItem icon="🔥" text="연속 성공하면 콤보 보너스!" />
            <RuleItem icon="⏱️" text="제한 시간: 120초" />
          </div>

          {highScore > 0 && (
            <p className="text-purple-600 font-bold text-sm">
              최고 기록: {highScore}점
            </p>
          )}

          <button
            onClick={startGame}
            className="
              w-full py-4 bg-gradient-to-r from-orange-500 to-red-500
              text-white font-black text-2xl rounded-2xl
              shadow-lg hover:shadow-orange-300
              hover:from-orange-400 hover:to-red-400
              active:scale-95 transition-all duration-150
            "
          >
            게임 시작!
          </button>
        </div>
      )}

      {/* ── 게임 오버 오버레이 ── */}
      {status === "over" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 px-6">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="text-6xl mb-2">
              {isNewRecord ? "🏆" : "🎊"}
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-5">
              게임 종료!
            </h2>

            {/* 최종 점수 */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 mb-4 border border-orange-100">
              <p className="text-sm text-gray-400 mb-1">최종 점수</p>
              <p className="text-6xl font-black text-orange-600 leading-none">
                {score}
              </p>
              {isNewRecord && (
                <p className="text-green-500 font-bold text-sm mt-2">
                  ✨ 새로운 최고 기록!
                </p>
              )}
            </div>

            {/* 최고 점수 */}
            <div className="mb-6">
              <p className="text-xs text-gray-400">역대 최고</p>
              <p className="text-3xl font-black text-purple-600">
                {highScore}
              </p>
            </div>

            <button
              onClick={startGame}
              className="
                w-full py-3 bg-gradient-to-r from-orange-500 to-red-500
                text-white font-black text-xl rounded-2xl
                shadow-lg active:scale-95 transition-all hover:brightness-110
              "
            >
              다시 시작!
            </button>
          </div>
        </div>
      )}

      {/* ── 플로팅 점수 ── */}
      {floatingScores.map((f) => (
        <div
          key={f.id}
          className="fixed pointer-events-none font-black text-xl text-orange-500 animate-score-float z-50"
          style={{
            left: f.x,
            top: f.y,
            transform: "translateX(-50%)",
            textShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}
        >
          +{f.value}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── 소형 UI 컴포넌트 ─────────────────── */

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="text-center min-w-[56px]">
      <div className="text-xs text-gray-400 font-medium">{label}</div>
      <div className={`text-xl font-black leading-tight ${className ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function RuleItem({
  icon,
  text,
}: {
  icon: string;
  text: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm text-gray-600">
      <span className="text-xl leading-none">{icon}</span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}
