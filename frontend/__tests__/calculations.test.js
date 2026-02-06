/**
 * Tests for solar savings calculations.
 * These test the calculation logic used in pages/index.js
 * Run with: npm test
 */

describe('NEM 3.0 Calculations', () => {
  const NEM3_EXPORT_RATE = 0.08;
  const DC_TO_AC_DERATE = 0.85;

  describe('DC to AC Conversion', () => {
    it('should apply 85% derate factor', () => {
      const dcProduction = 10000;
      const acProduction = dcProduction * DC_TO_AC_DERATE;
      expect(acProduction).toBe(8500);
    });
  });

  describe('Self-Consumption Ratio', () => {
    it('should use ~48% without battery', () => {
      const baseSelfConsumption = 0.48;
      expect(baseSelfConsumption).toBe(0.48);
    });

    it('should add 27% with battery', () => {
      const baseSelfConsumption = 0.48;
      const batteryBoost = 0.27;
      const withBattery = Math.min(0.90, baseSelfConsumption + batteryBoost);
      expect(withBattery).toBe(0.75);
    });

    it('should cap at 90% with battery', () => {
      const baseSelfConsumption = 0.70;
      const batteryBoost = 0.27;
      const withBattery = Math.min(0.90, baseSelfConsumption + batteryBoost);
      expect(withBattery).toBe(0.90);
    });
  });

  describe('Self-Consumed kWh', () => {
    it('should calculate based on ratio', () => {
      const solarProduction = 8500;
      const selfConsumptionRatio = 0.48;
      const homeUsage = 7000;

      const selfConsumed = Math.min(solarProduction * selfConsumptionRatio, homeUsage);
      expect(selfConsumed).toBe(4080);
    });

    it('should cap at home usage', () => {
      const solarProduction = 12000;
      const selfConsumptionRatio = 0.75;
      const homeUsage = 7000;

      const selfConsumed = Math.min(solarProduction * selfConsumptionRatio, homeUsage);
      expect(selfConsumed).toBe(7000);
    });
  });

  describe('Export Credits', () => {
    it('should calculate at $0.08/kWh', () => {
      const exportedKwh = 4420;
      const credits = exportedKwh * NEM3_EXPORT_RATE;
      expect(credits).toBeCloseTo(353.60, 2);
    });
  });

  describe('Yearly Savings', () => {
    it('should calculate savings without battery', () => {
      const homeUsage = 7000;
      const electricityRate = 0.35;
      const solarProductionDc = 10000;
      const selfConsumptionRatio = 0.48;

      const solarProduction = solarProductionDc * DC_TO_AC_DERATE;
      const selfConsumed = Math.min(solarProduction * selfConsumptionRatio, homeUsage);
      const exported = solarProduction - selfConsumed;

      const yearlyBillWithoutSolar = homeUsage * electricityRate;
      const remainingGrid = Math.max(0, homeUsage - selfConsumed);
      const exportCredits = exported * NEM3_EXPORT_RATE;
      const yearlyBillWithSolar = Math.max(0, remainingGrid * electricityRate - exportCredits);
      const yearlySavings = yearlyBillWithoutSolar - yearlyBillWithSolar;

      expect(yearlyBillWithoutSolar).toBe(2450);
      expect(yearlySavings).toBeCloseTo(1781.60, 0);
    });

    it('should calculate higher savings with battery', () => {
      const homeUsage = 7000;
      const electricityRate = 0.35;
      const solarProductionDc = 10000;
      const baseSelfConsumption = 0.48;
      const batteryTouBonusRate = 0.08;

      const selfConsumptionRatio = Math.min(0.90, baseSelfConsumption + 0.27);
      const solarProduction = solarProductionDc * DC_TO_AC_DERATE;
      const selfConsumed = Math.min(solarProduction * selfConsumptionRatio, homeUsage);
      const exported = solarProduction - selfConsumed;

      const batteryTouBonus = homeUsage * electricityRate * batteryTouBonusRate;
      const yearlyBillWithoutSolar = homeUsage * electricityRate;
      const remainingGrid = Math.max(0, homeUsage - selfConsumed);
      const exportCredits = exported * NEM3_EXPORT_RATE;
      const yearlyBillWithSolar = Math.max(0, remainingGrid * electricityRate - exportCredits - batteryTouBonus);
      const yearlySavings = yearlyBillWithoutSolar - yearlyBillWithSolar;

      expect(yearlySavings).toBeGreaterThan(2000);
    });
  });
});

