import { Download, FileText } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  downloadAnnouncementFile,
  fetchAnnouncementImageUrl,
  type AnnouncementFile,
} from '../../api/announcements';
import { formatSize, isImage } from '../../lib/files';
import { ImageViewer } from './ImageViewer';

/** Целевая высота строки, px, и зазор между изображениями */
const TARGET_ROW_HEIGHT = 220;
const GAP = 8;

/** Вложение; expired — срок хранения истёк (в чате): имя остаётся, содержимого нет */
export type FileItem = AnnouncementFile & { expired?: boolean };

interface Tile {
  id: string;
  name: string;
  url: string;
  ratio: number;
}

/** Загрузка всех изображений вложений (blob-адреса освобождаются при уходе) */
function useImageUrls(
  ownerKey: string,
  images: FileItem[],
  load: (fileId: string) => Promise<string | null>
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = images.map((f) => f.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    setUrls({});
    for (const file of images) {
      void load(file.id).then((url) => {
        if (!url) return;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created.push(url);
        setUrls((prev) => ({ ...prev, [file.id]: url }));
      });
    }
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // images задаётся ключом key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, key]);
  return urls;
}

/** Соотношения сторон (ширина / высота) по загруженным адресам */
function useRatios(urls: Record<string, string>): Record<string, number> {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const key = Object.entries(urls).map(([id, url]) => `${id}:${url}`).join('|');
  useEffect(() => {
    let cancelled = false;
    for (const [id, url] of Object.entries(urls)) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled && img.naturalHeight > 0) {
          setRatios((prev) => ({ ...prev, [id]: img.naturalWidth / img.naturalHeight }));
        }
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
    // urls задаётся ключом key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ratios;
}

/** Разбиение на строки: в строку набирается столько изображений, сколько помещается при целевой высоте */
export function layoutRows(tiles: Tile[], width: number): Tile[][] {
  const rows: Tile[][] = [];
  let row: Tile[] = [];
  let sum = 0;
  for (const tile of tiles) {
    row.push(tile);
    sum += tile.ratio;
    if (sum * TARGET_ROW_HEIGHT + GAP * (row.length - 1) >= width) {
      rows.push(row);
      row = [];
      sum = 0;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * Собственная ширина галереи: все изображения в одну строку при целевой высоте.
 * Если места меньше, галерея сама переносит изображения по строкам.
 */
export function galleryWidth(ratios: number[]): number {
  if (ratios.length === 0) return 0;
  return Math.ceil(ratios.reduce((s, r) => s + r, 0) * TARGET_ROW_HEIGHT + GAP * (ratios.length - 1));
}

/** Высота строки, при которой изображения занимают ровно всю ширину */
function rowHeight(row: Tile[], width: number): number {
  const ratioSum = row.reduce((s, t) => s + t.ratio, 0);
  return (width - GAP * (row.length - 1)) / ratioSum;
}

/** Галерея: изображения одной строки одной высоты, по одному в строке — одной ширины */
function Gallery({ tiles, onOpen }: { tiles: Tile[]; onOpen: (index: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = width > 0 ? layoutRows(tiles, width) : [];
  let counter = 0;

  return (
    <div ref={box} className="flex w-full flex-col" style={{ gap: GAP }}>
      {rows.map((row) => {
        const natural = rowHeight(row, width);
        const full = row.reduce((s, t) => s + t.ratio, 0) * TARGET_ROW_HEIGHT + GAP * (row.length - 1) >= width;
        const height = full ? natural : Math.min(natural, TARGET_ROW_HEIGHT);
        return (
          <div key={row[0].id} className="flex justify-center" style={{ gap: GAP }}>
            {row.map((tile) => {
              const index = counter++;
              return (
                <button
                  key={tile.id}
                  type="button"
                  aria-label={`Открыть изображение ${tile.name}`}
                  className="shrink-0 cursor-zoom-in overflow-hidden rounded-xl"
                  style={{ height, width: height * tile.ratio }}
                  onClick={() => onOpen(index)}
                >
                  <img src={tile.url} alt={tile.name} draggable={false} className="block size-full object-cover" />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Вложения: галерея изображений с просмотром, документы списком для скачивания,
 * просроченные файлы — имя и пометка «Файл истёк».
 * По умолчанию файлы берутся из объявлений; для чата передаются loadImage и onDownload.
 */
export function FileList({
  announcementId,
  files,
  loadImage,
  onDownload,
  fitWidth,
}: {
  announcementId: string;
  files: FileItem[];
  loadImage?: (fileId: string) => Promise<string | null>;
  onDownload?: (file: FileItem) => Promise<void>;
  /**
   * Ширина по содержимому (для пузыря чата): только изображения — ширина по их размерам,
   * иначе (документы или ещё не загруженные изображения) — эта ширина, например '24rem'.
   * Родитель ограничивает её своим max-width.
   */
  fitWidth?: string;
}) {
  const live = files.filter((f) => !f.expired);
  const images = live.filter((f) => isImage(f.contentType));
  const others = files.filter((f) => f.expired || !isImage(f.contentType));
  const load = loadImage ?? ((id: string) => fetchAnnouncementImageUrl(announcementId, id));
  const download = onDownload ?? ((f: FileItem) => downloadAnnouncementFile(announcementId, f));
  const urls = useImageUrls(announcementId, images, load);
  const ratios = useRatios(urls);
  const [open, setOpen] = useState<number | null>(null);

  if (files.length === 0) return null;

  const tiles: Tile[] = images
    .filter((f) => urls[f.id])
    .map((f) => ({ id: f.id, name: f.fileName, url: urls[f.id], ratio: ratios[f.id] ?? 4 / 3 }));
  const viewer = tiles.map((t) => ({ url: t.url, name: t.name }));
  // Размеры известны, только когда все изображения загружены и измерены
  const measured = others.length === 0 && tiles.length === images.length && images.every((f) => ratios[f.id] !== undefined);
  const width = fitWidth === undefined ? undefined : measured ? `${galleryWidth(tiles.map((t) => t.ratio))}px` : fitWidth;

  return (
    <div className="flex flex-col gap-2" style={width === undefined ? undefined : { width, maxWidth: '100%' }}>
      {tiles.length > 0 ? <Gallery tiles={tiles} onOpen={setOpen} /> : null}
      {others.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {others.map((f) => (
            <li key={f.id}>
              {f.expired ? (
                <div className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-surface px-3 py-2 text-sm text-muted">
                  <FileText size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                  <span className="shrink-0 text-xs">Файл истёк</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-primary/50 bg-surface px-3 py-2 text-left text-sm hover:bg-primary-soft"
                  onClick={() => void download(f)}
                >
                  <FileText size={16} aria-hidden="true" className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                  <span className="tabular shrink-0 text-xs text-muted">{formatSize(f.sizeBytes)}</span>
                  <Download size={16} aria-hidden="true" className="shrink-0 text-primary" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {open !== null ? <ImageViewer images={viewer} start={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}