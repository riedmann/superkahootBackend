import { addDoc, collection } from "firebase/firestore";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "./firebase";
import { Game } from "./game.types";
import express from "express";
import { createServer } from "http";

// In-memory game state
const games: Map<string, Game> = new Map();

// Track participant connections: gameId -> participantId -> WebSocket
const participantConnections: Map<string, Map<string, WebSocket>> = new Map();

// Message buffer: gameId -> array of buffered messages (keep last 50 messages per game)
interface BufferedMessage {
  timestamp: number;
  message: any;
}
const messageBuffers: Map<string, BufferedMessage[]> = new Map();

const MAX_BUFFER_SIZE = 50;
const RECONNECT_TIMEOUT = 60000; // 60 seconds to reconnect

function bufferMessage(gameId: string, message: any) {
  if (!messageBuffers.has(gameId)) {
    messageBuffers.set(gameId, []);
  }
  const buffer = messageBuffers.get(gameId)!;
  buffer.push({
    timestamp: Date.now(),
    message,
  });
  // Keep only the last MAX_BUFFER_SIZE messages
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }
}

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

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 9080;

const wss = new WebSocketServer({ server, path: "/ws" });

app.get("/", (req, res) => {
  res.send("Hello over HTTP!");
});

wss.on("connection", (ws: WebSocket) => {
  let currentGameId: string | null = null;
  let currentParticipantId: string | null = null;
  let isHost = false;

  ws.on("close", () => {
    console.log("Connection closed", {
      gameId: currentGameId,
      participantId: currentParticipantId,
      isHost,
    });
    // Don't remove the participant from the game, just mark the connection as closed
    // They can reconnect within RECONNECT_TIMEOUT
    if (currentGameId && currentParticipantId && !isHost) {
      const connections = participantConnections.get(currentGameId);
      if (connections) {
        const storedWs = connections.get(currentParticipantId);
        // Only remove if it's the same connection (not already reconnected)
        if (storedWs === ws) {
          connections.delete(currentParticipantId);
        }
      }
    }
  });

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
            }
          } else if (currentQuestion.type === "standard") {
            // Assuming correctAnswer is an array of correct option indices
            if (currentQuestion.correctAnswers.includes(msg.answer)) {
              isCorrect = true;
            }
          }

          // Calculate points with time bonus
          if (isCorrect) {
            const basePoints = 500;
            const maxTimeBonus = 500;
            const penaltyPerSecond = 10;

            // Calculate elapsed time in seconds
            const questionStartTime =
              answeredQuestion?.startedAt?.getTime() || Date.now();
            const answerTime = Date.now();
            const elapsedSeconds = Math.floor(
              (answerTime - questionStartTime) / 1000
            );

            // Calculate time bonus: 400 - (10 * seconds), minimum 0
            const timeBonus = Math.max(
              0,
              maxTimeBonus - elapsedSeconds * penaltyPerSecond
            );

            points = basePoints + timeBonus;
          }

          answeredQuestion?.answers.push({
            participant: participant!,
            questionId: msg.questionIndex,
            answer: msg.answer,
            answeredAt: new Date(),
            isCorrect: isCorrect,
            points: points,
          });

          // Calculate total score for this participant
          let totalScore = 0;
          for (const answered of game.answeredQuestions) {
            for (const answer of answered.answers) {
              if (answer.participant.id === participantId) {
                totalScore += answer.points || 0;
              }
            }
          }

          // Send results back to the player
          ws.send(
            JSON.stringify({
              type: "results",
              score: totalScore,
              isCorrect: isCorrect,
              points: points,
            })
          );

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
        currentGameId = gameId;
        isHost = true;

        ws.send(JSON.stringify({ type: "game_created", game: newGame }));
        break;
      }
      case "join_game": {
        const game = games.get(msg.gameId);
        if (game) {
          // Check if player already exists (rejoining)
          const existingPlayer = game.participants.find(
            (p) => p.id === msg.player.id
          );

          // Check for duplicate name
          const duplicateName = game.participants.find(
            (p) => p.name === msg.player.name && p.id !== msg.player.id
          );

          if (duplicateName) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "A player with this name already exists in the game",
              })
            );
            break;
          }

          if (!existingPlayer) {
            game.participants.push(msg.player);
          }

          // Track the connection
          currentGameId = msg.gameId;
          currentParticipantId = msg.player.id;
          if (!participantConnections.has(msg.gameId)) {
            participantConnections.set(msg.gameId, new Map());
          }
          participantConnections.get(msg.gameId)!.set(msg.player.id, ws);

          const joinMessage = JSON.stringify({
            type: "joined",
            gameId: msg.gameId,
            player: msg.player,
          });

          // Send to the client that just joined
          ws.send(joinMessage);

          // Send to host only (not to other participants)
          if (
            game.hostWs &&
            game.hostWs.readyState === WebSocket.OPEN &&
            game.hostWs !== ws
          ) {
            game.hostWs.send(joinMessage);
          }
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
        }
        break;
      }
      case "reconnect": {
        const game = games.get(msg.gameId);
        if (game) {
          const participant = game.participants.find(
            (p) => p.id === msg.playerId
          );
          if (participant) {
            // Update the connection
            currentGameId = msg.gameId;
            currentParticipantId = msg.playerId;
            if (!participantConnections.has(msg.gameId)) {
              participantConnections.set(msg.gameId, new Map());
            }
            participantConnections.get(msg.gameId)!.set(msg.playerId, ws);

            // Send buffered messages since the last known timestamp
            const buffer = messageBuffers.get(msg.gameId) || [];
            const missedMessages = buffer.filter(
              (m) => m.timestamp > (msg.lastMessageTime || 0)
            );

            ws.send(
              JSON.stringify({
                type: "reconnected",
                gameId: msg.gameId,
                playerId: msg.playerId,
                missedMessages: missedMessages.map((m) => m.message),
                currentQuestionIndex: game.currentQuestionIndex,
                gameStatus: game.status,
              })
            );

            console.log(
              `Player ${msg.playerId} reconnected to game ${msg.gameId}, sent ${missedMessages.length} missed messages`
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Participant not found in game",
              })
            );
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
      case "disconnect_player": {
        const game = games.get(msg.gameId);
        if (game) {
          // Find the player to disconnect
          const playerIndex = game.participants.findIndex(
            (p) => p.id === msg.playerId
          );

          if (playerIndex !== -1) {
            const player = game.participants[playerIndex];

            // Remove player from participants
            game.participants.splice(playerIndex, 1);

            // Get player's connection and close it
            const connections = participantConnections.get(msg.gameId);
            if (connections) {
              const playerWs = connections.get(msg.playerId);
              if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                playerWs.send(
                  JSON.stringify({
                    type: "disconnected",
                    gameId: msg.gameId,
                    reason: msg.reason || "You have been removed from the game",
                  })
                );
                playerWs.close();
              }
              connections.delete(msg.playerId);
            }

            // Notify host
            if (game.hostWs && game.hostWs.readyState === WebSocket.OPEN) {
              game.hostWs.send(
                JSON.stringify({
                  type: "player_disconnected",
                  player: { id: msg.playerId },
                })
              );
            }

            console.log(
              `Player ${player.name} (${msg.playerId}) disconnected from game ${msg.gameId}`
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Player not found in game",
              })
            );
          }
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
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
          // Clean up message buffers and connections
          messageBuffers.delete(msg.gameId);
          participantConnections.delete(msg.gameId);

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
  if (!game) return;

  // Buffer the message
  bufferMessage(gameId, obj);

  // Send to host
  if (game.hostWs && game.hostWs.readyState === WebSocket.OPEN) {
    game.hostWs.send(JSON.stringify(obj));
  }

  // Send to all participants (excluding host)
  const connections = participantConnections.get(gameId);
  if (connections) {
    connections.forEach((ws, participantId) => {
      if (ws.readyState === WebSocket.OPEN && ws !== game.hostWs) {
        ws.send(JSON.stringify(obj));
      }
    });
  }
}

