const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Deck, getTrickWinner, getValidPlays, calculateScores } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const games = {};

app.use(express.static('client'));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- Lobby Management ---
    socket.on('createGame', ({ username, players, winScore }) => {
        const gameCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(gameCode);
        games[gameCode] = {
            host: socket.id,
            players: [{ id: socket.id, username, isHost: true }],
            maxPlayers: parseInt(players, 10),
            winScore: parseInt(winScore, 10),
            gameState: 'lobby',
            teams: [],
            scores: [{ name: 'Team 1', score: 0, bags: 0 }, { name: 'Team 2', score: 0, bags: 0 }]
        };
        socket.emit('gameCreated', { gameCode, gameState: games[gameCode] });
    });

    socket.on('joinGame', ({ gameCode, username }) => {
        const game = games[gameCode];
        if (!game) return socket.emit('error', 'Game not found.');
        
        const disconnectedPlayer = game.players.find(p => p.disconnected && p.username === username);
        if (disconnectedPlayer) {
            disconnectedPlayer.disconnected = false;
            disconnectedPlayer.id = socket.id;
            socket.join(gameCode);
            socket.emit('gameJoined', { gameCode, gameState: game });
            io.to(gameCode).emit('updateLobby', game);
            return;
        }

        if (game.players.length >= game.maxPlayers) return socket.emit('error', 'Game is full.');

        socket.join(gameCode);
        game.players.push({ id: socket.id, username });
        socket.emit('gameJoined', { gameCode, gameState: game });
        io.to(gameCode).emit('updateLobby', game);
    });
    
    socket.on('kickPlayer', ({ gameCode, playerId }) => {
        const game = games[gameCode];
        if (!game || game.host !== socket.id) return;
        game.players = game.players.filter(p => p.id !== playerId);
        io.to(gameCode).emit('updateLobby', game);
        const kickedSocket = io.sockets.sockets.get(playerId);
        if (kickedSocket) {
            kickedSocket.leave(gameCode);
            kickedSocket.emit('kicked');
        }
    });
    
    // --- Game Flow ---
    socket.on('startGame', (gameCode) => {
        const game = games[gameCode];
        if (!game || game.host !== socket.id) return socket.emit('error', 'Only the host can start.');
        if (game.players.length !== game.maxPlayers) return socket.emit('error', 'Lobby is not full.');
        startNewRound(game, gameCode);
    });

    socket.on('submitBid', ({ gameCode, bid }) => {
        const game = games[gameCode];
        if (!game || game.gameState !== 'bidding') return;
        const playerIndex = game.bidding.currentPlayerIndex;
        const player = game.players[playerIndex];
        if (player.id !== socket.id) return;

        player.bid = bid;
        game.bidding.bids[player.id] = bid;
        io.to(gameCode).emit('bidPlaced', { playerId: player.id, bid });

        game.bidding.currentPlayerIndex++;
        if (game.bidding.currentPlayerIndex >= game.players.length) {
            game.gameState = 'playing';
            io.to(gameCode).emit('biddingEnded', { bids: game.bidding.bids, players: game.players });
            startTrick(game, gameCode, game.players[0].id);
        } else {
            const nextBiddingPlayer = game.players[game.bidding.currentPlayerIndex];
            io.to(gameCode).emit('nextBidder', { biddingPlayerId: nextBiddingPlayer.id, players: game.players });
        }
    });

    socket.on('playCard', ({ gameCode, card }) => {
        const game = games[gameCode];
        if (!game || game.gameState !== 'playing') return;
        const player = game.players.find(p => p.id === socket.id);
        if (!player || player.id !== game.currentTurn.playerId) return;

        const leadSuit = game.currentTrick.length > 0 ? game.currentTrick[0].card.suit : null;
        const validPlays = getValidPlays(player.hand, leadSuit, game.spadesBroken);
        if (!validPlays.some(c => c.suit === card.suit && c.value === card.value)) {
            return socket.emit('error', 'Invalid card played.');
        }

        player.hand = player.hand.filter(c => !(c.suit === card.suit && c.value === card.value));
        game.currentTrick.push({ card, playerId: player.id });

        if (card.suit === '♠') game.spadesBroken = true;

        io.to(gameCode).emit('cardPlayed', { card, playerId: player.id, handSize: player.hand.length });

        if (game.currentTrick.length === game.players.length) {
            const winner = getTrickWinner(game.currentTrick);
            const winningPlayer = game.players.find(p => p.id === winner.playerId);
            winningPlayer.tricksWon++;

            io.to(gameCode).emit('trickWon', { winner });

            setTimeout(() => {
                if (winningPlayer.hand.length === 0) {
                    const roundScores = calculateScores(game);
                    io.to(gameCode).emit('roundEnded', { scores: game.scores, roundScores, teams: game.teams });
                    
                    const winnerTeam = game.scores.findIndex(s => s.score >= game.winScore);
                    if (winnerTeam !== -1) {
                        game.gameState = 'finished';
                        io.to(gameCode).emit('gameOver', { winner: game.teams[winnerTeam].name, scores: game.scores });
                        setTimeout(() => delete games[gameCode], 60000);
                    } else {
                        setTimeout(() => startNewRound(game, gameCode), 5000);
                    }
                } else {
                    startTrick(game, gameCode, winner.playerId);
                }
            }, 2500);
        } else {
            const currentPlayerIndex = game.players.findIndex(p => p.id === player.id);
            const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
            setNextTurn(game, gameCode, game.players[nextPlayerIndex].id);
        }
    });

    // --- Disconnect Logic ---
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const gameCode in games) {
            const game = games[gameCode];
            const player = game.players.find(p => p.id === socket.id);
            if (player) {
                if (game.gameState === 'lobby') {
                    game.players = game.players.filter(p => p.id !== socket.id);
                } else {
                    player.disconnected = true;
                }
                if (player.isHost && game.players.some(p => !p.disconnected)) {
                    const newHost = game.players.find(p => !p.disconnected);
                    if (newHost) {
                        newHost.isHost = true;
                        game.host = newHost.id;
                    }
                }
                io.to(gameCode).emit('playerDisconnected', { playerId: socket.id, gameState: game });
                io.to(gameCode).emit('updateLobby', game);
                if (game.players.every(p => p.disconnected) || game.players.length === 0) {
                    delete games[gameCode];
                }
                break;
            }
        }
    });
});

