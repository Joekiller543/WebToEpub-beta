import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { router } from './routes.js';
import { initSocket } from './socket.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket integration
const httpServer = createServer(app);

// Initialize Socket.IO
initSocket(httpServer);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api', router);

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'WebToEpub Scraper Engine' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start Server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
