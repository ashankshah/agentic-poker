// Lightweight self-tests for the Texas Hold'em engine.
// Run with: node src/logic/engineSelfTest.js

import {
  ACTIONS,
  PLAYER_STATUS,
  createInitialGameState,
  createPlayers,
  startHand,
  applyAction,
  computeSidePots,
  PHASES,
} from './pokerLogic.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testSidePots() {
  const players = createPlayers(4, 0);
  // Simulate commitments:
  // P0 all-in 100, P1 200, P2 200 (folded), P3 500
  players[0].totalCommitted = 100; players[0].status = PLAYER_STATUS.ALL_IN;
  players[1].totalCommitted = 200; players[1].status = PLAYER_STATUS.ALL_IN;
  players[2].totalCommitted = 200; players[2].status = PLAYER_STATUS.FOLDED;
  players[3].totalCommitted = 500; players[3].status = PLAYER_STATUS.ACTIVE;

  const pots = computeSidePots(players);
  assert(pots.length === 3, `expected 3 pots, got ${pots.length}`);
  assert(pots[0].amount === 100 * 4, `pot1 amount wrong: ${pots[0].amount}`);
  assert(pots[0].eligiblePlayers.includes(0) && pots[0].eligiblePlayers.includes(1) && pots[0].eligiblePlayers.includes(3), 'pot1 eligibility wrong');
  assert(!pots[0].eligiblePlayers.includes(2), 'folded player should not be eligible');
  assert(pots[1].amount === (200 - 100) * 3, `pot2 amount wrong: ${pots[1].amount}`);
  assert(pots[2].amount === (500 - 200) * 1, `pot3 amount wrong: ${pots[2].amount}`);
}

function testShortAllInDoesNotReopen() {
  // Construct a minimal in-progress game state (skip dealing specifics)
  let game = createInitialGameState({
    players: createPlayers(3, 1000),
    sbAmount: 5,
    bbAmount: 10,
    dealerIndex: 0,
  });
  game = startHand(game);

  // Force a betting situation:
  // Highest=100, last full raise size=80 => minRaise=80
  game.betting.highestBetThisRound = 100;
  game.betting.lastFullRaiseSize = 80;
  game.betting.minRaiseAmount = 80;
  game.betting.actedSinceLastFullRaise = { 0: true, 1: true }; // they already acted
  game.betting.lastReopenerIndex = 1;
  game.players.forEach(p => { p.currentBet = 100; p.stack = 1000; });
  game.players[2].currentBet = 100;
  game.players[2].stack = 20; // can only go to 120 (raise size 20 < 80)
  game.betting.currentActorIndex = 2;

  const after = applyAction(game, 2, ACTIONS.ALL_IN, 120);
  assert(after.betting.highestBetThisRound === 120, 'highest should update to 120');
  // Short all-in raise should NOT reset actedSinceLastFullRaise
  assert(after.betting.actedSinceLastFullRaise[0] === true && after.betting.actedSinceLastFullRaise[1] === true, 'short all-in must not reopen action for players who already acted');
}

function testBurnAndStreets() {
  let game = createInitialGameState({
    players: createPlayers(2, 1000),
    sbAmount: 5,
    bbAmount: 10,
    dealerIndex: 0,
  });
  game = startHand(game);
  assert(game.phase === PHASES.PREFLOP, 'should start preflop');

  // With 2 players, just have both call/check through to river.
  // Preflop: player left of BB acts first. We keep folding impossible.
  // Call until round ends.
  for (let i = 0; i < 4; i++) {
    const idx = game.betting.currentActorIndex;
    const highest = game.betting.highestBetThisRound;
    const p = game.players[idx];
    if (p.currentBet < highest) game = applyAction(game, idx, ACTIONS.CALL);
    else game = applyAction(game, idx, ACTIONS.CHECK);
    if (game.handOver) break;
  }

  assert([PHASES.FLOP, PHASES.TURN, PHASES.RIVER, PHASES.SHOWDOWN].includes(game.phase), 'should advance streets');
  assert(game.communityCards.length >= 3, 'should have dealt flop with burn');
}

try {
  testSidePots();
  testShortAllInDoesNotReopen();
  testBurnAndStreets();
  // eslint-disable-next-line no-console
  console.log('Engine self-tests: OK');
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Engine self-tests: FAILED');
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
}

