#!/usr/bin/env python3
"""Pack local copies of the cited Mars data products for the game browser."""

import argparse
import gzip
import json
from pathlib import Path

import h5py
from netCDF4 import Dataset
import numpy as np
from scipy import ndimage


DUST_URL = 'https://www-mars.lmd.jussieu.fr/mars/dust_climatology/'
MET_YEAR = 30
ATMOSPHERE_SAMPLE_STRIDE = 3  # Retain four evenly spaced samples per sol from the two-hour source.
GLOBAL_WINDOWS = {25: (193, 275), 28: (273, 304), 34: (193, 240)}
GRID = {'columns': 36, 'rows': 18, 'west': -180, 'south': -85, 'step': 10}
DTYPES = {'u8': 'u1', 'u16': '<u2', 'i16': '<i2'}


class Archive:
    def __init__(self):
        self.payload = bytearray()

    def pack(self, values, kind='u16', scale=1):
        dtype = DTYPES[kind]
        limits = np.iinfo(dtype)
        values = np.rint(np.asarray(values) / scale)
        if not np.isfinite(values).all() or values.min() < limits.min or values.max() > limits.max:
            raise ValueError(f'Field exceeds the limits of {kind} at scale {scale}')
        entry = {'offset': len(self.payload), 'length': values.size, 'type': kind}
        self.payload.extend(values.astype(dtype).tobytes())
        return entry


def grid_coordinates(grid):
    return (grid['south'] + np.arange(grid['rows']) * grid['step'],
            grid['west'] + np.arange(grid['columns']) * grid['step'])


def regrid(values, lat, lon, grid=GRID, nearest=False):
    """Resample the last two axes northward and handle the longitude seam."""
    rows = np.argsort(lat)
    degrees = (np.asarray(lon) + 180) % 360 - 180
    columns = np.argsort(degrees)
    target_lat, target_lon = grid_coordinates(grid)
    y = np.interp(target_lat, lat[rows], np.arange(len(lat)))
    # Add a ghost column to interpolate across the date line.
    west = degrees[columns][0]
    x = np.interp((target_lon - west) % 360 + west, np.r_[degrees[columns], west + 360],
                  np.arange(len(lon) + 1))
    ordered = values[..., rows[:, None], columns]
    if nearest:
        return ordered[..., np.rint(y).astype(int)[:, None], np.rint(x).astype(int) % len(lon)]
    x0, y0 = x.astype(int), y.astype(int)
    x1, y1 = (x0 + 1) % len(lon), np.minimum(y0 + 1, len(lat) - 1)
    fx, fy = x - x0, (y - y0)[:, None]
    a = ordered[..., y0[:, None], x0] * (1 - fx) + ordered[..., y0[:, None], x1] * fx
    b = ordered[..., y1[:, None], x0] * (1 - fx) + ordered[..., y1[:, None], x1] * fx
    return a * (1 - fy) + b * fy


def dust_path(folder, year):
    version = '2-5' if year >= 34 else '2-1' if year == 33 else '2-0'
    return folder / f'dustscenario_MY{year}_v{version}.nc'


def read_dust(folder, year, field):
    with Dataset(dust_path(folder, year)) as source:
        angles = source['Ls'][:].data
        # A first/last noon in some source years lies just outside that Ls year.
        boundaries = np.r_[0, np.flatnonzero(np.diff(angles) < -180) + 1, len(angles)]
        index = np.argmax(np.diff(boundaries))
        days = slice(boundaries[index], boundaries[index + 1])
        return (angles[days], source[field][days].filled(np.nan), source['latitude'][:].data,
                source['longitude'][:].data)


