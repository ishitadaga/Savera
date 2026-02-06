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
CORS(app)

# Configuration
GOOGLE_SOLAR_API_KEY = os.environ.get('GOOGLE_SOLAR_API_KEY', '')
DATA_DIR = Path(__file__).parent.parent

# Cache for loaded data
_installer_data = None
_pricing_data = None
_battery_pricing_data = None
_places_rating_cache = {}  # Cache for Places API ratings


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


def load_installer_data():
    """Load and process installer data from interconnection datasets."""
    global _installer_data
    if _installer_data is not None:
        return _installer_data
    
    datasets = []
    data_folder = DATA_DIR / 'Interconnection_Applications_Dataset_2025-11-30'
    
    csv_files = [
        'PGE_Interconnection_Applications_Dataset_Jan2020-Nov2025.csv',
        'SCE_Interconnection_Applications_Dataset_Jan2020-Nov2025.csv',
        'SDGE_Interconnection_Applications_Dataset_Historical-Nov2025.csv',
    ]
    
    columns_to_load = [
        'Application Id', 'Utility', 'Service City', 'Service Zip', 'Service County',
        'System Size DC', 'System Size AC', 'Total System Cost', 'Cost/Watt',
        'Installer Name', 'Installer Phone', 'Installer City', 'Installer State', 
        'Installer Zip', 'CSLB Number', 'App Approved Date', 'Customer Sector',
        'Technology Type'
    ]
    
    for csv_file in csv_files:
        file_path = data_folder / csv_file
        if file_path.exists():
            try:
                df = pd.read_csv(file_path, usecols=lambda x: x in columns_to_load, 
                                low_memory=False)
                datasets.append(df)
                print(f"Loaded {len(df)} records from {csv_file}")
            except Exception as e:
                print(f"Error loading {csv_file}: {e}")
    
    if datasets:
        _installer_data = pd.concat(datasets, ignore_index=True)
        # Clean data
        _installer_data['Service Zip'] = _installer_data['Service Zip'].astype(str).str[:5]
        _installer_data['Installer Zip'] = _installer_data['Installer Zip'].astype(str).str[:5]
        # Keep all records - the data already includes solar installations
        # Filter out rows without installer information
        _installer_data = _installer_data[
            _installer_data['Installer Name'].notna() & 
            (_installer_data['Installer Name'] != '') &
            (_installer_data['Installer Name'].str.lower() != 'nan')
        ]
        print(f"Total solar records loaded: {len(_installer_data)}")
    else:
        _installer_data = pd.DataFrame()
    
    return _installer_data


