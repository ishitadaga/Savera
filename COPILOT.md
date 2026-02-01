# SolarVision - California Solar Estimation App

A web application that helps California homeowners estimate solar panel installations, costs, savings, and find local installers using Google's Solar API and California interconnection data.

---

## 📁 Project Structure

```
solarapp/
├── .env                          # Environment variables (GOOGLE_SOLAR_API_KEY)
├── .venv/                        # Python virtual environment
├── COPILOT.md                    # This documentation file
│
├── backend/
│   ├── app.py                    # Flask API server (port 5001)
│   └── requirements.txt          # Python dependencies
│
├── frontend/
│   ├── package.json              # Node.js dependencies
│   ├── pages/
│   │   ├── _app.js               # Next.js app wrapper
│   │   └── index.js              # Main page component
│   ├── components/
│   │   ├── AddressForm.js        # Address input form
│   │   ├── SolarDesign.js        # Solar panel visualization
│   │   ├── PricingCard.js        # Cost and savings display
│   │   ├── InstallerList.js      # Installer directory
│   │   └── LoadingSpinner.js     # Loading indicator
│   └── styles/
│       └── globals.css           # All application styles
│
├── Interconnection_Applications_Dataset_2025-11-30/
│   ├── PGE_Interconnection_Applications_Dataset_*.csv
│   ├── SCE_Interconnection_Applications_Dataset_*.csv
│   └── SDGE_Interconnection_Applications_Dataset_*.csv
│
└── SOMAH_working_data_set_2026-01-19.csv
```

---

## 🔧 Backend (Flask API)

**File:** `backend/app.py`  
**Port:** 5001

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check, confirms API key status |
| `/api/geocode` | POST | Converts address to lat/lng coordinates |
| `/api/solar-potential` | POST | Gets solar potential from Google Solar API |
| `/api/building-imagery` | POST | Gets aerial image + solar panel positions |
| `/api/pricing` | POST | Calculates costs from CA interconnection data |
| `/api/installers` | POST | Lists installers with Google Places ratings |
| `/api/utilities` | GET | Returns list of CA utilities (PG&E, SCE, SDG&E) |
| `/api/data-layers` | POST | Gets solar data layers (flux, mask) |

### Key Functions

1. **`load_installer_data()`** - Loads and caches 1.3M+ records from CA utility interconnection CSVs
2. **`get_business_rating_from_places()`** - Fetches real ratings from Google Places API (cached)
3. **`get_utility_from_zip()`** - Determines utility provider from ZIP code

### Data Sources

- **Interconnection Datasets** (~1.4M records): Historical solar installations from PG&E, SCE, SDG&E
  - Installer names, project counts, costs per watt, system sizes
- **Google Solar API**: Real-time roof analysis, panel positioning, sunshine data
- **Google Places API**: Business ratings and review counts

---

## 🎨 Frontend (Next.js)

**Port:** 3000

### Pages

#### `pages/index.js`
Main application page with 2-step flow:
1. **Step 1**: Address input form
2. **Step 2**: Results display (solar design, pricing, installers)

**State Management:**
- `formData` - User's address input
- `solarData` - Google Solar API response
- `pricingData` - Cost calculations
- `installers` - List of local installers
- `selectedPanelCount` - User's panel configuration choice

### Components

#### `AddressForm.js`
- California address input with city dropdown (60+ cities)
- Utility provider selection (PG&E, SCE, SDG&E)
- ZIP code validation
- Fetches utilities from API on mount

#### `SolarDesign.js`
Main visualization component:
- **Satellite/Sunshine View Toggle**: Switch between aerial image and sunshine overlay
- **Panel Overlay**: Renders solar panels at actual positions from Solar API
- **+/- Controls**: Adjust panel count (10%-100% of max)
- **Panel Specs Display**: Shows panel dimensions and capacity

**Key Logic:**
```javascript
// Panel positioning calculation using Google Maps Static API bounds
const zoom = 19;
const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
```

