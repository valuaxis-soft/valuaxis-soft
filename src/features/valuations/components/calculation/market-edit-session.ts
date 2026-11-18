import type { ComparableDto, MarketCalculationDto, MarketSettingsDto } from "@/features/valuations/calculation/market-types";

/** How the session reaches the server: each call answers the market as it is stored after it. */
export type MarketEditTransport = {
  saveSettings: (settings: MarketSettingsDto) => Promise<MarketCalculationDto>;
  saveComparable: (comparable: ComparableDto) => Promise<MarketCalculationDto>;
};

type PendingChange = { comparableId: string; change: (comparable: ComparableDto) => ComparableDto };

/** The market as stored with what is still on its way on top: the settings asked last and each comparable's changes, in order. */
export function withPendingChanges(
  stored: MarketCalculationDto,
  settings: MarketSettingsDto | null,
  changes: ReadonlyArray<PendingChange>,
): MarketCalculationDto {
  if (!settings && !changes.length) return stored;
  return {
    ...stored,
    settings: settings ?? stored.settings,
    comparables: changes.length
      ? stored.comparables.map((comparable) => changes
        .filter((pending) => pending.comparableId === comparable.id)
        .reduce((current, pending) => pending.change(current), comparable))
      : stored.comparables,
  };
}

/**
 * The fields being typed after the settings they were read from changed
 * (an undo, the server's answer): a field the appraiser has not touched
 * since takes the new value; one being typed keeps what is typed.
 */
export function rebaseDraft<D extends Record<string, string>>(draft: D, from: D, to: D): D {
  const next = { ...draft };
  for (const key of Object.keys(to) as Array<keyof D>) {
    if (draft[key] === from[key]) next[key] = to[key];
  }
  return next;
}

/**
 * The edits of one market's panel (V7.2-11, -13 and -15): each change shows
 * at once and is sent after every change before it, one at a time, so a
 * second change made before the server answers the first builds on it
 * instead of on what the server answered last. Answers of the server show
 * what it stored with the changes still on their way on top; a change the
 * server rejects goes away and the rest stay.
 *
 * Settings travel whole: of several asked while one is on its way, only the
 * last is sent, and it carries the ones before. A comparable's change is a
 * function, applied again to what the server stores when its turn comes.
 */
export class MarketEditSession {
  private stored: MarketCalculationDto;
  private settings: MarketSettingsDto | null = null;
  private changes: PendingChange[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  view: MarketCalculationDto;

  constructor(initial: MarketCalculationDto, private readonly transport: MarketEditTransport, private readonly onError: (error: unknown) => void) {
    this.stored = initial;
    this.view = initial;
  }

  /** What the server stored last: the dictamen follows it. */
  get server(): MarketCalculationDto {
    return this.stored;
  }

  /** Something is still on its way to the server. */
  get busy(): boolean {
    return this.settings !== null || this.changes.length > 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish() {
    this.view = withPendingChanges(this.stored, this.settings, this.changes);
    for (const listener of this.listeners) listener();
  }

  private enqueue(task: () => Promise<boolean>): Promise<boolean> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The settings, whole, built on `view.settings`: shown now, stored after what is on its way. */
  setSettings(settings: MarketSettingsDto): Promise<boolean> {
    this.settings = settings;
    this.publish();
    return this.enqueue(async () => {
      const sent = this.settings;
      // A later turn of the queue already sent them: they carry this one.
      if (!sent) return true;
      try {
        this.stored = await this.transport.saveSettings(sent);
        return true;
      } catch (error) {
        this.onError(error);
        return false;
      } finally {
        if (this.settings === sent) this.settings = null;
        this.publish();
      }
    });
  }

  /** One comparable changed: shown now, and sent as the change applied to what the server stores when its turn comes. */
  changeComparable(comparableId: string, change: (comparable: ComparableDto) => ComparableDto): Promise<boolean> {
    const pending: PendingChange = { comparableId, change };
    this.changes = [...this.changes, pending];
    this.publish();
    return this.enqueue(async () => {
      try {
        const stored = this.stored.comparables.find((item) => item.id === comparableId);
        if (stored) this.stored = await this.transport.saveComparable(change(stored));
        return true;
      } catch (error) {
        this.onError(error);
        return false;
      } finally {
        this.changes = this.changes.filter((item) => item !== pending);
        this.publish();
      }
    });
  }

  /** Any other action that answers the market (add, delete, import a comparable…), in turn with the edits. */
  perform(action: () => Promise<MarketCalculationDto>): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        this.stored = await action();
        return true;
      } catch (error) {
        this.onError(error);
        return false;
      } finally {
        this.publish();
      }
    });
  }

  /** A change the server already stored that answers nothing (the review of a comparable). */
  patchStored(patch: (stored: MarketCalculationDto) => MarketCalculationDto) {
    this.stored = patch(this.stored);
    this.publish();
  }
}
