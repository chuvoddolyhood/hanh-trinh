import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Bản đồ nền vector miễn phí, không cần API key (ghi nguồn tự động qua MapLibre)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY = { type: 'FeatureCollection', features: [] };

// Màu khớp với token trong styles.css
const C = {
  ink: '#1D2B3A',
  visited: '#0E8A7E',
  wishlist: '#E3A21A',
  route: '#D6336C',
};

const placesToGeoJSON = (places) => ({
  type: 'FeatureCollection',
  features: places.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { id: p.id, kind: p.kind, name: p.name },
  })),
});

const linesToGeoJSON = (lines) => ({
  type: 'FeatureCollection',
  features: lines
    .filter((l) => l.points?.length > 1)
    .map((l) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: l.points.map(([lng, lat]) => [lng, lat]) },
      properties: { id: l.id },
    })),
});

/**
 * Props:
 * - places, tracks, livePoints: dữ liệu hiển thị
 * - selectedId: id địa điểm đang chọn (vẽ vòng nổi bật)
 * - draft: {lat, lng} ghim nháp khi check-in (kéo thả được)
 * - focus: {lng, lat, zoom} hoặc {bounds}; đổi object để kích hoạt di chuyển camera
 * - onMapClick(lngLat), onSelectPlace(id), onDraftMove(lngLat)
 */
export default function MapView({
  places,
  tracks,
  livePoints,
  selectedId,
  draft,
  focus,
  onMapClick,
  onSelectPlace,
  onDraftMove,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const draftMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Giữ handler mới nhất trong ref để listener của map (đăng ký 1 lần) luôn gọi đúng hàm
  const handlers = useRef({});
  handlers.current = { onMapClick, onSelectPlace, onDraftMove };

  // ---------------- Khởi tạo bản đồ (chạy 1 lần) ----------------
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [106.0, 16.0], // Trung tâm Việt Nam
      zoom: 4.8,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // Nguồn dữ liệu
      map.addSource('places', {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 14, // Từ zoom 15 trở lên luôn hiện từng điểm riêng
      });
      map.addSource('tracks', { type: 'geojson', data: EMPTY });
      map.addSource('live', { type: 'geojson', data: EMPTY });

      // Lộ trình đã lưu
      map.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'tracks',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.route,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 16, 5],
          'line-opacity': 0.8,
        },
      });

      // Lộ trình đang ghi: có viền trắng để nổi trên nền bản đồ
      map.addLayer({
        id: 'live-casing',
        type: 'line',
        source: 'live',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 9 },
      });
      map.addLayer({
        id: 'live-line',
        type: 'line',
        source: 'live',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': C.route, 'line-width': 5 },
      });

      // Cụm điểm
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': C.ink,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFFFFF',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'places',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#FFFFFF' },
      });

      // Điểm lẻ: đã đến = chấm đặc; wishlist = vòng rỗng
      map.addLayer({
        id: 'place-points',
        type: 'circle',
        source: 'places',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-color': ['match', ['get', 'kind'], 'wishlist', '#FFFFFF', C.visited],
          'circle-stroke-width': 3,
          'circle-stroke-color': ['match', ['get', 'kind'], 'wishlist', C.wishlist, '#FFFFFF'],
        },
      });

      // Tên địa điểm khi phóng to
      map.addLayer({
        id: 'place-labels',
        type: 'symbol',
        source: 'places',
        filter: ['!', ['has', 'point_count']],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: { 'text-color': C.ink, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 },
      });

      // Vòng nổi bật quanh điểm đang chọn
      map.addLayer({
        id: 'place-selected',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 15,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 3,
          'circle-stroke-color': C.route,
        },
      });

      // Bấm cụm → phóng to vào cụm
      map.on('click', 'clusters', async (e) => {
        const feature = e.features[0];
        const zoom = await map.getSource('places').getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      });

      // Bấm điểm → chọn địa điểm
      map.on('click', 'place-points', (e) => {
        handlers.current.onSelectPlace?.(e.features[0].properties.id);
      });

      // Bấm vùng trống → báo lên App (đặt ghim check-in hoặc bỏ chọn)
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'place-points'] });
        if (hits.length === 0) handlers.current.onMapClick?.(e.lngLat);
      });

      // Con trỏ dạng bàn tay khi rê lên điểm
      for (const layer of ['clusters', 'place-points']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------------- Đồng bộ dữ liệu vào nguồn ----------------
  useEffect(() => {
    if (ready) mapRef.current.getSource('places').setData(placesToGeoJSON(places));
  }, [ready, places]);

  useEffect(() => {
    if (ready) mapRef.current.getSource('tracks').setData(linesToGeoJSON(tracks));
  }, [ready, tracks]);

  useEffect(() => {
    if (ready) mapRef.current.getSource('live').setData(linesToGeoJSON([{ id: 'live', points: livePoints }]));
  }, [ready, livePoints]);

  useEffect(() => {
    if (!ready) return;
    mapRef.current.setFilter('place-selected', [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'id'], selectedId ?? ''],
    ]);
  }, [ready, selectedId]);

  // ---------------- Ghim nháp (kéo thả để chỉnh vị trí) ----------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!draft) {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      return;
    }

    if (!draftMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'draft-pin';
      el.setAttribute('aria-label', 'Vị trí check-in, kéo để chỉnh');
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
        .setLngLat([draft.lng, draft.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        handlers.current.onDraftMove?.({ lng, lat });
      });
      draftMarkerRef.current = marker;
    } else {
      draftMarkerRef.current.setLngLat([draft.lng, draft.lat]);
    }
  }, [draft]);

  // ---------------- Di chuyển camera ----------------
  // MapLibre tự bỏ hiệu ứng bay khi người dùng bật "giảm chuyển động" trong hệ điều hành
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.bounds) {
      map.fitBounds(focus.bounds, { padding: 64, maxZoom: 16, duration: 900 });
    } else {
      map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 15, duration: 900 });
    }
  }, [focus]);

  return <div ref={containerRef} className="map" />;
}
