import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import Icon from "./icons";
import { PROVINCES_URL } from "../lib/regions";

// Bản đồ nền vector miễn phí, không cần API key (ghi nguồn tự động qua MapLibre)
const STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const EMPTY = { type: "FeatureCollection", features: [] };

// Màu khớp với token trong styles.css (docs/DESIGN.md)
const COLORS = {
  light: {
    ink: "#1E1B18",
    surface: "#FFFDF9",
    accent: "#F26B1D",
    wishlist: "#7B61FF",
    route: "#F0508A",
  },
  dark: {
    ink: "#F4F1EC",
    surface: "#33363B",
    accent: "#FF8A3D",
    wishlist: "#9B8CFF",
    route: "#FF4D8D",
  },
};

// Chỉnh màu style Liberty cho khớp bảng "Bản đồ nền" trong DESIGN.md
const road = (kind) => ["road", "bridge", "tunnel"].map((p) => `${p}_${kind}`);
const LIGHT_PAINT = [
  [["background"], "background-color", "#F4EADF"],
  [["building"], "fill-color", "#EEE0CF"],
  [["building"], "fill-outline-color", "#E3D2BD"],
  [["water"], "fill-color", "#C9DDDA"],
  [
    ["waterway_river", "waterway_other", "waterway_tunnel"],
    "line-color",
    "#BCD4D1",
  ],
  [["park", "landcover_wood", "landcover_grass"], "fill-color", "#DCE3C3"],
  [
    [
      ...road("minor"),
      ...road("link"),
      ...road("service_track"),
      ...road("secondary_tertiary"),
      "bridge_street",
    ],
    "line-color",
    "#FFFFFF",
  ],
  [
    [
      ...road("minor_casing"),
      ...road("link_casing"),
      ...road("service_track_casing"),
      ...road("secondary_tertiary_casing"),
      "bridge_street_casing",
      "tunnel_street_casing",
    ],
    "line-color",
    "#E8DCCB",
  ],
  [
    [...road("trunk_primary"), ...road("motorway"), ...road("motorway_link")],
    "line-color",
    "#F8DDB0",
  ],
  [
    [
      ...road("trunk_primary_casing"),
      ...road("motorway_casing"),
      ...road("motorway_link_casing"),
    ],
    "line-color",
    "#E6D3BC",
  ],
  [
    [
      "label_other",
      "label_village",
      "label_town",
      "poi_r1",
      "poi_r7",
      "poi_r20",
      "poi_transit",
      "highway-name-path",
      "highway-name-minor",
      "highway-name-major",
    ],
    "text-color",
    "#8A7F73",
  ],
];

function tintLiberty(map) {
  for (const [ids, prop, color] of LIGHT_PAINT) {
    for (const id of ids)
      if (map.getLayer(id)) map.setPaintProperty(id, prop, color);
  }
}

const placesToGeoJSON = (places) => ({
  type: "FeatureCollection",
  features: places.map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: { id: p.id, kind: p.kind, name: p.name },
  })),
});

const linesToGeoJSON = (lines) => ({
  type: "FeatureCollection",
  features: lines
    .filter((l) => l.points?.length > 1)
    .map((l) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: l.points.map(([lng, lat]) => [lng, lat]),
      },
      properties: { id: l.id },
    })),
});

/**
 * Props:
 * - places, tracks, livePoints: dữ liệu hiển thị
 * - selectedId: id địa điểm đang chọn (vẽ vòng nổi bật)
 * - draft: {lat, lng} ghim nháp khi check-in (kéo thả được)
 * - focus: {lng, lat, zoom} hoặc {bounds}, kèm padding tuỳ chọn; đổi object để kích hoạt di chuyển camera
 * - scratch: {key: 'n34'|'n63', names: [...]} để tô các tỉnh đã đến, hoặc null để ẩn
 * - heat: [[lng, lat, weight], ...] để vẽ heatmap khu vực đi qua nhiều, hoặc null để ẩn
 * - dark: dùng style tối (đổi giá trị thì cha phải remount bằng key)
 * - showLocate: hiện nút "Vị trí của tôi"; onLocate({lat, lng}) khi có vị trí
 * - onMapClick(lngLat), onSelectPlace(id), onDraftMove(lngLat)
 */
