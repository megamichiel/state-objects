import _, {clone, toPath} from "lodash";

import {getValueAtPath, notifyBranchChangeListeners, StateValueType} from './util';

export interface ObjectState {
    get<T = any>(path: any): T;

    set(path: any, value: any): boolean;

    patch(path: any, values: any): boolean;

    subscribe(path: any, listener: (...args: any) => void): () => void;

    notify(path: any, data?: any): void;
}

export type ObjectWithState<T> = T & ObjectState;

export type StateObjectConstructor<T extends StateObject> = new (...args: any[]) => T;

// Properties that shouldn't be replaced when creating a state object, on top of things start with "_".
const RESERVED_PROPS = new Set(["context", "constructor"]);

const createStateObjectValues = (object: any, types: Record<string, StateValueType>) => {
    const state: any = object;
    let keys = [];

    // Find properties in the object's prototype chain until we reach StateObject.
    for (let obj: any = object; ; obj = Object.getPrototypeOf(obj)) {
        const props = Object.getOwnPropertyNames(obj);

        if (props) keys.push(...props);

        if (obj === StateObject.prototype) break;
    }

    // Exclude reserved properties and properties that start with _.
    keys = _(keys).uniq().filter(key => !(RESERVED_PROPS.has(key) || (key.length && key[0] === '_'))).value();

    const values: any = {};
    const functions: Record<string, Function> = {};
    const objects: Record<string, StateObject> = {};

    for (const key of keys) {
        let value = state[key];
        const type = types[key];

        if (type) {
            switch (type) {
                case 'object':
                    objects[key] = value.value;
                    break;
                case 'function':
                    functions[key] = value.value;
                    break;
                default:
                    values[key] = value.value;
                    break;
            }
        } else {
            switch (typeof value) {
                case 'object':
                    if (value instanceof StateObject) {
                        objects[key] = value;
                    } else {
                        values[key] = value;
                    }
                    break;
                case 'function':
                    functions[key] = value
                    break;
                default:
                    values[key] = value;
                    break;
            }
        }
    }

    return {values, functions, objects};
};

export class StateObject<C = any> implements ObjectState {

    context: C;

    // TODO properly support `null` values as children
    private _children: Record<string, StateObject> = {};
    _state: any;

    /**
     * A tree of subscription listeners. Listeners of path [a] are stored at [a, __], listeners of [a, b, c] at [a, b, c, __] etc.
     *
     * Now just make sure nobody sets a value of __ and then we're fine. Totally fine.
     */
    private _subscriptions: any = {};

    constructor(context: C) {
        this.context = context;
    }

    _onCreate(types: Record<string, StateValueType>) {
        const {values, functions, objects} = createStateObjectValues(this, types);

        // Define functions for all keys in `functions`.
        for (const key in functions) {
            // Ensure the correct `this` value is used when calling the function.
            // TODO this doesn't support hot reloading. Not sure if that can even be fixed.
            (this as any)[key] = functions[key].bind(this);
        }

        // The state value is equal to the object, but is immutable.
        this._state = {
            ...this,
            ...values,
            _object: this,
        };

        // The state has no need for these properties.
        delete this._state.context;
        delete this._state._state;
        delete this._state._children;
        delete this._state._subscriptions;

        // Store the children of this object.
        this._children = objects;

        // Define dynamic properties that access `_state` for each value.
        for (const key in values) {
            const path = [key];

            Object.defineProperty(this, key, {
                get() {
                    return this._state[key];
                },
                set(newValue) {
                    const oldState = this._state;
                    // Don't need to do anything if the new value is equal to the old value.
                    if (newValue === oldState[key]) return;
                    const newState = clone(oldState);
                    newState[key] = newValue;
                    this._state = newState;
                    notifyBranchChangeListeners(this._subscriptions, path, 0, oldState, newState);
                },
                enumerable: true,
                configurable: true,
            });
        }

        // Subscribe to updates to the children, and then update our state.
        const thisObject: any = this;
        for (const key in objects) {
            const objectPath = [key];

            const subscriptionRef = {
                current: null as unknown as () => void,
                subscribe(child: any) {
                    // Listen for changes to the child, and notify this object.
                    this.current = child?.subscribe([], (newValue: any) => {
                        const oldState = thisObject._state;
                        const newState = clone(oldState);
                        newState[key] = newValue;
                        thisObject._state = newState;
                        notifyBranchChangeListeners(thisObject._subscriptions, objectPath, 0, oldState, newState);
                    });

                    const oldState = thisObject._state;
                    const newValue = child?._state ?? null;
                    // Don't need to notify if the new value is equal to the old value.
                    if (newValue === oldState[key]) return;

                    const newState = clone(oldState);
                    newState[key] = newValue;
                    thisObject._state = newState;

                    notifyBranchChangeListeners(thisObject._subscriptions, objectPath, 0, oldState, newState);
                }
            }

            // Define a dynamic property for this object which automatically re-subscribes when modified.
            Object.defineProperty(this, key, {
                get() {
                    return this._children[key];
                },
                set(newValue) {
                    // TODO Is this the right order? Or should we destroy first?
                    subscriptionRef.current?.();
                    this._children[key]?._onDestroy();
                    subscriptionRef.subscribe(this._children[key] = newValue);
                },
                enumerable: true,
                configurable: true,
            });

            subscriptionRef.subscribe(objects[key]);
        }
    }