#### `PricingCard.js`
Displays:
- System cost (gross and net after 30% federal tax credit)
- Monthly payment estimate (20-year loan)
- Savings timeline (5, 10, 20, 25 years)
- Payback period calculation

#### `InstallerList.js`
- Displays top installers from interconnection data
- Shows real Google Places ratings (top 5 installers)
- Project count, average cost/watt, average system size
- "Request Quote" buttons

#### `LoadingSpinner.js`
Animated loading indicator with solar/sun theme

---

## 🌐 External APIs Used

### 1. Google Solar API
**Base URL:** `https://solar.googleapis.com/v1`

| Endpoint | Purpose |
|----------|---------|
| `buildingInsights:findClosest` | Get roof analysis, solar potential, panel positions |
| `dataLayers:get` | Get sunshine flux maps, roof masks |

**Returns:**
- `maxArrayPanelsCount` - Maximum panels that fit
- `solarPanelConfigs[]` - Energy output per panel count
- `solarPanels[]` - Individual panel positions (lat/lng, orientation)
- `panelCapacityWatts`, `panelHeightMeters`, `panelWidthMeters`
- `maxSunshineHoursPerYear`

### 2. Google Maps Static API
**URL:** `https://maps.googleapis.com/maps/api/staticmap`

Used to generate aerial satellite imagery:
```
?center={lat},{lng}
&zoom=19
&size=800x600
&scale=2
&maptype=satellite
&markers=color:orange|{lat},{lng}
```

### 3. Google Places API (Text Search)
**URL:** `https://maps.googleapis.com/maps/api/place/textsearch/json`

Fetches real business ratings for installers:
- `rating` - Star rating (1-5)
- `user_ratings_total` - Number of reviews
- `place_id` - Google Place ID

**Rate Limited:** Only fetches for top 5 installers to minimize API costs.

### 4. Google Geocoding API
**URL:** `https://maps.googleapis.com/maps/api/geocode/json`

Converts addresses to coordinates for Solar API queries.

---

## 🔑 Environment Variables

Create a `.env` file in the project root:

```env
GOOGLE_SOLAR_API_KEY=your_api_key_here
```

**Required Google Cloud APIs to enable:**
1. ✅ Solar API
2. ✅ Maps Static API
3. ✅ Geocoding API
4. ✅ Places API

---

## 🚀 Running the Application

### Backend
```bash
cd backend
source ../.venv/bin/activate
python app.py
# Runs on http://localhost:5001
```

### Frontend
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### View Backend Logs
```bash
tail -f /tmp/backend.log
```

---

## 📊 Data Flow

```
User enters address
        ↓
┌───────────────────────────────────────┐
│  Frontend (Next.js)                   │
│  1. /api/geocode → Get coordinates    │
│  2. /api/solar-potential → Roof data  │
│  3. /api/pricing → Cost estimates     │
│  4. /api/installers → Local companies │
│  5. /api/building-imagery → Satellite │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│  Backend (Flask)                      │
│  - Calls Google APIs                  │
│  - Queries CA interconnection CSVs    │
│  - Caches Places API results          │
└───────────────────────────────────────┘
        ↓
Results displayed with:
- Aerial image + panel overlay
- Cost breakdown
- Savings projections
- Installer recommendations
```

---

## 🎯 Key Features

1. **Real Solar Analysis**: Uses Google Solar API for actual roof measurements
2. **Interactive Panel Configuration**: +/- controls to adjust system size
3. **Satellite/Sunshine Toggle**: View aerial imagery or sunshine intensity map
4. **Accurate Pricing**: Based on 1.4M real CA solar installations
5. **Verified Installer Ratings**: Real Google Places reviews (not fake)
6. **Federal Tax Credit**: Automatically calculates 30% ITC savings
7. **Responsive Design**: Mobile-friendly SolarVision UI

---

## 📝 Notes

- **Mock Data**: If no API key is configured, the app returns sample data
- **CA Only**: Currently limited to California addresses and utilities
- **Caching**: Places API results are cached to reduce API costs
- **Panel Sync**: Panel overlay positions calculated using Maps Static API bounds formula
