import _ from "lodash";

// TODO remove StateValueType, but I'm not sure if I want to keep some of this code yet.
export type StateValueType = 'value' | 'function' | 'object';

export class StateValueTypeHolder {

    value: any;
    type: StateValueType;

    constructor(value: any, type: StateValueType) {
        this.value = value;
        this.type = type;
    }
}

export const asStateValueType = <T, >(value: any, type: StateValueType): T => {
    return new StateValueTypeHolder(value, type) as T;
}

export const getValueAtPath = (value: any, path: any[], offset: number = 0) => {
    while (true) {
        // At the end of the path? Return the value.
        if (offset === path.length) return value;
        // No value present? Return `null`.
        if (!value) return null;
        // Otherwise, proceed.
        value = value[path[offset++]];
    }
}

export const notifyBranchChangeListeners = (
    subscriptions: any,
    path: any[],
    offset: number,
    oldRoot: any,
    newRoot: any,
) => {
    let branch = subscriptions;
    let oldBranchValue = oldRoot;
    let newBranchValue = newRoot;

    // First, trigger all listeners above this depth.
    for (let depth = offset; depth < path.length; depth++) {
        const listeners = branch.__;
        if (listeners) {
            // TODO if we remove an item from an array, then listeners will first notify the
            //   component that renders the array itself. Is there a guarantee that the array's children
            //   are unmounted immediately? Cause if not, the children will receive an `undefined` value,
            //   which is problematic for anything that subscribed to it.
            //  In my testing the children were unmounted immediately so that went well, but I don't know
            //  how reliable that is.

            // TODO what if listeners on this branch are modified while we're iterating over it? We may end up
            //  skipping some listeners or calling some listeners twice.
            for (const listener of listeners) {
                listener(newBranchValue, oldBranchValue);
            }
        }

        const key = path[depth];
        branch = branch[key];
        if (!branch) break;
        // TODO is `null` what we want here if the value doesn't exist?
        // TODO should we even notify those listeners then?
        newBranchValue = newBranchValue ? newBranchValue[key] ?? null : null;
        oldBranchValue = oldBranchValue ? oldBranchValue[key] ?? null : null;
    }

    // Keep track of branches to notify in a deque. Array.shift() re-structures the entire array which this skips.
    const queue: Record<number, [any, any, any]> = {
        0: [branch, oldBranchValue, newBranchValue],
    };
    let size = 1;

    for (let index = 0; index < size; index++) {
        const [branch, oldValue, newValue] = queue[index];
        delete queue[index];

        if (!branch) continue;

        for (const key in branch) {
            if (key === '__') {
                for (const listener of branch[key]) {
                    listener(newValue, oldValue);
                }
            } else {
                const prev = oldValue[key];
                const next = newValue[key];

                if (next === prev) continue;

                queue[size++] = [branch[key], prev, next];
            }
        }
    }
}

export const createAllTouched = (value: any) => {
    if (typeof value === "object" && value !== null) {
        const result: any = {};
        if (_.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                result[i] = createAllTouched(value[i]);
            }
        } else {
            for (const key in value) {
                result[key] = createAllTouched(value[key]);
            }
        }
        return result;
    }

    return true;
}

export const delay = async (duration: number, signal?: AbortSignal) => {
    return await new Promise(resolve => {
        const timeout = setTimeout(resolve, duration);

        signal?.addEventListener('abort', () => {
            window.clearTimeout(timeout);
        });
    });
};