    /**
     * Called when this object is destroyed.
     *
     * This is only called if the platform has some sort of destruction logic. For example, in React this would be
     *  when this object was created using hooks, and the source component unmounts.
     *
     * In unit tests this is not called (unless done manually), since there is no tracked lifetime of the object.
     */
    _onDestroy() {
        // Destroy children.
        const children = this._children;
        for (const key in children) {
            children[key]?._onDestroy();
        }
    }

    get<T = any>(path: any): T {
        if (typeof path !== "object") path = toPath(path);

        return getValueAtPath(this._state, path);
    }

    set(path: any, newValue: any, offset: number = 0): boolean {
        if (typeof path !== "object") path = toPath(path);

        const oldState = this._state;
        let newState: any;

        if (offset < path.length) {
            // If this path is in a child, let the child handle it.
            const child = this._children[path[offset]];
            if (child) return child.set(path, newValue, offset + 1);

            // Create a shallow copy of the state
            newState = clone(oldState);
            let branch: any = newState;
            let i = offset;

            // Create clones of branches until the parent of the target value
            for (; i + 1 < path.length; i++) {
                // Create a shallow copy of the next branch and then move into it
                branch = branch[path[i]] = clone(branch[path[i]]);

                // If there is no parent value, we can't set this value.
                if (branch == null) return false;
            }

            // If the new value exactly matches the old value, we don't need to update anything.
            if (newValue === branch[path[i]]) return false;

            // Is the new value undefined? Then delete.
            if (newValue === undefined) {
                delete branch[path[i]];
            } else {
                branch[path[i]] = newValue;
            }
        } else {
            newState = newValue;
        }

        this._state = newState;
        notifyBranchChangeListeners(this._subscriptions, path, offset, oldState, newState);
        return true;
    };

    patch(path: any, values: any, offset: number = 0): boolean {
        if (typeof path !== "object") path = toPath(path);

        // If this path is in a child, let the child handle it.
        const child = offset < path.length && this._children[path[offset]];
        if (child) return child.patch(path, values, offset + 1);

        // Create a shallow copy of the state
        const oldState = this._state;
        const newState = clone(oldState);
        let branch: any = newState;

        for (let i = offset; i < path.length; i++) {
            // Create a shallow copy of the next branch and then move into it.
            branch = branch[path[i]] = clone(branch[path[i]]);

            // If there is no value at `path` we can't do a patch.
            if (branch == null) return false;
        }

        // Apply the patch to the branch.
        Object.assign(branch, values);

        this._state = newState;
        notifyBranchChangeListeners(this._subscriptions, path, offset, oldState, newState);
        return true;
    };