function sendCountdownToGameClients(
  wss: WebSocketServer,
  gameId: string,
  seconds: number
) {
  const game = games.get(gameId);
  if (!game) return;

  const obj = {
    type: "countdown",
    gameId,
    seconds,
  };

  // Buffer the message
  bufferMessage(gameId, obj);

  // Send to host
  if (game.hostWs && game.hostWs.readyState === WebSocket.OPEN) {
    game.hostWs.send(JSON.stringify(obj));
  }

  // Send to all participants (excluding host)
  const connections = participantConnections.get(gameId);
  if (connections) {
    connections.forEach((ws, participantId) => {
      if (ws.readyState === WebSocket.OPEN && ws !== game.hostWs) {
        ws.send(JSON.stringify(obj));
      }
    });
  }
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
    // Clean up message buffers and connections
    messageBuffers.delete(msg.gameId);
    participantConnections.delete(msg.gameId);

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
  if (!game) return;

  const obj = {
    type: "results",
    gameId,
    questionIndex: index,
  };

  // Buffer the message
  bufferMessage(gameId, obj);

  // Send to host
  if (game.hostWs && game.hostWs.readyState === WebSocket.OPEN) {
    game.hostWs.send(JSON.stringify(obj));
  }

  // Send to all participants (excluding host)
  const connections = participantConnections.get(gameId);
  if (connections) {
    connections.forEach((ws, participantId) => {
      if (ws.readyState === WebSocket.OPEN && ws !== game.hostWs) {
        ws.send(JSON.stringify(obj));
      }
    });
  }
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

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
