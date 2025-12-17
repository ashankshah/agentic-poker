// src/components/Table.jsx
import React from 'react';
import PlayerSeat from './PlayerSeat';
import Card from './Card';

const Table = ({ 
  players, 
  communityCards, 
  pot, 
  activePlayerIndex, 
  dealerIndex, 
  winners,
  gameStatus
}) => {
  return (
    <div className="poker-table">
      {players.map((player, index) => (
        <PlayerSeat
          key={player.id}
          seatIndex={index}
          player={player}
          isActive={index === activePlayerIndex}
          isDealer={index === dealerIndex}
          isWinner={winners.includes(player.id)}
        />
      ))}

      <div className="table-center">
        <div className="pot-display">Pot: ${pot}</div>
        
        <div className="community-cards">
          {communityCards.map((card, idx) => (
            <Card 
              key={`${card.rank}${card.suit}`} 
              rank={card.rank} 
              suit={card.suit} 
              faceUp={true} 
            />
          ))}
        </div>
        
        {/* Helper text for user during game */}
        {/* {gameStatus && <div className="game-status">{gameStatus}</div>} */}
      </div>
    </div>
  );
};

export default Table;