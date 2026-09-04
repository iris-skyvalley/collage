/**
 * PRD §7.3 step 5 and §8.4 — "Claim (optional). After sending: 'sign in to see
 * who reacted.' Never before."
 *
 * So this renders nothing at all until something has actually been sent. The
 * account has one job, and the copy says exactly that job rather than asking
 * anyone to make an account to keep using the thing they just used.
 */
import { api, ApiError } from '../lib/api.ts';
import { el, clear } from './dom.ts';
import { track } from '../lib/metrics.ts';

export class ClaimPanel {
  readonly el: HTMLElement;
  private sent = false;
  private versionId: string | null = null;

  constructor() {
    this.el = el('section', { class: 'export-row', hidden: true });
  }

  /** Called only once a share or copy has happened. */
  offer(versionId: string | null): void {
    if (this.sent) return;
    this.versionId = versionId;
    this.el.hidden = false;
    this.render();
  }

  private render(): void {
    clear(this.el);
    if (this.sent) {
      this.el.append(
        el('h3', { text: 'Check your email' }),
        el('p', { class: 'hint', text: 'The link signs you in. No password, nothing to set up.' }),
      );
      return;
    }

    const input = el('input', {
      class: 'link-input',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      placeholder: 'you@example.com',
      'aria-label': 'Email address',
    });
    const status = el('p', { class: 'hint' });

    const submit = async (): Promise<void> => {
      const email = input.value.trim();
      if (!email) return;
      try {
        const res = await api.claim(email, this.versionId);
        this.sent = true;
        track('share', { action: 'claim_requested' }, this.versionId);
        this.render();
        // Without a mail provider configured the server hands back the link in
        // development, so the flow can be walked end to end.
        if (res.dev_link) {
          this.el.append(el('p', { class: 'hint' }, [
            el('a', { href: res.dev_link, text: 'Development: open the sign-in link' }),
          ]));
        }
      } catch (err) {
        status.textContent = err instanceof ApiError ? err.message : 'That did not send. Try again in a moment.';
      }
    };

    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void submit(); });

    this.el.append(
      el('h3', { text: 'Who reacted' }),
      el('p', { class: 'hint', text: 'Sign in and we will tell you when someone reacts to this. Your piece is already saved either way.' }),
      el('div', { class: 'row' }, [input, el('button', { class: 'pill', type: 'button', text: 'Send link', onclick: () => void submit() })]),
      status,
    );
  }
}
