/**
 * PRD §10, Abuse — "Anonymous AI image generation is the exact exposure that
 * ended Shapes on Discord. In the first build, not later."
 *
 * What is enforced here without any external service:
 *   - user uploads never enter a generative verb (`assertNotGenerative`);
 *   - a takedown path exists and a taken-down version stops resolving;
 *   - every shared URL carries a report route.
 *
 * What needs a classifier is behind `inspectImage`, which is a seam, not a
 * pretence: with nothing configured it passes images through and says so, so
 * the gap is visible in the logs rather than hidden behind a stub that always
 * returns "safe".
 */
export interface ImageVerdict {
  allowed: boolean;
  reason?: string;
  /** False when no classifier is configured — the call was not actually checked. */
  checked: boolean;
}

export type ImageClassifier = (bytes: Buffer, mime: string) => Promise<ImageVerdict>;

let classifier: ImageClassifier | null = null;

export function setImageClassifier(fn: ImageClassifier | null): void {
  classifier = fn;
}

export function hasClassifier(): boolean {
  return classifier !== null;
}

export async function inspectImage(bytes: Buffer, mime: string): Promise<ImageVerdict> {
  if (!classifier) return { allowed: true, checked: false };
  try {
    return await classifier(bytes, mime);
  } catch (err) {
    // A failing classifier must fail closed: the whole point is the exposure.
    console.error('[moderation] classifier threw, rejecting', err);
    return { allowed: false, reason: 'moderation unavailable', checked: false };
  }
}

/** PRD §10 — "no user-uploaded faces into generative verbs". Enforced as the
 *  stronger and simpler rule: no user upload reaches a generative verb at all,
 *  because deciding whether an upload contains a face is exactly the judgement
 *  we cannot make reliably. */
export function assertNotGenerative(fragmentSource: string): void {
  if (fragmentSource === 'upload') {
    throw Object.assign(new Error('uploaded images cannot be sent to a generative verb'), { status: 422 });
  }
}

/** PRD §10 — "no likeness generation of real people". The tray is themed and
 *  prompt-free in v1, so this guards the seam rather than a live input. */
const LIKENESS = /\b(portrait|likeness|face|selfie|celebrit|president|actor|singer)\b/i;
export function assertNoLikeness(prompt: string): void {
  if (LIKENESS.test(prompt)) {
    throw Object.assign(new Error('generation of a person’s likeness is not supported'), { status: 422 });
  }
}
