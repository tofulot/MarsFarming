#!/usr/bin/env python3
"""Pack local copies of the cited Mars data products for the game browser."""

import argparse
import gzip
import json
from pathlib import Path

from netCDF4 import Dataset
from numcodecs import blosc, Zstd
import numpy as np
from scipy import ndimage


DUST_URL = 'https://www-mars.lmd.jussieu.fr/mars/dust_climatology/'
MET_CHUNKS = [135, 145, 154, 163, 172, 179, 186, 193]
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


def unpack_zarr(path, zstd=False):
    data = path.read_bytes()
    return np.frombuffer(Zstd().decode(data) if zstd else blosc.decompress(data), dtype='<f4')


def pack_meteorology(archive, folder):
    lat, lon, levels = [unpack_zarr(folder / key / 'c/0', zstd=True) for key in ('lat', 'lon', 'lev')]
    bottom = int(np.argmax(levels))
    angles = []
    fields = {key: [] for key in ('airMinC', 'airMaxC', 'airMeanC', 'airVariationC', 'groundMinC', 'pressurePa',
                                  'windEastMs', 'windNorthMs', 'windSpeedMs', 'surfaceCo2')}
    for chunk in MET_CHUNKS:
        Ls = unpack_zarr(folder / f'Ls/c/{chunk}')
        year = unpack_zarr(folder / f'MY/c/{chunk}')
        if not (year == 30).all():
            raise ValueError(f'Expected Mars year 30 in OpenMARS chunk {chunk}')
        angles.append(float(Ls.mean()))

        def read(key, vertical=False):
            suffix = '/0/0/0' if vertical else '/0/0'
            values = unpack_zarr(folder / f'{key}/c/{chunk}{suffix}')
            if vertical:
                values = values.reshape(120, len(levels), len(lat), len(lon))[:, bottom]
            return values.reshape(10, 12, len(lat), len(lon))

        air = read('temp', vertical=True) - 273.15
        ground = read('tsurf') - 273.15
        east = read('u', vertical=True)
        north = read('v', vertical=True)
        metrics = {
            'airMinC': air.min(axis=1).mean(axis=0), 'airMaxC': air.max(axis=1).mean(axis=0),
            'airMeanC': air.mean(axis=(0, 1)), 'groundMinC': ground.min(axis=1).mean(axis=0),
            'airVariationC': air.mean(axis=1).std(axis=0),
            'pressurePa': read('ps').mean(axis=(0, 1)), 'surfaceCo2': read('co2ice').mean(axis=(0, 1)),
            'windEastMs': east.mean(axis=(0, 1)), 'windNorthMs': north.mean(axis=(0, 1)),
            'windSpeedMs': np.hypot(east, north).mean(axis=(0, 1)),
        }
        for key, array in metrics.items():
            fields[key].append(regrid(array, lat, lon))
        print(f'OpenMARS: Ls {angles[-1]:.2f}°, lowest sigma level {levels[bottom]:.5f}', flush=True)
    values = {}
    for key, field in fields.items():
        kind, scale = {'pressurePa': ('u16', 1), 'surfaceCo2': ('u16', .1)}.get(key, ('i16', .1))
        # NetCDF has insignificant negative roundoff for some surface ice cells.
        field = np.maximum(0, field) if key == 'surfaceCo2' else field
        values[key] = {**archive.pack(field, kind, scale), 'scale': scale}
    return {'grid': GRID, 'angles': archive.pack(angles, scale=.01), 'fields': values}


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
    met = pack_meteorology(archive, args.input / 'openmars')
    cloud = pack_clouds(archive, args.input / 'Khayat2023_nadir_water_ice_opacity.csv')
    manifest = {
        'version': 1, 'byteLength': len(archive.payload), 'dust': dust, 'met': met, 'cloud': cloud,
        'sources': {
            'dust': {'url': DUST_URL, 'license': 'CC BY-SA 3.0', 'globalLsWindows': GLOBAL_WINDOWS},
            'meteorology': {'url': 'https://doi.org/10.21954/ou.rd.24573205.v3', 'license': 'CC BY 4.0',
                            'marsYear': 30, 'chunks': MET_CHUNKS},
            'cloud': {'url': 'https://doi.org/10.17189/76ha-be75', 'product': 'Khayat2023_nadir_water_ice_opacity'},
        },
        'validation': checks,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'weather-archive.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (args.output / 'weather-archive.bin.gz').write_bytes(gzip.compress(archive.payload, mtime=0))


if __name__ == '__main__':
    main()
