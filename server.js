const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// WICHTIG: Erlaubt dem Frontend (deiner Netlify-Seite), sich zu verbinden
// '*' erlaubt jede Origin-URL (am einfachsten für den Anfang)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Render setzt die Umgebungsvariable 'PORT' automatisch.
const PORT = process.env.PORT || 3000; 

// Einfacher In-Memory Speicher für aktive Räume
// Struktur: { "ABCD": { players: 1, sockets: [socketId], code: "ABCD" } }
const activeRooms = {};

// Funktion zum Generieren eines zufälligen, einzigartigen 4-stelligen Codes
function generateUniqueCode() {
    let code;
    do {
        // Generiert einen 4-stelligen Großbuchstaben-Code
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (activeRooms[code]);
    return code;
}

// Wenn sich ein neuer Client (Spieler) verbindet
io.on('connection', (socket) => {
    console.log(`Neuer Client verbunden: ${socket.id}`);

    // --- 1. RAUM ERSTELLEN ---
    socket.on('createRoom', () => {
        const roomCode = generateUniqueCode();
        socket.join(roomCode); // Client tritt dem Socket.IO-Raum bei
        
        activeRooms[roomCode] = {
            players: 1,
            sockets: [socket.id],
            code: roomCode
        };

        // Informiert den Client (Ersteller), dass der Raum bereit ist
        socket.emit('roomCreated', roomCode);
        console.log(`Raum ${roomCode} erstellt von ${socket.id}`);
    });

    // --- 2. RAUM BEITRETEN ---
    socket.on('joinRoom', (roomCode) => {
        const code = roomCode.toUpperCase();
        const room = activeRooms[code];
        
        if (!room) {
            // Raum existiert nicht
            socket.emit('error', 'Raum existiert nicht.');
            return;
        }

        if (room.players >= 2) {
            // Raum ist voll
            socket.emit('error', 'Raum ist bereits voll.');
            return;
        }

        // Spieler tritt dem Raum bei
        socket.join(code);
        room.players++;
        room.sockets.push(socket.id);
        
        // Informiert den Client (Beitreter), dass er beigetreten ist
        socket.emit('roomJoined', code);
        console.log(`Spieler ${socket.id} ist Raum ${code} beigetreten.`);
        
        // Informiert BEIDE Spieler, dass das Spiel starten kann
        io.to(code).emit('startGame');
    });

    // --- 3. DATENAUSTAUSCH (SPIEL-LOGIK) ---
    // Beispiel: Spieler schickt einen Begriff/Zug an den Gegner
    socket.on('gameAction', (data) => {
        const roomCode = Array.from(socket.rooms).find(room => room !== socket.id);
        if (roomCode) {
            // Sendet die Aktion an ALLE anderen Sockets im Raum (außer dem Sender selbst)
            socket.to(roomCode).emit('opponentAction', data);
        }
    });

    // --- 4. TRENNUNG/DISCONNECT ---
    socket.on('disconnect', () => {
        console.log(`Client getrennt: ${socket.id}`);
        // Finde den Raum, den der getrennte Spieler verlassen hat
        for (const code in activeRooms) {
            const room = activeRooms[code];
            if (room.sockets.includes(socket.id)) {
                // Spieler aus der Liste entfernen
                room.sockets = room.sockets.filter(id => id !== socket.id);
                room.players--;

                if (room.players === 0) {
                    // Wenn der letzte Spieler geht, lösche den Raum
                    delete activeRooms[code];
                    console.log(`Raum ${code} gelöscht.`);
                } else {
                    // Informiere den verbleibenden Spieler
                    socket.to(code).emit('playerDisconnected', 'Dein Gegner hat das Spiel verlassen.');
                }
                break;
            }
        }
    });
});

// Server starten
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});