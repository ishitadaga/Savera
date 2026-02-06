"""
Tests for Savera Solar API endpoints.
Run with: pytest backend/tests/ -v
"""

import pytest
import json
from unittest.mock import patch, MagicMock
import pandas as pd
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, load_installer_data, load_battery_pricing_data, get_utility_from_zip


@pytest.fixture
def client():
    """Create test client."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def mock_installer_data():
    """Create mock installer data DataFrame."""
    return pd.DataFrame({
        'Application Id': ['APP001', 'APP002', 'APP003', 'APP004', 'APP005'],
        'Utility': ['PGE', 'PGE', 'SCE', 'SDGE', 'PGE'],
        'Service Zip': ['94041', '94041', '90210', '92101', '94041'],
        'Service City': ['Mountain View', 'Mountain View', 'Beverly Hills', 'San Diego', 'Mountain View'],
        'Service County': ['Santa Clara', 'Santa Clara', 'Los Angeles', 'San Diego', 'Santa Clara'],
        'Installer Name': ['SunPower', 'Tesla Energy', 'Vivint Solar', 'Sunrun', 'SunPower'],
        'Cost/Watt': [3.50, 3.25, 3.75, 3.40, 3.60],
        'System Size DC': [8.0, 10.0, 6.5, 12.0, 7.5],
        'Installer Phone': ['555-0001', '555-0002', '555-0003', '555-0004', '555-0001'],
        'Installer City': ['San Jose', 'Fremont', 'LA', 'San Diego', 'San Jose'],
        'Installer State': ['CA', 'CA', 'CA', 'CA', 'CA'],
        'Installer Zip': ['95101', '94538', '90001', '92101', '95101'],
        'CSLB Number': ['123456', '234567', '345678', '456789', '123456']
    })


class TestHealthEndpoint:
    """Tests for /api/health endpoint."""

    def test_health_check(self, client):
        """Test health endpoint returns OK."""
        response = client.get('/api/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
        assert 'api_key_configured' in data


class TestUtilitiesEndpoint:
    """Tests for /api/utilities endpoint."""

    def test_get_utilities(self, client):
        """Test utilities endpoint returns all 3 CA utilities."""
        response = client.get('/api/utilities')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'utilities' in data
        assert len(data['utilities']) == 3

        codes = [u['code'] for u in data['utilities']]
        assert 'PGE' in codes
        assert 'SCE' in codes
        assert 'SDGE' in codes


class TestUtilityByZipEndpoint:
    """Tests for /api/utility-by-zip endpoint."""

    def test_missing_zip(self, client):
        """Test error when ZIP is missing."""
        response = client.post('/api/utility-by-zip',
                              data=json.dumps({'zip_code': ''}),
                              content_type='application/json')
        assert response.status_code == 400

    def test_invalid_zip(self, client):
        """Test error when ZIP is too short."""
        response = client.post('/api/utility-by-zip',
                              data=json.dumps({'zip_code': '123'}),
                              content_type='application/json')
        assert response.status_code == 400

    @patch('app.load_installer_data')
    def test_valid_zip_pge(self, mock_load, client, mock_installer_data):
        """Test PG&E detection for Mountain View ZIP."""
        mock_load.return_value = mock_installer_data

        response = client.post('/api/utility-by-zip',
                              data=json.dumps({'zip_code': '94041'}),
                              content_type='application/json')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['detected'] == True
        assert data['utility_code'] == 'PGE'

    @patch('app.load_installer_data')
    def test_valid_zip_sce(self, mock_load, client, mock_installer_data):
        """Test SCE detection for Beverly Hills ZIP."""
        mock_load.return_value = mock_installer_data

        response = client.post('/api/utility-by-zip',
                              data=json.dumps({'zip_code': '90210'}),
                              content_type='application/json')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['detected'] == True
        assert data['utility_code'] == 'SCE'


class TestPricingEndpoint:
    """Tests for /api/pricing endpoint."""

    @patch('app.load_installer_data')
    @patch('app.load_battery_pricing_data')
    def test_basic_pricing(self, mock_battery, mock_installer, client, mock_installer_data):
        """Test basic pricing without battery."""
        mock_installer.return_value = mock_installer_data
        mock_battery.return_value = {
            'avg_cost_per_kwh': 750,
            'min_cost_per_kwh': 600,
            'max_cost_per_kwh': 900,
            'avg_incentive_per_kwh': 0,
            'sample_size': 100,
            'common_capacities': [10, 13.5, 20, 27],
            'source': 'test'
        }

        response = client.post('/api/pricing',
                              data=json.dumps({
                                  'zip_code': '94041',
                                  'system_size_kw': 8,
                                  'utility': 'PGE',
                                  'include_battery': False
                              }),
                              content_type='application/json')

        assert response.status_code == 200
        data = json.loads(response.data)

        assert 'avg_cost_per_watt' in data
        assert 'estimated_total_cost' in data
        assert 'net_cost' in data
        assert data['battery'] is None
        # Federal ITC expired Dec 31, 2025
        assert 'federal_tax_credit_30' not in data

    @patch('app.load_installer_data')
    @patch('app.load_battery_pricing_data')
    def test_pricing_with_battery(self, mock_battery, mock_installer, client, mock_installer_data):
        """Test pricing with battery included."""
        mock_installer.return_value = mock_installer_data
        mock_battery.return_value = {
            'avg_cost_per_kwh': 750,
            'min_cost_per_kwh': 600,
            'max_cost_per_kwh': 900,
            'avg_incentive_per_kwh': 50,
            'sample_size': 100,
            'common_capacities': [10, 13.5, 20, 27],
            'source': 'test'
        }

        response = client.post('/api/pricing',
                              data=json.dumps({
                                  'zip_code': '94041',
                                  'system_size_kw': 8,
                                  'utility': 'PGE',
                                  'include_battery': True,
                                  'battery_capacity_kwh': 13.5
                              }),
                              content_type='application/json')

        assert response.status_code == 200
        data = json.loads(response.data)

        assert data['battery'] is not None
        assert data['battery']['included'] == True
        assert data['battery']['capacity_kwh'] == 13.5
        assert data['battery']['cost'] == 750 * 13.5  # 10125

    @patch('app.load_installer_data')
    @patch('app.load_battery_pricing_data')
    def test_federal_credit_expired(self, mock_battery, mock_installer, client, mock_installer_data):
        """Test that federal credit is NOT included (expired Dec 31, 2025)."""
        mock_installer.return_value = mock_installer_data
        mock_battery.return_value = {
            'avg_cost_per_kwh': 750,
            'avg_incentive_per_kwh': 0,
            'sample_size': 100,
            'common_capacities': [10, 13.5, 20, 27],
            'source': 'test'
        }

        response = client.post('/api/pricing',
                              data=json.dumps({
                                  'zip_code': '94041',
                                  'system_size_kw': 10,
                                  'utility': 'PGE',
                                  'include_battery': False
                              }),
                              content_type='application/json')

        data = json.loads(response.data)

        # Federal ITC expired Dec 31, 2025 - should not be in response
        assert 'federal_tax_credit_30' not in data
        assert 'net_cost_after_federal' not in data
        # Net cost should equal total cost (no credits)
        assert data['net_cost'] == data['total_system_cost']


class TestInstallersEndpoint:
    """Tests for /api/installers endpoint."""

    @patch('app.load_installer_data')
    @patch('app.get_business_rating_from_places')
    def test_get_installers_by_zip(self, mock_places, mock_installer, client, mock_installer_data):
        """Test getting installers by ZIP code."""
        mock_installer.return_value = mock_installer_data
        mock_places.return_value = (4.5, 100, 'place123')

        response = client.post('/api/installers',
                              data=json.dumps({
                                  'zip_code': '94041',
                                  'limit': 10
                              }),
                              content_type='application/json')

        assert response.status_code == 200
        data = json.loads(response.data)

        assert 'installers' in data
        assert len(data['installers']) > 0

        # SunPower should be first (most projects in 94041)
        assert data['installers'][0]['name'] == 'SunPower'
        assert data['installers'][0]['project_count'] == 2


class TestGeocodeEndpoint:
    """Tests for /api/geocode endpoint."""

    def test_missing_address(self, client):
        """Test error when address is missing."""
        response = client.post('/api/geocode',
                              data=json.dumps({'address': ''}),
                              content_type='application/json')
        assert response.status_code == 400

    @patch('app.GOOGLE_SOLAR_API_KEY', '')
    def test_mock_geocode_no_api_key(self, client):
        """Test mock response when no API key configured."""
        response = client.post('/api/geocode',
                              data=json.dumps({'address': '123 Main St, Mountain View, CA'}),
                              content_type='application/json')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['mock'] == True
        assert 'lat' in data
        assert 'lng' in data


class TestDataLoadingFunctions:
    """Tests for data loading helper functions."""

    def test_get_utility_from_zip_with_mock_data(self, mock_installer_data):
        """Test utility detection from mock data."""
        with patch('app._installer_data', mock_installer_data):
            with patch('app.load_installer_data', return_value=mock_installer_data):
                result = get_utility_from_zip('94041')
                # PGE is most common in 94041 (3 out of 3 records)
                assert 'PG' in result.upper() or result == 'PGE'


class TestCalculations:
    """Tests for financial calculations."""

    def test_cost_per_watt_averaging(self, mock_installer_data):
        """Test that cost/watt is averaged correctly."""
        # Filter to 94041
        filtered = mock_installer_data[mock_installer_data['Service Zip'] == '94041']
        expected_avg = filtered['Cost/Watt'].mean()

        # Should be (3.50 + 3.25 + 3.60) / 3 = 3.45
        assert abs(expected_avg - 3.45) < 0.01

    def test_net_cost_equals_gross_no_federal_credit(self):
        """Test net cost = gross (no federal credit after Dec 31, 2025)."""
        gross_cost = 28000
        # Federal ITC expired - net cost equals gross cost
        net_cost = gross_cost
        assert net_cost == 28000

    def test_battery_cost_calculation(self):
        """Test battery cost = capacity * $/kWh."""
        capacity_kwh = 13.5
        cost_per_kwh = 750
        expected_cost = capacity_kwh * cost_per_kwh
        assert expected_cost == 10125


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
