// Entry point of the demo build: set the demo's clock, start the in-page API, then the normal client.
await import("./clock");
await import("./boot");
await import("../client/main");
