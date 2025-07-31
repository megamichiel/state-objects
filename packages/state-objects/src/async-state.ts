import {StateObject} from "./state-object";

export interface AsyncState<T> {
    isLoading: boolean;
    value: T;
    error?: any;

    reload: (options?: AsyncStateReloadOptions) => Promise<void>;
}

export interface AsyncStateContext<T, A extends unknown[]> {
    args: A;
    load: (...args: A) => Promise<T>;
    defaultValue: T;
}

export type AsyncStateReloadOptions = boolean | {
    showLoadingState?: boolean;
}

export class AsyncStateObject<T, A extends unknown[]> extends StateObject<AsyncStateContext<T, A>> implements AsyncState<T> {

    isLoading: boolean = true;
    value: T;
    error?: any = null;

    private _loadId = 0;

    constructor(context: AsyncStateContext<T, A>) {
        super(context);
        this.value = context.defaultValue ?? (null as T);
    }

    reload(options?: AsyncStateReloadOptions) {
        const showLoadingState = typeof options === 'boolean' ? options : options?.showLoadingState ?? true;

        if (showLoadingState) {
            this.isLoading = true;
        }

        // Keep a unique load ID. If reload() is called multiple times in succession, only the latest value is used.
        const loadId = ++this._loadId;

        return this.context.load(...this.context.args).then(result => {
            if (loadId === this._loadId) {
                this.patch([], {
                    isLoading: false,
                    value: result,
                    error: null,
                });
            }
        }, err => {
            if (loadId === this._loadId) {
                this.patch([], {
                    isLoading: false,
                    value: this.context.defaultValue ?? (null as T),
                    error: err,
                });
            }
        });
    }
}
