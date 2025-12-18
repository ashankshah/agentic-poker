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
  
  // Check Straight - use original ranks for this check
  let isStraight = true;
  let straightKickers = [...ranks]; // Copy for straight kickers
  for (let i = 0; i < 4; i++) {
    if (ranks[i] - ranks[i+1] !== 1) {
      isStraight = false; 
      break;
    }
  }
  // Special Ace Low Straight (A-5-4-3-2)
  if (!isStraight && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true;
    // For ace-low straight, use [5, 4, 3, 2, 1] for kickers
    straightKickers = [5, 4, 3, 2, 1];
  }

  // Count multiples - use ORIGINAL ranks, not modified ones
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.entries(counts).map(([r, c]) => ({ r: parseInt(r), c }));
  groups.sort((a, b) => b.c - a.c || b.r - a.r); // Sort by count desc, then rank desc

  // 1. Straight Flush
  if (isFlush && isStraight) return { tier: 8, kickers: straightKickers, name: 'Straight Flush' };
  
  // 2. Quads
  if (groups[0].c === 4) return { tier: 7, kickers: [groups[0].r, groups[1].r], name: 'Four of a Kind' };
  
  // 3. Full House
  if (groups[0].c === 3 && groups[1].c === 2) return { tier: 6, kickers: [groups[0].r, groups[1].r], name: 'Full House' };
  
  // 4. Flush
  if (isFlush) return { tier: 5, kickers: ranks, name: 'Flush' };
  
  // 5. Straight
  if (isStraight) return { tier: 4, kickers: straightKickers, name: 'Straight' };
  
  // 6. Trips
  if (groups[0].c === 3) {
    const tripRank = groups[0].r;
    const kickers = ranks.filter(r => r !== tripRank).sort((a, b) => b - a);
    return { tier: 3, kickers: [tripRank, ...kickers], name: 'Three of a Kind' };
  }
  
  // 7. Two Pair - ensure proper ordering: higher pair, lower pair, kicker
  if (groups[0].c === 2 && groups[1].c === 2) {
    const pair1Rank = groups[0].r; // Higher pair (sorted by rank desc)
    const pair2Rank = groups[1].r; // Lower pair
    const kicker = groups[2] ? groups[2].r : ranks.find(r => r !== pair1Rank && r !== pair2Rank);
    return { tier: 2, kickers: [pair1Rank, pair2Rank, kicker], name: 'Two Pair' };
  }
  
  // 8. Pair
  if (groups[0].c === 2) {
    const pairRank = groups[0].r;
    const kickers = ranks.filter(r => r !== pairRank).sort((a, b) => b - a);
    return { tier: 1, kickers: [pairRank, ...kickers], name: 'Pair' };
  }
  
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
    // Skip folded players
    if (player.folded) return;
    
    // Skip players with no hand (shouldn't happen, but safety check)
    if (!player.hand || player.hand.length < 2) return;
    
    const score = evaluateHand(player.hand, communityCards);
    
    // Ensure we have a valid score
    if (!score || score.tier === undefined) {
      console.warn(`Invalid score for player ${player.id}:`, score);
      return;
    }
    
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

// ============================================================================
// Spec-compliant Texas Hold'em engine (state machine + side pots)
// ============================================================================

export const PLAYER_STATUS = {
  ACTIVE: 'active',
  FOLDED: 'folded',
  ALL_IN: 'all_in',
  ELIMINATED: 'eliminated',
};

export const ACTIONS = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise',
  ALL_IN: 'all_in',
};

const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.parseInt(n, 10)));

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

export const createPlayers = (count, startingStack, names = []) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    positionIndex: i,
    name: names[i] || (i === 0 ? 'You' : `Bot ${i}`),
    isHuman: i === 0,
    stack: startingStack,
    holeCards: [],
    currentBet: 0,
    totalCommitted: 0,
    status: PLAYER_STATUS.ACTIVE,
    // UI convenience fields (App currently expects these)
    hand: [],
    chips: startingStack,
    bet: 0,
    totalInvested: 0,
    folded: false,
    currentAction: '',
    showCards: false,
    aggressiveLevel: i === 0 ? null : 50,
    tightLevel: i === 0 ? null : 50,
  }));
};

const isInHand = (p) => p.status === PLAYER_STATUS.ACTIVE || p.status === PLAYER_STATUS.ALL_IN;
const canAct = (p) => p.status === PLAYER_STATUS.ACTIVE && p.stack > 0;
const isFolded = (p) => p.status === PLAYER_STATUS.FOLDED;

