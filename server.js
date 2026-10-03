const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Servir le site
app.use(express.static(path.join(__dirname, "public")));

// File des utilisateurs en attente
let waitingUsers = [];

// Mettre un utilisateur en attente
function addToWaiting(socket) {

    // Éviter les doublons
    if (!waitingUsers.includes(socket)) {
        waitingUsers.push(socket);
    }

    socket.emit("waiting");

    console.log("Utilisateur en attente :", socket.id);
}

// Trouver deux utilisateurs et créer une conversation
function findMatch() {

    // Nettoyer les utilisateurs déconnectés
    waitingUsers = waitingUsers.filter(socket => socket.connected);

    // Tant qu'il y a au moins deux personnes
    while (waitingUsers.length >= 2) {

        const user1 = waitingUsers.shift();
        const user2 = waitingUsers.shift();

        // Créer une conversation privée
        const room = `room-${user1.id}-${user2.id}`;

        user1.join(room);
        user2.join(room);

        // Prévenir les deux personnes
        io.to(room).emit("chatStarted");

        console.log("Chat créé :", room);
    }
}

io.on("connection", (socket) => {

    console.log("Nouvelle connexion :", socket.id);

    // Quelqu'un clique sur "Commencer"
    socket.on("startChat", () => {

        addToWaiting(socket);
        findMatch();
    });

    // Passer la conversation
    socket.on("skipChat", () => {

        const rooms = [...socket.rooms];
        const room = rooms.find(r => r !== socket.id);

        if (room) {

            // Prévenir l'autre personne
            socket.to(room).emit("partnerSkipped");

            // Faire quitter la room à tout le monde
            const roomSockets = io.sockets.adapter.rooms.get(room);

            if (roomSockets) {

                for (const socketId of roomSockets) {

                    const otherSocket = io.sockets.sockets.get(socketId);

                    if (otherSocket) {
                        otherSocket.leave(room);
                    }
                }
            }
        }

        // Remettre celui qui a cliqué dans la file
        addToWaiting(socket);

        // Chercher immédiatement une nouvelle personne
        findMatch();
    });

    // Message envoyé
    socket.on("message", (message) => {

        const rooms = [...socket.rooms];
        const room = rooms.find(r => r !== socket.id);

        if (room) {

            io.to(room).emit("message", {
                text: message,
                sender: socket.id
            });
        }
    });

    // Quelqu'un quitte la page / ferme l'onglet
    socket.on("disconnect", () => {

        console.log("Utilisateur déconnecté :", socket.id);

        // Retirer l'utilisateur de la file d'attente
        waitingUsers = waitingUsers.filter(
            user => user.id !== socket.id
        );

        // Trouver sa conversation
        const rooms = [...socket.rooms];
        const room = rooms.find(r => r !== socket.id);

        if (room) {

            // Prévenir l'autre personne
            socket.to(room).emit("partnerDisconnected");

            console.log("Partenaire parti :", room);
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
