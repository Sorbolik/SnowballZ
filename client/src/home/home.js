import './home.css';
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";
let socket = null;

async function createRoom() {
  const res = await fetch(`${SERVER_URL}/create-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const data = await res.json();
  document.getElementById("roomInput").value = data.roomId;
  document.getElementById("status").innerText = "Stanza creata: " + data.roomId;
  

  showWaitingScreen();
  connectToSocket(data.roomId);
}

async function joinRoom() {
  const roomId = document.getElementById("roomInput").value;
  const res = await fetch(`${SERVER_URL}/join-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId })
  });
  
 if (res.ok) {
    document.getElementById("status").innerText = "Joinato nella stanza: " + roomId;
    showWaitingScreen();
    connectToSocket(roomId);
  } else {
    const error = await res.json();
    document.getElementById("error").innerText = "Errore: " + error.error;
  }
}

function connectToSocket(roomId) {
  socket = io(SERVER_URL);
	window.setSocketReference(socket);
	
  socket.on("connect", () => {
    socket.emit("join-room", roomId);
  });

	socket.on("start-game", ({ roomId, map }) => {
	  document.getElementById("waiting-screen").style.display = "none";
	  document.getElementById("status").innerText = "Partita iniziata nella stanza: " + roomId;
	  startGame(map);
	});
}

function showWaitingScreen() {
  document.getElementById("home").style.display = "none";
  document.getElementById("waiting-screen").style.display = "flex";
}

function startGame(map) {
  document.getElementById("app").style.display = "block";
  window.generateMapFromServer(map); // funzione definita in main.js
}


document.getElementById("createBtn").addEventListener("click", createRoom);
document.getElementById("joinBtn").addEventListener("click", joinRoom);

