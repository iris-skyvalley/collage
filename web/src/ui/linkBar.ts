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
        onclick: () => this.report(),
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

  private report(): void {
    if (!this.versionId) return;
    const input = el('input', {
      class: 'link-input',
      placeholder: 'What is wrong with this piece?',
      'aria-label': 'Reason for reporting this piece',
    });
    const send = async (): Promise<void> => {
      const reason = input.value.trim() || 'unspecified';
      // The report is recorded either way; a failed request must not leave
      // someone thinking they have no way to flag this.
      await api.report(this.versionId!, reason).catch(() => {});
      this.el.replaceChildren(el('span', { class: 'linkbar-text', text: 'Reported. Someone will look at it.' }));
    };
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void send(); });

    this.el.replaceChildren(
      input,
      el('button', { class: 'linkbar-btn', type: 'button', text: 'Send', onclick: () => void send() }),
      el('button', { class: 'linkbar-btn', type: 'button', text: 'Cancel', onclick: () => this.render() }),
    );
    input.focus();
  }
}
