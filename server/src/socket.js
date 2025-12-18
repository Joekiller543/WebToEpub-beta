import { Server } from 'socket.io';

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    
    // Allow client to resume or track a specific job session
    socket.on('join-job', (jobId) => {
      if (jobId) {
        console.log(`[Socket] ${socket.id} joining job room: ${jobId}`);
        socket.join(jobId);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    // Return a dummy object if IO is not initialized yet to prevent crashes in tests or early calls
    return {
      to: () => ({ emit: () => {} }),
      emit: () => {}
    };
  }
  return io;
};
