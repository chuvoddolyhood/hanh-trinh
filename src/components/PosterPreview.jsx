import Icon from './icons';

// Xem trước poster: chia sẻ ảnh (điện thoại) hoặc tải về; poster = { status: 'working' | 'ready', url, blob, title }
export default function PosterPreview({ poster, onClose }) {
  const fileName = `${poster.title || 'hanh-trinh'}.png`.replace(/[\\/:*?"<>|]/g, '');

  async function share() {
    const file = new File([poster.blob], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: poster.title });
    } catch {
      // Người dùng huỷ bảng chia sẻ
    }
  }

  const canShareFile =
    poster.blob && navigator.canShare?.({ files: [new File([poster.blob], fileName, { type: 'image/png' })] });

  return (
    <section className="poster" aria-label="Poster bản đồ">
      <div className="poster-head">
        <h2 className="sheet-title">Poster</h2>
        <button type="button" className="round-btn plain" onClick={onClose} aria-label="Đóng poster">
          <Icon name="close" size={20} />
        </button>
      </div>
      {poster.status === 'working' ? (
        <p className="muted poster-wait" role="status">Đang vẽ bản đồ…</p>
      ) : (
        <>
          <img className="poster-img" src={poster.url} alt={`Poster: ${poster.title}`} />
          <div className="row">
            {canShareFile && (
              <button type="button" className="btn-pill btn-dark" onClick={share}>Chia sẻ ảnh</button>
            )}
            <a className={`btn-pill ${canShareFile ? 'btn-outline' : 'btn-dark'}`} href={poster.url} download={fileName}>
              Tải về
            </a>
          </div>
        </>
      )}
    </section>
  );
}
