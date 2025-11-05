const socket = io();

// --- DOM Elements ---
const screens = {
    home: document.getElementById('home-screen'),
    options: document.getElementById('create-game-options'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-board')
};
const usernameInput = document.getElementById('username-input'),
      createGameBtn = document.getElementById('create-game-btn'),
      joinGameBtn = document.getElementById('join-game-btn'),
      gameCodeInput = document.getElementById('game-code-input'),
      confirmCreateBtn = document.getElementById('confirm-create-btn'),
      playerCountSelect = document.getElementById('player-count'),
      winScoreSelect = document.getElementById('win-score'),
      gameCodeDisplay = document.getElementById('game-code-display'),
      playerList = document.getElementById('player-list'),
      playerCurrentCount = document.getElementById('player-current-count'),
      playerMaxCount = document.getElementById('player-max-count'),
      startGameBtn = document.getElementById('start-game-btn'),
      errorMessage = document.getElementById('error-message'),
      scoreboard = document.getElementById('scoreboard'),
      table = document.getElementById('table'),
      playerHandDiv = document.getElementById('player-hand'),
      biddingControls = document.getElementById('bidding-controls'),
      bidSelect = document.getElementById('bid-select'),
      submitBidBtn = document.getElementById('submit-bid-btn'),
      gameInfo = document.getElementById('game-info');

let myGameCode = '', myPlayerId = '';

// --- Navigation ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[screenName]) screens[screenName].classList.remove('hidden');
}

// --- Event Listeners ---
createGameBtn.addEventListener('click', () => { if (validateUsername()) showScreen('options'); });
confirmCreateBtn.addEventListener('click', () => socket.emit('createGame', { username: usernameInput.value, players: playerCountSelect.value, winScore: winScoreSelect.value }));
joinGameBtn.addEventListener('click', () => { if (validateUsername()) socket.emit('joinGame', { gameCode: gameCodeInput.value.toUpperCase(), username: usernameInput.value }); });
startGameBtn.addEventListener('click', () => socket.emit('startGame', myGameCode));
submitBidBtn.addEventListener('click', () => {
    socket.emit('submitBid', { gameCode: myGameCode, bid: parseInt(bidSelect.value, 10) });
    biddingControls.classList.add('hidden');
});

// --- Socket Handlers ---
socket.on('connect', () => { myPlayerId = socket.id; });
socket.on('error', msg => { errorMessage.textContent = msg; setTimeout(() => errorMessage.textContent = '', 3000); });
socket.on('kicked', () => { alert('You have been kicked.'); resetToHomeScreen(); });

socket.on('gameCreated', ({ gameCode, gameState }) => { myGameCode = gameCode; showLobby(gameCode, gameState); });
socket.on('gameJoined', ({ gameCode, gameState }) => { myGameCode = gameCode; showLobby(gameCode, gameState); });
socket.on('updateLobby', updateLobbyView);
socket.on('playerDisconnected', ({ playerId, gameState }) => {
    updateLobbyView(gameState);
    const spot = document.getElementById(`player-spot-${playerId}`);
    if (spot) spot.classList.add('disconnected');
});

socket.on('dealHand', ({ hand, teams, players, scores }) => {
    showScreen('game');
    renderHand(hand);
    setupTable(players);
    updateScoreboard(scores, teams);
});

socket.on('startBidding', ({ biddingPlayerId, players }) => {
    updatePlayerInfo(players);
    const bidder = players.find(p => p.id === biddingPlayerId);
    gameInfo.textContent = `Waiting for ${bidder.username} to bid...`;
    if (biddingPlayerId === myPlayerId) {
        showBiddingControls(players.length);
        gameInfo.textContent = 'Your turn to bid.';
    }
});

socket.on('bidPlaced', ({ playerId, bid }) => {
    updatePlayerInfo([{ id: playerId, bid }]);
});

