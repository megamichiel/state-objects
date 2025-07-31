// noinspection JSIgnoredPromiseFromCall

import {isEqual, set, toPath} from "lodash";
import {string} from "yup";
import {ObjectState, StateObject} from "./state-object";
import {createAllTouched, StateValueType} from "./util";

type StateFormErrorTracking = "optimal" | "blur" | "change" | "always";

export interface StateFormConfig<T> {
    initialValues: T;
    initialErrors?: any;
    initialTouched?: any;

    shouldValidateOnInput?: boolean;
    shouldValidateOnChange?: boolean;
    shouldValidateOnBlur?: boolean;
    validationSchema?: any;
    validate?: (values: T, form: FormState) => any;

    track?: {
        isDirty?: boolean;
        isValid?: boolean;
        errors?: StateFormErrorTracking;
    },

    onSubmit: (values: T, form: FormState) => any;
}

export interface FormState<T = any> extends ObjectState {
    shouldValidateOnInput: boolean;
    shouldValidateOnChange: boolean;
    shouldValidateOnBlur: boolean;

    values: T;
    errors: any;
    touched: any;

    isDirty: boolean;
    isValid: boolean;

    isSubmitting: boolean;
    isValidating: boolean;

    reset: () => void;
    validate: () => Promise<any>;
    submit: () => Promise<any>;
}

export class StateForm<T = any, C extends StateFormConfig<T> = StateFormConfig<T>> extends StateObject<C> implements FormState<T> {

    shouldValidateOnInput: boolean;
    shouldValidateOnChange: boolean;
    shouldValidateOnBlur: boolean;

    values: T;
    errors: any;
    touched: any;

    isDirty: boolean = false;
    isValid: boolean;

    isSubmitting: boolean = false;
    isValidating: boolean = false;

    constructor(context: C) {
        super(context);

        this.shouldValidateOnInput = context.shouldValidateOnInput ?? false;
        this.shouldValidateOnChange = context.shouldValidateOnChange ?? true;
        this.shouldValidateOnBlur = context.shouldValidateOnBlur ?? false;

        this.values = context.initialValues;
        this.errors = context.initialErrors ?? {};
        this.touched = context.initialTouched ?? {};

        this.isValid = isEqual(this.errors, {});

        console.log("Creating form", context.initialValues);
    }

    _onCreate(types: Record<string, StateValueType>) {
        super._onCreate(types);

        if (this.context.track?.isDirty ?? true) {
            // Listen for value changes to update `isDirty`.
            this.subscribe("values", (newValues) => {
                this.isDirty = !isEqual(newValues, this.context.initialValues);
            });
        }

        if (this.context.track?.isValid ?? true) {
            // Listen for error changes to update `isValid`.
            this.subscribe("errors", (newErrors) => {
                this.isValid = isEqual(newErrors, {});
            });
        }
    }

    reset() {
        this.patch([], {
            values: this.context.initialValues,
            errors: this.context.initialErrors ?? {},
            touched: this.context.initialTouched ?? {},
        });
    }

    async doValidate(values: any, form: FormState<T>): Promise<[values: any, errors: any]> {
        let errors = null;
        if (this.context.validationSchema) {
            try {
                values = await this.context.validationSchema.validate(values, {
                    // Need all the errors, not just the first.
                    abortEarly: false,
                });
            } catch (error: any) {
                if (error.inner) {
                    errors = {};
                    for (const {path, message} of error.inner) {
                        set(errors, toPath(path), message);
                    }
                } else {
                    console.error("Expected 'inner' in yup validation error, but got:", error);
                }
            }
        }

        if (!errors && this.context.validate) {
            errors = await this.context.validate(values, form);
        }

        return [values, errors];
    }

    async validate(): Promise<void> {
        this.isValidating = true;
        try {
            const errors = (await this.doValidate(this.values, this))[1] ?? {};
            if (typeof errors === 'object' && Object.keys(errors).length > 0) {
                this.errors = errors;
            }

            return errors;
        } finally {
            this.isValidating = false;
        }
    }

    async submit() {
        const formValues = this.values;
        // First touch everything
        this.touched = createAllTouched(formValues);

        this.isSubmitting = true;
        try {
            const [values, errors] = await this.doValidate(formValues, this);

            if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
                // TODO maybe check if there are errors that aren't being listened to so that those don't silently fail.
                this.errors = errors;
            } else {
                const result: any = await this.context.onSubmit(values, this);

                this.notify("submitted", result);

                return result;
            }
        } finally {
            this.isSubmitting = false;
        }
    }
}

