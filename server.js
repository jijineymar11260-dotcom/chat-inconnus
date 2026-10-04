const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURATION
// =====================================================

const MAX_USERS = 500;
const MAX_MESSAGE_LENGTH = 500;

// =====================================================
// SERVIR LE SITE
// =====================================================

app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// UTILISATEURS EN ATTENTE
// =====================================================

let waitingUsers = [];

// =====================================================
// COMPTEURS
// =====================================================

function getStats() {

    const connectedUsers = io.sockets.sockets.size;

    const searchingUsers =
        waitingUsers.filter(
            socket => socket.connected
        ).length;

    const usersInDiscussion =
        connectedUsers - searchingUsers;

    return {
        searching: searchingUsers,
        chatting: Math.max(0, usersInDiscussion),
        total: connectedUsers
    };
}

// Envoyer les statistiques à tout le monde
function broadcastStats() {

    io.emit("stats", getStats());
}

// =====================================================
// AJOUTER UN UTILISATEUR À LA RECHERCHE
// =====================================================

function addToWaiting(socket) {

    // Éviter les doublons
    if (!waitingUsers.includes(socket)) {

        waitingUsers.push(socket);

    }

    socket.emit("waiting");

    console.log(
        "Utilisateur en attente :",
        socket.id
    );

    broadcastStats();
}

// =====================================================
// CHERCHER DEUX UTILISATEURS
// =====================================================

function findMatch() {

    // Retirer les utilisateurs déconnectés
    waitingUsers =
        waitingUsers.filter(
            socket => socket.connected
        );

    while (waitingUsers.length >= 2) {

        const user1 =
            waitingUsers.shift();

        const user2 =
            waitingUsers.shift();

        // Vérification de sécurité
        if (
            !user1.connected ||
            !user2.connected
        ) {
            continue;
        }

        // Créer une conversation privée
        const room =
            `room-${user1.id}-${user2.id}`;

        user1.join(room);
        user2.join(room);

        // Prévenir les deux utilisateurs
        io.to(room).emit("chatStarted");

        console.log(
            "Chat créé :",
            room
        );
    }

    broadcastStats();
}

// =====================================================
// NOUVELLE CONNEXION
// =====================================================

io.on("connection", (socket) => {

    console.log(
        "Nouvelle connexion :",
        socket.id
    );

    // Vérifier la limite
    if (io.sockets.sockets.size > MAX_USERS) {

        socket.emit(
            "serverFull"
        );

        socket.disconnect();

        return;
    }

    broadcastStats();

    // =================================================
    // COMMENCER UNE RECHERCHE
    // =================================================

    socket.on("startChat", () => {

        // Vérifier que l'utilisateur
        // n'est pas déjà dans une conversation
        const rooms = [...socket.rooms];

        const currentRoom =
            rooms.find(
                room => room !== socket.id
            );

        if (currentRoom) {
            return;
        }

        // Éviter les doublons dans la file
        if (waitingUsers.includes(socket)) {
            return;
        }

        addToWaiting(socket);

        findMatch();
    });

    // =================================================
    // PASSER À UNE AUTRE PERSONNE
    // =================================================

    socket.on("skipChat", () => {

        // Retirer l'utilisateur de la file
        waitingUsers =
            waitingUsers.filter(
                user => user.id !== socket.id
            );

        const rooms = [...socket.rooms];

        const room =
            rooms.find(
                r => r !== socket.id
            );

        if (room) {

            // Prévenir l'autre personne
            socket
                .to(room)
                .emit("partnerSkipped");

            // Faire sortir les deux utilisateurs
            const roomSockets =
                io.sockets.adapter.rooms.get(room);

            if (roomSockets) {

                for (const socketId of roomSockets) {

                    const otherSocket =
                        io.sockets.sockets.get(
                            socketId
                        );

                    if (otherSocket) {

                        otherSocket.leave(room);

                    }
                }
            }
        }

        // Remettre l'utilisateur en recherche
        addToWaiting(socket);

        // Chercher immédiatement quelqu'un
        findMatch();
    });

    // =================================================
    // ENVOYER UN MESSAGE
    // =================================================

    socket.on("message", (message) => {

        // Vérifier que c'est bien une chaîne
        if (typeof message !== "string") {
            return;
        }

        // Nettoyer le message
        message = message.trim();

        // Ignorer les messages vides
        if (!message) {
            return;
        }

        // Limiter la taille côté serveur
        if (
            message.length >
            MAX_MESSAGE_LENGTH
        ) {
            message =
                message.substring(
                    0,
                    MAX_MESSAGE_LENGTH
                );
        }

        const rooms = [...socket.rooms];

        const room =
            rooms.find(
                r => r !== socket.id
            );

        if (room) {

            io.to(room).emit(
                "message",
                {
                    text: message,
                    sender: socket.id
                }
            );
        }
    });

    // =================================================
    // FERMETURE DE PAGE / ONGLET
    // =================================================

    socket.on("disconnecting", () => {

        console.log(
            "Utilisateur quitte la page :",
            socket.id
        );

        // Retirer de la file d'attente
        waitingUsers =
            waitingUsers.filter(
                user =>
                    user.id !== socket.id
            );

        // La socket est encore dans
        // sa room à ce moment-là
        const rooms = [...socket.rooms];

        const room =
            rooms.find(
                r => r !== socket.id
            );

        if (room) {

            // Prévenir l'autre personne
            socket
                .to(room)
                .emit(
                    "partnerDisconnected"
                );

            console.log(
                "Partenaire déconnecté :",
                room
            );
        }

        broadcastStats();
    });

    // =================================================
    // DÉCONNEXION TERMINÉE
    // =================================================

    socket.on("disconnect", () => {

        console.log(
            "Déconnexion terminée :",
            socket.id
        );

        waitingUsers =
            waitingUsers.filter(
                user =>
                    user.id !== socket.id
            );

        broadcastStats();
    });
});

// =====================================================
// LANCEMENT DU SERVEUR
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Serveur lancé sur le port ${PORT}`
        );

        console.log(
            `Limite maximale : ${MAX_USERS} utilisateurs`
        );
    }
);
