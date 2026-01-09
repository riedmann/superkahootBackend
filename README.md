# SuperKahoot Backend

This is the backend server for the SuperKahoot project, providing real-time game functionality using WebSockets. The backend is implemented in TypeScript for Node.js, with an alternative Deno implementation available.

## Features
- WebSocket server for real-time communication
- Game state management
- Type definitions for game logic
- Firebase integration (optional)
- Node.js and Deno support

## Project Structure
```
Backend/
├── firebase.ts                # Firebase integration (optional)
├── game.types.ts              # Type definitions for game logic
├── node_websocket_server.ts   # Main WebSocket server (Node.js)
├── package.json               # Project dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── deno/
│   ├── deno_websocket_server.ts # WebSocket server (Deno)
│   └── deno.ts                   # Deno entry point
└── old/                       # Legacy code
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)
- TypeScript
- (Optional) Deno

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/riedmann/superkahootBackend.git
   cd superkahootBackend/Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Node.js WebSocket Server
```bash
npm run build   # Compile TypeScript
npm start       # Start the server
```
Or directly with ts-node:
```bash
npx ts-node node_websocket_server.ts
```

### Running the Deno WebSocket Server
```bash
denon deno/deno_websocket_server.ts
```

## Configuration
- Edit `tsconfig.json` for TypeScript options.
- Update `firebase.ts` for Firebase integration if needed.

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
SSL_CERT_PATH=./cert.pem SSL_KEY_PATH=./key.pem npm start
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
# Navigate to the Backend directory
cd /path/to/superkahoot/Backend

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

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
MIT
