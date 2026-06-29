var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
var http = require('http');
var { Server } = require('socket.io');

var employeRouter = require('./routes/employes/employe.routes');
var departementRouter = require('./routes/employes/departement.routes');
var posteRouter = require('./routes/employes/poste.routes');
var congesRouter = require('./routes/conges/conges.routes');
var authRouter = require('./routes/auth/auth.routes');
var solde_congeRouter = require('./routes/conges/solde_conge.routes');
var pointageRouter = require('./routes/conges/pointage')

var app = express();
var server = http.createServer(app);

// ─── SOCKET.IO ───────────────────────────────────────────────
var io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
  }
});

// Rendre io accessible dans les routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log('🟢 Client connecté :', socket.id);

  // Room personnelle par employé
  socket.on('join', (employe_id) => {
    socket.join(`employe_${employe_id}`);
    console.log(`👤 Employé ${employe_id} a rejoint sa room`);
  });

  // Room partagée pour tous les managers/RH
  socket.on('join_managers', () => {
    socket.join('room_managers');
    console.log(`🛡️ Un manager a rejoint room_managers`);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client déconnecté :', socket.id);
  });
});

// ─── MIDDLEWARES ─────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));
app.options('*', cors());
app.use(logger('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ROUTES ──────────────────────────────────────────────────
app.use('/employes', employeRouter);
app.use('/departements', departementRouter);
app.use('/postes', posteRouter);
app.use('/conges', congesRouter);
app.use('/auth', authRouter);
app.use('/solde-conge', solde_congeRouter);
app.use('/pointages', pointageRouter);


module.exports = { app, server, io };