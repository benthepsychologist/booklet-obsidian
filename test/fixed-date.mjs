/* Imported first by a test that must draw the same on any day: `new Date()` and `Date.now()` are 2026-10-29 12:00 UTC. */
process.env.TZ = "UTC";
const RealDate = Date;
const FIXED = new RealDate("2026-10-29T12:00:00Z").getTime();
globalThis.Date = class extends RealDate {
	constructor(...a) {
		if (a.length) super(...a);
		else super(FIXED);
	}
	static now() {
		return FIXED;
	}
};
