/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Languages,
  HelpCircle,
  X,
  Plus,
  Undo2,
  SlidersHorizontal,
  Sparkles,
  Zap,
  ZapOff,
  Sun,
  Moon,
  Highlighter,
} from 'lucide-react';
import { Board, Difficulty, DifficultyConfig, Language, Theme } from './types';
import {
  generatePuzzle,
  findRuleConflicts,
  checkSolution,
  GRID_SIZE,
} from './utils/sudoku4x4';
import { sound } from './utils/sound';
import { translations } from './translations';

const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
  {
    id: 'easy',
    blanks: 4,
    labelZh: '簡單 (4空)',
    labelEn: 'Easy (4 blanks)',
    descZh: '12個已知數，適合新手或快速練習',
    descEn: '12 clues, ideal for warm-up',
  },
  {
    id: 'medium',
    blanks: 7,
    labelZh: '中等 (7空)',
    labelEn: 'Medium (7 blanks)',
    descZh: '9個已知數，難度適中',
    descEn: '9 clues, balanced challenge',
  },
  {
    id: 'hard',
    blanks: 9,
    labelZh: '困難 (9空)',
    labelEn: 'Hard (9 blanks)',
    descZh: '7個已知數，需仔細推敲',
    descEn: '7 clues, thoughtful logic',
  },
  {
    id: 'expert',
    blanks: 11,
    labelZh: '專家 (11空)',
    labelEn: 'Expert (11 blanks)',
    descZh: '5個已知數，挑戰極限',
    descEn: '5 clues, extreme deduction',
  },
  {
    id: 'custom',
    blanks: 6,
    labelZh: '自訂空白',
    labelEn: 'Custom',
    descZh: '自選空白格子數量 (1 - 12)',
    descEn: 'Choose custom blanks (1 - 12)',
  },
];

