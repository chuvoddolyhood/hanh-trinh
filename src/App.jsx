import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isConfigured } from "./lib/supabase";
import * as api from "./lib/api";
import { matchPlace } from "./lib/text";
import { bounds, formatDistance, heatPoints, trackDistance } from "./lib/geo";
import { drawPoster } from "./lib/poster";
import { fetchCurrentWeather } from "./lib/weather";
import { visitedRegions } from "./lib/regions";
import { listOutbox, syncOutbox, discardOutbox } from "./lib/outbox";
import { useTracker } from "./hooks/useTracker";
import MapView from "./components/MapView";
import MapOverlay from "./components/MapOverlay";
import AuthScreen from "./components/AuthScreen";
import Timeline from "./components/Timeline";
import PlaceDetail from "./components/PlaceDetail";
import CheckinForm from "./components/CheckinForm";
import RecordScreen from "./components/RecordScreen";
import MeScreen from "./components/MeScreen";
import TripsScreen from "./components/TripsScreen";
import SharedTrip from "./components/SharedTrip";
import StoryPlayer from "./components/StoryPlayer";
import PosterPreview from "./components/PosterPreview";
import YearRecap from "./components/YearRecap";
import Icon from "./components/icons";

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
  const [theme, setTheme] = useStored("hanh-trinh:theme", "auto");
  const query = useMemo(
    () => window.matchMedia("(prefers-color-scheme: dark)"),
    [],
  );
  const [systemDark, setSystemDark] = useState(query.matches);
  useEffect(() => {
    const onChange = (e) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [query]);
  const dark = theme === "dark" || (theme === "auto" && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
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
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") clearOffline();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <SetupNotice />;
  // Link chia sẻ /s/<token> (link cũ: ?s=<token>): xem chuyến đi không cần đăng nhập
  const shareToken =
    window.location.pathname.match(/^\/s\/([^/]+)/)?.[1] ??
    new URLSearchParams(window.location.search).get("s");
  if (shareToken)
    return <SharedTrip token={shareToken} dark={themeState.dark} />;
  if (!authReady) return <div className="splash">Đang tải…</div>;
  if (!session) return <AuthScreen />;
  return <Workspace user={session.user} {...themeState} />;
}

// Link mời ?invite=<token>: lưu lại ngay khi mở trang, vì người mới phải đăng ký và
// link xác nhận trong email quay về trang gốc, mất tham số trên URL
const PENDING_INVITE = "hanh-trinh:pending-invite";
let inviteParam = new URLSearchParams(window.location.search).get("invite");
if (inviteParam) {
  try {
    localStorage.setItem(PENDING_INVITE, inviteParam);
  } catch {
    // Bị chặn lưu trữ: vẫn nhận được nếu đăng nhập ngay trên trang này
  }
  window.history.replaceState(null, "", window.location.pathname);
}

// Lấy một lần rồi xoá (StrictMode chạy effect hai lần)
function takePendingInvite() {
  let token = inviteParam;
  inviteParam = null;
  try {
    token = localStorage.getItem(PENDING_INVITE) ?? token;
    localStorage.removeItem(PENDING_INVITE);
  } catch {
    // Bị chặn lưu trữ: dùng giá trị trên URL
  }
  return token;
}

// Dữ liệu đã tải lần gần nhất, để mở app khi mất mạng (PWA). Lỗi đầy bộ nhớ thì chỉ mất bản lưu.
const OFFLINE_PREFIX = "hanh-trinh:offline:";

function saveOffline(userId, data) {
  try {
    localStorage.setItem(OFFLINE_PREFIX + userId, JSON.stringify(data));
  } catch {
    // Quá hạn mức localStorage (nhiều lộ trình dài): bỏ qua
  }
}

function loadOffline(userId) {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_PREFIX + userId));
  } catch {
    return null;
  }
}

