import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Firestore REST API config
const FIREBASE_PROJECT_ID = "demoteachers";
const FIREBASE_API_KEY = "YOUR_FIREBASE_API_KEY";
const FIREBASE_COLLECTION = "games";
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${FIREBASE_COLLECTION}?key=${FIREBASE_API_KEY}`;

// Types
type Participant = { id: string; name: string };
type Answer = {
  participant: Participant;
  questionId: number;
  answer: string;
  answeredAt: string;
  isCorrect: boolean;
  points: number;
};
type AnsweredQuestion = {
  questionIndex: number;
  startedAt: string;
  endsAt?: string;
  answers: Answer[];
};
type Game = {
  id: string;
  gamePin: string;
  participants: Participant[];
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredQuestions: AnsweredQuestion[];
  createdAt: string;
  finishedAt?: string;
  status: string;
  settings: any;
  quizData: any;
  hostWs?: WebSocket;
};

const games = new Map<string, Game>();

function toFirestoreFields(obj: any): any {
  if (typeof obj === "string") return { stringValue: obj };
  if (typeof obj === "number") return { integerValue: obj };
  if (typeof obj === "boolean") return { booleanValue: obj };
  if (obj instanceof Array)
    return { arrayValue: { values: obj.map(toFirestoreFields) } };
  if (obj === null) return { nullValue: null };
  if (typeof obj === "object") {
    const fields: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) fields[k] = toFirestoreFields(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(obj) };
}

async function storeGameToFirestore(game: Game) {
  const { hostWs, ...serializableGame } = game;
  const cleanGame = JSON.parse(JSON.stringify(serializableGame));
  await fetch(FIREBASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(cleanGame) }),
  });
}

function calculateWinners(game: Game) {
  const scores: { id: string; name: string; points: number }[] = [];
  for (const participant of game.participants) {
    let totalPoints = 0;
    for (const answered of game.answeredQuestions) {
      for (const answer of answered.answers) {
        if (answer.participant.id === participant.id) {
          totalPoints += answer.points || 0;
        }
      }
    }
    scores.push({
      id: participant.id,
      name: participant.name,
      points: totalPoints,
    });
  }
  scores.sort((a, b) => b.points - a.points);
  return scores;
}

async function finishGame(ws: WebSocket, msg: any) {
  const game = games.get(msg.gameId);
  if (game) {
    game.status = "finished";
    game.finishedAt = new Date().toISOString();
    await storeGameToFirestore(game);

    const scores = calculateWinners(game);

    games.delete(msg.gameId);
    await ws.send(
      JSON.stringify({
        type: "game_finished",
        gameId: msg.gameId,
        winners: scores,
      })
    );
  }
}

function sendQuestionToGameClients(
  gameId: string,
  index: number,
  question: any,
  questionType?: string
) {
  const game = games.get(gameId);
  if (!game || !game.hostWs) return;
  const obj = {
    type: "question",
    gameId,
    index,
    question,
    questionType,
  };
  game.hostWs.send(JSON.stringify(obj));
  for (const participant of game.participants) {
    participant["ws"]?.send(JSON.stringify(obj));
  }
}

function sendCountdownToGameClients(gameId: string, seconds: number) {
  const game = games.get(gameId);
  if (!game || !game.hostWs) return;
  const obj = {
    type: "countdown",
    gameId,
    seconds,
  };
  game.hostWs.send(JSON.stringify(obj));
  for (const participant of game.participants) {
    participant["ws"]?.send(JSON.stringify(obj));
  }
}

function sendResultsToGameClients(gameId: string, index: number) {
  const game = games.get(gameId);
  if (!game || !game.hostWs) return;
  const obj = {
    type: "results",
    gameId,
    questionIndex: index,
  };
  game.hostWs.send(JSON.stringify(obj));
  for (const participant of game.participants) {
    participant["ws"]?.send(JSON.stringify(obj));
  }
}

function showNextQuestion(msg: any) {
  const game = games.get(msg.gameId);
  if (game) {
    if (game.currentQuestionIndex >= game.totalQuestions) {
      finishGame(game.hostWs!, msg);
      return;
    }
    const question = game.quizData.questions[game.currentQuestionIndex];
    const index = game.currentQuestionIndex;
    game.answeredQuestions.push({
      questionIndex: game.currentQuestionIndex,
      startedAt: new Date().toISOString(),
      endsAt: undefined,
      answers: [],
    });

    sendCountdownToGameClients(msg.gameId, 3);
    setTimeout(() => {
      sendQuestionToGameClients(msg.gameId, index, question);
    }, 3000);
    game.currentQuestionIndex++;
  }
}

async function handleWs(sock: WebSocket) {
  for await (const ev of sock) {
    if (typeof ev === "string") {
      let msg: any;
      try {
        msg = JSON.parse(ev);
      } catch {
        await sock.send(
          JSON.stringify({ type: "error", message: "Invalid JSON" })
        );
        continue;
      }

      switch (msg.type) {
        case "addAnswer": {
          const game = games.get(msg.gameId);
          if (game && typeof game.currentQuestionIndex === "number") {
            const participantId = msg.playerId;
            sock.send(
              JSON.stringify({ type: "answer_received", gameId: msg.gameId })
            );

            const participant = game.participants.find(
              (p) => p.id === participantId
            );
            const answeredQuestion = game.answeredQuestions.find(
              (q) => q.questionIndex === game.currentQuestionIndex - 1
            );
            const currentQuestion =
              game.quizData.questions[game.currentQuestionIndex - 1];

            let isCorrect = false;
            let points = 0;

            if (currentQuestion.type === "true-false") {
              if (msg.answer == currentQuestion.correctAnswer) {
                isCorrect = true;
                points = 1000;
              }
            } else if (currentQuestion.type === "standard") {
              if (currentQuestion.correctAnswers.includes(msg.answer)) {
                isCorrect = true;
                points = 1000;
              }
            }

            answeredQuestion?.answers.push({
              participant: participant!,
              questionId: msg.questionIndex,
              answer: msg.answer,
              answeredAt: new Date().toISOString(),
              isCorrect: isCorrect,
              points: points,
            });
            game.hostWs?.send(
              JSON.stringify({
                type: "answer_update",
                gameId: msg.gameId,
                answeredQuestions: game.answeredQuestions,
              })
            );
          } else {
            sock.send(
              JSON.stringify({ type: "error", message: "Game not found" })
            );
          }
          break;
        }
        case "get_time": {
          sock.send(JSON.stringify({ type: "server_time", time: Date.now() }));
          break;
        }
        case "create_game": {
          let gameId: string;
          do {
            gameId = Math.floor(100000 + Math.random() * 900000).toString();
          } while (games.has(gameId));
          const newGame: Game = {
            ...msg.data,
            id: gameId,
            gamePin: gameId,
            participants: [],
            currentQuestionIndex: 0,
            totalQuestions: msg.data?.quizData?.questions?.length || 0,
            answeredQuestions: [],
            createdAt: new Date().toISOString(),
            status: "waiting",
            settings: msg.data?.settings || {
              questionTimeLimit: 30,
              showCorrectAnswers: true,
              allowLateJoins: true,
            },
            quizData: msg.data?.quizData || {},
            hostWs: sock,
          };
          games.set(gameId, newGame);
          await sock.send(
            JSON.stringify({ type: "game_created", game: newGame })
          );
          break;
        }
        case "join_game": {
          const game = games.get(msg.gameId);
          if (game) {
            const participant = { ...msg.player, ws: sock };
            game.participants.push(participant);
            for (const client of [
              game.hostWs,
              ...game.participants.map((p) => p.ws),
            ]) {
              client?.send(
                JSON.stringify({
                  type: "joined",
                  gameId: msg.gameId,
                  player: msg.player,
                })
              );
            }
          } else {
            sock.send(
              JSON.stringify({ type: "error", message: "Game not found" })
            );
          }
          break;
        }
        case "start_game": {
          const game = games.get(msg.gameId);
          if (game) {
            sock.send(
              JSON.stringify({ type: "game_started", gameId: msg.gameId })
            );
            game.status = "active";
            game.currentQuestionIndex = 0;
            showNextQuestion(msg);
          }
          break;
        }
        case "question_timeout": {
          const game = games.get(msg.gameId);
          if (game) {
            sendResultsToGameClients(msg.gameId, game.currentQuestionIndex);
          }
          break;
        }
        case "next_question": {
          showNextQuestion(msg);
          break;
        }
        case "submit_answer": {
          const game = games.get(msg.gameId);
          if (game) {
            sock.send(JSON.stringify({ type: "answer_received" }));
          }
          break;
        }
        case "finish_game": {
          await finishGame(sock, msg);
          break;
        }
        default:
          sock.send(
            JSON.stringify({ type: "error", message: "Unknown message type" })
          );
      }
    }
  }
}

console.log("Deno WebSocket server running on ws://localhost:8080");
serve(
  async (req: any) => {
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleWs(socket);
    return response;
  },
  { port: 8080 }
);
