// src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import Table from './components/Table';
import * as Logic from './logic/pokerLogic';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

// Helper function to get the current phase name for the status bubble
const getPhaseName = (phase, communityCards) => {
    switch (phase) {
        case Logic.PHASES.PREFLOP:
            return 'Pre-Flop';
        case Logic.PHASES.FLOP:
            return 'Flop';
        case Logic.PHASES.TURN:
            return 'Turn';
        case Logic.PHASES.RIVER:
            return 'River';
        case Logic.PHASES.SHOWDOWN:
            return 'Showdown';
        default:
            return 'Idle';
    }
};

const App = () => {
    // --- Game State ---
    const [deck, setDeck] = useState([]);
    const [players, setPlayers] = useState([]);
    const [communityCards, setCommunityCards] = useState([]);
    const [pot, setPot] = useState(0);
    const [dealerIndex, setDealerIndex] = useState(0);
    const [activePlayerIndex, setActivePlayerIndex] = useState(-1);
    const [currentBet, setCurrentBet] = useState(0); // The high bet to match
    const [minRaise, setMinRaise] = useState(BIG_BLIND); // Min raise amount
    const [phase, setPhase] = useState('idle');
    const [winners, setWinners] = useState([]);
    const [gameMessage, setGameMessage] = useState("Welcome to React Hold'em");

    // Betting Turn State
    // The index of the last player who made an aggressive action (bet or raise)
    const [lastAggressorIndex, setLastAggressorIndex] = useState(-1); 

    // UI State for User
    const [userRaiseAmount, setUserRaiseAmount] = useState(BIG_BLIND * 2);
    
    // Game history/moves tracking
    const [gameMoves, setGameMoves] = useState([]);
    const [showAnalysis, setShowAnalysis] = useState(false);
    
    // Settings state
    const [showSettings, setShowSettings] = useState(false);
    const [selectedBotId, setSelectedBotId] = useState(1); // Default to Bot 1
    const [settingsMode, setSettingsMode] = useState('Custom'); // Beginner, Advanced, Mixture, Custom

    // --- Initialization ---
    useEffect(() => {
        const initialPlayers = Array.from({ length: 6 }, (_, i) => ({
            id: i,
            name: i === 0 ? 'You' : `Bot ${i}`,
            isHuman: i === 0,
            chips: STARTING_CHIPS,
            hand: [],
            folded: false,
            bet: 0, // Bet in current round
            totalInvested: 0, // Total in pot
            currentAction: '',
            showCards: false,
            // Bot configuration (only for bots)
            aggressiveLevel: i === 0 ? null : 50, // 0 = passive, 100 = aggressive
            tightLevel: i === 0 ? null : 50 // 0 = loose, 100 = tight
        }));
        setPlayers(initialPlayers);
    }, []);

    // --- Core Game Functions (useCallback for stability) ---

    const advancePhase = useCallback(() => {
        // Reset round bets
        const newPlayers = players.map(p => ({ ...p, bet: 0, currentAction: '' }));
        setPlayers(newPlayers);
        setCurrentBet(0);
        setMinRaise(BIG_BLIND);
        setLastAggressorIndex(-1); // Reset aggressor

        let nextPhase = '';
        const newDeck = [...deck];

        // Burn card not explicitly modeled here for simplicity, but implied by card draw
        if (phase === Logic.PHASES.PREFLOP) {
            nextPhase = Logic.PHASES.FLOP;
            setCommunityCards([newDeck.pop(), newDeck.pop(), newDeck.pop()]);
        } else if (phase === Logic.PHASES.FLOP) {
            nextPhase = Logic.PHASES.TURN;
            setCommunityCards(prev => [...prev, newDeck.pop()]);
        } else if (phase === Logic.PHASES.TURN) {
            nextPhase = Logic.PHASES.RIVER;
            setCommunityCards(prev => [...prev, newDeck.pop()]);
        } else if (phase === Logic.PHASES.RIVER) {
            handleShowdown(newPlayers); // Pass updated players
            return;
        }

        setDeck(newDeck);
        setPhase(nextPhase);

        // Action starts left of Dealer (Small Blind position) for post-flop
        const nextActor = Logic.getNextActivePlayer(newPlayers, dealerIndex);
        setActivePlayerIndex(nextActor);
        setGameMessage(`Phase: ${getPhaseName(nextPhase, communityCards)}`);

    }, [players, deck, phase, communityCards, dealerIndex]);


    const nextTurn = useCallback(() => {
        // Logic to check for end of betting round:
        // 1. All active players (not folded/not all-in) must have matched the current bet.
        // 2. The turn must return to the last aggressor (or the BB in preflop).

        const nextIndex = Logic.getNextActivePlayer(players, activePlayerIndex);

        // If no next active player found, advance phase
        if (nextIndex === -1) {
            advancePhase();
            return;
        }

        // Get all active players (not folded, have chips to act)
        const activePlayers = players.filter(p => !p.folded && p.chips > 0);
        
        // Check if all active players have matched the current bet
        const allActiveMatched = activePlayers.length > 0 && activePlayers.every(p => p.bet === currentBet);
        
        // Special case: if currentBet is 0 (everyone checking) and we've completed a full round
        if (currentBet === 0 && allActiveMatched && activePlayers.length > 0) {
            // For check rounds, find the first active player who would start the betting round
            // Preflop: UTG (3 positions after dealer), Postflop: first active player left of dealer
            let startingPlayer;
            if (phase === Logic.PHASES.PREFLOP) {
                // UTG is 3 positions after dealer
                const utgPosition = (dealerIndex + 3) % 6;
                // If UTG is active, use them; otherwise find first active player after BB
                if (!players[utgPosition].folded && players[utgPosition].chips > 0) {
                    startingPlayer = utgPosition;
                } else {
                    startingPlayer = Logic.getNextActivePlayer(players, (dealerIndex + 2) % 6);
                }
            } else {
                // Postflop: first active player left of dealer
                startingPlayer = Logic.getNextActivePlayer(players, dealerIndex);
            }
            
            // If startingPlayer is -1 (no active players), advance phase
            if (startingPlayer === -1) {
                advancePhase();
                return;
            }
            
            // We've completed a full round of checks when:
            // 1. We're back to the starting player (nextIndex === startingPlayer)
            // 2. OR we've wrapped around the table (nextIndex < activePlayerIndex) and all have checked
            const hasWrappedAround = nextIndex < activePlayerIndex;
            const isBackToStart = nextIndex === startingPlayer;
            
            if (isBackToStart || hasWrappedAround) {
                advancePhase();
                return;
            }
        }
        
        // Determine the last aggressor for betting rounds (when currentBet > 0)
        const lastAggressor = lastAggressorIndex !== -1 ? lastAggressorIndex : (phase === Logic.PHASES.PREFLOP ? (dealerIndex + 2) % 6 : Logic.getNextActivePlayer(players, dealerIndex));
        
        // Check if we've completed the betting round (when there was a bet)
        if (currentBet > 0 && allActiveMatched) {
            const isBackToAggressor = nextIndex === lastAggressor;
            const aggressorIsAllIn = players[lastAggressor] && players[lastAggressor].chips === 0;
            const hasLoopedPastAggressor = aggressorIsAllIn && nextIndex < activePlayerIndex && nextIndex <= lastAggressor;
            
            if (isBackToAggressor || hasLoopedPastAggressor || nextIndex === activePlayerIndex) {
                advancePhase();
                return;
            }
        }

        // Ensure the next player exists and is valid
        if (nextIndex >= 0 && nextIndex < players.length && !players[nextIndex].folded && players[nextIndex].chips > 0) {
            setActivePlayerIndex(nextIndex);
            setGameMessage(`Phase: ${getPhaseName(phase, communityCards)} | Action: ${players[nextIndex].name}`);
        } else {
            // Invalid next player, advance phase
            advancePhase();
        }

    }, [players, activePlayerIndex, currentBet, phase, advancePhase, lastAggressorIndex, dealerIndex, communityCards]);
    
    // Helper function to record a move
    const recordMove = useCallback((playerId, action, amount = 0, currentPot = pot, currentPhase = phase) => {
        const player = players[playerId];
        const move = {
            id: Date.now() + Math.random(), // Unique ID
            playerId,
            playerName: player?.name || `Player ${playerId}`,
            phase: currentPhase,
            action,
            amount,
            pot: currentPot,
            timestamp: new Date().toISOString()
        };
        setGameMoves(prev => [...prev, move]);
    }, [players, pot, phase]);

    // --- Player Action Implementations ---

    const performFold = (id) => {
        const newPlayers = [...players];
        newPlayers[id].folded = true;
        newPlayers[id].currentAction = 'Fold';
        recordMove(id, 'Fold', 0, pot, phase);
        setPlayers(newPlayers);
        nextTurn();
    };

    const performCheck = (id) => {
        const newPlayers = [...players];
        newPlayers[id].currentAction = 'Check';
        recordMove(id, 'Check', 0, pot, phase);
        setPlayers(newPlayers);
        nextTurn();
    };

    const performCall = (id) => {
        const newPlayers = [...players];
        const player = newPlayers[id];
        const amountToMatch = currentBet - player.bet;
        const actualAmount = Math.min(player.chips, amountToMatch); // All-in logic

        player.chips -= actualAmount;
        player.bet += actualAmount;
        player.totalInvested += actualAmount;
        const actionText = (player.chips === 0 && actualAmount < amountToMatch) ? 'All-In' : 'Call';
        player.currentAction = actionText;

        const newPot = pot + actualAmount;
        setPot(newPot);
        recordMove(id, actionText, actualAmount, newPot, phase);
        setPlayers(newPlayers);
        nextTurn();
    };

    const performRaise = (id, totalBetAmount) => {
        const newPlayers = [...players];
        const player = newPlayers[id];

        // 1. Calculate the actual chip change
        const amountToadd = totalBetAmount - player.bet;

        // Validation (should be done on UI but safe check here)
        if (amountToadd > player.chips) return;
        if (totalBetAmount < currentBet + minRaise && player.chips > amountToadd) return; 

        // 2. Update player state
        player.chips -= amountToadd;
        player.bet = totalBetAmount; // Player's new bet for the round
        player.totalInvested += amountToadd;
        player.currentAction = `Raise to ${totalBetAmount}`;

        // 3. Update game state
        const newPot = pot + amountToadd;
        setPot(newPot);
        
        // New min raise is the difference between the new bet and the old high bet
        setMinRaise(totalBetAmount - currentBet); 
        setCurrentBet(totalBetAmount);
        setLastAggressorIndex(id);
        
        recordMove(id, 'Raise', totalBetAmount, newPot, phase);
        setPlayers(newPlayers);
        
        // Use nextTurn to properly handle end-of-round logic
        setTimeout(() => {
            nextTurn();
        }, 0);
    };


    // --- Game Start and Bot Logic (Less critical changes) ---

    const startNewHand = () => {
        const newDeck = Logic.shuffleDeck(Logic.createDeck());
        const newPlayers = players.map(p => ({
            ...p,
            hand: [], folded: false, bet: 0, currentAction: '', showCards: false, handStrength: null,
            // Preserve bot configuration
            aggressiveLevel: p.aggressiveLevel,
            tightLevel: p.tightLevel
        }));

        setCommunityCards([]);
        setPot(0);
        setWinners([]);
        setGameMessage("");
        setGameMoves([]); // Reset moves for new hand

        // Rotate Dealer
        const newDealerIndex = (dealerIndex + 1) % 6;
        setDealerIndex(newDealerIndex);

        // Deal
        for (let i = 0; i < 6; i++) {
            newPlayers[i].hand = [newDeck.pop(), newDeck.pop()];
        }

        // Blinds
        const sbIndex = (newDealerIndex + 1) % 6;
        const bbIndex = (newDealerIndex + 2) % 6;
        
        const sbAmt = Math.min(newPlayers[sbIndex].chips, SMALL_BLIND);
        newPlayers[sbIndex].chips -= sbAmt;
        newPlayers[sbIndex].bet = sbAmt;
        newPlayers[sbIndex].totalInvested += sbAmt;
        newPlayers[sbIndex].currentAction = 'Small Blind';
        
        const bbAmt = Math.min(newPlayers[bbIndex].chips, BIG_BLIND);
        newPlayers[bbIndex].chips -= bbAmt;
        newPlayers[bbIndex].bet = bbAmt;
        newPlayers[bbIndex].totalInvested += bbAmt;
        newPlayers[bbIndex].currentAction = 'Big Blind';
        
        // Record blind moves
        const initialPot = sbAmt + bbAmt;
        setGameMoves([
            { id: Date.now(), playerId: sbIndex, playerName: newPlayers[sbIndex].name, phase: Logic.PHASES.PREFLOP, action: 'Small Blind', amount: sbAmt, pot: initialPot, timestamp: new Date().toISOString() },
            { id: Date.now() + 1, playerId: bbIndex, playerName: newPlayers[bbIndex].name, phase: Logic.PHASES.PREFLOP, action: 'Big Blind', amount: bbAmt, pot: initialPot, timestamp: new Date().toISOString() }
        ]);

        setDeck(newDeck);
        setPlayers(newPlayers);
        setPot(sbAmt + bbAmt);
        setCurrentBet(BIG_BLIND);
        setMinRaise(BIG_BLIND);
        setPhase(Logic.PHASES.PREFLOP);
        setLastAggressorIndex(bbIndex); // BB is the last aggressor preflop

        // UTG starts action (left of BB)
        const utgIndex = (newDealerIndex + 3) % 6;
        setActivePlayerIndex(utgIndex);
        
        setGameMessage(`Phase: ${getPhaseName(Logic.PHASES.PREFLOP)} | Action: ${newPlayers[utgIndex].name}`);

        // Reset User UI
        setUserRaiseAmount(BIG_BLIND * 2);
    };

    // --- Bot Logic ---
    useEffect(() => {
        if (activePlayerIndex === -1 || phase === Logic.PHASES.SHOWDOWN || phase === 'idle') return;
        if (activePlayerIndex >= players.length) return;

        const currentPlayer = players[activePlayerIndex];

        if (!currentPlayer || currentPlayer.isHuman) return;
        
        // Skip if player is all-in (has no chips to act)
        if (currentPlayer.chips === 0) {
            // All-in players don't act, move to next turn
            // Use setTimeout to avoid immediate re-trigger of useEffect
            const skipTimer = setTimeout(() => {
                nextTurn();
            }, 100);
            return () => clearTimeout(skipTimer);
        }

        // Bot action will be performed by calling the appropriate performX function
        const callAmount = currentBet - currentPlayer.bet;
        const canCheck = callAmount === 0;
        const canCall = currentPlayer.chips >= callAmount;
        
        const delay = Math.floor(Math.random() * 1000) + 1000;
        const actionTimer = setTimeout(() => {
            // Simple Random AI (Weighted) - This will be replaced by your Agentic logic
            const rand = Math.random();
            const totalBetSize = currentBet + minRaise; // Example raise size

            if (canCheck) {
                if (rand > 0.8 && currentPlayer.chips >= totalBetSize) {
                    performRaise(activePlayerIndex, totalBetSize);
                } else {
                    performCheck(activePlayerIndex);
                }
            } else { // Facing a bet
                if (rand > 0.8 && currentPlayer.chips >= totalBetSize) {
                    performRaise(activePlayerIndex, totalBetSize);
                } else if (rand > 0.3 && canCall) {
                    performCall(activePlayerIndex);
                } else {
                    performFold(activePlayerIndex);
                }
            }
        }, delay);

        return () => clearTimeout(actionTimer);
    }, [activePlayerIndex, phase, players, currentBet, minRaise, nextTurn]);

    // --- Showdown Logic ---
    const handleShowdown = (finalPlayers) => {
        setPhase(Logic.PHASES.SHOWDOWN);
        setActivePlayerIndex(-1);
        
        const playersWithHands = finalPlayers.map(p => ({
            ...p,
            showCards: !p.folded
        }));

        const winnerIds = Logic.determineWinner(playersWithHands, communityCards);
        setWinners(winnerIds);
        
        // Split Pot Logic
        const share = Math.floor(pot / winnerIds.length);
        winnerIds.forEach(id => {
            playersWithHands[id].chips += share;
            playersWithHands[id].currentAction = 'WINNER';
        });
        
        // Reset money for players who have zeroed out
        playersWithHands.forEach(p => {
            if (p.chips <= 0) {
                p.chips = STARTING_CHIPS;
            }
        });
        
        // Update State
        setPlayers(playersWithHands);
        
        const winDesc = playersWithHands[winnerIds[0]].handStrength?.name || 'High Card';
        setGameMessage(`${winnerIds.length > 1 ? 'Split Pot' : 'Winner'}: ${winDesc}`);
    };

    // --- Interaction (Human Player) ---
    const human = players[0];
    // Human can't act if they're all-in (no chips)
    const isHumanTurn = activePlayerIndex === 0 && phase !== 'idle' && phase !== Logic.PHASES.SHOWDOWN && human && human.chips > 0;
    const callAmt = human ? currentBet - human.bet : 0;
    
    // Slider Limits
    const minTotalRaise = currentBet + minRaise;
    const maxTotalRaise = human ? human.chips + human.bet : 0; // The max they can put in total

    useEffect(() => {
        // Keep the user raise amount within valid bounds when state changes
        if (minTotalRaise > userRaiseAmount) {
             setUserRaiseAmount(minTotalRaise);
        }
    }, [minTotalRaise]);


    // Get current action player name for status bubble
    const currentActionPlayer = activePlayerIndex >= 0 && activePlayerIndex < players.length 
        ? players[activePlayerIndex].name 
        : '';

    // Handle bot configuration updates
    const updateBotConfig = (botId, aggressiveLevel, tightLevel) => {
        const newPlayers = players.map(p => 
            p.id === botId 
                ? { ...p, aggressiveLevel, tightLevel }
                : p
        );
        setPlayers(newPlayers);
    };
    
    // Apply preset configurations
    const applyPresetConfig = (mode) => {
        setSettingsMode(mode);
        const newPlayers = players.map(p => {
            if (p.isHuman) return p;
            
            let aggressiveLevel, tightLevel;
            switch(mode) {
                case 'Beginner':
                    // More passive, tighter play
                    aggressiveLevel = 30;
                    tightLevel = 70;
                    break;
                case 'Advanced':
                    // More aggressive, looser play
                    aggressiveLevel = 70;
                    tightLevel = 30;
                    break;
                case 'Mixture':
                    // Mixed strategies - vary by bot
                    aggressiveLevel = 30 + (p.id % 3) * 25; // 30, 55, or 80
                    tightLevel = 70 - (p.id % 3) * 20; // 70, 50, or 30
                    break;
                default:
                    return p; // Custom - don't change
            }
            return { ...p, aggressiveLevel, tightLevel };
        });
        setPlayers(newPlayers);
    };

    return (
        <div className="poker-app">
            {/* Navbar */}
            <nav className="navbar">
                <div className="navbar-left">
                    <div className="logo-icon">♠</div>
                    <div className="site-name">holdem sim</div>
                </div>
                <button className="settings-icon" onClick={() => setShowSettings(true)}>
                    ⚙
                </button>
            </nav>
            
            {/* Phase and Action Display Bubble */}
            <div className="status-bubble">
                <div className="status-bubble-label">Phase</div>
                <div className="status-bubble-value">{getPhaseName(phase, communityCards)}</div>
                {currentActionPlayer && activePlayerIndex !== -1 && phase !== Logic.PHASES.SHOWDOWN && phase !== 'idle' && (
                    <>
                        <div className="status-bubble-label">Action</div>
                        <div className="status-bubble-value">{currentActionPlayer}</div>
                    </>
                )}
            </div>
            
            <Table 
                players={players}
                communityCards={communityCards}
                pot={pot}
                activePlayerIndex={activePlayerIndex}
                dealerIndex={dealerIndex}
                winners={winners}
                gameStatus={gameMessage || `Phase: ${getPhaseName(phase)}`}
            />

            <div className="controls-bar">
                {phase === 'idle' || phase === Logic.PHASES.SHOWDOWN ? (
                    <>
                        <button 
                            className="primary" 
                            onClick={() => {
                                if (phase === 'idle') {
                                    // Show settings first when starting a new game
                                    setShowSettings(true);
                                } else {
                                    // Just start next hand if already in a game
                                    startNewHand();
                                }
                            }}
                        >
                            {phase === 'idle' ? 'Start Game' : 'Next Hand'}
                        </button>
                        {phase === Logic.PHASES.SHOWDOWN && gameMoves.length > 0 && (
                            <button className="secondary" onClick={() => setShowAnalysis(!showAnalysis)}>
                                Get Analysis
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <button 
                            disabled={!isHumanTurn} 
                            onClick={() => performFold(0)}
                        >
                            Fold
                        </button>
                        
                        <button 
                            disabled={!isHumanTurn} 
                            onClick={() => callAmt === 0 ? performCheck(0) : performCall(0)}
                        >
                            {callAmt === 0 ? 'Check' : `Call ${callAmt}`}
                        </button>

                        {/* Raise Controls */}
                        <div className="raise-control">
                            <input 
                                type="range" 
                                min={minTotalRaise} 
                                max={Math.max(minTotalRaise, maxTotalRaise)} 
                                step={BIG_BLIND}
                                value={userRaiseAmount}
                                onChange={(e) => setUserRaiseAmount(parseInt(e.target.value))}
                                disabled={!isHumanTurn || maxTotalRaise <= minTotalRaise}
                            />
                            <button 
                                disabled={!isHumanTurn || maxTotalRaise <= minTotalRaise || userRaiseAmount < minTotalRaise}
                                onClick={() => performRaise(0, userRaiseAmount)}
                            >
                                Raise {userRaiseAmount}
                            </button>
                        </div>
                    </>
                )}
            </div>
            
            {/* Analysis Sidebar */}
            {showAnalysis && (
                <div className="analysis-sidebar">
                    <div className="analysis-header">
                        <h2>Game Analysis</h2>
                        <button className="close-analysis" onClick={() => setShowAnalysis(false)}>×</button>
                    </div>
                    <div className="analysis-content">
                        {gameMoves.length === 0 ? (
                            <div className="no-moves">No moves recorded yet.</div>
                        ) : (
                            <div className="moves-list">
                                {gameMoves.map((move) => (
                                    <div key={move.id} className="move-item">
                                        <div className="move-header">
                                            <span className="move-player">{move.playerName}</span>
                                            <span className="move-phase">{getPhaseName(move.phase, [])}</span>
                                        </div>
                                        <div className="move-action">
                                            <span className="action-type">{move.action}</span>
                                            {move.amount > 0 && (
                                                <span className="action-amount">${move.amount}</span>
                                            )}
                                        </div>
                                        <div className="move-pot">Pot: ${move.pot}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Overlay when sidebar is open */}
            {showAnalysis && <div className="analysis-overlay" onClick={() => setShowAnalysis(false)}></div>}
            
            {/* Settings Modal */}
            {showSettings && (
                <>
                    <div className="settings-overlay" onClick={() => setShowSettings(false)}></div>
                    <div className="settings-modal">
                        <div className="settings-header">
                            <h2>Bot Configuration</h2>
                            <button className="close-settings" onClick={() => setShowSettings(false)}>×</button>
                        </div>
                        <div className="settings-content">
                            <div className="preset-selector">
                                <label>Difficulty Level:</label>
                                <div className="preset-buttons">
                                    <button 
                                        className={settingsMode === 'Beginner' ? 'preset-btn active' : 'preset-btn'}
                                        onClick={() => applyPresetConfig('Beginner')}
                                    >
                                        Beginner
                                    </button>
                                    <button 
                                        className={settingsMode === 'Advanced' ? 'preset-btn active' : 'preset-btn'}
                                        onClick={() => applyPresetConfig('Advanced')}
                                    >
                                        Advanced
                                    </button>
                                    <button 
                                        className={settingsMode === 'Mixture' ? 'preset-btn active' : 'preset-btn'}
                                        onClick={() => applyPresetConfig('Mixture')}
                                    >
                                        Mixture
                                    </button>
                                    <button 
                                        className={settingsMode === 'Custom' ? 'preset-btn active' : 'preset-btn'}
                                        onClick={() => setSettingsMode('Custom')}
                                    >
                                        Custom
                                    </button>
                                </div>
                            </div>
                            
                            {settingsMode === 'Custom' && (
                                <>
                                    <div className="bot-selector">
                                        <label>Select Bot:</label>
                                        <select 
                                            value={selectedBotId} 
                                            onChange={(e) => setSelectedBotId(parseInt(e.target.value))}
                                        >
                                            {players.filter(p => !p.isHuman).map(bot => (
                                                <option key={bot.id} value={bot.id}>{bot.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {players[selectedBotId] && (
                                        <>
                                            <div className="slider-group">
                                                <div className="slider-label">
                                                    <span>Passive</span>
                                                    <span className="slider-value">{players[selectedBotId].aggressiveLevel}%</span>
                                                    <span>Aggressive</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={players[selectedBotId].aggressiveLevel || 50}
                                                    onChange={(e) => updateBotConfig(selectedBotId, parseInt(e.target.value), players[selectedBotId].tightLevel || 50)}
                                                    className="config-slider"
                                                />
                                            </div>
                                            
                                            <div className="slider-group">
                                                <div className="slider-label">
                                                    <span>Loose</span>
                                                    <span className="slider-value">{players[selectedBotId].tightLevel}%</span>
                                                    <span>Tight</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={players[selectedBotId].tightLevel || 50}
                                                    onChange={(e) => updateBotConfig(selectedBotId, players[selectedBotId].aggressiveLevel || 50, parseInt(e.target.value))}
                                                    className="config-slider"
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                            
                            {phase === 'idle' && (
                                <div className="settings-footer">
                                    <button 
                                        className="primary" 
                                        onClick={() => {
                                            setShowSettings(false);
                                            startNewHand();
                                        }}
                                        style={{ width: '100%', marginTop: '20px' }}
                                    >
                                        Start Game
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default App;