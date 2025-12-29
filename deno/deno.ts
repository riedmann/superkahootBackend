// Creating a WebSocket connection
const ws = new WebSocket("ws://localhost:8080");

// Setting up event handlers
ws.onopen = (event) => {
  console.log("Connected to the server");
  ws.send("Hello Server!");
};

ws.onmessage = (event) => {
  console.log(`Received: ${event.data}`);
};

ws.onerror = (event) => {
  console.error("WebSocket error observed:", event);
};

ws.onclose = (event) => {
  console.log(`WebSocket closed: Code=${event.code}, Reason=${event.reason}`);
};
