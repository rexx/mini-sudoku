import { Board } from '../types';

export const GRID_SIZE = 4;
export const BOX_SIZE = 2;

// Check if a number can be placed in board[row][col]
export function isValidPlacement(board: Board, row: number, col: number, num: number): boolean {
  for (let c = 0; c < GRID_SIZE; c++) {
    if (c !== col && board[row][c] === num) return false;
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    if (r !== row && board[r][col] === num) return false;
  }

  const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
  const boxCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;

  for (let r = 0; r < BOX_SIZE; r++) {
    for (let c = 0; c < BOX_SIZE; c++) {
      const curR = boxRow + r;
      const curC = boxCol + c;
      if ((curR !== row || curC !== col) && board[curR][curC] === num) {
        return false;
      }
    }
  }

  return true;
}

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate a random complete valid 4x4 Sudoku board
export function generateFullBoard(): Board {
  const board: Board = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));

  function solve(row: number = 0, col: number = 0): boolean {
    if (row === GRID_SIZE) return true;
    const nextRow = col === GRID_SIZE - 1 ? row + 1 : row;
    const nextCol = col === GRID_SIZE - 1 ? 0 : col + 1;

    const nums = shuffle([1, 2, 3, 4]);
    for (const num of nums) {
      if (isValidPlacement(board, row, col, num)) {
        board[row][col] = num;
        if (solve(nextRow, nextCol)) return true;
        board[row][col] = 0;
      }
    }
    return false;
  }

  solve();
  return board;
}

// Count number of solutions for a given board (to guarantee unique solution if needed)
export function countSolutions(board: Board, maxCount: number = 2): number {
  let solutions = 0;
  const temp: Board = board.map(r => [...r]);

  function solve(row: number = 0, col: number = 0) {
    if (solutions >= maxCount) return;
    if (row === GRID_SIZE) {
      solutions++;
      return;
    }
    const nextRow = col === GRID_SIZE - 1 ? row + 1 : row;
    const nextCol = col === GRID_SIZE - 1 ? 0 : col + 1;

    if (temp[row][col] !== 0) {
      solve(nextRow, nextCol);
      return;
    }

    for (let num = 1; num <= 4; num++) {
      if (isValidPlacement(temp, row, col, num)) {
        temp[row][col] = num;
        solve(nextRow, nextCol);
        temp[row][col] = 0;
        if (solutions >= maxCount) return;
      }
    }
  }

  solve();
  return solutions;
}

// Generate a puzzle with a specified number of blanks
export function generatePuzzle(blanksCount: number): {
  initialBoard: Board;
  solutionBoard: Board;
} {
  const targetBlanks = Math.max(1, Math.min(13, blanksCount));
  const fullBoard = generateFullBoard();
  const solutionBoard = fullBoard.map(row => [...row]);
  const puzzleBoard = fullBoard.map(row => [...row]);

  // All 16 cell coordinates
  const positions: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      positions.push([r, c]);
    }
  }
  const shuffledPositions = shuffle(positions);

  let removed = 0;
  // First pass: try to remove blanks while maintaining unique solution
  for (const [r, c] of shuffledPositions) {
    if (removed >= targetBlanks) break;
    const val = puzzleBoard[r][c];
    puzzleBoard[r][c] = 0;

    // Check if still uniquely solvable
    if (countSolutions(puzzleBoard, 2) === 1) {
      removed++;
    } else {
      // If target blanks is very high (like 11-13) where unique solution might not be possible,
      // allow removal if we have exhausted unique options
      if (targetBlanks > 10) {
        removed++;
      } else {
        puzzleBoard[r][c] = val; // Put it back
      }
    }
  }

  // If still didn't reach target blanks (due to strict uniqueness), remove more cells if requested
  if (removed < targetBlanks) {
    for (const [r, c] of shuffledPositions) {
      if (removed >= targetBlanks) break;
      if (puzzleBoard[r][c] !== 0) {
        puzzleBoard[r][c] = 0;
        removed++;
      }
    }
  }

  return {
    initialBoard: puzzleBoard,
    solutionBoard,
  };
}

// Find all rule conflicts in current board (duplicate in row, col, or box)
export function findRuleConflicts(board: Board): [number, number][] {
  const conflicts = new Set<string>();

  // Check rows
  for (let r = 0; r < GRID_SIZE; r++) {
    const seen = new Map<number, number[]>();
    for (let c = 0; c < GRID_SIZE; c++) {
      const val = board[r][c];
      if (val !== 0) {
        const list = seen.get(val) || [];
        list.push(c);
        seen.set(val, list);
      }
    }
    for (const [, cols] of seen.entries()) {
      if (cols.length > 1) {
        cols.forEach(c => conflicts.add(`${r},${c}`));
      }
    }
  }

  // Check columns
  for (let c = 0; c < GRID_SIZE; c++) {
    const seen = new Map<number, number[]>();
    for (let r = 0; r < GRID_SIZE; r++) {
      const val = board[r][c];
      if (val !== 0) {
        const list = seen.get(val) || [];
        list.push(r);
        seen.set(val, list);
      }
    }
    for (const [, rows] of seen.entries()) {
      if (rows.length > 1) {
        rows.forEach(r => conflicts.add(`${r},${c}`));
      }
    }
  }

  // Check 2x2 boxes
  for (let box = 0; box < 4; box++) {
    const boxR = Math.floor(box / 2) * 2;
    const boxC = (box % 2) * 2;
    const seen = new Map<number, [number, number][]>();

    for (let r = 0; r < BOX_SIZE; r++) {
      for (let c = 0; c < BOX_SIZE; c++) {
        const curR = boxR + r;
        const curC = boxC + c;
        const val = board[curR][curC];
        if (val !== 0) {
          const list = seen.get(val) || [];
          list.push([curR, curC]);
          seen.set(val, list);
        }
      }
    }
    for (const [, cells] of seen.entries()) {
      if (cells.length > 1) {
        cells.forEach(([r, c]) => conflicts.add(`${r},${c}`));
      }
    }
  }

  return Array.from(conflicts).map(coord => {
    const [r, c] = coord.split(',').map(Number);
    return [r, c] as [number, number];
  });
}

// Compare current board against solution board or rule validity
export function checkSolution(
  currentBoard: Board,
  solutionBoard: Board
): {
  isFullyFilled: boolean;
  isAllCorrect: boolean;
  errorCells: [number, number][];
} {
  let isFullyFilled = true;
  const errorCells: [number, number][] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const val = currentBoard[r][c];
      if (val === 0) {
        isFullyFilled = false;
      } else if (val !== solutionBoard[r][c]) {
        errorCells.push([r, c]);
      }
    }
  }

  const isAllCorrect = isFullyFilled && errorCells.length === 0;

  return {
    isFullyFilled,
    isAllCorrect,
    errorCells,
  };
}
