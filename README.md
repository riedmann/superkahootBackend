# SuperKahoot Backend

This is the backend server for the SuperKahoot project, providing real-time game functionality using WebSockets. The backend is implemented in TypeScript for Node.js with Docker support.

## Features
- WebSocket server for real-time communication
- Game state management with participant reconnection support
- Type definitions for game logic
- Firebase integration for game data persistence
- Docker deployment support
- Message buffering for handling temporary disconnections

## Project Structure
```
Backend/
├── firebase.ts                # Firebase integration
├── game.types.ts              # Type definitions for game logic
├── node_websocket_server.ts   # Main WebSocket server
├── package.json               # Project dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── Dockerfile                 # Docker configuration
├── compose.yaml               # Docker Compose configuration
├── .env                       # Environment variables (not in repo)
└── dist/                      # Compiled JavaScript output
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)
- TypeScript
- Docker (optional, for containerized deployment)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/riedmann/superkahoot.git
   cd superkahoot/Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Firebase configuration and other environment variables.

### Running the WebSocket Server

#### Development Mode
```bash
npx tsx node_websocket_server.ts
```

Or with ts-node:
```bash
npx ts-node node_websocket_server.ts
```

#### Production Mode
```bash
npm run build   # Compile TypeScript to dist/
npm start       # Start the server from compiled JS
```

The server will start on port 9080 by default (or the PORT specified in your .env file).

## Configuration

### Environment Variables
Create a `.env` file in the Backend directory with the following variables:
- `PORT`: Server port (default: 9080)
- Firebase configuration variables (apiKey, authDomain, projectId, etc.)
- `SSL_CERT_PATH`: Path to SSL certificate (optional, for wss://)
- `SSL_KEY_PATH`: Path to SSL private key (optional, for wss://)

### TypeScript Configuration
- Edit `tsconfig.json` for TypeScript compiler options
- The compiled output goes to the `dist/` directory

### SSL/TLS Configuration
The WebSocket server supports SSL/TLS for secure connections (wss://). To enable SSL:

1. Obtain SSL certificates (e.g., from Let's Encrypt or generate self-signed certificates for development)
2. Set the following environment variables:
   - `SSL_CERT_PATH`: Path to your SSL certificate file (e.g., `cert.pem`)
   - `SSL_KEY_PATH`: Path to your SSL private key file (e.g., `key.pem`)

Example for development (self-signed certificate):
```bash
# Generate self-signed certificate (for development only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Run with SSL
SSL_CERT_PATH=./cert.pem SSL_KEY_PATH=./key.pem npx tsx node_websocket_server.ts
```

For production, use proper SSL certificates from a trusted certificate authority.

## Docker Deployment

### Building and Running with Docker Compose
```bash
docker compose up --build
```

Your application will be available at http://localhost:9080.

### Updating the Server with New Code
After pulling the latest code from the repository:

```bash
# Pull the latest code
git pull

# Rebuild and restart the containers
docker compose up --build -d
```

The `--build` flag rebuilds the image with your new code, and `-d` runs it in detached mode (background).

### Alternative Deployment Steps
```bash
# Stop the current containers
docker compose down

# Rebuild the image
docker compose build

# Start the containers
docker compose up -d
```

### Clean Rebuild (removes cache)
If you want to clean up old images and free space:
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Docker Environment
The Docker setup uses:
- Node.js 23.11.0 Alpine image
- Multi-stage build for optimized image size
- Production dependencies only in the final image
- Environment variables from `.env` file
- Port 9080 exposed for WebSocket connections

## WebSocket API

### Message Types

#### Client → Server
- `create_game`: Create a new game session
- `join_game`: Join an existing game with player info
- `reconnect`: Reconnect after disconnection with `{ gameId, playerId, lastMessageTime }`
- `start_game`: Start the game (host only)
- `addAnswer`: Submit an answer to a question
- `question_timeout`: Signal that question time has expired
- `next_question`: Move to the next question
- `finish_game`: End the game session
- `get_time`: Get server time for synchronization

#### Server → Client
- `game_created`: Confirmation of game creation with game details
- `joined`: Player joined notification
- `reconnected`: Successful reconnection with missed messages
- `countdown`: Countdown before question starts
- `question`: New question data
- `results`: Question results
- `answer_received`: Answer submission confirmation
- `answer_update`: Answer update for host
- `game_started`: Game has started
- `game_finished`: Game ended with final scores
- `server_time`: Server timestamp response
- `error`: Error message

## Reconnection Support

The server includes robust reconnection handling:
- Buffers the last 50 messages per game
- Participants remain in the game for 60 seconds after disconnection
- On reconnect, clients receive all missed messages since their last known timestamp
- Prevents duplicate message delivery

See the implementation in `node_websocket_server.ts` for details.

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
MIT

## Docker
Follow the logs in real time:

docker logs -f <container_name_or_id>
