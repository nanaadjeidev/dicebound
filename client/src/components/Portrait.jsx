import { useState } from 'react';
import GameIcon from './GameIcon.jsx';

/** Painted portrait with a heraldic fallback when there is no image (or it fails to load). */
export default function Portrait({ src, icon, color = '#c9a45c', alt = '', className = '', shape = 'circle', children }) {
  const [broken, setBroken] = useState(null);
  const showImage = src && broken !== src;
  return (
    <div className={`portrait portrait--${shape} ${className}`} style={{ '--accent': color }}>
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" draggable="false" onError={() => setBroken(src)} />
      ) : (
        <div className="portrait__fallback">
          <GameIcon name={icon} size="52%" color={color} />
        </div>
      )}
      {children}
    </div>
  );
}
