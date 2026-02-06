# Savera - California Solar Estimation App

A web application that helps California homeowners estimate solar panel installations, costs, savings, and find local installers using Google's Solar API and California interconnection data.

## Features

- **Solar Potential Analysis** - Uses Google Solar API for accurate roof analysis
- **NEM 3.0 Calculations** - California's current net metering rules with self-consumption model
- **Battery Storage** - Optional battery integration with accurate pricing from SOMAH data
- **Utility Auto-Detection** - Automatically detects utility provider from ZIP code
- **Local Installers** - Shows certified installers in your area from CA interconnection database

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Google Cloud API key with Solar, Maps, Geocoding, and Places APIs enabled

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
# Runs on http://localhost:5001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

### Environment Variables
Create a `.env` file in the project root:
```
GOOGLE_SOLAR_API_KEY=your_api_key_here
```

## Running Tests

### Backend Tests (pytest)
```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

### Frontend Tests (Jest)
```bash
cd frontend
npm install
npm test
```

### Run All Tests
```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd frontend && npm test
```

### Test Coverage
```bash
# Backend
cd backend && pytest tests/ --cov=. --cov-report=html

# Frontend
cd frontend && npm run test:coverage
```

## Project Structure

```
Savera/
├── backend/
│   ├── app.py              # Flask API server
│   ├── requirements.txt    # Python dependencies
│   └── tests/              # pytest test files
│
├── frontend/
│   ├── pages/index.js      # Main application page
│   ├── components/         # React components
│   ├── styles/globals.css  # Application styles
│   └── __tests__/          # Jest test files
│
├── CLAUDE.md               # Developer documentation
├── TESTING.md              # Detailed testing guide
└── INFO.md                 # Calculation explanations
```

## Key Calculations

- **Self-consumption**: 48% without battery, 75% with battery
- **NEM 3.0 export rate**: $0.08/kWh
- **DC-to-AC derate**: 85%
- **Federal tax credit**: 30% ITC

See [INFO.md](INFO.md) for detailed calculation explanations.

## License

Private project.
