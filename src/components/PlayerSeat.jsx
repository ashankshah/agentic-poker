// src/components/PlayerSeat.jsx
import React from 'react';
import Card from './Card';

const PlayerSeat = ({ 
  player, 
  seatIndex, 
  isActive, 
  isDealer, 
  isWinner 
}) => {
  // Determine if cards should be shown
  // Human (seat 0) always sees their cards (unless folded logic hides them, but usually we fade)
  // Bots: show only at showdown or if needed logic applies
  const showCards = !player.folded && (player.id === 0 || player.showCards);

  return (
    <div className={`player-seat seat-${seatIndex}`}>
      <div className={`player-info ${isActive ? 'active' : ''} ${isWinner ? 'winner' : ''}`}>
        <div className="player-name">
            {player.name} {isDealer && <span className="dealer-button">D</span>}
        </div>
        <div className="player-chips">${player.chips}</div>
        <div className="player-action">{player.currentAction}</div>
      </div>

      <div className="hand-container" style={{ opacity: player.folded ? 0.5 : 1 }}>
        {player.hand.map((card, idx) => (
          <Card 
            key={`${card.rank}${card.suit}`}
            rank={card.rank}
            suit={card.suit}
            faceUp={showCards}
          />
        ))}
        {/* Render empty card slots if no cards yet (optional visual polish) */}
        {player.hand.length === 0 && <div style={{width:60, height:84}}></div>}
      </div>
    </div>
  );
};

export default PlayerSeat;