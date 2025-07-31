import {toPath} from 'lodash';
import {createContext, SetStateAction, useCallback, useContext} from "react";
import {FormState, StateObject} from "state-objects";

import {useObjectValue} from "./react-state-object";
import {useFastMemo} from "./util";

export const StateFormContext = createContext<FormState>(null as unknown as FormState);

export const useFormView = <T, F extends FormState<T> = FormState<T>>() => {
    return useContext(StateFormContext) as F;
};

export const useFormState = <T, F extends FormState<T> = FormState<T>>() => {
    return useObjectValue<F>(useContext(StateFormContext), "")[0];
};

export const getFormFieldPaths = (path: any): [value: string[], error: string[], touched: string[]] => {
    const asArray = toPath(path);

    return [["values", ...asArray], ["errors", ...asArray], ["touched", ...asArray]];
};

export interface UseFormFieldResult<T = any> {
    value: T;
    setValue: (newValue: T) => void;
    error: unknown;
    setError: (newValue: unknown) => void;
    touched: boolean;
    setTouched: (newValue: boolean) => void
}

export const useFormField = <T = any>(name: any): UseFormFieldResult<T> => {
    const form = useFormView();
    if (!form) throw new Error("Can't use a state form field outside of a state form");

    const [valuePath, errorPath, touchedPath] = useFastMemo(getFormFieldPaths, [name]);

    // TODO this could potentially be reduced to a single state using some manual subscriptions.
    const [value, setValue] = useObjectValue<T>(form, valuePath);
    const [error, setError] = useObjectValue(form, errorPath);
    const [touched, setTouchedRaw] = useObjectValue(form, touchedPath);

    const setTouched = useCallback((touched: SetStateAction<boolean>) => {
        if (typeof touched === 'function') {
            setTouchedRaw((prevTouched: any) => touched(!!prevTouched) ? true : undefined);
        } else {
            setTouchedRaw(touched ? true : undefined);
        }
    }, [setTouchedRaw]);

    return {
        value,
        setValue,
        error,
        setError,
        touched: !!touched,
        setTouched,
    };
};