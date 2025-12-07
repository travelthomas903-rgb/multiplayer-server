const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; 

// --- NEUE SPIEL-DATEN ---
const GAME_CATEGORIES = [
    { title: "Lieblingseis", topic: "Nenne eine Eissorte, die du magst (z.B. Zitrone)" },
    { title: "Oberbegriff", topic: "Nenne ein Beispiel für die Kategorie 'Fahrzeug' (z.B. Fahrrad)" },
    { title: "Farbe", topic: "Nenne etwas Blaues (z.B. Himmel)" },
    { title: "Reiseziel", topic: "Nenne eine Stadt, in die du reisen möchtest (z.B. Berlin)" },
    { title: "Filmtitel", topic: "Nenne einen aktuellen Kinofilm (z.B. Dune)" }
];

// Struktur: { "ABCD": { players: [{id, username}], categoryIndex: 0, currentTurn: 0 } }
const activeRooms = {}; 

function generateUniqueCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (activeRooms[code]);
    return code;
}

io.on('connection', (socket) => {

    // --- 1. RAUM ERSTELLEN (mit Username) ---
    // data: { username: "..." }
    socket.on('createRoom', (data) => {
        const roomCode = generateUniqueCode();
        socket.join(roomCode);
        
        // Zufällige Kategorie für den Raum wählen
        const categoryIndex = Math.floor(Math.random() * GAME_CATEGORIES.length);

        activeRooms[roomCode] = {
            players: [{ id: socket.id, username: data.username, turn: 0 }], // Spieler 1 (Host)
            categoryIndex: categoryIndex,
            currentTurn: 0 // Spieler 1 fängt an
        };

        socket.emit('roomCreated', roomCode);
    });

   socket.on('joinRoom', (data) => { 
        
        // **DIES IST DIE KRITISCHE STELLE, die auf der 56 abstürzt**
        // Die Variable, die den Code enthält, ist 'data.code'
        if (!data || !data.code) { 
             socket.emit('error', 'Fehlender Raum-Code.');
             return;
        }
        
        const code = data.code.toUpperCase(); // <-- Muss 'data.code' sein!
        const room = activeRooms[code];
        }
        
        const code = data.code.toUpperCase();
        const room = activeRooms[code];
        
        if (!room) { socket.emit('error', 'Raum existiert nicht.'); return; }
        if (room.players.length >= 2) { socket.emit('error', 'Raum ist bereits voll.'); return; }

        socket.join(code);
        
        // Spieler 2 (Gast) hinzufügen
        room.players.push({ id: socket.id, username: data.username, turn: 1 });
        
        const category = GAME_CATEGORIES[room.categoryIndex];

        // Informiert den Beitreter
        socket.emit('roomJoined', code, category); 
        
        // Informiert BEIDE Spieler über den Start und die Kategorie
        io.to(code).emit('startGame', {
            category: category,
            starterId: room.players[room.currentTurn].id // Der Host fängt an
        });
    });

    // --- 3. SPIELZUG SENDEN ---
    socket.on('gameAction', (term) => {
        const roomCode = Array.from(socket.rooms).find(room => room !== socket.id);
        
        if (roomCode && activeRooms[roomCode]) {
            const room = activeRooms[roomCode];
            
            // Finde den Sender und den Gegner
            const sender = room.players.find(p => p.id === socket.id);
            const opponent = room.players.find(p => p.id !== socket.id);

            // Prüfen, ob der Sender gerade am Zug ist
            if (room.players[room.currentTurn].id !== socket.id) {
                 socket.emit('error', 'Du bist nicht am Zug!');
                 return;
            }

            // Zug des Raumes wechseln
            room.currentTurn = room.currentTurn === 0 ? 1 : 0; 
            
            if (opponent && sender) {
                // Sende die Aktion an den Gegner und den Sender
                const actionData = { 
                    username: sender.username, 
                    term: term,
                    nextPlayerId: room.players[room.currentTurn].id
                };
                
                io.to(roomCode).emit('opponentAction', actionData); // An alle im Raum senden
            }
        }
    });

    // --- 4. TRENNUNG/DISCONNECT ---
    socket.on('disconnect', () => {
        // ... (Logik zum Entfernen des Spielers) ...
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

