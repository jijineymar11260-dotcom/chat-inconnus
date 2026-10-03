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

// Personne actuellement en attente
let waitingUser = null;

io.on("connection", (socket) => {
    console.log("Nouvelle connexion :", socket.id);

    // Quelqu'un clique sur "Commencer"
    socket.on("startChat", () => {

        // Si quelqu'un attend déjà
        if (waitingUser && waitingUser.connected) {

            const otherUser = waitingUser;
            waitingUser = null;

            // Création d'une conversation privée
            const room = `room-${otherUser.id}-${socket.id}`;

            otherUser.join(room);
            socket.join(room);

            // Prévenir les deux personnes
            io.to(room).emit("chatStarted");

            console.log("Chat créé :", room);

        } else {

            // Sinon, cette personne attend
            waitingUser = socket;

            socket.emit("waiting");

            console.log("Utilisateur en attente :", socket.id);
        }
    });

    // Message envoyé
    socket.on("message", (message) => {

        if (!socket.rooms) return;

        // Trouver la room de discussion
        const rooms = [...socket.rooms];
        const room = rooms.find(r => r !== socket.id);

        if (room) {
            io.to(room).emit("message", {
                text: message,
                sender: socket.id
            });
        }
    });

    // Déconnexion
    socket.on("disconnect", () => {

        if (waitingUser && waitingUser.id === socket.id) {
            waitingUser = null;
        }

        console.log("Déconnexion :", socket.id);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});