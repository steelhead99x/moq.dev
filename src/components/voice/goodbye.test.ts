import { expect, test } from "bun:test";
import * as Json from "@moq/json";
import { Track } from "@moq/net";
import { Effect, Signal } from "@moq/signals";
import { endTranscript } from "./goodbye";

type Record = { type: string; seq?: number; epoch?: string };

async function read(track: Track.Producer): Promise<Record[]> {
	const consumer = new Json.Stream.Consumer<Record>({ track: track.subscribe() });
	const out: Record[] = [];
	for (;;) {
		const next = await consumer.next();
		if (next === undefined) break;
		out.push(next.value);
	}
	return out;
}

function track(): Track.Producer {
	return new Track.Producer("transcript.json.z").accept({ compress: true });
}

test("the goodbye finishes the group, so a later close still delivers it", async () => {
	const produced = track();
	const call = {
		messages: [] as Record[],
		epoch: "ab",
		producer: new Json.Stream.Producer<Record>({ track: produced }),
	};
	call.producer.append({ value: { type: "client-ready", seq: 0, epoch: "ab" } });
	call.messages.push({ type: "client-ready", seq: 0, epoch: "ab" });

	endTranscript(call, { type: "session-ending" });
	// The publisher's cleanup finishes again after unmount. That has to be a no-op.
	call.producer.finish();
	produced.close();

	expect(call.messages.map((message) => message.seq)).toEqual([0, 1]);
	expect(await read(produced)).toEqual([
		{ type: "client-ready", seq: 0, epoch: "ab" },
		{ type: "session-ending", seq: 1, epoch: "ab" },
	]);
});

test("a goodbye with no producer yet is only queued", () => {
	const call = { messages: [] as Record[], epoch: "ab" };
	endTranscript(call, { type: "session-ending" });
	expect(call.messages).toEqual([{ type: "session-ending", seq: 0, epoch: "ab" }]);
});

test("closing the broadcast before the group is finished drops the goodbye", async () => {
	const produced = track();
	const producer = new Json.Stream.Producer<Record>({ track: produced });
	producer.append({ value: { type: "session-ending" } });
	produced.close();
	await expect(read(produced)).rejects.toThrow("closed without finish");
});

test("the page's unmount order finishes the group before the broadcast closes", async () => {
	const enabled = new Signal(true);
	let produced!: Track.Producer;
	const broadcast = new Effect((effect) => {
		effect.get(enabled);
		const next = track();
		if (!produced) produced = next;
		effect.cleanup(() => next.close());
	});
	await new Promise((resolve) => setTimeout(resolve, 0));

	const call = {
		messages: [] as Record[],
		epoch: "ab",
		producer: undefined as Json.Stream.Producer<Record> | undefined,
	};
	const effects = new Effect();
	effects.run((effect) => {
		const producer = new Json.Stream.Producer<Record>({ track: produced });
		call.producer = producer;
		effect.cleanup(() => producer.finish());
	});
	await new Promise((resolve) => setTimeout(resolve, 0));

	endTranscript(call, { type: "session-ending" });
	enabled.set(false);
	effects.close();
	await new Promise((resolve) => setTimeout(resolve, 0));
	broadcast.close();

	expect(await read(produced)).toEqual([{ type: "session-ending", seq: 0, epoch: "ab" }]);
});
