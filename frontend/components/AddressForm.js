import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

const CALIFORNIA_CITIES = [
  'Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno', 'Sacramento',
  'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim', 'Santa Ana', 'Riverside',
  'Stockton', 'Irvine', 'Chula Vista', 'Fremont', 'San Bernardino', 'Modesto',
  'Fontana', 'Moreno Valley', 'Glendale', 'Huntington Beach', 'Santa Clarita',
  'Garden Grove', 'Oceanside', 'Rancho Cucamonga', 'Santa Rosa', 'Ontario',
  'Elk Grove', 'Corona', 'Lancaster', 'Palmdale', 'Salinas', 'Pomona', 'Hayward',
  'Escondido', 'Sunnyvale', 'Torrance', 'Pasadena', 'Orange', 'Fullerton',
  'Thousand Oaks', 'Roseville', 'Concord', 'Simi Valley', 'Santa Clara', 'Victorville',
  'Vallejo', 'Berkeley', 'El Monte', 'Downey', 'Costa Mesa', 'Inglewood',
  'Carlsbad', 'San Buenaventura', 'Fairfield', 'West Covina', 'Murrieta', 'Richmond',
  'Mountain View', 'Palo Alto', 'Sunnyvale', 'Cupertino', 'Santa Cruz', 'Monterey'
].sort();

// Unique list (removes duplicate Sunnyvale)
const UNIQUE_CA_CITIES = [...new Set(CALIFORNIA_CITIES)];

export default function AddressForm({ onSubmit, loading }) {
  const [formData, setFormData] = useState({
    streetAddress: '',
    city: '',
    state: 'CA',
    zipCode: '',
    utility: ''
  });
  const [utilities, setUtilities] = useState([]);
  const [errors, setErrors] = useState({});
  const [detectedUtility, setDetectedUtility] = useState(null);
  const [detectingUtility, setDetectingUtility] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/utilities`)
      .then(res => res.json())
      .then(data => setUtilities(data.utilities || []))
      .catch(() => {
        setUtilities([
          { code: 'PGE', name: 'Pacific Gas & Electric (PG&E)' },
          { code: 'SCE', name: 'Southern California Edison (SCE)' },
          { code: 'SDGE', name: 'San Diego Gas & Electric (SDG&E)' }
        ]);
      });
  }, []);

  // Auto-detect utility when ZIP code is 5 digits
  useEffect(() => {
    const zipCode = formData.zipCode.trim();

    // Only detect if ZIP is exactly 5 digits and utility not already selected
    if (zipCode.length === 5 && /^\d{5}$/.test(zipCode) && !formData.utility) {
      setDetectingUtility(true);
      setDetectedUtility(null);

      fetch(`${API_URL}/api/utility-by-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip_code: zipCode })
      })
        .then(res => res.json())
        .then(data => {
          if (data.detected && data.utility_code) {
            // Pre-select the utility
            setFormData(prev => ({ ...prev, utility: data.utility_code }));
            setDetectedUtility({
              code: data.utility_code,
              name: data.utility_name,
              message: `We detected ${data.utility_name.split(' (')[0]} for your area`
            });
            // Clear utility error if present
            if (errors.utility) {
              setErrors(prev => ({ ...prev, utility: null }));
            }
          }
        })
        .catch(err => {
          console.error('Utility detection failed:', err);
        })
        .finally(() => {
          setDetectingUtility(false);
        });
    }

    // Clear detected utility message if ZIP changes
    if (zipCode.length !== 5) {
      setDetectedUtility(null);
    }
  }, [formData.zipCode]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.streetAddress.trim()) {
      newErrors.streetAddress = 'Street address is required';
    }
    
    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }
    
    if (!formData.zipCode.trim()) {
      newErrors.zipCode = 'ZIP code is required';
    } else if (!/^\d{5}$/.test(formData.zipCode.trim())) {
      newErrors.zipCode = 'Enter a valid 5-digit ZIP code';
    }
    
    if (!formData.utility) {
      newErrors.utility = 'Utility provider is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    const fullAddress = `${formData.streetAddress}, ${formData.city}, ${formData.state} ${formData.zipCode}`;
    
    onSubmit({
      address: fullAddress,
      streetAddress: formData.streetAddress,
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode.trim(),
      utility: formData.utility
    });
  };

  return (
    <div className="input-section">
      <h1>Go Solar Today</h1>
      <p>Enter your details to see your custom solar design, savings, and connect with top-rated installers in your area.</p>

      <form onSubmit={handleSubmit}>
        {/* Street Address */}
        <div className="form-group">
          <label htmlFor="streetAddress">Property Address</label>
          <input
            type="text"
            id="streetAddress"
            value={formData.streetAddress}
            onChange={(e) => handleChange('streetAddress', e.target.value)}
            placeholder="123 Main Street"
            className={errors.streetAddress ? 'error' : ''}
            disabled={loading}
          />
          {errors.streetAddress && (
            <p className="form-error">{errors.streetAddress}</p>
          )}
          <p className="form-helper trust-message">Your address is only used to analyze your roof - we never share or sell your data.</p>
        </div>

        {/* City - Autocomplete Input */}
        <div className="form-group">
          <label htmlFor="city">City</label>
          <input
            type="text"
            id="city"
            list="city-options"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="Start typing your city..."
            className={errors.city ? 'error' : ''}
            disabled={loading}
            autoComplete="off"
          />
          <datalist id="city-options">
            {UNIQUE_CA_CITIES.map(city => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <p className="form-helper">California cities only</p>
          {errors.city && (
            <p className="form-error">{errors.city}</p>
          )}
        </div>

        {/* State and ZIP Row */}
        <div className="form-row">
          <div className="form-group form-group-half">
            <label htmlFor="state">State</label>
            <input
              type="text"
              id="state"
              value="California"
              disabled
            />
          </div>

          <div className="form-group form-group-half">
            <label htmlFor="zipCode">ZIP Code</label>
            <input
              type="text"
              id="zipCode"
              value={formData.zipCode}
              onChange={(e) => handleChange('zipCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="94041"
              maxLength={5}
              className={errors.zipCode ? 'error' : ''}
              disabled={loading}
            />
            {errors.zipCode && (
              <p className="form-error">{errors.zipCode}</p>
            )}
          </div>
        </div>

        {/* Utility Provider */}
        <div className="form-group">
          <label htmlFor="utility">Utility Provider</label>
          <div className="utility-select-wrapper">
            <select
              id="utility"
              value={formData.utility}
              onChange={(e) => {
                handleChange('utility', e.target.value);
                // Clear detected message if user manually changes
                if (detectedUtility && e.target.value !== detectedUtility.code) {
                  setDetectedUtility(null);
                }
              }}
              className={`form-select ${errors.utility ? 'error' : ''} ${detectedUtility ? 'auto-detected' : ''}`}
              disabled={loading || detectingUtility}
            >
              <option value="">Select your utility provider</option>
              {utilities.map(u => (
                <option key={u.code} value={u.code}>{u.name}</option>
              ))}
            </select>
            {detectingUtility && (
              <span className="detecting-spinner">Detecting...</span>
            )}
          </div>
          {detectedUtility && (
            <p className="form-helper detected-utility-message">
              <span className="detected-icon">✓</span> {detectedUtility.message}
            </p>
          )}
          {errors.utility && (
            <p className="form-error">{errors.utility}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Analyzing Your Roof...
            </>
          ) : (
            'Get My Solar Design'
          )}
        </button>
      </form>
    </div>
  );
}
