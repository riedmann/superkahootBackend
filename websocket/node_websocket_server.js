// node_websocket_server.js
// Node.js WebSocket server for SuperKahoot game logic
// All game logic is handled in memory. Finished games are stored to Firebase.

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

console.log("Startup server");

wss.on("connection", (ws) => {
  ws.on("message", async (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    console.log("msg:", msg);

    switch (msg.type) {
      case "get_time": {
        ws.send(JSON.stringify({ type: "server_time", time: Date.now() }));
        break;
      }
      case "create_game": {
        // Generate a unique 6-digit random number as gameId
        let gameId;
        do {
          gameId = Math.floor(100000 + Math.random() * 900000).toString();
        } while (games.has(gameId));
        games.set(gameId, { ...msg.data, players: [], state: "waiting" });
        ws.send(JSON.stringify({ type: "game_created", gameId }));
        break;
      }
      case "join_game": {
        const game = games.get(msg.gameId);
        if (game) {
          game.players.push(msg.player);
          // Broadcast to all participants in this game (including host)
          wss.clients.forEach((client) => {
            if (
              client.readyState === WebSocket.OPEN &&
              game.players.some((p) => p.ws === client)
            ) {
              client.send(
                JSON.stringify({
                  type: "joined",
                  gameId: msg.gameId,
                  player: msg.player,
                })
              );
            }
          });
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
        }
        break;
      }
      case "start_game": {
        console.log(
          `Game ${msg.gameId}: start_game received, sending countdown to participants.`
        );
        const game = games.get(msg.gameId);

        if (game) {
          game.state = "started";
          game.currentQuestionIndex = 0;
          // Send countdown to participants
          wss.clients.forEach((client) => {
            if (
              client.readyState === WebSocket.OPEN &&
              game.players.some((p) => p.ws === client)
            ) {
              client.send(
                JSON.stringify({
                  type: "countdown",
                  gameId: msg.gameId,
                  seconds: 4,
                })
              );
            }
          });
          ws.send(JSON.stringify({ type: "game_started", gameId: msg.gameId }));
          console.log(
            `Game ${msg.gameId}: countdown sent, scheduling question in 4 seconds.`
          );
          // After 4 seconds, send the first question
          setTimeout(() => {
            const question = game.quizData.questions?.[0] || null;
            console.log(
              `Game ${msg.gameId}: sending first question to participants.`
            );
            wss.clients.forEach((client) => {
              if (
                client.readyState === WebSocket.OPEN &&
                game.players.some((p) => p.ws === client)
              ) {
                client.send(
                  JSON.stringify({
                    type: "question",
                    gameId: msg.gameId,
                    question,
                    index: 0,
                  })
                );
              }
            });
          }, 4000);
        }
        break;
      }
      case "nextQuestion": {
        const game = games.get(msg.gameId);
        if (game && Array.isArray(game.questions)) {
          if (typeof game.currentQuestionIndex !== "number") {
            game.currentQuestionIndex = 0;
          }
          game.currentQuestionIndex++;
          const nextIdx = game.currentQuestionIndex;
          const question = game.questions[nextIdx] || null;
          wss.clients.forEach((client) => {
            if (
              client.readyState === WebSocket.OPEN &&
              game.players.some((p) => p.ws === client)
            ) {
              client.send(
                JSON.stringify({
                  type: "question",
                  gameId: msg.gameId,
                  question,
                  index: nextIdx,
                })
              );
            }
          });
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
          game.state = "finished";
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
