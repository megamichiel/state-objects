export interface AsyncLock {
	lock: () => Promise<void>;
	unlock: () => void;
}

export const createAsyncLock = (): AsyncLock => {
	let isActive = false;
	const queue = [] as any[];

	return {
		lock: async () => {
			if (isActive) {
				await new Promise((resolve) => {
					queue.push(resolve);
				});
			} else {
				isActive = true;
			}
		},
		unlock: () => {
			if (isActive) {
				const next = queue.shift();
				if (next) {
					next();
				} else {
					isActive = false;
				}
			} else {
				throw new Error("Lock is not active");
			}
		}
	}
}