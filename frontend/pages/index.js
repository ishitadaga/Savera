import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import AddressForm from '../components/AddressForm';
import SolarDesign from '../components/SolarDesign';
import InstallerList from '../components/InstallerList';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

// California utility rate plans (2025-2026 rates)
const UTILITY_RATES = {
  'PGE': [
    { id: 'E-TOU-C', name: 'E-TOU-C (Time-of-Use)', rate: 0.38, peak: 0.45, offpeak: 0.35, description: 'Most common residential TOU' },
    { id: 'E-TOU-D', name: 'E-TOU-D (Time-of-Use)', rate: 0.36, peak: 0.50, offpeak: 0.32, description: 'Best for EV owners' },
    { id: 'E-1', name: 'E-1 (Tiered)', rate: 0.32, description: 'Basic tiered rate' },
    { id: 'EV2-A', name: 'EV2-A (EV Rate)', rate: 0.34, peak: 0.55, offpeak: 0.25, description: 'Electric vehicle rate' },
  ],
  'SCE': [
    { id: 'TOU-D-4-9PM', name: 'TOU-D-4-9PM', rate: 0.34, peak: 0.47, offpeak: 0.29, description: 'Standard TOU' },
    { id: 'TOU-D-5-8PM', name: 'TOU-D-5-8PM', rate: 0.35, peak: 0.49, offpeak: 0.30, description: 'Shorter peak window' },
    { id: 'D', name: 'Domestic (Tiered)', rate: 0.30, description: 'Basic tiered rate' },
  ],
  'SDGE': [
    { id: 'TOU-DR1', name: 'TOU-DR1', rate: 0.42, peak: 0.60, offpeak: 0.35, description: 'Standard residential TOU' },
    { id: 'TOU-DR2', name: 'TOU-DR2', rate: 0.40, peak: 0.55, offpeak: 0.33, description: 'Lower peak rate' },
    { id: 'DR', name: 'DR (Tiered)', rate: 0.38, description: 'Basic tiered rate' },
  ],
};

