const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

const server = http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(fs.readFileSync(path.join(__dirname, "index.html")));
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

const wss = new WebSocket.Server({ server });

const BOARD = [
    { name: "GO", price: 0, rent: 0 },
    { name: "Mediterranean Avenue", price: 60, rent: 2 },
    { name: "Community Chest", price: 0, rent: 0 },
    { name: "Baltic Avenue", price: 60, rent: 4 },
    { name: "Income Tax", price: 0, rent: 0 },
    { name: "Reading Railroad", price: 200, rent: 25 },
    { name: "Oriental Avenue", price: 100, rent: 6 },
    { name: "Chance", price: 0, rent: 0 },
    { name: "Vermont Avenue", price: 100, rent: 6 },
    { name: "Connecticut Avenue", price: 120, rent: 8 },
    { name: "Jail", price: 0, rent: 0 },
    { name: "St. Charles Place", price: 140, rent: 10 },
    { name: "Electric Company", price: 150, rent: 10 },
    { name: "States Avenue", price: 140, rent: 10 },
    { name: "Virginia Avenue", price: 160, rent: 12 },
    { name: "Pennsylvania Railroad", price: 200, rent: 25 },
    { name: "St. James Place", price: 180, rent: 14 },
    { name: "Community Chest", price: 0, rent: 0 },
    { name: "Tennessee Avenue", price: 180, rent: 14 },
    { name: "New York Avenue", price: 200, rent: 16 },
    { name: "Free Parking", price: 0, rent: 0 },
    { name: "Kentucky Avenue", price: 220, rent: 18 },
    { name: "Chance", price: 0, rent: 0 },
    { name: "Indiana Avenue", price: 220, rent: 18 },
    { name: "Illinois Avenue", price: 240, rent: 20 },
    { name: "B&O Railroad", price: 200, rent: 25 },
    { name: "Atlantic Avenue", price: 260, rent: 22 },
    { name: "Ventnor Avenue", price: 260, rent: 22 },
    { name: "Water Works", price: 150, rent: 10 },
    { name: "Marvin Gardens", price: 280, rent: 24 },
    { name: "Go To Jail", price: 0, rent: 0 },
    { name: "Pacific Avenue", price: 300, rent: 26 },
    { name: "North Carolina Avenue", price: 300, rent: 26 },
    { name: "Community Chest", price: 0, rent: 0 },
    { name: "Pennsylvania Avenue", price: 320, rent: 28 },
    { name: "Short Line", price: 200, rent: 25 },
    { name: "Chance", price: 0, rent: 0 },
    { name: "Park Place", price: 350, rent: 35 },
    { name: "Luxury Tax", price: 0, rent: 0 },
    { name: "Boardwalk", price: 400, rent: 50 }
];

const PLAYER_COLORS = ["#e53935", "#2196f3", "#43a047", "#f9a825"];
const MAX_PLAYERS = 4;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

// rooms: code -> room
const rooms = new Map();

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function makeCode() {
    let code;

    do {
        code = "";
        for (let i = 0; i < 4; i++) {
            code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        }
    } while (rooms.has(code));

    return code;
}

function createRoom() {
    const code = makeCode();

    const room = {
        code,
        players: new Map(),
        properties: new Map(),
        hostId: null,
        turn: 0,
        started: false
    };

    rooms.set(code, room);
    return room;
}

function roomBroadcast(room, data) {
    for (const ws of wss.clients) {
        if (ws.roomCode === room.code) {
            send(ws, data);
        }
    }
}

function roomLog(room, message) {
    roomBroadcast(room, { type: "log", message });
}

function playerList(room) {
    return [...room.players.values()];
}

function currentPlayer(room) {
    const list = playerList(room);

    if (list.length === 0) {
        return null;
    }

    return list[room.turn % list.length];
}

function roomState(room) {
    return {
        type: "state",
        code: room.code,
        hostId: room.hostId,
        players: playerList(room),
        properties: Object.fromEntries(room.properties),
        turn: room.turn,
        started: room.started
    };
}

