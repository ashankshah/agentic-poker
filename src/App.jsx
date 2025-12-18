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
    const [players, setPlayers] = useState([]);
    const [communityCards, setCommunityCards] = useState([]);
    const [pot, setPot] = useState(0);
    const [dealerIndex, setDealerIndex] = useState(0);
    const [activePlayerIndex, setActivePlayerIndex] = useState(-1);
    const [phase, setPhase] = useState('idle');
    const [winners, setWinners] = useState([]);
    const [gameMessage, setGameMessage] = useState("Welcome to React Hold'em");
    const [game, setGame] = useState(null);

    // UI State for User
    const [userRaiseAmount, setUserRaiseAmount] = useState(BIG_BLIND * 2);
    
    // Game history/moves tracking
    const [gameMoves, setGameMoves] = useState([]);
    const [showAnalysis, setShowAnalysis] = useState(false);
    
    // Settings state
    const [showSettings, setShowSettings] = useState(false);
    const [selectedBotId, setSelectedBotId] = useState(1); // Default to Bot 1
    const [settingsMode, setSettingsMode] = useState('Custom'); // Beginner, Advanced, Mixture, Custom
    const [numberOfBots, setNumberOfBots] = useState(5); // Default to 5 bots (6 total players)

    // --- Initialization ---
    useEffect(() => {
        const totalPlayers = numberOfBots + 1; // Human + bots
        const initialPlayers = Array.from({ length: totalPlayers }, (_, i) => ({
            id: i,
            name: i === 0 ? 'You' : `Bot ${i}`,
            isHuman: i === 0,
            // Engine fields
            stack: STARTING_CHIPS,
            holeCards: [],
            currentBet: 0,
            totalCommitted: 0,
            status: Logic.PLAYER_STATUS.ACTIVE,
            positionIndex: i,
            // UI legacy fields
            chips: STARTING_CHIPS,
            hand: [],
            folded: false,
            bet: 0,
            totalInvested: 0,
            currentAction: '',
            showCards: false,
            // Bot configuration (only for bots)
            aggressiveLevel: i === 0 ? null : 50, // 0 = passive, 100 = aggressive
            tightLevel: i === 0 ? null : 50 // 0 = loose, 100 = tight
        }));
        setPlayers(initialPlayers);
        setDealerIndex(0);
        setActivePlayerIndex(-1);
        setCommunityCards([]);
        setPot(0);
        setWinners([]);
        setPhase('idle');
        setGameMessage("Welcome to React Hold'em");
        setGame(Logic.createInitialGameState({
            players: initialPlayers,
            sbAmount: SMALL_BLIND,
            bbAmount: BIG_BLIND,
            dealerIndex: 0,
        }));
        // Reset selectedBotId if it's out of range
        if (selectedBotId >= totalPlayers) {
            setSelectedBotId(1);
        }
    }, [numberOfBots]);

    const syncFromGame = useCallback((nextGame) => {
        setGame(nextGame);
        setPlayers(nextGame.players);
        setCommunityCards(nextGame.communityCards);
        setDealerIndex(nextGame.dealerIndex);
        setActivePlayerIndex(nextGame.betting.currentActorIndex ?? -1);
        setPhase(nextGame.phase === 'idle' ? 'idle' : nextGame.phase);
        setWinners(nextGame.winners || []);
        // During hand, pot is simply the sum of all commitments so far
        const totalPot = nextGame.players.reduce((acc, p) => acc + (p.totalCommitted || 0), 0);
        setPot(totalPot);
        setGameMessage(nextGame.message || `Phase: ${getPhaseName(nextGame.phase, nextGame.communityCards)}`);
    }, []);
    
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

    const applyAndRecord = useCallback((playerId, action, amount = 0) => {
        if (!game) return;
        const beforeCommitted = game.players?.[playerId]?.totalCommitted ?? 0;
        const beforePhase = game.phase;
        const beforePot = game.players.reduce((acc, p) => acc + (p.totalCommitted || 0), 0);

        const nextGame = Logic.applyAction(game, playerId, action, amount);
        const afterCommitted = nextGame.players?.[playerId]?.totalCommitted ?? beforeCommitted;
        const delta = Math.max(0, afterCommitted - beforeCommitted);

        let label = action;
        if (action === Logic.ACTIONS.FOLD) label = 'Fold';
        if (action === Logic.ACTIONS.CHECK) label = 'Check';
        if (action === Logic.ACTIONS.CALL) label = delta > 0 ? (nextGame.players?.[playerId]?.status === Logic.PLAYER_STATUS.ALL_IN ? 'All-In' : 'Call') : 'Call';
        if (action === Logic.ACTIONS.BET) label = nextGame.players?.[playerId]?.status === Logic.PLAYER_STATUS.ALL_IN ? 'All-In' : 'Bet';
        if (action === Logic.ACTIONS.RAISE) label = nextGame.players?.[playerId]?.status === Logic.PLAYER_STATUS.ALL_IN ? 'All-In' : 'Raise';
        if (action === Logic.ACTIONS.ALL_IN) label = 'All-In';

        recordMove(playerId, label, delta, beforePot + delta, beforePhase);
        syncFromGame(nextGame);
    }, [game, recordMove, syncFromGame]);

    // --- Player Action Implementations ---

    const performFold = (id) => {
        applyAndRecord(id, Logic.ACTIONS.FOLD);
    };

    const performCheck = (id) => {
        applyAndRecord(id, Logic.ACTIONS.CHECK);
    };

    const performCall = (id) => {
        applyAndRecord(id, Logic.ACTIONS.CALL);
    };

    const performRaise = (id, totalBetAmount) => {
        // Engine will reject illegal under-min raises; also supports all-in short raises.
        if (!game) return;
        const highest = game.betting.highestBetThisRound;
        if (highest === 0) {
            applyAndRecord(id, Logic.ACTIONS.BET, totalBetAmount);
        } else {
            applyAndRecord(id, Logic.ACTIONS.RAISE, totalBetAmount);
        }
    };


    // --- Game Start and Bot Logic (Less critical changes) ---

    const startNewHand = () => {
        if (!game) return;
        setGameMoves([]); // Reset moves for new hand
        const rotated = { ...game, dealerIndex: (game.dealerIndex + 1) % game.players.length };
        const started = Logic.startHand(rotated);
        syncFromGame(started);
        // Reset User UI
        setUserRaiseAmount(BIG_BLIND * 2);
    };

    // --- Bot Logic ---
    useEffect(() => {
        if (!game) return;
        if (game.handOver || game.phase === 'idle' || game.phase === Logic.PHASES.SHOWDOWN) return;
        const idx = game.betting.currentActorIndex;
        if (idx === -1 || idx >= game.players.length) return;
        const currentPlayer = game.players[idx];
        if (!currentPlayer || currentPlayer.isHuman) return;
        // Skip if player cannot act (all-in)
        if (currentPlayer.status !== Logic.PLAYER_STATUS.ACTIVE || currentPlayer.stack === 0) return;

        const legal = Logic.getLegalActions(game, idx);
        const canCheck = legal.canCheck;
        const canCall = legal.canCall;
        
        const delay = Math.floor(Math.random() * 1000) + 1000;
        const actionTimer = setTimeout(() => {
            // Simple Random AI (Weighted) - This will be replaced by your Agentic logic
            const rand = Math.random();
            const highest = game.betting.highestBetThisRound;
            const minRaiseAmt = game.betting.minRaiseAmount;
            const totalBetSize = highest + minRaiseAmt; // Example raise size

            if (canCheck) {
                if (rand > 0.8 && currentPlayer.chips >= totalBetSize) {
                    // If no bet exists yet this street, this is a BET, not a raise.
                    applyAndRecord(idx, highest === 0 ? Logic.ACTIONS.BET : Logic.ACTIONS.RAISE, totalBetSize);
                } else {
                    applyAndRecord(idx, Logic.ACTIONS.CHECK);
                }
            } else { // Facing a bet
                if (rand > 0.8 && currentPlayer.chips >= totalBetSize) {
                    applyAndRecord(idx, Logic.ACTIONS.RAISE, totalBetSize);
                } else if (rand > 0.3 && canCall) {
                    applyAndRecord(idx, Logic.ACTIONS.CALL);
                } else {
                    applyAndRecord(idx, Logic.ACTIONS.FOLD);
                }
            }
        }, delay);

        return () => clearTimeout(actionTimer);
    }, [game, syncFromGame, applyAndRecord]);

    // --- Interaction (Human Player) ---
    const human = players[0];
    // Human can't act if they're all-in (no chips)
    const isHumanTurn = game && game.betting.currentActorIndex === 0 && game.phase !== 'idle' && game.phase !== Logic.PHASES.SHOWDOWN && human && human.stack > 0 && human.status === Logic.PLAYER_STATUS.ACTIVE;
    const legalHuman = game ? Logic.getLegalActions(game, 0) : null;
    const callAmt = legalHuman ? legalHuman.callAmount : 0;
    
    // Slider Limits
    const minTotalRaise = legalHuman ? legalHuman.minTotalBet : BIG_BLIND * 2;
    const maxTotalRaise = legalHuman ? legalHuman.maxTotalBet : 0;

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
                                {(game && game.betting.highestBetThisRound === 0) ? `Bet ${userRaiseAmount}` : `Raise ${userRaiseAmount}`}
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
                            <div className="bot-count-selector">
                                <label>Number of bots: {numberOfBots}</label>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={numberOfBots}
                                    onChange={(e) => {
                                        const newCount = parseInt(e.target.value);
                                        setNumberOfBots(newCount);
                                    }}
                                    className="bot-count-slider"
                                />
                            </div>
                            
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