// --- Game Flow Helper Functions ---
function startNewRound(game, gameCode) {
    game.gameState = 'bidding';
    game.spadesBroken = false;
    
    // Assign teams if first round
    if (game.teams.length === 0) {
        const team1 = { name: 'Team 1', players: [] };
        const team2 = { name: 'Team 2', players: [] };
        game.players.forEach((p, i) => {
            p.team = i % 2 === 0 ? 'Team 1' : 'Team 2';
            (i % 2 === 0 ? team1.players : team2.players).push(p.id);
        });
        game.teams = [team1, team2];
    }
    
    game.players.forEach(p => { p.bid = null; p.tricksWon = 0; });
    
    const deck = new Deck();
    const hands = deck.deal(game.players);
    game.players.forEach((p, i) => { p.hand = hands[i]; });
    
    game.bidding = { currentPlayerIndex: 0, bids: {} };
    
    game.players.forEach(player => {
        io.to(player.id).emit('dealHand', { hand: player.hand, teams: game.teams, players: game.players, scores: game.scores });
    });
    
    io.to(gameCode).emit('startBidding', { biddingPlayerId: game.players[0].id, teams: game.teams, players: game.players });
}

function startTrick(game, gameCode, startingPlayerId) {
    game.currentTrick = [];
    io.to(gameCode).emit('newTrick', { startingPlayerId });
    setNextTurn(game, gameCode, startingPlayerId);
}

function setNextTurn(game, gameCode, playerId) {
    const player = game.players.find(p => p.id === playerId);
    game.currentTurn = { playerId: player.id, username: player.username };
    const leadSuit = game.currentTrick.length > 0 ? game.currentTrick[0].card.suit : null;
    const validPlays = getValidPlays(player.hand, leadSuit, game.spadesBroken);
    io.to(player.id).emit('yourTurn', { validPlays });
    io.to(gameCode).emit('nextTurn', { nextPlayerId: player.id });
}

server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));