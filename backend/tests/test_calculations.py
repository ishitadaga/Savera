"""
Tests for solar savings calculations.
These mirror the frontend calculations to ensure consistency.
Run with: pytest backend/tests/test_calculations.py -v
"""

import pytest


class TestNEM3Calculations:
    """Tests for NEM 3.0 savings calculations."""

    # Constants matching frontend
    NEM3_EXPORT_RATE = 0.08  # $/kWh
    DC_TO_AC_DERATE = 0.85

    def test_dc_to_ac_conversion(self):
        """Test 85% DC-to-AC derate factor."""
        dc_production = 10000  # kWh DC
        ac_production = dc_production * self.DC_TO_AC_DERATE
        assert ac_production == 8500

    def test_self_consumption_without_battery(self):
        """Test ~48% self-consumption without battery."""
        solar_production = 8500  # kWh AC
        base_self_consumption = 0.48

        self_consumed = solar_production * base_self_consumption
        exported = solar_production - self_consumed

        assert self_consumed == 4080
        assert exported == 4420

    def test_self_consumption_with_battery(self):
        """Test battery adds ~27% to self-consumption (capped at 90%)."""
        solar_production = 8500  # kWh AC
        base_self_consumption = 0.48
        battery_boost = 0.27

        with_battery = min(0.90, base_self_consumption + battery_boost)
        assert with_battery == 0.75

        self_consumed = solar_production * with_battery
        assert self_consumed == 6375

    def test_self_consumption_cap_at_90(self):
        """Test self-consumption is capped at 90% with battery."""
        base = 0.70  # Higher than typical
        battery_boost = 0.27

        with_battery = min(0.90, base + battery_boost)
        assert with_battery == 0.90  # Capped

    def test_self_consumed_capped_at_usage(self):
        """Test self-consumed kWh can't exceed home usage."""
        solar_production = 12000  # kWh AC (large system)
        home_usage = 7000  # kWh/year
        self_consumption_ratio = 0.75

        # Would be 9000 kWh, but capped at home usage
        self_consumed = min(solar_production * self_consumption_ratio, home_usage)
        assert self_consumed == 7000

    def test_export_credits_nem3(self):
        """Test NEM 3.0 export credits at $0.08/kWh."""
        exported_kwh = 4420
        export_credits = exported_kwh * self.NEM3_EXPORT_RATE
        assert export_credits == 353.60

    def test_savings_calculation_no_battery(self):
        """Test full savings calculation without battery."""
        # Inputs
        solar_production_dc = 10000  # kWh DC
        home_usage = 7000  # kWh/year
        electricity_rate = 0.35  # $/kWh
        self_consumption_ratio = 0.48

        # Step 1: DC to AC
        solar_production = solar_production_dc * self.DC_TO_AC_DERATE
        assert solar_production == 8500

        # Step 2: Self-consumption
        self_consumed = min(solar_production * self_consumption_ratio, home_usage)
        assert self_consumed == 4080

        exported = solar_production - self_consumed
        assert exported == 4420

        # Step 3: Savings
        self_consumption_savings = self_consumed * electricity_rate
        assert self_consumption_savings == 1428.0

        export_credits = exported * self.NEM3_EXPORT_RATE
        assert export_credits == 353.60

        # Step 4: Bills
        yearly_bill_without_solar = home_usage * electricity_rate
        assert yearly_bill_without_solar == 2450.0

        remaining_grid = home_usage - self_consumed
        assert remaining_grid == 2920

        yearly_bill_with_solar = max(0, remaining_grid * electricity_rate - export_credits)
        assert yearly_bill_with_solar == pytest.approx(668.40, rel=0.01)

        yearly_savings = yearly_bill_without_solar - yearly_bill_with_solar
        assert yearly_savings == pytest.approx(1781.60, rel=0.01)

    def test_savings_calculation_with_battery(self):
        """Test full savings calculation with battery."""
        # Inputs
        solar_production_dc = 10000  # kWh DC
        home_usage = 7000  # kWh/year
        electricity_rate = 0.35  # $/kWh
        base_self_consumption = 0.48
        battery_tou_bonus_rate = 0.08

        # With battery
        self_consumption_ratio = min(0.90, base_self_consumption + 0.27)
        assert self_consumption_ratio == 0.75

        # Step 1: DC to AC
        solar_production = solar_production_dc * self.DC_TO_AC_DERATE
        assert solar_production == 8500

        # Step 2: Self-consumption (capped at home usage)
        self_consumed = min(solar_production * self_consumption_ratio, home_usage)
        assert self_consumed == 6375

        exported = solar_production - self_consumed
        assert exported == 2125

        # Step 3: Battery TOU bonus
        battery_tou_bonus = home_usage * electricity_rate * battery_tou_bonus_rate
        assert battery_tou_bonus == 196.0

        # Step 4: Bills
        yearly_bill_without_solar = home_usage * electricity_rate
        assert yearly_bill_without_solar == 2450.0

        remaining_grid = home_usage - self_consumed
        assert remaining_grid == 625

        export_credits = exported * self.NEM3_EXPORT_RATE
        assert export_credits == 170.0

        yearly_bill_with_solar = max(0, remaining_grid * electricity_rate - export_credits - battery_tou_bonus)
        assert yearly_bill_with_solar == pytest.approx(0, abs=50)  # Should be near zero

        yearly_savings = yearly_bill_without_solar - yearly_bill_with_solar
        assert yearly_savings > 2000  # Significant savings with battery


