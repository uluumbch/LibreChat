import type {
  ApprovalChoice,
  ChatStreamEvent,
  HermesRunApprovalRequest,
  HermesRunApprovalResponded,
  HermesRunCompleted,
  HermesRunFailed,
  HermesRunMessageDelta,
  HermesRunReasoning,
  HermesRunToolEvent,
  HermesUsageTokens,
  MessageContentPart,
  NormalizedUsage,
  ReasoningPart,
  TextPart,
  ToolStepPart,
} from '@hermes/shared';
import { ChatStreamEventType, ContentPartType, HermesRunEvent } from '@hermes/shared';
import type { RawSseEvent } from './parse';

const APPROVAL_CHOICES: readonly ApprovalChoice[] = ['once', 'session', 'always', 'deny'];

function mapUsage(usage: HermesUsageTokens): NormalizedUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

function normalizeChoices(raw: string[] | undefined, allowPermanent: boolean): ApprovalChoice[] {
  const source = raw && raw.length > 0 ? raw : APPROVAL_CHOICES;
  const choices = source.filter((c): c is ApprovalChoice =>
    (APPROVAL_CHOICES as readonly string[]).includes(c),
  );
  const filtered = allowPermanent ? choices : choices.filter((c) => c !== 'always');
  return filtered.length > 0 ? filtered : ['once', 'deny'];
}

/**
 * Consumes the Runs API SSE stream (data-only frames whose type is the JSON `event` field),
 * emits our normalized client events — including approval gates and reasoning — and assembles the
 * assistant message `content[]` (interleaved reasoning, text, and tool steps) for persistence.
 */
export class RunsAccumulator {
  private readonly parts: MessageContentPart[] = [];
  private currentText: TextPart | null = null;
  private currentReasoning: ReasoningPart | null = null;
  private readonly toolIndexByName = new Map<string, number>();
  private visibleText = '';
  usage: NormalizedUsage | undefined;
  finishReason = 'stop';
  errored = false;
  errorMessage: string | undefined;
  /** True once a run.completed / run.failed / run.cancelled frame arrives. */
  done = false;

  handle(raw: RawSseEvent): ChatStreamEvent[] {
    const data = this.parse<{ event?: string }>(raw.data);
    if (!data?.event) {
      return [];
    }
    switch (data.event) {
      case HermesRunEvent.MessageDelta:
        return this.onDelta(data as HermesRunMessageDelta);
      case HermesRunEvent.Reasoning:
        return this.onReasoning(data as HermesRunReasoning);
      case HermesRunEvent.ToolStarted:
        return this.onToolStarted(data as HermesRunToolEvent);
      case HermesRunEvent.ToolCompleted:
        return this.onToolCompleted(data as HermesRunToolEvent);
      case HermesRunEvent.ApprovalRequest:
        return this.onApproval(data as HermesRunApprovalRequest);
      case HermesRunEvent.ApprovalResponded:
        return this.onApprovalResponded(data as HermesRunApprovalResponded);
      case HermesRunEvent.RunCompleted:
        return this.onCompleted(data as HermesRunCompleted);
      case HermesRunEvent.RunFailed:
        return this.onFailed(data as HermesRunFailed);
      case HermesRunEvent.RunCancelled:
        this.done = true;
        this.finishReason = 'aborted';
        return [];
      default:
        return [];
    }
  }

  private onDelta(data: HermesRunMessageDelta): ChatStreamEvent[] {
    if (!data.delta) {
      return [];
    }
    this.appendText(data.delta);
    return [{ type: ChatStreamEventType.Delta, text: data.delta }];
  }

  private onReasoning(data: HermesRunReasoning): ChatStreamEvent[] {
    if (!data.text) {
      return [];
    }
    this.appendReasoning(data.text);
    return [{ type: ChatStreamEventType.Reasoning, text: data.text }];
  }

  private onToolStarted(data: HermesRunToolEvent): ChatStreamEvent[] {
    if (!data.tool) {
      return [];
    }
    this.finalizeOpenParts();
    const part: ToolStepPart = {
      type: ContentPartType.ToolStep,
      toolName: data.tool,
      status: 'running',
      label: data.tool,
      preview: data.preview,
    };
    this.toolIndexByName.set(data.tool, this.parts.push(part) - 1);
    return [
      {
        type: ChatStreamEventType.ToolStep,
        toolName: data.tool,
        status: 'running',
        label: data.tool,
        preview: data.preview,
      },
    ];
  }

  private onToolCompleted(data: HermesRunToolEvent): ChatStreamEvent[] {
    if (!data.tool) {
      return [];
    }
    const status = data.error ? 'error' : 'completed';
    const durationMs =
      typeof data.duration === 'number' ? Math.round(data.duration * 1000) : undefined;
    const index = this.toolIndexByName.get(data.tool);
    if (index !== undefined) {
      const part = this.parts[index];
      if (part && part.type === ContentPartType.ToolStep) {
        part.status = status;
        part.durationMs = durationMs;
      }
    }
    return [
      {
        type: ChatStreamEventType.ToolStep,
        toolName: data.tool,
        status,
        label: data.tool,
        durationMs,
      },
    ];
  }

  private onApproval(data: HermesRunApprovalRequest): ChatStreamEvent[] {
    const allowPermanent = data.allow_permanent !== false;
    return [
      {
        type: ChatStreamEventType.Approval,
        runId: data.run_id,
        command: data.command ?? '',
        description: data.description,
        choices: normalizeChoices(data.choices, allowPermanent),
        allowPermanent,
      },
    ];
  }

  private onApprovalResponded(data: HermesRunApprovalResponded): ChatStreamEvent[] {
    const choice = (APPROVAL_CHOICES as readonly string[]).includes(data.choice)
      ? (data.choice as ApprovalChoice)
      : 'once';
    return [{ type: ChatStreamEventType.ApprovalResolved, runId: data.run_id, choice }];
  }

  private onCompleted(data: HermesRunCompleted): ChatStreamEvent[] {
    this.done = true;
    if (data.usage) {
      this.usage = mapUsage(data.usage);
    }
    // Fallback: if nothing streamed but a final output exists, surface it once.
    if (data.output && this.visibleText.length === 0) {
      this.appendText(data.output);
      return [{ type: ChatStreamEventType.Delta, text: data.output }];
    }
    return [];
  }

  private onFailed(data: HermesRunFailed): ChatStreamEvent[] {
    this.done = true;
    this.errored = true;
    this.finishReason = 'error';
    this.errorMessage = data.error ?? 'Agent run failed';
    return [{ type: ChatStreamEventType.Error, message: this.errorMessage, code: 'hermes_run_failed' }];
  }

  contentParts(): MessageContentPart[] {
    return this.parts.filter(
      (part) =>
        !(
          (part.type === ContentPartType.Text || part.type === ContentPartType.Reasoning) &&
          part.text.length === 0
        ),
    );
  }

  finalText(): string {
    return this.visibleText;
  }

  private appendText(text: string): void {
    this.currentReasoning = null;
    if (!this.currentText) {
      this.currentText = { type: ContentPartType.Text, text: '' };
      this.parts.push(this.currentText);
    }
    this.currentText.text += text;
    this.visibleText += text;
  }

  private appendReasoning(text: string): void {
    this.currentText = null;
    if (!this.currentReasoning) {
      this.currentReasoning = { type: ContentPartType.Reasoning, text: '' };
      this.parts.push(this.currentReasoning);
    }
    this.currentReasoning.text += text;
  }

  private finalizeOpenParts(): void {
    this.currentText = null;
    this.currentReasoning = null;
  }

  private parse<T>(data: string): T | null {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
}