socket.on('nextBidder', ({ biddingPlayerId, players }) => {
    const bidder = players.find(p => p.id === biddingPlayerId);
    gameInfo.textContent = `Waiting for ${bidder.username} to bid...`;
    if (biddingPlayerId === myPlayerId) {
        showBiddingControls(players.length);
        gameInfo.textContent = 'Your turn to bid.';
    }
});

socket.on('biddingEnded', ({ bids, players }) => {
    gameInfo.textContent = 'Bidding complete! First trick begins...';
    updatePlayerInfo(players);
});

socket.on('yourTurn', ({ validPlays }) => {
    gameInfo.textContent = "It's your turn!";
    highlightValidCards(validPlays);
});

socket.on('nextTurn', ({ nextPlayerId }) => {
    highlightValidCards([]);
    const player = document.querySelector(`.player-spot[data-id='${nextPlayerId}'] .username`);
    gameInfo.textContent = `Waiting for ${player ? player.textContent : '...'}...`;
});

socket.on('cardPlayed', ({ card, playerId, handSize }) => {
    if (playerId === myPlayerId) {
        const cardToRemove = document.querySelector(`.card[data-suit='${card.suit}'][data-value='${card.value}']`);
        if (cardToRemove) cardToRemove.remove();
    } else {
        const spot = document.getElementById(`player-spot-${playerId}`);
        if(spot) spot.querySelector('.card-count').textContent = `${handSize} cards`;
    }
    displayCardOnTable(card, playerId);
});

socket.on('newTrick', ({ startingPlayerId }) => {
    table.querySelectorAll('.played-card-container').forEach(c => c.innerHTML = '');
    gameInfo.textContent = 'New trick!';
});

socket.on('trickWon', ({ winner }) => {
    const winnerName = winner.playerId === myPlayerId ? 'You' : document.querySelector(`.player-spot[data-id='${winner.playerId}'] .username`).textContent;
    gameInfo.textContent = `${winnerName} won the trick!`;
    const winningCardEl = document.getElementById(`played-card-${winner.playerId}`);
    if (winningCardEl) winningCardEl.classList.add('winning-card');
    setTimeout(() => winningCardEl?.classList.remove('winning-card'), 2000);
});

socket.on('roundEnded', ({ scores, roundScores, teams }) => {
    let summary = 'Round Over!\n' + teams.map((t, i) => `${t.name}: ${roundScores[i]} pts (Total: ${scores[i].score})`).join('\n');
    gameInfo.textContent = 'Round over! Calculating scores...';
    setTimeout(() => {
        alert(summary);
        gameInfo.textContent = 'Starting new round...';
    }, 1000);
    updateScoreboard(scores, teams);
});

socket.on('gameOver', ({ winner, scores }) => {
    screens.game.innerHTML = `<div class="game-over-screen"><h2>Game Over!</h2><h3>${winner} wins!</h3>
        <div class="final-scores"><div>Final Score:</div>
        ${scores.map(s => `<div>${s.name}: ${s.score}</div>`).join('')}</div>
        <button onclick="window.location.reload()">Play Again</button></div>`;
});