const syncLegacyFields = (p) => {
  p.chips = p.stack;
  p.hand = p.holeCards;
  p.bet = p.currentBet;
  p.totalInvested = p.totalCommitted;
  p.folded = p.status === PLAYER_STATUS.FOLDED;
  return p;
};

export const createInitialGameState = ({
  players,
  sbAmount,
  bbAmount,
  dealerIndex = 0,
} = {}) => {
  return {
    deck: [],
    communityCards: [],
    phase: 'idle',
    dealerIndex,
    sbAmount,
    bbAmount,
    players: (players || []).map(p => syncLegacyFields({ ...p })),
    betting: {
      highestBetThisRound: 0,
      minRaiseAmount: bbAmount,
      lastFullRaiseSize: bbAmount,
      // Tracks who has acted since the last FULL bet/raise (reopen logic).
      // If a player is in this map, they cannot raise unless a full raise happens in between.
      actedSinceLastFullRaise: {},
      lastReopenerIndex: -1,
      startingIndex: -1,
      currentActorIndex: -1,
      hasActedThisRound: false,
    },
    pots: [], // computed at showdown/hand end
    winners: [],
    handOver: false,
    message: '',
    // dealer-left rule for odd chips uses this
    oddChipStartIndex: dealerIndex,
  };
};

const nextIndexClockwise = (players, from) => (from + 1) % players.length;

export const findNextToAct = (state, fromIndex) => {
  const { players } = state;
  if (!players.length) return -1;
  let idx = nextIndexClockwise(players, fromIndex);
  let loop = 0;
  while (loop < players.length) {
    if (canAct(players[idx])) return idx;
    idx = nextIndexClockwise(players, idx);
    loop++;
  }
  return -1;
};

const countActiveInHand = (players) => players.filter(p => p.status === PLAYER_STATUS.ACTIVE).length;
const countInHandNotFolded = (players) => players.filter(p => isInHand(p)).length;

const commitChips = (player, amount) => {
  const toCommit = Math.min(player.stack, Math.max(0, amount));
  player.stack -= toCommit;
  player.currentBet += toCommit;
  player.totalCommitted += toCommit;
  if (player.stack === 0 && player.status === PLAYER_STATUS.ACTIVE) {
    player.status = PLAYER_STATUS.ALL_IN;
  }
  syncLegacyFields(player);
  return toCommit;
};

const burnOne = (state) => {
  if (state.deck.length > 0) state.deck.pop();
};

const dealCommunity = (state, count) => {
  for (let i = 0; i < count; i++) {
    state.communityCards.push(state.deck.pop());
  }
};

export const startHand = (state) => {
  const next = structuredClone(state);
  next.handOver = false;
  next.winners = [];
  next.pots = [];
  next.communityCards = [];
  next.phase = PHASES.PREFLOP;
  next.message = '';
  next.deck = shuffleDeck(createDeck());

  // Reset per-hand fields (keep stacks + bot config)
  next.players = next.players.map(p => {
    const np = { ...p };
    if (np.stack <= 0) {
      np.status = PLAYER_STATUS.ELIMINATED;
    } else {
      np.status = PLAYER_STATUS.ACTIVE;
    }
    np.holeCards = [];
    np.currentBet = 0;
    np.totalCommitted = 0;
    np.currentAction = '';
    np.showCards = false;
    np.folded = false;
    syncLegacyFields(np);
    return np;
  });

  // Deal 2 cards to each active player (clockwise from dealer)
  const seats = next.players.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let offset = 1; offset <= seats; offset++) {
      const i = (next.dealerIndex + offset) % seats;
      const p = next.players[i];
      if (p.status === PLAYER_STATUS.ACTIVE) {
        p.holeCards.push(next.deck.pop());
        syncLegacyFields(p);
      }
    }
  }

  // Post blinds (only if player can pay something)
  const sbIndex = (next.dealerIndex + 1) % seats;
  const bbIndex = (next.dealerIndex + 2) % seats;
  const sbP = next.players[sbIndex];
  const bbP = next.players[bbIndex];

  const sbPosted = (sbP.status === PLAYER_STATUS.ACTIVE) ? commitChips(sbP, next.sbAmount) : 0;
  const bbPosted = (bbP.status === PLAYER_STATUS.ACTIVE) ? commitChips(bbP, next.bbAmount) : 0;
  sbP.currentAction = sbPosted > 0 ? 'Small Blind' : '';
  bbP.currentAction = bbPosted > 0 ? 'Big Blind' : '';

  const highest = Math.max(sbP.currentBet, bbP.currentBet);
  next.betting = {
    highestBetThisRound: highest,
    minRaiseAmount: next.bbAmount,
    lastFullRaiseSize: next.bbAmount,
    actedSinceLastFullRaise: {},
    lastReopenerIndex: bbIndex, // BB is "reopener" baseline preflop
    // Preflop first action is left of BB
    startingIndex: findNextToAct(next, bbIndex),
    currentActorIndex: findNextToAct(next, bbIndex),
    hasActedThisRound: false,
  };

  return next;
};

