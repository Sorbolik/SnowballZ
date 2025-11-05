const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);

//PARAMETRI MAPPA
const MAP_SIZE = 20;
const TILE_SIZE = 2;
const OBSTACLE_CHANCE = 0.15;

// CORS per WebSocket
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});
const cors = require("cors");

// CORS per le API REST
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

const rooms = {}; // { roomId: [socketId1, socketId2] }




function generateObstacleMap() {
  const obstacles = [];
  const forbidden = { x: Math.floor(MAP_SIZE / 2), z: Math.floor(MAP_SIZE / 2) };

  for (let x = 0; x < MAP_SIZE; x++) {
    for (let z = 0; z < MAP_SIZE; z++) {
      const isForbidden = x === forbidden.x && z === forbidden.z;
      if (!isForbidden && Math.random() < OBSTACLE_CHANCE) {
        obstacles.push({ x, z });
      }
    }
  }

  return obstacles;
}


// 🔧 API per creare una stanza
app.post("/create-room", (req, res) => {
  const roomId = Math.random().toString(36).substr(2, 6);
  const map = generateObstacleMap();
  rooms[roomId] = { players: [], map };
  res.json({ roomId });
});


// 🔧 API per joinare una stanza
app.post("/join-room", (req, res) => {
  const { roomId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.players.length >= 2) return res.status(403).json({ error: "Room full" });
  res.json({ success: true });
});

io.on("connection", (socket) => {
  console.log("Nuovo client connesso:", socket.id);

	socket.on("join-room", (roomId) => {
	  const room = rooms[roomId];
	  if (!room || room.players.length >= 2) return;

	  room.players.push(socket.id);
	  socket.join(roomId);
	  console.log(`Socket ${socket.id} ha joinato la stanza ${roomId}`);

	  if (room.players.length === 2) {
		io.to(roomId).emit("start-game", {
		  roomId,
		  map: room.map
		});
	  }

	  socket.on("player-move", (data) => {
		socket.to(roomId).emit("opponent-move", data);
	  });
	  
	  socket.on("hit-opponent", () => {
		  socket.to(roomId).emit("hit-opponent");
		});

	  socket.on("disconnect", () => {
		room.players = room.players.filter(id => id !== socket.id);
		socket.to(roomId).emit("player-left");
	  });
	});
});

server.listen(3000, () => {
  console.log("Server in ascolto su http://localhost:3000");
});
