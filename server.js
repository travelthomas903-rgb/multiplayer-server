const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Wichtig: Erlaubt dem Frontend (Netlify) die Verbindung
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; 

// Struktur: { "ABCD": { creatorId: socket.id, players: [{id, username}], code: "ABCD" } }
const activeRooms = {}; 

function generateUniqueCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (activeRooms[code]);
    return code;
}

io.on('connection', (socket) => {

    // --- 1. RAUM ERSTELLEN ---
    // Der Client sendet ein Objekt: { username: "..." }
    socket.on('createRoom', (data) => {
        // Hier wird die Datenverarbeitung geprüft (data.username sollte existieren)
        if (!data || !data.username) {
            socket.emit('error', 'Ungültige Daten zum Raumerstellen.');
            return;
        }
        
        const roomCode = generateUniqueCode();
        socket.join(roomCode);
        
        activeRooms[roomCode] = {
            creatorId: socket.id,
            players: [{ id: socket.id, username: data.username }],
            code: roomCode
        };

        socket.emit('roomCreated', roomCode);
    });

    // --- 2. RAUM BEITRETEN ---
    // Der Client sendet ein Objekt: { code: "...", username: "..." }
    socket.on('joinRoom', (data) => {
        // Sicherheitscheck
        if (!data || !data.code || !data.username) {
            socket.emit('error', 'Ungültige Daten zum Beitreten.');
            return;
        }
        
        // **DIES IST DIE KRITISCHE STELLE (Zeile 56 in der Original-Version)**
        // Wir verwenden data.code, was ein String ist und .toUpperCase() unterstützt.
        const code = data.code.toUpperCase(); // <-- Jetzt korrekt
        const room = activeRooms[code];
        
        if (!room) { socket.emit('error', 'Raum existiert nicht.'); return; }
        if (room.players.length >= 2) { socket.emit('error', 'Raum ist bereits voll.'); return; }

        socket.join(code);
        room.players.push({ id: socket.id, username: data.username });
        
        socket.emit('roomJoined', code);
        
        // Spielstart-Logik
        io.to(room.creatorId).emit('startGame', true);
        socket.emit('startGame', false);
    });

    // --- 3. SPIELZUG SENDEN ---
    socket.on('gameAction', (term) => {
        const roomCode = Array.from(socket.rooms).find(room => room !== socket.id);
        
        if (roomCode && activeRooms[roomCode]) {
            const room = activeRooms[roomCode];
            
            const sender = room.players.find(p => p.id === socket.id);
            const opponent = room.players.find(p => p.id !== socket.id);

            if (opponent && sender) {
                io.to(opponent.id).emit('opponentAction', { 
                    username: sender.username, 
                    term: term 
                });
            }
        }
    });

    // --- 4. TRENNUNG/DISCONNECT ---
    socket.on('disconnect', () => {
        for (const code in activeRooms) {
            const room = activeRooms[code];
            const disconnectedPlayer = room.players.find(p => p.id === socket.id);

            if (disconnectedPlayer) {
                room.players = room.players.filter(p => p.id !== socket.id);
                
                if (room.players.length === 0) {
                    delete activeRooms[code];
                } else {
                    const remainingPlayerId = room.players[0].id;
                    io.to(remainingPlayerId).emit('playerDisconnected', disconnectedPlayer.username);
                }
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
