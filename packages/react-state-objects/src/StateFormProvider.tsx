import {FC, JSX, ReactNode, useReducer} from "react";
import {bindElementToForm, FormState, StateForm, StateFormConfig, StateObjectConstructor} from "state-objects";

import {getFormFieldPaths, StateFormContext, useFormView} from "./react-state-form";
import {useStateObject, useObjectValue} from "./react-state-object";
import {useFastMemo} from "./util";

export type StateFormConfigOf<F, T> = F extends StateForm<unknown, infer C> ? C : StateFormConfig<T>;

export type StateFormProps<T, F extends StateForm<any, any>> = StateFormConfigOf<F, T> & {
    form?: StateObjectConstructor<F>;
}

export type StateFormProviderProps<T, F extends StateForm<T, any> = StateForm<T>> = StateFormConfigOf<F, T> & {
    form?: StateObjectConstructor<F>;
    children: ReactNode;
}

export const useStateForm = <T, F extends StateForm<T, any> = StateForm<T, StateFormConfig<T>>>(props: StateFormProps<T, F>): F => {
    return useStateObject<F, any>(props.form ?? (StateForm as StateObjectConstructor<F>), props) as F;
}

interface StateFormProviderType {
    <T, F extends StateForm<T> = StateForm<T>>(props: StateFormProviderProps<T, F>): JSX.Element;

    WithForm<T = any, F extends StateForm<T> = StateForm<T>>(props: StateFormProviderProps<T, F>): JSX.Element;
}

export const StateFormProvider: StateFormProviderType = function <T, F extends StateForm<T, any> = StateForm<T, any>>(props: StateFormProviderProps<T, F>) {
    const object = useStateObject<F, any>(props.form ?? (StateForm as StateObjectConstructor<F>), props);

    return <StateFormContext.Provider value={object}>{props.children}</StateFormContext.Provider>;
};

StateFormProvider.WithForm = function <T = any, F extends StateForm<T, any> = StateForm<T, any>>(props: StateFormProviderProps<T, F>) {
    return <StateFormProvider<T, F> {...props}>
        <Form>
            {props.children}
        </Form>
    </StateFormProvider>;
};

export const Form = ({children}: { children: ReactNode }) => {
    const form = useFormView();

    return <form onReset={(e) => {
        e.preventDefault();
        form.reset();
    }} onSubmit={(e) => {
        e.preventDefault();
        // noinspection JSIgnoredPromiseFromCall
        form.submit();
    }}>{children}</form>
}

export interface UseFormFieldPropsResult {
    ref: (element: any) => void
}

const FORM_FIELD_REDUCER = (x: UseFormFieldPropsResult) => x;

const FORM_FIELD_INIT = (form: FormState): UseFormFieldPropsResult => {
    const subscription = {current: null as ((() => void) | null)};

    const ref = (element: any) => {
        subscription.current?.();
        subscription.current = element ? bindElementToForm(form, element) : null;
    }

    return {
        ref,
    }
}

export const useFormFieldProps = (): UseFormFieldPropsResult => {
    return useReducer(FORM_FIELD_REDUCER, useFormView(), FORM_FIELD_INIT)[0];
};

export interface FormFieldProps {
    children: FC<UseFormFieldPropsResult>;
}

export const FormField = ({children}: FormFieldProps) => {
    return children(useFormFieldProps());
}

export interface FormErrorProps {
    name: any,
    children: FC<{ error: string }>
}

export const FormError = ({name, children}: FormErrorProps) => {
    const form = useFormView();
    const [, errorPath, touchedPath] = useFastMemo(getFormFieldPaths, [name]);
    const [error] = useObjectValue(form, errorPath);
    const [touched] = useObjectValue(form, touchedPath);

    return typeof error === 'string' && touched ? children({error}) : null;
}