/**
 * Binds an element to a form by adding change and blur listeners.
 *
 * If the element is not a button, this uses the `name` attribute of the element to determine the path of the field in the form.
 *
 * Currently supported elements:
 * - Most `input` types, including `checkbox`, `radio`, the `button` variants, and `image` (which is a submit button).
 *     Most other types behave the same as `type="text"` so those are supported.
 * - `button`s of type `submit` or `reset`.
 * - `select`s.
 * - `textarea`s.
 *
 * @param form The form to bind to.
 * @param element The element to bind.
 *
 * @return A function that removes the listeners when called.
 *
 * @throws Error If there is no `name` attribute on the given element, and the element is not a button.
 * @throws TypeError If the element has an unsupported type.
 */
export const bindElementToForm = (form: FormState, element: any): () => void => {
    let inputType: string = "";

    switch (element.tagName) {
        case "BUTTON":
            switch (element.type ?? "submit") {
                case "submit":
                case "reset":
                    inputType = element.type;
            }
            break;
        case "INPUT":
            switch (element.type) {
                case "button":
                    break;
                case "checkbox":
                    inputType = "checkbox";
                    break;
                case "image":
                case "submit":
                    inputType = "submit";
                    break;
                case "radio":
                case "reset":
                    inputType = element.type;
                    break;
                default:
                    inputType = "text";
                    break;
            }

            break;
        case "SELECT":
            inputType = "text"; // Also uses `value` to get and set values.
            break;
        case "TEXTAREA":
            inputType = "text";
            break;
    }

    // If this is a button, we don't need the `name` attribute, so return early.
    switch (inputType) {
        case "reset": {
            const clickListener = (e: any) => {
                e.preventDefault();
                form.reset();
            }

            element.addEventListener("click", clickListener);

            return () => {
                element.removeEventListener("click", clickListener);
            };
        }
        case "submit": {
            const clickListener = (e: any) => {
                e.preventDefault();
                // noinspection JSIgnoredPromiseFromCall
                form.submit();
            }

            element.addEventListener("click", clickListener);

            return () => {
                element.removeEventListener("click", clickListener);
            };
        }
    }

    const name = element.name;

    if (!name) throw new Error(`Missing 'name' attribute on form element ${element.tagName} with type ${element.type}`);

    const path = toPath(name);
    const valuePath = ["values", ...path];
    const touchedPath = ["touched", ...path];

    const blurListener = () => {
        if (form.shouldValidateOnBlur) {
            // TODO maybe allow passing a path to validate so that only this field is validated.
            form.validate();
        }
    };

    switch (inputType) {
        case "checkbox": {
            element.checked = !!form.get(valuePath);

            const changeListener = (event: any) => {
                const value = event.target.checked;
                form.set(valuePath, value);
                form.set(touchedPath, true);

                if (form.shouldValidateOnChange) {
                    form.validate();
                }
            };
            const sub = form.subscribe(valuePath, (newValue) => {
                if (newValue !== element.checked) {
                    element.checked = true;
                }
            });

            element.addEventListener("change", changeListener);
            element.addEventListener("blur", blurListener);

            return () => {
                element.removeEventListener("change", changeListener);
                element.removeEventListener("blur", blurListener);
                sub();
            };
        }
        case "radio": {
            element.checked = form.get(valuePath) === element.value;

            const changeListener = (event: any) => {
                if (event.target.checked) {
                    const value = event.target.value;
                    form.set(valuePath, value);
                    form.set(touchedPath, true);

                    if (form.shouldValidateOnChange) {
                        form.validate();
                    }
                }
            };
            const sub = form.subscribe(valuePath, (newValue) => {
                if (!element.checked && newValue === element.value) {
                    element.checked = true;
                }
            });

            element.addEventListener("change", changeListener);
            element.addEventListener("blur", blurListener);

            return () => {
                element.removeEventListener("change", changeListener);
                element.removeEventListener("blur", blurListener);
                sub();
            };
        }
        case "text":
            element.value = form.get(valuePath) ?? '';

            const inputListener = (event: any) => {
                form.set(valuePath, event.target.value);
                if (form.shouldValidateOnInput) {
                    form.validate();
                }
            };
            const changeListener = () => {
                form.set(touchedPath, true);
                if (form.shouldValidateOnChange) {
                    form.validate();
                }
            };
            const valueSubscription = form.subscribe(valuePath, (newValue) => {
                const oldValue = element.value;
                if (newValue !== oldValue) {
                    element.value = newValue;
                }
            });

            element.addEventListener("input", inputListener);
            element.addEventListener("change", changeListener);
            element.addEventListener("blur", blurListener);

            return () => {
                element.removeEventListener("input", inputListener);
                element.removeEventListener("change", changeListener);
                element.removeEventListener("blur", blurListener);
                valueSubscription();
            };
        default:
            throw new TypeError(`Unsupported form field element: ${element.tagName} with type ${element.type}`);
    }
}
