// ============================================================
// @sparkmind/analytics — Lightweight event tracking
// Stub now → CF Analytics Engine integration later
// ============================================================

export interface AnalyticsEvent {
  event: string
  userId?: string
  props?: Record<string, any>
  ts?: number
}

export class Analytics {
  private events: AnalyticsEvent[] = []
  constructor(private opts: { enabled?: boolean } = {}) {}

  track(event: string, props: Record<string, any> = {}, userId?: string) {
    if (this.opts.enabled === false) return
    this.events.push({ event, userId, props, ts: Date.now() })
    // TODO: write to CF Analytics Engine binding when configured
  }

  drain(): AnalyticsEvent[] {
    const out = this.events.slice()
    this.events.length = 0
    return out
  }
}

export const analytics = new Analytics({ enabled: true })
