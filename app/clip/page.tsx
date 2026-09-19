'use client';
import { useEffect, useState } from 'react';
import { Scissors } from 'lucide-react';
import { receiveClip } from '@/hooks/use-library';
import { isClipPayload } from '@/lib/clip/ingest';
import { clipChannel, type ClipMessage } from '@/lib/clip/channel';

/**
 * Where a clip lands.
 *
 * The clipper opens this page rather than the studio, because the studio is a
 * canvas: opening one to catch a clip would show the last collage, save over
 * it from a second tab, and leave the maker with a window they did not ask
 * for. This page holds nothing. It takes the clip, puts it in the library,
 * tells whatever studio is open, and gets out of the way — by closing, or by
 * becoming the studio when there is none.
 */
export default function Clip() {
  const [state, setState] = useState<'waiting' | 'saving' | 'done' | 'failed'>(
    'waiting',
  );
  const [message, setMessage] = useState('Waiting for the clipper…');

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('clip');
    const opener = window.opener as Window | null;
    if (!token || !opener) {
      // Nothing sent us here; the studio is the only sensible place to be.
      location.replace('/');
      return;
    }
    const life = new AbortController();
    /** Hand over to the studio, or become it when none answers. */
    const leave = (channel: BroadcastChannel | null) => {
      if (!channel) return setTimeout(() => location.replace('/'), 900);
      let answered = false;
      channel.addEventListener('message', (e: MessageEvent<ClipMessage>) => {
        if (e.data?.type !== 'studio' || answered) return;
        answered = true;
        window.close();
      });
      channel.postMessage({ type: 'studio?' } satisfies ClipMessage);
      setTimeout(() => {
        if (answered) return;
        // A tab of our own, so the next clip does not take the studio away.
        window.name = 'offcut-studio';
        location.replace('/');
      }, 700);
    };

    window.addEventListener(
      'message',
      (e: MessageEvent) => {
        const d = e.data as { type?: string; token?: string } | null;
        if (d?.type !== 'offcut:clip' || !isClipPayload(d) || d.token !== token)
          return;
        life.abort();
        setState('saving');
        setMessage('Saving it to your library…');
        receiveClip(d)
          .then((o) => {
            setState('done');
            setMessage(`“${o.title}” is in your library.`);
            const channel = clipChannel();
            channel?.postMessage({
              type: 'clipped',
              id: o.id,
              title: o.title,
            } satisfies ClipMessage);
            leave(channel);
          })
          .catch((e: unknown) => {
            setState('failed');
            setMessage(
              e instanceof Error ? e.message : 'That clip could not be saved.',
            );
          });
      },
      { signal: life.signal },
    );
    opener.postMessage({ type: 'offcut:ready', token }, '*');
    return () => life.abort();
  }, []);

  return (
    <main className="catching">
      <p className="logo">
        offcut<span>✳</span>
      </p>
      <p
        className={
          state === 'failed' ? 'catching-note failed' : 'catching-note'
        }
      >
        <Scissors size={15} /> {message}
      </p>
      {state === 'failed' && (
        <a className="header-button" href="/">
          Open the studio
        </a>
      )}
    </main>
  );
}
