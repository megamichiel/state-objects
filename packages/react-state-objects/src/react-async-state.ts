import _ from "lodash";
import {useEffect, useRef} from "react";
import {AsyncState, AsyncStateObject, AsyncStateReloadOptions} from "state-objects";

import {useObjectState} from "./react-state-object";

export interface AsyncHookOptions<T> {
    defaultValue?: T;
    autoReload?: boolean;
    autoReloadOptions?: AsyncStateReloadOptions;
}

export const createAsyncHook = <T, A extends unknown[] = []>(
    load: (...args: A) => Promise<T>, options?: AsyncHookOptions<T>
): (...args: A) => AsyncState<T> => {
    return (...args: A) => {
        const state = useObjectState(AsyncStateObject, {
            load,
            defaultValue: options?.defaultValue as T,
            args,
        });

        if (options?.autoReload ?? true) {
            // Initial args is null so that a reload is triggered immediately.
            const knownArgs = useRef<any>(null);

            useEffect(() => {
                if (!_.isEqual(args, knownArgs.current)) {
                    knownArgs.current = args;
                    // noinspection JSIgnoredPromiseFromCall
                    state.reload(options?.autoReloadOptions);
                }

                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, args);
        }

        return state;
    };
}