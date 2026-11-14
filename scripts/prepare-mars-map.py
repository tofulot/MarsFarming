"""Build the game's west-to-east map data from the NASA source products in README."""
from pathlib import Path
import colorsys
import json
import struct
import subprocess
import sys
import tempfile

output = Path(__file__).resolve().parents[1] / "public/data/mars"
width, height = 864, 432
mola_jpeg, hend_table = sys.argv[1:]

# Convert the shaded MOLA product to a new relief palette. Color encodes
# relative elevation bands in the source, so this is visual terrain only.
with tempfile.TemporaryDirectory() as folder:
    bmp = Path(folder) / "mola.bmp"
    subprocess.run(["sips", "-z", str(height), str(width), "-s", "format", "bmp",
                    mola_jpeg, "--out", bmp], check=True, stdout=subprocess.DEVNULL)
    bitmap = bmp.read_bytes()
offset = struct.unpack_from("<I", bitmap, 10)[0]
if struct.unpack_from("<iiHHI", bitmap, 18) != (width, -height, 1, 24, 0):
    raise ValueError("Expected a top-down, uncompressed 24-bit BMP")

recolored = bytearray(bitmap)
for y in range(height):
    for x in range(width):
        # The source starts at 0°E with west on the left. Recenter to ±180°.
        source_x = (x + width // 2) % width
        i = offset + (y * width + source_x) * 3
        blue, green, red = bitmap[i:i + 3]
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        elevation = (0.68 - hue) / 0.68 if hue < 0.83 else 1
        elevation = max(0, min(1, elevation))
        # Light gray volcano summits in the source belong to the highest band.
        elevation = elevation * min(1, saturation * 5) + (1 - min(1, saturation * 5)) * .9
        shade = (value - .65) * 71
        dest = offset + (y * width + x) * 3
        rgb = [round(max(0, min(255, low + elevation * (high - low) + shade)))
               for low, high in ((66, 200), (35, 107), (36, 72))]
        recolored[dest:dest + 3] = bytes(reversed(rgb))

with tempfile.TemporaryDirectory() as folder:
    bmp = Path(folder) / "terrain.bmp"
    bmp.write_bytes(recolored)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "86",
                    str(bmp), "--out", str(output / "terrain.jpg")],
                   check=True, stdout=subprocess.DEVNULL)

flux = [None] * (90 * 45)
for line in Path(hend_table).read_text().splitlines():
    lon, lat, value = map(float, line.split(","))
    col, row = round((lon + 178) / 4), round((88 - lat) / 4)
    if not (0 <= col < 90 and 0 <= row < 45 and 0 <= value <= 1):
        raise ValueError(f"Invalid neutron sample at {lat}, {lon}")
    index = row * 90 + col
    if flux[index] is not None:
        raise ValueError(f"Duplicate neutron sample at {lat}, {lon}")
    flux[index] = round(value * 1000)
if None in flux:
    raise ValueError("Incomplete neutron grid")
(output / "neutron-flux.json").write_text(json.dumps(flux, separators=(",", ":")) + "\n")