// Đăng xuất: xoá dữ liệu và ảnh đã lưu trên máy (máy dùng chung)
function clearOffline() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(OFFLINE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Bị chặn lưu trữ: không có gì để xoá
  }
  globalThis.caches?.delete("ht-photos");
  // Huỷ đăng ký push của trình duyệt này (máy dùng chung, người sau đăng nhập tài khoản khác)
  navigator.serviceWorker
    ?.getRegistration()
    .then((reg) => reg?.pushManager?.getSubscription())
    .then((s) => s?.unsubscribe())
    .catch(() => {});
}

// Mở từ thông báo "Ngày này năm trước" (?memories=1) → vào Nhật ký
const openMemories = new URLSearchParams(window.location.search).has("memories");
if (openMemories) window.history.replaceState(null, "", window.location.pathname);

// Mục trong hàng chờ ngoại tuyến → dạng giống bản ghi từ server để hiện trên bản đồ, nhật ký.
// pending: { photos: số ảnh chờ tải, error: lỗi khi gửi (nếu có) }
function pendingPlace(item, userId) {
  const { photos, ...fields } = item.data;
  return {
    ...fields,
    user_id: userId,
    photos: [],
    created_at: new Date(item.createdAt).toISOString(),
    pending: { photos: photos.length, error: item.error },
  };
}

function pendingTrack(item, userId) {
  const { points } = item.data;
  const times = points.map((p) => p[2]).filter((t) => t != null);
  return {
    ...item.data,
    user_id: userId,
    distance_m: trackDistance(points),
    started_at: times.length ? new Date(times[0]).toISOString() : null,
    ended_at: times.length ? new Date(times.at(-1)).toISOString() : null,
    pending: { error: item.error },
  };
}

const TABS = [
  { id: "map", label: "Bản đồ", icon: "map" },
  { id: "journal", label: "Nhật ký", icon: "book" },
  { id: "record" },
  { id: "trips", label: "Chuyến đi", icon: "flag" },
  { id: "me", label: "Tôi", icon: "user" },
];

