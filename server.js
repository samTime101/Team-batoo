// TEAM BAATO: LETS GOO
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let users = {};

io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    socket.on('register', (data) => {
        users[socket.id] = {
            socketId: socket.id,
            role: data.role,
            publicId: data.id,
            lat: data.lat || null,
            lng: data.lng || null
        };
        socket.emit('currentUsers', Object.values(users));
        socket.broadcast.emit('userJoined', users[socket.id]);
        io.emit('updateUserList', Object.values(users));
    });

    socket.on('updateLocation', (coords) => {
        if (users[socket.id]) {
            users[socket.id].lat = coords.lat;
            users[socket.id].lng = coords.lng;
            // DATA TRANSMISSION
            socket.broadcast.emit('userMoved', {
                socketId: socket.id,
                lat: coords.lat,
                lng: coords.lng,
                role: users[socket.id].role,
                publicId: users[socket.id].publicId
            });
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            io.emit('userLeft', socket.id);
            delete users[socket.id];
            io.emit('updateUserList', Object.values(users));
        }
    });
});

// HOST
server.listen(3000, "0.0.0.0", () => {
    console.log(`Batoo Server running on port 3000`);
});