def storm_mask(above_background, lat):
    """Follow overlapping elevated dust footprints across sols and the map seam."""
    labels, count = ndimage.label(above_background)
    parents = np.arange(count + 1)

    def root(label):
        while label != parents[label]:
            parents[label] = parents[parents[label]]
            label = parents[label]
        return label

    seam = (labels[:, :, 0] > 0) & (labels[:, :, -1] > 0)
    for a, b in zip(labels[:, :, 0][seam], labels[:, :, -1][seam]):
        parents[root(a)] = root(b)
    parents = np.array([root(label) for label in range(count + 1)])
    labels = parents[labels]
    first = np.full(count + 1, labels.shape[0], dtype=int)
    last = np.full(count + 1, -1, dtype=int)
    for day, frame in enumerate(labels):
        present = np.unique(frame)
        first[present] = np.minimum(day, first[present])
        last[present] = day
    long_lived = last - first >= 2
    areas = 3389.5**2 * np.deg2rad(3) * (
        np.sin(np.deg2rad(lat + 1.5)) - np.sin(np.deg2rad(lat - 1.5)))
    weights = np.broadcast_to(areas[:, None], labels.shape[1:]).ravel()
    result = above_background.astype(np.uint8)
    for day, frame in enumerate(labels):
        area = np.bincount(frame.ravel(), weights=weights, minlength=count + 1)
        regional = (area >= 1.6e6) & long_lived
        regional[0] = False
        result[day, regional[frame]] = 2
    return result


