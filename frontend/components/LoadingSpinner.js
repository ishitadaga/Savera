export default function LoadingSpinner() {
  return (
    <div className="loading">
      <div className="spinner"></div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-dark)', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 700 }}>
        Analyzing Your Roof...
      </h2>
      <p style={{ color: 'var(--text-gray)' }}>
        We're creating your custom solar design using satellite imagery
      </p>
    </div>
  );
}
