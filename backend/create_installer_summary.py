#!/usr/bin/env python3
"""
Script to pre-aggregate installer data from large CSV files.
Creates a small summary file that can be loaded quickly without memory issues.
"""
import pandas as pd
import gzip
from pathlib import Path
import json

# Data folder with the original large files
DATA_DIR = Path(__file__).parent.parent / 'Interconnection_Applications_Dataset_2025-11-30'

# Output file
OUTPUT_FILE = Path(__file__).parent / 'data' / 'installer_summary.json.gz'

def load_raw_data():
    """Load all CSV files from the interconnection dataset."""
    datasets = []

    columns_to_load = [
        'Application Id', 'Utility', 'Service City', 'Service Zip', 'Service County',
        'System Size DC', 'Total System Cost', 'Cost/Watt',
        'Installer Name', 'Installer Phone', 'Installer City', 'Installer State',
        'Installer Zip', 'CSLB Number'
    ]

    for csv_file in DATA_DIR.glob('*.csv'):
        print(f"📖 Loading {csv_file.name}...")
        try:
            df = pd.read_csv(csv_file, usecols=lambda x: x in columns_to_load, low_memory=False)
            datasets.append(df)
            print(f"   ✓ Loaded {len(df):,} records")
        except Exception as e:
            print(f"   ❌ Error: {e}")

    if datasets:
        combined = pd.concat(datasets, ignore_index=True)
        print(f"\n📊 Total records: {len(combined):,}")
        return combined
    return pd.DataFrame()


def aggregate_by_zip(df):
    """Aggregate installer stats by ZIP code."""
    print("\n🔄 Aggregating by ZIP code...")

    # Filter out rows without installer name
    df = df[
        df['Installer Name'].notna() &
        (df['Installer Name'] != '') &
        (df['Installer Name'].str.lower() != 'nan')
    ]

    # Clean zip codes
    df['Service Zip'] = df['Service Zip'].astype(str).str[:5]
    df['Installer Zip'] = df['Installer Zip'].astype(str).str[:5]

    # Group by ZIP and installer
    zip_installer_stats = df.groupby(['Service Zip', 'Utility', 'Installer Name']).agg({
        'Application Id': 'count',
        'Cost/Watt': lambda x: pd.to_numeric(x, errors='coerce').mean(),
        'System Size DC': lambda x: pd.to_numeric(x, errors='coerce').mean(),
        'Installer Phone': 'first',
        'Installer City': 'first',
        'Installer State': 'first',
        'Installer Zip': 'first',
        'CSLB Number': 'first'
    }).reset_index()

    zip_installer_stats.columns = [
        'zip', 'utility', 'name', 'project_count', 'avg_cost_per_watt',
        'avg_system_size_kw', 'phone', 'city', 'state', 'installer_zip', 'cslb_license'
    ]

    # Keep only top 10 installers per ZIP to reduce size
    zip_installer_stats = zip_installer_stats.sort_values(
        ['zip', 'project_count'], ascending=[True, False]
    )
    zip_installer_stats = zip_installer_stats.groupby('zip').head(10)

    print(f"   ✓ Unique ZIP codes: {zip_installer_stats['zip'].nunique():,}")
    print(f"   ✓ Total installer entries: {len(zip_installer_stats):,}")

    return zip_installer_stats


def aggregate_top_installers(df):
    """Get overall top installers statewide."""
    print("\n🔄 Finding top installers statewide...")

    # Filter out rows without installer name
    df = df[
        df['Installer Name'].notna() &
        (df['Installer Name'] != '') &
        (df['Installer Name'].str.lower() != 'nan')
    ]

    installer_stats = df.groupby('Installer Name').agg({
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
        'phone', 'city', 'state', 'installer_zip', 'cslb_license'
    ]

    # Keep top 500 installers
    installer_stats = installer_stats.sort_values('project_count', ascending=False).head(500)

    print(f"   ✓ Top installers: {len(installer_stats):,}")

    return installer_stats


def create_zip_to_utility_map(df):
    """Create a mapping from ZIP code to utility."""
    print("\n🔄 Creating ZIP to utility mapping...")

    df['Service Zip'] = df['Service Zip'].astype(str).str[:5]

    # Find most common utility per ZIP
    zip_utility = df.groupby('Service Zip')['Utility'].agg(
        lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else None
    ).to_dict()

    print(f"   ✓ ZIP codes mapped: {len(zip_utility):,}")

    return zip_utility


def main():
    # Load raw data
    df = load_raw_data()
    if df.empty:
        print("❌ No data loaded!")
        return

    # Create aggregations
    zip_installers = aggregate_by_zip(df)
    top_installers = aggregate_top_installers(df)
    zip_to_utility = create_zip_to_utility_map(df)

    # Convert to JSON-serializable format
    summary = {
        'zip_installers': zip_installers.to_dict(orient='records'),
        'top_installers': top_installers.to_dict(orient='records'),
        'zip_to_utility': zip_to_utility,
        'metadata': {
            'total_records_processed': len(df),
            'unique_zips': len(zip_to_utility),
            'top_installers_count': len(top_installers)
        }
    }

    # Clean NaN values for JSON
    def clean_value(v):
        if pd.isna(v):
            return None
        if isinstance(v, float) and (v != v):  # NaN check
            return None
        return v

    for record in summary['zip_installers']:
        for k, v in record.items():
            record[k] = clean_value(v)

    for record in summary['top_installers']:
        for k, v in record.items():
            record[k] = clean_value(v)

    # Write compressed output
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    print(f"\n💾 Writing to {OUTPUT_FILE}...")

    with gzip.open(OUTPUT_FILE, 'wt', encoding='utf-8') as f:
        json.dump(summary, f)

    size_mb = OUTPUT_FILE.stat().st_size / 1024 / 1024
    print(f"   ✓ Output size: {size_mb:.2f} MB")
    print("\n✅ Done!")


if __name__ == '__main__':
    main()
