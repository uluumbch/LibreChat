import { useEffect, useRef, type RefObject } from 'react';
import type { Message } from '@hermes/shared';
import { MessageItem } from '~/components/MessageItem';

export function MessageList({
  messages,
  isStreaming,
  scrollRef,
}: {
  messages: Message[];
  isStreaming: boolean;
  scrollRef: RefObject<HTMLDivElement>;
}): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // following the bottom?

  // Update stickiness as the user scrolls; once they scroll up, stop following.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickRef.current = distance < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  // Follow new content only when parked at the bottom.
  useEffect(() => {
    if (stickRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  return (
    <div className="mx-auto w-full max-w-[768px] px-6 pb-10 pt-7">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} streaming={isStreaming} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
