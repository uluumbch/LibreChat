import type {
  ChatStreamEvent,
  HermesAssistantCompletedData,
  HermesAssistantDeltaData,
  HermesRunCompletedData,
  HermesToolEventData,
  HermesUsageTokens,
  MessageContentPart,
  NormalizedUsage,
  TextPart,
  ToolStepPart,
} from '@hermes/shared';
import { ChatStreamEventType, ContentPartType, HermesStreamEvent } from '@hermes/shared';
import type { RawSseEvent } from './parse';

function mapUsage(usage: HermesUsageTokens): NormalizedUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

/**
 * Consumes raw Hermes session-stream events, emits our normalized events for the client, and
 * incrementally assembles the assistant message `content[]` (interleaved text + tool steps) so the
 * server can persist it once the turn completes.
 */
export class TurnAccumulator {
  private readonly parts: MessageContentPart[] = [];
  private currentText: TextPart | null = null;
  private readonly toolIndexByName = new Map<string, number>();
  private visibleText = '';
  usage: NormalizedUsage | undefined;

  handle(raw: RawSseEvent): ChatStreamEvent[] {
    switch (raw.event) {
      case HermesStreamEvent.AssistantDelta: {
        const data = this.parse<HermesAssistantDeltaData>(raw.data);
        if (!data?.delta) {
          return [];
        }
        this.appendText(data.delta);
        return [{ type: ChatStreamEventType.Delta, text: data.delta }];
      }
      case HermesStreamEvent.ToolStarted: {
        const data = this.parse<HermesToolEventData>(raw.data);
        if (!data) {
          return [];
        }
        this.finalizeText();
        const part: ToolStepPart = {
          type: ContentPartType.ToolStep,
          toolName: data.tool_name,
          status: 'running',
          label: data.tool_name,
          preview: data.preview,
        };
        this.toolIndexByName.set(data.tool_name, this.parts.push(part) - 1);
        return [
          {
            type: ChatStreamEventType.ToolStep,
            toolName: data.tool_name,
            status: 'running',
            label: data.tool_name,
            preview: data.preview,
          },
        ];
      }
      case HermesStreamEvent.ToolCompleted: {
        const data = this.parse<HermesToolEventData>(raw.data);
        if (!data) {
          return [];
        }
        const index = this.toolIndexByName.get(data.tool_name);
        if (index !== undefined) {
          const part = this.parts[index];
          if (part && part.type === ContentPartType.ToolStep) {
            part.status = 'completed';
          }
        }
        return [
          {
            type: ChatStreamEventType.ToolStep,
            toolName: data.tool_name,
            status: 'completed',
            label: data.tool_name,
            preview: data.preview,
          },
        ];
      }
      case HermesStreamEvent.AssistantCompleted: {
        const data = this.parse<HermesAssistantCompletedData>(raw.data);
        // If the agent produced no streamed deltas but a final content blob, surface it once.
        if (data?.content && this.visibleText.length === 0) {
          this.appendText(data.content);
          return [{ type: ChatStreamEventType.Delta, text: data.content }];
        }
        return [];
      }
      case HermesStreamEvent.RunCompleted: {
        const data = this.parse<HermesRunCompletedData>(raw.data);
        if (data?.usage) {
          this.usage = mapUsage(data.usage);
        }
        return [];
      }
      default:
        return [];
    }
  }

  contentParts(): MessageContentPart[] {
    return this.parts.filter(
      (part) => !(part.type === ContentPartType.Text && part.text.length === 0),
    );
  }

  finalText(): string {
    return this.visibleText;
  }

  private appendText(text: string): void {
    if (!this.currentText) {
      this.currentText = { type: ContentPartType.Text, text: '' };
      this.parts.push(this.currentText);
    }
    this.currentText.text += text;
    this.visibleText += text;
  }

  private finalizeText(): void {
    this.currentText = null;
  }

  private parse<T>(data: string): T | null {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
}
