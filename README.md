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

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
MIT
