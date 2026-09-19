'use client';
import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowUpRight,
  Plus,
  Search,
  Undo2,
  Redo2,
  Download,
  Type,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  Move,
  Scissors,
  ExternalLink,
  FilePlus,
  X,
  Save,
  Mail,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  products,
  initial,
  textMetrics,
  BOARD_W,
  BOARD_H,
  type Piece,
  categoryGroups,
} from './collage';
import {
  useLibrary,
  useClipReceiver,
  formatPrice,
  bookmarkletFor,
} from '@/hooks/use-library';
import type { ClipObject } from '@/lib/objects/schema';
export default function Home() {
  const [pieces, setPieces] = useState<Piece[]>(initial),
    [selected, setSelected] = useState<string | null>(null),
    [category, setCategory] = useState(''),
    [query, setQuery] = useState(''),
    [title] = useState('The art of getting dressed'),
    [notice, setNotice] = useState(''),
    [history, setHistory] = useState<Piece[][]>([]),
    [future, setFuture] = useState<Piece[][]>([]),
    [tab, setTab] = useState('pieces');
  const canvas = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  // Screen pixels per board unit at 100%: the board fills the canvas area.
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      // The tool column stands beside the board, so it is not room to fill.
      const tools = el.querySelector('.board-tools');
      const gutter = tools
        ? tools.getBoundingClientRect().width +
          parseFloat(getComputedStyle(tools).marginRight)
        : 0;
      const w =
        el.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight) -
        gutter;
      const h =
        el.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      if (w > 0 && h > 0) setFit(Math.min(w / BOARD_W, h / BOARD_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = fit;
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  // Two-finger pinch: scale and rotate a piece around its centre.
  const pinch = useRef<{
    id: string;
    dist: number;
    angle: number;
    w: number;
    h: number;
    r: number;
    cx: number;
    cy: number;
  } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  // Corner handle drag: scale a piece around its centre.
  const resize = useRef<{
    id: string;
    dist: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
  } | null>(null);
  // Rotation knob drag: the angle from the piece's centre to the pointer.
  const rotate = useRef<{ id: string; cx: number; cy: number } | null>(null);
  /** Which direct-manipulation gesture is live, for the readout. */
  const [gesture, setGesture] = useState<'resize' | 'rotate' | null>(null);
  /** Angle of a pointer around a centre, as the piece rotation it implies. */
  function angleTo(
    cx: number,
    cy: number,
    pt: { x: number; y: number },
    snap: boolean,
  ) {
    let r = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90;
    r = ((((r + 180) % 360) + 360) % 360) - 180;
    if (snap) r = Math.round(r / 15) * 15;
    else
      for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(r - s) < 3) r = s;
    return Math.round(r === -180 ? 180 : r);
  }
  /** Board units per screen pixel: the board is BOARD_W wide whatever the scale. */
  function boardScale() {
    return BOARD_W / (canvas.current?.getBoundingClientRect().width || BOARD_W);
  }
  /** Where the pointer is in board coordinates. */
  function boardPoint(e: { clientX: number; clientY: number }) {
    const r = canvas.current?.getBoundingClientRect();
    const k = boardScale();
    return {
      x: (e.clientX - (r?.left ?? 0)) * k,
      y: (e.clientY - (r?.top ?? 0)) * k,
    };
  }
  /** Resize around a fixed centre, keeping the aspect ratio, within limits. */
  function scaled(
    p: Piece,
    w0: number,
    h0: number,
    cx: number,
    cy: number,
    k: number,
  ) {
    const w = Math.max(40, Math.min(BOARD_W, w0 * k));
    const h = (h0 * w) / w0;
    return { ...p, w, h, x: cx - w / 2, y: cy - h / 2 };
  }
  const current = pieces.find((p) => p.id === selected);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const library = useLibrary(pieces, title);
  const [account, setAccount] = useState<'closed' | 'claim' | 'signin'>(
    'closed',
  );
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  /** Explicit save: write now, then offer an account to an anonymous user. */
  function save() {
    library
      .saveNow()
      .then(() => {
        if (library.account && library.identity?.anonymous) setAccount('claim');
        else if (library.identity?.email)
          announce(`Saved to your library as ${library.identity.email}.`);
        else if (library.kind === 'indexeddb')
          announce('Saved in this browser. It stays on this device.');
        else announce('Saved.');
      })
      .catch(() => announce('Could not save. Please try again.'));
  }
  function sendEmail() {
    const address = email.trim();
    if (!library.account || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      announce('That does not look like an email address.');
      return;
    }
    setSending(true);
    const action =
      account === 'claim'
        ? library.account.claim(address)
        : library.account.signIn(address);
    action
      .then(() => {
        setAccount('closed');
        announce(
          `Check ${address} for a link. Your library follows you once you click it.`,
          6000,
        );
      })
      .catch((e: unknown) =>
        announce(
          e instanceof Error ? e.message : 'Could not send the email.',
          5000,
        ),
      )
      .finally(() => setSending(false));
  }
  const { loadCreation, fallback } = library;
  useEffect(() => {
    if (fallback) announce(fallback, 9000);
  }, [fallback]);
  useEffect(() => {
    loadCreation()
      .then((saved) => {
        if (saved) {
          setPieces(saved);
          setSelected(null);
        }
      })
      .catch(() => {});
  }, [loadCreation]);
  useClipReceiver((payload) => {
    announce('Clipping…');
    library
      .clip(payload)
      .then((o) => {
        actions.current.addObject(o);
        setTab('clipped');
        announce(
          `Clipped “${o.title}”` +
            (o.source.retailer ? ` from ${o.source.retailer}.` : '.'),
        );
      })
      .catch(() => announce('That clip could not be saved.'));
  });
  /** The image to draw for a piece: a catalog PNG or a clipped object. */
  function imageSrc(p: Piece): string | undefined {
    return p.object
      ? library.srcById(p.object)
      : '/pieces/' + p.product + '.png';
  }
  function addObject(o: ClipObject) {
    const ref = o.cutoutImage ?? o.originalImage;
    const w = ref.width ? Math.min(260, ref.width) : 230;
    const h = ref.width && ref.height ? (w * ref.height) / ref.width : 230;
    const p: Piece = {
      id: crypto.randomUUID(),
      product: 'object',
      object: o.id,
      x: BOARD_W / 2 - w / 2,
      y: BOARD_H / 2 - h / 2,
      w,
      h,
      r: 0,
    };
    commit([...pieces, p]);
    setSelected(p.id);
  }
  function commit(next: Piece[]) {
    setHistory((h) => [...h, pieces]);
    setFuture([]);
    setPieces(next);
  }
  function patch(v: Partial<Piece>) {
    commit(pieces.map((p) => (p.id === selected ? { ...p, ...v } : p)));
  }
  function toBack() {
    if (current) commit([current, ...pieces.filter((p) => p.id !== selected)]);
  }
  function toFront() {
    if (current) commit([...pieces.filter((p) => p.id !== selected), current]);
  }
  function duplicate() {
    if (!current) return;
    const n = {
      ...current,
      id: crypto.randomUUID(),
      x: current.x + 20,
      y: current.y + 20,
    };
    commit([...pieces, n]);
    setSelected(n.id);
  }
  function remove() {
    commit(pieces.filter((p) => p.id !== selected));
    setSelected(null);
  }
  function add(id: string) {
    const product = products.find((p) => p.id === id);
    const p: Piece = {
      id: crypto.randomUUID(),
      product: id,
      x: 180,
      y: 170,
      w: product?.w || 230,
      h: product?.h || 70,
      r: 0,
      ...(product?.text
        ? { text: product.text, style: product.style }
        : id === 'text'
          ? { text: 'Your words here', style: 'serif' }
          : {}),
    };
    commit([...pieces, p]);
    setSelected(p.id);
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [pieces, ...f]);
    setPieces(history.at(-1)!);
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, pieces]);
    setPieces(future[0]);
    setFuture((f) => f.slice(1));
  }
  function announce(s: string, ms = 2600) {
    setNotice(s);
    setTimeout(() => setNotice(''), ms);
  }
  async function download() {
    try {
      const c = document.createElement('canvas');
      c.width = BOARD_W * 2;
      c.height = BOARD_H * 2;
      const ctx = c.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
        ctx.rotate((p.r * Math.PI) / 180);
        if (p.text) {
          const m = textMetrics(p);
          if (m.background) {
            ctx.fillStyle = m.background;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          }
          ctx.fillStyle = m.color;
          ctx.font = m.font;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lines = p.text.split('\n');
          lines.forEach((line, i) =>
            ctx.fillText(
              line,
              0,
              (i - (lines.length - 1) / 2) * m.lineHeight,
              p.w,
            ),
          );
        } else {
          const src = imageSrc(p);
          if (!src) continue;
          const img = new Image();
          img.src = src;
          await img.decode();
          const s = Math.min(p.w / img.width, p.h / img.height);
          ctx.drawImage(
            img,
            (-img.width * s) / 2,
            (-img.height * s) / 2,
            img.width * s,
            img.height * s,
          );
        }
        ctx.restore();
      }
      const a = document.createElement('a');
      a.download = title + '.png';
      a.href = c.toDataURL('image/png');
      a.click();
      announce('Your collage is ready to keep.');
    } catch {
      announce('Could not export. Please try again.');
    }
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          commit(pieces.filter((p) => p.id !== selected));
          setSelected(null);
        }
      }
      if (e.key === 'Escape') setSelected(null);
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [pieces, selected, history, future]);
  const actions = useRef({ add, addObject });
  actions.current = { add, addObject };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    try {
      context.registerTool(
        {
          name: 'add_collage_piece',
          description: 'Add a catalog piece or text to the current collage.',
          inputSchema: {
            type: 'object',
            properties: {
              productId: {
                type: 'string',
                enum: [...products.map((p) => p.id), 'text'],
              },
            },
            required: ['productId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input: unknown) => {
            const id = (input as { productId?: string })?.productId;
            if (!id || ![...products.map((p) => p.id), 'text'].includes(id))
              throw new Error('Unknown catalog piece');
            flushSync(() => actions.current.add(id));
            return { added: true, productId: id };
          },
        },
        { signal: life.signal },
      );
    } catch {}
    return () => life.abort();
  }, []);
  const shown = products.filter(
    (p) =>
      (tab === 'text'
        ? p.category === 'Text'
        : category
          ? p.category === category
          : p.category !== 'Text') &&
      (p.name + ' ' + p.detail).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main>
      <header className="topbar">
        <a className="logo" href="/">
          offcut<span>✳</span>
        </a>
        <div className="header-right">
          <span className="session">
            <span />{' '}
            {library.identity?.email
              ? library.identity.email
              : library.kind === 'supabase'
                ? 'Saving as you go'
                : library.kind === 'indexeddb'
                  ? 'Saving in this browser'
                  : 'A little space for your taste'}
          </span>
          <button
            className="header-button"
            title="Save this collage"
            onClick={save}
          >
            <Save size={16} /> Save
          </button>
          <button
            className="header-button"
            title="Start a new collage; this one stays in your library"
            onClick={() => {
              library.startNewCreation();
              commit([]);
              setSelected(null);
              announce('A blank sheet. The last one is kept.');
            }}
          >
            <FilePlus size={16} /> New
          </button>
          <button className="export" onClick={download}>
            Export collage <ArrowUpRight size={17} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <ResizablePanelGroup orientation="horizontal" className="studio-panels">
          <ResizablePanel id="canvas-panel" defaultSize="64%" minSize="35%">
            <section className="worktable">
              <div className="canvas-area" ref={area}>
                <div className="board-row">
                  <div
                    className="board-tools"
                    aria-label="History, layer order and delete"
                  >
                    <button
                      aria-label="Undo"
                      title="Undo"
                      disabled={!history.length}
                      onClick={undo}
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      aria-label="Redo"
                      title="Redo"
                      disabled={!future.length}
                      onClick={redo}
                    >
                      <Redo2 size={18} />
                    </button>
                    <span />
                    <button
                      aria-label="Send to back"
                      title="Send to back"
                      disabled={!current}
                      onClick={toBack}
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      aria-label="Bring to front"
                      title="Bring to front"
                      disabled={!current}
                      onClick={toFront}
                    >
                      <ArrowUp size={18} />
                    </button>
                    <span />
                    <button
                      className="tool-delete"
                      aria-label="Delete"
                      title="Delete"
                      disabled={!current}
                      onClick={remove}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <ContextMenu
                    open={menuOpen}
                    onOpenChange={(o) => setMenuOpen(o && !!current)}
                  >
                    <ContextMenuTrigger
                      className="board-wrap"
                      style={{
                        width: BOARD_W * scale,
                        height: BOARD_H * scale,
                      }}
                    >
                      <div
                        ref={canvas}
                        className="board"
                        style={{
                          background: '#ffffff',
                          transform: `scale(${scale})`,
                        }}
                        onPointerDown={(e) => {
                          if (e.target === e.currentTarget) setSelected(null);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData('product');
                          if (products.some((p) => p.id === id)) add(id);
                          const objectId = e.dataTransfer.getData('object');
                          const o = library.objects.find(
                            (x) => x.id === objectId,
                          );
                          if (o) addObject(o);
                        }}
                      >
                        {pieces.map((p) => (
                          <div
                            key={p.id}
                            tabIndex={0}
                            role="button"
                            aria-label={p.text || pieceName(p, library.objects)}
                            className={
                              'piece ' + (selected === p.id ? 'selected' : '')
                            }
                            style={{
                              left: p.x,
                              top: p.y,
                              width: p.w,
                              height: p.h,
                              transform: `rotate(${p.r}deg)`,
                            }}
                            onFocus={() => setSelected(p.id)}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setSelected(p.id);
                              if (e.button !== 0) return;
                              try {
                                e.currentTarget.setPointerCapture(e.pointerId);
                              } catch {}
                              if (e.pointerType === 'touch') {
                                touches.current.set(e.pointerId, {
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                                const pts = [...touches.current.values()];
                                if (pts.length === 2) {
                                  // Second finger: switch from moving to pinching.
                                  drag.current = null;
                                  pinch.current = {
                                    id: p.id,
                                    dist: Math.hypot(
                                      pts[1].x - pts[0].x,
                                      pts[1].y - pts[0].y,
                                    ),
                                    angle: Math.atan2(
                                      pts[1].y - pts[0].y,
                                      pts[1].x - pts[0].x,
                                    ),
                                    w: p.w,
                                    h: p.h,
                                    r: p.r,
                                    cx: p.x + p.w / 2,
                                    cy: p.y + p.h / 2,
                                  };
                                  return;
                                }
                              }
                              setHistory((h) => [...h, pieces]);
                              setFuture([]);
                              drag.current = {
                                id: p.id,
                                x: e.clientX,
                                y: e.clientY,
                                ox: p.x,
                                oy: p.y,
                              };
                            }}
                            onPointerMove={(e) => {
                              if (touches.current.has(e.pointerId))
                                touches.current.set(e.pointerId, {
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              const z = pinch.current;
                              if (z?.id === p.id && touches.current.size >= 2) {
                                const pts = [...touches.current.values()];
                                const dist = Math.hypot(
                                  pts[1].x - pts[0].x,
                                  pts[1].y - pts[0].y,
                                );
                                const angle = Math.atan2(
                                  pts[1].y - pts[0].y,
                                  pts[1].x - pts[0].x,
                                );
                                const r = Math.round(
                                  z.r + ((angle - z.angle) * 180) / Math.PI,
                                );
                                setPieces((ps) =>
                                  ps.map((x) =>
                                    x.id === p.id
                                      ? {
                                          ...scaled(
                                            x,
                                            z.w,
                                            z.h,
                                            z.cx,
                                            z.cy,
                                            dist / z.dist,
                                          ),
                                          r:
                                            ((((r + 180) % 360) + 360) % 360) -
                                            180,
                                        }
                                      : x,
                                  ),
                                );
                                return;
                              }
                              const d = drag.current;
                              if (d?.id === p.id)
                                setPieces((ps) =>
                                  ps.map((x) =>
                                    x.id === p.id
                                      ? {
                                          ...x,
                                          x: Math.max(
                                            0,
                                            Math.min(
                                              BOARD_W - x.w,
                                              d.ox +
                                                (e.clientX - d.x) *
                                                  boardScale(),
                                            ),
                                          ),
                                          y: Math.max(
                                            0,
                                            Math.min(
                                              BOARD_H - x.h,
                                              d.oy +
                                                (e.clientY - d.y) *
                                                  boardScale(),
                                            ),
                                          ),
                                        }
                                      : x,
                                  ),
                                );
                            }}
                            onPointerUp={(e) => {
                              touches.current.delete(e.pointerId);
                              drag.current = null;
                              if (touches.current.size < 2)
                                pinch.current = null;
                            }}
                            onPointerCancel={(e) => {
                              touches.current.delete(e.pointerId);
                              drag.current = null;
                              if (touches.current.size < 2)
                                pinch.current = null;
                            }}
                            onKeyDown={(e) => {
                              const dx =
                                  e.key === 'ArrowRight'
                                    ? 5
                                    : e.key === 'ArrowLeft'
                                      ? -5
                                      : 0,
                                dy =
                                  e.key === 'ArrowDown'
                                    ? 5
                                    : e.key === 'ArrowUp'
                                      ? -5
                                      : 0;
                              if (dx || dy) {
                                e.preventDefault();
                                patch({
                                  x: Math.max(
                                    0,
                                    Math.min(BOARD_W - p.w, p.x + dx),
                                  ),
                                  y: Math.max(
                                    0,
                                    Math.min(BOARD_H - p.h, p.y + dy),
                                  ),
                                });
                              }
                            }}
                          >
                            {p.text ? (
                              <span
                                className="collage-text"
                                style={{
                                  font: textMetrics(p).font,
                                  color: textMetrics(p).color,
                                  lineHeight: `${textMetrics(p).lineHeight}px`,
                                  background: textMetrics(p).background,
                                }}
                              >
                                {p.text}
                              </span>
                            ) : (
                              <img draggable={false} src={imageSrc(p)} alt="" />
                            )}
                          </div>
                        ))}
                        {current &&
                          !current.text && (
                            // Handles live above every piece, so a covered corner is
                            // still reachable. The box itself lets clicks through.
                            <div
                              className="selection-box"
                              style={{
                                left: current.x,
                                top: current.y,
                                width: current.w,
                                height: current.h,
                                transform: `rotate(${current.r}deg)`,
                              }}
                            >
                              {(['tl', 'tr', 'bl', 'br'] as const).map(
                                (corner) => (
                                  <i
                                    key={corner}
                                    className={'handle ' + corner}
                                    role="presentation"
                                    onPointerDown={(e) => {
                                      // A handle scales; the piece underneath must not move.
                                      e.stopPropagation();
                                      try {
                                        e.currentTarget.setPointerCapture(
                                          e.pointerId,
                                        );
                                      } catch {}
                                      const cx = current.x + current.w / 2;
                                      const cy = current.y + current.h / 2;
                                      const pt = boardPoint(e);
                                      setHistory((h) => [...h, pieces]);
                                      setFuture([]);
                                      setGesture('resize');
                                      resize.current = {
                                        id: current.id,
                                        dist:
                                          Math.hypot(pt.x - cx, pt.y - cy) || 1,
                                        w: current.w,
                                        h: current.h,
                                        cx,
                                        cy,
                                      };
                                    }}
                                    onPointerMove={(e) => {
                                      const rz = resize.current;
                                      if (rz?.id !== current.id) return;
                                      const pt = boardPoint(e);
                                      const k =
                                        Math.hypot(pt.x - rz.cx, pt.y - rz.cy) /
                                        rz.dist;
                                      setPieces((ps) =>
                                        ps.map((x) =>
                                          x.id === current.id
                                            ? scaled(
                                                x,
                                                rz.w,
                                                rz.h,
                                                rz.cx,
                                                rz.cy,
                                                k,
                                              )
                                            : x,
                                        ),
                                      );
                                    }}
                                    onPointerUp={() => {
                                      resize.current = null;
                                      setGesture(null);
                                    }}
                                    onPointerCancel={() => {
                                      resize.current = null;
                                      setGesture(null);
                                    }}
                                  />
                                ),
                              )}
                              <i
                                className="rotor"
                                role="presentation"
                                title="Drag to rotate; hold Shift for 15° steps"
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  try {
                                    e.currentTarget.setPointerCapture(
                                      e.pointerId,
                                    );
                                  } catch {}
                                  setHistory((h) => [...h, pieces]);
                                  setFuture([]);
                                  setGesture('rotate');
                                  rotate.current = {
                                    id: current.id,
                                    cx: current.x + current.w / 2,
                                    cy: current.y + current.h / 2,
                                  };
                                }}
                                onPointerMove={(e) => {
                                  const rt = rotate.current;
                                  if (rt?.id !== current.id) return;
                                  const r = angleTo(
                                    rt.cx,
                                    rt.cy,
                                    boardPoint(e),
                                    e.shiftKey,
                                  );
                                  setPieces((ps) =>
                                    ps.map((x) =>
                                      x.id === current.id ? { ...x, r } : x,
                                    ),
                                  );
                                }}
                                onPointerUp={() => {
                                  rotate.current = null;
                                  setGesture(null);
                                }}
                                onPointerCancel={() => {
                                  rotate.current = null;
                                  setGesture(null);
                                }}
                              />
                              {gesture && (
                                <span className="readout">
                                  {gesture === 'resize'
                                    ? `${Math.round(current.w)} × ${Math.round(current.h)}`
                                    : `${current.r}°`}
                                </span>
                              )}
                            </div>
                          )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {current?.text !== undefined && (
                        <ContextMenuItem onClick={() => setEditingText(true)}>
                          <Type /> Edit text…
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem onClick={duplicate}>
                        <Copy /> Duplicate
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={toFront}>
                        <ArrowUp /> Bring to front
                      </ContextMenuItem>
                      <ContextMenuItem onClick={toBack}>
                        <ArrowDown /> Send to back
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={!current || current.r === 0}
                        onClick={() => patch({ r: 0 })}
                      >
                        <RotateCcw /> Straighten
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem variant="destructive" onClick={remove}>
                        <Trash2 /> Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              </div>
            </section>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="studio-divider"
            aria-label="Resize canvas and catalog"
          />
          <ResizablePanel
            id="catalog-panel"
            defaultSize="36%"
            minSize="250px"
            maxSize="60%"
          >
            <aside className="library">
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList className="library-tabs" variant="line">
                  <TabsTrigger value="pieces">The edit</TabsTrigger>
                  <TabsTrigger value="text">Typography</TabsTrigger>
                  <TabsTrigger value="clipped">
                    Clipped
                    {library.objects.length > 0 && (
                      <span className="tab-count">
                        {library.objects.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {tab === 'clipped' ? (
                <ClippedLibrary
                  objects={library.objects}
                  usage={library.usage}
                  src={library.src}
                  query={query}
                  onQuery={setQuery}
                  onAdd={addObject}
                  announce={announce}
                  onRemove={(o) => {
                    // Take it off the canvas only once it is really gone, so
                    // a refused removal does not empty the collage.
                    library
                      .remove(o)
                      .then(() => {
                        if (pieces.some((p) => p.object === o.id))
                          commit(pieces.filter((p) => p.object !== o.id));
                        announce('Removed from your library.');
                      })
                      .catch((e: unknown) =>
                        announce(
                          e instanceof Error
                            ? e.message
                            : 'Could not remove that.',
                          4000,
                        ),
                      );
                  }}
                />
              ) : (
                <>
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder="Find your next favorite"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>⌕</kbd>
                  </label>
                  {tab !== 'text' &&
                    categoryGroups.map((g) => (
                      <div className="filter-group" key={g.title}>
                        <span className="eyebrow">{g.title}</span>
                        <div className="filters">
                          {g.items.map((c) => (
                            <button
                              key={c.name}
                              onClick={() =>
                                setCategory(category === c.name ? '' : c.name)
                              }
                              className={category === c.name ? 'active' : ''}
                              aria-pressed={category === c.name}
                            >
                              <span className="filter-image">
                                <img src={c.picture} alt="" />
                              </span>
                              <span>{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  <div className="catalog-heading">
                    <span>
                      {query
                        ? 'SEARCH RESULTS'
                        : category
                          ? category.toUpperCase()
                          : 'THE SCRAPBOOK EDIT'}
                    </span>
                    <span>{shown.length} pieces</span>
                  </div>
                  <div className="products">
                    {shown.map((p, i) => (
                      <button
                        className="product"
                        key={p.id}
                        onClick={() => add(p.id)}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData('product', p.id)
                        }
                      >
                        <div className={'product-image tone-' + i}>
                          {p.text ? (
                            <span className={'type-sample ' + p.style}>
                              {p.text}
                            </span>
                          ) : (
                            <img
                              src={'/pieces/' + p.id + '.png'}
                              alt={p.name}
                            />
                          )}
                          <span className="add">
                            <Plus size={15} />
                          </span>
                        </div>
                        <strong>{p.name}</strong>
                        <small>{p.detail}</small>
                      </button>
                    ))}
                  </div>
                  {!shown.length && (
                    <p className="empty">
                      {category && !query
                        ? `Nothing in ${category.toLowerCase()} yet. Clip a piece from the web to add one.`
                        : 'No pieces found. Try a different search.'}
                    </p>
                  )}
                </>
              )}
              <div className="library-footer">
                <Move size={15} /> Click or drag a piece onto your canvas.
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <Dialog open={editingText} onOpenChange={setEditingText}>
        <DialogContent className="text-dialog">
          <DialogTitle>Edit text</DialogTitle>
          <DialogDescription>
            Line breaks are kept. Resize the piece on the board to fit.
          </DialogDescription>
          <textarea
            rows={4}
            value={current?.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={account !== 'closed'}
        onOpenChange={(open) => !open && setAccount('closed')}
      >
        <DialogContent className="account-dialog">
          <DialogTitle>
            {account === 'claim' ? 'Keep your library' : 'Sign in'}
          </DialogTitle>
          <DialogDescription>
            {account === 'claim'
              ? 'This collage is saved. Add your email and everything you clip and make stays yours on any device, not just this browser.'
              : 'We will email you a link. Click it and your library appears here.'}
          </DialogDescription>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              sendEmail();
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="account-actions">
              <button type="submit" className="export" disabled={sending}>
                <Mail size={15} />{' '}
                {account === 'claim' ? 'Send me a link' : 'Email me a link'}
              </button>
              <button
                type="button"
                className="header-button"
                onClick={() => setAccount('closed')}
              >
                Not now
              </button>
            </div>
            <small>
              {account === 'claim' ? (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={() => setAccount('signin')}>
                    Sign in instead
                  </button>
                </>
              ) : (
                <>
                  New here?{' '}
                  <button type="button" onClick={() => setAccount('claim')}>
                    Keep this library with an email
                  </button>
                </>
              )}
            </small>
          </form>
        </DialogContent>
      </Dialog>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </main>
  );
}

function pieceName(p: Piece, objects: ClipObject[]): string | undefined {
  return p.object
    ? objects.find((o) => o.id === p.object)?.title
    : products.find((x) => x.id === p.product)?.name;
}

/** The clipper explainer. It lives with the clips it makes, in that tab. */
function ClipperPopover({ announce }: { announce: (s: string) => void }) {
  // React refuses javascript: hrefs; the bookmarklet is one by design. It is
  // for dragging to the bookmarks bar, so a click in the studio is a no-op.
  function bookmarklet(a: HTMLAnchorElement | null) {
    if (!a) return;
    a.setAttribute(
      'href',
      bookmarkletFor(location.origin, import.meta.env.DEV),
    );
    const swallow = (e: Event) => e.preventDefault();
    a.addEventListener('click', swallow);
    return () => a.removeEventListener('click', swallow);
  }
  return (
    <Popover>
      <PopoverTrigger className="header-button clipper-button">
        <Scissors size={16} /> Clip from the web
      </PopoverTrigger>
      <PopoverContent align="start" className="clipper-popover">
        <PopoverTitle>The clipper</PopoverTitle>
        <p>
          The clipper is a bookmark whose address is a bit of code. On any
          product page, click it, hover over a photo, and click: the object
          lands in your library with its brand, price and retailer.
        </p>
        <ol>
          <li>
            Show your bookmarks bar: <kbd>⌘⇧B</kbd> on a Mac, <kbd>Ctrl⇧B</kbd>{' '}
            elsewhere.
          </li>
          <li>Drag this button onto that bar:</li>
        </ol>
        <a
          ref={bookmarklet}
          href="#clipper"
          className="bookmarklet"
          draggable
          title="Drag me to your bookmarks bar"
        >
          <Scissors size={15} /> Clip to Offcut
        </a>
        <p className="clipper-alt">
          Can’t drag it? Copy the code, make a new bookmark by hand (right-click
          the bookmarks bar → Add page), and paste the code as its address.
        </p>
        <button
          className="header-button"
          onClick={() => {
            navigator.clipboard
              .writeText(bookmarkletFor(location.origin, import.meta.env.DEV))
              .then(() =>
                announce('Copied. Paste it as a new bookmark’s address.'),
              )
              .catch(() =>
                announce('Could not copy. Drag the button instead.'),
              );
          }}
        >
          <Copy size={15} /> Copy the clipper code
        </button>
        <small>
          Photos on a plain backdrop are cut out automatically. Sites with a
          strict content policy can block bookmarklets; a browser extension is
          the next step for those.
        </small>
      </PopoverContent>
    </Popover>
  );
}

function ClippedLibrary({
  objects,
  usage,
  src,
  query,
  onQuery,
  onAdd,
  onRemove,
  announce,
}: {
  objects: ClipObject[];
  usage: Record<string, number>;
  src: (o: ClipObject) => string | undefined;
  query: string;
  onQuery: (q: string) => void;
  onAdd: (o: ClipObject) => void;
  onRemove: (o: ClipObject) => void;
  announce: (s: string) => void;
}) {
  const shown = objects.filter((o) =>
    [
      o.title,
      o.brand,
      o.category,
      o.source.retailer,
      ...Object.values(o.attributes),
    ]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const used = objects.reduce((n, o) => n + (usage[o.id] || 0), 0);
  return (
    <>
      <div className="clip-start">
        <ClipperPopover announce={announce} />
      </div>
      <label className="search">
        <Search size={17} />
        <input
          placeholder="Search what you clipped"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <kbd>⌕</kbd>
      </label>
      <div className="catalog-heading clipped-heading">
        <span>{query ? 'SEARCH RESULTS' : 'YOUR CLIPS'}</span>
        <span>
          {shown.length} objects · used {used} {used === 1 ? 'time' : 'times'}
        </span>
      </div>
      {objects.length === 0 ? (
        <div className="clipped-empty">
          <Scissors />
          <h2>Nothing clipped yet.</h2>
          <p>
            Use <strong>Clip from the web</strong> above to lift a dress, a lamp
            or a chair off any product page. It arrives here as an object you
            can drop on the canvas.
          </p>
        </div>
      ) : (
        <div className="products">
          {shown.map((o) => {
            const n = usage[o.id] || 0;
            const meta = [o.brand, formatPrice(o)].filter(Boolean).join(' · ');
            return (
              <div className="product clip-card" key={o.id}>
                <button
                  className="product-image"
                  onClick={() => onAdd(o)}
                  title={`Add “${o.title}” to the canvas`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('object', o.id)}
                >
                  <img src={src(o)} alt={o.title} />
                  <span className="add">
                    <Plus size={15} />
                  </span>
                  {o.cutout.status !== 'done' && (
                    <span
                      className="clip-flag"
                      title={
                        o.cutout.status === 'skipped'
                          ? o.cutout.reason
                          : undefined
                      }
                    >
                      photo
                    </span>
                  )}
                </button>
                <strong>{o.title}</strong>
                <small>{meta || o.category || o.source.retailer}</small>
                <small className="usage">
                  {n
                    ? `Used in ${n} ${n === 1 ? 'creation' : 'creations'}`
                    : 'Not used yet'}
                </small>
                <span className="clip-actions">
                  <a
                    href={o.source.canonicalUrl ?? o.source.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`Open at ${o.source.retailer ?? o.source.host}`}
                  >
                    <ExternalLink size={13} />{' '}
                    {o.source.retailer ?? o.source.host}
                  </a>
                  <button
                    aria-label={`Remove ${o.title} from your library`}
                    title="Remove from your library"
                    onClick={() => onRemove(o)}
                  >
                    <X size={13} />
                  </button>
                </span>
              </div>
            );
          })}
          {!shown.length && (
            <p className="empty">No clips match. Try a different search.</p>
          )}
        </div>
      )}
    </>
  );
}
