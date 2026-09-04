type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null) node.append(c as Node | string);
  return node;
}

export const clear = (node: Element): void => { node.replaceChildren(); };

export function chips<T extends string>(
  options: { id: T; label: string }[],
  active: T,
  onPick: (id: T) => void,
): HTMLElement {
  return el('div', { class: 'chips', role: 'radiogroup' },
    options.map((o) => el('button', {
      class: `chip${o.id === active ? ' is-active' : ''}`,
      type: 'button',
      role: 'radio',
      'aria-checked': o.id === active,
      text: o.label,
      onclick: () => onPick(o.id),
    })));
}

export function slider(
  label: string,
  value: number,
  onInput: (v: number) => void,
  onCommit?: (v: number) => void,
  opts: { min?: number; max?: number; step?: number } = {},
): HTMLElement {
  const input = el('input', {
    type: 'range',
    min: opts.min ?? 0,
    max: opts.max ?? 1,
    step: opts.step ?? 0.01,
    value,
    'aria-label': label,
  });
  input.addEventListener('input', () => onInput(Number(input.value)));
  input.addEventListener('change', () => onCommit?.(Number(input.value)));
  return el('label', { class: 'slider' }, [el('span', { text: label }), input]);
}
