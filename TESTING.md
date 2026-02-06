# Savera Testing Guide

## Quick Start

### Backend Tests (Python/pytest)

```bash
# Install test dependencies
cd backend
pip install -r requirements.txt

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_api.py -v
pytest tests/test_calculations.py -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html
```

### Frontend Tests (JavaScript/Jest)

```bash
# Install test dependencies
cd frontend
npm install

# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

---

## Test Structure

```
Savera/
├── backend/
│   └── tests/
│       ├── __init__.py
│       ├── test_api.py          # API endpoint tests
│       └── test_calculations.py # Financial calculation tests
│
└── frontend/
    └── __tests__/
        ├── calculations.test.js # Savings/cost calculation tests
        └── components.test.js   # Component logic tests
```

---

## What's Tested

### Backend Tests

| Test File | Coverage |
|-----------|----------|
| `test_api.py` | API endpoints, data loading, utility detection |
| `test_calculations.py` | NEM 3.0 savings, costs, payback, coverage |

**Key Tests:**
- `/api/health` - Health check
- `/api/utilities` - List utilities
- `/api/utility-by-zip` - Utility detection
- `/api/pricing` - Cost calculations with/without battery
- `/api/installers` - Installer lookup
- Federal credit expired Dec 31, 2025 (no longer applied)
- Battery cost calculations

### Frontend Tests

| Test File | Coverage |
|-----------|----------|
| `calculations.test.js` | NEM 3.0, costs, payback, 25-year projection |
| `components.test.js` | Form validation, toggles, UI logic |

**Key Tests:**
- DC-to-AC conversion (85%)
- Self-consumption ratios (48%/75%)
- NEM 3.0 export credits ($0.08/kWh)
- Payback calculation
- Coverage percentage
- Form validation (ZIP, address, utility)
- Battery/CA incentive toggles

---

## Test Data

Backend tests use mock data instead of loading 1.4M records:

```python
@pytest.fixture
def mock_installer_data():
    return pd.DataFrame({
        'Utility': ['PGE', 'PGE', 'SCE'],
        'Service Zip': ['94041', '94041', '90210'],
        'Cost/Watt': [3.50, 3.25, 3.75],
        ...
    })
```

---

## Adding New Tests

### Backend

```python
# backend/tests/test_new_feature.py
import pytest
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_new_endpoint(client):
    response = client.post('/api/new-endpoint', ...)
    assert response.status_code == 200
```

### Frontend

```javascript
// frontend/__tests__/new-feature.test.js
describe('New Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

---

## CI/CD Integration

Add to GitHub Actions:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt
      - run: pytest backend/tests/ -v

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd frontend && npm install
      - run: cd frontend && npm test
```

---

## Expected Results

All tests should pass:

```
Backend:  ~25 tests
Frontend: ~45 tests
Total:    ~70 tests
```

Run time: < 10 seconds (uses mocks, no real API calls)
