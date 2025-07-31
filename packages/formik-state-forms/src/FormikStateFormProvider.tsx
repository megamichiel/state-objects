// noinspection JSIgnoredPromiseFromCall

import {
    FieldConfig,
    FieldHelperProps,
    FieldInputProps,
    FieldMetaProps,
    FieldValidator,
    FormikContextType,
    FormikErrors,
    FormikProvider,
    FormikState,
    FormikTouched
} from "formik";
import {assign, toPath} from "lodash";
import {FormEvent, JSX, SetStateAction, SyntheticEvent} from "react";
import {
    Form,
    StateFormContext,
    StateFormProps,
    StateFormProviderProps, useStateForm,
    useStateObject,
    useObjectValue
} from "react-state-objects";
import {FormState, StateForm, StateFormConfig, StateObjectConstructor} from "state-objects";

// TODO can we just import "[react-]state-objects/dist/util"? That was the initial completion but I haven't tried it.
import {getValueAtPath, useFastMemo} from "./util";

const createStateFormFormikFunctions = <T, >(form: StateForm<T>) => {
    const handleChangeEvent = (valuePath: any[], touchedPath: any[], element: any) => {
        let value = element.value;
        let isChangeEvent = false;

        switch (element.tagName) {
            case "INPUT":
                switch (element.type) {
                    case "checkbox":
                        value = element.checked;
                        isChangeEvent = true;
                        break;
                    case "color":
                    case "file":
                    case "radio":
                        isChangeEvent = true;
                        break;
                }
                break;
            case "SELECT":
                isChangeEvent = true;
                break;
        }

        form.set(valuePath, value);

        // React's onChange() is called on every input event, even for text inputs on every symbol.
        // For some slight optimization, we treat change events on text inputs
        //  as "input" events, and change events on non-text inputs as "change" events.
        // In handleBlurEvent() below we then perform "change" logic.
        if (isChangeEvent) {
            form.set(touchedPath, true);

            if (form.shouldValidateOnChange) {
                form.validate();
            }
        } else {
            if (form.shouldValidateOnInput) {
                form.validate();
            }
        }
    };

    const handleBlurEvent = (touchedPath: any[], element: any) => {
        // This code complements handleChangeEvent() above.
        // Since we consider most "change" events as "input" events for text-like inputs,
        //  we should also treat blur events as "change" events for those text inputs.
        let isAlsoChangeEvent = true;
        switch (element.tagName) {
            case "INPUT":
                switch (element.type) {
                    case "checkbox":
                    case "color":
                    case "file":
                    case "radio":
                        isAlsoChangeEvent = false;
                        break;
                }
                break;
            case "SELECT":
                isAlsoChangeEvent = false;
                break;
        }

        form.set(touchedPath, true);
        if (form.shouldValidateOnBlur || (isAlsoChangeEvent && form.shouldValidateOnChange)) {
            form.validate();
        }
    };

    // noinspection JSUnusedGlobalSymbols
    const functions = {
        async setValues(
            values: SetStateAction<T>,
            shouldValidate: boolean | undefined
        ): Promise<void | FormikErrors<T>> {
            if (typeof values === "function") {
                values = (values as Function)(form.values);
            }
            form.set("values", values);
            if (shouldValidate ?? true) {
                return await form.validate();
            }
        },
        setErrors(errors: FormikErrors<T>): void {
            form.set("errors", errors);
        },
        async setTouched(
            touched: FormikTouched<T>,
            shouldValidate: boolean | undefined
        ): Promise<void | FormikErrors<T>> {
            form.set("touched", touched);
            if (shouldValidate ?? true) {
                return await form.validate();
            }
        },
        setStatus(status: any): void {
            form.set("status", status);
        },
        setFormikState(
            state: FormikState<T> | ((prevState: FormikState<T>) => FormikState<T>),
            cb: (() => void) | undefined
        ): void {
            if (typeof state === "function") {
                const currentState: FormikState<T> = {
                    values: form.values,
                    errors: form.errors,
                    touched: form.touched,
                    isSubmitting: form.isSubmitting,
                    isValidating: form.isValidating,
                    submitCount: 0,
                };

                state = state(currentState);
            }

            form.patch([], {
                values: state.values,
                errors: state.errors,
                touched: state.touched,
                isSubmitting: state.isSubmitting,
                isValidating: state.isValidating,
            });

            cb?.();
        },
        resetForm(nextState: Partial<FormikState<T>> | undefined): void {
            if (nextState) {
                const state: any = assign({
                    values: form.context.initialValues,
                    errors: form.context.initialErrors ?? {},
                    touched: form.context.initialTouched ?? {},
                }, nextState);

                form.patch([], {
                    values: state.values,
                    errors: state.errors,
                    touched: state.touched,
                    isSubmitting: state.isSubmitting,
                    isValidating: state.isValidating,
                });
            } else {
                form.reset();
            }
        },
        // Handlers
        handleSubmit(e: FormEvent<HTMLFormElement> | undefined): void {
            e?.preventDefault();
            form.submit();
        },
        handleReset(e: SyntheticEvent<any> | undefined): void {
            e?.preventDefault();
            form.reset();
        },
        handleBlur: (e: any) => {
            if (typeof e === "string") {
                const touchedPath = ["touched", ...toPath(e)];
                return (e: any) => {
                    handleBlurEvent(touchedPath, e.target);
                }
            } else {
                const name = e.target.name;
                if (name) {
                    handleBlurEvent(["touched", ...toPath(name)], e);
                }
            }
        },
        handleChange: (e: any) => {
            if (typeof e === "string") {
                const valuePath = ["values", ...toPath(e)];
                const touchedPath = ["touched", ...toPath(e)];
                return (e: any) => {
                    handleChangeEvent(valuePath, touchedPath, e.target);
                }
            } else {
                const name = e.target.name;
                if (name) {
                    const path = toPath(name);
                    handleChangeEvent(["values", ...path], ["touched", ...path], e.target);
                }
            }
        },
        async setFieldValue(
            field: string,
            value: any,
            shouldValidate: boolean | undefined
        ): Promise<void | FormikErrors<T>> {
            form.set(["values", ...toPath(field)], value);
            if (shouldValidate ?? true) {
                return await form.validate();
            }
        },
        setFieldError(field: string, message: string | undefined): void {
            form.set(["errors", ...toPath(field)], message ?? undefined);
        },
        async setFieldTouched(
            field: string,
            isTouched: boolean | undefined,
            shouldValidate: boolean | undefined
        ): Promise<void | FormikErrors<T>> {
            form.set(["touched", ...toPath(field)], (isTouched ?? true) ? true : undefined);
            if (shouldValidate ?? true) {
                return await form.validate();
            }
        },
        getFieldHelpers<Value>(name: string): FieldHelperProps<Value> {
            return {
                setValue<Value>(
                    value: Value,
                    shouldValidate: boolean | undefined
                ): Promise<void | FormikErrors<Value>> {
                    return functions.setFieldValue(name, value, shouldValidate) as any;
                },
                setError(value: string | undefined): void {
                    return functions.setFieldError(name, value);
                },
                setTouched(
                    value: boolean,
                    shouldValidate: boolean | undefined
                ): Promise<void | FormikErrors<Value>> {
                    return functions.setFieldTouched(name, value, shouldValidate) as any;
                }
            };
        },
        getFieldMeta<Value>(name: string): FieldMetaProps<Value> {
            const path = toPath(name);
            const context = form.context;
            const initialError = getValueAtPath(context.initialErrors, path);
            const error = getValueAtPath(form.errors, path);

            return {
                initialValue: getValueAtPath(context.initialValues, path),
                initialError: typeof initialError === "string" ? initialError : undefined,
                initialTouched: getValueAtPath(context.initialTouched, path) ?? false,
                value: getValueAtPath(form.values, path),
                error: typeof error === "string" ? error : undefined,
                touched: getValueAtPath(form.touched, path) ?? false,
            };
        },
        getFieldProps<Value>(props: string | FieldConfig<Value>): FieldInputProps<Value> {
            if (typeof props === "string") {
                const value = form.get(["values", ...toPath(props)]);
                return {
                    name: props,
                    value,
                    checked: !!value,
                    onBlur: functions.handleBlur,
                    onChange: functions.handleChange,
                }
            } else {
                const name = props.name;
                const value = form.get(["values", ...toPath(name)]);
                return {
                    name,
                    value,
                    checked: !!value,
                    multiple: props.multiple,
                    onBlur: functions.handleBlur,
                    onChange: functions.handleChange,
                }
            }
        },
        submitForm(): Promise<any> {
            return form.submit();
        },
        setSubmitting(isSubmitting: boolean): void {
            form.isSubmitting = isSubmitting;
        },
        validate(values: T): void | object | Promise<FormikErrors<T>> {
            return form.doValidate(values, form);
        },
        validateForm(values: any): Promise<FormikErrors<T>> {
            if (values != null) {
                return form.validate() as any;
            } else {
                return form.doValidate(values, form) as any;
            }
        },
        validateField(_: string): Promise<void> | Promise<string | undefined> {
            return Promise.resolve(undefined);
        },
        registerField(_a: string, _b: { validate?: FieldValidator }): void {
        },
        unregisterField(_: string): void {
        },
    } as FormikContextType<T>;

    return functions;
};