export default function App() {
  const [lang, setLang] = useState<Language>('zh');
  const [theme, setTheme] = useState<Theme>('dark');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [instantValidation, setInstantValidation] = useState<boolean>(false);
  const [highlightSameNumber, setHighlightSameNumber] = useState<boolean>(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [customBlanks, setCustomBlanks] = useState<number>(6);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  // Game boards
  const [initialBoard, setInitialBoard] = useState<Board>(() =>
    Array(4).fill(0).map(() => Array(4).fill(0))
  );
  const [currentBoard, setCurrentBoard] = useState<Board>(() =>
    Array(4).fill(0).map(() => Array(4).fill(0))
  );
  const [solutionBoard, setSolutionBoard] = useState<Board>(() =>
    Array(4).fill(0).map(() => Array(4).fill(0))
  );

  // Interaction State
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [history, setHistory] = useState<Board[]>([]);
  const [checkedResult, setCheckedResult] = useState<{
    hasChecked: boolean;
    isCorrect: boolean;
    errorCount: number;
    errorCoords: Set<string>;
    message?: string;
  } | null>(null);
  const [isVictory, setIsVictory] = useState<boolean>(false);

  const t = translations[lang];

  // Get active blank count based on difficulty
  const getActiveBlanks = useCallback(
    (diff: Difficulty, customVal: number) => {
      if (diff === 'custom') return customVal;
      const found = DIFFICULTY_CONFIGS.find((d) => d.id === diff);
      return found ? found.blanks : 7;
    },
    []
  );

  // Start new game
  const startNewGame = useCallback(
    (diff: Difficulty = difficulty, customVal: number = customBlanks) => {
      const blanks = getActiveBlanks(diff, customVal);
      const puzzle = generatePuzzle(blanks);

      setInitialBoard(puzzle.initialBoard);
      setCurrentBoard(puzzle.initialBoard.map((row) => [...row]));
      setSolutionBoard(puzzle.solutionBoard);
      setHistory([]);
      setCheckedResult(null);
      setIsVictory(false);

      // Auto-select the first empty cell for convenience
      let firstEmpty: [number, number] | null = null;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (puzzle.initialBoard[r][c] === 0) {
            firstEmpty = [r, c];
            break;
          }
        }
        if (firstEmpty) break;
      }
      setSelectedCell(firstEmpty);
    },
    [difficulty, customBlanks, getActiveBlanks]
  );

  // Initial load
  useEffect(() => {
    startNewGame('medium', 6);
  }, []);

  // Update sound state
  useEffect(() => {
    sound.enabled = soundEnabled;
  }, [soundEnabled]);

  // Count filled vs empty
  const blankStats = useMemo(() => {
    let emptyCount = 0;
    let filledCount = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (currentBoard[r][c] === 0) {
          emptyCount++;
        } else {
          filledCount++;
        }
      }
    }
    return { emptyCount, filledCount, total: 16 };
  }, [currentBoard]);

  // Find natural conflicts (rule violation on board: duplicates in row/col/box)
  const ruleConflicts = useMemo(() => {
    const coords = findRuleConflicts(currentBoard);
    const set = new Set<string>();
    coords.forEach(([r, c]) => set.add(`${r},${c}`));
    return set;
  }, [currentBoard]);

  // Selected value for smart highlighting
  const selectedValue = useMemo(() => {
    if (!selectedCell) return null;
    const val = currentBoard[selectedCell[0]][selectedCell[1]];
    return val > 0 ? val : null;
  }, [selectedCell, currentBoard]);

  // Cell click handler
  const handleCellClick = (r: number, c: number) => {
    setSelectedCell([r, c]);
    sound.playTap();
  };

  // Set number to selected cell
  const setNumberAtSelected = useCallback(
    (num: number) => {
      if (!selectedCell) return;
      const [r, c] = selectedCell;
      // Cannot overwrite initial clue
      if (initialBoard[r][c] !== 0) return;

      const currentValue = currentBoard[r][c];
      if (currentValue === num) return; // No change

      // Save to history for undo
      setHistory((prev) => [...prev, currentBoard.map((row) => [...row])]);

      const newBoard = currentBoard.map((row, rowIdx) =>
        row.map((colVal, colIdx) => (rowIdx === r && colIdx === c ? num : colVal))
      );

      setCurrentBoard(newBoard);
      setCheckedResult(null); // Reset checked status on new input

      if (num === 0) {
        sound.playErase();
      } else {
        sound.playNumberPlace();
      }

      // Check auto completion if full only when instantValidation is enabled
      if (instantValidation) {
        const { isFullyFilled, isAllCorrect } = checkSolution(newBoard, solutionBoard);
        if (isFullyFilled && isAllCorrect) {
          setIsVictory(true);
          sound.playSuccess();
        }
      }
    },
    [selectedCell, initialBoard, currentBoard, solutionBoard, instantValidation]
  );

  // Undo action
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prevBoard = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setCurrentBoard(prevBoard);
    setCheckedResult(null);
    setIsVictory(false);
    sound.playTap();
  }, [history]);

  // Restart current puzzle
  const handleRestart = useCallback(() => {
    setCurrentBoard(initialBoard.map((row) => [...row]));
    setHistory([]);
    setCheckedResult(null);
    setIsVictory(false);
    sound.playTap();
  }, [initialBoard]);

  // Check Answer Handler
  const handleCheckAnswer = useCallback(() => {
    const { isFullyFilled, isAllCorrect, errorCells } = checkSolution(
      currentBoard,
      solutionBoard
    );

    const errorSet = new Set<string>();
    errorCells.forEach(([r, c]) => errorSet.add(`${r},${c}`));

    if (isAllCorrect) {
      setIsVictory(true);
      setCheckedResult({
        hasChecked: true,
        isCorrect: true,
        errorCount: 0,
        errorCoords: errorSet,
        message: t.allCorrectNoBlanks,
      });
      sound.playSuccess();
    } else if (errorCells.length > 0) {
      setCheckedResult({
        hasChecked: true,
        isCorrect: false,
        errorCount: errorCells.length,
        errorCoords: errorSet,
        message: t.checkResultHasErrors.replace('{count}', errorCells.length.toString()),
      });
      sound.playError();
    } else {
      // Partially correct, no errors in filled cells, but still empty cells
      setCheckedResult({
        hasChecked: true,
        isCorrect: true,
        errorCount: 0,
        errorCoords: errorSet,
        message: t.checkResultValidPartial,
      });
      sound.playTap();
    }
  }, [currentBoard, solutionBoard, t]);

  // Keyboard navigation and entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modal open
      if (showSettingsModal || showRulesModal) return;

      if (e.key >= '1' && e.key <= '4') {
        setNumberAtSelected(parseInt(e.key, 10));
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        setNumberAtSelected(0);
      } else if (e.key === 'ArrowUp' && selectedCell) {
        e.preventDefault();
        setSelectedCell(([r, c]) => [Math.max(0, r - 1), c]);
        sound.playTap();
      } else if (e.key === 'ArrowDown' && selectedCell) {
        e.preventDefault();
        setSelectedCell(([r, c]) => [Math.min(GRID_SIZE - 1, r + 1), c]);
        sound.playTap();
      } else if (e.key === 'ArrowLeft' && selectedCell) {
        e.preventDefault();
        setSelectedCell(([r, c]) => [r, Math.max(0, c - 1)]);
        sound.playTap();
      } else if (e.key === 'ArrowRight' && selectedCell) {
        e.preventDefault();
        setSelectedCell(([r, c]) => [r, Math.min(GRID_SIZE - 1, c + 1)]);
        sound.playTap();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, setNumberAtSelected, showSettingsModal, showRulesModal]);

  // Current status message text (only shows active results/feedback, hides default waiting text)
  const statusDisplayText = useMemo(() => {
    if (isVictory) return t.statusAllCorrect;
    if (checkedResult) {
      if (checkedResult.errorCount > 0) {
        return t.statusHasErrors.replace('{count}', checkedResult.errorCount.toString());
      }
      if (blankStats.emptyCount > 0) {
        return t.statusIncomplete;
      }
      return t.statusAllCorrect;
    }
    if (blankStats.emptyCount === 0) {
      return lang === 'en' ? 'READY TO CHECK' : '盤面已填滿，請檢查';
    }
    return '';
  }, [isVictory, checkedResult, blankStats, t, lang]);

  const isLight = theme === 'light';

  // Helper to render an individual cell
  const renderCell = (r: number, c: number) => {
    const isInitial = initialBoard[r][c] !== 0;
    const value = currentBoard[r][c];
    const isSelected = selectedCell?.[0] === r && selectedCell?.[1] === c;
    const isSameNumber =
      highlightSameNumber &&
      selectedValue !== null &&
      value !== 0 &&
      value === selectedValue;
    const coordKey = `${r},${c}`;
    const hasRuleConflict = instantValidation ? ruleConflicts.has(coordKey) : false;
    const hasCheckError = checkedResult?.errorCoords.has(coordKey);
    const isCheckedCorrect = checkedResult?.hasChecked && !hasCheckError && value !== 0;

    let cellBg = isLight
      ? isInitial
        ? 'bg-slate-200 shadow-inner'
        : 'bg-white hover:bg-slate-50'
      : isInitial
      ? 'bg-slate-800'
      : 'bg-slate-950 hover:bg-slate-900/60';

    let textColor = isLight
      ? isInitial
        ? 'text-slate-900'
        : 'text-blue-600'
      : isInitial
      ? 'text-white'
      : 'text-cyan-400';

    let borderColor = isLight
      ? isInitial
        ? 'border-slate-300'
        : 'border-slate-200 hover:border-slate-300'
      : isInitial
      ? 'border-slate-700'
      : 'border-slate-800 hover:border-slate-700';

    let ringClass = '';

    // Same number highlight
    if (isSameNumber && !isSelected) {
      if (isLight) {
        borderColor = 'border-blue-400';
        cellBg = isInitial ? 'bg-blue-100' : 'bg-blue-50';
      } else {
        borderColor = 'border-blue-400/60';
        cellBg = isInitial ? 'bg-blue-950/60' : 'bg-blue-950/40';
      }
    }

    // Active Selected Cell
    if (isSelected) {
      if (isLight) {
        borderColor = 'border-blue-600';
        cellBg = isInitial ? 'bg-blue-100' : 'bg-blue-50';
        ringClass = 'ring-4 ring-blue-500/30 shadow-md scale-[1.03] z-10';
        if (!isInitial) textColor = 'text-blue-700';
      } else {
        borderColor = 'border-cyan-400';
        cellBg = isInitial ? 'bg-cyan-950/80' : 'bg-cyan-950/60';
        ringClass = 'ring-4 ring-cyan-400/30 shadow-lg shadow-cyan-950/50 scale-[1.03] z-10';
        if (!isInitial) textColor = 'text-cyan-300';
      }
    }

    // Errors & Rule Conflicts
    if (hasRuleConflict || hasCheckError) {
      if (isLight) {
        borderColor = 'border-rose-500';
        cellBg = 'bg-rose-50';
        textColor = 'text-rose-600';
        ringClass = 'ring-2 ring-rose-400/40';
      } else {
        borderColor = 'border-rose-500';
        cellBg = 'bg-rose-950/70';
        textColor = 'text-rose-400';
        ringClass = 'ring-2 ring-rose-500/40';
      }
    } else if (isCheckedCorrect && !isInitial) {
      if (isLight) {
        borderColor = 'border-emerald-500';
        cellBg = 'bg-emerald-50';
        textColor = 'text-emerald-700';
      } else {
        borderColor = 'border-emerald-500';
        cellBg = 'bg-emerald-950/50';
        textColor = 'text-emerald-400';
      }
    }

    return (
      <button
        key={`${r}-${c}`}
        onClick={() => handleCellClick(r, c)}
        className={`relative aspect-square flex items-center justify-center text-4xl sm:text-5xl md:text-5xl font-black rounded-xl border-2 transition-all duration-150 active:scale-95 touch-manipulation cursor-pointer select-none ${cellBg} ${textColor} ${borderColor} ${ringClass}`}
        aria-label={`Row ${r + 1}, Col ${c + 1}: ${value === 0 ? 'Empty' : value}`}
      >
        {value !== 0 ? (
          <span className="leading-none select-none drop-shadow-xs">{value}</span>
        ) : (
          /* Empty placeholder slot indicator */
          <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-slate-300' : 'bg-slate-800/80'}`} />
        )}

        {/* Initial Clue indicator badge */}
        {isInitial && (
          <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-400' : 'bg-slate-400/60'}`} />
        )}
      </button>
    );
  };

  return (
    <div className={`w-full min-h-screen flex flex-col font-sans select-none antialiased justify-between transition-colors duration-200 ${
      isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Top Header with Bold Typography and Single Options Button */}
      <header className={`px-4 sm:px-8 lg:px-10 py-5 sm:py-6 flex justify-between items-center border-b shrink-0 transition-colors ${
        isLight ? 'border-slate-200 bg-white/80' : 'border-slate-800/90 bg-slate-950/80'
      }`}>
        <div>
          <h1 className={`text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-none uppercase font-display ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            {t.title}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Rules / Help */}
          <button
            onClick={() => {
              setShowRulesModal(true);
              sound.playTap();
            }}
            className={`p-2 sm:p-2.5 border rounded-full transition-all active:scale-95 touch-manipulation cursor-pointer ${
              isLight
                ? 'border-slate-300 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                : 'border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
            aria-label={t.howToPlay}
            title={t.howToPlay}
          >
            <HelpCircle size={18} />
          </button>

          {/* Options / Custom Settings Button */}
          <button
            onClick={() => {
              setShowSettingsModal(true);
              sound.playTap();
            }}
            className={`p-2 sm:p-2.5 border rounded-full transition-all active:scale-95 touch-manipulation flex items-center justify-center cursor-pointer ${
              isLight
                ? 'border-slate-300 hover:bg-slate-100 text-slate-700 hover:text-slate-900 bg-slate-50'
                : 'border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white bg-slate-900'
            }`}
            aria-label={t.options}
            title={t.options}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row items-center justify-center px-4 sm:px-8 lg:px-10 py-4 sm:py-6 gap-6 md:gap-12 lg:gap-16 max-w-6xl mx-auto w-full">
        {/* 4x4 Grid Board structured as 2x2 boxes */}
        <div className={`w-full max-w-[340px] sm:max-w-[400px] md:max-w-[440px] aspect-square grid grid-cols-2 grid-rows-2 gap-2 p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl border shadow-2xl shrink-0 transition-colors ${
          isLight
            ? 'bg-slate-300/80 border-slate-300 shadow-slate-200'
            : 'bg-slate-800 border-slate-800 shadow-2xl'
        }`}>
          {/* Top-Left Box (0,0 to 1,1) */}
          <div className={`grid grid-cols-2 grid-rows-2 gap-1.5 p-1 rounded-xl ${
            isLight ? 'bg-slate-200/90' : 'bg-slate-900/60'
          }`}>
            {renderCell(0, 0)}
            {renderCell(0, 1)}
            {renderCell(1, 0)}
            {renderCell(1, 1)}
          </div>

          {/* Top-Right Box (0,2 to 1,3) */}
          <div className={`grid grid-cols-2 grid-rows-2 gap-1.5 p-1 rounded-xl ${
            isLight ? 'bg-slate-200/90' : 'bg-slate-900/60'
          }`}>
            {renderCell(0, 2)}
            {renderCell(0, 3)}
            {renderCell(1, 2)}
            {renderCell(1, 3)}
          </div>

          {/* Bottom-Left Box (2,0 to 3,1) */}
          <div className={`grid grid-cols-2 grid-rows-2 gap-1.5 p-1 rounded-xl ${
            isLight ? 'bg-slate-200/90' : 'bg-slate-900/60'
          }`}>
            {renderCell(2, 0)}
            {renderCell(2, 1)}
            {renderCell(3, 0)}
            {renderCell(3, 1)}
          </div>

          {/* Bottom-Right Box (2,2 to 3,3) */}
          <div className={`grid grid-cols-2 grid-rows-2 gap-1.5 p-1 rounded-xl ${
            isLight ? 'bg-slate-200/90' : 'bg-slate-900/60'
          }`}>
            {renderCell(2, 2)}
            {renderCell(2, 3)}
            {renderCell(3, 2)}
            {renderCell(3, 3)}
          </div>
        </div>

        {/* Side Controls Section */}
        <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-[340px] sm:max-w-[400px] md:w-64 md:max-w-none">
          {/* Input Values Keypad (1, 2, 3, 4) */}
          <section>
            <div className="grid grid-cols-4 md:grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => setNumberAtSelected(num)}
                  className={`aspect-square text-3xl sm:text-4xl font-black rounded-xl transition-colors flex items-center justify-center active:scale-95 shadow-md touch-manipulation cursor-pointer ${
                    isLight
                      ? 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 active:bg-blue-600 active:text-white'
                      : 'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-blue-600'
                  }`}
                  aria-label={`Input ${num}`}
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Quick Actions (Clear / Undo / Restart) */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                onClick={() => setNumberAtSelected(0)}
                className={`py-2.5 border rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 touch-manipulation cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
                title={t.clear}
              >
                <X size={14} className={isLight ? 'text-slate-500' : 'text-slate-400'} />
                <span>{t.clear}</span>
              </button>

              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                className={`py-2.5 border rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 touch-manipulation cursor-pointer ${
                  history.length > 0
                    ? isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    : isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
                    : 'border-slate-900 text-slate-600 opacity-40 cursor-not-allowed'
                }`}
                title={t.undo}
              >
                <Undo2 size={14} />
                <span>{t.undo}</span>
              </button>

              <button
                onClick={handleRestart}
                className={`py-2.5 border rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 touch-manipulation cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
                title={t.restart}
              >
                <RotateCcw size={14} />
                <span>{t.restart}</span>
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Footer Action Bar with CHECK and NEW buttons */}
      <footer className={`px-4 sm:px-8 lg:px-10 py-5 sm:py-7 border-t flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0 max-w-6xl mx-auto w-full transition-colors ${
        isLight ? 'border-slate-200 bg-white/50' : 'border-slate-800/90'
      }`}>
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
          {/* Main Prominent CHECK Button */}
          <button
            id="btn-check"
            onClick={handleCheckAnswer}
            className="flex-1 sm:flex-none px-8 sm:px-12 py-3.5 sm:py-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-emerald-950 font-black text-lg sm:text-xl rounded-full tracking-wider transition-all shadow-lg shadow-emerald-950/20 active:scale-95 touch-manipulation cursor-pointer flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={22} className="stroke-[2.5]" />
            <span>{t.checkAnswer}</span>
          </button>

          {/* NEW Game Button */}
          <button
            id="btn-new"
            onClick={() => {
              startNewGame(difficulty, customBlanks);
              sound.playTap();
            }}
            className={`flex-1 sm:flex-none px-8 sm:px-10 py-3.5 sm:py-4 border-2 font-black text-lg sm:text-xl rounded-full tracking-wider active:scale-95 transition-all touch-manipulation cursor-pointer flex items-center justify-center gap-2 ${
              isLight
                ? 'border-slate-300 hover:border-slate-400 hover:bg-slate-200/60 text-slate-800'
                : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 text-slate-100'
            }`}
          >
            <Plus size={20} className="stroke-[2.5]" />
            <span>{t.newGame}</span>
          </button>
        </div>

        {/* Live Status Message Display */}
        <div className="text-center sm:text-right w-full sm:w-auto">
          <p
            id="status-msg"
            className={`text-base sm:text-xl md:text-2xl font-black uppercase tracking-tight transition-colors ${
              checkedResult?.isCorrect
                ? 'text-emerald-500'
                : checkedResult?.errorCount
                ? 'text-rose-500'
                : isLight
                ? 'text-slate-400'
                : 'text-slate-600'
            }`}
          >
            {statusDisplayText}
          </p>
        </div>
      </footer>

      {/* Difficulty, Options & Preferences Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className={`w-full max-w-sm rounded-2xl border p-5 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto transition-colors ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-blue-500" />
                <h2 className="text-base font-black tracking-wide uppercase">
                  {t.gameSettings}
                </h2>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className={`p-1 rounded-lg cursor-pointer transition-colors ${
                  isLight ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-900' : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Presets and Custom Difficulty List */}
            <div className="flex flex-col gap-2">
              <span className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {t.difficulty}
              </span>
              {DIFFICULTY_CONFIGS.filter((d) => d.id !== 'custom').map((config) => {
                const isSelected = difficulty === config.id;
                return (
                  <button
                    key={config.id}
                    onClick={() => {
                      setDifficulty(config.id);
                      startNewGame(config.id, customBlanks);
                      setShowSettingsModal(false);
                      sound.playTap();
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition active:scale-98 cursor-pointer ${
                      isSelected
                        ? isLight
                          ? 'bg-slate-900 text-white font-black border-slate-900 shadow-md'
                          : 'bg-slate-100 text-slate-950 font-black border-slate-100 shadow-md'
                        : isLight
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                        : 'bg-slate-800/60 border-slate-800 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold uppercase">
                        {lang === 'zh' ? config.labelZh : config.labelEn}
                      </div>
                      <div className={`text-xs font-normal mt-0.5 ${
                        isSelected
                          ? isLight
                            ? 'text-slate-300'
                            : 'text-slate-700'
                          : isLight
                          ? 'text-slate-500'
                          : 'text-slate-400'
                      }`}>
                        {lang === 'zh' ? config.descZh : config.descEn}
                      </div>
                    </div>
                    <span className={`text-xs font-mono font-bold px-2 py-1 rounded border ${
                      isSelected
                        ? isLight
                          ? 'bg-slate-800 border-slate-700 text-blue-300'
                          : 'bg-slate-200 border-slate-300 text-slate-900'
                        : isLight
                        ? 'bg-white border-slate-200 text-blue-600'
                        : 'bg-slate-900 border-slate-700 text-blue-400'
                    }`}>
                      {16 - config.blanks} {t.clues}
                    </span>
                  </button>
                );
              })}

              {/* Custom Difficulty Option - inline and seamlessly aligned */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  difficulty === 'custom'
                    ? isLight
                      ? 'bg-blue-50/50 border-blue-500 ring-1 ring-blue-500/30'
                      : 'bg-slate-900 border-blue-500/80 ring-1 ring-blue-500/30'
                    : isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-800/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold uppercase ${
                      difficulty === 'custom'
                        ? isLight
                          ? 'text-blue-700 font-black'
                          : 'text-blue-300 font-black'
                        : isLight
                        ? 'text-slate-700'
                        : 'text-slate-300'
                    }`}>
                      {t.custom}
                    </span>
                    <span className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      ({customBlanks} {t.blanksCount})
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setDifficulty('custom');
                      startNewGame('custom', customBlanks);
                      setShowSettingsModal(false);
                      sound.playTap();
                    }}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-400 text-white font-black text-xs uppercase tracking-wider rounded-lg transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    {t.ok}
                  </button>
                </div>

                <div className={`mt-3 pt-2.5 border-t flex flex-col gap-2 ${
                  isLight ? 'border-slate-200' : 'border-slate-800/80'
                }`}>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>1 {t.blanksCount}</span>
                    <span className="text-blue-500 font-black text-sm">{customBlanks} {t.blanksCount}</span>
                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>12 {t.blanksCount}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    value={customBlanks}
                    onChange={(e) => setCustomBlanks(parseInt(e.target.value, 10))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-slate-300 dark:bg-slate-700"
                  />
                  <p className={`text-[11px] leading-tight ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t.customBlanksHelp}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Preferences: Sound, Theme, Language */}
            <div className="flex flex-col gap-2 pt-1">
              <span className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {t.options}
              </span>

              {/* Theme Selector (Dark / Light) */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  {isLight ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-blue-400" />}
                  <span className="text-xs font-mono font-bold uppercase">
                    {t.theme}
                  </span>
                </div>
                <div className="flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setTheme('dark');
                      sound.playTap();
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => {
                      setTheme('light');
                      sound.playTap();
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>

              {/* Sound Toggle */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  {soundEnabled ? (
                    <Volume2 size={16} className="text-emerald-500" />
                  ) : (
                    <VolumeX size={16} className="text-slate-400" />
                  )}
                  <span className="text-xs font-mono font-bold uppercase">
                    {t.sound}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSoundEnabled(!soundEnabled);
                    sound.playTap();
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    soundEnabled ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={soundEnabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      soundEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Language Selector */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Languages size={16} className="text-indigo-500" />
                  <span className="text-xs font-mono font-bold uppercase">
                    {t.language}
                  </span>
                </div>
                <div className="flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setLang('zh');
                      sound.playTap();
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                      lang === 'zh'
                        ? 'bg-slate-800 dark:bg-slate-800 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    繁中
                  </button>
                  <button
                    onClick={() => {
                      setLang('en');
                      sound.playTap();
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                      lang === 'en'
                        ? 'bg-slate-800 dark:bg-slate-800 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              {/* Instant Validation Setting Toggle */}
              <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-800'
              }`}>
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    {instantValidation ? (
                      <Zap size={15} className="text-amber-500 fill-amber-500" />
                    ) : (
                      <ZapOff size={15} className="text-slate-400" />
                    )}
                    <span className="text-xs font-mono font-bold uppercase">
                      {t.instantValidation}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 leading-snug ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t.instantValidationDesc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInstantValidation(!instantValidation);
                    sound.playTap();
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    instantValidation ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={instantValidation}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      instantValidation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Highlight Same Number Toggle */}
              <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-800'
              }`}>
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <Highlighter size={15} className={highlightSameNumber ? 'text-blue-500' : 'text-slate-400'} />
                    <span className="text-xs font-mono font-bold uppercase">
                      {t.highlightSame}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 leading-snug ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t.highlightSameDesc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHighlightSameNumber(!highlightSameNumber);
                    sound.playTap();
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    highlightSameNumber ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={highlightSameNumber}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      highlightSameNumber ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rules / How To Play Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-blue-500" />
                <h2 className="text-base font-black uppercase tracking-wide">
                  {t.rulesTitle}
                </h2>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className={`p-1 rounded-lg cursor-pointer ${
                  isLight ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-900' : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <p className={`text-sm leading-relaxed font-normal ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              {t.rulesBody}
            </p>

            <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 font-mono ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-800/60 border-slate-800 text-slate-300'
            }`}>
              <div className="flex items-center gap-2 text-blue-500 font-bold uppercase">
                <Sparkles size={14} />
                <span>Matrix Rules</span>
              </div>
              <ul className={`list-disc list-inside space-y-1 text-[11px] font-sans ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <li>每行、每列包含 1、2、3、4 各一次。</li>
                <li>每個 2×2 粗線方格同樣包含 1、2、3、4 各一次。</li>
                <li>隨時可按「CHECK」檢查答案。</li>
              </ul>
            </div>

            <button
              onClick={() => setShowRulesModal(false)}
              className={`w-full py-3 rounded-full font-black text-xs uppercase tracking-widest transition active:scale-98 cursor-pointer ${
                isLight ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-slate-100 hover:bg-white text-slate-950'
              }`}
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/* Victory Celebration Modal */}
      {isVictory && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
          <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl shadow-emerald-950/50 flex flex-col items-center text-center gap-4 ${
            isLight ? 'bg-white border-emerald-500' : 'bg-slate-900 border-emerald-500/50'
          }`}>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500">
              <Sparkles size={36} />
            </div>

            <div>
              <h2 className={`text-2xl font-black uppercase tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {t.congratsTitle}
              </h2>
              <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                {t.congratsDesc}
              </p>
            </div>

            <div className={`w-full p-3.5 rounded-xl border flex justify-around text-xs font-mono ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800 border-slate-700'
            }`}>
              <div className="flex flex-col items-center">
                <span className={`uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{t.difficulty}</span>
                <span className={`font-bold mt-0.5 uppercase ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                  {difficulty === 'custom'
                    ? `${t.custom} (${customBlanks})`
                    : DIFFICULTY_CONFIGS.find((d) => d.id === difficulty)?.[
                        lang === 'zh' ? 'labelZh' : 'labelEn'
                      ]}
                </span>
              </div>
              <div className={`h-full w-px ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`} />
              <div className="flex flex-col items-center">
                <span className={`uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{t.remainingBlanks}</span>
                <span className="font-bold text-emerald-500 mt-0.5">0 / 0</span>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2.5 pt-1">
              <button
                onClick={() => {
                  startNewGame(difficulty, customBlanks);
                  sound.playTap();
                }}
                className="w-full py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-emerald-950 font-black text-sm uppercase tracking-widest transition active:scale-95 shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                {t.playAgain}
              </button>

              <button
                onClick={() => setIsVictory(false)}
                className={`w-full py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
