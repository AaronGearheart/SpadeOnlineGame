const SUITS = ['♦', '♣', '♥', '♠'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_ORDER = '2,3,4,5,6,7,8,9,10,J,Q,K,A';

class Deck {
    constructor() {
        this.cards = SUITS.flatMap(suit => VALUES.map(value => ({ suit, value })));
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal(players) {
        this.shuffle();
        const hands = players.map(() => []);
        const numPlayers = players.length;
        const cardsPerPlayer = numPlayers === 6 ? 8 : 13;
        
        let cardIndex = 0;
        while(hands.flat().length < cardsPerPlayer * numPlayers) {
            hands[cardIndex % numPlayers].push(this.cards.pop());
            cardIndex++;
        }
        
        hands.forEach(hand => this.sortHand(hand));
        return hands;
    }
    
    sortHand(hand) {
        const suitOrder = { '♦': 0, '♣': 1, '♥': 2, '♠': 3 };
        hand.sort((a, b) => {
            if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
            return VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value);
        });
    }
}

/**
 * Determines the winning card from a trick.
 * @param {Array} trick - An array of {card, playerId} objects.
 * @returns {object} - The {card, playerId} object of the winner.
 */
function getTrickWinner(trick) {
    const leadSuit = trick[0].card.suit;
    const spadesInTrick = trick.filter(p => p.card.suit === '♠');

    if (spadesInTrick.length > 0) {
        return spadesInTrick.reduce((highest, current) => 
            VALUE_ORDER.indexOf(current.card.value) > VALUE_ORDER.indexOf(highest.card.value) ? current : highest
        );
    } else {
        const leadSuitCards = trick.filter(p => p.card.suit === leadSuit);
        return leadSuitCards.reduce((highest, current) => 
            VALUE_ORDER.indexOf(current.card.value) > VALUE_ORDER.indexOf(highest.card.value) ? current : highest
        );
    }
}

/**
 * Finds valid cards a player can play.
 * @param {Array} hand - The player's hand.
 * @param {string|null} leadSuit - The suit that was led in the current trick.
 * @param {boolean} spadesBroken - Whether spades have been played yet.
 * @returns {Array} - An array of valid cards from the hand.
 */
function getValidPlays(hand, leadSuit, spadesBroken) {
    if (leadSuit) {
        const cardsInLeadSuit = hand.filter(c => c.suit === leadSuit);
        if (cardsInLeadSuit.length > 0) return cardsInLeadSuit;
    }
    
    if (!leadSuit && !spadesBroken) {
        const nonSpadeCards = hand.filter(c => c.suit !== '♠');
        if (nonSpadeCards.length > 0) return nonSpadeCards;
    }

    return hand;
}

/**
 * Calculates the scores for the completed round.
 * @param {object} game - The full game state object.
 * @returns {Array} - An array of scores for the round for [Team1, Team2].
 */
function calculateScores(game) {
    const roundScores = [0, 0];
    
    game.teams.forEach((team, teamIndex) => {
        let teamTotalBid = 0;
        let teamTotalTricksWon = 0;
        let teamRoundScore = 0;
        let bags = 0;

        team.players.forEach(playerId => {
            const player = game.players.find(p => p.id === playerId);
            if (!player) return;

            teamTotalTricksWon += player.tricksWon;
            
            if (player.bid === 0) { // Nil Bid
                if (player.tricksWon === 0) {
                    teamRoundScore += 100;
                } else {
                    teamRoundScore -= 100;
                    bags += player.tricksWon;
                }
            } else {
                teamTotalBid += player.bid;
            }
        });
        
        if (teamTotalBid > 0) {
            if (teamTotalTricksWon >= teamTotalBid) {
                teamRoundScore += (teamTotalBid * 10);
                bags += (teamTotalTricksWon - teamTotalBid);
            } else {
                teamRoundScore -= (teamTotalBid * 10);
            }
        }
        
        const currentTotalScore = game.scores[teamIndex];
        currentTotalScore.bags = (currentTotalScore.bags || 0) + bags;
        
        if (currentTotalScore.bags >= 10) {
            currentTotalScore.score -= 100;
            currentTotalScore.bags -= 10;
        }
        
        currentTotalScore.score += teamRoundScore;
        roundScores[teamIndex] = teamRoundScore - bags; // The points from bags are part of the total, not the round score display
    });
    
    return roundScores;
}

module.exports = { Deck, getTrickWinner, getValidPlays, calculateScores };