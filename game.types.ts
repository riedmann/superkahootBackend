export interface ParticipantAnswerHistory {
  questionId: string;
  questionIndex: number;
  answer: any; // boolean for true/false, number[] for multiple choice
  isCorrect: boolean;
  points: number;
  answeredAt: Date;
}

export interface Participant {
  id: string;
  name: string;
  score: number;
  joinedAt: Date;
  isOnline: boolean;
  answerHistory: ParticipantAnswerHistory[];
}

export interface GameAnswer {
  participantId: string;
  questionId: string;
  answer: any; // boolean for true/false, number[] for multiple choice
  answeredAt: Date;
  isCorrect: boolean;
  points: number;
}

export interface GameQuestion {
  id: string;
  questionIndex: number;
  startedAt: Date;
  endsAt: Date;
  answers: GameAnswer[];
}

export interface Game {
  id: string;
  quizId: string;
  quizTitle: string;
  quizData?: any; // Full quiz data for client access
  hostId: string;
  gamePin: string;
  status: GameStatus;
  participants: Participant[];
  currentQuestionIndex: number;
  currentQuestion?: GameQuestion;
  totalQuestions: number;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  settings: {
    questionTimeLimit: number; // seconds
    showCorrectAnswers: boolean;
    allowLateJoins: boolean;
  };
}

export interface GameSession {
  gameId: string;
  participantId?: string;
  isHost: boolean;
}

export type DifficultyLevel = "easy" | "medium" | "hard";
export type QuestionType = "true-false" | "standard";

// Game status types
export type GameStatus =
  | "waiting"
  | "active"
  | "countdown"
  | "question"
  | "results"
  | "finished";

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  difficulty?: DifficultyLevel;
  category?: string;
  createdAt?: Date;
  updatedAt?: Date;
  creatorId?: string;
  creatorEmail?: string;
  creatorDisplayName?: string;
}

export interface QuestionOption {
  text: string;
  image?: string; // Base64 encoded image or URL
}

export interface TrueFalseQuestion {
  id: string;
  type: "true-false";
  question: string;
  correctAnswer: boolean;
  image?: string; // Base64 encoded image or URL
}

export interface StandardQuestion {
  id: string;
  type: "standard";
  question: string;
  options: QuestionOption[];
  correctAnswers: number[];
  image?: string; // Base64 encoded image or URL
}

export type Question = TrueFalseQuestion | StandardQuestion;

// Type guard functions
export function isTrueFalseQuestion(
  question: any
): question is TrueFalseQuestion {
  return question?.type === "true-false";
}

export function isStandardQuestion(
  question: any
): question is StandardQuestion {
  return question?.type === "standard";
}
