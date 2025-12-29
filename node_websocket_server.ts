import { addDoc, collection } from "firebase/firestore";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "./firebase";
import { Game } from "./game.types";

// In-memory game state
const games: Map<string, Game> = new Map();

async function storeGameToFirestore(game: Game) {
  try {
    // Remove non-serializable fields (like hostWs) and undefined values
    const { hostWs, ...serializableGame } = game;
    // Remove any undefined fields recursively
    const cleanGame = JSON.parse(JSON.stringify(serializableGame));
    await addDoc(collection(db, "games"), cleanGame);
    console.log("Game stored to Firestore");
  } catch (error) {
    console.error("Error storing game to Firestore:", error);
  }
}

const PORT = 8080;
console.log("running on port", PORT);

const wss = new WebSocketServer({ port: PORT });

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
          await storeGameToFirestore(game);

          const scores = calculateWinners(game);

          games.delete(msg.gameId);
          ws.send(
            JSON.stringify({
              type: "game_finished",
              gameId: msg.gameId,
              winners: scores,
            })
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

function calculateWinners(game: Game) {
  // Calculate points for each participant
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

  // Sort by points descending
  scores.sort((a, b) => b.points - a.points);

  return scores;
}

async function finishGame(ws: any, msg: any) {
  const game = games.get(msg.gameId);
  if (game) {
    game.status = "finished";
    game.finishedAt = new Date();
    await storeGameToFirestore(game);

    const scores = calculateWinners(game);

    games.delete(msg.gameId);
    ws.send(
      JSON.stringify({
        type: "game_finished",
        gameId: msg.gameId,
        winners: scores,
      })
    );
  }
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
    if (game.currentQuestionIndex >= game.totalQuestions) {
      finishGame(game.hostWs, msg);
    }
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
