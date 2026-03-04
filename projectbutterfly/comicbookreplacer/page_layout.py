from dataclasses import dataclass


@dataclass
class TwoPagePair:
    is_spread: bool
    cover_alone: bool
    right_index: int
    left_index_or_none: int | None
    unpaired_single: bool


def is_stitched_spread(
    index: int,
    known_spread_indices: set[int] | None = None,
    known_normal_indices: set[int] | None = None,
    cached_dims: dict[int, tuple[int, int]] | None = None,
    spread_threshold: float = 1.35,
) -> bool:
    idx = int(index)
    if known_spread_indices and idx in known_spread_indices:
        return True
    if known_normal_indices and idx in known_normal_indices:
        return False
    if cached_dims and idx in cached_dims:
        w, h = cached_dims[idx]
        if h and h > 0:
            return (float(w) / float(h)) > float(spread_threshold)
    return False


def two_page_extra_slots_before(idx: int, spread_set: set[int] | None = None) -> int:
    if idx <= 1:
        return 0
    spreads = spread_set or set()
    extra = 0
    for i in range(1, int(idx)):
        if i in spreads:
            extra += 1
    return extra


def two_page_effective_index(idx: int, spread_set: set[int] | None = None) -> int:
    return int(idx) + two_page_extra_slots_before(int(idx), spread_set)


def snap_two_page_index(
    i: int,
    page_count: int,
    spread_set: set[int] | None = None,
    nudge: int = 0,
) -> int:
    idx = max(0, min(int(page_count) - 1, int(i)))
    spreads = spread_set or set()
    if idx <= 0:
        return 0
    if idx in spreads:
        return idx

    effective = two_page_effective_index(idx, spreads)
    parity = (effective + int(nudge)) % 2
    if parity == 1:
        return idx

    prev_idx = idx - 1
    if prev_idx <= 0:
        return idx
    if prev_idx in spreads:
        return idx
    return prev_idx


def get_two_page_pair(
    i: int,
    page_count: int,
    spread_set: set[int] | None = None,
    nudge: int = 0,
) -> TwoPagePair:
    if page_count <= 0:
        return TwoPagePair(
            is_spread=False,
            cover_alone=False,
            right_index=0,
            left_index_or_none=None,
            unpaired_single=True,
        )

    idx = max(0, min(int(page_count) - 1, int(i)))
    spreads = spread_set or set()

    if idx == 0:
        return TwoPagePair(
            is_spread=False,
            cover_alone=True,
            right_index=0,
            left_index_or_none=None,
            unpaired_single=True,
        )

    if idx in spreads:
        return TwoPagePair(
            is_spread=True,
            cover_alone=False,
            right_index=idx,
            left_index_or_none=None,
            unpaired_single=True,
        )

    right = snap_two_page_index(idx, page_count, spreads, nudge=nudge)
    if right <= 0:
        right = 1

    if right in spreads:
        return TwoPagePair(
            is_spread=True,
            cover_alone=False,
            right_index=right,
            left_index_or_none=None,
            unpaired_single=True,
        )

    left = right + 1
    if left >= page_count or left in spreads:
        return TwoPagePair(
            is_spread=False,
            cover_alone=False,
            right_index=right,
            left_index_or_none=None,
            unpaired_single=True,
        )

    return TwoPagePair(
        is_spread=False,
        cover_alone=False,
        right_index=right,
        left_index_or_none=left,
        unpaired_single=False,
    )


def _scaled_height_fit_width(src_w: int, src_h: int, target_w: float) -> float:
    if src_w <= 0 or src_h <= 0 or target_w <= 0:
        return 1.0
    scale = min(1.0, float(target_w) / float(src_w))
    return max(1.0, float(src_h) * scale)


def _compute_row_height(
    row_type: str,
    indices: list[int],
    viewport_width: int,
    dims: dict[int, tuple[int, int]] | None,
    gutter: int,
) -> int:
    default_h = max(240, int(viewport_width * 1.45))
    if not dims:
        return default_h

    if row_type in ("cover", "spread", "single"):
        idx = indices[0]
        size = dims.get(idx)
        if not size:
            return default_h
        w, h = size
        return int(_scaled_height_fit_width(w, h, viewport_width))

    if row_type == "pair":
        r_idx, l_idx = indices[0], indices[1]
        r_size = dims.get(r_idx)
        l_size = dims.get(l_idx)
        if not r_size or not l_size:
            return default_h
        right_w, right_h = r_size
        left_w, left_h = l_size
        slot_w = max(1.0, float(viewport_width - gutter) / 2.0)
        right_scale = min(1.0, slot_w / float(max(1, right_w)))
        left_scale = min(1.0, slot_w / float(max(1, left_w)))
        scale = min(right_scale, left_scale)
        return int(max(1.0, max(float(right_h) * scale, float(left_h) * scale)))

    return default_h


def build_two_page_scroll_rows(
    page_count: int,
    spread_set: set[int] | None = None,
    nudge: int = 0,
    viewport_width: int = 1200,
    row_gap: int = 16,
    dims: dict[int, tuple[int, int]] | None = None,
    gutter: int = 26,
):
    spreads = spread_set or set()
    y = 0
    i = 0

    while i < int(page_count):
        if i == 0:
            row_type = "cover"
            indices = [0]
        elif i in spreads:
            row_type = "spread"
            indices = [i]
        else:
            pair = get_two_page_pair(i, page_count, spreads, nudge=nudge)
            if pair.is_spread:
                row_type = "spread"
                indices = [pair.right_index]
            elif pair.unpaired_single:
                row_type = "single"
                indices = [pair.right_index]
            else:
                row_type = "pair"
                indices = [pair.right_index, pair.left_index_or_none]

        row_height = _compute_row_height(row_type, indices, viewport_width, dims, gutter)
        row = {
            "type": row_type,
            "indices": indices,
            "row_height": int(row_height),
            "y_start": int(y),
            "y_end": int(y + row_height),
        }
        yield row

        y += int(row_height + row_gap)
        if row_type == "pair":
            i = indices[1] + 1
        else:
            i = indices[0] + 1
