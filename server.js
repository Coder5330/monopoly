const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

const server = http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, {
            "Content-Type": "text/html"
        });

        res.end(fs.readFileSync(
            path.join(__dirname, "index.html")
        ));
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

const players = new Map();

const properties = new Map();

let turn = 0;
let started = false;

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    for (const ws of wss.clients) {
        send(ws, data);
    }
}

function playerList() {
    return [...players.values()];
}

function currentPlayer() {
    const list = playerList();

    if (list.length === 0)
        return null;

    return list[turn];
}

function state() {
    return {
        type: "state",
        players: playerList(),
        properties: Object.fromEntries(properties),
        turn,
        started
    };
}

function log(message) {
    broadcast({
        type: "log",
        message
    });
}

function broadcastState() {
    broadcast(state());
}

function rollDice() {
    return [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
    ];
}

function nextTurn() {
    if (players.size === 0) {
        turn = 0;
        return;
    }

    turn++;

    if (turn >= players.size) {
        turn = 0;
    }
}

function handleLanding(player) {
    const tile = BOARD[player.position];

    // GO
    if (player.position === 0) {
        player.money += 200;

        log(`${player.name} landed on GO and received $200.`);
        return;
    }

    // Income Tax
    if (tile.name === "Income Tax") {
        player.money -= 200;

        log(`${player.name} paid $200 income tax.`);
        return;
    }

    // Luxury Tax
    if (tile.name === "Luxury Tax") {
        player.money -= 100;

        log(`${player.name} paid $100 luxury tax.`);
        return;
    }

    // Go To Jail
    if (tile.name === "Go To Jail") {
        player.position = 10;

        log(`${player.name} was sent to Jail.`);
        return;
    }

    // Chance / Community Chest
    if (
        tile.name === "Chance" ||
        tile.name === "Community Chest"
    ) {
        const amounts = [-100, -50, 50, 100, 150, 200];

        const amount =
            amounts[Math.floor(Math.random() * amounts.length)];

        player.money += amount;

        if (amount >= 0) {
            log(`${player.name} received $${amount}.`);
        } else {
            log(`${player.name} paid $${-amount}.`);
        }

        return;
    }

    // Property
    if (tile.price > 0) {
        let property = properties.get(player.position);

        if (!property) {
            property = {
                owner: null,
                price: tile.price,
                rent: tile.rent
            };

            properties.set(player.position, property);
        }

        if (
            property.owner &&
            property.owner !== player.id
        ) {
            const owner = players.get(property.owner);

            if (owner) {
                player.money -= property.rent;
                owner.money += property.rent;

                log(
                    `${player.name} paid ` +
                    `$${property.rent} rent to ` +
                    `${owner.name}.`
                );
            }
        }
    }
}

function handleRoll(ws) {
    const player = players.get(ws.id);

    if (!player || !started)
        return;

    const current = currentPlayer();

    if (!current || current.id !== player.id)
        return;

    const [d1, d2] = rollDice();

    const total = d1 + d2;

    const oldPosition = player.position;

    player.position =
        (player.position + total) % BOARD.length;

    if (player.position < oldPosition) {
        player.money += 200;

        log(
            `${player.name} passed GO and collected $200.`
        );
    }

    broadcast({
        type: "dice",
        d1,
        d2
    });

    log(
        `${player.name} rolled ${d1} + ${d2} = ${total}.`
    );

    handleLanding(player);

    broadcastState();

    // Doubles
    if (d1 === d2) {
        log(
            `${player.name} rolled doubles and gets another turn!`
        );

        return;
    }

    nextTurn();

    const next = currentPlayer();

    if (next) {
        log(`${next.name}'s turn.`);
    }

    broadcastState();
}

function handleBuy(ws) {
    const player = players.get(ws.id);

    if (!player || !started)
        return;

    const current = currentPlayer();

    if (!current || current.id !== player.id)
        return;

    const position = player.position;

    const tile = BOARD[position];

    if (tile.price <= 0)
        return;

    let property = properties.get(position);

    if (!property) {
        property = {
            owner: null,
            price: tile.price,
            rent: tile.rent
        };

        properties.set(position, property);
    }

    if (property.owner !== null)
        return;

    if (player.money < tile.price) {
        log(
            `${player.name} cannot afford ${tile.name}.`
        );

        return;
    }

    player.money -= tile.price;

    property.owner = player.id;

    log(
        `${player.name} bought ${tile.name} for $${tile.price}.`
    );

    broadcastState();
}

wss.on("connection", ws => {

    ws.id =
        Math.random().toString(36).slice(2) +
        Date.now().toString(36);

    console.log("Client connected:", ws.id);

    send(ws, {
        type: "state",
        players: playerList(),
        properties: Object.fromEntries(properties),
        turn,
        started
    });

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(raw);
        } catch {
            return;
        }

        if (data.type === "join") {

            if (players.size >= 4) {
                send(ws, {
                    type: "error",
                    message: "Game is full."
                });

                return;
            }

            let name =
                String(data.name || "Player")
                    .slice(0, 20);

            const existingNames =
                playerList().map(p => p.name);

            if (existingNames.includes(name)) {
                name +=
                    Math.floor(
                        Math.random() * 100
                    );
            }

            const colors = [
                "#e53935",
                "#2196f3",
                "#43a047",
                "#f9a825"
            ];

            const player = {
                id: ws.id,
                name,
                money: 1500,
                position: 0,
                color: colors[players.size]
            };

            players.set(ws.id, player);

            log(`${name} joined the game.`);

            if (players.size >= 2) {
                started = true;

                const current = currentPlayer();

                log(
                    `Game started! ${current.name} goes first.`
                );
            }

            broadcastState();
        }

        if (data.type === "roll") {
            handleRoll(ws);
        }

        if (data.type === "buy") {
            handleBuy(ws);
        }
    });

    ws.on("close", () => {

        const player = players.get(ws.id);

        if (!player)
            return;

        const name = player.name;

        // Release properties
        for (const property of properties.values()) {
            if (property.owner === ws.id) {
                property.owner = null;
            }
        }

        players.delete(ws.id);

        if (players.size === 0) {
            turn = 0;
            started = false;
        } else if (turn >= players.size) {
            turn = 0;
        }

        log(`${name} left the game.`);

        broadcastState();
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
