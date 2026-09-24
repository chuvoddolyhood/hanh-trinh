import Icon from './icons';

// Ảnh kiểu polaroid: khung trắng, xoay nhẹ, chú thích serif nghiêng. Chưa có ảnh → gradient + icon máy ảnh.
export default function Polaroid({ src, alt = '', caption, tilt = 0, className = '' }) {
  return (
    <figure className={`polaroid ${className}`} style={{ '--tilt': `${tilt}deg` }}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <div className="polaroid-empty"><Icon name="camera" /></div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
