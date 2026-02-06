export default function LoadingSpinner() {
  return (
    <div className="loading">
      <div className="sunshine-loader">
        <div className="sunshine-core"></div>
        <div className="sunshine-glow"></div>
        <div className="sunshine-rays"></div>
      </div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-dark)', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 700 }}>
        Analyzing Your Roof...
      </h2>
      <p style={{ color: 'var(--text-gray)' }}>
        We're creating your custom solar design using satellite imagery
      </p>
    </div>
  );
}
