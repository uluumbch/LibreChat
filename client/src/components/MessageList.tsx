import { useEffect, useRef } from 'react';
import type { Message } from '@hermes/shared';
import { MessageItem } from '~/components/MessageItem';

export function MessageList({
  messages,
  isStreaming,
}: {
  messages: Message[];
  isStreaming: boolean;
}): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
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
