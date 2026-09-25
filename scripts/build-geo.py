#!/usr/bin/env python3
"""
Tạo dữ liệu ranh giới cho scratch map (chạy lại khi cần cập nhật, chỉ dùng thư viện chuẩn):
  python3 scripts/build-geo.py

- public/geo/provinces.json: 63 tỉnh cũ (geoBoundaries VNM ADM1, public domain), mỗi tỉnh có
  n63 (tên trước 7/2025) và n34 (tên tỉnh mới theo Nghị quyết 202/2025/QH15).
- public/geo/countries.json: quốc gia (Natural Earth 1:50m admin 0, public domain), có iso và tên tiếng Việt.
"""
import json
import math
import os
import urllib.request

PROVINCES_URL = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM1/geoBoundaries-VNM-ADM1_simplified.geojson'
COUNTRIES_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'geo')

# Tỉnh mới (34) ← các tỉnh cũ gộp vào; 11 tỉnh giữ nguyên chỉ có chính nó
MERGE_34 = {
    'Hà Nội': ['Hà Nội'],
    'Huế': ['Thừa Thiên Huế'],
    'Lai Châu': ['Lai Châu'],
    'Điện Biên': ['Điện Biên'],
    'Sơn La': ['Sơn La'],
    'Lạng Sơn': ['Lạng Sơn'],
    'Quảng Ninh': ['Quảng Ninh'],
    'Thanh Hóa': ['Thanh Hóa'],
    'Nghệ An': ['Nghệ An'],
    'Hà Tĩnh': ['Hà Tĩnh'],
    'Cao Bằng': ['Cao Bằng'],
    'Tuyên Quang': ['Tuyên Quang', 'Hà Giang'],
    'Lào Cai': ['Lào Cai', 'Yên Bái'],
    'Thái Nguyên': ['Thái Nguyên', 'Bắc Kạn'],
    'Phú Thọ': ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình'],
    'Bắc Ninh': ['Bắc Ninh', 'Bắc Giang'],
    'Hưng Yên': ['Hưng Yên', 'Thái Bình'],
    'Hải Phòng': ['Hải Phòng', 'Hải Dương'],
    'Ninh Bình': ['Ninh Bình', 'Hà Nam', 'Nam Định'],
    'Quảng Trị': ['Quảng Trị', 'Quảng Bình'],
    'Đà Nẵng': ['Đà Nẵng', 'Quảng Nam'],
    'Quảng Ngãi': ['Quảng Ngãi', 'Kon Tum'],
    'Gia Lai': ['Gia Lai', 'Bình Định'],
    'Khánh Hòa': ['Khánh Hòa', 'Ninh Thuận'],
    'Lâm Đồng': ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận'],
    'Đắk Lắk': ['Đắk Lắk', 'Phú Yên'],
    'TP. Hồ Chí Minh': ['TP. Hồ Chí Minh', 'Bình Dương', 'Bà Rịa–Vũng Tàu'],
    'Đồng Nai': ['Đồng Nai', 'Bình Phước'],
    'Tây Ninh': ['Tây Ninh', 'Long An'],
    'Cần Thơ': ['Cần Thơ', 'Sóc Trăng', 'Hậu Giang'],
    'Vĩnh Long': ['Vĩnh Long', 'Bến Tre', 'Trà Vinh'],
    'Đồng Tháp': ['Đồng Tháp', 'Tiền Giang'],
    'Cà Mau': ['Cà Mau', 'Bạc Liêu'],
    'An Giang': ['An Giang', 'Kiên Giang'],
}
TO_34 = {old: new for new, olds in MERGE_34.items() for old in olds}

# Sửa tên trong dữ liệu gốc; Côn Đảo là huyện của Bà Rịa–Vũng Tàu
RENAME = {'Ho Chi Minh': 'TP. Hồ Chí Minh', 'Côn Đảo': 'Bà Rịa–Vũng Tàu'}


def fetch(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def seg_dist(p, a, b):
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    if dx == 0 and dy == 0:
        return math.hypot(p[0] - ax, p[1] - ay)
    t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def simplify(pts, tol):
    """Douglas–Peucker (lặp, không đệ quy)."""
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, idx = 0, -1
        for k in range(i + 1, j):
            d = seg_dist(pts[k], pts[i], pts[j])
            if d > best:
                best, idx = d, k
        if best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def polygons(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


def shrink(polys, tol, digits):
    """Đơn giản hoá, làm tròn toạ độ; bỏ vòng quá nhỏ (điểm gần đó vẫn khớp nhờ ngưỡng 20 km ở client)."""
    out = []
    for poly in polys:
        rings = [[[round(x, digits), round(y, digits)] for x, y in simplify(ring, tol)] for ring in poly]
        if len(rings[0]) < 4:
            # Đảo nhỏ bị đơn giản hoá mất → giữ vòng gốc để nước nhỏ không biến mất
            rings = [[[round(x, digits), round(y, digits)] for x, y in poly[0]]]
            if len({tuple(c) for c in rings[0]}) < 3:
                continue
        out.append([rings[0]] + [r for r in rings[1:] if len(r) >= 4])
    return out


def write(name, features):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{path}: {len(features)} vùng, {os.path.getsize(path) // 1024} KB')


def build_provinces():
    merged = {}
    for f in fetch(PROVINCES_URL)['features']:
        name = f['properties']['shapeName'].strip()
        name = RENAME.get(name, name)
        merged.setdefault(name, []).extend(polygons(f['geometry']))
    missing = set(TO_34) ^ set(merged)
    assert not missing, f'Tên tỉnh không khớp bảng sáp nhập: {missing}'
    assert len(merged) == 63 and len(MERGE_34) == 34
    write('provinces.json', [
        {
            'type': 'Feature',
            'properties': {'n63': name, 'n34': TO_34[name]},
            'geometry': {'type': 'MultiPolygon', 'coordinates': shrink(polys, 0.003, 3)},
        }
        for name, polys in sorted(merged.items())
    ])


def build_countries():
    features = []
    for f in fetch(COUNTRIES_URL)['features']:
        p = f['properties']
        iso = p['ISO_A2_EH']  # ISO_A2 là -99 với Pháp, Na Uy...
        if iso == '-99':
            continue
        polys = shrink(polygons(f['geometry']), 0.08, 2)
        if polys:
            features.append({
                'type': 'Feature',
                'properties': {'iso': iso, 'name': p['NAME_VI'] or p['NAME']},
                'geometry': {'type': 'MultiPolygon', 'coordinates': polys},
            })
    write('countries.json', features)


if __name__ == '__main__':
    build_provinces()
    build_countries()
