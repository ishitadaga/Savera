import { useMemo, useState, useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

export default function SolarDesign({ solarData, selectedPanelCount, onPanelCountChange, address }) {
  const [imageryData, setImageryData] = useState(null);
  const [imageryLoading, setImageryLoading] = useState(false);
  const [imageryError, setImageryError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Fetch building imagery when address changes
  useEffect(() => {
    if (address && solarData) {
      fetchBuildingImagery();
    }
  }, [address]);

  const fetchBuildingImagery = async () => {
    setImageryLoading(true);
    setImageryError(null);
    setImageLoaded(false);
    try {
      const response = await fetch(`${API_URL}/api/building-imagery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const data = await response.json();
      if (data.error) {
        setImageryError(data.error);
      } else {
        setImageryData(data);
      }
    } catch (err) {
      setImageryError('Failed to load aerial imagery');
    } finally {
      setImageryLoading(false);
    }
  };

  if (!solarData) return null;

  const potential = solarData.solarPotential || {};
  const maxPanels = potential.maxArrayPanelsCount || 25;
  
  // Panel specifications from Solar API
  const panelHeightMeters = potential.panelHeightMeters || 1.65;
  const panelWidthMeters = potential.panelWidthMeters || 0.99;
  const panelCapacityWatts = potential.panelCapacityWatts || 400;
  
  const panelCount = selectedPanelCount || maxPanels;
  const minPanels = Math.max(1, Math.floor(maxPanels * 0.1));

  const hasRealImagery = imageryData && !imageryData.mock && imageryData.aerialImageUrl;

  // Calculate panel positions for overlay
  const panelOverlays = useMemo(() => {
    if (!imageryData?.solarPanels || !imageryData?.center) {
      return [];
    }

    const solarPanels = imageryData.solarPanels;
    const center = imageryData.center;
    
    const imgWidth = imageDimensions.width || 800;
    const imgHeight = imageDimensions.height || 600;
    
    const zoom = 19;
    const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
    
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(center.lat * Math.PI / 180);
    
    const degPerPixelLat = metersPerPixel / metersPerDegreeLat;
    const degPerPixelLng = metersPerPixel / metersPerDegreeLng;
    
    const staticMapWidth = 800;
    const staticMapHeight = 600;
    const halfWidthDeg = (staticMapWidth / 2) * degPerPixelLng;
    const halfHeightDeg = (staticMapHeight / 2) * degPerPixelLat;
    
    const mapBounds = {
      west: center.lng - halfWidthDeg,
      east: center.lng + halfWidthDeg,
      south: center.lat - halfHeightDeg,
      north: center.lat + halfHeightDeg
    };
    
    const lngRange = mapBounds.east - mapBounds.west;
    const latRange = mapBounds.north - mapBounds.south;
    
    const panelHeightDeg = panelHeightMeters / metersPerDegreeLat;
    const panelWidthDeg = panelWidthMeters / metersPerDegreeLng;
    
    const basePanelHeight = (panelHeightDeg / latRange) * imgHeight;
    const basePanelWidth = (panelWidthDeg / lngRange) * imgWidth;
    
    const maxPanelDim = Math.min(imgWidth, imgHeight) * 0.05;
    const scaleFactor = Math.min(1, maxPanelDim / Math.max(basePanelHeight, basePanelWidth));
    
    const panelPixelHeight = Math.max(10, basePanelHeight * scaleFactor);
    const panelPixelWidth = Math.max(6, basePanelWidth * scaleFactor);

    return solarPanels.slice(0, panelCount).map((panel, index) => {
      const xPercent = (panel.center.lng - mapBounds.west) / lngRange;
      const yPercent = (mapBounds.north - panel.center.lat) / latRange;
      
      const x = xPercent * imgWidth;
      const y = yPercent * imgHeight;
      
      const isPortrait = panel.orientation === 'PORTRAIT';
      const w = isPortrait ? panelPixelWidth : panelPixelHeight;
      const h = isPortrait ? panelPixelHeight : panelPixelWidth;
      
      return {
        id: index,
        x: x - w / 2,
        y: y - h / 2,
        width: w,
        height: h,
        orientation: panel.orientation,
        yearlyEnergy: panel.yearlyEnergyDcKwh || 0,
      };
    });
  }, [imageryData, panelCount, imageDimensions, panelHeightMeters, panelWidthMeters]);

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(prev - 0.25, 1);
      if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
      return newZoom;
    });
  };

  // Pan handlers
  const handleMouseDown = (e) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && zoomLevel > 1) {
      const container = containerRef.current;
      if (!container) return;
      
      const maxPan = (zoomLevel - 1) * 150;
      const newX = Math.max(-maxPan, Math.min(maxPan, e.clientX - dragStart.x));
      const newY = Math.max(-maxPan, Math.min(maxPan, e.clientY - dragStart.y));
      
      setPanPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleImageLoad = (e) => {
    setImageLoaded(true);
    setImageDimensions({
      width: e.target.clientWidth,
      height: e.target.clientHeight
    });
  };

  return (
    <div className="satellite-panel">
      {/* Zoom Controls */}
      <div className="zoom-controls">
        <button onClick={handleZoomIn} disabled={zoomLevel >= 3} title="Zoom In">+</button>
        <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
        <button onClick={handleZoomOut} disabled={zoomLevel <= 1} title="Zoom Out">−</button>
      </div>

      {/* Satellite Image Container */}
      <div 
        ref={containerRef}
        className="satellite-image-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {imageryLoading ? (
          <div className="imagery-loading">
            <div className="loading-spinner-small"></div>
            <p>Loading satellite imagery...</p>
          </div>
        ) : hasRealImagery ? (
          <div 
            className="satellite-image-wrapper"
            style={{
              transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease'
            }}
          >
            {!imageLoaded && (
              <div className="imagery-loading">
                <div className="loading-spinner-small"></div>
              </div>
            )}
            <img 
              ref={imageRef}
              src={imageryData.aerialImageUrl} 
              alt="Aerial view of property"
              className="satellite-image"
              style={{ opacity: imageLoaded ? 1 : 0 }}
              onLoad={handleImageLoad}
              onError={() => setImageryError('Failed to load image')}
              draggable={false}
            />
            
            {/* Solar Panels Overlay */}
            {imageLoaded && panelOverlays.length > 0 && (
              <div className="panels-overlay">
                {panelOverlays.map((panel) => (
                  <div
                    key={panel.id}
                    className="solar-panel-overlay"
                    style={{
                      left: `${(panel.x / imageDimensions.width) * 100}%`,
                      top: `${(panel.y / imageDimensions.height) * 100}%`,
                      width: `${(panel.width / imageDimensions.width) * 100}%`,
                      height: `${(panel.height / imageDimensions.height) * 100}%`,
                    }}
                  >
                    <div className="panel-grid">
                      <div className="panel-cell"></div>
                      <div className="panel-cell"></div>
                      <div className="panel-cell"></div>
                      <div className="panel-cell"></div>
                      <div className="panel-cell"></div>
                      <div className="panel-cell"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="no-imagery">
            <p>📍 {address}</p>
            <p className="no-imagery-msg">Satellite imagery unavailable</p>
          </div>
        )}
      </div>

      {/* Address Label */}
      {hasRealImagery && imageLoaded && (
        <div className="address-label">
          📍 {address}
        </div>
      )}
    </div>
  );
}