def get_utility_from_zip(zip_code):
    """Determine utility based on zip code from the data."""
    df = load_installer_data()
    if df.empty:
        return "Unknown"
    
    zip_str = str(zip_code)[:5]
    matches = df[df['Service Zip'] == zip_str]
    
    if not matches.empty:
        return matches['Utility'].mode().iloc[0] if len(matches['Utility'].mode()) > 0 else "Unknown"
    return "Unknown"


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
    return jsonify({'status': 'healthy', 'api_key_configured': bool(GOOGLE_SOLAR_API_KEY)})


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
    Now includes optional battery storage pricing.
    """
    data = request.json
    zip_code = data.get('zip_code', '')
    system_size_kw = data.get('system_size_kw', 6)  # Default 6kW system
    utility = data.get('utility', '')
    include_battery = data.get('include_battery', False)
    battery_capacity_kwh = data.get('battery_capacity_kwh', 13.5)  # Default Tesla Powerwall size
    
    df = load_installer_data()
    
    if df.empty:
        # Return default California averages if no data
        avg_cost_per_watt = 3.50
        solar_cost = avg_cost_per_watt * system_size_kw * 1000
        
        # Battery pricing
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
                'incentive': round(battery_incentive, 2),
                'net_battery_cost': round(battery_cost - battery_incentive, 2)
            }
        
        # Note: Federal ITC (30%) expired Dec 31, 2025

        return jsonify({
            'source': 'default',
            'avg_cost_per_watt': avg_cost_per_watt,
            'estimated_total_cost': round(solar_cost, 2),
            'net_cost': round(total_cost, 2),
            'sample_size': 0,
            'battery': battery_data,
            'total_system_cost': round(total_cost, 2),
            'note': 'Federal ITC (30%) expired Dec 31, 2025'
        })
    
    # Filter by zip code or county
    zip_str = str(zip_code)[:5]
    
    # Try to find local data
    local_data = df[df['Service Zip'] == zip_str].copy()
    
    if len(local_data) < 10:
        # Expand to utility territory
        if utility:
            local_data = df[df['Utility'].str.contains(utility, case=False, na=False)].copy()
        else:
            local_data = df.copy()
    
    # Filter to recent data (2023-2025) and valid cost data
    local_data = local_data[pd.to_numeric(local_data['Cost/Watt'], errors='coerce').notna()]
    local_data['Cost/Watt'] = pd.to_numeric(local_data['Cost/Watt'], errors='coerce')
    
    # Remove outliers (top and bottom 5%)
    if len(local_data) > 20:
        lower = local_data['Cost/Watt'].quantile(0.05)
        upper = local_data['Cost/Watt'].quantile(0.95)
        local_data = local_data[(local_data['Cost/Watt'] >= lower) & (local_data['Cost/Watt'] <= upper)]
    
    if len(local_data) > 0:
        avg_cost_per_watt = local_data['Cost/Watt'].mean()
        median_cost_per_watt = local_data['Cost/Watt'].median()
        min_cost = local_data['Cost/Watt'].min()
        max_cost = local_data['Cost/Watt'].max()
    else:
        avg_cost_per_watt = 3.50
        median_cost_per_watt = 3.40
        min_cost = 2.50
        max_cost = 5.00
    
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

    return jsonify({
        'source': 'california_dg_stats',
        'zip_code': zip_str,
        'utility': utility or get_utility_from_zip(zip_str),
        'system_size_kw': system_size_kw,
        'avg_cost_per_watt': round(avg_cost_per_watt, 2),
        'median_cost_per_watt': round(median_cost_per_watt, 2),
        'cost_range': {
            'min': round(min_cost, 2),
            'max': round(max_cost, 2)
        },
        'estimated_total_cost': round(solar_cost, 2),
        'battery': battery_data,
        'total_system_cost': round(total_cost, 2),
        'net_cost': round(total_cost, 2),
        'sample_size': len(local_data),
        'note': 'Prices based on California DG Stats interconnection data (2020-2025). Federal ITC (30%) expired Dec 31, 2025.' + (' Includes SOMAH battery data.' if include_battery else '')
    })


@app.route('/api/installers', methods=['POST'])
def get_installers():
    """
    Get installers that have completed projects in the specified area.
    """
    data = request.json
    zip_code = data.get('zip_code', '')
    city = data.get('city', '')
    county = data.get('county', '')
    utility = data.get('utility', '')
    limit = data.get('limit', 20)
    
    df = load_installer_data()
    
    if df.empty:
        return jsonify({
            'installers': [],
            'message': 'No installer data available'
        })
    
    # Filter data
    filtered = df.copy()
    
    if zip_code:
        zip_str = str(zip_code)[:5]
        filtered = filtered[filtered['Service Zip'] == zip_str]
    
    if city and len(filtered) < 5:
        filtered = df[df['Service City'].str.contains(city, case=False, na=False)]
    
    if county and len(filtered) < 5:
        filtered = df[df['Service County'].str.contains(county, case=False, na=False)]
    
    if utility and len(filtered) < 5:
        filtered = df[df['Utility'].str.contains(utility, case=False, na=False)]
    
    # If still no results, return top installers overall
    if len(filtered) < 5:
        filtered = df
    
    # Group by installer and calculate stats
    installer_stats = filtered.groupby('Installer Name').agg({
        'Application Id': 'count',
        'Cost/Watt': lambda x: pd.to_numeric(x, errors='coerce').mean(),
        'System Size DC': lambda x: pd.to_numeric(x, errors='coerce').mean(),
        'Installer Phone': 'first',
        'Installer City': 'first',
        'Installer State': 'first',
        'Installer Zip': 'first',
        'CSLB Number': 'first'
    }).reset_index()
    
    installer_stats.columns = [
        'name', 'project_count', 'avg_cost_per_watt', 'avg_system_size_kw',
        'phone', 'city', 'state', 'zip', 'cslb_license'
    ]
    
    # Filter out entries without installer name
    installer_stats = installer_stats[
        installer_stats['name'].notna() & 
        (installer_stats['name'] != '') &
        (installer_stats['name'].str.lower() != 'nan')
    ]
    
    # Sort by project count
    installer_stats = installer_stats.sort_values('project_count', ascending=False)
    
    # Format output
    installers = []
    for _, row in installer_stats.head(limit).iterrows():
        installers.append({
            'name': row['name'],
            'project_count': int(row['project_count']),
            'avg_cost_per_watt': round(row['avg_cost_per_watt'], 2) if pd.notna(row['avg_cost_per_watt']) else None,
            'avg_system_size_kw': round(row['avg_system_size_kw'], 2) if pd.notna(row['avg_system_size_kw']) else None,
            'phone': row['phone'] if pd.notna(row['phone']) else None,
            'city': row['city'] if pd.notna(row['city']) else None,
            'state': row['state'] if pd.notna(row['state']) else None,
            'zip': row['zip'] if pd.notna(row['zip']) else None,
            'cslb_license': row['cslb_license'] if pd.notna(row['cslb_license']) else None,
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
        'total_found': len(installer_stats),
        'search_area': {
            'zip_code': zip_code,
            'city': city,
            'county': county,
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


if __name__ == '__main__':
    print("Loading installer data...")
    load_installer_data()
    print("Starting Solar App Backend on port 5001...")
    app.run(debug=False, port=5001, host='0.0.0.0')
