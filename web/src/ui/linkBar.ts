/**
 * What a link arrival gets that a cold arrival does not: who sent it, a way to
 * react to it, and a way to report it.
 *
 * The report route is not optional decoration — PRD §10 requires "abuse
 * reporting on every shared URL", and a shared URL is exactly what this bar
 * appears on.
 */
import { api } from '../lib/api.ts';
import { el, clear } from './dom.ts';
import { track } from '../lib/metrics.ts';

export class LinkBar {
  readonly el: HTMLElement;
  private versionId: string | null = null;
  private reacted = false;

  constructor() {
    this.el = el('div', { class: 'linkbar', hidden: true });
  }

  show(versionId: string): void {
    this.versionId = versionId;
    this.el.hidden = false;
    this.render();
  }

  private render(): void {
    if (!this.versionId) return;
    clear(this.el);
    this.el.append(
      el('span', { class: 'linkbar-text', text: 'Someone sent you this. Change anything.' }),
      el('button', {
        class: `linkbar-btn${this.reacted ? ' is-active' : ''}`,
        type: 'button',
        text: this.reacted ? '♥ Sent' : '♡ React',
        onclick: () => void this.react(),
      }),
      el('button', {
        class: 'linkbar-btn linkbar-report',
        type: 'button',
        text: 'Report',
        onclick: () => void this.report(),
      }),
    );
  }

  private async react(): Promise<void> {
    if (this.reacted || !this.versionId) return;
    this.reacted = true;
    this.render();
    await api.react(this.versionId, 'like').catch(() => {});
    track('share', { action: 'reacted' }, this.versionId);
  }

  private async report(): Promise<void> {
    if (!this.versionId) return;
    const reason = prompt('What is wrong with this piece? A short note is enough.');
    if (reason === null) return;
    await api.report(this.versionId, reason).catch(() => {});
    this.el.replaceChildren(el('span', { class: 'linkbar-text', text: 'Reported. Thank you — someone will look at it.' }));
  }
}
