import {createStateObject, createStateObjectView} from "state-objects";
import {PageStateObject} from "../page-state";

test("Modal opening and closing", () => {
    // createStateObject() returns the internal state view, which is not a reactive state.
    // Properties are always up to date without needing a re-render, which is perfect for unit testing.

    const {modal} = createStateObject(PageStateObject);

    expect(modal.isOpen).toBe(false);
    modal.open();
    expect(modal.isOpen).toBe(true);
    modal.close();
    expect(modal.isOpen).toBe(false);
});

test("Counter increments", () => {
    const {counter} = createStateObject(PageStateObject);

    expect(counter.value).toBe(0);
    counter.increment();
    expect(counter.value).toBe(1);
});

test("Items are added and removed", () => {
    const {items} = createStateObject(PageStateObject);

    expect(items.items).toEqual([]);
    items.add("Sample")
    expect(items.items).toEqual(["Sample"]);
    items.add("Another sample");
    expect(items.items).toEqual(["Sample", "Another sample"]);
    items.remove("Sample");
    expect(items.items).toEqual(["Another sample"]);
});

test("Page state listeners work", () => {
    const page = createStateObject(PageStateObject);
    const {modal, counter, items} = page;
    const {view} = createStateObjectView<{
        isModalOpen: boolean;
        counter: number;
        items: any[];
    }>(page, {
        isModalOpen: "modal.isOpen",
        counter: "counter.value",
        items: "items.items",
    });

    // Verify the initial state
    expect(view).toEqual({
        isModalOpen: false,
        counter: 0,
        items: [],
    });

    // Calling open() will set isOpen = true, which triggers the listener that increments the counter.
    modal.open();
    expect(counter.value).toBe(1);

    modal.close()
    expect(counter.value).toBe(1);

    // Increment the counter until 9, so that we can isolate the 10th step.
    for (let i = 0; i < 8; i++) {
        counter.increment();
    }
    expect(counter.value).toBe(9);

    // If the counter's value reaches a value of 10, a listener adds a congratulations message to the items list.
    expect(items.items).toEqual([]);
    counter.increment();
    expect(items.items).toEqual([{
        name: 'Congratulations! You reached a value of 10!',
    }]);

    // Verify the final state
    expect(view).toEqual({
        isModalOpen: false,
        counter: 10,
        items: [{
            name: 'Congratulations! You reached a value of 10!',
        }],
    });
});
