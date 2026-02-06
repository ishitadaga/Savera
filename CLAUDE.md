# Savera - California Solar Estimation App

## Quick Start

```bash
# Backend (port 5001)
/Users/ishitadaga/Downloads/Savera/.venv/bin/python /Users/ishitadaga/Downloads/Savera/backend/app.py

# Frontend (port 3000)
cd /Users/ishitadaga/Downloads/Savera/frontend && npm run dev
```

## Project Structure

```
Savera/
├── backend/app.py              # Flask API (port 5001)
├── frontend/
│   ├── pages/index.js          # Main app logic + calculations
│   ├── components/
│   │   ├── AddressForm.js      # Address input + utility auto-detect
│   │   ├── SolarDesign.js      # Roof visualization
│   │   └── InstallerList.js    # Installer directory
│   └── styles/globals.css      # All styles
├── .venv/                      # Python venv (AT PROJECT ROOT)
├── .env                        # GOOGLE_SOLAR_API_KEY
├── INFO.md                     # User-friendly calculation guide
└── PLAN.md                     # Development roadmap
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/solar-potential` | POST | Google Solar API (includes financialAnalyses) |
| `/api/pricing` | POST | Cost calculation with battery option |
| `/api/installers` | POST | Local installer lookup |
| `/api/utility-by-zip` | POST | Auto-detect utility from ZIP |
| `/api/geocode` | POST | Address geocoding |

## Key Features

- **NEM 3.0 Compliant**: Uses Google's `percentageExportedToGrid` for accuracy
- **Hero Metrics**: Yearly savings, payback period, energy offset
- **Utility Auto-Detection**: Detects PG&E/SCE/SDG&E from ZIP
- **Unified Customize Panel**: Panels, battery, bill, rate plan
- **Sticky Mobile CTA**: "View Installers" button on scroll (mobile)

## Savings Calculation (NEM 3.0)

```
1. Get Google's percentageExportedToGrid (~48-52% typical)
2. Self-consumption = 100% - exportPercent
3. With battery: +27% self-consumption (capped at 90%)

Savings = (self-consumed kWh × retail rate) + (exported kWh × $0.08)
DC-to-AC derate: 85%
```

## Data Sources

| Source | Use |
|--------|-----|
| Google Solar API | Roof analysis, financialAnalyses, export % |
| CA Interconnection CSVs | Installer pricing (1.4M records) |
| SOMAH Dataset | Battery costs (~$750/kWh) |

## Common Issues

```bash
# Port in use
lsof -i :5001 | awk 'NR>1 {print $2}' | xargs kill -9

# Clear frontend cache
rm -rf frontend/.next && npm run dev
```
