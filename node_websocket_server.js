const WebSocket = require("ws");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

const wss = new WebSocket.Server({ port: 8080 });

// In-memory game state
const games = new Map();

// Firebase REST API endpoint (replace with your actual values)
const FIREBASE_URL = "https://your-firebase-project.firebaseio.com/games.json";

async function storeGameToFirebase(game) {
  await fetch(FIREBASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(game),
  });
}

wss.on("connection", (ws) => {
  ws.on("message", async (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "get_time": {
        ws.send(JSON.stringify({ type: "server_time", time: Date.now() }));
        break;
      }
      case "create_game": {
        console.log("in create game:", msg);

        // Generate a unique 6-digit random number as gameId
        let gameId;
        do {
          gameId = Math.floor(100000 + Math.random() * 900000).toString();
        } while (games.has(gameId));
        const newGame = {
          ...msg.data,
          id: gameId,
          gamePin: gameId,
          participants: [],
          currentQuestionIndex: 0,
          totalQuestions: msg.data?.quizData?.questions?.length || 0,
          createdAt: new Date(),
          status: "waiting",
          settings: msg.data?.settings || {
            questionTimeLimit: 30,
            showCorrectAnswers: true,
            allowLateJoins: true,
          },
        };
        games.set(gameId, newGame);
        console.log("sending game id ", gameId);

        ws.send(JSON.stringify({ type: "game_created", game: newGame }));
        break;
      }
      case "join_game": {
        console.log("in join", msg);

        const game = games.get(msg.gameId);
        if (game) {
          game.participants.push(msg.player);
          // Broadcast to all clients in this game (including host)
          if (wss.clients) {
            wss.clients.forEach((client) => {
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
          // Send countdown to all clients in the game, then send the first question after 3 seconds
          sendCountdownToGameClients(wss, msg.gameId, 3);
          setTimeout(() => {
            sendQuestionToGameClients(
              wss,
              msg.gameId,
              game.currentQuestionIndex
            );
          }, 3000);
        }
        break;
      }
      case "nextQuestion": {
        const game = games.get(msg.gameId);
        if (game) {
          game.currentQuestionIndex++;
          console.log("-----");

          console.log(game);
          console.log("xxxxx");

          sendCountdownToGameClients(wss, msg.gameId, 3);
          setTimeout(() => {
            sendQuestionToGameClients(
              wss,
              msg.gameId,
              game.currentQuestionIndex
            );
          }, 3000);
        }
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

console.log("WebSocket server running on ws://localhost:8080");

function sendQuestionToGameClients(wss, gameId, index) {
  const game = games.get(gameId);
  if (!game || !wss.clients) return;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "question",
          gameId,
          index,
        })
      );
    }
  });
}

function sendCountdownToGameClients(wss, gameId, seconds) {
  const game = games.get(gameId);
  if (!game || !wss.clients) return;
  wss.clients.forEach((client) => {
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
function sendResultsToGameClients(wss, gameId, index) {
  const game = games.get(gameId);
  if (!game || !wss.clients) return;
  // You can customize the results payload as needed
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "results",
          gameId,
          questionIndex: index,
          // Add more result data here if needed
        })
      );
    }
  });
}
