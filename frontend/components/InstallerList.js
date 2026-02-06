import { useState } from 'react';

export default function InstallerList({ installers }) {
  const [showAll, setShowAll] = useState(false);

  if (!installers || installers.length === 0) {
    return (
      <div className="installers-info-section">
        <div className="installers-header">
          <h3>
            <span>🔧</span>
            Installers in Your Area
          </h3>
        </div>
        <p className="installers-subtitle">
          No installer data available for this ZIP code.
        </p>
      </div>
    );
  }

  const displayedInstallers = showAll ? installers : installers.slice(0, 3);

  // Generate initials from installer name
  const getInitials = (name) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="installers-info-section">
      <div className="installers-header">
        <h3>
          <span>🔧</span>
          Installers in Your Area
          <span className="installers-count">({installers.length})</span>
        </h3>
      </div>
      <p className="installers-subtitle">
        {installers.length} certified installers serve your ZIP code
      </p>

      {displayedInstallers.map((installer, index) => (
        <div key={index} className="installer-list-item">
          <div className="installer-avatar">
            {getInitials(installer.name)}
          </div>
          <div className="installer-info-compact">
            <span className="installer-name-text">{installer.name}</span>
            <span className="installer-stats">
              {installer.rating && (
                <span className="rating">★ {installer.rating.toFixed(1)}</span>
              )}
              {installer.project_count && (
                <span> • {installer.project_count.toLocaleString()} local projects</span>
              )}
              {installer.avg_cost_per_watt && (
                <span> • ${installer.avg_cost_per_watt.toFixed(2)}/watt avg</span>
              )}
            </span>
          </div>
        </div>
      ))}

      {installers.length > 3 && (
        <button
          className="show-more-installers"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show fewer' : `Show all ${installers.length} installers`}
        </button>
      )}

      <div className="installers-coming-soon">
        <span>💡</span>
        <span>
          <strong>Quote requests coming soon.</strong> For now, search these companies directly or visit EnergySage.com
        </span>
      </div>
    </div>
  );
}
