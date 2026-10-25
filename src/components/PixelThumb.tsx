interface PixelThumbProps {
  asset: string;
  variant?: number;
  scale?: number;
  className?: string;
  alt?: string;
}

export function PixelThumb({ asset, variant = 0, scale = 2, className, alt = "" }: PixelThumbProps) {
  const source = window.LW?.Assets?.get(asset)
    ? window.LW.Assets.thumb(asset, { v: variant }, scale)
    : "";

  return <img className={className} src={source} alt={alt} draggable={false} />;
}
