import { useState } from 'react';
import Head from 'next/head';
import AddressForm from '../components/AddressForm';
import SolarDesign from '../components/SolarDesign';
import InstallerList from '../components/InstallerList';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function Home() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState(null);
  const [locationData, setLocationData] = useState(null);
  
  const [solarData, setSolarData] = useState(null);
  const [pricingData, setPricingData] = useState(null);
  const [installers, setInstallers] = useState([]);
  const [selectedPanelCount, setSelectedPanelCount] = useState(null);
  const [savingsFlipped, setSavingsFlipped] = useState(false);
  const [costFlipped, setCostFlipped] = useState(false);

  const handleAddressSubmit = async (data) => {
    setLoading(true);
    setError(null);
    setFormData(data);

    try {
      const geocodeRes = await fetch(`${API_URL}/api/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: data.address })
      });
      const geocodeData = await geocodeRes.json();
      
      if (geocodeData.error) {
        throw new Error(geocodeData.error);
      }
      
      setLocationData(geocodeData);

      const solarRes = await fetch(`${API_URL}/api/solar-potential`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: data.address })
      });
      const solarResult = await solarRes.json();
      setSolarData(solarResult);
      
      if (solarResult.solarPotential?.solarPanelConfigs?.length > 0) {
        const configs = solarResult.solarPotential.solarPanelConfigs;
        const midIndex = Math.floor(configs.length / 2);
        setSelectedPanelCount(configs[midIndex]?.panelsCount || configs[0]?.panelsCount);
      }

      const systemSizeKw = solarResult.solarPotential?.maxArrayPanelsCount * 0.4 || 6;
      const pricingRes = await fetch(`${API_URL}/api/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip_code: data.zipCode,
          system_size_kw: systemSizeKw,
          utility: data.utility
        })
      });
      const pricingResult = await pricingRes.json();
      setPricingData(pricingResult);

      const installersRes = await fetch(`${API_URL}/api/installers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip_code: data.zipCode,
          city: data.city,
          utility: data.utility,
          limit: 15
        })
      });
      const installersResult = await installersRes.json();
      setInstallers(installersResult.installers || []);

      setStep(2);
    } catch (err) {
      setError(err.message || 'Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePanelCountChange = async (panelCount) => {
    setSelectedPanelCount(panelCount);
    
    const systemSizeKw = panelCount * 0.4;
    
    try {
      const pricingRes = await fetch(`${API_URL}/api/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip_code: formData?.zipCode || '',
          system_size_kw: systemSizeKw,
          utility: formData?.utility || ''
        })
      });
      const pricingResult = await pricingRes.json();
      setPricingData(pricingResult);
    } catch (err) {
      console.error('Failed to update pricing:', err);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setFormData(null);
    setLocationData(null);
    setSolarData(null);
    setPricingData(null);
    setInstallers([]);
    setSelectedPanelCount(null);
    setError(null);
  };

  return (
    <>
      <Head>
        <title>SolarVision - Your Solar Installation Journey</title>
        <meta name="description" content="Get your personalized solar estimate for California homes" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☀️</text></svg>" />
      </Head>

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">SolarVision</div>
          <div className="progress-bar">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}></div>
          </div>
        </div>
      </header>

      <div className="container">
        {/* Error Message */}
        {error && (
          <div className="max-w-xl mx-auto mb-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Address Form */}
        {step === 1 && !loading && (
          <div className="animate-fade-in">
            <AddressForm onSubmit={handleAddressSubmit} loading={loading} />
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <LoadingSpinner />
        )}

        {/* Step 2: Results */}
        {step === 2 && !loading && (
          <div className="animate-fade-in results-page">
            {/* Demo Mode Notice */}
            {solarData?.mock && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-amber-800">
                  <strong>Demo Mode:</strong> Using sample solar data. Add your Google Solar API key for actual roof analysis.
                </p>
              </div>
            )}

            <div className="split-layout">
              {/* Left Panel - Satellite Image */}
              <div className="left-panel">
                <SolarDesign 
                  solarData={solarData} 
                  selectedPanelCount={selectedPanelCount}
                  onPanelCountChange={handlePanelCountChange}
                  address={`${formData?.streetAddress}, ${formData?.city}, CA ${formData?.zipCode}`}
                />
              </div>

              {/* Right Panel - 4 Sections */}
              <div className="right-panel">
                {/* Section 1: Metrics */}
                <div className="metrics-section">
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <span className="metric-icon">☀️</span>
                      <div className="metric-content">
                        <span className="metric-value">{solarData?.solarPotential?.maxSunshineHoursPerYear || 1800}</span>
                        <span className="metric-label">Sun hrs/yr</span>
                      </div>
                    </div>
                    <div className="metric-card">
                      <span className="metric-icon">⚡</span>
                      <div className="metric-content">
                        <span className="metric-value">{(((selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 0) * (solarData?.solarPotential?.panelCapacityWatts || 400)) / 1000).toFixed(1)}</span>
                        <span className="metric-label">kW System</span>
                      </div>
                    </div>
                    <div className="metric-card">
                      <span className="metric-icon">🔋</span>
                      <div className="metric-content">
                        <span className="metric-value">{Math.round((solarData?.solarPotential?.solarPanelConfigs?.find(c => c.panelsCount === selectedPanelCount)?.yearlyEnergyDcKwh || (selectedPanelCount || 20) * 480) / 1000)}</span>
                        <span className="metric-label">MWh/year</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Panel Slider */}
                  <div className="panel-slider-container">
                    <label>Adjust Panels: {selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 0}</label>
                    <div className="panel-slider-row">
                      <button 
                        className="slider-btn"
                        onClick={() => handlePanelCountChange(Math.max(1, (selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 10) - 1))}
                      >−</button>
                      <input 
                        type="range" 
                        min={Math.max(1, Math.floor((solarData?.solarPotential?.maxArrayPanelsCount || 25) * 0.1))}
                        max={solarData?.solarPotential?.maxArrayPanelsCount || 25}
                        value={selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 10}
                        onChange={(e) => handlePanelCountChange(parseInt(e.target.value))}
                        className="panel-slider"
                      />
                      <button 
                        className="slider-btn"
                        onClick={() => handlePanelCountChange(Math.min(solarData?.solarPotential?.maxArrayPanelsCount || 25, (selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 10) + 1))}
                      >+</button>
                    </div>
                  </div>
                </div>

                {/* Sections 2 & 3: Savings and Cost Side by Side - Flippable */}
                <div className="savings-cost-row">
                {/* Savings Chart - Flippable */}
                <div className={`flip-card ${savingsFlipped ? 'flipped' : ''}`} onClick={() => setSavingsFlipped(!savingsFlipped)}>
                  <div className="flip-card-inner">
                    <div className="flip-card-front savings-section">
                      <div className="card-header">
                        <h4>Total Cost: Solar vs No Solar</h4>
                        <span className="flip-hint">ⓘ</span>
                      </div>
                      {(() => {
                        // Home electricity usage: ~7000 kWh/year = $2100/year
                        const homeUsageKwh = 7000;
                        const yearlyBillWithoutSolar = homeUsageKwh * 0.30; // $2100
                        
                        // Solar production based on selected panels
                        const solarProductionKwh = solarData?.solarPotential?.solarPanelConfigs?.find(c => c.panelsCount === selectedPanelCount)?.yearlyEnergyDcKwh || (selectedPanelCount || 20) * 480;
                        
                        // Coverage: what % of your usage does solar cover?
                        const coveragePercent = Math.min(100, (solarProductionKwh / homeUsageKwh) * 100);
                        
                        // Remaining grid electricity needed
                        const remainingGridKwh = Math.max(0, homeUsageKwh - solarProductionKwh);
                        const yearlyBillWithSolar = remainingGridKwh * 0.30;
                        
                        // Solar system cost (net after tax credit)
                        const panelCount = selectedPanelCount || 20;
                        const systemSizeKw = panelCount * (solarData?.solarPotential?.panelCapacityWatts || 400) / 1000;
                        const costPerWatt = pricingData?.avg_cost_per_watt || 3.50;
                        const grossCost = costPerWatt * systemSizeKw * 1000;
                        const netCost = grossCost * 0.70; // After 30% tax credit
                        
                        const yearlySavings = yearlyBillWithoutSolar - yearlyBillWithSolar;
                        
                        // Chart shows TOTAL cumulative cost over time
                        // Without solar: just electricity bills
                        // With solar: upfront investment + remaining grid bills
                        const dataPoints = [0, 5, 10, 15, 20, 25].map(year => ({
                          year,
                          withoutSolar: Math.round(yearlyBillWithoutSolar * year),
                          withSolar: Math.round(netCost + (yearlyBillWithSolar * year))
                        }));
                        const maxCost = Math.max(dataPoints[dataPoints.length - 1].withoutSolar, dataPoints[0].withSolar);
                        
                        // Find break-even year (where lines cross)
                        const breakEvenYear = yearlySavings > 0 ? netCost / yearlySavings : 99;
                        
                        return (
                          <div className="line-chart-container">
                            <div className="coverage-badge">
                              {coveragePercent.toFixed(0)}% coverage
                            </div>
                            <svg viewBox="0 0 280 120" className="line-chart">
                              {/* Grid lines */}
                              <line x1="35" y1="85" x2="265" y2="85" stroke="#f1f5f9" strokeWidth="1" />
                              <line x1="35" y1="55" x2="265" y2="55" stroke="#f1f5f9" strokeWidth="1" />
                              <line x1="35" y1="25" x2="265" y2="25" stroke="#f1f5f9" strokeWidth="1" />
                              {/* Y-axis labels */}
                              <text x="32" y="88" fontSize="7" fill="#94a3b8" textAnchor="end">$0</text>
                              <text x="32" y="28" fontSize="7" fill="#94a3b8" textAnchor="end">${(maxCost / 1000).toFixed(0)}k</text>
                              {/* X-axis labels */}
                              {dataPoints.map((point, i) => (
                                <text key={i} x={35 + (i * 46)} y="97" fontSize="7" fill="#94a3b8" textAnchor="middle">
                                  {point.year === 0 ? 'Now' : `${point.year}yr`}
                                </text>
                              ))}
                              {/* Without Solar line (red) - electricity bills only */}
                              <path
                                d={dataPoints.map((point, i) => {
                                  const x = 35 + (i * 46);
                                  const y = 85 - (point.withoutSolar / maxCost) * 60;
                                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                }).join(' ')}
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                              {/* With Solar line (green/amber) - investment + grid bills */}
                              <path
                                d={dataPoints.map((point, i) => {
                                  const x = 35 + (i * 46);
                                  const y = 85 - (point.withSolar / maxCost) * 60;
                                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                }).join(' ')}
                                fill="none"
                                stroke={coveragePercent >= 100 ? "#10B981" : "#f59e0b"}
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                              {/* Break-even marker if within 25 years */}
                              {breakEvenYear <= 25 && breakEvenYear > 0 && (
                                <g>
                                  <line 
                                    x1={35 + (breakEvenYear / 25) * 230} 
                                    y1="25" 
                                    x2={35 + (breakEvenYear / 25) * 230} 
                                    y2="85" 
                                    stroke="#10B981" 
                                    strokeWidth="1" 
                                    strokeDasharray="3,2" 
                                  />
                                  <circle cx={35 + (breakEvenYear / 25) * 230} cy={85 - (netCost + yearlyBillWithSolar * breakEvenYear) / maxCost * 60} r="4" fill="#10B981" stroke="white" strokeWidth="1.5" />
                                </g>
                              )}
                              {/* Dots */}
                              {dataPoints.map((point, i) => (
                                <g key={i}>
                                  <circle cx={35 + (i * 46)} cy={85 - (point.withoutSolar / maxCost) * 60} r="2.5" fill="#ef4444" />
                                  <circle cx={35 + (i * 46)} cy={85 - (point.withSolar / maxCost) * 60} r="2.5" fill={coveragePercent >= 100 ? "#10B981" : "#f59e0b"} />
                                </g>
                              ))}
                              {/* Legend */}
                              <line x1="35" y1="110" x2="50" y2="110" stroke="#ef4444" strokeWidth="2" />
                              <text x="53" y="112" fontSize="7" fill="#64748b">No Solar (bills)</text>
                              <line x1="130" y1="110" x2="145" y2="110" stroke={coveragePercent >= 100 ? "#10B981" : "#f59e0b"} strokeWidth="2" />
                              <text x="148" y="112" fontSize="7" fill="#64748b">With Solar (total)</text>
                            </svg>
                            <div className="yearly-comparison">
                              <span>Bills: <strong className="text-red">${yearlyBillWithoutSolar.toLocaleString()}</strong>/yr → <strong className="text-green">${Math.round(yearlyBillWithSolar).toLocaleString()}</strong>/yr</span>
                              <span className="savings-badge">Break-even: {breakEvenYear <= 25 ? `${breakEvenYear.toFixed(1)}yr` : '>25yr'}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flip-card-back savings-section-back">
                      <div className="card-header">
                        <h3>How Savings Are Calculated</h3>
                        <span className="flip-hint">✕</span>
                      </div>
                      <div className="card-explanation">
                        <p><strong>Definition:</strong> Cumulative electricity bill savings over time. This is the money you would have paid to your utility company for electricity, but instead you generate it yourself for free with solar.</p>
                        <div className="formula">
                          <span className="formula-label">Formula:</span>
                          <code>Yearly Savings = Annual Energy (kWh) × $0.30/kWh</code>
                        </div>
                        <ul>
                          <li><strong>Annual Energy:</strong> kWh your panels produce yearly, based on panel count, local sun hours, and panel efficiency (from Google Solar API)</li>
                          <li><strong>$0.30/kWh:</strong> What you currently pay your utility (PG&E, SCE, SDG&E) per kWh <em>without</em> solar. This is the CA average residential rate.</li>
                          <li><strong>Without Solar:</strong> A typical CA home uses ~7,000 kWh/year = ~$2,100/year in electricity bills</li>
                          <li><strong>With Solar:</strong> Your panels offset most/all of this cost, so you keep that money</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* System Cost - Flippable */}
                <div className={`flip-card ${costFlipped ? 'flipped' : ''}`} onClick={() => setCostFlipped(!costFlipped)}>
                  <div className="flip-card-inner">
                    <div className="flip-card-front cost-section">
                      <div className="card-header">
                        <h3>Cost Breakdown</h3>
                        <span className="flip-hint">ⓘ</span>
                      </div>
                      <div className="cost-breakdown">
                        {(() => {
                          const panelCount = selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 20;
                          const systemSizeKw = panelCount * (solarData?.solarPotential?.panelCapacityWatts || 400) / 1000;
                          const costPerWatt = pricingData?.avg_cost_per_watt || 3.50;
                          const grossCost = costPerWatt * systemSizeKw * 1000;
                          
                          // Detailed cost breakdown
                          const equipmentCost = grossCost * 0.55; // ~55% equipment
                          const laborCost = grossCost * 0.25; // ~25% labor/installation
                          const overheadCost = grossCost * 0.20; // ~20% permits, overhead
                          const federalCredit = grossCost * 0.30;
                          const netCost = grossCost - federalCredit;
                          
                          // Calculate actual energy and hybrid costs
                          const homeUsageKwh = 7000;
                          const solarProductionKwh = solarData?.solarPotential?.solarPanelConfigs?.find(c => c.panelsCount === selectedPanelCount)?.yearlyEnergyDcKwh || (selectedPanelCount || 20) * 480;
                          const remainingGridKwh = Math.max(0, homeUsageKwh - solarProductionKwh);
                          const coveragePercent = Math.min(100, (solarProductionKwh / homeUsageKwh) * 100);
                          
                          const yearlyBillWithoutSolar = homeUsageKwh * 0.30;
                          const yearlyBillWithSolar = remainingGridKwh * 0.30;
                          const yearlySavings = yearlyBillWithoutSolar - yearlyBillWithSolar;
                          
                          // 25-year totals
                          const totalBillWithoutSolar = yearlyBillWithoutSolar * 25;
                          const totalGridCost = yearlyBillWithSolar * 25;
                          const totalWithSolar = netCost + totalGridCost;
                          const totalSavings = totalBillWithoutSolar - totalWithSolar;
                          
                          const paybackYears = yearlySavings > 0 ? Math.min(netCost / yearlySavings, 30) : 30;
                          
                          return (
                            <>
                              {/* Installation Cost Breakdown */}
                              <div className="cost-category">
                                <div className="cost-category-title">Installation Cost</div>
                                <div className="cost-row small">
                                  <span>Equipment (panels, inverter)</span>
                                  <span className="cost-value">${Math.round(equipmentCost).toLocaleString()}</span>
                                </div>
                                <div className="cost-row small">
                                  <span>Labor & Installation</span>
                                  <span className="cost-value">${Math.round(laborCost).toLocaleString()}</span>
                                </div>
                                <div className="cost-row small">
                                  <span>Permits & Overhead</span>
                                  <span className="cost-value">${Math.round(overheadCost).toLocaleString()}</span>
                                </div>
                                <div className="cost-row small credit">
                                  <span>Federal Tax Credit (30%)</span>
                                  <span className="cost-value green">-${Math.round(federalCredit).toLocaleString()}</span>
                                </div>
                                <div className="cost-row subtotal">
                                  <span>Net Installation</span>
                                  <span className="cost-value">${Math.round(netCost).toLocaleString()}</span>
                                </div>
                              </div>
                              
                              {/* Ongoing Utility Cost */}
                              <div className="cost-category">
                                <div className="cost-category-title">
                                  {remainingGridKwh > 0 
                                    ? `Remaining Utility (${(100 - coveragePercent).toFixed(0)}% from grid)`
                                    : `Utility Cost (100% solar covered ✓)`
                                  }
                                </div>
                                {remainingGridKwh > 0 ? (
                                  <>
                                    <div className="cost-row small">
                                      <span>Grid electricity/year</span>
                                      <span className="cost-value">${Math.round(yearlyBillWithSolar).toLocaleString()}/yr</span>
                                    </div>
                                    <div className="cost-row small">
                                      <span>Over 25 years</span>
                                      <span className="cost-value">${Math.round(totalGridCost).toLocaleString()}</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="cost-row small" style={{color: '#10B981'}}>
                                    <span>Your panels cover all your electricity needs!</span>
                                    <span className="cost-value green">$0/yr</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Break-Even Summary */}
                              <div className="break-even-summary">
                                <div className="break-even-row">
                                  <span>Break-even point</span>
                                  <span className="break-even-value">{paybackYears > 25 ? '>25' : paybackYears.toFixed(1)} years</span>
                                </div>
                                <div className="break-even-row highlight">
                                  <span>25-year savings</span>
                                  <span className="break-even-value large">${Math.round(totalSavings).toLocaleString()}</span>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flip-card-back cost-section-back">
                      <div className="card-header">
                        <h3>How Cost Is Calculated</h3>
                        <span className="flip-hint">✕</span>
                      </div>
                      <div className="card-explanation">
                        <p><strong>Definition:</strong> One-time upfront cost to purchase and install solar panels on your roof. This does NOT include ongoing electricity costs—after installation, the sun provides free energy!</p>
                        <div className="formula">
                          <span className="formula-label">Formula:</span>
                          <code>Gross = Panels × 400W × $/Watt</code>
                        </div>
                        <p><strong>What's Included:</strong></p>
                        <ul>
                          <li>Solar panels, inverter, mounting hardware</li>
                          <li>Labor, permits, and interconnection fees</li>
                          <li>System monitoring equipment</li>
                        </ul>
                        <p><strong>Break-Even Point:</strong></p>
                        <ul>
                          <li><strong>Payback Period:</strong> Net Cost ÷ Annual Savings</li>
                          <li>After this point, your electricity is essentially <em>free</em></li>
                          <li>Panels last 25-30 years, so you enjoy 15-20+ years of pure savings!</li>
                        </ul>
                        <p className="note">*Costs vary by installer, roof type, and local permits</p>
                      </div>
                    </div>
                  </div>
                </div>
                </div>

                {/* Section 4: Installers */}
                <div className="installers-section-compact">
                  <h3>Top Installers ({installers.length})</h3>
                  <div className="installers-scroll">
                    {installers.slice(0, 10).map((installer, index) => (
                      <div key={index} className="installer-row">
                        <div className="installer-initials">
                          {installer.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                        </div>
                        <div className="installer-details-compact">
                          <span className="installer-name">{installer.name}</span>
                          <span className="installer-meta">
                            {installer.rating ? `★ ${installer.rating.toFixed(1)}` : ''} 
                            {installer.project_count ? ` • ${installer.project_count.toLocaleString()} projects` : ''}
                          </span>
                        </div>
                        <button className="quote-btn">Quote</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Start Over Button */}
            <div className="text-center mt-6">
              <button
                onClick={handleStartOver}
                className="btn-secondary"
              >
                ← Start New Estimate
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-200 text-center">
          <p className="text-gray-400 text-sm">
            Pricing data from California DG Stats interconnection records
          </p>
        </footer>
      </div>
    </>
  );
}