function broadcastRoomState(room) {
    roomBroadcast(room, roomState(room));
}

function rollDice() {
    return [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
    ];
}

function nextTurn(room) {
    if (room.players.size === 0) {
        room.turn = 0;
        return;
    }

    room.turn++;

    if (room.turn >= room.players.size) {
        room.turn = 0;
    }
}

function handleLanding(room, player) {
    const tile = BOARD[player.position];

    // GO
    if (player.position === 0) {
        player.money += 200;
        roomLog(room, `${player.name} landed on GO and received $200.`);
        return;
    }

    // Income Tax
    if (tile.name === "Income Tax") {
        player.money -= 200;
        roomLog(room, `${player.name} paid $200 income tax.`);
        return;
    }

    // Luxury Tax
    if (tile.name === "Luxury Tax") {
        player.money -= 100;
        roomLog(room, `${player.name} paid $100 luxury tax.`);
        return;
    }

    // Go To Jail
    if (tile.name === "Go To Jail") {
        player.position = 10;
        roomLog(room, `${player.name} was sent to Jail.`);
        return;
    }

    // Chance / Community Chest
    if (tile.name === "Chance" || tile.name === "Community Chest") {
        const amounts = [-100, -50, 50, 100, 150, 200];
        const amount = amounts[Math.floor(Math.random() * amounts.length)];

        player.money += amount;

        if (amount >= 0) {
            roomLog(room, `${player.name} received $${amount}.`);
        } else {
            roomLog(room, `${player.name} paid $${-amount}.`);
        }

        return;
    }

    // Property
    if (tile.price > 0) {
        let property = room.properties.get(player.position);

        if (!property) {
            property = { owner: null, price: tile.price, rent: tile.rent };
            room.properties.set(player.position, property);
        }

        if (property.owner && property.owner !== player.id) {
            const owner = room.players.get(property.owner);

            if (owner) {
                player.money -= property.rent;
                owner.money += property.rent;

                roomLog(
                    room,
                    `${player.name} paid $${property.rent} rent to ${owner.name}.`
                );
            }
        }
    }
}

function handleRoll(ws, room) {
    const player = room.players.get(ws.id);

    if (!player || !room.started) {
        return;
    }

    const current = currentPlayer(room);

    if (!current || current.id !== player.id) {
        return;
    }

    const [d1, d2] = rollDice();
    const total = d1 + d2;
    const oldPosition = player.position;

    player.position = (player.position + total) % BOARD.length;

    if (player.position < oldPosition) {
        player.money += 200;
        roomLog(room, `${player.name} passed GO and collected $200.`);
    }

    roomBroadcast(room, { type: "dice", d1, d2 });
    roomLog(room, `${player.name} rolled ${d1} + ${d2} = ${total}.`);

    handleLanding(room, player);
    broadcastRoomState(room);

    // Doubles
    if (d1 === d2) {
        roomLog(room, `${player.name} rolled doubles and gets another turn!`);
        return;
    }

    nextTurn(room);

    const next = currentPlayer(room);

    if (next) {
        roomLog(room, `${next.name}'s turn.`);
    }

    broadcastRoomState(room);
}

function handleBuy(ws, room) {
    const player = room.players.get(ws.id);

    if (!player || !room.started) {
        return;
    }

    const current = currentPlayer(room);

    if (!current || current.id !== player.id) {
        return;
    }

    const position = player.position;
    const tile = BOARD[position];

    if (tile.price <= 0) {
        return;
    }

    let property = room.properties.get(position);

    if (!property) {
        property = { owner: null, price: tile.price, rent: tile.rent };
        room.properties.set(position, property);
    }

    if (property.owner !== null) {
        return;
    }

    if (player.money < tile.price) {
        roomLog(room, `${player.name} cannot afford ${tile.name}.`);
        return;
    }

    player.money -= tile.price;
    property.owner = player.id;

    roomLog(room, `${player.name} bought ${tile.name} for $${tile.price}.`);
    broadcastRoomState(room);
}

