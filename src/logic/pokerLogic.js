// src/logic/pokerLogic.js

export const SUITS = ['H', 'C', 'S', 'D'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const PHASES = {
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
};

// --- Deck Functions ---
export const createDeck = () => {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    });
  });
  return deck;
};

export const shuffleDeck = (deck) => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

// --- Strict Hand Evaluation Logic ---

const getRankValue = (rank) => {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  if (rank === 'T') return 10;
  return parseInt(rank, 10);
};

// Returns { tier: number, kickers: number[], name: string }
// Tiers: 8=StrFlush, 7=Quads, 6=FH, 5=Flush, 4=Str, 3=Trips, 2=2Pair, 1=Pair, 0=High
const evaluate5CardHand = (cards) => {
  // Sort descending by rank
  const sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
  const ranks = sorted.map(c => getRankValue(c.rank));
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  
  // Check Straight
  let isStraight = true;
  for (let i = 0; i < 4; i++) {
    if (ranks[i] - ranks[i+1] !== 1) {
      isStraight = false; 
      break;
    }
  }
  // Special Ace Low Straight (A-5-4-3-2)
  if (!isStraight && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true;
    // Move Ace to end for comparison logic (it becomes 1)
    ranks.shift();
    ranks.push(1);
  }

  // Count multiples
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.entries(counts).map(([r, c]) => ({ r: parseInt(r), c }));
  groups.sort((a, b) => b.c - a.c || b.r - a.r); // Sort by count desc, then rank desc

  // 1. Straight Flush
  if (isFlush && isStraight) return { tier: 8, kickers: ranks, name: 'Straight Flush' };
  
  // 2. Quads
  if (groups[0].c === 4) return { tier: 7, kickers: [groups[0].r, groups[1].r], name: 'Four of a Kind' };
  
  // 3. Full House
  if (groups[0].c === 3 && groups[1].c === 2) return { tier: 6, kickers: [groups[0].r, groups[1].r], name: 'Full House' };
  
  // 4. Flush
  if (isFlush) return { tier: 5, kickers: ranks, name: 'Flush' };
  
  // 5. Straight
  if (isStraight) return { tier: 4, kickers: ranks, name: 'Straight' };
  
  // 6. Trips
  if (groups[0].c === 3) return { tier: 3, kickers: [groups[0].r, ...ranks.filter(r => r !== groups[0].r)], name: 'Three of a Kind' };
  
  // 7. Two Pair
  if (groups[0].c === 2 && groups[1].c === 2) return { tier: 2, kickers: [groups[0].r, groups[1].r, groups[2].r], name: 'Two Pair' };
  
  // 8. Pair
  if (groups[0].c === 2) return { tier: 1, kickers: [groups[0].r, ...ranks.filter(r => r !== groups[0].r)], name: 'Pair' };
  
  // 9. High Card
  return { tier: 0, kickers: ranks, name: 'High Card' };
};

// Helper: combinatorics to find best 5 of 7
function getCombinations(array, k) {
  if (k === 1) return array.map(el => [el]);
  const combs = [];
  array.forEach((el, i) => {
    const smallerCombs = getCombinations(array.slice(i + 1), k - 1);
    smallerCombs.forEach(comb => {
      combs.push([el, ...comb]);
    });
  });
  return combs;
}

export const evaluateHand = (holeCards, communityCards) => {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) return { tier: 0, kickers: [], name: 'Waiting...' };

  const combos = getCombinations(allCards, 5);
  let bestHand = null;

  combos.forEach(combo => {
    const result = evaluate5CardHand(combo);
    if (!bestHand || compareHandsResults(result, bestHand) > 0) {
      bestHand = result;
    }
  });

  return bestHand;
};

// Returns 1 if A > B, -1 if B > A, 0 if tie
const compareHandsResults = (a, b) => {
  if (a.tier > b.tier) return 1;
  if (b.tier > a.tier) return -1;
  
  // Compare kickers
  for (let i = 0; i < a.kickers.length; i++) {
    if (a.kickers[i] > b.kickers[i]) return 1;
    if (b.kickers[i] > a.kickers[i]) return -1;
  }
  return 0;
};

export const determineWinner = (players, communityCards) => {
  let bestScore = null;
  let winners = [];

  players.forEach((player) => {
    if (player.folded) return;
    const score = evaluateHand(player.hand, communityCards);
    player.handStrength = score; // Store for display

    if (!bestScore || compareHandsResults(score, bestScore) > 0) {
      bestScore = score;
      winners = [player.id];
    } else if (compareHandsResults(score, bestScore) === 0) {
      winners.push(player.id);
    }
  });

  return winners;
};

export const getNextActivePlayer = (players, currentIndex) => {
  if (currentIndex < 0 || currentIndex >= players.length) {
    // Find first active player
    for (let i = 0; i < players.length; i++) {
      if (!players[i].folded && players[i].chips > 0) {
        return i;
      }
    }
    return -1; // No active players
  }
  
  let nextIndex = (currentIndex + 1) % players.length;
  let loopCount = 0;
  const startIndex = nextIndex;
  
  while ((players[nextIndex].folded || players[nextIndex].chips === 0) && loopCount < players.length) {
    nextIndex = (nextIndex + 1) % players.length;
    loopCount++;
    // If we've looped back to start, no active players found
    if (nextIndex === startIndex) {
      return -1;
    }
  }
  
  // Double check the player is actually active
  if (players[nextIndex].folded || players[nextIndex].chips === 0) {
    return -1;
  }
  
  return nextIndex;
};