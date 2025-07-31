import _ from "lodash";
import React, {ButtonHTMLAttributes, useContext, useMemo} from "react";
import {
    createAsyncHook,
    FormError,
    FormField,
    StateFormProvider,
    useFormState,
    useObjectState,
    useObjectValue
} from "react-state-objects";
import {delay, ReusableAbortController} from "state-objects";
import * as Yup from "yup";
import {ListFormState, ListFormValues, ListStateForm} from "./list-form";
import {ModalContext, PageStateObject} from "./page-state";

const INPUT_COUNT = 4;

const INITIAL_VALUES = {
    ...(_(_.times(INPUT_COUNT)).keyBy(i => `name${i}`).mapValues(() => '').value()),
    radio: 'value1',
    select: 'value2',
};

const VALIDATION_SCHEMA = Yup.object({
    ...(_(_.times(INPUT_COUNT)).keyBy(i => `name${i}`).mapValues(() => Yup.string().optional()).value()),
    radio: Yup.string().required(),
    select: Yup.string().required(),
});

const usePlusFive = createAsyncHook(async (x: number, abort?: ReusableAbortController) => {
    abort?.abort();
    await delay(1000, abort?.signal);
    return x + 5;
}, {
    defaultValue: 0,
    autoReloadOptions: {
        showLoadingState: false,
    },
});

export const SampleComponent = () => {
    // useObjectState() returns a reactive state.
    const page = useObjectState(PageStateObject);
    const {
        modal,
        counter: {value: counterValue, increment},
        items: {items, add: addItem, remove: removeItem},
    } = page;

    // TODO the goal is to eventually support this.
    // const [names] = useObjectValue(page, "items.items[*].name");
    // const [blah] = useObjectValue(page, "values.categories[*].id");

    const abortController = useMemo(() => new ReusableAbortController(), []);

    const {isLoading, value, error, reload} = usePlusFive(counterValue, abortController);

    // You can safely destruct functions in the state object; `this` is bound automatically.
    // In a regular object you'd have to do `modal.open()` because just `open()` doesn't set `this = modal`,
    //  but state objects have a layer that ensures `this` is set to the internal state object.
    const {isOpen: isModalOpen, open: openModal} = modal;

    return (
        <>
            <p>This is some text</p>

            <div>
                {isLoading ? <p>Loading...</p> : error ? <p>Error: {error}</p> : <p>Value: {value}</p>}
                <button type="button" onClick={() => reload(false)}>Reload</button>
            </div>

            <div>
                <button type="button" onClick={increment}>You clicked this button {counterValue} times</button>
            </div>

            <div>
                There are currently {items.length} item(s).

                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                }}>
                    {_.map(items, (item, index) => <div key={index} title="Click to remove"
                                                        onClick={() => removeItem(item)}>
                        Item #{index}: {item.name}
                    </div>)}
                </div>

                <div>
                    <button type="button" onClick={() => addItem({
                        name: _.random(-100000, 100000),
                    })}>Add an item
                    </button>
                </div>
            </div>

            <div>
                <StateFormProvider.WithForm<ListFormValues, ListStateForm>
                    form={ListStateForm}
                    initialValues={{
                        items: [],
                    }}
                    onSubmit={({items}) => {
                        console.log("Items are", items);
                    }}>
                    <ItemListForm/>
                </StateFormProvider.WithForm>
            </div>

            <div>
                <button type="button" onClick={openModal}>Open modal</button>
            </div>

            {isModalOpen && (
                <ModalContext.Provider value={modal}>
                    <div style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'black',
                        overflowY: 'auto'
                    }}>
                        <h3>This is a modal header</h3>
                        <div>
                            <div>
                                There is some text in this modal
                            </div>

                            <div>
                                <StateFormProvider.WithForm
                                    initialValues={INITIAL_VALUES}
                                    validationSchema={VALIDATION_SCHEMA}
                                    onSubmit={async (values) => {
                                        console.log("Submitted", _.pickBy(values));

                                        // Artificial delay of a second to test submit button disabling.
                                        await new Promise<void>((resolve) => {
                                            window.setTimeout(resolve, 1000);
                                        });
                                    }}>
                                    This is a form.

                                    <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                    }}>
                                        {_.map(_.times(INPUT_COUNT), (index) =>
                                            <div key={index} style={{
                                                flexGrow: '1',
                                            }}>
                                                <label>
                                                    Name {index}:&nbsp;

                                                    <FormField>
                                                        {(props) => <input {...props} name={`name${index}`}/>}
                                                    </FormField>
                                                </label>

                                                <FormErrorMessage name={`name${index}`}/>
                                            </div>)}
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                    }}>
                                        {_.map(_.times(INPUT_COUNT), (index) =>
                                            <div key={index} style={{
                                                flexGrow: '1',
                                            }}>
                                                <label>
                                                    Value {index}:&nbsp;
                                                    <FormField>
                                                        {(props) =>
                                                            <input {...props} name="radio" type="radio"
                                                                   value={`value${index}`}/>}
                                                    </FormField>
                                                </label>
                                            </div>)}
                                    </div>

                                    <div>
                                        <label>
                                            Select:&nbsp;
                                            <FormField>
                                                {(props) => <select {...props} name="select">
                                                    {_.map(_.times(INPUT_COUNT), (index) =>
                                                        <option key={index}
                                                                value={`value${index}`}>Value {index}</option>
                                                    )}
                                                </select>}
                                            </FormField>
                                        </label>
                                    </div>

                                    <FormField>
                                        {(props) => <button {...props} type="reset">Reset</button>}
                                    </FormField>
                                    <SubmitButton/>
                                </StateFormProvider.WithForm>
                            </div>
                        </div>
                        <div>
                            <ModalCloseButton title="Click to close the modal">Close modal</ModalCloseButton>
                        </div>
                    </div>
                </ModalContext.Provider>
            )}
        </>
    );
};

const ItemListForm = () => {
    const {values: {items}, addItem, removeItem} = useFormState<ListFormValues, ListFormState>();

    return <>
        There are currently {items.length} item(s).

        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
        }}>
            {_.map(items, (item, index) =>
                <div key={index} title="Click to remove">
                    <span onClick={() => removeItem(item)}>
                        Item #{index}:
                    </span>
                    <FormField>
                        {props => <input {...props} name={`items[${index}]`}/>}
                    </FormField>
                </div>)}
        </div>

        <div>
            <button type="button" onClick={() => addItem(_.random(-100000, 100000).toString())}>
                Add an item
            </button>
        </div>
    </>;
};

const ModalCloseButton = (props: ButtonHTMLAttributes<any>) => {
    const {close} = useContext(ModalContext);

    return <button type="button" {...props} onClick={close}/>;
}

const SubmitButton = () => {
    const {isDirty, isSubmitting} = useFormState();

    return <button disabled={!isDirty || isSubmitting}>Submit</button>;
}

const FormErrorMessage = ({name}: { name: any }) => {
    return <FormError name={name} children={FormErrorComponent}/>;
}

const FormErrorComponent = ({error}: { error: string }) => {
    return <div style={{
        color: 'red'
    }}>{error}</div>
}
