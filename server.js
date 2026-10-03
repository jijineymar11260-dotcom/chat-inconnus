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

// Ajouter un utilisateur à la file d'attente
function addToWaiting(socket) {

    // Éviter les doublons
    if (!waitingUsers.includes(socket)) {
        waitingUsers.push(socket);
    }

    socket.emit("waiting");

    console.log("Utilisateur en attente :", socket.id);
}

// Chercher deux utilisateurs à mettre ensemble
function findMatch() {

    // Retirer les utilisateurs déconnectés
    waitingUsers = waitingUsers.filter(socket => socket.connected);

    while (waitingUsers.length >= 2) {

        const user1 = waitingUsers.shift();
        const user2 = waitingUsers.shift();

        // Créer une room privée
        const room = `room-${user1.id}-${user2.id}`;

        user1.join(room);
        user2.join(room);

        // Dire aux deux utilisateurs que la conversation commence
        io.to(room).emit("chatStarted");

        console.log("Chat créé :", room);
    }
}

io.on("connection", (socket) => {

    console.log("Nouvelle connexion :", socket.id);

    // L'utilisateur clique sur "Commencer"
    socket.on("startChat", () => {

        addToWaiting(socket);
        findMatch();
    });

    // L'utilisateur clique sur "Passer"
    socket.on("skipChat", () => {

        // Trouver la room actuelle
        const rooms = [...socket.rooms];
        const room = rooms.find(r => r !== socket.id);

        if (room) {

            // Prévenir l'autre utilisateur
            socket.to(room).emit("partnerSkipped");

            // Faire sortir tout le monde de la room
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

        // Remettre l'utilisateur dans la file
        addToWaiting(socket);

        // Chercher immédiatement quelqu'un
        findMatch();
    });

    // Envoyer un message
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

    // L'utilisateur quitte la page / ferme l'onglet
    socket.on("disconnecting", () => {

        console.log("Utilisateur quitte la page :", socket.id);

        // Retirer l'utilisateur de la file d'attente
        waitingUsers = waitingUsers.filter(
            user => user.id !== socket.id
        );

        // IMPORTANT :
        // "disconnecting" arrive avant que Socket.IO
        // retire la socket de ses rooms.
        const rooms = [...socket.rooms];
        const room = rooms.find(r => r !== socket.id);

        if (room) {

            // Prévenir l'autre utilisateur
            socket.to(room).emit("partnerDisconnected");

            console.log("Partenaire déconnecté :", room);
        }
    });

    // Déconnexion terminée
    socket.on("disconnect", () => {

        console.log("Déconnexion terminée :", socket.id);

        // Nettoyage supplémentaire de la file
        waitingUsers = waitingUsers.filter(
            user => user.id !== socket.id
        );
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
