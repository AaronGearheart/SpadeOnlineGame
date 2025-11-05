# Spades Online Game

A web-based multiplayer Spades card game.

## Features

- **Multiplayer Lobby:** Create a game and invite friends with a unique code.
- **Variable Players:** Supports 4 or 6 players in teams of 2.
- **Team Play:** Players can partner up.
- **Bidding:** Standard Spades bidding, including Nil and Blind Nil options.
- **Score Tracking:** Automatic score calculation and display.
- **Real-time Gameplay:** Interactive card playing with live updates.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express, Socket.IO
- **Deployment:** TBD (e.g., Glitch, Heroku, Render)

## How to Play a Round (as per requirements)

1.  The host starts a new game and selects the number of players.
2.  A unique game code is generated, which the host shares with other players.
3.  Players join the game using the code and enter their usernames.
4.  The host can see all joined players and can start the game when everyone is ready.
5.  The game begins with a random player starting the first trick. Spades cannot be led until they are "broken" (played on another suit).
6.  Players must follow the suit led if they have a card of that suit. If not, they can play a spade or another suit.
7.  The winner of a trick leads the next one.
8.  Scores are calculated based on bids. +10 points for each trick bid and made, +1 point for each overtrick. Nil is 100 points, Blind Nil is 200 points.
9.  The game continues until a team reaches the score limit set by the host.