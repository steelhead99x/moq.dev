// The publisher closes its broadcast on a microtask after the element disconnects.
// That close aborts a group that is still open, and the final record is lost. Finish
// the group here, before unmount, so the pool can drain it.

export interface TranscriptCall<T> {
	messages: T[];
	epoch: string;
	producer?: {
		append(record: { value: T }): void;
		finish(): void;
	};
}

/** Append the call's final record and finish its group before the publisher unmounts. */
export function endTranscript<T extends { seq?: number; epoch?: string }>(call: TranscriptCall<T>, message: T): void {
	const record = { ...message, seq: call.messages.length, epoch: call.epoch };
	call.messages.push(record);
	const producer = call.producer;
	if (!producer) return;
	producer.append({ value: record });
	producer.finish();
}
