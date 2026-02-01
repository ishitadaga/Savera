import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

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

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.streetAddress.trim()) {
      newErrors.streetAddress = 'Street address is required';
    }
    
    if (!formData.city) {
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
            className={errors.streetAddress ? 'border-red-400 focus:border-red-500' : ''}
            disabled={loading}
          />
          {errors.streetAddress && (
            <p className="text-red-500 text-sm mt-2">{errors.streetAddress}</p>
          )}
        </div>

        {/* City */}
        <div className="form-group">
          <label htmlFor="city">City</label>
          <select
            id="city"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            className={`form-select ${errors.city ? 'border-red-400 focus:border-red-500' : ''}`}
            disabled={loading}
          >
            <option value="">Select your city</option>
            {CALIFORNIA_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          {errors.city && (
            <p className="text-red-500 text-sm mt-2">{errors.city}</p>
          )}
        </div>

        {/* State and ZIP Row */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div>
            <label htmlFor="state" className="form-label">State</label>
            <input
              type="text"
              id="state"
              value="California"
              className="form-input bg-gray-50 text-gray-500"
              disabled
            />
          </div>
          
          <div>
            <label htmlFor="zipCode" className="form-label">ZIP Code</label>
            <input
              type="text"
              id="zipCode"
              value={formData.zipCode}
              onChange={(e) => handleChange('zipCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="94041"
              maxLength={5}
              className={`form-input ${errors.zipCode ? 'border-red-400 focus:border-red-500' : ''}`}
              disabled={loading}
            />
            {errors.zipCode && (
              <p className="text-red-500 text-sm mt-2">{errors.zipCode}</p>
            )}
          </div>
        </div>

        {/* Utility Provider */}
        <div className="form-group">
          <label htmlFor="utility">Utility Provider</label>
          <select
            id="utility"
            value={formData.utility}
            onChange={(e) => handleChange('utility', e.target.value)}
            className={`form-select ${errors.utility ? 'border-red-400 focus:border-red-500' : ''}`}
            disabled={loading}
          >
            <option value="">Select your utility provider</option>
            {utilities.map(u => (
              <option key={u.code} value={u.code}>{u.name}</option>
            ))}
          </select>
          {errors.utility && (
            <p className="text-red-500 text-sm mt-2">{errors.utility}</p>
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
