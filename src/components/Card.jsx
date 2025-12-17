// src/components/Card.jsx
import React from 'react';

const Card = ({ rank, suit, faceUp }) => {
  // Construct image paths
  const frontSrc = `/images/${rank}${suit}.png`;
  const backSrc = `/images/card_back.png`; // Ensure you have a generic back image

  return (
    <div className="card-scene">
      <div className={`card-object ${faceUp ? 'is-flipped' : ''}`}>
        {/* Back Face (Default visible when dealt) */}
        <div className="card-face card-face-back">
          <img src={backSrc} alt="Card Back" className="card-img" />
        </div>

        {/* Front Face (Visible when flipped) */}
        <div className="card-face card-face-front">
          <img src={frontSrc} alt={`${rank}${suit}`} className="card-img" />
        </div>
      </div>
    </div>
  );
};

export default Card;