function Workspace({ user, theme, setTheme, dark }) {
  const [tab, setTab] = useState(openMemories ? "journal" : "map");
  const [recordOpen, setRecordOpen] = useState(false);
  const [savedPlaces, setPlaces] = useState([]);
  const [savedTracks, setTracks] = useState([]);
  const [outbox, setOutbox] = useState([]); // Check-in, lộ trình lưu lúc mất mạng, chờ gửi
  // Mục đang chờ hiện cùng dữ liệu đã lưu (trên cùng)
  const places = useMemo(
    () => [
      ...outbox.filter((i) => i.type === "place").map((i) => pendingPlace(i, user.id)),
      ...savedPlaces,
    ],
    [outbox, savedPlaces, user.id],
  );
  const tracks = useMemo(
    () => [
      ...outbox.filter((i) => i.type === "track").map((i) => pendingTrack(i, user.id)),
      ...savedTracks,
    ],
    [outbox, savedTracks, user.id],
  );
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // Thẻ xem nhanh trên bản đồ
  const [detailId, setDetailId] = useState(null); // Màn hình chi tiết
  const [checkin, setCheckin] = useState(null); // null | { place }: place có giá trị khi sửa check-in cũ
  const [draft, setDraft] = useState(null);
  const [focus, setFocus] = useState(null);
  const [mapQuery, setMapQuery] = useState("");
  const [journalQuery, setJournalQuery] = useState("");
  const [weather, setWeather] = useState(null);
  const [goalKm, setGoalKm] = useStored("hanh-trinh:goal-km", 5);
  const [provinceSet, setProvinceSet] = useStored(
    "hanh-trinh:province-set",
    "34",
  ); // '34' | '63'
  const [scratchOn, setScratchOn] = useStored("hanh-trinh:scratch", false);
  const [heatOn, setHeatOn] = useStored("hanh-trinh:heat", false);
  const [regions, setRegions] = useState(null);
  const [defaultVisibility, setDefaultVisibility] = useStored(
    "hanh-trinh:default-visibility",
    "private",
  ); // 'private' | 'friends'
  const [friend, setFriend] = useState(null); // Đang xem bản đồ của bạn: { profile, places }
  const [story, setStory] = useState(null); // Xem lại dạng story: { title, places, returnTab }
  const [recap, setRecap] = useState(null); // Tổng kết năm: { year, returnTab }
  const [poster, setPoster] = useState(null); // { status: 'working' | 'ready', url, blob, title }
  const mapApi = useRef(null);
  const [external, setExternal] = useState(null); // Nơi của thành viên chuyến nhóm: { place, ownerName }
  const [notice, setNotice] = useState(null);
  const [friendsRefresh, setFriendsRefresh] = useState(0);
  const weatherAsked = useRef(false);

  // Hook ghi lộ trình đặt ở cấp cao nhất: vẫn ghi khi thu nhỏ màn hình Ghi
  const tracker = useTracker();

  const reload = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api.listPlaces(user.id), api.listTracks(user.id)]);
      setPlaces(p);
      setTracks(t);
      setLoadError(null);
      saveOffline(user.id, { places: p, tracks: t, at: Date.now() });
    } catch (e) {
      // Mất mạng: dùng bản đã lưu lần tải trước
      const saved = loadOffline(user.id);
      if (!saved) {
        setLoadError(`Không tải được dữ liệu: ${e.message}`);
        return;
      }
      setPlaces(saved.places);
      setTracks(saved.tracks);
      setLoadError(null);
      setNotice(
        `Đang ngoại tuyến, hiện dữ liệu lưu lúc ${new Date(saved.at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.`,
      );
    }
  }, [user.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshOutbox = useCallback(
    () => listOutbox(user.id).then(setOutbox).catch(() => {}),
    [user.id],
  );

  // Gửi các mục lưu lúc mất mạng: khi mở app và mỗi khi có mạng lại
  const sync = useCallback(async () => {
    const sent = await syncOutbox(user.id).catch(() => 0);
    if (sent) await reload();
    await refreshOutbox();
    if (sent) setNotice(`Đã đồng bộ ${sent} mục lưu lúc mất mạng.`);
  }, [user.id, reload, refreshOutbox]);

  useEffect(() => {
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  // Bỏ một mục đang chờ (không gửi nữa)
  async function discardPending(id) {
    await discardOutbox(id).catch(() => {});
    await refreshOutbox();
  }

  // Link mời đã lưu lúc mở trang (xem PENDING_INVITE) → thành bạn bè với người mời; xoá trước để không nhận lại
  useEffect(() => {
    const token = takePendingInvite();
    if (!token) return;
    api
      .acceptInvite(token)
      .then((name) => {
        setNotice(`Bạn và ${name} đã là bạn bè.`);
        setFriendsRefresh((k) => k + 1);
      })
      .catch((e) => setNotice(e.message));
  }, []);

  // Thông báo tự ẩn sau 4 giây
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  // Tỉnh và quốc gia đã đến; lỗi tải ranh giới thì ô thống kê hiện "—"
  useEffect(() => {
    let alive = true;
    visitedRegions(places)
      .then((r) => alive && setRegions(r))
      .catch(() => alive && setRegions(null));
    return () => {
      alive = false;
    };
  }, [places]);

  const provinceKey = provinceSet === "63" ? "n63" : "n34";
  const provinceStats = useMemo(
    () =>
      regions && {
        count: regions[provinceSet === "63" ? "p63" : "p34"].size,
        total: Number(provinceSet),
        countries: [...regions.countries.values()],
      },
    [regions, provinceSet],
  );
  const scratch = useMemo(
    () =>
      scratchOn && regions
        ? {
            key: provinceKey,
            names: [...regions[provinceSet === "63" ? "p63" : "p34"]],
          }
        : null,
    [scratchOn, regions, provinceKey, provinceSet],
  );
  const heat = useMemo(
    () => (heatOn ? heatPoints(tracks, places) : null),
    [heatOn, tracks, places],
  );

  // Khi xem bản đồ của bạn, bản đồ và thẻ xem nhanh dùng địa điểm của bạn đó
  const shownPlaces = friend ? friend.places : places;
  const selected = shownPlaces.find((p) => p.id === selectedId) ?? null;
  const detail =
    places.find((p) => p.id === detailId) ??
    friend?.places.find((p) => p.id === detailId) ??
    (external?.place.id === detailId ? external.place : null);
  const detailOwner =
    detail && detail.user_id !== user.id
      ? (friend?.profile.display_name ?? external?.ownerName ?? "bạn đồng hành")
      : null;
  const editingId = checkin?.place?.id;
  // Đang sửa thì ẩn điểm cũ, chỉ hiện ghim nháp
  const mapPlaces = useMemo(
    () =>
      shownPlaces.filter((p) => p.id !== editingId && matchPlace(p, mapQuery)),
    [shownPlaces, mapQuery, editingId],
  );
  const stats = useMemo(
    () => ({
      visited: places.filter((p) => p.kind === "visited").length,
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

  const handleSelectPlace = useCallback(
    (id) => {
      if (!checkin) setSelectedId(id);
    },
    [checkin],
  );

  // Lần đầu có vị trí → lấy thời tiết hiện tại cho chip trên bản đồ
  const handleLocate = useCallback(({ lat, lng }) => {
    if (weatherAsked.current) return;
    weatherAsked.current = true;
    fetchCurrentWeather(lat, lng)
      .then(setWeather)
      .catch(() => {});
  }, []);

  function switchTab(id) {
    if (id === "record") {
      setRecordOpen(true);
      return;
    }
    setFriend(null);
    setTab(id);
  }

  // Xem bản đồ của một người bạn: chỉ những nơi họ để mức "Bạn bè" (RLS lọc sẵn)
  async function viewFriend(profile) {
    try {
      const friendPlaces = await api.listPlaces(profile.id);
      setFriend({ profile, places: friendPlaces });
      setSelectedId(null);
      setMapQuery("");
      setTab("map");
      if (friendPlaces.length) {
        setFocus({ bounds: bounds(friendPlaces.map((p) => [p.lng, p.lat])) });
      } else {
        setNotice(`${profile.display_name} chưa chia sẻ nơi nào với bạn bè.`);
      }
    } catch (e) {
      setNotice(e.message);
    }
  }

  function closeFriend() {
    setFriend(null);
    setSelectedId(null);
  }

  function showOnMap(place) {
    setDetailId(null);
    setTab("map");
    setSelectedId(place.id);
    setFocus({ lng: place.lng, lat: place.lat, zoom: 16 });
  }

  function closeCheckin() {
    setCheckin(null);
    setDraft(null);
  }

  function editPlace(place) {
    setDetailId(null);
    setSelectedId(null);
    setTab("map");
    setCheckin({ place });
    setDraft({ lng: place.lng, lat: place.lat });
    setFocus({
      lng: place.lng,
      lat: place.lat,
      zoom: 16,
      padding: { bottom: window.innerHeight * 0.62 },
    });
  }

  // Tạo poster: đưa bản đồ về khung cần in (vùng vuông giữa màn hình vì poster cắt giữa), chụp rồi ghép chữ
  async function makePoster({ title, label, stats, points }) {
    if (!points.length) return;
    setDetailId(null);
    setStory(null);
    setRecap(null);
    setSelectedId(null);
    setTab("map");
    setPoster({ status: "working", title });
    const extra = Math.max(0, (window.innerHeight - window.innerWidth) / 2);
    setFocus({ bounds: bounds(points), padding: { top: extra, bottom: extra } });
    try {
      const shot = await mapApi.current.capture();
      const blob = await drawPoster(shot, { title, label, stats, dark });
      setPoster({ status: "ready", url: URL.createObjectURL(blob), blob, title });
    } catch (e) {
      setPoster(null);
      setNotice(`Chưa tạo được poster: ${e.message}`);
    }
  }

  function closePoster() {
    if (poster?.url) URL.revokeObjectURL(poster.url);
    setPoster(null);
  }

  function makeMyPoster() {
    const visited = places.filter((p) => p.kind === "visited");
    const km = tracks.reduce((s, t) => s + (t.distance_m || 0), 0);
    makePoster({
      title: "Hành trình của tôi",
      label: `Bản đồ ${new Date().getFullYear()}`,
      stats: [
        ["Nơi đã đến", String(visited.length)],
        ["Tỉnh, thành", provinceStats ? `${provinceStats.count}/${provinceStats.total}` : "—"],
        ["Đi bộ", formatDistance(km)],
      ],
      points: [...visited.map((p) => [p.lng, p.lat]), ...tracks.flatMap((t) => t.points)],
    });
  }

  const onMap =
    tab === "map" && !recordOpen && !detail && !story && !poster && !recap;
  const showTabBar =
    !recordOpen && !detail && !checkin && !story && !poster && !recap;

  return (
    <div className="app">
      <MapView
        ref={mapApi}
        key={dark ? "dark" : "light"}
        dark={dark}
        places={mapPlaces}
        tracks={friend ? [] : tracks}
        livePoints={tracker.points}
        selectedId={selectedId}
        draft={checkin ? draft : null}
        focus={focus}
        scratch={onMap && !checkin && !friend ? scratch : null}
        heat={onMap && !checkin && !friend ? heat : null}
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
          onSearch={() =>
            mapPlaces.length &&
            setFocus({ bounds: bounds(mapPlaces.map((p) => [p.lng, p.lat])) })
          }
          weather={weather}
          stats={stats}
          scratchOn={scratchOn}
          onScratchToggle={() => setScratchOn(!scratchOn)}
          heatOn={heatOn}
          onHeatToggle={() => setHeatOn(!heatOn)}
          friendName={friend?.profile.display_name}
          onCloseFriend={closeFriend}
          selected={selected}
          onOpen={setDetailId}
          onCheckin={() => {
            setSelectedId(null);
            setCheckin({});
          }}
        />
      )}

      {onMap && checkin && (
        <>
          {!draft && (
            <div className="map-hint">Chạm lên bản đồ để ghim vị trí</div>
          )}
          <section className="sheet" aria-label="Check-in">
            <div className="sheet-head">
              <h2 className="sheet-title">
                {checkin.place ? "Sửa check-in" : "Check-in"}
              </h2>
              <button
                type="button"
                className="round-btn plain"
                onClick={closeCheckin}
                aria-label="Đóng check-in"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <CheckinForm
              key={editingId ?? "new"}
              userId={user.id}
              place={checkin.place}
              tracks={tracks}
              defaultVisibility={defaultVisibility}
              draft={draft}
              onDraftChange={setDraft}
              onFocus={(f) =>
                setFocus({
                  ...f,
                  padding: { bottom: window.innerHeight * 0.62 },
                })
              }
              onSaved={async (place, { queued } = {}) => {
                await Promise.all([reload(), refreshOutbox()]);
                closeCheckin();
                setDetailId(place.id);
                if (queued)
                  setNotice("Đang mất mạng: đã lưu check-in trên máy, sẽ tự đồng bộ khi có mạng.");
              }}
            />
          </section>
        </>
      )}

      {tab === "journal" && (
        <Timeline
          places={places}
          tracks={tracks}
          provinceStats={provinceStats}
          query={journalQuery}
          onQueryChange={setJournalQuery}
          onSelect={setDetailId}
        />
      )}

      {tab === "trips" && (
        <TripsScreen
          userId={user.id}
          places={places}
          tracks={tracks}
          onDataChanged={reload}
          onMakePoster={makePoster}
          onPlayStory={(title, storyPlaces) => {
            setStory({ title, places: storyPlaces, returnTab: tab });
            setTab("map");
          }}
          onOpenPlace={(place, ownerName) => {
            setExternal(ownerName ? { place, ownerName } : null);
            setDetailId(place.id);
          }}
          onShowOnMap={(b) => {
            setTab("map");
            setFocus({ bounds: b });
          }}
        />
      )}

      {tab === "me" && (
        <MeScreen
          email={user.email}
          theme={theme}
          onThemeChange={setTheme}
          goalKm={goalKm}
          onGoalChange={setGoalKm}
          provinceSet={provinceSet}
          onProvinceSetChange={setProvinceSet}
          defaultVisibility={defaultVisibility}
          onDefaultVisibilityChange={setDefaultVisibility}
          userId={user.id}
          friendsRefresh={friendsRefresh}
          onViewFriend={viewFriend}
          onMakePoster={makeMyPoster}
          onOpenRecap={(year) => {
            setRecap({ year, returnTab: tab });
            setTab("map");
          }}
          places={places}
          tracks={tracks}
          regions={regions}
          pendingCount={outbox.length}
          onDiscardPending={discardPending}
          onChanged={reload}
          onShowTrack={(b) => {
            setTab("map");
            setFocus({ bounds: b });
          }}
        />
      )}

      {detail && (
        <PlaceDetail
          key={detail.id}
          place={detail}
          tracks={detailOwner ? [] : tracks}
          userId={user.id}
          owner={detailOwner}
          onBack={() => setDetailId(null)}
          onDeleted={() => {
            setDetailId(null);
            setSelectedId(null);
            reload();
          }}
          onDiscardPending={async () => {
            setDetailId(null);
            setSelectedId(null);
            await discardPending(detail.id);
          }}
          onShowOnMap={() => showOnMap(detail)}
          onEdit={() => editPlace(detail)}
          onTagClick={(t) => {
            setJournalQuery(`#${t}`);
            setDetailId(null);
            setTab("journal");
          }}
        />
      )}

      {poster && <PosterPreview poster={poster} onClose={closePoster} />}

      {story && (
        <StoryPlayer
          title={story.title}
          places={story.places}
          onFocus={(f) =>
            setFocus({ ...f, padding: { bottom: window.innerHeight * 0.48 } })
          }
          onClose={() => {
            setTab(story.returnTab);
            setStory(null);
          }}
        />
      )}

      {recap && (
        <YearRecap
          year={recap.year}
          places={places}
          tracks={tracks}
          provinceSet={provinceSet}
          onFocus={(f) =>
            setFocus({ ...f, padding: { bottom: window.innerHeight * 0.48 } })
          }
          onClose={() => {
            setTab(recap.returnTab);
            setRecap(null);
          }}
          onPlayStory={(storyPlaces) => {
            setStory({
              title: `Năm ${recap.year}`,
              places: storyPlaces,
              returnTab: recap.returnTab,
            });
            setRecap(null);
          }}
          onMakePoster={makePoster}
        />
      )}

      {recordOpen && (
        <RecordScreen
          tracker={tracker}
          userId={user.id}
          goalKm={goalKm}
          onMinimize={() => {
            setRecordOpen(false);
            setTab("map");
          }}
          onSaved={() => Promise.all([reload(), refreshOutbox()])}
        />
      )}

      {loadError && (
        <p className="toast error" role="alert">
          {loadError}
        </p>
      )}
      {!loadError && notice && (
        <p className="toast" role="status">
          {notice}
        </p>
      )}

      {showTabBar && (
        <nav className="tabbar" aria-label="Điều hướng chính">
          {TABS.map((t) =>
            t.id === "record" ? (
              <button
                type="button"
                key={t.id}
                className={`tab-record${tracker.recording ? " is-live" : ""}`}
                onClick={() => switchTab("record")}
                aria-label={
                  tracker.recording ? "Ghi lộ trình (đang ghi)" : "Ghi lộ trình"
                }
              >
                <Icon name="route" size={26} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                key={t.id}
                className="tab"
                aria-current={tab === t.id ? "page" : undefined}
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
        <p>
          Chưa cấu hình Supabase. Sao chép <code>.env.example</code> thành{" "}
          <code>.env</code>, điền URL và anon key, rồi chạy lại{" "}
          <code>npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
