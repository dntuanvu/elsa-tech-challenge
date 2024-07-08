const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const Redis = require('ioredis');

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// PostgreSQL setup
const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT,
});

// Redis setup
const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  });

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('join', async (quizId) => {
    // Handle user joining a quiz
    const userId = socket.id;
    // Add user to Redis set
    await redis.sadd(`quiz:${quizId}:users`, userId);
    socket.join(quizId);
  });

  socket.on('submitAnswer', async (data) => {
    const { quizId, userId, answer } = data;
    // Process answer and update score in database
    const score = await processAnswer(quizId, userId, answer);
    // Cache the updated leaderboard
    await updateLeaderboardCache(quizId);
    // Broadcast the updated score and leaderboard
    io.to(quizId).emit('scoreUpdate', { userId, score });
    io.to(quizId).emit('leaderboardUpdate', await getLeaderboard(quizId));
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const processAnswer = async (quizId, userId, answer) => {
  // Logic to process the answer and update the score
  const result = await pool.query('UPDATE scores SET score = score + 1 WHERE quiz_id = $1 AND user_id = $2 RETURNING score', [quizId, userId]);
  return result.rows[0].score;
};

const updateLeaderboardCache = async (quizId) => {
  const result = await pool.query('SELECT user_id, score FROM scores WHERE quiz_id = $1 ORDER BY score DESC', [quizId]);
  const leaderboard = result.rows;
  await redis.set(`quiz:${quizId}:leaderboard`, JSON.stringify(leaderboard));
};

const getLeaderboard = async (quizId) => {
  const leaderboard = await redis.get(`quiz:${quizId}:leaderboard`);
  return JSON.parse(leaderboard);
};

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
