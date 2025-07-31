import {createContext} from "react";
import {createStateObject, StateObject} from "state-objects";
import {StateValueType} from "state-objects/util";

export interface ModalState {
    isOpen: boolean;

    open(): void;

    close(): void;
}

// @ts-ignore
export const ModalContext = createContext<ModalState>(null);

export class ModalStateObject extends StateObject implements ModalState {

    isOpen: boolean = false;

    open() {
        this.isOpen = true;
        this.notify("opened");
    }

    close() {
        this.isOpen = false;
        this.notify("closed");
    }
}

export class CounterStateObject extends StateObject {

    value: number = 0;

    increment() {
        this.value++;
        this.notify("incremented", this.value);
    }
}

interface ItemListState {
    items: any[];

    add(item: any): void;

    remove(item: any): void;
}

export class ItemListStateObject extends StateObject implements ItemListState {

    items: any[] = [];

    add(item: any) {
        this.items = [...this.items, item];
    }

    remove(item: any) {
        const items = this.items;
        const index = items.indexOf(item);
        if (index >= 0) {
            this.items = [
                ...items.slice(0, index),
                ...items.slice(index + 1),
            ];
        }
    }
}

export class PageStateObject extends StateObject {

    // Create some child objects.
    modal = createStateObject(ModalStateObject);
    counter = createStateObject(CounterStateObject);
    items = createStateObject(ItemListStateObject);

    _onCreate(types: Record<string, StateValueType>) {
        super._onCreate(types);

        // Listen to the modal opening, and then increment the counter.
        this.modal.subscribe("isOpen", (isOpen: boolean, wasOpen: boolean) => {
            if (!wasOpen && isOpen) {
                this.counter.increment();
            }
        });

        // You can also subscribe to a child object's value from this parent object, works either way.
        this.subscribe("counter.value", (value: number, oldValue: number) => {
            if (value === oldValue + 1 && value % 10 === 0) {
                this.items.add({
                    name: `Congratulations! You reached a value of ${value}!`,
                });
            }
        });

        // You can even subscribe to the length of arrays.
        // This works because when a value is modified, all listeners at that path are checked for a modified value,
        //  so if there's a listener for 'length', the object checks if the length has changed and then notifies.
        this.items.subscribe("items.length", (newLength: number) => {
            console.log("Items length updated to", newLength);
        });

        // State objects can call .notify("opened") to trigger events. You can subscribe to these under the path "event".
        this.modal.subscribe("event.opened", () => {
            console.log("Modal just opened!");
        });

        // Events are scoped to their object; so you need to specify "event" within the object to subscribe to.
        this.subscribe("counter.event.incremented", (newValue: number) => {
            console.log(`Counter was incremented to ${newValue}!`);
        });
    }
}