export const getLegalActions = (state, playerIndex) => {
  const p = state.players[playerIndex];
  if (!p || !canAct(p) || state.handOver) return { canFold: false, canCheck: false, canCall: false, canBet: false, canRaise: false, canAllIn: false, callAmount: 0, minTotalBet: 0, maxTotalBet: 0 };

  const highest = state.betting.highestBetThisRound;
  const callAmount = Math.max(0, highest - p.currentBet);
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && p.stack > 0;
  const canBet = highest === 0 && p.stack > 0;

  // Raise rules:
  // - Must be able to exceed highest (unless betting 0 -> use BET)
  // - Short all-in raises do not reopen action for players who already acted since last full raise.
  const minRaise = state.betting.minRaiseAmount;
  const minTotalBet = highest + minRaise;
  const maxTotalBet = p.currentBet + p.stack;
  const alreadyActed = Boolean(state.betting.actedSinceLastFullRaise?.[playerIndex]);
  const canRaise = highest > 0 && !alreadyActed && maxTotalBet > highest;
  const canAllIn = p.stack > 0;

  return {
    canFold: true,
    canCheck,
    canCall,
    canBet,
    canRaise,
    canAllIn,
    callAmount,
    minTotalBet,
    maxTotalBet,
  };
};

const allPlayersSettledToHighest = (state) => {
  const highest = state.betting.highestBetThisRound;
  for (const p of state.players) {
    if (isFolded(p)) continue;
    if (!isInHand(p)) continue;
    if (p.status === PLAYER_STATUS.ALL_IN) continue;
    if (p.currentBet !== highest) return false;
  }
  return true;
};

const bettingRoundShouldEnd = (state, nextActorIndex) => {
  // A round ends only when:
  // - Everyone is settled (matched or all-in or folded)
  // - AND action has come back around to the correct end index
  //   - If no bet (highest==0): end when it returns to startingIndex after at least one action
  //   - If there is a bet: end when it returns to lastReopenerIndex after at least one action
  if (nextActorIndex === -1) return true; // no one can act
  if (!state.betting.hasActedThisRound) return false;
  if (!allPlayersSettledToHighest(state)) return false;

  const highest = state.betting.highestBetThisRound;
  const endIndex = highest === 0
    ? state.betting.startingIndex
    : (state.betting.lastReopenerIndex ?? state.betting.startingIndex);
  return nextActorIndex === endIndex;
};

const resetBetsForNextStreet = (state) => {
  state.players.forEach(p => {
    p.currentBet = 0;
    p.bet = 0;
    p.currentAction = '';
    syncLegacyFields(p);
  });
  state.betting.highestBetThisRound = 0;
  state.betting.minRaiseAmount = state.bbAmount;
  state.betting.lastFullRaiseSize = state.bbAmount;
  state.betting.actedSinceLastFullRaise = {};
  state.betting.lastReopenerIndex = -1;
  state.betting.hasActedThisRound = false;
};

const maybeEndHandIfOneLeft = (state) => {
  const remaining = state.players.filter(p => isInHand(p) && !isFolded(p));
  if (remaining.length === 1) {
    state.handOver = true;
    state.phase = PHASES.SHOWDOWN;
    state.winners = [remaining[0].id];
    state.message = `${remaining[0].name} wins (all others folded)`;
    return true;
  }
  return false;
};

