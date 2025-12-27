import fetch from "node-fetch";
import { WebSocket, WebSocketServer } from "ws";
import { Game } from "./game.types";

// In-memory game state
const games: Map<string, Game> = new Map();

// Firebase REST API endpoint (replace with your actual values)
const FIREBASE_URL = "https://your-firebase-project.firebaseio.com/games.json";

async function storeGameToFirebase(game: Game) {
  await fetch(FIREBASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(game),
  });
}

console.log("running");

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", async (message: string | Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(message.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    console.log("incomming message:", msg);

    switch (msg.type) {
      case "addAnswer": {
        const game = games.get(msg.gameId);
        if (game && typeof game.currentQuestionIndex === "number") {
          const participantId = msg.playerId;

          ws.send(
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
              points = 1000; // Example point allocation
            }
          } else if (currentQuestion.type === "standard") {
            // Assuming correctAnswer is an array of correct option indices
            if (currentQuestion.correctAnswers.includes(msg.answer)) {
              isCorrect = true;
              points = 1000; // Example point allocation
            }
          }

          answeredQuestion?.answers.push({
            participant: participant!,
            questionId: msg.questionIndex,
            answer: msg.answer,
            answeredAt: new Date(),
            isCorrect: isCorrect,
            points: points,
          });
          game.hostWs.send(
            JSON.stringify({
              type: "answer_update",
              gameId: msg.gameId,
              answeredQuestions: game.answeredQuestions,
            })
          );
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
        }
        break;
      }
      case "get_time": {
        ws.send(JSON.stringify({ type: "server_time", time: Date.now() }));
        break;
      }
      case "create_game": {
        // Generate a unique 6-digit random number as gameId
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
          createdAt: new Date(),
          status: "waiting",
          settings: msg.data?.settings || {
            questionTimeLimit: 30,
            showCorrectAnswers: true,
            allowLateJoins: true,
          },
          hostWs: ws,
        };

        games.set(gameId, newGame);

        ws.send(JSON.stringify({ type: "game_created", game: newGame }));
        break;
      }
      case "join_game": {
        const game = games.get(msg.gameId);
        if (game) {
          game.participants.push(msg.player);
          // Broadcast to all clients in this game (including host)
          if (wss.clients) {
            wss.clients.forEach((client: WebSocket) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "joined",
                    gameId: msg.gameId,
                    player: msg.player,
                  })
                );
              }
            });
          }
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
        }
        break;
      }
      case "start_game": {
        const game = games.get(msg.gameId);
        if (game) {
          ws.send(JSON.stringify({ type: "game_started", gameId: msg.gameId }));
          game.status = "active";
          game.currentQuestionIndex = 0;
          showNextQuestion(wss, msg);
        }
        break;
      }
      case "question_timeout": {
        const game = games.get(msg.gameId);
        if (game) {
          console.log(
            `Game ${msg.gameId}: question timeout for question index ${game.currentQuestionIndex}`
          );
          // Send results to all clients
          sendResultsToGameClients(wss, msg.gameId, game.currentQuestionIndex);
        }
        break;
      }
      case "next_question": {
        showNextQuestion(wss, msg);
        break;
      }
      case "submit_answer": {
        const game = games.get(msg.gameId);
        if (game) {
          // Handle answer logic here
          ws.send(JSON.stringify({ type: "answer_received" }));
        }
        break;
      }
      case "finish_game": {
        const game = games.get(msg.gameId);
        if (game) {
          game.status = "finished";
          game.finishedAt = new Date();
          await storeGameToFirebase(game);
          games.delete(msg.gameId);
          ws.send(
            JSON.stringify({ type: "game_finished", gameId: msg.gameId })
          );
        }
        break;
      }
      default:
        ws.send(
          JSON.stringify({ type: "error", message: "Unknown message type" })
        );
    }
  });
});

function sendQuestionToGameClients(
  wss: WebSocketServer,
  gameId: string,
  index: number,
  question: any,
  questionType?: string
) {
  let obj = {
    type: "question",
    gameId,
    index,
    question,
    questionType,
  };

  const game = games.get(gameId);
  if (!game || !wss.clients) return;
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(obj));
    }
  });
}

function sendCountdownToGameClients(
  wss: WebSocketServer,
  gameId: string,
  seconds: number
) {
  const game = games.get(gameId);
  if (!game || !wss.clients) return;
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "countdown",
          gameId,
          seconds,
        })
      );
    }
  });
}

function sendResultsToGameClients(
  wss: WebSocketServer,
  gameId: string,
  index: number
) {
  const game = games.get(gameId);
  if (!game || !wss.clients) return;
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "results",
          gameId,
          questionIndex: index,
        })
      );
    }
  });
}

function showNextQuestion(wss: WebSocketServer, msg: any) {
  const game = games.get(msg.gameId);
  if (game) {
    const question = game.quizData.questions[game.currentQuestionIndex];
    const index = game.currentQuestionIndex;
    game.answeredQuestions.push({
      questionIndex: game.currentQuestionIndex,
      startedAt: new Date(),
      endsAt: undefined,
      answers: [],
    });

    sendCountdownToGameClients(wss, msg.gameId, 3);
    setTimeout(() => {
      sendQuestionToGameClients(wss, msg.gameId, index, question);
    }, 3000);
    game.currentQuestionIndex++;
  }
}