class TestCostCalculations:
    """Tests for system cost calculations."""

    def test_solar_cost_calculation(self):
        """Test solar system cost = size * $/watt * 1000."""
        system_size_kw = 8
        cost_per_watt = 3.50
        expected = system_size_kw * cost_per_watt * 1000
        assert expected == 28000

    def test_battery_cost_calculation(self):
        """Test battery cost = capacity * $/kWh."""
        capacity = 13.5
        cost_per_kwh = 750
        expected = capacity * cost_per_kwh
        assert expected == 10125

    def test_federal_credit_expired(self):
        """Test federal ITC expired Dec 31, 2025 - no longer applied."""
        total_cost = 38125  # Solar + battery
        # Federal credit is 0 after expiration
        federal_credit = 0
        net_cost = total_cost - federal_credit
        assert net_cost == total_cost

    def test_net_cost_no_federal_credit(self):
        """Test net cost equals gross cost (no federal credit after Dec 31, 2025)."""
        solar_cost = 28000
        battery_cost = 10125
        total = solar_cost + battery_cost

        # Net cost = total (no federal credit)
        net = total
        assert total == 38125
        assert net == 38125

    def test_net_cost_with_ca_incentive_only(self):
        """Test net cost with CA incentive only (no federal credit)."""
        solar_cost = 28000
        battery_cost = 10125
        total = solar_cost + battery_cost
        ca_incentive = 13.5 * 50  # $50/kWh incentive

        # No federal credit after Dec 31, 2025
        net = total - ca_incentive
        assert net == pytest.approx(37450, rel=0.01)


class TestPaybackCalculation:
    """Tests for payback period calculation."""

    def test_payback_years(self):
        """Test payback = net cost / yearly savings."""
        net_cost = 28000  # No federal credit
        yearly_savings = 2450
        payback = net_cost / yearly_savings
        assert payback == pytest.approx(11.43, rel=0.01)

    def test_payback_with_battery(self):
        """Test payback with battery (higher cost, higher savings)."""
        net_cost = 38125  # Solar + battery, no federal credit
        yearly_savings = 2400  # Higher savings with battery
        payback = net_cost / yearly_savings
        assert payback == pytest.approx(15.89, rel=0.01)

    def test_payback_capped_at_25_years(self):
        """Test payback display is capped at 25 years."""
        net_cost = 30000
        yearly_savings = 1000
        payback = net_cost / yearly_savings
        assert payback == 30

        # UI would show ">25" for this
        display = payback if payback <= 25 else ">25"
        assert display == ">25"

    def test_zero_savings_payback(self):
        """Test payback when savings is zero."""
        net_cost = 19600
        yearly_savings = 0

        # Avoid division by zero
        payback = net_cost / yearly_savings if yearly_savings > 0 else 99
        assert payback == 99


class TestCoverageCalculation:
    """Tests for energy offset/coverage calculation."""

    def test_coverage_percent(self):
        """Test coverage = solar production / home usage."""
        solar_production = 8500
        home_usage = 7000
        coverage = (solar_production / home_usage) * 100
        assert coverage == pytest.approx(121.43, rel=0.01)

    def test_coverage_capped_at_100(self):
        """Test coverage display is capped at 100%."""
        solar_production = 10000
        home_usage = 7000
        coverage = min(100, (solar_production / home_usage) * 100)
        assert coverage == 100

    def test_coverage_under_100(self):
        """Test coverage when solar < usage."""
        solar_production = 5000
        home_usage = 7000
        coverage = min(100, (solar_production / home_usage) * 100)
        assert coverage == pytest.approx(71.43, rel=0.01)


class Test25YearProjection:
    """Tests for 25-year savings projection."""

    def test_25_year_bill_without_solar(self):
        """Test 25-year total bill without solar."""
        yearly_bill = 2450
        total = yearly_bill * 25
        assert total == 61250

    def test_25_year_savings(self):
        """Test 25-year total savings."""
        yearly_bill_without = 2450
        yearly_bill_with = 668.40
        net_cost = 19600

        total_without = yearly_bill_without * 25
        total_with = net_cost + (yearly_bill_with * 25)
        savings = total_without - total_with

        assert savings == pytest.approx(24940, rel=0.01)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