const createStateFormFormikState = <T, >(state: FormState<T>, form: StateForm<T>, functions: any) => {
    return {
        initialErrors: form.context.initialErrors,
        initialStatus: (form.context as any).initialStatus,
        initialTouched: form.context.initialTouched,
        initialValues: form.context.initialValues,
        validationSchema: form.context.validationSchema,
        validateOnBlur: form.context.shouldValidateOnBlur,
        dirty: state.isDirty,
        errors: state.errors,
        isSubmitting: state.isSubmitting,
        isValid: state.isValid,
        isValidating: state.isValidating,
        status: (state as any).status,
        values: state.values,
        touched: state.touched,
        submitCount: 0,
        ...functions,
    };
};

export const useStateFormFormik = <T, >(form: StateForm<T, any>): FormikContextType<T> => {
    const [state] = useObjectValue<FormState<T>>(form, "");
    const functions = useFastMemo(createStateFormFormikFunctions, [form]);

    // `state` depends on `form`, and `functions`'s lifetime is equal to `form`, so we only need to depend on `state`.
    return useFastMemo(createStateFormFormikState, [state, form, functions], 1);
};

export const useFormikStateForm = <T, F extends StateForm<T, any> = StateForm<T, StateFormConfig<T>>>(props: StateFormProps<T, F>): FormikContextType<T> => {
    return useStateFormFormik(useStateForm(props));
}

interface FormikStateFormProviderType {
    <T, F extends StateForm<T> = StateForm<T>>(props: StateFormProviderProps<T, F>): JSX.Element;

    WithForm<T = any, F extends StateForm<T> = StateForm<T>>(props: StateFormProviderProps<T, F>): JSX.Element;
}

export const FormikStateFormProvider: FormikStateFormProviderType = function <T, F extends StateForm<T, any> = StateForm<T>>(props: StateFormProviderProps<T, F>) {
    const form = useStateObject<F, any>(props.form ?? (StateForm as StateObjectConstructor<F>), props);
    const formik = useStateFormFormik(form);

    return <StateFormContext.Provider value={form}>
        <FormikProvider value={formik}>
            {props.children}
        </FormikProvider>
    </StateFormContext.Provider>;
};

FormikStateFormProvider.WithForm = function <T = any, F extends StateForm<T, any> = StateForm<T, any>>(props: StateFormProviderProps<T, F>) {
    return <FormikStateFormProvider<T, F> {...props}>
        <Form>
            {props.children}
        </Form>
    </FormikStateFormProvider>;
};