// --- UI Rendering ---
function renderHand(hand) {
    playerHandDiv.innerHTML = '';
    hand.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card suit-${card.suit}`;
        cardDiv.dataset.suit = card.suit;
        cardDiv.dataset.value = card.value;
        cardDiv.innerHTML = `<span>${card.value}</span><span>${card.suit}</span>`;
        cardDiv.addEventListener('click', () => {
            if (cardDiv.classList.contains('playable')) socket.emit('playCard', { gameCode: myGameCode, card });
        });
        playerHandDiv.appendChild(cardDiv);
    });
}

function highlightValidCards(validCards) {
    playerHandDiv.querySelectorAll('.card').forEach(c => c.classList.toggle('playable', validCards.some(vc => vc.suit === c.dataset.suit && vc.value === c.dataset.value)));
}

function setupTable(players) {
    table.innerHTML = '';
    const numPlayers = players.length;
    const myPlayerIndex = players.findIndex(p => p.id === myPlayerId);
    
    players.forEach((player, index) => {
        const angle = (index - myPlayerIndex) * (2 * Math.PI / numPlayers);
        const x = 50 + 45 * Math.sin(angle);
        const y = 50 - 45 * Math.cos(angle);
        
        if (player.id === myPlayerId) { // My spot is for played card only
            const mySpot = document.createElement('div');
            mySpot.id = `played-card-${myPlayerId}`;
            mySpot.className = 'played-card-container';
            mySpot.style.left = `${x}%`;
            mySpot.style.top = `${y}%`;
            table.appendChild(mySpot);
        } else {
            const spot = document.createElement('div');
            spot.id = `player-spot-${player.id}`;
            spot.className = 'player-spot';
            spot.dataset.id = player.id;
            spot.style.left = `${x}%`;
            spot.style.top = `${y}%`;
            spot.innerHTML = `<div class="username">${player.username}</div>
                <div class="card-count">${player.hand.length} cards</div>
                <div class="player-bid-info">Bid: ?</div>`;
            table.appendChild(spot);

            const cardSpot = document.createElement('div');
            cardSpot.id = `played-card-${player.id}`;
            cardSpot.className = 'played-card-container';
            cardSpot.style.left = `calc(${x}% + ${60 * Math.sin(angle)}px)`;
            cardSpot.style.top = `calc(${y}% - ${60 * Math.cos(angle)}px)`;
            table.appendChild(cardSpot);
        }
    });
}

function displayCardOnTable(card, playerId) {
    const container = document.getElementById(`played-card-${playerId}`);
    if (container) container.innerHTML = `<div class="card suit-${card.suit}"><span>${card.value}</span><span>${card.suit}</span></div>`;
}

function showBiddingControls(numPlayers) {
    const maxBid = numPlayers === 6 ? 8 : 13;
    bidSelect.innerHTML = '';
    for (let i = 0; i <= maxBid; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i === 0 ? 'Nil' : i;
        bidSelect.appendChild(option);
    }
    biddingControls.classList.remove('hidden');
}

function updateScoreboard(scores, teams) {
    scoreboard.innerHTML = '<h3>Scores</h3>' + scores.map((s, i) => `<div>${teams[i].name}: ${s.score} (Bags: ${s.bags})</div>`).join('');
}

function updatePlayerInfo(players) {
    players.forEach(p => {
        const spot = document.getElementById(`player-spot-${p.id}`);
        if (spot && p.bid !== undefined) {
            spot.querySelector('.player-bid-info').textContent = `Bid: ${p.bid === 0 ? 'Nil' : p.bid}`;
        }
    });
}

function showLobby(gameCode, gameState) {
    showScreen('lobby');
    gameCodeDisplay.textContent = gameCode;
    updateLobbyView(gameState);
}

function updateLobbyView(gameState) {
    playerList.innerHTML = '';
    const amIHost = gameState.host === myPlayerId;
    gameState.players.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.username}${p.isHost ? ' (Host)' : ''}${p.disconnected ? ' [DC]' : ''}</span>`;
        if (amIHost && p.id !== myPlayerId) {
            const kickBtn = document.createElement('button');
            kickBtn.textContent = 'Kick';
            kickBtn.className = 'kick-btn';
            kickBtn.onclick = () => socket.emit('kickPlayer', { gameCode: myGameCode, playerId: p.id });
            li.appendChild(kickBtn);
        }
        playerList.appendChild(li);
    });
    playerCurrentCount.textContent = gameState.players.filter(p => !p.disconnected).length;
    playerMaxCount.textContent = gameState.maxPlayers;
    startGameBtn.classList.toggle('hidden', !(amIHost && gameState.players.length === gameState.maxPlayers && !gameState.players.some(p => p.disconnected)));
}

// --- Helpers ---
function validateUsername() {
    if (usernameInput.value.length < 2) {
        errorMessage.textContent = 'Username must be at least 2 characters.';
        return false;
    }
    errorMessage.textContent = '';
    return true;
}

function resetToHomeScreen() {
    showScreen('home');
    gameCodeInput.value = '';
    myGameCode = '';
}