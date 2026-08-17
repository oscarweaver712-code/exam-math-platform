"""A PNG reader, because the задание 18 answer is only in the picture.

«На клетчатой бумаге с размером клетки 1×1 изображён треугольник. Найдите его
площадь» — the statement carries no numbers at all. Everything needed is drawn:
the grid sets the unit, and the figure sits on it. So the picture has to be
read, and reading it starts with the pixels.

Only the standard library, like the rest of the collector: `zlib` for the image
data and `struct` for the headers. That covers what ФИПИ actually ships — 8-bit
PNG in greyscale, RGB, palette or RGBA — and refuses anything else out loud
rather than returning a wrong picture.

The result is one plane of luma, 0 for black and 255 for white, with any
transparent pixel counted as white: the bank draws on a transparent background,
and a diagram read as «everything is black» would find a figure in the void.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

#: Channels per pixel for each PNG colour type.
CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


@dataclass(frozen=True)
class Image:
    """A greyscale view of a PNG: `luma[y][x]`, 0 black … 255 white."""

    width: int
    height: int
    luma: list[list[int]]

    def dark(self, threshold: int = 128) -> set[tuple[int, int]]:
        """Coordinates of every pixel darker than the threshold."""
        return {
            (x, y)
            for y, row in enumerate(self.luma)
            for x, value in enumerate(row)
            if value < threshold
        }


def _chunks(data: bytes):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("не PNG")
    offset = 8
    while offset < len(data):
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        kind = data[offset + 4 : offset + 8]
        body = data[offset + 8 : offset + 8 + length]
        yield kind, body
        offset += 12 + length


def _undo_filter(raw: bytes, width: int, height: int, bytes_per_pixel: int) -> list[bytearray]:
    """Reverse the per-scanline filter PNG applies before compressing."""
    stride = width * bytes_per_pixel
    rows: list[bytearray] = []
    previous = bytearray(stride)
    position = 0
    for _ in range(height):
        method = raw[position]
        position += 1
        line = bytearray(raw[position : position + stride])
        position += stride
        for index in range(stride):
            left = line[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            up = previous[index]
            up_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            if method == 0:
                value = line[index]
            elif method == 1:
                value = line[index] + left
            elif method == 2:
                value = line[index] + up
            elif method == 3:
                value = line[index] + (left + up) // 2
            elif method == 4:
                # Paeth: pick whichever neighbour the gradient points at.
                estimate = left + up - up_left
                distances = (abs(estimate - left), abs(estimate - up), abs(estimate - up_left))
                nearest = (left, up, up_left)[distances.index(min(distances))]
                value = line[index] + nearest
            else:
                raise ValueError(f"неизвестный фильтр строки: {method}")
            line[index] = value & 0xFF
        rows.append(line)
        previous = line
    return rows


def read_png(path: str | Path) -> Image:
    """Decode a PNG into one greyscale plane."""
    data = Path(path).read_bytes()

    header = palette = transparency = None
    compressed = bytearray()
    for kind, body in _chunks(data):
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"PLTE":
            palette = body
        elif kind == b"tRNS":
            transparency = body
        elif kind == b"IDAT":
            compressed += body
        elif kind == b"IEND":
            break

    if header is None:
        raise ValueError("в файле нет IHDR")
    width, height, depth, colour, compression, filter_method, interlace = header
    if depth != 8:
        raise ValueError(f"поддерживается только 8 бит на канал, здесь {depth}")
    if interlace:
        raise ValueError("чересстрочный PNG не поддерживается")
    if colour not in CHANNELS:
        raise ValueError(f"неизвестный тип цвета {colour}")

    channels = CHANNELS[colour]
    rows = _undo_filter(zlib.decompress(bytes(compressed)), width, height, channels)

    luma: list[list[int]] = []
    for row in rows:
        line: list[int] = []
        for x in range(width):
            pixel = row[x * channels : (x + 1) * channels]
            if colour == 3:
                index = pixel[0]
                if palette is None:
                    raise ValueError("палитровый PNG без PLTE")
                red, green, blue = palette[index * 3 : index * 3 + 3]
                alpha = transparency[index] if transparency and index < len(transparency) else 255
            elif colour == 0:
                red = green = blue = pixel[0]
                alpha = 255
            elif colour == 4:
                red = green = blue = pixel[0]
                alpha = pixel[1]
            elif colour == 2:
                red, green, blue = pixel
                alpha = 255
            else:
                red, green, blue, alpha = pixel
            value = (red * 299 + green * 587 + blue * 114) // 1000
            # Transparent means paper, not ink: the bank draws on nothing.
            line.append(value if alpha >= 128 else 255)
        luma.append(line)

    return Image(width=width, height=height, luma=luma)


def _lzw(data: bytes, minimum_code_size: int) -> list[int]:
    """Unpack the GIF variant of LZW into palette indices."""
    clear_code = 1 << minimum_code_size
    end_code = clear_code + 1

    table: list[list[int]] = []
    code_size = minimum_code_size + 1
    next_code = end_code + 1

    def reset() -> None:
        nonlocal table, code_size, next_code
        table = [[index] for index in range(clear_code)] + [[], []]
        code_size = minimum_code_size + 1
        next_code = end_code + 1

    reset()
    output: list[int] = []
    previous: list[int] | None = None
    accumulator = bits = 0

    for byte in data:
        # GIF packs codes little-endian across byte boundaries.
        accumulator |= byte << bits
        bits += 8
        while bits >= code_size:
            code = accumulator & ((1 << code_size) - 1)
            accumulator >>= code_size
            bits -= code_size

            if code == clear_code:
                reset()
                previous = None
                continue
            if code == end_code:
                return output

            if code < len(table) and table[code]:
                entry = table[code]
            elif previous is not None:
                entry = previous + previous[:1]
            else:
                return output

            output.extend(entry)
            if previous is not None:
                if next_code < 4096:
                    table.append(previous + entry[:1])
                    next_code += 1
                if next_code >= (1 << code_size) and code_size < 12:
                    code_size += 1
            previous = entry
    return output


def read_gif(path: str | Path) -> Image:
    """Decode the first frame of a GIF into one greyscale plane.

    Half the squared-paper drawings ship as GIF rather than PNG, so this is not
    an optional format: without it задание 18 loses 58 of its 154 pictures.
    """
    data = Path(path).read_bytes()
    if data[:6] not in (b"GIF87a", b"GIF89a"):
        raise ValueError("не GIF")

    width, height, packed, _background, _aspect = struct.unpack("<HHBBB", data[6:13])
    offset = 13
    palette: bytes | None = None
    if packed & 0x80:
        size = 3 * (1 << ((packed & 0x07) + 1))
        palette = data[offset : offset + size]
        offset += size

    transparent: int | None = None
    while offset < len(data):
        marker = data[offset]
        if marker == 0x21:  # extension
            label = data[offset + 1]
            offset += 2
            if label == 0xF9 and data[offset] >= 4:
                flags = data[offset + 1]
                if flags & 0x01:
                    transparent = data[offset + 4]
            while data[offset]:
                offset += data[offset] + 1
            offset += 1
            continue
        if marker == 0x2C:  # image descriptor
            left, top, frame_width, frame_height, frame_packed = struct.unpack(
                "<HHHHB", data[offset + 1 : offset + 10]
            )
            offset += 10
            if frame_packed & 0x80:
                size = 3 * (1 << ((frame_packed & 0x07) + 1))
                palette = data[offset : offset + size]
                offset += size
            interlaced = bool(frame_packed & 0x40)
            minimum_code_size = data[offset]
            offset += 1
            payload = bytearray()
            while data[offset]:
                length = data[offset]
                payload += data[offset + 1 : offset + 1 + length]
                offset += length + 1
            offset += 1

            if palette is None:
                raise ValueError("GIF без палитры")
            indices = _lzw(bytes(payload), minimum_code_size)

            luma = [[255] * width for _ in range(height)]
            order = list(range(frame_height))
            if interlaced:
                order = (
                    list(range(0, frame_height, 8))
                    + list(range(4, frame_height, 8))
                    + list(range(2, frame_height, 4))
                    + list(range(1, frame_height, 2))
                )
            for row_index, row in enumerate(order):
                start = row_index * frame_width
                line = indices[start : start + frame_width]
                for column, index in enumerate(line):
                    x, y = left + column, top + row
                    if not (0 <= x < width and 0 <= y < height):
                        continue
                    if index == transparent:
                        continue
                    red, green, blue = palette[index * 3 : index * 3 + 3]
                    luma[y][x] = (red * 299 + green * 587 + blue * 114) // 1000
            return Image(width=width, height=height, luma=luma)
        break

    raise ValueError("в GIF нет кадра")


def read_image(path: str | Path) -> Image:
    """Read whichever of the two formats ФИПИ used for this drawing."""
    head = Path(path).read_bytes()[:6]
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return read_gif(path)
    return read_png(path)


def to_ascii(image: Image, threshold: int = 128, step: int = 1) -> str:
    """A picture of the picture, for looking at what a rule just decided."""
    return "\n".join(
        "".join("#" if image.luma[y][x] < threshold else "." for x in range(0, image.width, step))
        for y in range(0, image.height, step)
    )
