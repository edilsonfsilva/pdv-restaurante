require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { pool } = require('./db');
const seedAdmin = require('./seedAdmin');

// Rotas
const authRoutes = require('./routes/auth');
const categoriasRoutes = require('./routes/categorias');
const produtosRoutes = require('./routes/produtos');
const mesasRoutes = require('./routes/mesas');
const pedidosRoutes = require('./routes/pedidos');
const pagamentosRoutes = require('./routes/pagamentos');
const relatoriosRoutes = require('./routes/relatorios');
const estoqueRoutes = require('./routes/estoque');

// Middleware
const { authMiddleware, roleMiddleware } = require('./middleware/auth');
const { globalLimiter, authLimiter, writeLimiter } = require('./middleware/rateLimiter');

const app = express();
const server = http.createServer(app);

// Configuração CORS
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(express.json());

// Rate limiting global
app.use(globalLimiter);

// Rate limiting para operações de escrita
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Tentar usar Redis adapter para Socket.IO
try {
  const { createAdapter } = require('@socket.io/redis-adapter');
  const { redis } = require('./redis');
  const pubClient = redis.duplicate();
  pubClient.connect && pubClient.connect().catch(() => {});
  io.adapter(createAdapter(pubClient, redis.duplicate()));
  console.log('📡 Socket.IO usando Redis adapter');
} catch (err) {
  console.warn('⚠️ Socket.IO sem Redis adapter:', err.message);
}

// Disponibilizar io para as rotas
app.set('io', io);

// Socket.IO - Eventos
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  // Entrar em sala específica (ex: cozinha, caixa)
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`👥 ${socket.id} entrou na sala: ${room}`);
  });

  // Sair de sala
  socket.on('leave-room', (room) => {
    socket.leave(room);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

// Health check (público)
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Rotas públicas
app.use('/api/auth', authLimiter, authRoutes);

// Rotas protegidas
app.use('/api/categorias', authMiddleware, categoriasRoutes);
app.use('/api/produtos', authMiddleware, produtosRoutes);
app.use('/api/mesas', authMiddleware, mesasRoutes);
app.use('/api/pedidos', authMiddleware, pedidosRoutes);
app.use('/api/pagamentos', authMiddleware, pagamentosRoutes);
app.use('/api/relatorios', authMiddleware, roleMiddleware('admin', 'gerente'), relatoriosRoutes);
app.use('/api/estoque', authMiddleware, roleMiddleware('admin', 'gerente'), estoqueRoutes);

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor'
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3001;

// Seed admin e iniciar servidor
seedAdmin().then(() => {
  server.listen(PORT, () => {
    console.log(`
  🍽️  PDV Restaurante - Backend
  ============================
  🚀 Servidor rodando na porta ${PORT}
  📡 Socket.IO ativo
  🔐 Autenticação JWT ativa
  🌐 API: http://localhost:${PORT}/api
    `);
  });
});

module.exports = { app, io };
