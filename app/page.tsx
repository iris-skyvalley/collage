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
  MousePointer2,
  Type,
  Trash2,
  Copy,
  Layers,
  ArrowUp,
  ArrowDown,
  Minus,
  RotateCcw,
  Check,
  Move,
  Sparkles,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { products, initial, textMetrics, type Piece } from './collage';
export default function Home() {
  const [pieces, setPieces] = useState<Piece[]>(initial),
    [selected, setSelected] = useState<string | null>(null),
    [category, setCategory] = useState('All pieces'),
    [query, setQuery] = useState(''),
    [title, setTitle] = useState('The art of getting dressed'),
    [zoom, setZoom] = useState(85),
    [notice, setNotice] = useState(''),
    [history, setHistory] = useState<Piece[][]>([]),
    [future, setFuture] = useState<Piece[][]>([]),
    [tab, setTab] = useState('pieces');
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const current = pieces.find((p) => p.id === selected);
  function commit(next: Piece[]) {
    setHistory((h) => [...h, pieces]);
    setFuture([]);
    setPieces(next);
  }
  function patch(v: Partial<Piece>) {
    commit(pieces.map((p) => (p.id === selected ? { ...p, ...v } : p)));
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
  function announce(s: string) {
    setNotice(s);
    setTimeout(() => setNotice(''), 2600);
  }
  async function download() {
    try {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 1400;
      const ctx = c.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 600, 700);
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
          const img = new Image();
          img.src = '/pieces/' + p.product + '.png';
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
  const actions = useRef({ add });
  actions.current = { add };
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
        ? p.category === 'Typography'
        : p.category !== 'Typography' &&
          (category === 'All pieces' || p.category === category)) &&
      (p.name + ' ' + p.detail).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main>
      <header className="topbar">
        <a className="logo" href="/">
          muse<span>✳</span>
        </a>
        <span className="studio-label">THE COLLAGE STUDIO</span>
        <div className="header-right">
          <span className="session">
            <span /> A little space for your taste
          </span>
          <button className="export" onClick={download}>
            Export collage <ArrowUpRight size={17} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="library">
          <div className="library-head">
            <div className="eyebrow">YOUR NEXT GREAT LOOK</div>
            <h1>It starts with a piece.</h1>
            <p>Find something you love. Make it yours.</p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="library-tabs" variant="line">
              <TabsTrigger value="pieces">The edit</TabsTrigger>
              <TabsTrigger value="text">Typography</TabsTrigger>
            </TabsList>
          </Tabs>
          {
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
              <div className={tab === 'text' ? 'filters hidden' : 'filters'}>
                {[
                  'All pieces',
                  'Clothing',
                  'Magazine',
                  'Objects',
                  'Bags',
                  'Shoes',
                  'Accessories',
                ].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={category === c ? 'active' : ''}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="catalog-heading">
                <span>{query ? 'SEARCH RESULTS' : 'THE SCRAPBOOK EDIT'}</span>
                <span>{shown.length} pieces</span>
              </div>
              <div className="products">
                {shown.map((p, i) => (
                  <button
                    className="product"
                    key={p.id}
                    onClick={() => add(p.id)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('product', p.id)}
                  >
                    <div className={'product-image tone-' + i}>
                      {p.text ? (
                        <span className={'type-sample ' + p.style}>
                          {p.text}
                        </span>
                      ) : (
                        <img src={'/pieces/' + p.id + '.png'} alt={p.name} />
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
                  No pieces found. Try a different search.
                </p>
              )}
            </>
          }
          <div className="library-footer">
            <Move size={15} /> Click or drag a piece onto your canvas.
          </div>
        </aside>
        <section className="worktable">
          <div className="documentbar">
            <div>
              <input
                aria-label="Collage title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span>
                Personal collage <span className="dot">·</span> {pieces.length}{' '}
                elements
              </span>
            </div>
            <div className="history">
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
            </div>
          </div>
          <div className="canvas-area">
            <div className="toolrail">
              <button
                className={!current?.text ? 'chosen' : ''}
                title="Select and move"
                aria-label="Select and move"
                onClick={() => setSelected(null)}
              >
                <MousePointer2 size={19} />
              </button>
              <button
                title="Add text"
                aria-label="Add text"
                onClick={() => add('text')}
              >
                <Type size={21} />
              </button>
              <span />
              <button
                title="Duplicate selection"
                aria-label="Duplicate selection"
                disabled={!current}
                onClick={() => {
                  if (current) {
                    const n = {
                      ...current,
                      id: crypto.randomUUID(),
                      x: current.x + 20,
                      y: current.y + 20,
                    };
                    commit([...pieces, n]);
                    setSelected(n.id);
                  }
                }}
              >
                <Copy size={18} />
              </button>
              <button
                title="Delete selection"
                aria-label="Delete selection"
                disabled={!current}
                onClick={() => {
                  commit(pieces.filter((p) => p.id !== selected));
                  setSelected(null);
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <div
              className="board-wrap"
              style={{ width: (600 * zoom) / 100, height: (700 * zoom) / 100 }}
            >
              <div
                ref={canvas}
                className="board"
                style={{ background: '#ffffff', transform: `scale(${zoom / 100})` }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setSelected(null);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('product');
                  if (products.some((p) => p.id === id)) add(id);
                }}
              >
                {pieces.map((p) => (
                  <div
                    key={p.id}
                    tabIndex={0}
                    role="button"
                    aria-label={
                      p.text || products.find((x) => x.id === p.product)?.name
                    }
                    className={'piece ' + (selected === p.id ? 'selected' : '')}
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
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setSelected(p.id);
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
                                      600 - x.w,
                                      d.ox +
                                        ((e.clientX - d.x) * 600) /
                                          (canvas.current?.getBoundingClientRect()
                                            .width || 600),
                                    ),
                                  ),
                                  y: Math.max(
                                    0,
                                    Math.min(
                                      700 - x.h,
                                      d.oy +
                                        ((e.clientY - d.y) * 600) /
                                          (canvas.current?.getBoundingClientRect()
                                            .width || 600),
                                    ),
                                  ),
                                }
                              : x,
                          ),
                        );
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
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
                          x: Math.max(0, Math.min(600 - p.w, p.x + dx)),
                          y: Math.max(0, Math.min(700 - p.h, p.y + dy)),
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
                      <img
                        draggable={false}
                        src={'/pieces/' + p.product + '.png'}
                        alt=""
                      />
                    )}
                    {selected === p.id && (
                      <>
                        <i className="handle tl" />
                        <i className="handle tr" />
                        <i className="handle bl" />
                        <i className="handle br" />
                      </>
                    )}
                  </div>
                ))}
                {pieces.length === 0 && (
                  <div className="blank">
                    <Sparkles />
                    <h2>A fresh point of view.</h2>
                    <p>Add your first piece from the edit.</p>
                  </div>
                )}
              </div>
            </div>
            <span className="canvas-caption">
              NO RULES. JUST YOUR POINT OF VIEW.
            </span>
          </div>
          <footer className="canvas-footer">
            <span>
              <span className="page-icon" /> Portrait · 1200 × 1400
            </span>
            <div>
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(40, z - 10))}
              >
                <Minus size={16} />
              </button>
              <span>{zoom}%</span>
              <button
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(110, z + 10))}
              >
                <Plus size={16} />
              </button>
              <button className="fit" onClick={() => setZoom(85)}>
                Fit
              </button>
            </div>
          </footer>
        </section>
        <aside className="inspector">
          <div className="inspector-title">
            <Layers size={17} />
            <h2>{current ? 'Make it yours' : 'The details'}</h2>
          </div>
          {current ? (
            <>
              <div className="selection-preview">
                {current.text ? (
                  <Type size={40} />
                ) : (
                  <img
                    src={'/pieces/' + current.product + '.png'}
                    alt="Selected piece"
                  />
                )}
              </div>
              <h3>
                {current.text
                  ? 'Your typography'
                  : products.find((p) => p.id === current.product)?.name}
              </h3>
              {current.text && (
                <label className="field">
                  Text
                  <textarea
                    rows={3}
                    value={current.text}
                    onChange={(e) => patch({ text: e.target.value })}
                  />
                </label>
              )}
              <label className="range-label">
                Size <span>{Math.round(current.w)} px</span>
              </label>
              <Slider
                aria-label="Piece size"
                value={[current.w]}
                min={60}
                max={600}
                onValueChange={(v) => {
                  const w = Array.isArray(v) ? v[0] : v;
                  patch({ w, h: (current.h * w) / current.w });
                }}
              />
              <label className="range-label">
                Rotation <span>{current.r}°</span>
              </label>
              <Slider
                aria-label="Piece rotation"
                value={[current.r]}
                min={-180}
                max={180}
                onValueChange={(v) => patch({ r: Array.isArray(v) ? v[0] : v })}
              />
              <div className="layer-buttons">
                <button
                  onClick={() =>
                    commit([
                      current,
                      ...pieces.filter((p) => p.id !== selected),
                    ])
                  }
                >
                  <ArrowDown size={15} /> To back
                </button>
                <button
                  onClick={() =>
                    commit([
                      ...pieces.filter((p) => p.id !== selected),
                      current,
                    ])
                  }
                >
                  <ArrowUp size={15} /> To front
                </button>
              </div>
              <button className="reset" onClick={() => patch({ r: 0 })}>
                <RotateCcw size={15} /> Reset rotation
              </button>
            </>
          ) : (
            <div className="selection-hint">
              <MousePointer2 size={25} />
              <p>
                Select a piece to give it
                <br />
                your personal touch.
              </p>
            </div>
          )}
          <div className="layers">
            <div className="eyebrow">
              ON YOUR CANVAS <span>{pieces.length}</span>
            </div>
            {[...pieces].reverse().map((p) => (
              <button
                key={p.id}
                className={selected === p.id ? 'active' : ''}
                onClick={() => setSelected(p.id)}
              >
                {p.text ? (
                  <Type size={22} />
                ) : (
                  <img src={'/pieces/' + p.product + '.png'} alt="" />
                )}
                <span>
                  {p.text || products.find((x) => x.id === p.product)?.name}
                </span>
              </button>
            ))}
          </div>
          <div className="studio-note">
            A good outfit is a feeling.
            <br />
            <em>Follow yours.</em>
            <span>muse ✳</span>
          </div>
        </aside>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </main>
  );
}
