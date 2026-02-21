"""
Solar App Backend - Flask API
Provides endpoints for:
1. Google Solar API integration (roof design, solar potential)
2. Pricing calculations from California datasets
3. Installer lookup from interconnection data
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
import requests
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file (check both locations)
env_path = Path(__file__).parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# CORS configuration - allow all origins for now
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration
GOOGLE_SOLAR_API_KEY = os.environ.get('GOOGLE_SOLAR_API_KEY', '')
# DATA_DIR: Use backend folder itself on Railway, or parent for local dev
DATA_DIR = Path(__file__).parent
if not (DATA_DIR / 'app.py').exists():
    DATA_DIR = Path(__file__).parent.parent

# Cache for loaded data
_installer_data = None
_pricing_data = None
_battery_pricing_data = None
_places_rating_cache = {}  # Cache for Places API ratings
_data_loading_status = 'not_started'  # not_started, loading, ready, error

# Pre-aggregated installer summary (committed to git, ~0.5MB)
INSTALLER_SUMMARY_FILE = Path(__file__).parent / 'data' / 'installer_summary.json.gz'


def get_business_rating_from_places(business_name, city=None, state=None):
    """
    Fetch business rating from Google Places API.
    Uses Text Search to find the business and get its rating.
    """
    if not GOOGLE_SOLAR_API_KEY:
        return None, None, None
    
    # Check cache first
    cache_key = f"{business_name}|{city}|{state}".lower()
    if cache_key in _places_rating_cache:
        return _places_rating_cache[cache_key]
    
    try:
        # Build search query
        query = f"{business_name} solar installer"
        if city and state:
            query += f" {city}, {state}"
        elif state:
            query += f" {state}"
        
        # Use Places API Text Search
        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            'query': query,
            'key': GOOGLE_SOLAR_API_KEY,
            'type': 'establishment'
        }
        
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        
        if data.get('status') == 'OK' and data.get('results'):
            result = data['results'][0]  # Take first/best match
            rating = result.get('rating')
            review_count = result.get('user_ratings_total', 0)
            place_id = result.get('place_id')
            
            # Cache the result
            _places_rating_cache[cache_key] = (rating, review_count, place_id)
            return rating, review_count, place_id
        
        # Cache None result to avoid repeated API calls
        _places_rating_cache[cache_key] = (None, None, None)
        return None, None, None
        
    except Exception as e:
        logger.warning(f"Places API error for {business_name}: {e}")
        return None, None, None


def load_installer_summary():
    """Load the pre-aggregated installer summary from JSON file."""
    global _installer_data, _data_loading_status
    import gzip
    import json

    if _installer_data is not None:
        return _installer_data

    _data_loading_status = 'loading'

    if not INSTALLER_SUMMARY_FILE.exists():
        logger.error(f"❌ Installer summary file not found: {INSTALLER_SUMMARY_FILE}")
        _data_loading_status = 'error'
        return None

    try:
        logger.info(f"📖 Loading installer summary from {INSTALLER_SUMMARY_FILE}...")
        with gzip.open(INSTALLER_SUMMARY_FILE, 'rt', encoding='utf-8') as f:
            data = json.load(f)

        _installer_data = {
            'zip_installers': data.get('zip_installers', []),
            'top_installers': data.get('top_installers', []),
            'zip_to_utility': data.get('zip_to_utility', {}),
            'metadata': data.get('metadata', {})
        }

        logger.info(f"✓ Loaded {len(_installer_data['zip_installers'])} ZIP-installer entries")
        logger.info(f"✓ Loaded {len(_installer_data['top_installers'])} top installers")
        logger.info(f"✓ Loaded {len(_installer_data['zip_to_utility'])} ZIP-utility mappings")

        _data_loading_status = 'ready'
        return _installer_data

    except Exception as e:
        logger.exception(f"❌ Failed to load installer summary: {e}")
        _data_loading_status = 'error'
        return None


def get_utility_from_zip(zip_code):
    """Determine utility based on zip code from the pre-aggregated data."""
    data = load_installer_summary()
    if not data:
        return "Unknown"

    zip_str = str(zip_code)[:5]
    zip_to_utility = data.get('zip_to_utility', {})

    return zip_to_utility.get(zip_str, "Unknown")


def load_battery_pricing_data():
    """Load and calculate average battery pricing from SOMAH dataset."""
    global _battery_pricing_data
    if _battery_pricing_data is not None:
        return _battery_pricing_data
    
    somah_file = DATA_DIR / 'SOMAH_working_data_set_2026-01-19.csv'
    
    if not somah_file.exists():
        logger.warning(f"SOMAH dataset not found at {somah_file}")
        # Return default battery pricing if no data
        _battery_pricing_data = {
            'avg_cost_per_kwh': 750,  # Default $750/kWh
            'min_cost_per_kwh': 600,
            'max_cost_per_kwh': 900,
            'sample_size': 0,
            'common_capacities': [10, 13.5, 20, 27],  # Common residential battery sizes
            'source': 'default'
        }
        return _battery_pricing_data
    
    try:
        # Load only battery-relevant columns
        columns = [
            'Storage Cost',
            'Total Energy Storage Capacity (kWh)',
            'Battery Energy Storage Capacity (kWh)',
            'Storage Incentive Amount',
            'Battery Manufacturer',
            'Battery Model',
            'Battery Quantity',
            'Battery Technology'
        ]
        
        df = pd.read_csv(somah_file, usecols=lambda x: x in columns, low_memory=False)
        
        # Filter to records with valid battery data
        df['Storage Cost'] = pd.to_numeric(df['Storage Cost'], errors='coerce')
        df['Total Energy Storage Capacity (kWh)'] = pd.to_numeric(df['Total Energy Storage Capacity (kWh)'], errors='coerce')
        df['Storage Incentive Amount'] = pd.to_numeric(df['Storage Incentive Amount'], errors='coerce')
        
        battery_df = df[
            (df['Storage Cost'] > 0) & 
            (df['Total Energy Storage Capacity (kWh)'] > 0)
        ].copy()
        
        if len(battery_df) > 0:
            # Calculate cost per kWh
            battery_df['cost_per_kwh'] = battery_df['Storage Cost'] / battery_df['Total Energy Storage Capacity (kWh)']
            
            # Remove outliers (below 5th and above 95th percentile)
            if len(battery_df) > 20:
                lower = battery_df['cost_per_kwh'].quantile(0.05)
                upper = battery_df['cost_per_kwh'].quantile(0.95)
                battery_df = battery_df[(battery_df['cost_per_kwh'] >= lower) & (battery_df['cost_per_kwh'] <= upper)]
            
            avg_cost = battery_df['cost_per_kwh'].mean()
            min_cost = battery_df['cost_per_kwh'].min()
            max_cost = battery_df['cost_per_kwh'].max()
            
            # Calculate average incentive per kWh
            incentive_df = battery_df[battery_df['Storage Incentive Amount'] > 0]
            avg_incentive_per_kwh = 0
            if len(incentive_df) > 0:
                avg_incentive_per_kwh = (incentive_df['Storage Incentive Amount'] / incentive_df['Total Energy Storage Capacity (kWh)']).mean()
            
            _battery_pricing_data = {
                'avg_cost_per_kwh': round(avg_cost, 2),
                'min_cost_per_kwh': round(min_cost, 2),
                'max_cost_per_kwh': round(max_cost, 2),
                'avg_incentive_per_kwh': round(avg_incentive_per_kwh, 2),
                'sample_size': len(battery_df),
                'common_capacities': [10, 13.5, 20, 27],
                'source': 'somah_dataset'
            }
            logger.info(f"Loaded battery pricing from SOMAH: ${avg_cost:.2f}/kWh from {len(battery_df)} records")
        else:
            _battery_pricing_data = {
                'avg_cost_per_kwh': 750,
                'min_cost_per_kwh': 600,
                'max_cost_per_kwh': 900,
                'avg_incentive_per_kwh': 0,
                'sample_size': 0,
                'common_capacities': [10, 13.5, 20, 27],
                'source': 'default'
            }
            
    except Exception as e:
        logger.error(f"Error loading SOMAH battery data: {e}")
        _battery_pricing_data = {
            'avg_cost_per_kwh': 750,
            'min_cost_per_kwh': 600,
            'max_cost_per_kwh': 900,
            'avg_incentive_per_kwh': 0,
            'sample_size': 0,
            'common_capacities': [10, 13.5, 20, 27],
            'source': 'default'
        }
    
    return _battery_pricing_data


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'api_key_configured': bool(GOOGLE_SOLAR_API_KEY),
        'data_dir': str(DATA_DIR),
        'python_version': os.sys.version
    })


@app.route('/api/debug', methods=['GET'])
def debug_info():
    """Debug endpoint to check data loading status."""
    import os as os_module

    # Check installer summary
    summary_exists = INSTALLER_SUMMARY_FILE.exists()
    summary_size = INSTALLER_SUMMARY_FILE.stat().st_size if summary_exists else 0

    # Get metadata from loaded data
    metadata = {}
    if _installer_data:
        metadata = _installer_data.get('metadata', {})
        metadata['zip_installers_count'] = len(_installer_data.get('zip_installers', []))
        metadata['top_installers_count'] = len(_installer_data.get('top_installers', []))
        metadata['zip_to_utility_count'] = len(_installer_data.get('zip_to_utility', {}))

    return jsonify({
        'data_loading_status': _data_loading_status,
        'summary_file': str(INSTALLER_SUMMARY_FILE),
        'summary_exists': summary_exists,
        'summary_size_mb': round(summary_size / 1024 / 1024, 2),
        'metadata': metadata,
        'cwd': os_module.getcwd(),
        'app_file_location': str(Path(__file__).parent)
    })


@app.route('/api/load-data', methods=['POST'])
def trigger_data_load():
    """Manually trigger data loading (downloads files if needed)."""
    try:
        data = load_installer_data()
        return jsonify({
            'success': True,
            'records_loaded': len(data) if data is not None else 0
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/solar-potential', methods=['POST'])
def get_solar_potential():
    """
    Get solar potential data from Google Solar API.
    Requires address in request body.
    """
    data = request.json
    address = data.get('address', '')
    
    if not address:
        return jsonify({'error': 'Address is required'}), 400
    
    if not GOOGLE_SOLAR_API_KEY:
        # Return mock data if no API key
        logger.warning(f"⚠️  MOCK DATA: No API key configured. Returning mock solar potential for address: {address}")
        return jsonify({
            'warning': 'Google Solar API key not configured. Showing sample data.',
            'mock': True,
            'solarPotential': {
                'maxArrayPanelsCount': 25,
                'maxArrayAreaMeters2': 45.5,
                'maxSunshineHoursPerYear': 1800,
                'carbonOffsetFactorKgPerMwh': 450,
                'panelCapacityWatts': 400,
                'panelHeightMeters': 1.65,
                'panelWidthMeters': 0.99,
                'roofSegmentStats': [
                    {
                        'pitchDegrees': 20,
                        'azimuthDegrees': 180,
                        'panelsCount': 15,
                        'yearlyEnergyDcKwh': 7500
                    },
                    {
                        'pitchDegrees': 20,
                        'azimuthDegrees': 270,
                        'panelsCount': 10,
                        'yearlyEnergyDcKwh': 4500
                    }
                ],
                'solarPanelConfigs': [
                    {'panelsCount': 10, 'yearlyEnergyDcKwh': 4800},
                    {'panelsCount': 15, 'yearlyEnergyDcKwh': 7200},
                    {'panelsCount': 20, 'yearlyEnergyDcKwh': 9500},
                    {'panelsCount': 25, 'yearlyEnergyDcKwh': 11800}
                ]
            },
            'imageryDate': {'year': 2024, 'month': 6, 'day': 15},
            'imageryQuality': 'HIGH'
        })
    
    try:
        # First, geocode the address
        logger.info(f"📍 Geocoding address: {address}")
        geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json"
        geocode_params = {'address': address, 'key': GOOGLE_SOLAR_API_KEY}
        geocode_response = requests.get(geocode_url, params=geocode_params)
        geocode_data = geocode_response.json()
        
        if geocode_data['status'] != 'OK':
            logger.error(f"❌ Geocoding failed for address: {address}, status: {geocode_data['status']}")
            return jsonify({'error': 'Could not geocode address'}), 400
        
        location = geocode_data['results'][0]['geometry']['location']
        lat, lng = location['lat'], location['lng']
        logger.info(f"✅ Geocoded to coordinates: ({lat}, {lng})")
        
        # Call Google Solar API
        logger.info(f"🌞 Calling Google Solar API for coordinates: ({lat}, {lng})")
        solar_url = "https://solar.googleapis.com/v1/buildingInsights:findClosest"
        solar_params = {
            'location.latitude': lat,
            'location.longitude': lng,
            'requiredQuality': 'HIGH',
            'key': GOOGLE_SOLAR_API_KEY
        }
        
        solar_response = requests.get(solar_url, params=solar_params)
        
        if solar_response.status_code == 200:
            logger.info(f"✅ REAL DATA: Google Solar API call successful for: {address}")
            return jsonify(solar_response.json())
        else:
            logger.error(f"❌ Google Solar API error: {solar_response.status_code} - {solar_response.text[:200]}")
            return jsonify({
                'error': 'Solar API error',
                'details': solar_response.text
            }), solar_response.status_code
            
    except Exception as e:
        logger.exception(f"❌ Exception in solar-potential endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/data-layers', methods=['POST'])
def get_data_layers():
    """
    Get data layers (imagery) from Google Solar API for roof visualization.
    """
    data = request.json
    address = data.get('address', '')
    
    if not GOOGLE_SOLAR_API_KEY:
        logger.warning(f"⚠️  MOCK DATA: No API key configured. Returning mock data layers for address: {address}")
        return jsonify({
            'warning': 'Google Solar API key not configured',
            'mock': True,
            'rgbUrl': None,
            'maskUrl': None
        })
    
    try:
        # Geocode address
        geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json"
        geocode_params = {'address': address, 'key': GOOGLE_SOLAR_API_KEY}
        geocode_response = requests.get(geocode_url, params=geocode_params)
        geocode_data = geocode_response.json()
        
        if geocode_data['status'] != 'OK':
            return jsonify({'error': 'Could not geocode address'}), 400
        
        location = geocode_data['results'][0]['geometry']['location']
        lat, lng = location['lat'], location['lng']
        
        # Get data layers
        layers_url = "https://solar.googleapis.com/v1/dataLayers:get"
        layers_params = {
            'location.latitude': lat,
            'location.longitude': lng,
            'radiusMeters': 50,
            'view': 'FULL_LAYERS',
            'requiredQuality': 'HIGH',
            'pixelSizeMeters': 0.5,
            'key': GOOGLE_SOLAR_API_KEY
        }
        
        layers_response = requests.get(layers_url, params=layers_params)
        
        if layers_response.status_code == 200:
            logger.info(f"✅ REAL DATA: Data layers API call successful for: {address}")
            return jsonify(layers_response.json())
        else:
            logger.error(f"❌ Data layers API error: {layers_response.status_code} - {layers_response.text[:200]}")
            return jsonify({
                'error': 'Data layers API error',
                'details': layers_response.text
            }), layers_response.status_code
            
    except Exception as e:
        logger.exception(f"❌ Exception in data-layers endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/pricing', methods=['POST'])
def get_pricing():
    """
    Calculate pricing based on system size and regional averages from California data.
    Uses pre-aggregated installer summary for cost estimates.
    """
    data = request.json
    zip_code = data.get('zip_code', '')
    system_size_kw = data.get('system_size_kw', 6)  # Default 6kW system
    utility = data.get('utility', '')
    include_battery = data.get('include_battery', False)
    battery_capacity_kwh = data.get('battery_capacity_kwh', 13.5)  # Default Tesla Powerwall size

    # Load summary data
    summary = load_installer_summary()

    # Get cost per watt from summary
    avg_cost_per_watt = 3.50  # Default
    sample_size = 0
    source = 'default'

    if summary:
        zip_str = str(zip_code)[:5] if zip_code else ''
        zip_installers = summary.get('zip_installers', [])

        # Find installers for this ZIP
        local_installers = [i for i in zip_installers if i.get('zip') == zip_str]

        if not local_installers and utility:
            # Try utility-wide
            local_installers = [i for i in zip_installers if utility.upper() in str(i.get('utility', '')).upper()]

        if not local_installers:
            # Use top installers statewide
            local_installers = summary.get('top_installers', [])

        # Calculate average from installers with valid cost data
        costs = [i['avg_cost_per_watt'] for i in local_installers if i.get('avg_cost_per_watt')]
        if costs:
            avg_cost_per_watt = sum(costs) / len(costs)
            sample_size = len(costs)
            source = 'california_data'

    solar_cost = avg_cost_per_watt * system_size_kw * 1000

    # Battery pricing calculation
    battery_data = None
    total_cost = solar_cost
    if include_battery:
        battery_pricing = load_battery_pricing_data()
        battery_cost = battery_pricing['avg_cost_per_kwh'] * battery_capacity_kwh
        battery_incentive = battery_pricing.get('avg_incentive_per_kwh', 0) * battery_capacity_kwh
        total_cost = solar_cost + battery_cost
        battery_data = {
            'included': True,
            'capacity_kwh': battery_capacity_kwh,
            'cost': round(battery_cost, 2),
            'cost_per_kwh': battery_pricing['avg_cost_per_kwh'],
            'cost_range': {
                'min': battery_pricing['min_cost_per_kwh'],
                'max': battery_pricing['max_cost_per_kwh']
            },
            'incentive': round(battery_incentive, 2),
            'net_battery_cost': round(battery_cost - battery_incentive, 2),
            'common_capacities': battery_pricing['common_capacities'],
            'source': battery_pricing['source'],
            'sample_size': battery_pricing['sample_size']
        }

    # Note: Federal ITC (30%) expired Dec 31, 2025

    zip_str = str(zip_code)[:5] if zip_code else ''

    return jsonify({
        'source': source,
        'zip_code': zip_str,
        'utility': utility or get_utility_from_zip(zip_str),
        'system_size_kw': system_size_kw,
        'avg_cost_per_watt': round(avg_cost_per_watt, 2),
        'estimated_total_cost': round(solar_cost, 2),
        'battery': battery_data,
        'total_system_cost': round(total_cost, 2),
        'net_cost': round(total_cost, 2),
        'sample_size': sample_size,
        'note': 'Prices based on California DG Stats interconnection data (2020-2025). Federal ITC (30%) expired Dec 31, 2025.' + (' Includes SOMAH battery data.' if include_battery else '')
    })


@app.route('/api/installers', methods=['POST'])
def get_installers():
    """
    Get installers that have completed projects in the specified area.
    Uses pre-aggregated summary data for fast lookups.
    """
    # Check if data is still loading
    if _data_loading_status in ('not_started', 'loading'):
        return jsonify({
            'installers': [],
            'message': f'Installer data is loading ({_data_loading_status}). Please try again in a moment.',
            'loading': True,
            'status': _data_loading_status
        }), 202  # 202 Accepted - request is being processed

    if _data_loading_status == 'error':
        return jsonify({
            'installers': [],
            'message': 'Failed to load installer data. Please try again later.',
            'error': True
        }), 503  # 503 Service Unavailable

    req_data = request.json
    zip_code = req_data.get('zip_code', '')
    utility = req_data.get('utility', '')
    limit = req_data.get('limit', 20)

    data = load_installer_summary()
    if not data:
        return jsonify({
            'installers': [],
            'message': 'No installer data available'
        })

    zip_installers = data.get('zip_installers', [])
    top_installers = data.get('top_installers', [])

    # Find installers for the ZIP code
    results = []
    zip_str = str(zip_code)[:5] if zip_code else ''

    if zip_str:
        # Get installers that serve this ZIP
        results = [i for i in zip_installers if i.get('zip') == zip_str]

    # If not enough results, filter by utility
    if len(results) < 5 and utility:
        utility_installers = [i for i in zip_installers if utility.upper() in str(i.get('utility', '')).upper()]
        # Add unique installers not already in results
        existing_names = {r['name'] for r in results}
        for inst in utility_installers:
            if inst['name'] not in existing_names:
                results.append(inst)
                existing_names.add(inst['name'])

    # If still not enough, use top installers statewide
    if len(results) < 5:
        existing_names = {r['name'] for r in results}
        for inst in top_installers:
            if inst['name'] not in existing_names:
                results.append(inst)
                existing_names.add(inst['name'])
            if len(results) >= limit:
                break

    # Sort by project count
    results = sorted(results, key=lambda x: x.get('project_count', 0), reverse=True)[:limit]

    # Format output
    installers = []
    for inst in results:
        installers.append({
            'name': inst.get('name'),
            'project_count': inst.get('project_count'),
            'avg_cost_per_watt': round(inst.get('avg_cost_per_watt'), 2) if inst.get('avg_cost_per_watt') else None,
            'avg_system_size_kw': round(inst.get('avg_system_size_kw'), 2) if inst.get('avg_system_size_kw') else None,
            'phone': inst.get('phone'),
            'city': inst.get('city'),
            'state': inst.get('state'),
            'zip': inst.get('installer_zip'),
            'cslb_license': inst.get('cslb_license'),
            'rating': None,
            'review_count': None,
            'place_id': None
        })

    # Fetch ratings from Google Places API for top installers (limit API calls)
    for installer in installers[:5]:  # Only fetch for top 5 to limit API usage
        rating, review_count, place_id = get_business_rating_from_places(
            installer['name'],
            installer.get('city'),
            installer.get('state')
        )
        installer['rating'] = rating
        installer['review_count'] = review_count
        installer['place_id'] = place_id

    return jsonify({
        'installers': installers,
        'total_found': len(results),
        'search_area': {
            'zip_code': zip_code,
            'utility': utility
        }
    })


@app.route('/api/utilities', methods=['GET'])
def get_utilities():
    """Get list of supported utilities."""
    return jsonify({
        'utilities': [
            {'code': 'PGE', 'name': 'Pacific Gas & Electric (PG&E)'},
            {'code': 'SCE', 'name': 'Southern California Edison (SCE)'},
            {'code': 'SDGE', 'name': 'San Diego Gas & Electric (SDG&E)'}
        ]
    })


@app.route('/api/utility-by-zip', methods=['POST'])
def get_utility_by_zip_endpoint():
    """
    Auto-detect utility provider based on ZIP code.
    Returns the most common utility for that ZIP code from interconnection data.
    """
    data = request.json
    zip_code = data.get('zip_code', '')

    if not zip_code or len(str(zip_code).strip()) < 5:
        return jsonify({'error': 'Valid 5-digit ZIP code required'}), 400

    zip_str = str(zip_code).strip()[:5]

    df = load_installer_data()
    if df.empty:
        return jsonify({
            'detected': False,
            'utility': None,
            'message': 'No data available for utility detection'
        })

    matches = df[df['Service Zip'] == zip_str]

    if matches.empty:
        return jsonify({
            'detected': False,
            'utility': None,
            'zip_code': zip_str,
            'message': 'No utility data found for this ZIP code'
        })

    # Get the most common utility for this ZIP
    utility_mode = matches['Utility'].mode()
    if len(utility_mode) > 0:
        utility_raw = str(utility_mode.iloc[0]).upper()
        # Map to utility code
        utility_code = None
        utility_name = utility_raw

        # Check for PG&E variations
        if 'PGE' in utility_raw or 'PG&E' in utility_raw or 'PACIFIC GAS' in utility_raw:
            utility_code = 'PGE'
            utility_name = 'Pacific Gas & Electric (PG&E)'
        # Check for SCE variations
        elif 'SCE' in utility_raw or 'SOUTHERN CALIFORNIA EDISON' in utility_raw:
            utility_code = 'SCE'
            utility_name = 'Southern California Edison (SCE)'
        # Check for SDG&E variations
        elif 'SDGE' in utility_raw or 'SDG&E' in utility_raw or 'SAN DIEGO GAS' in utility_raw:
            utility_code = 'SDGE'
            utility_name = 'San Diego Gas & Electric (SDG&E)'

        return jsonify({
            'detected': True,
            'utility_code': utility_code,
            'utility_name': utility_name,
            'zip_code': zip_str,
            'confidence': len(matches),
            'message': f'Detected {utility_name.split(" (")[0]} for your area'
        })

    return jsonify({
        'detected': False,
        'utility': None,
        'zip_code': zip_str,
        'message': 'Could not determine utility for this ZIP code'
    })


@app.route('/api/geocode', methods=['POST'])
def geocode_address():
    """Geocode an address to get coordinates."""
    data = request.json
    address = data.get('address', '')
    
    if not address:
        return jsonify({'error': 'Address is required'}), 400
    
    if not GOOGLE_SOLAR_API_KEY:
        # Return mock coordinates for testing
        return jsonify({
            'mock': True,
            'lat': 37.7749,
            'lng': -122.4194,
            'formatted_address': address
        })
    
    try:
        geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {'address': address, 'key': GOOGLE_SOLAR_API_KEY}
        response = requests.get(geocode_url, params=params)
        data = response.json()
        
        if data['status'] == 'OK':
            result = data['results'][0]
            location = result['geometry']['location']
            
            # Extract zip code from address components
            zip_code = None
            city = None
            county = None
            
            for component in result['address_components']:
                if 'postal_code' in component['types']:
                    zip_code = component['short_name']
                if 'locality' in component['types']:
                    city = component['long_name']
                if 'administrative_area_level_2' in component['types']:
                    county = component['long_name']
            
            return jsonify({
                'lat': location['lat'],
                'lng': location['lng'],
                'formatted_address': result['formatted_address'],
                'zip_code': zip_code,
                'city': city,
                'county': county
            })
        else:
            return jsonify({'error': f"Geocoding failed: {data['status']}"}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/building-imagery', methods=['POST'])
def get_building_imagery():
    """
    Get aerial imagery and building insights for solar panel overlay visualization.
    Uses Google Maps Static API for aerial view and Solar API for building data.
    """
    data = request.json
    address = data.get('address', '')
    
    if not address:
        return jsonify({'error': 'Address is required'}), 400
    
    if not GOOGLE_SOLAR_API_KEY:
        logger.warning(f"⚠️  MOCK DATA: No API key configured. Returning mock imagery data for address: {address}")
        return jsonify({
            'mock': True,
            'warning': 'Google Solar API key not configured. Using placeholder imagery.',
            'aerialImageUrl': None,
            'center': {'lat': 37.7749, 'lng': -122.4194},
            'roofSegments': [],
            'solarPanels': []
        })
    
    try:
        # Geocode the address
        logger.info(f"📍 Building Imagery: Geocoding address: {address}")
        geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
        geocode_params = {'address': address, 'key': GOOGLE_SOLAR_API_KEY}
        geocode_response = requests.get(geocode_url, params=geocode_params)
        geocode_data = geocode_response.json()
        
        if geocode_data['status'] != 'OK':
            logger.error(f"❌ Building Imagery: Geocoding failed for: {address}")
            return jsonify({'error': 'Could not geocode address'}), 400
        
        location = geocode_data['results'][0]['geometry']['location']
        lat, lng = location['lat'], location['lng']
        logger.info(f"✅ Building Imagery: Geocoded to ({lat}, {lng})")
        
        # Get building insights from Solar API
        logger.info(f"🏠 Building Imagery: Fetching building insights")
        solar_url = "https://solar.googleapis.com/v1/buildingInsights:findClosest"
        solar_params = {
            'location.latitude': lat,
            'location.longitude': lng,
            'requiredQuality': 'HIGH',
            'key': GOOGLE_SOLAR_API_KEY
        }
        
        solar_response = requests.get(solar_url, params=solar_params)
        
        building_center = {'lat': lat, 'lng': lng}
        roof_segments = []
        solar_panels = []
        bounding_box = None
        
        if solar_response.status_code == 200:
            solar_data = solar_response.json()
            logger.info(f"✅ Building Imagery: Got building insights")
            
            # Extract building center if available
            if 'center' in solar_data:
                building_center = {
                    'lat': solar_data['center']['latitude'],
                    'lng': solar_data['center']['longitude']
                }
            
            # Extract bounding box
            if 'boundingBox' in solar_data:
                bb = solar_data['boundingBox']
                bounding_box = {
                    'sw': {'lat': bb['sw']['latitude'], 'lng': bb['sw']['longitude']},
                    'ne': {'lat': bb['ne']['latitude'], 'lng': bb['ne']['longitude']}
                }
            
            # Extract roof segment stats for visualization
            potential = solar_data.get('solarPotential', {})
            for i, segment in enumerate(potential.get('roofSegmentStats', [])):
                roof_segments.append({
                    'id': i,
                    'pitchDegrees': segment.get('pitchDegrees', 0),
                    'azimuthDegrees': segment.get('azimuthDegrees', 180),
                    'panelsCount': segment.get('panelsCount', 0),
                    'yearlyEnergyDcKwh': segment.get('yearlyEnergyDcKwh', 0),
                    'center': segment.get('center', building_center),
                    'boundingBox': segment.get('boundingBox')
                })
            
            # Extract solar panel positions if available
            if 'solarPanels' in potential:
                for panel in potential['solarPanels']:
                    solar_panels.append({
                        'center': {
                            'lat': panel['center']['latitude'],
                            'lng': panel['center']['longitude']
                        },
                        'orientation': panel.get('orientation', 'LANDSCAPE'),
                        'segmentIndex': panel.get('segmentIndex', 0),
                        'yearlyEnergyDcKwh': panel.get('yearlyEnergyDcKwh', 0)
                    })
        else:
            logger.warning(f"⚠️ Building Imagery: Solar API returned {solar_response.status_code}")
        
        # Generate aerial image URL using Google Maps Static API
        # Larger size, zoom 19 for more context, with a marker on the building
        aerial_image_url = (
            f"https://maps.googleapis.com/maps/api/staticmap?"
            f"center={building_center['lat']},{building_center['lng']}"
            f"&zoom=19"
            f"&size=800x600"
            f"&scale=2"
            f"&maptype=satellite"
            f"&markers=color:orange%7Csize:small%7C{building_center['lat']},{building_center['lng']}"
            f"&key={GOOGLE_SOLAR_API_KEY}"
        )
        
        # Also fetch data layers for RGB imagery and annual flux (sunshine) if available
        rgb_url = None
        mask_url = None
        annual_flux_url = None
        monthly_flux_url = None
        dsm_url = None
        try:
            layers_url = "https://solar.googleapis.com/v1/dataLayers:get"
            layers_params = {
                'location.latitude': building_center['lat'],
                'location.longitude': building_center['lng'],
                'radiusMeters': 100,
                'view': 'FULL_LAYERS',
                'requiredQuality': 'HIGH',
                'pixelSizeMeters': 0.25,
                'key': GOOGLE_SOLAR_API_KEY
            }
            layers_response = requests.get(layers_url, params=layers_params)
            if layers_response.status_code == 200:
                layers_data = layers_response.json()
                rgb_url = layers_data.get('rgbUrl')
                mask_url = layers_data.get('maskUrl')
                annual_flux_url = layers_data.get('annualFluxUrl')
                monthly_flux_url = layers_data.get('monthlyFluxUrl')
                dsm_url = layers_data.get('dsmUrl')
                logger.info(f"✅ Building Imagery: Got data layers - RGB: {bool(rgb_url)}, Mask: {bool(mask_url)}, AnnualFlux: {bool(annual_flux_url)}")
        except Exception as layer_err:
            logger.warning(f"⚠️ Building Imagery: Could not fetch data layers: {layer_err}")
        
        logger.info(f"✅ REAL DATA: Building imagery prepared for: {address} with {len(solar_panels)} panels")
        
        return jsonify({
            'mock': False,
            'aerialImageUrl': aerial_image_url,
            'rgbUrl': rgb_url,
            'maskUrl': mask_url,
            'annualFluxUrl': annual_flux_url,
            'monthlyFluxUrl': monthly_flux_url,
            'dsmUrl': dsm_url,
            'center': building_center,
            'boundingBox': bounding_box,
            'roofSegments': roof_segments,
            'solarPanels': solar_panels,
            'totalPanels': len(solar_panels),
            'address': address
        })
        
    except Exception as e:
        logger.exception(f"❌ Building Imagery: Exception - {str(e)}")
        return jsonify({'error': str(e)}), 500


# Load installer summary at startup (small file, loads instantly)
logger.info("📊 Loading installer summary...")
load_installer_summary()
logger.info("✅ Server ready!")


if __name__ == '__main__':
    print("Starting Solar App Backend on port 5001...")
    app.run(debug=False, port=5001, host='0.0.0.0')
