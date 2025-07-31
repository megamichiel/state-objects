import {FormState, StateForm, StateFormConfig} from "state-objects";

export interface ListFormValues {
    items: string[];
}

export interface ListFormState extends FormState<ListFormValues> {
    addItem(item: string): void;

    removeItem(item: string): void;
}

export interface ListStateFormConfig extends StateFormConfig<ListFormValues> {
    something: number;
}

export class ListStateForm extends StateForm<ListFormValues, ListStateFormConfig> implements ListFormState {

    addItem(item: string) {
        this.set(['values', 'items'], [...this.values.items, item]);
    }

    removeItem(item: string) {
        const items = this.values.items;
        const index = items.indexOf(item);
        if (index >= 0) {
            this.set(['values', 'items'], [
                ...items.slice(0, index),
                ...items.slice(index + 1),
            ]);
        }
    }
}