const MapView = forwardRef(function MapView(
  {
    places,
    tracks,
    livePoints,
    selectedId,
    draft,
    focus,
    scratch = null,
    heat = null,
    onMapClick,
    onSelectPlace,
    onDraftMove,
    dark = false,
    showLocate = false,
    onLocate,
  },
  ref,
) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const draftMarkerRef = useRef(null);
  const geolocateRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Giữ handler mới nhất trong ref để listener của map (đăng ký 1 lần) luôn gọi đúng hàm
  const handlers = useRef({});
  handlers.current = { onMapClick, onSelectPlace, onDraftMove, onLocate };

  // ---------------- Khởi tạo bản đồ (chạy 1 lần) ----------------
  useEffect(() => {
    const C = COLORS[dark ? "dark" : "light"];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL[dark ? "dark" : "light"],
      center: [106.0, 16.0], // Trung tâm Việt Nam
      zoom: 4.8,
      attributionControl: false,
    });
    mapRef.current = map;

    // Ghi nguồn bắt buộc của OpenFreeMap/OSM; đặt dưới thanh tìm kiếm để không bị thẻ và thanh tab che
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "top-left",
    );

    // Nút định vị gốc bị ẩn bằng CSS; nút của app gọi trigger()
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    });
    geolocate.on("geolocate", (pos) => {
      handlers.current.onLocate?.({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    });
    map.addControl(geolocate, "top-right");
    geolocateRef.current = geolocate;

    map.on("load", () => {
      if (!dark) tintLiberty(map);

      // Nguồn dữ liệu
      map.addSource("places", {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 14, // Từ zoom 15 trở lên luôn hiện từng điểm riêng
      });
      map.addSource("tracks", { type: "geojson", data: EMPTY });
      map.addSource("provinces", { type: "geojson", data: PROVINCES_URL });

      // Scratch map: tô các tỉnh đã đến (vẽ dưới lộ trình và điểm). Không vẽ viền để
      // các tỉnh cũ gộp thành một tỉnh mới liền một mảng khi xem theo 34 tỉnh
      map.addLayer({
        id: "provinces-fill",
        type: "fill",
        source: "provinces",
        layout: { visibility: "none" },
        filter: ["boolean", false],
        paint: { "fill-color": C.accent, "fill-opacity": 0.28 },
      });
      map.addSource("live", { type: "geojson", data: EMPTY });

      // Heatmap khu vực đi qua nhiều (dưới lộ trình và điểm); màu theo thanh tiến độ trong DESIGN.md
      map.addSource("heat", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "heat",
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": ["get", "w"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 15, 2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 10, 14, 16, 28],
          "heatmap-opacity": 0.8,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(255, 211, 122, 0)",
            0.2,
            "#FFD37A",
            0.5,
            "#FF8A3D",
            0.8,
            "#FF4D8D",
            1,
            "#C04DD8",
          ],
        },
      });

      // Lộ trình đã lưu
      map.addLayer({
        id: "tracks-line",
        type: "line",
        source: "tracks",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": C.route,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2, 16, 5],
          "line-opacity": 0.85,
        },
      });

      // Lộ trình đang ghi: có viền trắng để nổi trên nền bản đồ
      map.addLayer({
        id: "live-casing",
        type: "line",
        source: "live",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FFFFFF", "line-width": 10 },
      });
      map.addLayer({
        id: "live-line",
        type: "line",
        source: "live",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": C.route, "line-width": 5 },
      });

      // Cụm điểm
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": C.ink,
          "circle-radius": ["step", ["get", "point_count"], 19, 10, 22, 50, 27],
          "circle-stroke-width": 3,
          "circle-stroke-color": C.surface,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: { "text-color": C.surface },
      });

      // Quầng quanh điểm đang chọn (vẽ dưới điểm)
      map.addLayer({
        id: "place-selected",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": 22,
          "circle-color": [
            "match",
            ["get", "kind"],
            "wishlist",
            C.wishlist,
            C.accent,
          ],
          "circle-opacity": 0.18,
        },
      });

      // Điểm lẻ: đã đến = chấm đặc; wishlist = vòng rỗng
      map.addLayer({
        id: "place-points",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 9,
          "circle-color": [
            "match",
            ["get", "kind"],
            "wishlist",
            C.surface,
            C.accent,
          ],
          "circle-stroke-width": 3,
          "circle-stroke-color": [
            "match",
            ["get", "kind"],
            "wishlist",
            C.wishlist,
            C.surface,
          ],
        },
      });

      // Tên địa điểm khi phóng to
      map.addLayer({
        id: "place-labels",
        type: "symbol",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-max-width": 10,
        },
        paint: {
          "text-color": C.ink,
          "text-halo-color": C.surface,
          "text-halo-width": 1.5,
        },
      });

      // Bấm cụm → phóng to vào cụm
      map.on("click", "clusters", async (e) => {
        const feature = e.features[0];
        const zoom = await map
          .getSource("places")
          .getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      });

      // Bấm điểm → chọn địa điểm
      map.on("click", "place-points", (e) => {
        handlers.current.onSelectPlace?.(e.features[0].properties.id);
      });

      // Bấm vùng trống → báo lên App (đặt ghim check-in hoặc bỏ chọn)
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["clusters", "place-points"],
        });
        if (hits.length === 0) handlers.current.onMapClick?.(e.lngLat);
      });

      // Con trỏ dạng bàn tay khi rê lên điểm
      for (const layer of ["clusters", "place-points"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Chạy 1 lần; đổi dark thì cha remount component bằng key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- Đồng bộ dữ liệu vào nguồn ----------------
  useEffect(() => {
    if (ready)
      mapRef.current.getSource("places").setData(placesToGeoJSON(places));
  }, [ready, places]);

  useEffect(() => {
    if (ready)
      mapRef.current.getSource("tracks").setData(linesToGeoJSON(tracks));
  }, [ready, tracks]);

  useEffect(() => {
    if (ready)
      mapRef.current
        .getSource("live")
        .setData(linesToGeoJSON([{ id: "live", points: livePoints }]));
  }, [ready, livePoints]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.setLayoutProperty(
      "provinces-fill",
      "visibility",
      scratch ? "visible" : "none",
    );
    if (scratch)
      map.setFilter("provinces-fill", [
        "in",
        ["get", scratch.key],
        ["literal", scratch.names],
      ]);
  }, [ready, scratch]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.setLayoutProperty("heat", "visibility", heat ? "visible" : "none");
    map.getSource("heat").setData({
      type: "FeatureCollection",
      features: (heat ?? []).map(([lng, lat, w]) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { w },
      })),
    });
  }, [ready, heat]);

  useEffect(() => {
    if (!ready) return;
    mapRef.current.setFilter("place-selected", [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "id"], selectedId ?? ""],
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
      const el = document.createElement("div");
      el.className = "draft-pin";
      el.setAttribute("aria-label", "Vị trí check-in, kéo để chỉnh");
      const marker = new maplibregl.Marker({
        element: el,
        draggable: true,
        anchor: "bottom",
      })
        .setLngLat([draft.lng, draft.lat])
        .addTo(map);
      marker.on("dragend", () => {
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
    // Padding lưu trong camera nên luôn đặt lại (vd. chừa chỗ cho tấm Check-in)
    map.setPadding({ top: 0, left: 0, right: 0, bottom: 0, ...focus.padding });
    if (focus.bounds) {
      map.fitBounds(focus.bounds, { padding: 64, maxZoom: 16, duration: 900 });
    } else {
      map.flyTo({
        center: [focus.lng, focus.lat],
        zoom: focus.zoom ?? 15,
        duration: 900,
      });
    }
  }, [focus]);

  // Cho App chụp bản đồ làm poster: đợi hết di chuyển và tải xong tile, rồi chép canvas
  // ngay trong sự kiện render (không cần preserveDrawingBuffer). → Promise<HTMLCanvasElement>
  useImperativeHandle(ref, () => ({
    capture: () =>
      new Promise((resolve) => {
        const map = mapRef.current;
        const grab = () => {
          const src = map.getCanvas();
          const copy = document.createElement("canvas");
          copy.width = src.width;
          copy.height = src.height;
          copy.getContext("2d").drawImage(src, 0, 0);
          resolve(copy);
        };
        const check = () => {
          if (map.isMoving() || !map.areTilesLoaded()) {
            map.once("idle", check);
            return;
          }
          map.once("render", grab);
          map.triggerRepaint();
        };
        // Chờ một nhịp để hiệu ứng focus (fitBounds) kịp bắt đầu
        setTimeout(check, 100);
      }),
  }));

  return (
    <>
      <div ref={containerRef} className="map" />
      {showLocate && (
        <button
          type="button"
          className="map-btn map-locate"
          aria-label="Vị trí của tôi"
          onClick={() => geolocateRef.current?.trigger()}
        >
          <Icon name="locate" size={22} />
        </button>
      )}
    </>
  );
});

export default MapView;
