import {isEqual, toPath} from "lodash";
import {DependencyList, EffectCallback, SetStateAction, useEffect, useRef, useState} from "react";
import {
    createStateObject,
    createStateObjectView,
    ObjectState,
    ObjectWithState,
    StateObject,
    StateObjectView,
} from "state-objects";

import {useFastMemo} from "./util";

export const useObjectValue = <T = any>(
    state: ObjectState,
    path: any,
): [T, (newValue: SetStateAction<T>) => void] => {
    let [value, setStateValue] = useState<T>(state.get<T>(path));
    // A manual useEffect() and useCallback() implementation,
    // 1. For slightly improved performance due to fewer function allocations (untested, may be negligible).
    // 2. So that `value` can be replaced if `path` changes, so the value is immediately updated if the path changes,
    //     rather than 1 render later.
    const dataRef = useRef<any>(undefined);
    let data = dataRef.current;

    // The caller may have passed an object state instead of a StateObject whose instance changes over time.
    // In that case, retrieve the underlying object so that we can use it for instance comparison,
    //  to only re-subscribe if the object has changed and not the state.
    const object: ObjectState = state instanceof StateObject ? state : ((state as any)._object ?? state);

    // data :: [object, path, subscribe-effect, subscribe-effect-deps, setter]
    if (data === undefined || object !== data[0] || !isEqual(path, data[1])) {
        const prevEffect = data?.[2];
        if (prevEffect) prevEffect()();

        const pathArray = toPath(path);
        const effect = () => object.subscribe(pathArray, setStateValue);
        const setValue = (newValue: any) => {
            if (typeof newValue === 'function') {
                object.set(pathArray, newValue(object.get(pathArray)));
            } else {
                object.set(pathArray, newValue);
            }
        };
        data = [object, path, effect, [], setValue];
        dataRef.current = data;
        value = object.get<T>(pathArray);
    }

    useEffect(data[2], data[3]);

    return [value, data[4]];
};

const createStateObjectData = <T extends StateObject<C>, C>(
    info: new (context: C) => T, context: C = undefined as C
): [object: StateObject<C> & ObjectWithState<T>, effect: EffectCallback, effectDeps: DependencyList] => {
    const object = createStateObject(info, context);
    const effect = () => {
        return () => {
            object._onDestroy();
        };
    };

    return [object, effect, []];
};

export const useStateObject = <T extends StateObject<unknown>, C>(
    info: new (context: C) => T, context: C = undefined as C
): T => {
    const [object, effect, effectDeps] = useFastMemo(createStateObjectData, [info, context as any], 1);

    // Keep the context up-to-date.
    object.context = context;

    useEffect(effect, effectDeps);

    return object as unknown as StateObject<C> & ObjectWithState<T>;
};

const createObjectStateData = (object: any, onChange: any): [EffectCallback, any[]] => {
    return [() => object.subscribe([], onChange), []];
};

export const useObjectState = <T extends StateObject<C>, C>(
    info: new (context: C) => T,
    context: C = undefined as C,
): T => {
    const object = useStateObject(info, context);
    const [state, setState] = useState(object._state);
    const [effect, deps] = useFastMemo(createObjectStateData, [object, setState]);

    useEffect(effect, deps);

    return state;
};

export const useStateObjectView = <TView extends Record<any, any> = Record<any, any>>(
    object: StateObject,
    paths: Record<keyof TView, any>,
): TView => {
    const view: StateObjectView<TView> = useFastMemo(createStateObjectView, [object, paths], 1);
    const [state, setState] = useState(view.state);

    useEffect(() => view.subscribe(setState), []);

    return state;
}