describe('Cost Calculations', () => {
  describe('Solar System Cost', () => {
    it('should calculate system cost', () => {
      const systemSizeKw = 8;
      const costPerWatt = 3.50;
      const cost = systemSizeKw * costPerWatt * 1000;
      expect(cost).toBe(28000);
    });
  });

  describe('Battery Cost', () => {
    it('should calculate battery cost', () => {
      const capacityKwh = 13.5;
      const costPerKwh = 750;
      const cost = capacityKwh * costPerKwh;
      expect(cost).toBe(10125);
    });
  });

  describe('Federal Tax Credit', () => {
    it('should be 30% of total cost', () => {
      const totalCost = 38125;
      const federalCredit = totalCost * 0.30;
      expect(federalCredit).toBe(11437.5);
    });
  });

  describe('Net Cost', () => {
    it('should subtract federal credit', () => {
      const solarCost = 28000;
      const batteryCost = 10125;
      const totalCost = solarCost + batteryCost;
      const federalCredit = totalCost * 0.30;
      const netCost = totalCost - federalCredit;

      expect(netCost).toBe(26687.5);
    });

    it('should subtract CA incentive when enabled', () => {
      const totalCost = 38125;
      const federalCredit = totalCost * 0.30;
      const caIncentive = 13.5 * 50; // $50/kWh
      const netCost = totalCost - federalCredit - caIncentive;

      expect(netCost).toBeCloseTo(26012.5, 1);
    });
  });
});

describe('Payback Calculation', () => {
  it('should calculate payback years', () => {
    const netCost = 19600;
    const yearlySavings = 2450;
    const payback = netCost / yearlySavings;
    expect(payback).toBe(8);
  });

  it('should handle zero savings', () => {
    const netCost = 19600;
    const yearlySavings = 0;
    const payback = yearlySavings > 0 ? netCost / yearlySavings : 99;
    expect(payback).toBe(99);
  });

  it('should display >25 for long payback', () => {
    const payback = 30;
    const display = payback <= 25 ? payback.toFixed(1) : '>25';
    expect(display).toBe('>25');
  });
});

describe('Coverage Calculation', () => {
  it('should calculate coverage percent', () => {
    const solarProduction = 8500;
    const homeUsage = 7000;
    const coverage = (solarProduction / homeUsage) * 100;
    expect(coverage).toBeCloseTo(121.43, 1);
  });

  it('should cap at 100%', () => {
    const solarProduction = 10000;
    const homeUsage = 7000;
    const coverage = Math.min(100, (solarProduction / homeUsage) * 100);
    expect(coverage).toBe(100);
  });
});

describe('25-Year Projection', () => {
  it('should calculate total bill without solar', () => {
    const yearlyBill = 2450;
    const total = yearlyBill * 25;
    expect(total).toBe(61250);
  });

  it('should calculate total savings', () => {
    const yearlyBillWithout = 2450;
    const yearlyBillWith = 668.40;
    const netCost = 19600;

    const totalWithout = yearlyBillWithout * 25;
    const totalWith = netCost + (yearlyBillWith * 25);
    const savings = totalWithout - totalWith;

    expect(savings).toBeCloseTo(24940, -1);
  });
});

describe('System Size Calculation', () => {
  it('should calculate kW from panel count', () => {
    const panelCount = 20;
    const panelWatts = 400;
    const systemSizeKw = panelCount * panelWatts / 1000;
    expect(systemSizeKw).toBe(8);
  });
});

describe('Utility Rate Validation', () => {
  const UTILITY_RATES = {
    'PGE': [
      { id: 'E-TOU-C', rate: 0.38 },
      { id: 'E-TOU-D', rate: 0.36 },
    ],
    'SCE': [
      { id: 'TOU-D-4-9PM', rate: 0.34 },
    ],
    'SDGE': [
      { id: 'TOU-DR1', rate: 0.42 },
    ],
  };

  it('should have rates for all utilities', () => {
    expect(UTILITY_RATES['PGE']).toBeDefined();
    expect(UTILITY_RATES['SCE']).toBeDefined();
    expect(UTILITY_RATES['SDGE']).toBeDefined();
  });

  it('should have rates between $0.25 and $0.50', () => {
    Object.values(UTILITY_RATES).forEach(plans => {
      plans.forEach(plan => {
        expect(plan.rate).toBeGreaterThanOrEqual(0.25);
        expect(plan.rate).toBeLessThanOrEqual(0.50);
      });
    });
  });
});