    subscribe(path: any, listener: (...args: any) => void, offset: number = 0): () => void {
        // Make a copy of the path because we need it during unsubscription.
        path = toPath(path);

        // If this path is in a child, let the child handle it.
        const child = offset < path.length && this._children[path[offset]];
        if (child) return child.subscribe(path, listener, offset + 1);

        let parent = this._subscriptions;
        for (let i = offset; i < path.length; i++) {
            parent = parent[path[i]] ??= {};
        }
        const listeners = parent.__ ??= [];

        listeners.push(listener);

        return () => {
            const index = listeners.lastIndexOf(listener);
            if (index === -1) return;
            listeners.splice(index, 1);
            if (listeners.length === 0) {
                let branch = this._subscriptions;

                // Let's say the path is [a, b, c]
                // We need to check [root, root[a], root[a][b], root[a][b][c]] for single-child branches.

                // Single-child branches only point to `path`, so we need to find the longest subsequence
                //  at the end of the branch list that are single-child branches. We can delete the root
                //  of that subsequence since it only points to `path`.

                // To find the longest subsequence of single-child branches, we only have to store the last
                //  multi-child branch that we found, and the key at which the next branch is stored.

                // We know that we can at least delete [a, b, c, __], so we store the root as last multi-branch
                //  with the assumption that either all branches are single-child, or we find a branch with
                //  multiple children whose child that points to `path` we can then delete.

                const pathToDelete = [...path, "__"];

                let lastMultiBranch = branch;
                let lastMultiBranchKey = pathToDelete[offset];

                for (const item of pathToDelete) {
                    const isMultiBranch = Object.keys(branch).length > 1;

                    if (isMultiBranch) {
                        lastMultiBranch = branch;
                        lastMultiBranchKey = item;
                    }

                    branch = branch[item];
                }

                delete lastMultiBranch[lastMultiBranchKey];
            }
        };
    };

    notify(path: any, data?: any, offset: number = 0): void {
        if (typeof path !== "object") path = toPath(path);

        // If this path is in a child, let the child handle it.
        const child = offset < path.length && this._children[path[offset]];
        if (child) return child.notify(path, data, offset + 1);

        const listeners = getValueAtPath(this._subscriptions.event, path, offset)?.__;
        if (listeners) {
            for (const listener of listeners) {
                listener(data);
            }
        }
    }
}

export const createStateObject = <T extends StateObject<C>, C, CC extends C>(
    info: StateObjectConstructor<T>, context: CC = undefined as CC
): ObjectWithState<T> => {
    const object = new info(context);
    object._onCreate({});
    return object;
};

export interface StateObjectView<TSnapshot> {
    view: TSnapshot;
    state: TSnapshot,
    subscribe: (listener: (newState: TSnapshot, oldState: TSnapshot) => void) => (() => void);
    destroy: () => void;
}

export const createStateObjectView = <TView extends Record<any, any> = Record<any, any>>(
    object: StateObject,
    paths: Record<keyof TView, any>,
): StateObjectView<TView> => {
    const createState = (): TView => {
        const result: any = {};

        for (const key in paths) {
            result[key] = getValueAtPath(object, _.toPath(paths[key]));
        }

        return result;
    };

    const listeners: ((newView: TView, oldView: TView) => void)[] = [];
    const result = {
        state: createState(),
        subscribe: (listener: (newState: TView, oldState: TView) => void) => {
            listeners.push(listener);

            return () => {
                const index = listeners.lastIndexOf(listener);
                if (index === -1) return;
                listeners.splice(index, 1);
            }
        },
    } as StateObjectView<TView>;

    const view = {} as TView;

    for (const key in paths) {
        const path = toPath(paths[key]);

        Object.defineProperty(view, key, {
            get() {
                return result.state[key];
            },
            set(newValue: any) {
                object.set(path, newValue);
            },
            enumerable: true,
            configurable: true,
        });
    }

    result.view = view;

    const subscriptions: (() => void)[] = [];

    for (const key in paths) {
        subscriptions.push(object.subscribe(toPath(paths[key]), () => {
            const oldState = result.state;
            const newState = createState();
            result.state = newState;

            for (const listener of listeners) {
                listener(newState, oldState);
            }
        }));
    }

    result.destroy = () => {
        for (const subscription of subscriptions) {
            subscription();
        }
    }

    return result;
}
