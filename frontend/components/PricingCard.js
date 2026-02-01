export default function PricingCard({ pricingData, solarData, selectedPanelCount }) {
  if (!pricingData) return null;

  const panelCount = selectedPanelCount || solarData?.solarPotential?.maxArrayPanelsCount || 20;
  const systemSizeKw = panelCount * 0.4;
  
  const costPerWatt = pricingData.avg_cost_per_watt || 3.50;
  const totalCost = costPerWatt * systemSizeKw * 1000;
  const federalCredit = totalCost * 0.30;
  const netCost = totalCost - federalCredit;
  
  const yearlyEnergy = solarData?.solarPotential?.solarPanelConfigs?.find(
    c => c.panelsCount === panelCount
  )?.yearlyEnergyDcKwh || panelCount * 480;
  
  const electricityRate = 0.30;
  const yearlySavings = (yearlyEnergy * electricityRate);
  const paybackYears = netCost / yearlySavings;

  // Calculate savings over time
  const savings5yr = Math.round(yearlySavings * 5);
  const savings10yr = Math.round(yearlySavings * 10);
  const savings20yr = Math.round(yearlySavings * 20);
  const savings25yr = Math.round(yearlySavings * 25);

  // Monthly payment estimate (20-year loan at ~5% APR)
  const monthlyPayment = Math.round((netCost * 1.05) / 240);
  const avgCurrentBill = 185; // Typical CA electricity bill

  return (
    <>
      {/* Price Card */}
      <div className="price-card">
        <h3>System Cost</h3>
        <div className="price-amount">${netCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <div className="price-subtitle">After 30% Federal Tax Credit</div>
        <div className="price-details">
          <div className="detail-item">
            <span>Gross Cost</span>
            <strong>${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          </div>
          <div className="detail-item">
            <span>Federal Tax Credit (30%)</span>
            <strong>-${federalCredit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          </div>
          <div className="detail-item">
            <span>Monthly Payment (20yr)</span>
            <strong>${monthlyPayment}/mo</strong>
          </div>
          <div className="detail-item">
            <span>Avg. Current Bill</span>
            <strong>${avgCurrentBill}/mo</strong>
          </div>
        </div>
      </div>

      {/* Savings Card */}
      <div className="savings-card">
        <h3>Estimated Savings Over Time</h3>
        <div className="savings-timeline">
          <div className="timeline-item">
            <div className="timeline-year">Year 5</div>
            <div className="timeline-bar" style={{ width: '40%' }}>${savings5yr.toLocaleString()}</div>
          </div>
          <div className="timeline-item">
            <div className="timeline-year">Year 10</div>
            <div className="timeline-bar" style={{ width: '60%' }}>${savings10yr.toLocaleString()}</div>
          </div>
          <div className="timeline-item">
            <div className="timeline-year">Year 20</div>
            <div className="timeline-bar" style={{ width: '90%' }}>${savings20yr.toLocaleString()}</div>
          </div>
          <div className="timeline-item">
            <div className="timeline-year">Year 25</div>
            <div className="timeline-bar" style={{ width: '100%' }}>${savings25yr.toLocaleString()}</div>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Payback period: <strong>{paybackYears.toFixed(1)} years</strong> • Based on ${electricityRate.toFixed(2)}/kWh rate
        </p>
      </div>
    </>
  );
}
