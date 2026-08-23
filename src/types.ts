export type Language = 'zh' | 'en';
export type Theme = 'dark' | 'light';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'custom';

export interface DifficultyConfig {
  id: Difficulty;
  blanks: number;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
}

export interface CellData {
  row: number;
  col: number;
  value: number; // 0 for empty, 1-4
  solution: number;
  isInitial: boolean;
  isError?: boolean;
}

export type Board = number[][]; // 4x4 matrix of numbers 0..4

export interface GameState {
  initialBoard: Board;
  currentBoard: Board;
  solutionBoard: Board;
  difficulty: Difficulty;
  customBlanks: number;
  selectedCell: [number, number] | null;
  history: Board[];
  isCompleted: boolean;
  checkedState: {
    hasChecked: boolean;
    isCorrect: boolean;
    errorCells: [number, number][];
  } | null;
}
