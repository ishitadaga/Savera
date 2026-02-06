# Savera Solar Calculator - How It Works

A simple guide to understanding your solar estimate.

---

## The Three Numbers That Matter

| Metric | What It Means | Why It Matters |
|--------|---------------|----------------|
| **$/year savings** | Money you keep instead of paying the utility | Your annual benefit |
| **Payback period** | Years until solar pays for itself | Lower = faster ROI |
| **% offset** | How much of your usage solar covers | 100% = zero electric bill |

---

## How We Calculate Savings

### Step 1: Solar Production
```
Panels × 400W × Sunshine Hours × 85% = Annual kWh
```
- **400W**: Standard panel wattage (2024-2025)
- **85%**: DC-to-AC conversion loss (inverter, wiring, heat)
- **Sunshine hours**: From Google Solar API based on your roof

### Step 2: Self-Consumption vs Export (NEM 3.0)

California's NEM 3.0 (since April 2023) changed how solar saves money:

| What Happens | Rate You Get |
|--------------|--------------|
| **Use it yourself** | Full retail rate (~$0.30-0.42/kWh) |
| **Export to grid** | Export rate (~$0.08/kWh) |

**Self-consumption ratio:**
- We use **Google's financial analysis** when available (~48-52% typical)
- Without battery: ~48% self-consumption
- With battery: ~75% (adds ~27% through storage)

### Step 3: Your Savings
```
Savings = (Self-consumed kWh × Retail Rate) + (Exported kWh × $0.08)
```

---

## Cost Breakdown

| Component | Typical Cost | Notes |
|-----------|--------------|-------|
| Solar panels + install | $3.00-4.00/watt | From CA installer data |
| Battery (optional) | ~$750/kWh | 13.5 kWh = ~$10,000 |
| ~~Federal Tax Credit~~ | ~~-30%~~ | **⚠️ EXPIRED Dec 31, 2025** |
| CA Incentives (SGIP) | Varies | ⚠️ Mostly ended - toggle OFF by default |

**Example 8kW system:**
```
Gross cost:     $28,000
Net cost:       $28,000 (no federal credit)
```

> **Note**: The 30% Federal Investment Tax Credit (ITC) expired on December 31, 2025. This significantly impacts payback periods for new installations in 2026+.

### California Incentives (SGIP)

The Self-Generation Incentive Program (SGIP) provided rebates for battery storage but:
- Most funding has been exhausted
- Remaining funds are limited to low-income/medical baseline customers
- **Toggle is OFF by default** in our calculator

If you qualify, enable "Include CA incentives" in the customize panel.

---

## Utility Rates (2025-2026)

| Utility | Avg Rate | Peak Rate | Off-Peak |
|---------|----------|-----------|----------|
| **PG&E** | $0.35-0.38 | $0.45-0.55 | $0.25-0.35 |
| **SCE** | $0.30-0.35 | $0.47-0.49 | $0.29-0.30 |
| **SDG&E** | $0.38-0.42 | $0.55-0.60 | $0.33-0.35 |

SDG&E has highest rates = best solar savings.

---

## Battery: Is It Worth It?

| Benefit | Value |
|---------|-------|
| Increase self-consumption | ~48% → ~75% (+27%) |
| TOU arbitrage | Save ~8% more by shifting peak usage |
| Backup power | Lights on during outages |
| NEM 3.0 optimization | Keep more solar value |

**Rule of thumb**: Battery adds ~$10k cost but increases savings 40-50% under NEM 3.0.

---

## Industry Standards We Use

| Assumption | Value | Source |
|------------|-------|--------|
| Panel wattage | 400W | Industry standard 2024 |
| DC-to-AC derate | 85% | Google Solar API |
| Panel degradation | 0.5%/year | Manufacturer specs |
| System lifetime | 20-25 years | Industry standard |
| ~~Federal ITC~~ | ~~30%~~ | **Expired Dec 31, 2025** |
| NEM 3.0 export rate | ~$0.08/kWh | CPUC average |

---

## Google Solar API - How It Works

### Step 1: Satellite Analysis
Google looks at aerial images of your home and:
- Identifies your roof shape and size
- Measures roof pitch (angle) and direction (south-facing = best)
- Calculates usable area for panels

### Step 2: Sunlight Calculation
Using weather data and your location:
- Tracks sun position throughout the year
- Accounts for typical cloud cover in your area
- Calculates "sunshine hours" your roof receives

### Step 3: Energy Production
```
Annual Production = Panels × 400W × Sunshine Hours × 85%
```
- **400W**: Standard panel wattage
- **85%**: Efficiency loss (inverter, wiring, heat)

### Step 4: Financial Analysis
For different monthly bill amounts ($50, $100, $150...), Google calculates:

| What Google Figures Out | How |
|------------------------|-----|
| Best system size | Matches production to your usage |
| % exported to grid | Compares when you use power vs when sun shines |
| Payback period | Cost ÷ annual savings |
| 20-year savings | Accounts for panel degradation (0.5%/year) |

### What We Use From Google

| Google Data | How We Use It |
|-------------|---------------|
| `yearlyEnergyDcKwh` | Base solar production (we apply 85% derate) |
| `percentageExportedToGrid` | Self-consumption ratio for NEM 3.0 calculation |
| `maxArrayPanelsCount` | Maximum system size for your roof |
| `panelCapacityWatts` | Panel wattage (400W) |

### Why This Matters for NEM 3.0

Google's `percentageExportedToGrid` (~48-52% typical) tells us how much solar you'll actually use yourself vs export. This is crucial because:
- Self-consumed solar saves $0.35/kWh (retail rate)
- Exported solar only earns $0.08/kWh (NEM 3.0 rate)

Without this data, we'd have to guess your self-consumption.

---

## Data Sources

| Data | Source | Records |
|------|--------|---------|
| Roof analysis | Google Solar API | Real-time |
| Self-consumption % | Google financialAnalyses | Per-address |
| Installer pricing | CA Interconnection Data | 1.4M installs |
| Battery costs | SOMAH Program Data | ~5,000 installs |
| Utility rates | PG&E, SCE, SDG&E tariffs | 2025-2026 |

---

## Glossary

| Term | Meaning |
|------|---------|
| **kWh** | Kilowatt-hour, unit of energy (1 kWh = running a microwave for 1 hour) |
| **kW** | Kilowatt, unit of power (system size) |
| **NEM 3.0** | Net Energy Metering 3.0, California's current solar billing rules |
| **TOU** | Time-of-Use rates (electricity costs more 4-9pm) |
| **ITC** | Investment Tax Credit (federal 30% - **expired Dec 31, 2025**) |
| **SGIP** | Self-Generation Incentive Program (CA battery rebate - mostly ended) |
| **DC/AC** | Direct/Alternating Current (panels make DC, home uses AC) |

---

## Limitations & Disclaimers

1. **Estimates only** - Actual savings depend on your specific usage patterns
2. **Rate changes** - Utility rates change; we use current published rates
3. **Roof condition** - We assume your roof is solar-ready
4. **No shading analysis** - Trees/buildings may reduce production
5. **NEM 3.0 simplification** - Actual export rates vary by time of day
6. **CA incentives** - SGIP mostly ended; toggle OFF by default

---

*Last updated: February 2026*