function addPlayerToRoom(ws, room, name) {
    let finalName = String(name || "Player").slice(0, 20);

    const existingNames = playerList(room).map(p => p.name);

    if (existingNames.includes(finalName)) {
        finalName += Math.floor(Math.random() * 100);
    }

    const player = {
        id: ws.id,
        name: finalName,
        money: 1500,
        position: 0,
        color: PLAYER_COLORS[room.players.size]
    };

    room.players.set(ws.id, player);
    ws.roomCode = room.code;

    if (!room.hostId) {
        room.hostId = ws.id;
    }

    return player;
}

function handleHost(ws, data) {
    if (ws.roomCode) {
        return;
    }

    const room = createRoom();
    const player = addPlayerToRoom(ws, room, data.name);

    send(ws, { type: "joined", id: ws.id, code: room.code });
    roomLog(room, `${player.name} created the room.`);
    broadcastRoomState(room);
}

function handleJoin(ws, data) {
    if (ws.roomCode) {
        return;
    }

    const code = String(data.code || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
        send(ws, { type: "error", message: "Room not found." });
        return;
    }

    if (room.started) {
        send(ws, { type: "error", message: "That game has already started." });
        return;
    }

    if (room.players.size >= MAX_PLAYERS) {
        send(ws, { type: "error", message: "Room is full." });
        return;
    }

    const player = addPlayerToRoom(ws, room, data.name);

    send(ws, { type: "joined", id: ws.id, code: room.code });
    roomLog(room, `${player.name} joined the room.`);
    broadcastRoomState(room);
}

function handleStart(ws) {
    const room = rooms.get(ws.roomCode);

    if (!room || room.started) {
        return;
    }

    if (ws.id !== room.hostId) {
        send(ws, { type: "error", message: "Only the host can start the game." });
        return;
    }

    if (room.players.size < 2) {
        send(ws, { type: "error", message: "Need at least 2 players to start." });
        return;
    }

    room.started = true;
    room.turn = 0;

    const current = currentPlayer(room);

    roomLog(room, `Game started! ${current.name} goes first.`);
    broadcastRoomState(room);
}

function handleDisconnect(ws) {
    const room = rooms.get(ws.roomCode);

    if (!room) {
        return;
    }

    const player = room.players.get(ws.id);

    if (!player) {
        return;
    }

    // Release properties
    for (const property of room.properties.values()) {
        if (property.owner === ws.id) {
            property.owner = null;
        }
    }

    room.players.delete(ws.id);

    if (room.players.size === 0) {
        rooms.delete(room.code);
        return;
    }

    if (room.hostId === ws.id) {
        room.hostId = playerList(room)[0].id;
    }

    if (room.started && room.players.size < 2) {
        room.started = false;
        room.turn = 0;
        roomLog(room, "Not enough players left. Waiting for more to join.");
    } else if (room.turn >= room.players.size) {
        room.turn = 0;
    }

    roomLog(room, `${player.name} left the room.`);
    broadcastRoomState(room);
}

wss.on("connection", ws => {
    ws.id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ws.roomCode = null;

    console.log("Client connected:", ws.id);

    ws.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw);
        } catch {
            return;
        }

        if (data.type === "host") {
            handleHost(ws, data);
            return;
        }

        if (data.type === "join") {
            handleJoin(ws, data);
            return;
        }

        const room = rooms.get(ws.roomCode);

        if (!room) {
            return;
        }

        if (data.type === "start") {
            handleStart(ws);
        }

        if (data.type === "roll") {
            handleRoll(ws, room);
        }

        if (data.type === "buy") {
            handleBuy(ws, room);
        }
    });

    ws.on("close", () => {
        handleDisconnect(ws);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`
========================================
        WebSocket Monopoly
========================================

Listening on:
http://${HOST}:${PORT}

Port:
${PORT}

WebSocket:
ws://${HOST}:${PORT}
`);
});
