import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isConfigured } from './lib/supabase';
import * as api from './lib/api';
import { matchPlace } from './lib/text';
import { bounds } from './lib/geo';
import { fetchCurrentWeather } from './lib/weather';
import { useTracker } from './hooks/useTracker';
import MapView from './components/MapView';
import MapOverlay from './components/MapOverlay';
import AuthScreen from './components/AuthScreen';
import Timeline from './components/Timeline';
import PlaceDetail from './components/PlaceDetail';
import CheckinForm from './components/CheckinForm';
import RecordScreen from './components/RecordScreen';
import MeScreen from './components/MeScreen';
import Icon from './components/icons';

// State lưu trên máy (localStorage); lỗi đọc/ghi thì dùng giá trị mặc định
function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Bị chặn: chỉ mất phần ghi nhớ, app vẫn chạy
    }
  }, [key, value]);
  return [value, setValue];
}

// Chế độ tối: theo hệ điều hành khi chọn "Tự động", hoặc theo lựa chọn thủ công
function useTheme() {
  const [theme, setTheme] = useStored('hanh-trinh:theme', 'auto');
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [systemDark, setSystemDark] = useState(query.matches);
  useEffect(() => {
    const onChange = (e) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);
  const dark = theme === 'dark' || (theme === 'auto' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return { theme, setTheme, dark };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const themeState = useTheme();

  // Theo dõi phiên đăng nhập (kể cả khi quay lại từ link email)
  useEffect(() => {
    if (!isConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <SetupNotice />;
  if (!authReady) return <div className="splash">Đang tải…</div>;
  if (!session) return <AuthScreen />;
  return <Workspace user={session.user} {...themeState} />;
}

const TABS = [
  { id: 'map', label: 'Bản đồ', icon: 'map' },
  { id: 'journal', label: 'Nhật ký', icon: 'book' },
  { id: 'record' },
  { id: 'trips', label: 'Chuyến đi', icon: 'flag' },
  { id: 'me', label: 'Tôi', icon: 'user' },
];

function Workspace({ user, theme, setTheme, dark }) {
  const [tab, setTab] = useState('map');
  const [recordOpen, setRecordOpen] = useState(false);
  const [places, setPlaces] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // Thẻ xem nhanh trên bản đồ
  const [detailId, setDetailId] = useState(null); // Màn hình chi tiết
  const [checkin, setCheckin] = useState(false);
  const [draft, setDraft] = useState(null);
  const [focus, setFocus] = useState(null);
  const [mapQuery, setMapQuery] = useState('');
  const [journalQuery, setJournalQuery] = useState('');
  const [weather, setWeather] = useState(null);
  const [goalKm, setGoalKm] = useStored('hanh-trinh:goal-km', 5);
  const weatherAsked = useRef(false);

  // Hook ghi lộ trình đặt ở cấp cao nhất: vẫn ghi khi thu nhỏ màn hình Ghi
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

  useEffect(() => { reload(); }, [reload]);

  const selected = places.find((p) => p.id === selectedId) ?? null;
  const detail = places.find((p) => p.id === detailId) ?? null;
  const mapPlaces = useMemo(() => places.filter((p) => matchPlace(p, mapQuery)), [places, mapQuery]);
  const stats = useMemo(
    () => ({
      visited: places.filter((p) => p.kind === 'visited').length,
      distance: tracks.reduce((sum, t) => sum + (t.distance_m || 0), 0),
    }),
    [places, tracks],
  );

  // Chạm vùng trống: đang check-in → đặt ghim; còn lại → bỏ chọn
  const handleMapClick = useCallback(
    ({ lng, lat }) => {
      if (checkin) setDraft({ lng, lat });
      else setSelectedId(null);
    },
    [checkin],
  );

  const handleSelectPlace = useCallback((id) => {
    if (!checkin) setSelectedId(id);
  }, [checkin]);

  // Lần đầu có vị trí → lấy thời tiết hiện tại cho chip trên bản đồ
  const handleLocate = useCallback(({ lat, lng }) => {
    if (weatherAsked.current) return;
    weatherAsked.current = true;
    fetchCurrentWeather(lat, lng).then(setWeather).catch(() => {});
  }, []);

  function switchTab(id) {
    if (id === 'record') {
      setRecordOpen(true);
      return;
    }
    setTab(id);
  }

  function showOnMap(place) {
    setDetailId(null);
    setTab('map');
    setSelectedId(place.id);
    setFocus({ lng: place.lng, lat: place.lat, zoom: 16 });
  }

  function closeCheckin() {
    setCheckin(false);
    setDraft(null);
  }

  const onMap = tab === 'map' && !recordOpen && !detail;
  const showTabBar = !recordOpen && !detail && !checkin;

  return (
    <div className="app">
      <MapView
        key={dark ? 'dark' : 'light'}
        dark={dark}
        places={mapPlaces}
        tracks={tracks}
        livePoints={tracker.points}
        selectedId={selectedId}
        draft={checkin ? draft : null}
        focus={focus}
        showLocate={onMap && !checkin}
        onLocate={handleLocate}
        onMapClick={handleMapClick}
        onSelectPlace={handleSelectPlace}
        onDraftMove={setDraft}
      />

      {onMap && !checkin && (
        <MapOverlay
          query={mapQuery}
          onQueryChange={setMapQuery}
          onSearch={() => mapPlaces.length && setFocus({ bounds: bounds(mapPlaces.map((p) => [p.lng, p.lat])) })}
          weather={weather}
          stats={stats}
          selected={selected}
          onOpen={setDetailId}
          onCheckin={() => { setSelectedId(null); setCheckin(true); }}
        />
      )}

      {onMap && checkin && (
        <>
          {!draft && <div className="map-hint">Chạm lên bản đồ để ghim vị trí</div>}
          <section className="sheet" aria-label="Check-in">
            <div className="sheet-head">
              <h2 className="sheet-title">Check-in</h2>
              <button className="round-btn plain" onClick={closeCheckin} aria-label="Đóng check-in">
                <Icon name="close" size={20} />
              </button>
            </div>
            <CheckinForm
              userId={user.id}
              draft={draft}
              onDraftChange={setDraft}
              onFocus={(f) => setFocus({ ...f, padding: { bottom: window.innerHeight * 0.62 } })}
              onSaved={async (place) => {
                await reload();
                closeCheckin();
                setDetailId(place.id);
              }}
            />
          </section>
        </>
      )}

      {tab === 'journal' && (
        <Timeline
          places={places}
          tracks={tracks}
          query={journalQuery}
          onQueryChange={setJournalQuery}
          onSelect={setDetailId}
        />
      )}

      {tab === 'trips' && (
        <div className="screen">
          <div className="screen-inner">
            <header className="screen-head">
              <span className="mono-label wide">SẮP CÓ</span>
              <h1 className="screen-title">Chuyến đi</h1>
              <span className="screen-sub">gom địa điểm và lộ trình thành một chuyến</span>
            </header>
            <p className="empty">Tính năng chuyến đi và link chia sẻ đang được làm.</p>
          </div>
        </div>
      )}

      {tab === 'me' && (
        <MeScreen
          email={user.email}
          theme={theme}
          onThemeChange={setTheme}
          goalKm={goalKm}
          onGoalChange={setGoalKm}
          tracks={tracks}
          onChanged={reload}
          onShowTrack={(b) => { setTab('map'); setFocus({ bounds: b }); }}
        />
      )}

      {detail && (
        <PlaceDetail
          key={detail.id}
          place={detail}
          tracks={tracks}
          onBack={() => setDetailId(null)}
          onDeleted={() => { setDetailId(null); setSelectedId(null); reload(); }}
          onShowOnMap={() => showOnMap(detail)}
          onTagClick={(t) => { setJournalQuery(`#${t}`); setDetailId(null); setTab('journal'); }}
        />
      )}

      {recordOpen && (
        <RecordScreen
          tracker={tracker}
          goalKm={goalKm}
          onMinimize={() => { setRecordOpen(false); setTab('map'); }}
          onSaved={reload}
        />
      )}

      {loadError && <p className="toast error" role="alert">{loadError}</p>}

      {showTabBar && (
        <nav className="tabbar" aria-label="Điều hướng chính">
          {TABS.map((t) =>
            t.id === 'record' ? (
              <button
                key={t.id}
                className={`tab-record${tracker.recording ? ' is-live' : ''}`}
                onClick={() => switchTab('record')}
                aria-label={tracker.recording ? 'Ghi lộ trình (đang ghi)' : 'Ghi lộ trình'}
              >
                <Icon name="route" size={26} strokeWidth={2} />
              </button>
            ) : (
              <button
                key={t.id}
                className="tab"
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => switchTab(t.id)}
              >
                <Icon name={t.icon} />
                {t.label}
              </button>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

// Hiển thị khi chưa tạo file .env
function SetupNotice() {
  return (
    <div className="auth">
      <div className="auth-card stack">
        <h1 className="brand">Hành trình</h1>
        <p>Chưa cấu hình Supabase. Sao chép <code>.env.example</code> thành <code>.env</code>, điền URL và anon key, rồi chạy lại <code>npm run dev</code>.</p>
      </div>
    </div>
  );
}