// Home usage presets (kWh/year)
const HOME_USAGE_PRESETS = [
  { id: 'bill', name: 'My Monthly Bill', kwh: null, description: 'Enter your bill amount' },
  { id: 'small', name: 'Small Home', kwh: 5000, description: 'Apartment or small house' },
  { id: 'medium', name: 'Medium Home', kwh: 7000, description: 'Average CA home' },
  { id: 'large', name: 'Large Home', kwh: 10000, description: 'Larger home with AC' },
  { id: 'xlarge', name: 'Extra Large', kwh: 14000, description: 'Large home + EV/pool' },
  { id: 'custom', name: 'Custom kWh', kwh: null, description: 'Enter your own' },
];

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
  // Expandable section states (replacing flip cards)
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [showSavingsChart, setShowSavingsChart] = useState(false);
  
  // Battery storage state
  const [includeBattery, setIncludeBattery] = useState(false);
  const [batteryCapacity, setBatteryCapacity] = useState(13.5); // Default Tesla Powerwall size

  // California incentives (SGIP, etc.) - no longer available for most customers
  const [includeCAIncentives, setIncludeCAIncentives] = useState(false);

  // Utility rate customization state
  const [selectedRatePlan, setSelectedRatePlan] = useState(null); // Will be set based on utility
  const [electricityRate, setElectricityRate] = useState(0.30); // $/kWh
  const [homeUsagePreset, setHomeUsagePreset] = useState('medium');
  const [homeUsageKwh, setHomeUsageKwh] = useState(7000); // kWh/year
  const [monthlyBill, setMonthlyBill] = useState(175); // $/month (default for medium home)
  // showRateSettings removed - rate settings always visible in customize panel

  // Sticky mobile CTA state
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const installerSectionRef = useRef(null);

  // Scroll listener for sticky mobile CTA
  useEffect(() => {
    // Only run on mobile/tablet
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      // Show sticky CTA when scrolled past 300px and on results page
      const scrolled = window.scrollY > 300;
      const isMobile = window.innerWidth < 768;
      const onResultsPage = step === 2 && !loading;

      setShowStickyCTA(scrolled && isMobile && onResultsPage);
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [step, loading]);

  const scrollToInstallers = () => {
    installerSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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

      // Set initial rate plan based on utility
      const utilityRates = UTILITY_RATES[data.utility] || UTILITY_RATES['PGE'];
      const defaultPlan = utilityRates[0];
      setSelectedRatePlan(defaultPlan.id);
      setElectricityRate(defaultPlan.rate);

      const systemSizeKw = solarResult.solarPotential?.maxArrayPanelsCount * 0.4 || 6;
      const pricingRes = await fetch(`${API_URL}/api/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip_code: data.zipCode,
          system_size_kw: systemSizeKw,
          utility: data.utility,
          include_battery: includeBattery,
          battery_capacity_kwh: batteryCapacity
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
          utility: formData?.utility || '',
          include_battery: includeBattery,
          battery_capacity_kwh: batteryCapacity
        })
      });
      const pricingResult = await pricingRes.json();
      setPricingData(pricingResult);
    } catch (err) {
      console.error('Failed to update pricing:', err);
    }
  };

  // Handle battery toggle and capacity changes
  const handleBatteryChange = async (newIncludeBattery, newCapacity = batteryCapacity) => {
    setIncludeBattery(newIncludeBattery);
    if (newCapacity !== batteryCapacity) {
      setBatteryCapacity(newCapacity);
    }
    
    if (!formData) return;
    
    const panelCount = selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 20;
    const systemSizeKw = panelCount * 0.4;
    
    try {
      const pricingRes = await fetch(`${API_URL}/api/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip_code: formData.zipCode || '',
          system_size_kw: systemSizeKw,
          utility: formData.utility || '',
          include_battery: newIncludeBattery,
          battery_capacity_kwh: newCapacity
        })
      });
      const pricingResult = await pricingRes.json();
      setPricingData(pricingResult);
    } catch (err) {
      console.error('Failed to update pricing with battery:', err);
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
    setIncludeBattery(false);
    setBatteryCapacity(13.5);
    setIncludeCAIncentives(false);
    setSelectedRatePlan(null);
    setElectricityRate(0.30);
    setHomeUsagePreset('medium');
    setHomeUsageKwh(7000);
    setMonthlyBill(175);
    setShowCostDetails(false);
    setShowSavingsChart(false);
  };

  return (
    <>
      <Head>
        <title>savEra - Your Solar Installation Journey</title>
        <meta name="description" content="Get your personalized solar estimate for California homes" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 24%22><defs><linearGradient id=%22g%22 x1=%220%25%22 y1=%220%25%22 x2=%22100%25%22 y2=%22100%25%22><stop offset=%220%25%22 stop-color=%22%23f59e0b%22/><stop offset=%22100%25%22 stop-color=%22%23ea580c%22/></linearGradient></defs><path d=%22M8 20 A12 12 0 0 1 32 20%22 fill=%22url(%23g)%22/><line x1=%222%22 y1=%220%22 x2=%2238%22 y2=%2220%22 stroke=%22url(%23g)%22 stroke-width=%222%22/></svg>" />
      </Head>

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-text-with-sun">
              <svg className="logo-sun" viewBox="0 0 36 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="sunGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                </defs>
                {/* Sun rays - more rays radiating out */}
                <line x1="18" y1="1" x2="18" y2="5" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="3" x2="12" y2="6" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                <line x1="26" y1="3" x2="24" y2="6" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                <line x1="5" y1="8" x2="8" y2="9" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                <line x1="31" y1="8" x2="28" y2="9" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                <line x1="2" y1="14" x2="6" y2="13" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                <line x1="34" y1="14" x2="30" y2="13" stroke="url(#sunGradient)" strokeWidth="2" strokeLinecap="round" />
                {/* Half sun (semicircle) */}
                <path d="M6 18 A12 12 0 0 1 30 18" fill="url(#sunGradient)" />
              </svg>
              <span className="logo-sav">sav</span>
            </span>
            <span className="logo-era">Era</span>
          </div>
          <div className="progress-indicator">
            <div className={`progress-step-labeled ${step >= 1 ? 'active' : ''}`}>
              <div className="step-dot"></div>
              <span className="step-label">Your Home</span>
            </div>
            <div className={`progress-line ${step >= 2 ? 'completed' : ''}`}></div>
            <div className={`progress-step-labeled ${step >= 2 ? 'active' : ''}`}>
              <div className="step-dot"></div>
              <span className="step-label">Your Estimate</span>
            </div>
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

            {/* Calculate all values upfront for hero metrics and sections */}
            {(() => {
              const panelCount = selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 20;
              const systemSizeKw = panelCount * (solarData?.solarPotential?.panelCapacityWatts || 400) / 1000;
              const solarProductionKwhDc = solarData?.solarPotential?.solarPanelConfigs?.find(c => c.panelsCount === selectedPanelCount)?.yearlyEnergyDcKwh || panelCount * 480;
              // Apply 85% DC-to-AC derate (Google Solar API standard)
              const solarProductionKwh = solarProductionKwhDc * 0.85;
              const coveragePercent = Math.min(100, (solarProductionKwh / homeUsageKwh) * 100);

              // Try to get Google's financial analysis for this bill amount
              const financialAnalyses = solarData?.solarPotential?.financialAnalyses || [];
              const matchingAnalysis = financialAnalyses.find(fa => {
                const bill = parseInt(fa.monthlyBill?.units || 0);
                return Math.abs(bill - monthlyBill) <= 25; // Within $25 of user's bill
              });
              const googleFinancials = matchingAnalysis?.financialDetails;
              const googleExportPercent = googleFinancials?.percentageExportedToGrid;

              // NEM 3.0 Calculation (California, effective April 2023)
              // Use Google's export percentage if available, otherwise use estimates
              const NEM3_EXPORT_RATE = 0.08; // Average avoided cost rate

              // Base self-consumption from Google data or default estimate
              const baseSelfConsumption = googleExportPercent
                ? (100 - googleExportPercent) / 100
                : 0.48; // Default ~48% without battery

              // Battery increases self-consumption by ~25-30 percentage points
              const selfConsumptionRatio = includeBattery
                ? Math.min(0.90, baseSelfConsumption + 0.27)
                : baseSelfConsumption;

              const selfConsumedKwh = Math.min(solarProductionKwh * selfConsumptionRatio, homeUsageKwh);
              const exportedKwh = Math.max(0, solarProductionKwh - selfConsumedKwh);

              // Savings from self-consumed solar (at retail rate)
              const selfConsumptionSavings = selfConsumedKwh * electricityRate;
              // Credits from exported solar (at NEM 3.0 rate)
              const exportCredits = exportedKwh * NEM3_EXPORT_RATE;

              // Battery TOU arbitrage bonus (shift usage from peak to off-peak)
              const batteryTouBonus = includeBattery ? homeUsageKwh * electricityRate * 0.08 : 0;

              const yearlyBillWithoutSolar = homeUsageKwh * electricityRate;
              const remainingGridKwh = Math.max(0, homeUsageKwh - selfConsumedKwh);
              const yearlyBillWithSolar = Math.max(0, remainingGridKwh * electricityRate - exportCredits - batteryTouBonus);
              const yearlySavings = yearlyBillWithoutSolar - yearlyBillWithSolar;

              const costPerWatt = pricingData?.avg_cost_per_watt || 3.50;
              const solarGrossCost = costPerWatt * systemSizeKw * 1000;
              const batteryCost = includeBattery ? (pricingData?.battery?.cost || batteryCapacity * 750) : 0;
              // California incentives (SGIP) - only apply if toggle is on
              const batteryIncentive = (includeBattery && includeCAIncentives) ? (pricingData?.battery?.incentive || 0) : 0;
              const totalGrossCost = solarGrossCost + batteryCost;
              // Note: Federal ITC (30%) expired Dec 31, 2025
              const netCost = totalGrossCost - batteryIncentive;

              const paybackYears = yearlySavings > 0 ? netCost / yearlySavings : 99;
              const totalBillWithoutSolar = yearlyBillWithoutSolar * 25;
              const totalGridCost = yearlyBillWithSolar * 25;
              const totalSavings = totalBillWithoutSolar - (netCost + totalGridCost);

              return (
                <>
                  {/* 1. Hero Metrics Section */}
                  <section className="hero-metrics">
                    <div className="hero-metric primary">
                      <span className="hero-value">${Math.round(yearlySavings).toLocaleString()}</span>
                      <span className="hero-label">saved per year</span>
                    </div>
                    <div className="hero-metric">
                      <span className="hero-value">{paybackYears <= 25 ? paybackYears.toFixed(1) : '>25'}</span>
                      <span className="hero-label">year payback</span>
                    </div>
                    <div className="hero-metric">
                      <span className="hero-value">{coveragePercent.toFixed(0)}%</span>
                      <span className="hero-label">energy offset</span>
                    </div>
                  </section>

                  {/* 2. Two-Column Layout: Roof + Customize */}
                  <div className="results-layout">
                    {/* Left: Roof Visualization */}
                    <div className="roof-section">
                      <SolarDesign
                        solarData={solarData}
                        selectedPanelCount={selectedPanelCount}
                        onPanelCountChange={handlePanelCountChange}
                        address={`${formData?.streetAddress}, ${formData?.city}, CA ${formData?.zipCode}`}
                      />
                    </div>

                    {/* Right: Unified Customize Panel */}
                    <div className="customize-section">
                      <div className="customize-panel">
                        <div className="customize-panel-header">
                          <span>⚙️</span>
                          <h3>Customize Your System</h3>
                        </div>

                        {/* Panel Slider */}
                        <div className="customize-row">
                          <label>Panels: {panelCount}</label>
                          <div className="panel-slider-row">
                            <button
                              className="slider-btn"
                              onClick={() => handlePanelCountChange(Math.max(1, panelCount - 1))}
                            >−</button>
                            <input
                              type="range"
                              min={Math.max(1, Math.floor((solarData?.solarPotential?.maxArrayPanelsCount || 25) * 0.1))}
                              max={solarData?.solarPotential?.maxArrayPanelsCount || 25}
                              value={panelCount}
                              onChange={(e) => handlePanelCountChange(parseInt(e.target.value))}
                              className="panel-slider"
                            />
                            <button
                              className="slider-btn"
                              onClick={() => handlePanelCountChange(Math.min(solarData?.solarPotential?.maxArrayPanelsCount || 25, panelCount + 1))}
                            >+</button>
                          </div>
                          <p className="system-specs">
                            <strong>{systemSizeKw.toFixed(1)} kW</strong> system • <strong>{Math.round(solarProductionKwh / 1000)}</strong> MWh/year
                          </p>
                        </div>

                        {/* Battery Toggle */}
                        <div className="customize-row">
                          <div className="battery-row">
                            <div className="battery-row-left">
                              <span>🔋</span>
                              <span>Add battery storage</span>
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                              {includeBattery && (
                                <select
                                  value={batteryCapacity}
                                  onChange={(e) => handleBatteryChange(true, parseFloat(e.target.value))}
                                  className="battery-select-inline"
                                >
                                  <option value={10}>10 kWh</option>
                                  <option value={13.5}>13.5 kWh</option>
                                  <option value={20}>20 kWh</option>
                                  <option value={27}>27 kWh</option>
                                </select>
                              )}
                              <label className="toggle-switch-small">
                                <input
                                  type="checkbox"
                                  checked={includeBattery}
                                  onChange={(e) => handleBatteryChange(e.target.checked, batteryCapacity)}
                                />
                                <span className="toggle-slider-small"></span>
                              </label>
                            </div>
                          </div>
                          {includeBattery && (
                            <p className="battery-cost-impact">
                              +<strong>${Math.round(batteryCost).toLocaleString()}</strong> added to system cost
                            </p>
                          )}
                        </div>

                        {/* CA Incentives Toggle */}
                        <div className="customize-row ca-incentives-row">
                          <div className="battery-row">
                            <div className="battery-row-left">
                              <span>🏛️</span>
                              <span>Include CA incentives (SGIP)</span>
                            </div>
                            <label className="toggle-switch-small">
                              <input
                                type="checkbox"
                                checked={includeCAIncentives}
                                onChange={(e) => setIncludeCAIncentives(e.target.checked)}
                              />
                              <span className="toggle-slider-small"></span>
                            </label>
                          </div>
                          <p className="ca-incentives-note">
                            {includeCAIncentives
                              ? 'CA storage incentives applied (check eligibility)'
                              : 'Most CA incentive programs have ended or have limited funding'}
                          </p>
                        </div>

                        {/* Rate Settings - Always Visible */}
                        <div className="customize-row">
                          <label>Your electricity details</label>
                          <div className="rate-settings-inline">
                            <div className="rate-field">
                              <label>Monthly bill</label>
                              <div className="bill-input-wrapper">
                                <span className="bill-currency">$</span>
                                <input
                                  type="number"
                                  value={monthlyBill}
                                  onChange={(e) => {
                                    const bill = parseInt(e.target.value) || 100;
                                    setMonthlyBill(bill);
                                    setHomeUsageKwh(Math.round((bill * 12) / electricityRate));
                                    setHomeUsagePreset('bill');
                                  }}
                                  className="rate-input bill-input"
                                  min="20"
                                  max="2000"
                                  step="10"
                                  placeholder="175"
                                />
                                <span className="bill-period">/mo</span>
                              </div>
                            </div>
                            <div className="rate-field">
                              <label>Rate plan</label>
                              <select
                                value={selectedRatePlan || ''}
                                onChange={(e) => {
                                  const plan = (UTILITY_RATES[formData?.utility] || UTILITY_RATES['PGE']).find(p => p.id === e.target.value);
                                  if (plan) {
                                    setSelectedRatePlan(plan.id);
                                    setElectricityRate(plan.rate);
                                  }
                                }}
                                className="rate-select"
                              >
                                {(UTILITY_RATES[formData?.utility] || UTILITY_RATES['PGE']).map(plan => (
                                  <option key={plan.id} value={plan.id}>
                                    {plan.name} (${plan.rate}/kWh)
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <p className="system-specs" style={{marginTop: '0.5rem'}}>
                            Est. usage: <strong>{homeUsageKwh.toLocaleString()} kWh/yr</strong> • <strong>${electricityRate.toFixed(2)}</strong>/kWh
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Cost Section - Expandable */}
                  <section className="expandable-section">
                    <div className="section-header-row">
                      <span className="section-icon-badge">💰</span>
                      <span className="section-title-text">What Solar Costs</span>
                    </div>

                    <div className="cost-summary-table">
                      <div className="cost-summary-row">
                        <span>System price ({panelCount} panels)</span>
                        <span>${Math.round(solarGrossCost).toLocaleString()}</span>
                      </div>
                      {includeBattery && (
                        <div className="cost-summary-row">
                          <span>Battery ({batteryCapacity} kWh)</span>
                          <span>${Math.round(batteryCost).toLocaleString()}</span>
                        </div>
                      )}
                      {batteryIncentive > 0 && (
                        <div className="cost-summary-row">
                          <span>CA storage incentive</span>
                          <span className="credit">-${Math.round(batteryIncentive).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="cost-summary-row total">
                        <span>Your net cost</span>
                        <span>${Math.round(netCost).toLocaleString()}</span>
                      </div>
                    </div>

                    <div
                      className={`expand-trigger ${showCostDetails ? 'expanded' : ''}`}
                      onClick={() => setShowCostDetails(!showCostDetails)}
                    >
                      <span className="arrow">▸</span>
                      <span>{showCostDetails ? 'Hide' : 'See'} full breakdown</span>
                    </div>

                    {showCostDetails && (
                      <div className="expanded-content">
                        <div className="cost-breakdown">
                          <div className="cost-category">
                            <div className="cost-category-title">☀️ Solar Installation</div>
                            <div className="cost-row small">
                              <span>Equipment (panels, inverter)</span>
                              <span className="cost-value">${Math.round(solarGrossCost * 0.55).toLocaleString()}</span>
                            </div>
                            <div className="cost-row small">
                              <span>Labor & Installation</span>
                              <span className="cost-value">${Math.round(solarGrossCost * 0.25).toLocaleString()}</span>
                            </div>
                            <div className="cost-row small">
                              <span>Permits & Overhead</span>
                              <span className="cost-value">${Math.round(solarGrossCost * 0.20).toLocaleString()}</span>
                            </div>
                          </div>

                          {includeBattery && (
                            <div className="cost-category">
                              <div className="cost-category-title">🔋 Battery Storage</div>
                              <div className="cost-row small">
                                <span>Battery system ({batteryCapacity} kWh)</span>
                                <span className="cost-value">${Math.round(batteryCost).toLocaleString()}</span>
                              </div>
                              <div className="cost-row small">
                                <span>Avg. cost: ~$750/kWh</span>
                                <span className="cost-value"></span>
                              </div>
                            </div>
                          )}

                          <div className="cost-category">
                            <div className="cost-category-title">💡 How It Works</div>
                            <div className="cost-row small" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem'}}>
                              <span>• Federal ITC (30%) expired Dec 31, 2025</span>
                              <span>• CA incentives (SGIP) mostly ended — toggle above if eligible</span>
                              <span>• Costs vary by installer and roof complexity</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* 4. Savings Section - Expandable */}
                  <section className="expandable-section">
                    <div className="section-header-row">
                      <span className="section-icon-badge">📈</span>
                      <span className="section-title-text">25-Year Comparison</span>
                    </div>

                    <table className="savings-comparison-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Without Solar</th>
                          <th>With Solar</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Electric bills</td>
                          <td>${Math.round(totalBillWithoutSolar).toLocaleString()}</td>
                          <td>${Math.round(totalGridCost).toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td>System cost</td>
                          <td>$0</td>
                          <td>${Math.round(netCost).toLocaleString()}</td>
                        </tr>
                        <tr className="highlight-row">
                          <td>TOTAL</td>
                          <td>${Math.round(totalBillWithoutSolar).toLocaleString()}</td>
                          <td>${Math.round(netCost + totalGridCost).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="savings-total-message">
                      <span>✓</span>
                      <span>You save <strong>${Math.round(totalSavings).toLocaleString()}</strong> over 25 years</span>
                    </div>

                    <div className="nem3-note">
                      <span className="nem3-badge">NEM 3.0</span>
                      <span>
                        Self-consumed solar saves ${electricityRate.toFixed(2)}/kWh, exports earn ~$0.08/kWh.
                        Your self-consumption: ~{Math.round(selfConsumptionRatio * 100)}%{includeBattery ? ' (with battery)' : ''}.
                        {googleExportPercent ? ' Based on Google Solar analysis.' : ''}
                      </span>
                    </div>

                    <div
                      className={`expand-trigger ${showSavingsChart ? 'expanded' : ''}`}
                      onClick={() => setShowSavingsChart(!showSavingsChart)}
                    >
                      <span className="arrow">▸</span>
                      <span>{showSavingsChart ? 'Hide' : 'See'} year-by-year chart</span>
                    </div>

                    {showSavingsChart && (
                      <div className="expanded-content">
                        <div className="line-chart-container">
                          <svg viewBox="0 0 280 120" className="line-chart">
                            {(() => {
                              const dataPoints = [0, 5, 10, 15, 20, 25].map(year => ({
                                year,
                                withoutSolar: Math.round(yearlyBillWithoutSolar * year),
                                withSolar: Math.round(netCost + (yearlyBillWithSolar * year))
                              }));
                              const maxCost = Math.max(dataPoints[dataPoints.length - 1].withoutSolar, dataPoints[0].withSolar);

                              return (
                                <>
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
                                  {/* Without Solar line (red) */}
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
                                  {/* With Solar line (green) */}
                                  <path
                                    d={dataPoints.map((point, i) => {
                                      const x = 35 + (i * 46);
                                      const y = 85 - (point.withSolar / maxCost) * 60;
                                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="#10B981"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  {/* Break-even marker */}
                                  {paybackYears <= 25 && paybackYears > 0 && (
                                    <g>
                                      <line
                                        x1={35 + (paybackYears / 25) * 230}
                                        y1="25"
                                        x2={35 + (paybackYears / 25) * 230}
                                        y2="85"
                                        stroke="#10B981"
                                        strokeWidth="1"
                                        strokeDasharray="3,2"
                                      />
                                      <circle cx={35 + (paybackYears / 25) * 230} cy={85 - (netCost + yearlyBillWithSolar * paybackYears) / maxCost * 60} r="4" fill="#10B981" stroke="white" strokeWidth="1.5" />
                                    </g>
                                  )}
                                  {/* Dots */}
                                  {dataPoints.map((point, i) => (
                                    <g key={i}>
                                      <circle cx={35 + (i * 46)} cy={85 - (point.withoutSolar / maxCost) * 60} r="2.5" fill="#ef4444" />
                                      <circle cx={35 + (i * 46)} cy={85 - (point.withSolar / maxCost) * 60} r="2.5" fill="#10B981" />
                                    </g>
                                  ))}
                                  {/* Legend */}
                                  <line x1="35" y1="110" x2="50" y2="110" stroke="#ef4444" strokeWidth="2" />
                                  <text x="53" y="112" fontSize="7" fill="#64748b">No Solar (bills only)</text>
                                  <line x1="145" y1="110" x2="160" y2="110" stroke="#10B981" strokeWidth="2" />
                                  <text x="163" y="112" fontSize="7" fill="#64748b">With Solar{includeBattery ? ' + Battery' : ''}</text>
                                </>
                              );
                            })()}
                          </svg>
                        </div>
                        <div className="card-explanation" style={{marginTop: '1rem'}}>
                          <p><strong>How savings work:</strong> The red line shows cumulative electricity bills without solar. The green line shows your solar investment plus any remaining grid costs. Where they cross is your break-even point.</p>
                          {includeBattery && (
                            <p><strong>Battery bonus:</strong> With battery storage, you save an additional ~12% through peak-shaving and time-of-use rate arbitrage, plus you get backup power during outages.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* 5. Installers Section - Informational */}
                  <div ref={installerSectionRef}>
                    <InstallerList installers={installers} />
                  </div>
                </>
              );
            })()}

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
        <footer className="app-footer">
          <p>Pricing data from California DG Stats interconnection records</p>
        </footer>
      </div>

      {/* Sticky Mobile CTA */}
      {showStickyCTA && (
        <div className="sticky-mobile-cta">
          <button onClick={scrollToInstallers} className="sticky-cta-button">
            <span>🔧</span>
            View Installers
          </button>
        </div>
      )}
    </>
  );
}