// Side pots computed from totalCommitted at end of hand.
export const computeSidePots = (players) => {
  const contributors = players
    .filter(p => p.totalCommitted > 0)
    .map(p => ({ id: p.id, committed: p.totalCommitted, folded: p.status === PLAYER_STATUS.FOLDED }));
  if (contributors.length === 0) return [];

  // Unique commitment levels ascending
  const levels = [...new Set(contributors.map(c => c.committed))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;

  for (const level of levels) {
    const eligibleContribs = contributors.filter(c => c.committed >= level);
    const slice = level - prev;
    const amount = slice * eligibleContribs.length;
    const eligiblePlayers = eligibleContribs.filter(c => !c.folded).map(c => c.id);
    pots.push({ amount, eligiblePlayers });
    prev = level;
  }
  // Filter zero-amount (shouldn't happen)
  return pots.filter(p => p.amount > 0);
};

const comparePlayersForPot = (aPlayer, bPlayer) => {
  const a = aPlayer.handStrength;
  const b = bPlayer.handStrength;
  return compareHandsResults(a, b);
};

const awardPot = (state, pot, oddChipStartIndex) => {
  const eligible = pot.eligiblePlayers
    .map(id => state.players.find(p => p.id === id))
    .filter(Boolean);
  if (eligible.length === 0) return;

  // Find best score among eligible
  let best = eligible[0].handStrength;
  let winners = [eligible[0]];
  for (let i = 1; i < eligible.length; i++) {
    const p = eligible[i];
    const cmp = compareHandsResults(p.handStrength, best);
    if (cmp > 0) {
      best = p.handStrength;
      winners = [p];
    } else if (cmp === 0) {
      winners.push(p);
    }
  }

  const baseShare = Math.floor(pot.amount / winners.length);
  let remainder = pot.amount - baseShare * winners.length;
  winners.forEach(w => { w.stack += baseShare; syncLegacyFields(w); });

  // Odd chip(s): closest left of dealer per spec (we walk clockwise from dealer+1)
  if (remainder > 0) {
    const start = (oddChipStartIndex + 1) % state.players.length;
    let idx = start;
    let loop = 0;
    while (remainder > 0 && loop < state.players.length * 2) {
      const seatPlayer = state.players[idx];
      if (winners.some(w => w.id === seatPlayer.id)) {
        seatPlayer.stack += 1;
        syncLegacyFields(seatPlayer);
        remainder -= 1;
      }
      idx = nextIndexClockwise(state.players, idx);
      loop++;
    }
  }

  // Mark UI winner label for main message; engine also returns ids
  winners.forEach(w => { w.currentAction = 'WINNER'; });
  return winners.map(w => w.id);
};

export const resolveHand = (state) => {
  const next = structuredClone(state);
  next.phase = PHASES.SHOWDOWN;
  next.handOver = true;

  // Show cards for all non-folded
  next.players.forEach(p => {
    p.showCards = p.status !== PLAYER_STATUS.FOLDED;
    syncLegacyFields(p);
  });

  // Evaluate hands for all non-folded
  next.players.forEach(p => {
    if (p.status === PLAYER_STATUS.FOLDED) return;
    if (!p.holeCards || p.holeCards.length < 2) return;
    p.handStrength = evaluateHand(p.holeCards, next.communityCards);
  });

  next.pots = computeSidePots(next.players);

  // Resolve pots from smallest to largest (already in that order)
  const allWinners = new Set();
  for (const pot of next.pots) {
    const potWinners = awardPot(next, pot, next.dealerIndex) || [];
    potWinners.forEach(id => allWinners.add(id));
  }

  next.winners = [...allWinners];
  const firstWinner = next.players.find(p => p.id === next.winners[0]);
  const desc = firstWinner?.handStrength?.name || 'Hand';
  next.message = next.winners.length > 1 ? `Split pot (${desc})` : `Winner: ${desc}`;

  return next;
};

const advanceStreet = (state) => {
  if (state.phase === PHASES.PREFLOP) {
    burnOne(state);
    dealCommunity(state, 3);
    state.phase = PHASES.FLOP;
  } else if (state.phase === PHASES.FLOP) {
    burnOne(state);
    dealCommunity(state, 1);
    state.phase = PHASES.TURN;
  } else if (state.phase === PHASES.TURN) {
    burnOne(state);
    dealCommunity(state, 1);
    state.phase = PHASES.RIVER;
  } else if (state.phase === PHASES.RIVER) {
    // proceed to showdown
    return false;
  }
  resetBetsForNextStreet(state);

  // Postflop first action: left of dealer
  const starter = findNextToAct(state, state.dealerIndex);
  state.betting.startingIndex = starter;
  state.betting.currentActorIndex = starter;
  return true;
};

export const applyAction = (state, playerIndex, action, amount = 0) => {
  const next = structuredClone(state);
  if (next.handOver) return next;

  const p = next.players[playerIndex];
  if (!p || !canAct(p)) return next;

  const highest = next.betting.highestBetThisRound;
  const callAmt = Math.max(0, highest - p.currentBet);

  const legal = getLegalActions(next, playerIndex);
  const act = action;

  // --- Resolve action ---
  // Mark that this player took an action this round (used for reopen + end-of-round)
  next.betting.actedSinceLastFullRaise = next.betting.actedSinceLastFullRaise || {};
  next.betting.actedSinceLastFullRaise[playerIndex] = true;
  next.betting.hasActedThisRound = true;

  if (act === ACTIONS.FOLD) {
    p.status = PLAYER_STATUS.FOLDED;
    p.currentAction = 'Fold';
    syncLegacyFields(p);
  } else if (act === ACTIONS.CHECK) {
    if (!legal.canCheck) return next;
    p.currentAction = 'Check';
    syncLegacyFields(p);
  } else if (act === ACTIONS.CALL) {
    if (!legal.canCall && callAmt > 0) return next;
    const committed = commitChips(p, callAmt);
    p.currentAction = (p.status === PLAYER_STATUS.ALL_IN && committed < callAmt) ? 'All-In' : 'Call';
    syncLegacyFields(p);
  } else if (act === ACTIONS.BET) {
    if (!legal.canBet) return next;
    const betSize = clampInt(amount, 1, p.currentBet + p.stack);
    // Minimum bet sizing: BB (postflop too per spec default)
    const minBet = next.bbAmount;
    const finalBet = Math.max(minBet, betSize);
    const committed = commitChips(p, finalBet); // currentBet was 0 when betting
    next.betting.highestBetThisRound = p.currentBet;
    next.betting.minRaiseAmount = committed; // next raise must be at least this bet size
    next.betting.lastFullRaiseSize = committed;
    // Full bet reopens action; reset acted-since-full-raise
    next.betting.actedSinceLastFullRaise = { [playerIndex]: true };
    next.betting.lastReopenerIndex = playerIndex;
    p.currentAction = (p.status === PLAYER_STATUS.ALL_IN) ? `All-In ${p.currentBet}` : `Bet ${p.currentBet}`;
    syncLegacyFields(p);
  } else if (act === ACTIONS.RAISE || act === ACTIONS.ALL_IN) {
    if (!legal.canRaise && act !== ACTIONS.ALL_IN) return next;
    const desiredTotal = clampInt(amount, highest + 1, p.currentBet + p.stack);
    const maxTotal = p.currentBet + p.stack;
    const isAllIn = act === ACTIONS.ALL_IN || desiredTotal >= maxTotal;
    const total = isAllIn ? maxTotal : desiredTotal;

    if (total <= highest) return next; // must exceed to be a raise

    const raiseSize = total - highest;
    const prevFullRaise = next.betting.lastFullRaiseSize;
    const meetsMinRaise = raiseSize >= prevFullRaise;

    // If not all-in, must meet min raise
    if (!isAllIn && !meetsMinRaise) return next;

    // Commit chips up to 'total'
    const toAdd = total - p.currentBet;
    commitChips(p, toAdd);

    // Update betting state
    next.betting.highestBetThisRound = p.currentBet;

    if (meetsMinRaise) {
      next.betting.lastFullRaiseSize = raiseSize;
      next.betting.minRaiseAmount = raiseSize;
      // Full raise reopens action; reset acted-since-full-raise
      next.betting.actedSinceLastFullRaise = { [playerIndex]: true };
      next.betting.lastReopenerIndex = playerIndex;
    } else {
      // All-in raise that is less than min raise does NOT reopen action:
      // keep actedSinceLastFullRaise as-is, just ensure raiser is marked as acted (already done above).
    }

    p.currentAction = (p.status === PLAYER_STATUS.ALL_IN) ? `All-In ${p.currentBet}` : `Raise to ${p.currentBet}`;
    syncLegacyFields(p);
  } else {
    return next;
  }

  // --- Hand end if only one player remains (folds) ---
  if (maybeEndHandIfOneLeft(next)) {
    // award the entire committed pot to remaining player
    const pots = computeSidePots(next.players);
    const total = sum(pots.map(pt => pt.amount));
    const winner = next.players.find(pl => pl.id === next.winners[0]);
    if (winner) {
      winner.stack += total;
      syncLegacyFields(winner);
    }
    next.pots = pots;
    return next;
  }

  // --- Betting round completion / advance street or showdown ---
  const nextActor = findNextToAct(next, playerIndex);
  next.betting.currentActorIndex = nextActor;

  if (bettingRoundShouldEnd(next, nextActor)) {
    const advanced = advanceStreet(next);
    if (!advanced) {
      return resolveHand(next);
    }
    return next;
  }

  // --- Next actor ---
  return next;
};