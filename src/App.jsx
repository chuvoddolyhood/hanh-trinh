import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "./lib/supabase";
import * as api from "./lib/api";
import { useTracker } from "./hooks/useTracker";
import MapView from "./components/MapView";
import AuthScreen from "./components/AuthScreen";
import Timeline from "./components/Timeline";
import PlaceDetail from "./components/PlaceDetail";
import CheckinForm from "./components/CheckinForm";
import TrackerPanel from "./components/TrackerPanel";

const TABS = [
  { id: "journal", label: "Nhật ký" },
  { id: "checkin", label: "Check-in" },
  { id: "track", label: "Lộ trình" },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Theo dõi phiên đăng nhập (kể cả khi quay lại từ link email)
  useEffect(() => {
    if (!isConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <SetupNotice />;
  if (!authReady) return <div className="splash">Đang tải…</div>;
  if (!session) return <AuthScreen />;
  return <Workspace userId={session.user.id} />;
}

function Workspace({ userId }) {
  const [tab, setTab] = useState("journal");
  const [places, setPlaces] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [focus, setFocus] = useState(null);
  const [query, setQuery] = useState("");

  // Hook ghi lộ trình đặt ở cấp cao nhất: vẫn ghi khi chuyển tab trong panel
  const tracker = useTracker();

  const reload = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api.listPlaces(), api.listTracks()]);
      setPlaces(p);
      setTracks(t);
      setLoadError(null);
    } catch (e) {
      setLoadError(`Không tải được dữ liệu: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const selected = useMemo(
    () => places.find((p) => p.id === selectedId) ?? null,
    [places, selectedId],
  );

  // Chạm vùng trống: tab Check-in → đặt ghim; tab khác → bỏ chọn
  const handleMapClick = useCallback(
    ({ lng, lat }) => {
      if (tab === "checkin") setDraft({ lng, lat });
      else setSelectedId(null);
    },
    [tab],
  );

  const handleSelectPlace = useCallback((id) => {
    setSelectedId(id);
    setTab("journal");
  }, []);

  function switchTab(id) {
    setTab(id);
    if (id !== "checkin") setDraft(null);
  }

  return (
    <div className="app">
      <aside className="panel">
        <header className="panel-head">
          <h1 className="brand">Hành trình</h1>
          <button className="btn-link" onClick={() => supabase.auth.signOut()}>
            Đăng xuất
          </button>
        </header>

        <nav className="tabs" role="tablist" aria-label="Chức năng">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
              {/* Chấm đỏ báo đang ghi lộ trình khi người dùng ở tab khác */}
              {t.id === "track" && tracker.recording && (
                <span className="rec-indicator" aria-label="đang ghi" />
              )}
            </button>
          ))}
        </nav>

        <div className="panel-body">
          {loadError && <p className="error">{loadError}</p>}

          {tab === "journal" &&
            (selected ? (
              <PlaceDetail
                place={selected}
                onBack={() => setSelectedId(null)}
                onDeleted={() => {
                  setSelectedId(null);
                  reload();
                }}
                onFocus={setFocus}
                onTagClick={(t) => {
                  setQuery(`#${t}`);
                  setSelectedId(null);
                }}
              />
            ) : (
              <Timeline
                places={places}
                tracks={tracks}
                query={query}
                onQueryChange={setQuery}
                onSelect={(id) => {
                  const p = places.find((x) => x.id === id);
                  setSelectedId(id);
                  if (p) setFocus({ lng: p.lng, lat: p.lat, zoom: 15 });
                }}
              />
            ))}

          {tab === "checkin" && (
            <CheckinForm
              userId={userId}
              draft={draft}
              onDraftChange={setDraft}
              onFocus={setFocus}
              onSaved={async (place) => {
                await reload();
                setDraft(null);
                setSelectedId(place.id);
                setTab("journal");
              }}
            />
          )}

          {tab === "track" && (
            <TrackerPanel
              tracker={tracker}
              tracks={tracks}
              onChanged={reload}
              onFocus={setFocus}
            />
          )}
        </div>
      </aside>

      <main className="map-wrap">
        <MapView
          places={places}
          tracks={tracks}
          livePoints={tracker.points}
          selectedId={selectedId}
          draft={tab === "checkin" ? draft : null}
          focus={focus}
          onMapClick={handleMapClick}
          onSelectPlace={handleSelectPlace}
          onDraftMove={setDraft}
        />
        {tab === "checkin" && !draft && (
          <div className="map-hint">Chạm lên bản đồ để ghim vị trí</div>
        )}
      </main>
    </div>
  );
}

// Hiển thị khi chưa tạo file .env
function SetupNotice() {
  return (
    <div className="auth">
      <div className="auth-card stack">
        <h1 className="brand">Hành trình</h1>
        <p>
          Chưa cấu hình Supabase. Sao chép <code>.env.example</code> thành{" "}
          <code>.env</code>, điền URL và anon key, rồi chạy lại{" "}
          <code>npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
