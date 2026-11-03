// The demo's sample data is one meeting on Thu 29 Oct 2026 at 2pm (Singapore time), so the page's clock is held on
// that day: every visit opens an hour before the meeting, and countdowns and "next meeting" never drift. Time still
// runs from there, so timers tick normally.
const DEMO_NOW = Date.parse("2026-10-29T13:00:00+08:00");
const RealDate = Date;
const offset = DEMO_NOW - RealDate.now();

class DemoDate extends RealDate {
  constructor(...args: [] | [string | number | Date] | [number, number, number?, number?, number?, number?, number?]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [number, number]));
  }
  static now() {
    return RealDate.now() + offset;
  }
}

globalThis.Date = DemoDate as DateConstructor;