def pack_dust(archive, folder, mdad):
    quiet = [read_dust(folder, year, 'cdod610')[:2] for year in range(25, 37) if year not in GLOBAL_WINDOWS]
    background = np.array([np.nanmedian(np.concatenate([values[angles.astype(int) // 10 == band]
                           for angles, values in quiet]), axis=0) for band in range(36)])
    years = []
    checks = {}
    for year in range(25, 37):
        angles, normalized, lat, lon = read_dust(folder, year, 'cdod610')
        _, local, _, _ = read_dust(folder, year, 'cdodtot')
        typical = background[angles.astype(int) // 10]
        classes = storm_mask((normalized >= typical * 1.48) & (normalized - typical >= 0.09), lat)
        if year in GLOBAL_WINDOWS:
            start, end = GLOBAL_WINDOWS[year]
            classes[(start <= angles) & (angles < end)] = 3
        grid_opacity = regrid(local, lat, lon)
        grid_storm = regrid(classes, lat, lon, nearest=True)
        print(f'MY{year}: {len(angles)} sols, {np.count_nonzero(grid_storm)} storm cell-sols', flush=True)
        if year == 30 and mdad:
            checks['mdadMY30'] = compare_mdad(mdad, angles, grid_storm)
        years.append({'year': year, 'angles': archive.pack(angles, scale=.01),
                      'opacity': archive.pack(grid_opacity, scale=.002),
                      'storm': archive.pack(grid_storm, 'u8')})
    return {'grid': GRID, 'scale': .002, 'years': years}, checks


def compare_mdad(path, angles, predicted):
    """Compare inferred 10° cell centres with the observed MARCI storm mask."""
    target_lat, target_lon = grid_coordinates(GRID)
    with Dataset(path) as catalog:
        lat_index = [np.abs(catalog['lat'][:] - lat).argmin() for lat in target_lat]
        lon_index = [np.abs(catalog['lon'][:] - lon).argmin() for lon in target_lon]
        time_list = catalog['timeList'][:]
        # MDAD columns are start/end/mean/median sol and start/end/mean/median Ls.
        catalog_angles = time_list[:, 6]
        intersection = 0
        archive_count = 0
        catalog_count = 0
        for index, Ls in enumerate(catalog_angles):
            # Exclude catalog rows without a mapped observation.
            if not np.isfinite(Ls) or not 0 <= Ls < 360:
                continue
            mapped = catalog['MDAD'][index, lon_index, lat_index].filled(255).T
            coverage = mapped != 255
            observed = coverage & (mapped > 0)
            inferred = predicted[np.abs(angles - Ls).argmin()] > 0
            intersection += np.count_nonzero(observed & inferred)
            archive_count += np.count_nonzero(inferred & coverage)
            catalog_count += np.count_nonzero(observed)
    summary = {'overlap': int(intersection), 'inferred': int(archive_count), 'observed': int(catalog_count)}
    print('MDAD footprint comparison:', summary, flush=True)
    return summary


def read_openmars(path):
    with h5py.File(path, 'r') as source:
        lat, lon, levels = (source[key][:] for key in ('lat', 'lon', 'lev'))
        bottom = int(np.argmax(levels))
        day = np.floor(source['time'][:] + 1e-4).astype(int)
        year = source['MY'][:] == MET_YEAR
        sample = np.arange(0, day.size, ATMOSPHERE_SAMPLE_STRIDE)
        included = sample[year[sample]]
        surface = {key: source[key][year] for key in ('Ls', 'tsurf', 'ps', 'co2ice')}
        atmosphere = {key: source[key][included, bottom] for key in ('temp', 'u', 'v')}
    return lat, lon, day[year], surface, day[included], atmosphere


def daily_values(days, fields, samples_per_sol):
    """Keep complete sols, including sols split across OpenMARS files."""
    result = {}
    for day in np.unique(days):
        rows = days == day
        if np.count_nonzero(rows) == samples_per_sol:
            result[day] = {key: field[rows] for key, field in fields.items()}
    return result


def pack_meteorology(archive, folder):
    paths = sorted(folder.glob('openmars_*.nc'))
    if not paths:
        raise ValueError(f'No OpenMARS files found in {folder}')
    records = [read_openmars(path) for path in paths]
    lat, lon, *_ = records[0]
    if any(not np.array_equal(lat, row[0]) or not np.array_equal(lon, row[1]) for row in records):
        raise ValueError('OpenMARS files use different coordinate grids')

    def aggregate(day_index, field_index, samples):
        days = np.concatenate([row[day_index] for row in records])
        fields = {key: np.concatenate([row[field_index][key] for row in records]) for key in records[0][field_index]}
        return daily_values(days, fields, samples)

    surface = aggregate(2, 3, 12)
    atmosphere = aggregate(4, 5, 12 // ATMOSPHERE_SAMPLE_STRIDE)
    days = sorted(surface.keys() & atmosphere.keys())
    if not 667 <= len(days) <= 669 or np.any(np.diff(days) != 1):
        raise ValueError(f'Expected a continuous OpenMARS year, found {len(days)} complete sols')

    angles = []
    metrics = {key: [] for key in ('airMinC', 'airMaxC', 'airMeanC', 'groundMinC', 'pressurePa',
                                    'windEastMs', 'windNorthMs', 'windSpeedMs', 'windPeakMs', 'surfaceCo2')}
    for day in days:
        surface_day = surface[day]
        wind = atmosphere[day]
        air = wind['temp'] - 273.15
        if not np.isfinite(air).all() or air.min() < -175:
            raise ValueError(f'Invalid OpenMARS temperatures on sol {day}')
        speed = np.hypot(wind['u'], wind['v'])
        angles.append(surface_day['Ls'].mean())
        metrics['airMinC'].append(air.min(axis=0))
        metrics['airMaxC'].append(air.max(axis=0))
        metrics['airMeanC'].append(air.mean(axis=0))
        metrics['groundMinC'].append(surface_day['tsurf'].min(axis=0) - 273.15)
        metrics['pressurePa'].append(surface_day['ps'].mean(axis=0))
        metrics['surfaceCo2'].append(surface_day['co2ice'].mean(axis=0))
        metrics['windEastMs'].append(wind['u'].mean(axis=0))
        metrics['windNorthMs'].append(wind['v'].mean(axis=0))
        metrics['windSpeedMs'].append(speed.mean(axis=0))
        metrics['windPeakMs'].append(speed.max(axis=0))
    if np.any(np.diff(angles) <= 0):
        raise ValueError('OpenMARS solar longitudes must increase throughout the year')

    fields = {}
    for key, values in metrics.items():
        kind, scale = {'pressurePa': ('u16', 1), 'surfaceCo2': ('u16', .25)}.get(key, ('i16', .1))
        values = regrid(np.asarray(values), lat, lon)
        if key == 'surfaceCo2':
            values = np.maximum(values, 0)  # The source can include small negative roundoff.
        fields[key] = {**archive.pack(values, kind, scale), 'scale': scale}
    print(f'OpenMARS MY{MET_YEAR}: {len(days)} daily frames, Ls {angles[0]:.2f}–{angles[-1]:.2f}°', flush=True)
    return {'grid': GRID, 'sampling': 'daily', 'angles': archive.pack(angles, scale=.01), 'fields': fields}


def pack_clouds(archive, path):
    # The PDS table uses west longitude. Its solar longitudes extend across Mars years.
    lon_west, lat, Ls, opacity = np.loadtxt(path, delimiter=',', unpack=True)
    # Screen out isolated failed retrievals (some exceed 600 optical depths).
    ok = np.isfinite(opacity) & (opacity >= 0) & (opacity <= 3)
    longitude = (-lon_west[ok] + 180 + GRID['step'] / 2) % 360
    lat = np.minimum(17, (lat[ok] + 90).astype(int) // 10)
    year_band = ((Ls[ok] % 360) // 30).astype(int)
    rows = (year_band, lat, (longitude // 10).astype(int))
    total = np.zeros((12, 18, 36))
    count = np.zeros_like(total)
    np.add.at(total, rows, opacity[ok])
    np.add.at(count, rows, 1)
    zonal_total = total.sum(axis=-1)
    zonal_count = count.sum(axis=-1)
    zonal = np.divide(zonal_total, zonal_count, out=np.zeros_like(zonal_total), where=zonal_count > 0)
    # Fill unsampled latitude bands from the nearest observed latitude in that season.
    for index, row in enumerate(zonal):
        known = np.flatnonzero(zonal_count[index])
        row[:] = np.interp(np.arange(len(row)), known, row[known])
    cloud = (total + 8 * zonal[:, :, None]) / (count + 8)
    print(f'CRISM: {np.count_nonzero(ok)} retrievals across {np.count_nonzero(count)} seasonal cells', flush=True)
    return {'grid': GRID, 'angles': archive.pack(np.arange(15, 360, 30), scale=.01),
            'fields': {'cloudOpticalDepth': {**archive.pack(cloud, scale=.001), 'scale': .001}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Folder with source downloads listed in docs/weather.md')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/data/mars')
    args = parser.parse_args()
    archive = Archive()
    dust, checks = pack_dust(archive, args.input, args.input / 'MDADMY30.nc')
    met = pack_meteorology(archive, args.input / 'openmars-my30')
    cloud = pack_clouds(archive, args.input / 'Khayat2023_nadir_water_ice_opacity.csv')
    manifest = {
        'version': 1, 'byteLength': len(archive.payload), 'dust': dust, 'met': met, 'cloud': cloud,
        'sources': {
            'dust': {'url': DUST_URL, 'license': 'CC BY-SA 3.0', 'globalLsWindows': GLOBAL_WINDOWS},
            'meteorology': {'url': 'https://doi.org/10.21954/ou.rd.24573205.v3', 'license': 'CC BY 4.0',
                            'marsYear': MET_YEAR, 'atmosphereSamplesPerSol': 12 // ATMOSPHERE_SAMPLE_STRIDE,
                            'surfaceSamplesPerSol': 12},
            'cloud': {'url': 'https://doi.org/10.17189/76ha-be75', 'product': 'Khayat2023_nadir_water_ice_opacity'},
        },
        'validation': checks,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'weather-archive.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (args.output / 'weather-archive.bin.gz').write_bytes(gzip.compress(archive.payload, mtime=0))


if __name__ == '__main__':
    main()
